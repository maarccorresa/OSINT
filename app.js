// OSINT Workspace — resultats resumits i fonts públiques.
const $ = (s) => document.querySelector(s);
const form = $("#search-form"), input = $("#term"), button = $("#search-btn");
const panel = $("#results"), body = $("#result-body"), state = $("#result-state");
const modeButtons = [...document.querySelectorAll(".mode-btn")];

const MODE_CONFIG = {
  email: { label: "Adreça de correu", placeholder: "nom@domini.cat", title: "Cerca de correu" },
  phone: { label: "Número de telèfon", placeholder: "+34600000000", title: "Cerca de telèfon" },
  ip: { label: "Adreça IP", placeholder: "1.1.1.1", title: "Cerca d'adreça IP" },
  domain: { label: "Domini", placeholder: "exemple.cat", title: "Cerca de domini" },
  subdomains: { label: "Domini principal", placeholder: "exemple.cat", title: "Cerca de subdominis" },
  username: { label: "Nom d'usuari de GitHub", placeholder: "octocat", title: "Cerca de username" }
};
const SOURCES = {
  email: "XposedOrNot", phone: "libphonenumber-js",
  ip: "Shodan InternetDB i RDAP", domain: "Cloudflare DNS i RDAP",
  subdomains: "crt.name (via proxy CORS)", username: "GitHub"
};
let selectedMode = "email";

function setMode(mode) {
  if (!MODE_CONFIG[mode]) return;
  selectedMode = mode;
  modeButtons.forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  $("#term-label").textContent = MODE_CONFIG[mode].label;
  input.placeholder = MODE_CONFIG[mode].placeholder;
  input.value = "";
  input.focus();
}
modeButtons.forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));

const HISTORY_KEY = "osint-search-history-v3";
let history = [];
try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { history = []; }

function renderHistory() {
  const el = $("#history");
  if (!history.length) {
    el.className = "history-empty";
    el.textContent = "Encara no has fet cap consulta.";
    return;
  }
  el.className = "";
  el.replaceChildren();
  history.slice(0, 12).forEach(item => {
    const row = document.createElement("div"); row.className = "history-item";
    const term = document.createElement("span");
    term.textContent = (MODE_CONFIG[item.mode]?.label || "Consulta") + " · " + item.term;
    const date = document.createElement("small");
    date.textContent = new Date(item.date).toLocaleString("ca-ES");
    row.append(term, date); el.append(row);
  });
}

function setState(label, kind = "") {
  state.textContent = label;
  state.className = "tag" + (kind ? " tag-" + kind : "");
}
function showError(message) {
  panel.classList.remove("hidden");
  setState("NO S'HA POGUT COMPLETAR", "error");
  body.replaceChildren();
  const p = document.createElement("p"); p.className = "error"; p.textContent = message;
  body.append(p);
}
function addIntro(text) {
  const p = document.createElement("p"); p.className = "results-intro"; p.textContent = text; body.append(p);
}
function addNotice(text, type = "info") {
  const p = document.createElement("p"); p.className = "result-notice " + type; p.textContent = text; body.append(p);
}
function card(title, source, fields, description = "") {
  const wrap = document.createElement("article"); wrap.className = "result-card";
  const head = document.createElement("div"); head.className = "result-card-head";
  const h = document.createElement("h3"); h.textContent = title;
  const badge = document.createElement("span"); badge.className = "source-label"; badge.textContent = source;
  head.append(h, badge);
  wrap.append(head);
  if (description) {
    const desc = document.createElement("p"); desc.className = "result-description"; desc.textContent = description;
    wrap.append(desc);
  }
  const grid = document.createElement("div"); grid.className = "result-fields";
  for (const [label, raw] of Object.entries(fields || {})) {
    if (raw === null || raw === undefined || raw === "") continue;
    const field = document.createElement("div"); field.className = "result-field";
    const name = document.createElement("span"); name.className = "result-label"; name.textContent = label;
    const value = document.createElement("div"); value.className = "result-value";
    if (Array.isArray(raw)) {
      if (!raw.length) value.textContent = "Cap dada disponible";
      else {
        const list = document.createElement("ul"); list.className = "result-list";
        raw.slice(0, 100).forEach(entry => {
          const li = document.createElement("li"); li.textContent = typeof entry === "string" ? entry : JSON.stringify(entry);
          list.append(li);
        });
        value.append(list);
      }
    } else if (typeof raw === "object") {
      value.textContent = "Informació addicional disponible";
    } else if (typeof raw === "string" && /^https?:\/\//i.test(raw)) {
      const link = document.createElement("a"); link.href = raw; link.target = "_blank";
      link.rel = "noopener noreferrer"; link.textContent = "Obrir font"; value.append(link);
    } else {
      value.textContent = typeof raw === "boolean" ? (raw ? "Sí" : "No") :
        typeof raw === "number" ? raw.toLocaleString("ca-ES") : String(raw);
    }
    field.append(name, value); grid.append(field);
  }
  if (grid.childNodes.length) wrap.append(grid);
  body.append(wrap);
}
function formatDate(value) {
  if (!value) return "No disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("ca-ES");
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
function validDomain(domain) {
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}
async function getJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 300) }; }
  if (!response.ok) {
    const error = new Error("La font ha retornat un error (" + response.status + ").");
    error.status = response.status; error.data = data; throw error;
  }
  return data;
}

