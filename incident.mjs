/* incident.mjs: a failure the page can catch gets one short code the student can read out (Tony, Oct 19: "show a code and log that
   code and incident in with reasons why"). SCHEMA.md "Incidents".
   incident(where, why, x) makes "E-" + 5 chars, logs it (console; PostHog event `incident` via window.stemT; one POST /log/incident
   beacon that serve.py prints as a JSON line in the Vercel logs) and returns the code for the failure line.
   x.server: the server's own code (X-Incident, "S-XXXXX"): it is reused, so the page shows the code the server logged.
   Never the student's answers, notes or chat (privacy art. 6): only the allowlisted fields below, each a number, a fixed tag, the
   error's whole message (e-mails and long digit runs blanked) or the full User-Agent. That technical detail (Tony, Oct 19: "only for
   troubleshooting purposes for that code") rides in an incident only, never in another telemetry event. DNT / GPC / "Don't record
   me": no report is sent at all; the student still sees the code (app.js adds that Tony gets less to go on).
   Flight recorder (flight.js, P1): the report also carries `fr` = the last steps of the page (ring), the last keyboard / focus events as
   classes (kb), the page state (page.before + page.at), the diag line and /health's ok|over|err. Rate-limited and deduped there; never student text. */
export const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";   // base32 with no 0/O/1/I: read out loud, never mistyped
export const CODE_RE = /^[ES]-[2-9A-HJ-NP-Z]{5}$/;
export const PHASES = ["headers", "stream", "parse", "timeout", "abort", "script"];
export const KEYS = ["code", "where", "reason", "status", "phase", "ms", "bytes", "path", "err", "q", "v", "ua", "trace_id"];   // serve.py INC_KEYS (ua: from the header there)
export const FR_MAX = 16384;                                   // a whole report (record + flight snapshot): serve.py INC_BODY_MAX
const MAX = 20;                                                 // a page that keeps failing (an error loop) sends this many, then only counts

/* W3C traceparent "00-<trace id>-<span id>-01" (Tony, Oct 19: OpenTelemetry's shapes, no SDK): every fetch app.js makes sends one, serve.py
   puts the trace id on its incident lines and in X-Incident, the page's own incident carries it too, so an E- code and an S- code
   of one request share a trace_id. trace: an existing trace id (a new span in it) */
const hex = n => { const b = new Uint8Array(n); try { crypto.getRandomValues(b); } catch { for (let i = 0; i < n; i++) b[i] = Math.random() * 256; } return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); };
export const traceparent = (trace = hex(16)) => `00-${trace}-${hex(8)}-01`;
export const traceOf = tp => (/^00-([0-9a-f]{32})-[0-9a-f]{16}-01$/.exec(tp || "") || [])[1] || null;

export function newCode(prefix = "E", rnd = Math.random) {
  let s = prefix + "-";
  for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(rnd() * 32) % 32];
  return s;
}
/* "TypeError: network error": the error's name and its whole message (Tony, Oct 19), with a light safety net: e-mails and runs of 5+
   digits (a phone number, an ID) blanked, control characters gone; ERR_MAX keeps the beacon under serve.py's body limit */
export const ERR_MAX = 2000;
export function errText(e) {
  if (!e) return null;
  const t = typeof e === "string" ? e : String(e.name || "Error") + ": " + String(e.message ?? "");
  return t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "*@*").replace(/\d{5,}/g, m => "#".repeat(m.length))
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "").slice(0, ERR_MAX) || null;
}
const tag = (s, n) => (typeof s === "string" && new RegExp(`^[a-z0-9_/-]{1,${n}}$`).test(s) ? s : null);
const int = v => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(Math.min(v, 1e9)) : null);
/* the one record: only KEYS, every value checked; anything else in x is dropped */
export function reason(where, why, x = {}) {
  return {
    where: tag(where, 40) || "other", reason: tag(why, 40) || "error",
    status: int(x.status), phase: PHASES.includes(x.phase) ? x.phase : null, ms: int(x.ms), bytes: int(x.bytes),
    path: typeof x.path === "string" && /^\/?[\w./-]{1,80}$/.test(x.path.split("?")[0]) ? x.path.split("?")[0] : null,
    err: errText(x.err),
    q: typeof x.q === "string" && /^[A-Z][A-Z0-9]*_[A-Z0-9]{2,}$/.test(x.q) ? x.q : null,
    v: typeof x.v === "string" && /^[\w.#-]{1,40}$/.test(x.v) ? x.v : null,
    trace_id: typeof x.trace_id === "string" && /^[0-9a-f]{32}$/.test(x.trace_id) ? x.trace_id : null,
    ua: typeof x.ua === "string" ? x.ua.replace(/[^\x20-\x7e]/g, "").slice(0, 512) || null : null,   // the full User-Agent: only ever in an incident
  };
}

const W = typeof window !== "undefined" ? window : null;
let sent = 0;
const version = () => { try { return W.document.querySelector('meta[name="stem-build"]')?.dataset.sha || "dev"; } catch { return null; } };
/* the same switches as telemetry.js: Do Not Track, Global Privacy Control, privacy.html "Don't record me" */
export const trackingOff = () => { try { const T = W.__stemTelemetry; return !!T && (T.optedOut(W.navigator, W) || T.userOff(W.localStorage)); } catch { return true; } };
function beacon(r) {
  if (!/^https?:$/.test(W.location.protocol)) return;          // the offline file: no server to tell
  const body = JSON.stringify(r);
  try {                                                         // keepalive: it survives leaving the page, like a beacon, and carries the traceparent
    W.fetch("log/incident", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { traceparent: traceparent(r.trace_id || undefined) } }).catch(() => {});
    return;
  } catch { /* no fetch: a beacon (no headers) */ }
  try { W.navigator.sendBeacon && W.navigator.sendBeacon("log/incident", new Blob([body], { type: "text/plain" })); } catch { /* never the page's problem */ }
}
/* debug mode (Tony only, no toggle on any page): ?debug=1 once turns it on for this browser, ?debug=0 off. It adds each code's reason (students see the code only) */
const DEBUG = "stem-debug";
try { const d = new URLSearchParams(W.location.search).get("debug"); if (d === "1") W.localStorage.setItem(DEBUG, "1"); else if (d === "0") W.localStorage.removeItem(DEBUG); } catch { /* no window, or storage blocked */ }
export const debugOn = () => { try { return W.localStorage.getItem(DEBUG) === "1"; } catch { return false; } };
const seen = new Map();                                         // code -> reason tag, for the debug line
export const incLabel = c => (seen.has(c) ? c + " " + seen.get(c) : c);
/* the diag line (flight recorder P1; Tony's debug mode only, students see the code only): "v#197 · explain 504 · 20.1 s · AI: cap".
   AI: from the server's reason (budget_cap = cap, an S- code's upstream / empty = err), else /health's answer, else "?" */
