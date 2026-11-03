const ALLOWED_ORIGINS = new Set([
  "https://maarccorresa.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://maarccorresa.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}

async function trueCnam(number, env) {
  if (!env.TRUECNAM_USERNAME || !env.TRUECNAM_PASSWORD) {
    return { status: "not_configured", source: "TrueCNAM" };
  }
  const url = new URL("https://api.truecnam.net/api/v1");
  url.search = new URLSearchParams({
    username: env.TRUECNAM_USERNAME,
    password: env.TRUECNAM_PASSWORD,
    resp_type: "extended",
    resp_format: "json",
    calling_number: number,
    call_party: "terminating"
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error("TrueCNAM HTTP " + response.status);
  const data = await response.json();
  if (data.err && String(data.err) !== "0") {
    return { status: "error", source: "TrueCNAM", message: data.error_msg || "La consulta no s'ha pogut completar." };
  }
  return {
    status: "ok",
    source: "TrueCNAM",
    matched: Boolean(data.cnam_match),
    name: data.extended_name || data.name || null,
    spamScore: data.spam_score_match ? Number(data.spam_score) : null,
    trueClid: data.true_clid || null
  };
}

async function callControl(number, env) {
  if (!env.CALLCONTROL_API_KEY) {
    return { status: "not_configured", source: "Call Control" };
  }
  const digits = number.replace(/\D/g, "");
  const url = "https://api.callcontrol.com/api/2015-11-01/Reputation/" +
    encodeURIComponent(digits) + "?api_key=" + encodeURIComponent(env.CALLCONTROL_API_KEY);
  const response = await fetch(url);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    return { status: "error", source: "Call Control", message: "HTTP " + response.status };
  }
  return {
    status: "ok",
    source: "Call Control",
    spam: typeof data.IsSpam === "boolean" ? data.IsSpam : null,
    confidence: data.Confidence ?? null,
    callType: data.CallType || null,
    reportedName: data.ReportedCallerName || null,
    lastReport: data.LastComplaintDate || null,
    tags: Array.isArray(data.Tags) ? data.Tags.slice(0, 8) : []
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/phone") {
      return json({ error: "Not found" }, 404, origin);
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin not allowed" }, 403, origin);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, origin); }
    const phone = String(body.phone || "");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return json({ error: "Phone must be in E.164 format" }, 400, origin);
    }
    const results = await Promise.allSettled([
      trueCnam(phone, env),
      callControl(phone, env)
    ]);
    const names = ["truecnam", "callcontrol"];
    const output = {};
    results.forEach((result, index) => {
      output[names[index]] = result.status === "fulfilled"
        ? result.value
        : { status: "error", message: result.reason?.message || "Provider unavailable" };
    });
    return json(output, 200, origin);
  }
};