async function lookupEmail(email) {
  const data = await getJSON("https://api.xposedornot.com/v1/check-email/" + encodeURIComponent(email));
  const rawBreaches = Array.isArray(data.breaches) ? data.breaches.flat(Infinity) : [];
  const breaches = [...new Set(rawBreaches.map(x => typeof x === "string" ? x : x?.name).filter(Boolean))];
  const found = breaches.length > 0;
  card(found ? "S'han trobat filtracions" : "No consten filtracions", SOURCES.email, {
    "Correu consultat": email,
    "Filtracions detectades": breaches.length,
    "Serveis afectats": breaches.length ? breaches : "No n'hi ha cap de retornat"
  }, found
    ? "Aquest correu apareix en conjunts de dades exposats. Canvia les contrasenyes reutilitzades i activa la verificació en dos passos."
    : "La font consultada no ha retornat cap filtració per aquest correu. Això no garanteix que mai s'hagi exposat.");
}

async function lookupPhone(phone) {
  const lib = window.libphonenumber;
  if (!lib?.parsePhoneNumberFromString) {
    throw new Error("No s'ha pogut carregar el comprovador de telèfons. Revisa la connexió i torna-ho a provar.");
  }
  const parsed = lib.parsePhoneNumberFromString(phone);
  if (!parsed) {
    card("Número no reconegut", SOURCES.phone, { "Número consultat": phone, "Resultat": "No s'ha pogut interpretar" });
    return;
  }
  const typeNames = {
    MOBILE: "Mòbil", FIXED_LINE: "Telèfon fix", FIXED_LINE_OR_MOBILE: "Fix o mòbil",
    TOLL_FREE: "Gratuït", PREMIUM_RATE: "Tarificació especial", VOIP: "Telefonia per internet",
    PERSONAL_NUMBER: "Número personal", PAGER: "Busca-persones", UAN: "Número corporatiu",
    VOICEMAIL: "Bústia de veu"
  };
  const valid = parsed.isValid();
  card(valid ? "Número amb format vàlid" : "Número no vàlid o incomplet", SOURCES.phone, {
    "Número internacional": parsed.formatInternational(),
    "Número nacional": parsed.formatNational(),
    "País": parsed.country || "No identificat",
    "Prefix": "+" + parsed.countryCallingCode,
    "Tipus de línia": typeNames[parsed.getType()] || "No determinat",
    "Format vàlid": valid ? "Sí" : "No",
    "Format possible": parsed.isPossible() ? "Sí" : "No"
  }, "Això només comprova el format i el pla de numeració. No permet saber qui és el titular ni si la línia està activa.");
}

async function lookupIP(ip) {
  const [shodanResult, rdapResult] = await Promise.allSettled([
    getJSON("https://internetdb.shodan.io/" + encodeURIComponent(ip)),
    getJSON("https://rdap.org/ip/" + encodeURIComponent(ip))
  ]);
  if (shodanResult.status === "fulfilled") {
    const d = shodanResult.value;
    const ports = Array.isArray(d.ports) ? d.ports : [];
    const hosts = Array.isArray(d.hostnames) ? d.hostnames : [];
    const vulns = Array.isArray(d.vulns) ? d.vulns : [];
    card("Exposició a Internet", "Shodan", {
      "Ports detectats": ports.length ? ports.join(", ") : "Cap port registrat",
      "Serveis identificats": Array.isArray(d.tags) && d.tags.length ? d.tags : "No especificats",
      "Noms associats": hosts.length ? hosts : "Cap nom registrat",
      "Vulnerabilitats conegudes": vulns.length ? vulns : "Cap vulnerabilitat registrada",
      "Fitxa de Shodan": "https://www.shodan.io/host/" + encodeURIComponent(ip)
    }, "Dades de l'índex de Shodan, no un escaneig en directe. Que no hi apareguin vulnerabilitats no vol dir que l'equip sigui segur.");
  } else {
    card("Exposició a Internet", "Shodan", {
      "Resultat": "No s'han pogut consultar les dades",
      "Fitxa": "https://www.shodan.io/host/" + encodeURIComponent(ip)
    });
  }
  if (rdapResult.status === "fulfilled") {
    const d = rdapResult.value;
    const events = Array.isArray(d.events) ? d.events : [];
    const event = action => events.find(x => x.eventAction === action)?.eventDate;
    const network = d.startAddress && d.endAddress ? d.startAddress + " – " + d.endAddress : "No disponible";
    card("A qui està assignada aquesta IP?", "Registre RDAP", {
      "Xarxa": network,
      "Organització o registre": d.name || d.handle || "No identificat",
      "País": d.country || "No identificat",
      "Tipus de registre": d.type || "No especificat",
      "Última actualització": formatDate(event("last changed"))
    }, "El registre identifica l'organització que gestiona el rang d'IP, no necessàriament la persona o el dispositiu que l'utilitza.");
  } else {
    card("Registre de l'adreça", "RDAP", { "Resultat": "No s'ha pogut obtenir informació del registre." });
  }
}