const AI_WHERE = /^(explain|chat|note|cluck)$/;
export function aiState(r, health) {
  if (r.reason === "budget_cap") return "cap";
  if (/^S-/.test(r.code || "") && /^(upstream|empty)$/.test(r.reason || "")) return "err";
  if (health && typeof health === "object") {
    const v = [health.claude, health.or];
    return v.includes("ok") ? "ok" : v.includes("over") ? "cap" : v.includes("err") ? "err" : "?";
  }
  return "?";
}
export function diagLine(r, build, health) {
  const s = Number.isFinite(r.ms) ? (r.ms / 1000).toFixed(1) + " s" : "? s";
  return [`v${build || "?"}`, `${r.where} ${r.status ?? r.phase ?? r.reason}`, s, ...(AI_WHERE.test(r.where) ? [`AI: ${aiState(r, health)}`] : [])].join(" · ");
}
const build = () => { try { return W.document.querySelector('meta[name="stem-build"]')?.getAttribute("content") || null; } catch { return null; } };
const diags = new Map();                                        // code -> its diag line (app.js incHTML, debug mode)
export const incDiag = c => diags.get(c) || null;
/* GET /health (serve.py): ok | over | err per AI provider, never a number. Asked only after a Cluck incident, only when reports are on, 3 s at most */
async function health() {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000), fr = W.stemFR?.req("health");
  try {
    const r = await W.fetch("health", { headers: { traceparent: traceparent() }, signal: ctl.signal, credentials: "same-origin" });
    fr?.h(r);
    const j = r.ok ? await r.json() : null, ok = v => (["ok", "over", "err"].includes(v) ? v : null);
    const h = j && typeof j === "object" ? { claude: ok(j.claude), or: ok(j.or) } : null;
    if (h) W.stemFR?.log("budget", "claude:" + h.claude, "or:" + h.or, "health");
    return h;
  } catch (e) { fr?.x(e); return null; } finally { clearTimeout(t); }
}
export function incident(where, why, x = {}) {
  const code = typeof x.server === "string" && CODE_RE.test(x.server.trim()) ? x.server.trim() : newCode();
  const r = { code, ...reason(where, why, { v: version(), ua: W && W.navigator ? W.navigator.userAgent : null, ...x }) };
  if (seen.size < 50) { seen.set(code, r.reason); diags.set(code, diagLine(r, build())); }
  try { console.warn("incident " + JSON.stringify(r)); } catch { /* no console */ }
  if (!W || ++sent > MAX || trackingOff()) return code;
  /* the flight recorder's snapshot (flight.js): ring + kb + page.before + page.at, in this report only, for this code only; { dup, n } / { rate } when gated */
  let fr = null;
  try { fr = W.stemFR ? W.stemFR.snap(r, FR_MAX - JSON.stringify(r).length - 512) : null; } catch { /* never */ }   // 512: room for diag + health
  const send = h => {
    const d = diagLine(r, build(), h);
    if (diags.has(code)) { diags.set(code, d); try { W.document.querySelectorAll(`.inc-diag[data-diag="${code}"]`).forEach(n => { n.textContent = d; }); } catch { /* no DOM */ } }
    const full = !fr ? r : { ...r, fr: fr.ring ? { ...fr, diag: d, health: h || null } : fr };
    try { W.stemT?.("incident", full); } catch { /* telemetry never breaks the page */ }
    beacon(full);
  };
  if (fr && fr.ring && AI_WHERE.test(r.where) && r.reason !== "budget_cap" && W.fetch && /^https?:$/.test(W.location.protocol)) health().then(send, () => send(null));
  else send(null);
  return code;
}
/* uncaught errors and rejections: logged only (a visible failure that follows logs its own code) */
if (W && W.addEventListener) {
  W.addEventListener("error", e => incident("window", "error", { phase: "script", err: e.error || { name: "Error", message: e.message } }));
  W.addEventListener("unhandledrejection", e => incident("window", "rejection", { phase: "script", err: e && e.reason }));
}
