const HOST = "breachdirectory.p.rapidapi.com";
const corsHeaders = origin => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (/password|passwd|hash|credential|secret|token/i.test(key)) continue;
      out[key] = clean(val);
    }
    return out;
  }
  return value;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
    const permitted = allowed.includes(origin);
    const cors = corsHeaders(permitted ? origin : "null");
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: cors});
    if (request.method !== "POST") return Response.json({error:"Mètode no permès."},{status:405,headers:cors});
    if (!permitted) return Response.json({error:"Origen no autoritzat."},{status:403,headers:cors});
    if (!env.RAPIDAPI_KEY) return Response.json({error:"Falta configurar el secret RAPIDAPI_KEY al Worker."},{status:500,headers:cors});
    let payload;
    try { payload = await request.json(); } catch { return Response.json({error:"Cos JSON invàlid."},{status:400,headers:cors}); }
    const term = typeof payload.term === "string" ? payload.term.trim() : "";
    if (!term || term.length > 254 || /[\u0000-\u001f]/.test(term)) return Response.json({error:"Identificador buit o no vàlid."},{status:400,headers:cors});
    // No acceptem cerques de contrasenyes/hash; només identificadors.
    if (/^\$2[aby]\$|^[a-f0-9]{32,}$/i.test(term)) return Response.json({error:"No s'admeten cerques de contrasenyes ni hashes."},{status:400,headers:cors});
    const url = "https://" + HOST + "/?func=auto&term=" + encodeURIComponent(term);
    try {
      const upstream = await fetch(url,{headers:{"X-RapidAPI-Key":env.RAPIDAPI_KEY,"X-RapidAPI-Host":HOST}});
      const raw = await upstream.text();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = {message:raw.slice(0,1000)}; }
      if (!upstream.ok) return Response.json({error:"BreachDirectory ha respost amb HTTP "+upstream.status,details:clean(parsed)},{status:502,headers:cors});
      const result = clean(parsed);
      const found = result && (result.found === true || result.success === true || (Array.isArray(result.results) && result.results.length > 0) || (Array.isArray(result.data) && result.data.length > 0));
      return Response.json({provider:"BreachDirectory",found:!!found,result},{headers:{...cors,"Cache-Control":"no-store"}});
    } catch {
      return Response.json({error:"No s'ha pogut connectar amb BreachDirectory."},{status:502,headers:cors});
    }
  }
};