function extractSubdomainRecords(data, raw) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const candidates = [data.subdomains, data.results, data.names, data.records, data.data,
      data.data?.subdomains, data.data?.results];
    const found = candidates.find(Array.isArray);
    if (found) return found;
  }
  return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
function normalizeSubdomain(item) {
  if (typeof item === "string") return { name: item.trim(), date: null };
  if (!item || typeof item !== "object") return null;
  return {
    name: String(item.subdomain || item.hostname || item.name || item.domain || item.fqdn || "").trim(),
    date: item.first_seen || item.firstSeen || item.first_seen_at || item.date || item.firstSeenAt || null
  };
}
async function lookupSubdomains(apex) {
  // crt.name no envia cap capçalera CORS. El proxy públic només transporta aquesta consulta GET.
  const upstream = "https://crt.name/v1/search?apex=" + encodeURIComponent(apex) + "&format=json&dates=1";
  const proxyUrl = "https://proxy.cors.dev/" + upstream;
  let response;
  try {
    response = await fetch(proxyUrl, { headers: { Accept: "application/json, text/plain" } });
  } catch {
    throw new Error("El servei intermediari de consulta no està disponible ara mateix. Torna-ho a provar més tard.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("S'ha arribat al límit de consultes de subdominis. Torna-ho a provar més tard.");
    throw new Error("No s'ha pogut consultar l'índex de subdominis (error " + response.status + ").");
  }
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = null; }
  const names = extractSubdomainRecords(data, raw).map(normalizeSubdomain).filter(Boolean)
    .map(item => ({ ...item, name: item.name.replace(/^\*\./, "") }))
    .filter(item => item.name && (item.name.toLowerCase() === apex ||
      item.name.toLowerCase().endsWith("." + apex)));
  const unique = [...new Map(names.map(item => [item.name.toLowerCase(), item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const dated = unique.filter(x => x.date).length;
  card("Subdominis trobats", "crt.name", {
    "Domini analitzat": apex,
    "Subdominis trobats": unique.length,
    "Noms descoberts": unique.length ? unique.map(x => x.name) : "No s'han trobat noms"
  }, "Són noms presents a l'índex de transparència de certificats. Alguns poden ser antics i ja no estar actius.");
  if (!unique.length) addNotice("No s'han trobat subdominis a l'índex. Això no significa que el domini no en tingui.", "info");
  return { count: unique.length, dated };
}

function summarizeRdapDomain(d) {
  const events = Array.isArray(d.events) ? d.events : [];
  const event = action => events.find(x => x.eventAction === action)?.eventDate;
  const nameservers = Array.isArray(d.nameservers) ? d.nameservers.map(x => x.ldhName || x.unicodeName).filter(Boolean) : [];
  const statuses = Array.isArray(d.status) ? d.status : [];
  const registrarEntity = (d.entities || []).find(x => (x.roles || []).includes("registrar"));
  const registrar = registrarEntity?.vcardArray?.[1]?.find(x => x[0] === "fn")?.[3] || registrarEntity?.handle;
  return {
    "Registrador": registrar || "No identificat",
    "Creat": formatDate(event("registration")),
    "Última actualització": formatDate(event("last changed")),
    "Caducitat": formatDate(event("expiration")),
    "Estat del domini": statuses.length ? statuses.map(x => x.replace(/-/g, " ")).join(", ") : "No disponible",
    "Servidors DNS": nameservers.length ? nameservers : "No disponibles",
    "DNSSEC": d.secureDNS?.delegationSigned === true ? "Activat" :
      d.secureDNS?.delegationSigned === false ? "Desactivat" : "No consta"
  };
}
async function lookupDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!validDomain(domain)) throw new Error("Introdueix un domini vàlid, per exemple exemple.cat.");
  const types = ["A", "AAAA", "MX", "NS", "TXT"];
  const dnsResults = await Promise.allSettled(types.map(type =>
    getJSON("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(domain) + "&type=" + type,
      { headers: { Accept: "application/dns-json" } })
  ));
  const dnsSummary = {};
  dnsResults.forEach((result, i) => {
    const type = types[i];
    if (result.status !== "fulfilled") { dnsSummary[type] = "No s'ha pogut consultar"; return; }
    const answers = (result.value.Answer || []).map(x => x.data).filter(Boolean);
    dnsSummary[type] = answers.length ? answers.slice(0, 10) : "Cap registre trobat";
  });
  const hasDns = Object.values(dnsSummary).some(v => Array.isArray(v));
  card("Configuració DNS", "Cloudflare DNS", {
    "Adreces IPv4 (A)": dnsSummary.A,
    "Adreces IPv6 (AAAA)": dnsSummary.AAAA,
    "Servidors de correu (MX)": dnsSummary.MX,
    "Servidors DNS (NS)": dnsSummary.NS,
    "Altres registres (TXT)": dnsSummary.TXT
  }, hasDns ? "Registres publicats actualment al DNS." : "No s'han pogut obtenir registres DNS.");
  try {
    const d = await getJSON("https://rdap.org/domain/" + encodeURIComponent(domain));
    card("Informació del registre", "RDAP", summarizeRdapDomain(d),
      "Dades públiques del registre del domini. La informació del titular pot estar protegida.");
  } catch {
    card("Informació del registre", "RDAP", { "Resultat": "El registre del domini no ha respost." });
  }
  try { await lookupSubdomains(domain); }
  catch (error) {
    card("Subdominis", "crt.name", { "Resultat": "No s'ha pogut completar aquesta part de la consulta." }, error.message);
  }
}

async function lookupUsername(username) {
  const clean = username.replace(/^@/, "");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) throw new Error("Introdueix un username de GitHub vàlid, sense espais.");
  const d = await getJSON("https://api.github.com/users/" + encodeURIComponent(clean));
  card("Perfil públic trobat", "GitHub", {
    "Nom d'usuari": d.login,
    "Nom": d.name || "No indicat",
    "Descripció": d.bio || "Sense descripció",
    "Organització": d.company || "No indicada",
    "Ubicació": d.location || "No indicada",
    "Web": d.blog || "No indicada",
    "Repositoris públics": d.public_repos,
    "Seguidors": d.followers,
    "Seguint": d.following,
    "Compte creat": formatDate(d.created_at),
    "Perfil": d.html_url
  }, "Només s'ha comprovat GitHub. No s'ha cercat aquest nom a altres xarxes.");
}

async function investigate(term) {
  const mode = selectedMode;
  body.replaceChildren();
  addIntro(MODE_CONFIG[mode].title + " · " + SOURCES[mode]);
  if (mode === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term)) throw new Error("Introdueix una adreça de correu vàlida.");
    await lookupEmail(term);
  } else if (mode === "phone") await lookupPhone(term);
  else if (mode === "ip") {
    if (!isIPv4(term) && !isIPv6(term)) throw new Error("Introdueix una adreça IPv4 o IPv6 vàlida.");
    await lookupIP(term);
  } else if (mode === "domain" || mode === "subdomains") {
    const domain = normalizeDomain(term);
    if (!validDomain(domain)) throw new Error("Introdueix un domini principal vàlid, per exemple exemple.cat.");
    if (mode === "domain") await lookupDomain(domain);
    else await lookupSubdomains(domain);
  } else await lookupUsername(term);
  setState("CONSULTA COMPLETADA", "success");
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const term = input.value.trim();
  if (!term) return;
  button.disabled = true;
  button.textContent = "Consultant…";
  panel.classList.remove("hidden");
  setState("CONSULTANT");
  body.replaceChildren();
  try {
    await investigate(term);
    history.unshift({ term, mode: selectedMode, date: new Date().toISOString() });
    history = history.slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch (error) {
    showError(error.status === 404 ? "No s'han trobat dades per a aquest identificador." :
      error.status === 429 ? "Has arribat al límit de consultes d'aquesta font. Espera una estona i torna-ho a provar." :
      error.message || "No s'ha pogut completar la consulta.");
  } finally {
    button.disabled = false;
    button.innerHTML = "<span>⌕</span> Investigar";
  }
});
$("#clear-history").addEventListener("click", () => {
  history = [];
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});
renderHistory();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
