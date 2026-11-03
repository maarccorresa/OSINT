// OSINT Workspace — fonts públiques, sense API keys.
const $ = (s) => document.querySelector(s);
const form = $("#search-form"), input = $("#term"), button = $("#search-btn");
const panel = $("#results"), body = $("#result-body"), state = $("#result-state");
const HISTORY_KEY = "osint-search-history-v2";
let history = [];
try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { history = []; }

const SOURCES = {
  email: "XposedOrNot",
  phone: "libphonenumber-js",
  ip: "RIPEstat + RDAP",
  domain: "Cloudflare DNS + RDAP",
  username: "GitHub"
};

function renderHistory() {
  const el = $("#history");
  if (!history.length) { el.className = "history-empty"; el.textContent = "Encara no has fet cap consulta."; return; }
  el.className = ""; el.replaceChildren();
  history.slice(0, 12).forEach(item => {
    const row = document.createElement("div"); row.className = "history-item";
    const term = document.createElement("span"); term.textContent = item.term;
    const date = document.createElement("small"); date.textContent = new Date(item.date).toLocaleString("ca-ES");
    row.append(term, date); el.append(row);
  });
}
function showError(message) {
  panel.classList.remove("hidden"); state.textContent = "ERROR"; body.replaceChildren();
  const p = document.createElement("p"); p.className = "error"; p.textContent = message; body.append(p);
}
function card(title, source, data, description = "") {
  const wrap = document.createElement("article"); wrap.className = "result-card";
  const h = document.createElement("h3"); h.textContent = title;
  const meta = document.createElement("p"); meta.textContent = "Font: " + source + (description ? " · " + description : "");
  const pre = document.createElement("pre"); pre.className = "result-data";
  pre.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  wrap.append(h, meta, pre); body.append(wrap);
}
function isIPv4(value) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}
function isIPv6(value) {
  if (!value.includes(":")) return false;
  try { return new URL("http://[" + value + "]/").hostname.length > 2; } catch { return false; }
}
function normalizeDomain(value) {
  try {
    const url = new URL(value.includes("://") ? value : "https://" + value);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch { return ""; }
}
function classify(value) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  if (isIPv4(value) || isIPv6(value)) return "ip";
  if (/^\+?[0-9().\s-]{7,25}$/.test(value) && /\d/.test(value)) return "phone";
  const domain = normalizeDomain(value);
  if (domain && domain.includes(".") && !domain.includes(" ")) return "domain";
  return "username";
}
async function getJSON(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Accept": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error("La font ha respost HTTP " + response.status);
    error.status = response.status; error.data = data; throw error;
  }
  return data;
}
async function lookupEmail(email) {
  const url = "https://api.xposedornot.com/v1/check-email/" + encodeURIComponent(email);
  const data = await getJSON(url);
  const breaches = Array.isArray(data.breaches) ? data.breaches.flat() : [];
  card(breaches.length ? "Correu trobat en filtracions" : "No consta en les filtracions consultades", SOURCES.email, data,
    breaches.length + " filtració(ns) retornada(es)");
}
async function lookupPhone(phone) {
  const lib = window.libphonenumber;
  if (!lib || !lib.parsePhoneNumberFromString) {
    throw new Error("No s'ha pogut carregar la biblioteca de validació telefònica. Comprova la connexió i torna-ho a provar.");
  }
  const parsed = lib.parsePhoneNumberFromString(phone);
  if (!parsed) { card("Número no reconegut", SOURCES.phone, { input: phone, valid: false }); return; }
  const info = {
    input: phone,
    international: parsed.formatInternational(),
    national: parsed.formatNational(),
    country: parsed.country || "No identificat",
    countryCallingCode: "+" + parsed.countryCallingCode,
    numberType: parsed.getType() || "No determinat",
    valid: parsed.isValid(),
    possible: parsed.isPossible()
  };
  card(info.valid ? "Número amb format vàlid" : "Número no vàlid o incomplet", SOURCES.phone, info,
    "Validació de format; no identifica el titular ni garanteix l'operadora");
}
async function lookupIP(ip) {
  const tasks = [
    ["RIPEstat — informació de registre", "RIPEstat", "https://stat.ripe.net/data/whois/data.json?resource=" + encodeURIComponent(ip)],
    ["RIPEstat — informació de routing", "RIPEstat", "https://stat.ripe.net/data/network-info/data.json?resource=" + encodeURIComponent(ip)],
    ["RDAP — registre de xarxa", "RDAP", "https://rdap.org/ip/" + encodeURIComponent(ip)]
  ];
  const results = await Promise.allSettled(tasks.map(t => getJSON(t[2])));
  let count = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { card(tasks[i][0], tasks[i][1], r.value); count++; }
    else card(tasks[i][0] + " — no disponible", tasks[i][1], { error: r.reason.message });
  });
  if (!count) throw new Error("Cap de les fonts d'IP ha respost. Pot ser una incidència temporal o un bloqueig CORS.");
}
async function lookupDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!domain || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))
    throw new Error("El domini no té un format vàlid.");
  const types = ["A", "AAAA", "MX", "NS", "TXT"];
  const dns = await Promise.allSettled(types.map(type =>
    getJSON("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(domain) + "&type=" + type,
      { headers: { "Accept": "application/dns-json" } })
  ));
  dns.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const answers = (r.value.Answer || []).map(a => ({ name: a.name, type: a.type, ttl: a.TTL, data: a.data }));
      card("DNS " + types[i], "Cloudflare DNS", { status: r.value.Status, answers });
    } else card("DNS " + types[i] + " — no disponible", "Cloudflare DNS", { error: r.reason.message });
  });
  try {
    const rdap = await getJSON("https://rdap.org/domain/" + encodeURIComponent(domain));
    card("Registre del domini (RDAP)", "RDAP", rdap);
  } catch (error) { card("Registre RDAP — no disponible", "RDAP", { error: error.message }); }
}
async function lookupUsername(username) {
  const clean = username.replace(/^@/, "");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) throw new Error("Introdueix un username vàlid per a GitHub (sense espais).");
  const data = await getJSON("https://api.github.com/users/" + encodeURIComponent(clean));
  const summary = {
    login: data.login, name: data.name, bio: data.bio, company: data.company,
    location: data.location, blog: data.blog, public_repos: data.public_repos,
    followers: data.followers, following: data.following, created_at: data.created_at,
    profile: data.html_url
  };
  card("Perfil públic de GitHub", "GitHub REST API", summary, "Només comprova aquest username a GitHub");
}
async function investigate(term) {
  const type = classify(term);
  state.textContent = "CONSULTANT"; body.replaceChildren();
  const intro = document.createElement("p"); intro.textContent = "Tipus detectat: " + type.toUpperCase() + " · Fonts públiques"; body.append(intro);
  if (type === "email") await lookupEmail(term);
  else if (type === "phone") await lookupPhone(term);
  else if (type === "ip") await lookupIP(term);
  else if (type === "domain") await lookupDomain(term);
  else await lookupUsername(term);
  state.textContent = "CONSULTA COMPLETADA";
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const term = input.value.trim(); if (!term) return;
  button.disabled = true; button.textContent = "Consultant…";
  panel.classList.remove("hidden"); state.textContent = "CONSULTANT"; body.replaceChildren();
  try {
    await investigate(term);
    history.unshift({ term, date: new Date().toISOString() });
    history = history.slice(0, 30); localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); renderHistory();
  } catch (error) {
    showError(error.status === 404 ? "No s'han trobat dades per a aquest identificador." :
      error.status === 429 ? "Has arribat al límit de consultes de la font. Espera una estona i torna-ho a provar." :
      error.message || "No s'ha pogut completar la consulta.");
  } finally {
    button.disabled = false; button.innerHTML = "<span>⌕</span> Investigar";
  }
});
$("#clear-history").addEventListener("click", () => {
  history = []; localStorage.removeItem(HISTORY_KEY); renderHistory();
});
renderHistory();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
