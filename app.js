/* app.js: the drill page. Code entry -> p/<CODE>.json (served from problems.json, or an uploaded problems.json) -> blocks -> answer -> scratchpad -> Copy.
   Layout decisions for the frozen problem: design/FREEZE.md. Payload: copy/COPY-PAYLOAD.md. */
import { build, stringify } from "./copy/payload.mjs";
import { shuffled, seed } from "./shuffle.mjs";
import * as codes from "./codes.mjs";
import { suggest, remember, isBank, normalize, normalizeLink, entry } from "./suggest.mjs";
import { match as slipMatch, slipSpot, familyHint } from "./slips.mjs";   // slips v2 unit C: runtime slip matching for uploaded banks
import { modeOf, setMode, modePrefix, forceSugarOnce, view as modeView, hidden as modeHidden } from "./mode.mjs";
import { quack, withQuack } from "./quack.mjs";
import { speakable } from "./speak.mjs";
import { changes, markNums } from "./chg.mjs";
import { renumberSteps } from "./steps.mjs";
import { incident, debugOn, incLabel, incDiag, trackingOff, traceparent, traceOf } from "./incident.mjs";
import { clampPos, progress, radiusAt, dimAt, snapTo } from "./sheet.mjs";
window.stemCodes = codes;   // offline.js (a classic script, runs after this module) reads the code rules from here

/* Vercel Web Analytics (design/DEPLOY.md): only where Vercel serves the page (https, not localhost). The old http server, local runs,
   tests and the offline file never ask for /_vercel/insights/script.js, which only Vercel has. sw.js never caches it. */
if (location.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const va = document.createElement("script"); va.defer = true; va.src = "/_vercel/insights/script.js"; document.head.appendChild(va);
}
/* the blind-locale test (blind/locale.js): ?blind=ka|am|th swaps every UI word into a script Tony can't read, the question stays
   English. Kept for the tab; ?blind=off ends it. Without the flag nothing loads. */
try {
  const q = new URLSearchParams(location.search).get("blind");
  if (q === "off") sessionStorage.removeItem("stem-blind"); else if (q) sessionStorage.setItem("stem-blind", q);
  const lang = sessionStorage.getItem("stem-blind");
  if (lang && /^[a-z]{2}$/.test(lang)) { const b = document.createElement("script"); b.src = "blind/locale.js"; b.dataset.lang = lang; document.head.appendChild(b); }
} catch { /* storage blocked: no blind test */ }

const $ = s => document.querySelector(s);
const root = document.documentElement;
const MAX_TRIES = 2;   // tries for everything except a 2-choice mc (maxTries)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
let lastQuack = "";   // quack.mjs: the last prefix shown, so the next one differs (Tony D72: every Cluck hint starts with a QUACK)
const quackHint = (h, seed) => { const out = withQuack(h, seed, lastQuack); lastQuack = quack(seed, lastQuack); return out; };
const say = t => { const sr = $("#sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); };
/* onboarding (STYLE.md §3 Toast): only on a new device, i.e. no stem-* key at the first load; remembered as stem-ob until all are shown */
const onboard = (() => { try {
  if (!Object.keys(localStorage).some(k => k.startsWith("stem-"))) localStorage.setItem("stem-ob", "1");
  return localStorage.getItem("stem-ob") === "1";
} catch { return false; } })();
function obToast(n, text, at) {
  if (!onboard || toastAt || !at || at.hidden) return;                           // a wrong-answer note wins; try again next time
  try { if (localStorage.getItem("stem-ob-" + n)) return; localStorage.setItem("stem-ob-" + n, "1");
    if ([1, 2, 3].every(i => localStorage.getItem("stem-ob-" + i))) localStorage.setItem("stem-ob", "done"); } catch { return; }
  toast(text, at);
}
/* the toast (design/STYLE.md §3 Toast): one look for the "one more try" note and the onboarding notes. Under its anchor with a caret
   at the verdict mark; above it (.up, caret on the bottom edge) when there is no room below or the anchor floats (the Scratchpad
   button); on MC it lies on the struck-out choice's text (a dead control, so no live choice is covered) with the caret pointing left
   at the X badge. 2 s (Tony, Oct 3), paused while the pointer rests on it or the tab is hidden; tap or Esc closes it. Follows the box on scroll. */
let toastT = 0, toastAt = null, toastLeft = 0, toastSince = 0;
function placeToast() {
  const t = $("#toast"); if (!t || !toastAt || !toastAt.isConnected) return;
  if (!toastAt.getClientRects().length) { hideToast(); return; }                // its anchor went away (the button while the pad is open)
  const bar = $(".top"), barB = bar && getComputedStyle(bar).position === "sticky" && !bar.contains(toastAt) ? bar.getBoundingClientRect().bottom : -Infinity;
  if (toastAt.getBoundingClientRect().bottom < barB) { hideToast(); return; }  // scrolled under the pinned bar: no toast pointing at the bar
  const mk = toastAt.querySelector(".vk, .badge"), mr = mk && mk.getBoundingClientRect();
  const m = mr && mr.width ? mr : toastAt.getBoundingClientRect(), mx = m.left + m.width / 2;   // a one-row pill has no badge: its centre
  const b = toastAt.getBoundingClientRect(), row = toastAt.classList.contains("opt") && !!(mr && mr.width);   // on the struck text only beside a badge
  const gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gut")) || 20;
  t.classList.toggle("row", row);
  if (row) {                                                                     // on the struck text, after the badge
    t.classList.remove("up");
    t.style.maxWidth = Math.max(120, b.right - m.right - 18) + "px";
    t.style.left = Math.round(m.right + 12) + "px"; t.style.top = Math.round(b.top + b.height / 2 - t.offsetHeight / 2) + "px"; return;   // whole px: sharp words (TOAST.md)
  }
  t.style.maxWidth = "";
  const w = t.offsetWidth, h = t.offsetHeight, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - dockRoom();
  let x = mx > b.left + b.width / 2 ? b.right - w : b.left;
  x = Math.min(Math.max(gut, x), innerWidth - gut - w);
  const up = toastAt.id === "padFab" || b.bottom + 12 + h > bottom;             // no room under it: flip above, caret on the bottom edge
  t.classList.toggle("up", up);
  t.style.left = Math.round(x) + "px"; t.style.top = Math.round(up ? b.top - 12 - h : b.bottom + 12) + "px";   // whole px: sharp words (TOAST.md)
  t.style.setProperty("--px", Math.max(18, Math.min(w - 18, mx - x)) + "px");
}
function hideToast() { clearTimeout(toastT); toastLeft = 0; toastAt = null; $("#toast")?.classList.remove("on"); }
function armToast(ms) { clearTimeout(toastT); toastLeft = ms; toastSince = Date.now(); toastT = setTimeout(hideToast, ms); }
function holdToast() { if (toastLeft) { clearTimeout(toastT); toastLeft = Math.max(600, toastLeft - (Date.now() - toastSince)); } }
function goToast() { if (toastLeft && toastAt) armToast(toastLeft); }
function toast(text, at) {
  const t = $("#toast"); if (!t || !at) return;
  if (mtOpen && mtTile === "q" && $("#q").contains(at)) setTile("a", false);       // the note is about the answer: show it first
  t.textContent = text; toastAt = at; t.classList.add("on");
  placeToast(); armToast(2000);
}
/* the entry line (#entryMsg): every upload / open outcome ends here. tone: bad (red, the default) | warn | ok. The class is reset
   each time, so a green line never colours the next red one. */
function entryMsg(text, tone = "bad", inc = null) {
  const m = $("#entryMsg");
  m.textContent = text;
  if (inc) m.insertAdjacentHTML("beforeend", incHTML(inc));
  m.className = "entry-msg" + (text && tone !== "bad" ? " " + tone : "");
}
/* an incident (incident.mjs, SCHEMA.md "Incidents") after the failure line, whose words stay as they were (Tony, Oct 19):
   "Send Tony this code: E-7K3QX", readable and selectable for a screenshot; a tap copies the code. Never the reason, except in
   Tony's debug mode (?debug=1 once): "E-7K3QX network". Tracking off (DNT / GPC / "Don't record me"): no report went out, and the line says so.
   card: an error card (not Cluck's chip): in debug mode it adds the flight recorder's diag line "v#197 · explain 504 · 20.1 s · AI: cap" */
const incHTML = (c, card = true) => !c ? "" : ` <span class="inc" data-inc="${c}">Send Tony this code: <b>${esc(debugOn() ? incLabel(c) : c)}</b>${trackingOff()
  ? ` <small class="inc-off">Tracking turned off.</small>` : ""}${card && debugOn() && incDiag(c)
  ? ` <small class="inc-diag" data-diag="${c}">${esc(incDiag(c))}</small>` : ""}</span>`;
document.addEventListener("click", async e => {
  const b = e.target.closest?.(".inc[data-inc]"); if (!b || b.closest("button")) return;   // inside Cluck's chip, the tap is the chip's (try again)
  e.stopPropagation(); e.preventDefault();
  say((await copyText(b.dataset.inc)) ? `Copied ${b.dataset.inc}.` : b.dataset.inc);
}, true);
/* a classic script (offline.js: the SW reload loop) cannot import incident.mjs: it fires "stem:incident" { where, why } */
addEventListener("stem:incident", e => { const d = e.detail || {}; incident(d.where, d.why); });
/* serve.py's X-Incident: "S-7K3QX budget_cap <trace id>" (its code, its reason tag, the request's trace id) */
const xInc = r => (r && r.headers.get("x-incident") || "").trim().split(/\s+/);
/* a request that failed: one incident. r = the Response when one came (its X-Incident, the server's code + reason, win), else e = what fetch threw */
/* tp: the request's traceparent (incident.mjs): its trace id goes in the incident, so this E- code and the server's lines link */
const reqInc = (where, path, t0, { r, e, why, tp, ...x } = {}) => incident(where, why || xInc(r)[1] || (r ? "http" : timedOut(e) ? "timeout" : x.phase === "parse" ? "parse" : "network"),
  { status: r && r.status, phase: timedOut(e) ? "timeout" : "headers", server: xInc(r)[0], trace_id: xInc(r)[2] || traceOf(tp), err: e, ms: Date.now() - t0, path, ...x });
/* a press that cannot move says why (nav.js "drill:note", load()): a toast under Next, else the entry line */
function note(text) {
  const at = $("#qnext");
  if (at && !at.hidden && at.getClientRects().length) toast(text, at); else entryMsg(text);
}
addEventListener("drill:note", e => note(String(e.detail && e.detail.text || "")));
$("#toast")?.addEventListener("click", hideToast);
$("#toast")?.addEventListener("pointerenter", holdToast);
$("#toast")?.addEventListener("pointerleave", goToast);
document.addEventListener("visibilitychange", () => { document.hidden ? holdToast() : goToast(); });
addEventListener("keydown", e => { if (e.key !== "Escape") return; if (toastAt) hideToast(); else if (cl && cl.open) clClose(true); });   // Escape: the toast, then Cluck's sheet (desktop: the X's dismiss, design/DISMISS.md)
addEventListener("scroll", placeToast, { passive: true });
addEventListener("resize", placeToast);
/* the verdict lives in the answer box, in the arrow's slot (the slot is always reserved, so nothing moves):
   i-ok right, i-x wrong with a try left (goes when the student types), i-lock out of tries. null clears it. */
function vmark(box, id) {
  if (!box) return;
  let m = box.querySelector(".vk");
  if (!id) { if (m) m.remove(); return; }
  if (!m) { m = document.createElement("span"); m.className = "vk"; m.setAttribute("aria-hidden", "true"); box.append(m); }
  m.dataset.v = id; m.innerHTML = icon(id);
}
/* the words the screen reader hears (the page shows only the icon) */
const verdictWords = r => r.verdict === "correct" ? "Correct." : r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0) ? "Out of tries, fight it later."
  : r.verdict === "wrong" ? "Not quite. One more try, I swear." : "";

/* ================= markdown + TeX ================= */
function renderMath(src, display) {
  if (typeof katex === "undefined") return `<code>${esc(src)}</code>`;
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "htmlAndMathml", trust: c => c.command === "\\htmlClass" });   // \htmlClass: a snack's changed number (chg.mjs)
}
/* the codeblock (T43; design/STYLE.md "Codeblock"): a fenced block in question or choice text. One span per real line: its number
   is a CSS counter, and a long line wraps hanging under its own indent with no number. Colour: a tiny regex highlighter (Tokyo Night,
   app.css --syn-*). Comments and strings match first, so a keyword or a // inside them stays theirs. An unknown language stays plain. */
const FENCE = /^```[^\n`]*\n[\s\S]*?^```[ \t]*$/gm;
const CB_LANG = { c: "C", cpp: "C++", "c++": "C++", java: "Java", js: "JavaScript", javascript: "JavaScript", py: "Python", python: "Python", ts: "TypeScript" };
const words = s => new Set(s.split(" "));
/* one token regex per family: 1 comment, 2 string, 3 number, 4 a word, 5 the "(" that makes it a call */
const synRe = com => new RegExp(`(${com})|("(?:\\\\.|[^"\\\\])*"?|'(?:\\\\.|[^'\\\\])*'?|\`(?:\\\\.|[^\`\\\\])*\`?)`
  + "|(\\b(?:0[xX][\\da-fA-F]+|\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)[a-zA-Z]*\\b)|([A-Za-z_]\\w*)(\\s*\\()?", "g");
const C_SYN = { pre: true, re: synRe("//.*|/\\*.*?(?:\\*/|$)"),
  kw: words("if else for while do switch case default break continue return goto sizeof struct union enum typedef const static extern inline volatile register "
    + "class public private protected virtual override template typename namespace using new delete this true false nullptr NULL try catch throw finally operator "
    + "friend constexpr noexcept extends implements interface import package final abstract instanceof throws super function let var of in typeof async await yield export from null undefined"),
  type: words("int char short long float double bool void unsigned signed auto size_t string vector map set pair boolean byte String Integer Object") };
const PY_SYN = { re: synRe("#.*"),
  kw: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self"),
  type: words("int float str bool list dict tuple set bytes object") };
const SYN = { c: C_SYN, cpp: C_SYN, "c++": C_SYN, java: C_SYN, js: C_SYN, javascript: C_SYN, ts: C_SYN, typescript: C_SYN, py: PY_SYN, python: PY_SYN };
const tok = (k, t) => `<span class="t-${k}">${esc(t)}</span>`;
/* one line to HTML; st.open = inside a block comment that began on an earlier line */
function hl(t, syn, st) {
  let out = "", i = 0;
  if (st.open) { const e = t.indexOf("*/"); if (e < 0) return tok("com", t); st.open = false; out = tok("com", t.slice(0, e + 2)); t = t.slice(e + 2); }
  if (!syn) return out + esc(t);
  if (syn.pre && /^\s*#/.test(t)) return out + tok("pre", t);
  for (const m of t.matchAll(syn.re)) {
    const [w, com, str, num, id, call] = m;
    out += esc(t.slice(i, m.index)); i = m.index + w.length;
    if (com) { if (com.startsWith("/*") && !com.slice(2).endsWith("*/")) st.open = true; out += tok("com", com); }
    else if (str) out += tok("str", str);
    else if (num) out += tok("num", num);
    else { const k = syn.kw.has(id) ? "kw" : syn.type.has(id) ? "type" : call ? "fn" : ""; out += (k ? tok(k, id) : esc(id)) + esc(call || ""); }
  }
  return out + esc(t.slice(i));
}
function codeblock(code, lang = "", copy = true) {
  const l = String(lang || "").trim().split(/\s+/)[0], name = CB_LANG[l.toLowerCase()] || l, syn = SYN[l.toLowerCase()], st = {};
  return `<figure class="cb" aria-label="${esc(name ? name + " code" : "Code")}"><div class="cb-hd"><span class="cb-lang">${esc(name)}</span>`
    + `<span class="cb-act"><span class="cb-slot" aria-hidden="true"></span>${copy ? `<button type="button" class="btn cb-copy" aria-label="Copy code" title="Copy code">${icon("i-copy")}</button>` : ""}</span></div>`
    + `<pre><code>${String(code).replace(/\n$/, "").split("\n").map(t =>
      `<span class="l" style="--ind:${/^[ \t]*/.exec(t)[0].replace(/\t/g, "  ").length}">${hl(t, syn, st)}</span>`).join("")}</code></pre></figure>`;
}
/* $$..$$ and $..$ are cut out before markdown so marked never sees TeX; "\$" is a literal dollar. */
/* big: a choice row. Its inline math sets in display style, so $\frac12$ and $\dfrac12$ look the same in every row (a lone 1/2 is never
   the tiny text-style one); nested parts (a fraction in an exponent) still shrink the TeX way. */
function md(text, inline = false, big = false) {
  const src = Array.isArray(text) ? text.join("\n") : String(text);
  const math = [], fences = [];
  const tok = i => `KXMATH${i}Z`;
  let s = src.replace(FENCE, m => { fences.push(m); return `KXCODE${fences.length - 1}Z`; });   // a codeblock is never TeX
  s = s.replace(/\\\$/g, () => { math.push({ lit: "$" }); return tok(math.length - 1); });
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { math.push({ t, d: true }); return tok(math.length - 1); });
  s = s.replace(/\$([^$\n]+?)\$/g, (_, t) => { math.push({ t, d: false }); return tok(math.length - 1); });
  s = s.replace(/KXCODE(\d+)Z/g, (_, i) => fences[+i]);
  let html;
  if (typeof marked !== "undefined") {
    const renderer = new marked.Renderer();
    renderer.html = tokOrText => esc(typeof tokOrText === "string" ? tokOrText : tokOrText.text);   // raw HTML is escaped
    renderer.image = () => "";                                                                         // images ignored
    renderer.table = function (...a) { return `<div class="tbl">${marked.Renderer.prototype.table.apply(this, a)}</div>`; };
    renderer.code = (c, lang) => typeof c === "object" ? codeblock(c.text, c.lang, !inline) : codeblock(c, lang, !inline);   // no Copy inside a choice (it is a button)
    html = inline && !fences.length ? marked.parseInline(s, { renderer, gfm: true }) : marked.parse(s, { renderer, gfm: true });
  } else {
    html = esc(s).split(/\n{2,}/).map(p => inline ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  }
  /* inline math keeps the punctuation that touches it on its line: "($v$)." never leaves "." or "(" alone on a line (.mx) */
  return html.replace(/\uE000/g, '<mark class="chg">').replace(/\uE001/g, "</mark>").replace(/(\(?)KXMATH(\d+)Z([.,;:!?)]*)/g, (_, pre, i, post) => {
    const m = math[+i];
    if (m.lit) return pre + "$" + post;
    const k = renderMath(big && !m.d ? "\\displaystyle " + m.t : m.t, m.d);
    return (pre || post) && !m.d ? `<span class="mx">${pre}${k}${post}</span>` : pre + k + post;
  });
}

/* ================= grading: THE one place =================
   Server problems: POST /check grades (answers never reach the browser). Reply shape (SCHEMA.md "Grading"):
     { verdict: "correct"|"wrong"|"invalid"|"locked", triesLeft, error?, hint?, repeat?, part? }
   Uploaded problems.json: the file is the student's own copy, so the same rules run here, on that file.
   No server and no file (static host): { verdict: "pending" }; Copy still sends the try to Tony.
   `answer` is { answer: "typed text" } or { choice: "b" } or, pick all, { choices: ["a", "c"] } (wrong adds struck?); a multi grades one part at a time: { part: i, answer: "typed text" }. */
/* every request goes through net(): aborted after 8 s, so nothing can wait forever (design/RELOAD.md).
   In-flight requests are kept so a resumed page (bfcache, a long-hidden tab) can abort the stale ones. */
const TIMEOUT = 8000;
const inflight = new Set();
const timedOut = e => !!e && e.name === "AbortError";
/* flight.js: one request's start / headers / first byte / end / error in the page's ring (on the device; only an incident carries it) */
const FR_NONE = { h() {}, f() {}, e() {}, x() {} };
const frReq = (ep, tp) => window.stemFR?.req(ep, tp) || FR_NONE;
async function net(url, init = {}) {
  const ctl = new AbortController(), req = { ctl, t0: Date.now(), ep: url.split(/[/?]/)[0] };
  const t = setTimeout(() => ctl.abort(), TIMEOUT), fr = frReq(req.ep, init.headers?.traceparent);
  inflight.add(req);
  try { const r = await fetch(url, { ...init, signal: ctl.signal }); fr.h(r); return r; }
  catch (e) { fr.x(e); throw e; }
  finally { clearTimeout(t); inflight.delete(req); }
}
const localState = new Map();
/* /check timed out twice in a row (flight recorder P2): the 2nd is its own incident, timeout_x2, so it is not folded into the 1st (flight.js
   dedupe) and its report shows the page after two waits; any other answer resets the count */
let checkSlow = 0;
async function check(code, answer) {
  const off = window.stemOffline;
  if (off && off.has(code)) return gradeLocal(modeView(off.get(code), modeOf()), answer);   // an upload: the same mode view the server uses
  const t0 = Date.now(), tp = traceparent(), slow = checkSlow;
  let inc = null;
  checkSlow = 0;
  try {
    const rd = window.stemRedo.has(code) ? { round: window.stemRedo.get().n } : {};   // a redo round grades in its own namespace
    const r = await net("check", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
                                     body: JSON.stringify({ code, ...answer, ...rd }) });
    if (r.ok) { try { return await r.json(); } catch (e) { inc = reqInc("check", "/check", t0, { e, phase: "parse", q: code, tp }); } }
    else if (r.status >= 500) inc = reqInc("check", "/check", t0, { r, q: code, tp });   // a 4xx: no grader here (a static host), not a failure
  } catch (e) {
    if (timedOut(e)) checkSlow = slow + 1;
    inc = reqInc("check", "/check", t0, { e, q: code, tp, why: checkSlow >= 2 ? "timeout_x2" : undefined });
    if (timedOut(e)) return { verdict: "timeout", inc }; /* else offline */
  }
  return { verdict: "pending", inc };
}
/* mirror of serve.py grade(): keep the two in step */
const PROOF_TRIES = 3;                                     // serve.py PROOF_TRIES (W107, Tony Oct 27: a proof gets 3 Checks)
const maxTries = p => p.tries ?? (p.type === "proof" ? PROOF_TRIES : p.type === "mc" && shown(p).length === 2 ? 1 : MAX_TRIES);   // serve.py max_tries(): 2-choice mc = ONE try, else two; a mode view keeps its count
const all = p => p.type === "mc" && p.pick === "all";                              // checkboxes, graded as a set (design/CHOOSE-ALL.md)
const FIX_NUDGE = "All ducks almost in a row... check your math carefully.";   // serve.py FIX_NUDGE
const WRONG_MISS = "QUACK. At least one ticked row is wrong.";   // serve.py WRONG_MISS (miss default: mode.mjs NONE_MISS)
const squash = t => String(t).replace(/\s+/g, "").toLowerCase();
function unitSig(u, t) {                                  // serve.py signature()
  if (u.type === "text") { if (!squash(t)) throw 0; return squash(t); }
  if (/^\s*(dne|does not exist)\s*$/i.test(t)) return "dne";
  if (u.type === "num") t = numText(t);
  const v = u.var || "x", c = math.compile(t.replace(/ln\s*\(/gi, "log(").replace(/π/g, "pi").replace(/∞/g, "Infinity"));
  const at = x => { let r = c.evaluate({ [v]: x }); if (typeof r !== "number") r = math.number(r); if (Number.isNaN(r)) throw 0; return r; };
  return u.type === "expr" ? u.points.map(at) : at(undefined);
}
/* serve.py numtext(): 1.07x10^14, 1.07 X 10^14, 1.07×10^14, 1.07·10^14, 1.07 10^14 -> 1.07*10^14; 107 000 -> 107000 */
const numText = t => String(t).trim().replace(/(\d)\s*(?:[x×·*]\s*)?10\s*\^/gi, "$1*10^").replace(/(?<=\d) (?=\d{3}(?!\d))/g, "");
/* serve.py sigfig() / figures(): hard-mode fix boxes, the key rounded to n figures, then +-1 in the last */
const figures = u => Number.isInteger(u.sf) && u.sf > 0 ? u.sf : +((String(u.how || "").match(/(?<![≥>\d])(?<!at least )(\d+)\s*sig/i) || [])[1] || 3);   // serve.py figures(): "≥4" is the ask, not the grade
const sigfig = (a, b, n) => typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && b !== 0
  && (u => Math.abs(a - Math.round(b / u) * u) <= u * (1 + 1e-9))(10 ** (Math.floor(Math.log10(Math.abs(b))) - (n - 1)));
/* serve.py same() / tol_of(): relative to the key (tolerance 1b), a zero key gets the absolute ZERO window, expr points always do.
   tolOf() is the grading window only: wrong-entry matches and repeats keep u.tol ?? 1e-6 (98 and 99 are two tries), slips use SLIP_WIN */
const ZERO = 1e-9, TOL_NUM = 0.02, EXACT = 1e-4;          // slips.py ZERO / TOL_NUM / EXACT
const same = (a, b, tol, floor = 0) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i], tol, ZERO))
  : typeof a === "string" || typeof b === "string" || !Number.isFinite(a) || !Number.isFinite(b) ? a === b
  : Math.abs(a - b) <= Math.max(tol * Math.abs(b), b === 0 ? ZERO : floor);
const tolOf = u => u.tol ?? u.topic_tol ?? u.bank_tol ?? (u.type === "num" && !u.fixbox ? TOL_NUM : 1e-6);   // question > topic > bank (offline.js inheritTol) > default
/* right to 3 significant figures (serve.py sig3; Tony, Oct 3: the prompt asks for 4+): correctness only, never wrong-entry matching or repeats */
const sig3 = (a, b) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => sig3(x, b[i]))
  : typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && b !== 0
    && Math.abs(a - b) <= 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(b))) - 2) * (1 + 1e-9);
function unitOk(u, g) {
  if (u.type === "text") return [u.answer, ...(u.accept || [])].map(squash).includes(g);
  const a = u.answer === "dne" ? "dne" : unitSig(u, u.answer);
  if (u.fixbox && !Array.isArray(g)) return same(g, a, tolOf(u)) || sigfig(g, a, figures(u));
  if (exactInt(u, a)) return same(g, a, Math.min(tolOf(u), 0.5 / Math.abs(a)));
  return same(g, a, tolOf(u)) || sig3(g, a);
}
/* serve.py exact_int(): an exact integer key (question tol <= EXACT): no 3 s.f. pass, a window under half a unit (1023 is wrong for 1024,
   9999 for 10000); 9*sqrt(3) keeps 3 s.f. */
const exactInt = (u, a) => typeof a === "number" && a !== 0 && Number.isInteger(a) && (u.tol ?? 1) <= EXACT;
function unitHit(u, t, g) {                               // re entries first, then match
  const w = u.wrong || [];
  return w.find(x => x.re && new RegExp(x.re, "i").test(t))
    || w.find(x => { try { return x.match != null && same(g, unitSig(u, x.match), u.tol ?? 1e-6); } catch { return false; } });
}
/* T19 sugar reveal (Tony, Oct 12): mirror of serve.py answer_of(). The answer of one unit, only ever handed out once the unit is shut out of tries */
const g4 = v => {                                         // Python's format(v, ".4g"), exponent as x 10^n
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(+v.toPrecision(4))));
  if (e < -4 || e >= 4) { const [m, x] = v.toExponential(3).split("e"); return `${+m} \u00d7 10^${+x}`; }
  return String(+v.toPrecision(4));
};
function answerOf(u) {
  if (u.type === "mc") return all(u) ? [].concat(u.correct).sort() : u.correct;
  const a = String(u.answer);
  if (a === "dne") return "does not exist";
  if (u.type !== "num") return a;
  try { return g4(unitSig(u, a)); } catch { return a; }
}
/* the hint the student sees for a reply: `spot` when record() let it through Jev's gate (r.shown), else the plain `hint`. gradeLocal's
   `spot` (slips.mjs slipSpot) passes the same gate (record() guards on r.spot) */
const hintOf = r => r.shown === "spot" && r.spot ? r.spot : r.hint;
const mockHold = () => !!window.stemMock?.on?.();             // the night-before mock (nav.js, W103b): one try, no hint, no reveal, no Cluck
function gradeLocal(key, answer) {                        // multi: { part: i, answer } grades ONE part, with its own tries and lockout
  if (key.type === "proof") return { verdict: "busy", why: "upload", triesLeft: maxTries(key) };   // W107: only Cluck's server grades a proof
  const multi = key.type === "multi", idx = answer.part;
  if (multi && !(Number.isInteger(idx) && idx >= 0 && idx < key.parts.length)) return { verdict: "invalid", triesLeft: maxTries(key) };
  const sk = multi ? `${key.code}#${idx}` : key.code, st = localState.get(sk) || { wrong: [], done: false };
  localState.set(sk, st);
  const R = o => multi ? { ...o, part: idx } : o;
  const left = () => maxTries(key) - st.wrong.length;
  const shut = o => modeOf() === "sugar" && !st.done ? { ...o, correct: answerOf(multi ? key.parts[idx] : key) } : o;   // T19: sugar only, only once shut
  if (st.done || left() <= 0) return R(shut({ verdict: "locked", triesLeft: 0 }));
  let hit = null, correct, sig;
  if (all(key)) {                                         // { choices: [ids] }; hint = first ticked distractor in shown (authored) order, else miss
    /* prove mode (key.fix): + fixes { id: text } for exactly the un-ticked, unlocked rows; a right set then grades each fix like a part */
    const ch = answer.choices, sh = shown(key), right = [].concat(key.correct), lk = sh.filter(c => c.lock).map(c => c.id), fx = answer.fixes;
    const need = key.fix && Array.isArray(ch) ? sh.filter(c => !c.lock && !ch.includes(c.id)).map(c => c.id) : [];
    if (!Array.isArray(ch) || ch.some(x => !sh.some(c => c.id === x)) || new Set(ch).size !== ch.length
        || (ch.length > 1 && ch.some(x => lk.includes(x)))
        || (key.fix && (!fx || typeof fx !== "object" || Array.isArray(fx) || Object.keys(fx).length !== need.length
            || need.some(id => typeof fx[id] !== "string" || !fx[id].trim())))) return { verdict: "invalid", triesLeft: left() };
    sig = [...ch].sort().join(",");
    correct = ch.length === right.length && ch.every(x => right.includes(x));
    const w = key.wrong || [];
    if (!correct) {
      const c = sh.find(c => ch.includes(c.id) && !right.includes(c.id) && w.some(x => x.choice === c.id));
      hit = c ? { ...w.find(x => x.choice === c.id), struck: c.id } : { error: "incomplete", hint: ch.every(x => right.includes(x)) ? key.miss : WRONG_MISS };   // no struck id: never leak which row is false
      if (modeOf() === "sugar" && ch.length && ch.every(x => right.includes(x))) hit.kept = [...ch].sort();   // sugar kept rows (serve.py): every tick right
      if (key.fix) sig = [sig, ...need.map(id => squash(fx[id]).slice(0, 200))];
    } else if (key.fix) {                                 // unreadable fix = invalid; else the first wrong fix in authored order
      const us = need.map(id => { const e = w.find(x => x.choice === id); return e && e.fix ? { id, u: { ...key.fix, ...e.fix, fixbox: true }, t: fx[id].slice(0, 200) } : null; }).filter(Boolean);
      try { for (const x of us) x.g = unitSig(x.u, x.t); } catch { return { verdict: "invalid", triesLeft: left() }; }
      sig = [sig, ...us.map(x => x.g)];
      const bad = us.find(x => { try { return !unitOk(x.u, x.g); } catch { return true; } });
      if (bad) { correct = false; hit = { ...(unitHit(bad.u, bad.t, bad.g) || { hint: FIX_NUDGE }), fixWrong: bad.id }; }
    }
  } else if (key.type === "mc") {
    sig = answer.choice;
    if (!shown(key).some(c => c.id === sig)) return { verdict: "invalid", triesLeft: left() };
    correct = sig === key.correct;
    if (!correct) hit = (key.wrong || []).find(w => w.choice === sig);
  } else {
    const u = multi ? key.parts[idx] : key, text = String(answer.answer ?? "").slice(0, 200);
    try { sig = unitSig(u, text); correct = unitOk(u, sig); }
    catch { return R({ verdict: "invalid", triesLeft: left() }); }
    if (!correct) hit = unitHit(u, text, sig);
    /* slips v2 (design/HANDOFF-slips-v2.md): author wrong -> a slip of `form` (family hint, same shape as a wrong hit) -> nudge */
    if (!correct && !hit && u.type === "num" && u.form) {
      let skip;
      try { skip = [unitSig(u, String(u.answer)), ...(u.ignore_slips || []).map(s => Number(math.evaluate(String(s).replace(/\*\*/g, "^"))))]; } catch { skip = null; }
      const fam = skip && slipMatch(u.form, sig, undefined, skip);   // undefined: slips.mjs SLIP_WIN, never the grading tol (Tony D2)
      if (fam) hit = slipSpot(u.form, sig, skip, fam) || { error: fam, hint: familyHint(fam) };   // serve.py slip_hit: a k=2 pair / SLIP_TIE collide may carry `spot`
    }
  }
  if (correct) { st.done = true; return R({ verdict: "correct", triesLeft: left() }); }
  const tol = (multi ? key.parts[idx] : key).tol ?? 1e-6;
  const repeat = st.wrong.some(w => same(sig, w, tol));
  if (!repeat) st.wrong.push(sig);
  const out = { verdict: "wrong", triesLeft: left(), hint: hit && hit.hint ? hit.hint : (key.nudge || "Time to consult the duck oracle.") };
  if (hit && hit.error) out.error = hit.error;
  if (hit && hit.struck) out.struck = hit.struck;
  if (hit && hit.fixWrong) out.fixWrong = hit.fixWrong;
  if (hit && hit.kept) out.kept = hit.kept;
  if (hit && hit.collide) out.collide = hit.collide;
  if (hit && hit.spot) out.spot = hit.spot;
  if (repeat) out.repeat = true;
  return R(left() <= 0 ? shut(out) : out);
}

/* ================= entry box: code bar + upload ================= */
const codeIn = $("#code"), dock = $("#dock"), mainEl = $("#main");
let swapOn = false, lostAt = 0, mtOpen = false, mtTile = "q", lastEdit = null;   // mtOpen: the phone's pad page (variant 9); lastEdit: see backInView          // Swap state (see "Swap" below)
/* the box is empty while a problem is open (its code is the placeholder); empty = Paste button, text = submit arrow */
const codeGo = $("#codeGo"), codePaste = $("#codePaste");
function syncCode() { const empty = !codeIn.value; codePaste.hidden = !empty; codeGo.hidden = empty; }
/* typing keeps the box up: clearing the message below must not hide a dock that only the message was holding open (focus would be lost) */
codeIn.addEventListener("input", () => { entryMsg(""); root.classList.add("entry-open"); syncCode(); sugShow(); });
function putCode(code) { if (code) barOpen(true); codeIn.value = code; syncCode(); sugHide(); }   // a code landing in the box: the bar shows
syncCode();
/* suggestions (suggest.mjs): the codes this browser knows (opened here before, newest first; the live bank and its list; an
   uploaded file) that contain what is typed. Banks first, then questions. The server never lists codes (design/NAV.md).
   A combobox: ArrowDown / ArrowUp move, Enter opens the marked one (else the typed code), Escape closes, a tap opens. */
const sugEl = $("#codeSug");
let sugAt = -1, sugList = [];
const recent = v => {
  try { if (v === undefined) return JSON.parse(localStorage.getItem("stem-codes") || "[]"); localStorage.setItem("stem-codes", JSON.stringify(v)); } catch { /* blocked */ }
  return [];
};
const remembered = code => recent(remember(recent(), code));
function knownCodes() {
  const off = window.stemOffline, live = bank ? [bank.code, ...bank.codes] : [];
  return [...recent(), ...live, ...(off && off.codes ? off.codes() : [])];
}
/* the prefixes of those codes: a custom prefix seen on this device is "known" (a paste into any other field may take it; a dead
   link then says "not found", not "needs BANK_X") */
const knownPrefixes = () => new Set(knownCodes().filter(c => !isBank(c)).map(codes.prefixOf));
function sugShow() {
  sugList = suggest(codeIn.value, knownCodes());
  sugAt = -1;
  sugEl.innerHTML = sugList.map((c, i) => `<li role="option" id="sug${i}" aria-selected="false" data-code="${esc(c)}">${icon(isBank(c) ? "i-list" : "i-doc")}<span>${esc(c)}</span></li>`).join("");
  sugEl.hidden = !sugList.length;
  codeIn.setAttribute("aria-expanded", String(!!sugList.length));
  codeIn.removeAttribute("aria-activedescendant");
  sugFit();
}
/* the list must fit what the VISUAL viewport leaves (keyboard up): vh / vw units stay the large viewport on Android Chrome, so
   a CSS cap alone let it run past the top and over the field. Phones only; --sug-max feeds app.css .code-sug max-height. */
function sugFit() {
  const vv = window.visualViewport;
  if (sugEl.hidden || !vv || !dockMQ.matches) { root.style.removeProperty("--sug-max"); return; }
  const e = $("#entry").getBoundingClientRect(), gap = 16;
  const above = root.classList.contains("dock-bottom") && !root.classList.contains("start");
  const coding = root.classList.contains("coding");   // search mode hides the top bar + HUD: the list may rise to the top of the visual viewport
  const top = Math.max(vv.offsetTop, above && !coding ? ($(".top")?.getBoundingClientRect().bottom || 0) : 0);
  const room = above ? e.top - top - (coding ? 8 : gap) : vv.offsetTop + vv.height - e.bottom - gap;
  const cap = Math.floor(vv.height * (coding ? 1 : above ? 0.5 : 0.6));    // never more than about half the visible area: the question stays in sight above it (search mode hides it, so the list takes all the room)
  root.style.setProperty("--sug-max", Math.max(96, Math.min(cap, Math.floor(room))) + "px");
}
if (window.visualViewport) for (const ev of ["resize", "scroll"]) window.visualViewport.addEventListener(ev, () => sugFit());
addEventListener("resize", () => sugFit());
function sugHide() {
  root.style.removeProperty("--sug-max");
  sugList = []; sugAt = -1; sugEl.hidden = true; sugEl.innerHTML = "";
  codeIn.setAttribute("aria-expanded", "false"); codeIn.removeAttribute("aria-activedescendant");
}
function sugMark(i) {
  sugAt = i;
  [...sugEl.children].forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
  if (i < 0) { codeIn.removeAttribute("aria-activedescendant"); return; }
  codeIn.setAttribute("aria-activedescendant", "sug" + i);
  sugEl.children[i].scrollIntoView({ block: "nearest" });
}
function sugPick(code) { codeIn.value = code; syncCode(); sugHide(); $("#entry").requestSubmit(); }
codeIn.addEventListener("keydown", e => {
  if (e.isComposing) return;
  if (e.key === "Escape" && !sugEl.hidden) { e.preventDefault(); sugHide(); return; }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sugList.length) {
    e.preventDefault();
    const n = sugList.length, d = e.key === "ArrowDown" ? 1 : -1;
    sugMark(sugAt < 0 ? (d > 0 ? 0 : n - 1) : sugAt + d >= n || sugAt + d < 0 ? -1 : sugAt + d);   // past either end: back to the typed text
    return;
  }
  if (e.key === "Enter" && sugAt >= 0) { e.preventDefault(); sugPick(sugList[sugAt]); }
});
sugEl.addEventListener("pointerdown", e => e.preventDefault());   // keep the focus (and the phone keyboard) in the box
sugEl.addEventListener("click", e => { const li = e.target.closest("li[data-code]"); if (li) sugPick(li.dataset.code); });
codeIn.addEventListener("blur", () => { sugHide(); codingOff(); });
/* search mode (phones; Tony, Oct 17): while the code field has focus the page behind it (question, choices, pad, FAB) is visibility:hidden
   (app.css html.coding), so the list never sits on a peeking card. visibility keeps the layout, so nothing jumps; scrollY is restored on exit. */
let codingY = null;
function codingOn() {
  if (!dockMQ.matches || sideMQ.matches || root.classList.contains("start") || root.classList.contains("coding")) return;   // phones only: a touch tablet (iPad: pointer coarse, side by side) keeps its page
  if (root.classList.contains("ql-open")) return;   // the question list is open: it stays up with the keyboard (it hid #qlist; nav.js fit sizes it to the visual viewport)
  codingY = scrollY; root.classList.add("coding"); sugFit();
}
function codingOff() {
  if (!root.classList.contains("coding")) return;
  root.classList.remove("coding");
  if (codingY !== null && Math.abs(scrollY - codingY) > 1) scrollTo(0, codingY);
  codingY = null;
}
codeIn.addEventListener("focus", codingOn);
addEventListener("resize", () => { if (!dockMQ.matches || sideMQ.matches) codingOff(); });
/* a whole problem code pasted into any other field lands in the code box instead (not opened: the user presses the arrow) */
document.addEventListener("paste", e => {
  const t = e.target;
  if (t === codeIn || !(t instanceof HTMLElement) || !t.matches("input:not([type=file]), textarea")) return;
  const n = normalize((e.clipboardData && e.clipboardData.getData("text")) || "", knownPrefixes());   // a custom prefix only when known: "max_val" stays text
  if (!n) return;
  e.preventDefault();
  putCode(n.code); entryMsg(""); root.classList.add("entry-open"); codeIn.focus();   // a resting box (C2 / C7 / C8) comes out for it
});
codePaste.addEventListener("click", async () => {
  let n = null;
  try { n = normalize(await navigator.clipboard.readText(), codes.ANY); } catch { /* plain http or denied: paste by hand */ }
  if (!n) { codeIn.focus(); return; }
  putCode(n.code); entryMsg(""); codeGo.focus();
});
$("#entry").addEventListener("submit", e => {
  e.preventDefault();
  sugHide();
  const mp = modePrefix(codeIn.value);                                    // DIET_<code> = the original questions, SUGAR_<code> = saccharine (design/EASY.md)
  if (mp) { setMode(mp.mode); codeIn.value = mp.rest; modeFlip = true; }
  const n = entry(codeIn.value);   // a bare suffix ("p2x") opens BANK_P2X
  if (!n) { entryMsg("Whoops, that's not a valid code! Try CALC1_T6B instead."); codeIn.focus(); return; }
  codeIn.blur();
  const done = n.prefix === "BANK" ? openBank(n.code) : load(n.code);
  if (mp) done.then(() => { modeFlip = false; say(mp.mode === "diet" ? "Originals are on." : "Easy mode is on."); });
});
let modeFlip = false;   // the mode just changed: reopen even what is already open (its view differs)
window.stemBrainrotWanted = () => modeOf() === "sugar" && !!S && !!S.prob.wish;   // brainrot.js: sugar questions with a layer only
window.stemBrainrotWarm = () => modeOf() === "sugar" && (S ? !!S.prob.wish : !location.hash.slice(1));   // brainrot.js: may buffer off screen (start page, or a question with a layer)
window.stemHidden = c => { const o = window.stemOffline; return !!(o && o.has(c) && modeHidden(o.get(c), modeOf())); };   // nav.js: uploads
/* upload = offline.js reads ONE problems.json (every problem in it) into memory; that store also answers fetch("p/<CODE>.json").
   After a file is loaded: open the code already typed if the file has it, else the file's first problem. */
$("#upload").addEventListener("click", async () => {
  const off = window.stemOffline;
  if (!off || !off.pickFile) { entryMsg("Uh-oh! Files won't open here, sorry!"); return; }
  const r = await off.pickFile();
  if (r && r.error) entryMsg(r.error, r.tone);
});
addEventListener("DOMContentLoaded", () => {
  /* offline.js loads after this module; take over its "file loaded" event */
  if (window.stemOffline) window.stemOffline.onProblemLoaded(async p => {
    const typed = normalize(codeIn.value, codes.ANY), off = window.stemOffline;
    leaveBank();                                                     // an upload is the live list now
    await load(typed && off.has(typed.code) ? typed.code : p.code);
    /* load() clears the line when it succeeds, so the upload's own line (offline.js report) is written after it, and only once */
    const r = off.report; off.report = null;
    if (r && r.text && !$("#entryMsg").textContent) entryMsg(r.text, r.tone);   // a clean upload has no text: nothing extra (Q11 = b)
  });
});

const retryLoad = $("#retryLoad");
/* ================= practice banks (design/BANK.md) =================
   BANK_XXX = a file on the server (banks/BANK_XXX.json). The server keeps the answers, this browser's progress (marks) and
   where it was in each bank (at). localStorage "stem-src" = the live list: a bank code, or "file" for an uploaded file. */
let bank = null;                         // { code, codes, get: Map code -> public problem, marks }
const src = v => { try { if (v === undefined) return localStorage.getItem("stem-src"); localStorage.setItem("stem-src", v); } catch { /* blocked */ } return null; };
window.stemBank = {
  get code() { return bank && bank.code; },
  get front() { return (bank && bank.front) || ""; },                 // the front bank's bar title (serve.py FRONT sends it), else ""
  codes: () => bank ? bank.codes.slice() : [],
  get: c => bank && bank.get.get(c),
  mark: c => (bank && bank.marks[c]) || null
};
const bankChanged = () => dispatchEvent(new CustomEvent("drill:bank"));
/* an old bank's banner (SCHEMA.md Version table: "BANK_X must be updated by 2026-11-05") at the top of the question list */
addEventListener("drill:bank", () => {
  const panel = $("#qlist"), text = bank ? bank.banner : "";
  let el = panel && panel.querySelector(".bank-banner");
  if (!panel || !text) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("p"); el.className = codes.BANNER_CLASS; el.setAttribute("role", "status"); panel.prepend(el); }
  el.textContent = text;
});
/* a re-showing (design/plans/QUEUE.md, D60/D61; replaces "Redo my misses", D50): the queue (nav.js) brings a question back (a
   Redeem when it owes a miss), graded fresh in its own server namespace (serve.py grade() round) and kept in its own done record (offline.js "r:"); the
   real history and marks stay as they were. One showing at a time, per bank; localStorage, so a reload stays in it. UI: the retry tag (retryTag) + the list's faded marks (nav.js). */
const REDO = "stem-redo";
window.stemRedo = {
  get() {
    let r = null;
    try { r = JSON.parse(localStorage.getItem(REDO)); } catch { /* blocked or broken */ }
    return r && bank && r.bank === bank.code && Array.isArray(r.codes) && Number.isInteger(r.n) ? r : null;
  },
  has(code) { const r = this.get(); return !!r && r.codes.includes(code); },
  set(code, n, redeem = true) {                                          // nav.js, before it opens code; redeem = it owes a miss
    if (!bank) return;
    try { localStorage.setItem(REDO, JSON.stringify({ bank: bank.code, n, codes: [code], redeem: !!redeem })); } catch { return; }
    /* T41: drop the "r:" record only when it is an older showing's. Prev / Next back to this showing (a step through an r = 0 item
       cleared the redo key on the way) keeps its own round's work; saveDone tags the record with its round */
    const st = doneStore(), rec = st && st.doneGet(code);
    if (rec && rec.round !== n) st.doneDrop(code);
  },
  clear() { try { localStorage.removeItem(REDO); } catch { /* blocked */ } }
};
function leaveBank() { src("file"); if (bank) { bank = null; bankChanged(); } }
/* code: BANK_XXX, or "last" (the server's pointer for this browser). go: open a question (at, else the first).
   quiet (boot): no message, no retry; a bank that is gone just leaves the page as it is. */
async function openBank(code, o) {
  const f = !modeFlip && forceSugarOnce(code);                            // FORCE_SUGAR_ONCE (mode.mjs): the open view is the old mode's
  if (f) modeFlip = true;
  try { return await openBankIn(code, o); } finally { if (f) modeFlip = false; }
}
async function openBankIn(code, { go = true, quiet = false } = {}) {
  retryLoad.hidden = true;
  let b = null, r = null;
  const t0 = Date.now(), path = `/b/${code}.json`, tp = traceparent();
  try {
    r = await net(`b/${code}.json`, { headers: { traceparent: tp } });
    if (r.ok) b = await r.json(); else r.text().catch(() => {});
    if (r.status >= 500) throw r;                                         // the server broke: a failure with a code, not "not found"
  } catch (e) {
    const inc = reqInc("bank", path, t0, e === r ? { r, tp } : r ? { e, phase: "parse", tp } : { e, tp });
    if (!quiet) {
      entryMsg(timedOut(e) ? "Loading timed out, that's on me (╥﹏╥)" : "Failed to load.", "bad", inc);   // the kaomoji: Tony #36 [[sad kaomoji]], OK'd Oct 26
      retryLoad.hidden = false; retryLoad.onclick = () => openBank(code, { go });
    }
    return false;
  }
  const nb = codes.bankNotice(b);
  if (nb.dropped) { if (!quiet) entryMsg(nb.dropped, "warn"); return false; }   // past its sunset (SCHEMA.md Version table): the message, not "not found"
  if (!b || !b.problems.length) { if (!quiet) entryMsg("QUACKK, code not found."); return false; }
  bank = { code: b.code, codes: b.problems.map(p => p.code), get: new Map(b.problems.map(p => [p.code, p])), marks: b.marks || {}, burstGap: b.burst_gap_s, banner: nb.banner, front: b.front || "" };
  src(b.code);
  remembered(b.code);
  bankChanged();
  if (!go) return true;
  const to = bank.codes.includes(b.at) ? b.at : (window.stemOrder ? window.stemOrder(bank.codes) : bank.codes)[0];   // resume where you were, else the queue's pick (nav.js)
  if (S && S.code === to && !modeFlip) { putCode(""); entryMsg(""); } else await load(to);
  return true;
}
/* ================= problem state ================= */
let busy = false;    // a grading request is out (MC and typed answers)
let S = null;        // { code, prob, start, tries, hints, triesLeft, finished, selected, box }
/* one problem source: the open bank already holds every question (the same public view the server sends), so it answers at
   once; p/CODE.json still goes out in the background (the server's resume pointer for this browser). Else the network
   (offline.js answers it for an uploaded file). design/NAV.md */
async function getProblem(code) {
  const p = !modeFlip && bank && bank.get.get(code);                      // a mode flip: the bank in memory is the old mode's view
  if (p) { net(`p/${code}.json`, { headers: { traceparent: traceparent() } }).then(r => r.text()).catch(() => {}); return structuredClone(p); }   // a copy, like a fresh fetch
  const t0 = Date.now(), path = `/p/${code}.json`, tp = traceparent();
  let r;
  try { r = await net(`p/${code}.json`, { headers: { traceparent: tp } }); if (r.ok) return await r.json(); }
  catch (e) { e.inc = reqInc("problem", path, t0, r ? { e, phase: "parse", q: code, tp } : { e, q: code, tp }); throw e; }
  r.text().catch(() => {});   // drain the 404 body so the request completes
  const e = new Error("not found"); e.status = r.status;
  if (r.status !== 404) e.inc = reqInc("problem", path, t0, { r, q: code, tp });
  throw e;
}
/* a 404 on a code: a custom prefix this device has never seen names its bank ("BEAR_QAA needs BANK_BEAR", a shared link on a
   fresh device); a prefix it knows (a bank with it is open or uploaded) or a built-in one is a typo: "not found" */
const deadCode = code => {
  const pre = codes.prefixOf(code);
  return codes.isCustomPrefix(pre) && !knownPrefixes().has(pre) ? codes.needsBank(code) : "QUACKK, code not found.";
};
async function load(code) {
  if (!codes.isCode(code)) { note(`Quack, can't open ${code}.`); return; }   // T16: said, not silent
  let prob;
  retryLoad.hidden = true;
  const f = !modeFlip && forceSugarOnce(code);                            // a question of a forced bank, opened directly
  if (f) modeFlip = true;
  try {
    try { prob = await getProblem(code); } finally { if (f) modeFlip = false; }
    if (window.stemOffline && window.stemOffline.has(code)) {             // an upload: the server's mode rules, applied here
      if (modeHidden(prob, modeOf())) { entryMsg(`Can't open ${code} here.`); return; }
      prob = modeView(prob, modeOf());
    }
  }
  catch (e) {
    entryMsg(e.status === 404 ? deadCode(code) : timedOut(e) ? "Loading timed out, that's on me (╥﹏╥)" : "Failed to load.", "bad", e.status === 404 ? null : e.inc);   // the kaomoji: Tony #36 [[sad kaomoji]], OK'd Oct 26
    if (e.status !== 404) { retryLoad.hidden = false; retryLoad.onclick = () => load(code); }
    return;
  }
  entryMsg("");
  putCode(""); codeIn.placeholder = code;   // the open problem's code is the placeholder
  remembered(code);
  if (location.hash !== "#" + code) history.replaceState(null, "", "#" + code);
  if (!S || S.code !== code) barOpen(false);                        // another problem opened: the bar goes back to its strip
  if (!S || S.code !== code) wishReset();                                  // a new question: Cluck's wish stops
  S = { code, prob, start: Date.now(), tries: [], hints: [], triesLeft: maxTries(prob), finished: false, selected: null, box: null };
  qSeen(code);                                                             // B7: the first questions this session get Cluck's prefetch
  root.classList.remove("start");   // leave the start page now: html.start hides main, so figures drawn under it measure 0 wide
  const rec =doneStore() ? doneStore().doneGet(code) : null;
  if (rec && off()) seedLocal(code, rec, prob);
  render();
  window.stemT?.("q_open", { code, bank: bank ? bank.code : null, type: prob.type, mode: modeOf() });   // telemetry (design/plans/TELEMETRY.md)
  if (rec) paint(rec);
  if (!off()) syncServer(S);
  retryTag();
  dispatchEvent(new CustomEvent("drill:problem", { detail: { code } }));   // nav.js (design/NAV.md)
  if (S.finished && !$("#q .nx")) { painting = true; try { cueNext(); } finally { painting = false; } }   // first load: the list came on after paint(), so a restored closed question gets its still Next now (T17b-1)
  $("#codeChipTx").textContent = code; root.classList.remove("entry-open");    // C7: the box rests as a label again
  rwSync();
  rwRedoTip();
  origRender();
  padRule();
  window.stemBrainrot?.sync();
}

function render() {
  const { prob, code } = S;
  document.title = code;
  $("#freeze").hidden = false; $("#work").hidden = false;
  $("#freeze").classList.remove("open");
  $("#pcode").textContent = code;
  const blocks = $("#blocks"); blocks.innerHTML = "";
  /* the card's bold lead is the question's title, the one the list shows ("Practice Exam 2, Question 13"), not the tip (owner, Oct 6:
     the tip read as a give-away). Sugar only, like the tip was; prob.tip stays on the problem, unshown */
  const lead = modeOf() === "sugar" && typeof prob.title === "string" ? prob.title.trim().replace(/\s+/g, " ") : "";
  if (lead) { const t = document.createElement("p"); t.className = "ptitle"; t.textContent = lead; blocks.append(t); }
  const C = snackChg();
  if (C?.pairs.length) {
    const c = document.createElement("p"); c.className = "chg-chip";
    c.textContent = "Changed: " + C.pairs.map(x => `${x.from} → ${x.to}${x.unit ? (x.unit === "°" ? "" : " ") + x.unit : ""}`).join(" · ");
    blocks.append(c);
  }
  for (const [i, b] of prob.body.entries()) {
    if (b.type === "text") { const d = document.createElement("div"); d.className = "md"; d.innerHTML = md(C ? C.snack[i] : b.md); blocks.append(d); }
    else if (b.type === "graph") {
      const f = document.createElement("div"); f.className = "fig"; f.setAttribute("role", "img"); f.setAttribute("aria-label", b.alt || "figure");
      f._block = b; blocks.append(f);
    }
  }
  drawFigures();
  renderQuestion();
  $("#fb").innerHTML = "";
  mountBox();
  $("#freezeIn").scrollTop = 0;
  scrollTo({ top: 0 });
  $("#pstripCode").textContent = code;
  lastEdit = null; padPeekText();
  clGone = false;                                                                 // a new question starts side by side again: the dismiss is for this question's column (DISMISS.md)
  applyMT();
  layoutFreeze();
}
/* a snack in sugar: what it changed from its original (chg.mjs), once per problem; else null */
function snackChg() {
  const p = S && S.prob, o = p && p.original;
  if (modeOf() !== "sugar" || !p.snack || !o || !Array.isArray(o.body)) return null;
  return p._chg ??= changes(p.body, o.body);
}
function drawFigures() {
  document.querySelectorAll("#blocks .fig").forEach(f => { try { Graph.render(f, f._block); } catch (e) { console.error(e); f.textContent = f._block.alt || ""; f.classList.add("fig-off"); } });
}

/* ---------- MC: one arrow, flush inside the selected choice ---------- */
const LETTERS = "ABCDE";
function renderQuestion() {
  const q = $("#q"), p = S.prob;
  q.classList.remove("closed");
  $("#freezeIn").classList.toggle("boxed", p.type === "multi");      // multi: question + boxes in one box (Tony's sketch)
  if (p.type === "mc") {
    const list = off() && p.shuffle !== false ? shuffled(shown(p), localSeed() + ":" + p.code) : shown(p);   // server problems arrive shuffled
    const many = all(p);       // pick all: square check badge + the letter beside it, one Check button under the list (CHOOSE-ALL.md §4)
    q.innerHTML = `${howLine(p)}<div class="choices${many ? " all" : ""}" ${many ? (howLine(p) ? 'role="group" aria-labelledby="how"' : 'role="group" aria-label="Choices"') : 'role="radiogroup" aria-label="Choices"'}>${list.map((c, i) => `
      <div class="ch" data-id="${esc(c.id)}">
        <button type="button" class="opt" role="${many ? "checkbox" : "radio"}" aria-checked="false" tabindex="${i ? -1 : 0}" data-id="${esc(c.id)}" data-l="${LETTERS[i]}"${c.lock ? " data-lock" : ""}>
          ${many ? `<span class="badge" aria-hidden="true">${icon("i-ok")}</span><span class="lt" aria-hidden="true">${LETTERS[i]}</span>`
            : `<span class="badge" aria-hidden="true">${LETTERS[i]}</span>`}<span class="txt">${md(c.md, true, true)}</span>
        </button>
        ${many ? "" : `<button type="button" class="btn btn-go send" aria-label="Check ${LETTERS[i]}" hidden>${icon("i-go")}</button>`}
        ${p.fix && many && !c.lock ? `<p class="fix-how" id="fh${i}" hidden>${esc(p.fix.how || "Enter your answers here...")}</p><div class="ff fix" hidden><input class="ans" type="text" aria-label="Right answer for ${LETTERS[i]}" ${INPUT_ATTRS}
          data-how="${esc(p.fix.how || "Enter your answers here...")}" placeholder="${esc(p.fix.how || "Enter your answers here...")}"></div>` : ""}
      </div>`).join("")}</div>${many ? `<div class="chk"><button type="button" class="btn btn-go send" id="mcGo" aria-label="Check" disabled>${icon("i-go")}</button></div>` : ""}`;
    q.querySelectorAll(".opt").forEach(o => o.setAttribute("aria-label", `${o.dataset.l}: ${o.querySelector(".txt").textContent.trim()}`));
    wireMC(q);
    if (all(p)) syncTicks();                                               // nothing ticked can already be checked (prove mode: not yet)
    fitChoices();
  } else if (p.type === "multi") {
    /* one row per part: "a)", its sub-question (if it has one), its own box with its own arrow inside (the freeform pattern).
       Each part is graded alone, with its own tries and lockout (SCHEMA.md "Grading"). */
    q.innerHTML = `${howLine(p)}<div class="mparts" id="ff" role="group" aria-label="Answers"${p.how ? ' aria-describedby="how"' : ""}>${p.parts.map((u, i) => {
      const l = esc(u.label || LETTERS[i].toLowerCase());
      return `<div class="part${u.prompt ? "" : " nopr"}" data-i="${i}"><span class="mk" id="mk${i}" aria-hidden="true">${l})</span>${u.prompt ? `<div class="pr md" id="pr${i}">${md(u.prompt)}</div>` : ""}
        <div class="ff"><input class="ans" type="text" aria-labelledby="mk${i}${u.prompt ? ` pr${i}` : ""}" ${INPUT_ATTRS}>
          <button type="button" class="btn btn-go send" id="go${i}" aria-label="Check ${l}" hidden>${icon("i-go")}</button></div>
        <div class="phint" id="ph${i}" aria-live="polite"></div></div>`;
    }).join("")}</div>`;
    wireParts();
  } else if (p.type === "proof") {
    /* W107 (Tony approved, Oct 27): one tall box for the whole proof, Check in its corner (the Next slot, T17b-1); the 3 rubric chips
       (base | assume | prove) under it after a Check; the reference proof in #preview once a sugar lockout reveals it */
    q.innerHTML = `${howLine(p)}<div class="ff proof" id="ff">
        <textarea id="ans" class="ans" rows="8" maxlength="${PROOF_MAX}" aria-label="Your proof"${p.how ? ' aria-describedby="how"' : ""} ${INPUT_ATTRS.replace(' enterkeyhint="send"', "")}
          placeholder="Base case: ...&#10;Assume: ...&#10;Prove: ..."></textarea>
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Check proof" disabled>${icon("i-go")}</button>
      </div><div class="rubric" id="rubric" aria-live="polite" hidden></div><div class="preview proofref" id="preview" aria-hidden="true"></div>`;
    wireProof();
  } else {
    const v = p.var || "x";
    const lead = p.type === "expr" ? `<span class="lead" aria-hidden="true">${renderMath(`f(${v}) =`, false)}</span>` : "";
    const ph = p.type === "expr" ? "Use " + v + " in your answer" : p.type === "num" ? "Ex: 9/2, 5e-4, sqrt(3), dne" : "";
    q.innerHTML = `${howLine(p)}<div class="ff" id="ff">${lead}
        <input id="ans" class="ans" type="text" aria-label="${p.type === "expr" ? `Answer: f(${v})` : "Answer"}"${p.how ? ' aria-describedby="how"' : ""}
          ${INPUT_ATTRS} placeholder="${ph}">
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Check answer" disabled>${icon("i-go")}</button>
      </div><div class="preview" id="preview" aria-hidden="true"></div>`;
    wireFF();
  }
  formulaCard();
}
/* sugar: Key formulas (Tony, Oct 5, design/mockups/formula-use.html ?v=7): the question's formula-sheet rows (saccharine.part) in the order
   they get used, centred, a thin arrow between, under a "Key formulas" label notched into the box's border. Under the answer, before the hint */
const FC_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* The thinking ladder (SCHEMA.md "Formula ladder", Tony Oct 21): with p.ladder the card starts as the big pieces only (the part rows); S.lad pieces are out,
   in order: the mid pieces (each pops inside its row), then the chain arrows. window.stemLadder.step() shows the next one (Jev's hit, lane 4) */
const ladderSteps = p => {
  const ld = p.ladder, ids = (p.formulas || []).map(f => f.id);
  if (!ld) return [];
  return [...(ld.mid || []).filter(m => ids.includes(m.of)).map((m, i) => ({ k: "mid", i, ...m })),
    ...(ld.arrows || []).filter(a => ids.indexOf(a.to) > 0 && ids[ids.indexOf(a.to) - 1] === a.from).map(a => ({ k: "arrow", ...a }))];
};
function ladderStep() {
  const sec = $("#fcard"), steps = S && sec ? ladderSteps(S.prob) : [];
  if (!steps.length || (S.lad ||= 0) >= steps.length) return false;
  const st = steps[S.lad++], el = sec.querySelector(st.k === "mid" ? `[data-mid="${st.i}"]` : `.to[data-to="${st.to}"]`);
  sec.querySelectorAll(".f.mid.cur").forEach(m => midOpen(m, false));                 // the last piece's notes fold to its "why?"
  if (el) { el.hidden = false; el.classList.add("lad-in"); if (st.k === "mid") midOpen(el, true); }
  const sr = $("#sr"); if (sr) sr.textContent = st.k === "mid" ? `A step was added to the key formulas${st.use || st.why ? ", with a note" : ""}.` : "A link was added between key formulas.";
  return true;
}
window.stemLadder = { step: ladderStep, left: () => S && $("#fcard") ? ladderSteps(S.prob).length - (S.lad || 0) : 0 };
/* "?" next to a formula (Tony, Oct 21): a static popup built from the sheet row's doc (what it is for, each symbol = meaning + unit, when to use it, one tiny example), like code docs. No AI.
   A mid piece's use/why (Oct 23) ride inside its piece's <li>, so they show when the piece pops */
const docText = t => esc(t).replace(/([A-Za-zΔα-ω])_([A-Za-z0-9,]+)/g, "$1<sub>$2</sub>");
/* Notes, light (Oct 23, brain ladder-ui-2026-10-23/RESEARCH.md): only the newest piece (.cur) shows them; an older one folds them behind an inline "why?"
   that opens them in place (no hover bubble: touch + WCAG 1.4.13). Quiet "Use it for"/"Why this" run-in labels; the text is as authored */
const midNotes = (m, cur) => m.use || m.why ? `<button type="button" class="fh-more" aria-expanded="false" aria-controls="fh-${m.i}"${cur ? " hidden" : ""}>why?</button>`
  + `<span class="fhs" id="fh-${m.i}"${cur ? "" : " hidden"}>${[["use", "Use it for"], ["why", "Why this"]].map(([k, b]) => m[k] ? `<span class="fh fh-${k}"><b>${b}</b> ${docText(m[k])}</span>` : "").join("")}</span>` : "";
function midOpen(li, cur) {                                                       // cur: the newest piece, notes open and no toggle; else folded
  li.classList.toggle("cur", cur);
  const b = li.querySelector(".fh-more"), n = li.querySelector(".fhs"); if (!b) return;
  b.hidden = cur; b.setAttribute("aria-expanded", "false"); n.hidden = !cur;
}
/* the "?" popover (Tony, Oct 23): popover.js, variant "doc" (design/POPOVER.md). Built on open, removed on close. The row's formula again (same KaTeX,
   same size, centred under the row's formula), the purpose as its bold title, then the muted body: symbols + units, when, example */
/* a row's picture (formula-figs.js, design/FORMULA-FIGS.md; Tony, Oct 26): under the formula, drawn by graph.js once the popover is in the page */
function docHTML(d, tex, fig) {
  const sym = (d.sym || []).map(y => `<li><span class="fd-s">${renderMath(y.s, false)}</span><span class="fd-m">${esc(y.m || "")}</span>${y.u ? `<span class="fd-u">${esc(y.u)}</span>` : ""}</li>`).join("");
  return `<div class="pop-h">${renderMath(tex, false)}</div>${fig ? `<div class="pop-fig fig fd-fig" role="img" aria-label="${esc(fig.alt)}"></div>` : ""}${d.purpose ? `<p class="pop-t fd-p">${docText(d.purpose)}</p>` : ""}<ul class="fd-sym">${sym}</ul>`
    + (d.when ? `<p class="fd-w"><b>Use it</b> ${esc(d.when)}</p>` : "") + (d.ex ? `<p class="fd-x"><b>Example</b> ${docText(d.ex)}</p>` : "");
}
/* at most FIG_H tall, so the popover stays a glance: a taller scene is redrawn narrower and centred (graph.js's own phone rule, tighter) */
const FIG_H = 168;
function drawDocFig(g, fig) {
  Graph.render(g, fig);
  for (let i = 0; i < 2; i++) {                                                   // a widened popover (a long formula) can make it much taller: two tries
    const W = g.clientWidth, H = g.offsetHeight;
    if (!(H > FIG_H + 1 && W > 160)) return;
    g.style.width = Math.max(160, Math.floor(W * FIG_H / H)) + "px";
    Graph.render(g, fig); g.style.marginInline = "auto";
  }
}
function formulaCard() {
  if (window.Pop && Pop.anchor()?.closest("#fcard")) Pop.close();
  $("#fcard")?.remove();
  const fs = S && S.prob.formulas;
  if (!fs || !fs.length || modeOf() !== "sugar") return;
  const steps = ladderSteps(S.prob), out = st => (S.lad || 0) > steps.indexOf(st), cur = steps[(S.lad || 0) - 1];
  const sec = document.createElement("section");
  sec.id = "fcard"; sec.className = "fcard"; sec.setAttribute("role", "note");
  sec.setAttribute("aria-label", fs.length > 1 ? "Key formulas, in order" : "Key formulas");
  sec.innerHTML = `<span class="fc-notch" aria-hidden="true">${icon("i-bulb")}Key formulas</span><ol>${fs.map((f, i) => {
    const arrow = steps.find(x => x.k === "arrow" && x.to === f.id);
    const q = f.doc ? `<button type="button" class="fq" data-i="${i}" aria-haspopup="dialog" aria-expanded="false" aria-label="What do the symbols in this formula mean?">?</button>` : "";
    return `${i ? `<li class="to" aria-hidden="true"${arrow ? ` data-to="${esc(f.id)}"${out(arrow) ? "" : " hidden"}` : ""}>${FC_ARROW}</li>` : ""}<li class="f"><span class="fm">${renderMath(f.tex, false)}</span>${q}</li>`
      + steps.filter(m => m.k === "mid" && m.of === f.id).map(m => `<li class="f mid${m === cur ? " cur" : ""}" data-mid="${m.i}"${out(m) ? "" : " hidden"}><span class="fm">${renderMath(m.tex, false)}</span>${midNotes(m, m === cur)}</li>`).join("");
  }).join("")}</ol>`;
  sec.addEventListener("click", e => {
    const w = e.target.closest(".fh-more");
    if (w) { const open = w.getAttribute("aria-expanded") !== "true"; w.setAttribute("aria-expanded", String(open)); sec.querySelector("#" + w.getAttribute("aria-controls")).hidden = !open; return; }
    const b = e.target.closest(".fq"); if (!b) return;
    const f = S.prob.formulas[b.dataset.i];
    Pop.toggle(b, { variant: "doc", label: "What this formula means", align: b.closest(".f").querySelector(".fm"), build: el => {
      const fig = window.FormulaFigs?.[f.id];
      el.innerHTML = docHTML(f.doc, f.tex, fig); el.classList.toggle("fd-has-fig", !!fig);   // a figure needs a fixed width to draw at
      /* a formula wider than the popover widens it, up to the viewport (past that .pop-h scrolls sideways): never cut short. Before the figure, so it draws at the final width */
      const hd = el.querySelector(".pop-h"), need = Math.ceil(hd.scrollWidth + el.offsetWidth - hd.clientWidth);
      if (need > el.offsetWidth) el.style.width = el.style.maxWidth = Math.min(need, innerWidth - 32) + "px";
      const g = fig && el.querySelector(".fd-fig");
      if (g) try { drawDocFig(g, fig); } catch (e) { console.error(e); g.textContent = fig.alt; g.classList.add("fig-off"); }
    } });
  });
  $("#q").after(sec);
}
const INPUT_ATTRS = 'inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"';
/* the problem's "how to type the answer" line, right above the answer box */
/* the default choose-all line is sugar only: diet shows the question as authored (Tony, Oct 3).
   It shows on the first choose-all question of the visit only (clutter C6, Tony Oct 5); an authored how always shows */
let howAt = null;
const howLine = p => {
  let h = p.how;
  if (!h && all(p) && modeOf() === "sugar" && (howAt ??= p.code) === p.code) h = "Tick all true options.";
  return h ? `<p class="how" id="how">${md(h, true)}</p>` : "";
};
const off = () => window.stemOffline && window.stemOffline.has(S.code);
/* shuffle for problems from an uploaded file (the server shuffles its own): seeded by a random id kept in this browser */
const localSeed = () => seed("stem-seed", "stem");
/* 5 choices shown. The server already cut them (serve.py public()); an uploaded file may have up to 8:
   same rule here: the right one, locked ones, then the rest, in authored order */
function shown(p) {
  const ch = p.choices;
  if (ch.length <= 5) return ch;
  const keep = ch.filter(c => [].concat(p.correct).includes(c.id) || c.lock);   // pick all: correct is a list, keep every one
  keep.push(...ch.filter(c => !keep.includes(c)).slice(0, Math.max(0, 5 - keep.length)));
  return ch.filter(c => keep.includes(c));
}
/* One row of pills for 2 choices, or 3 short ones. Decided by measuring, not by guessing lengths: lay the row out, then for each
   pill in turn give it the selected look (its 56px arrow room) and check nothing wraps, clips or overflows the row.
   Any pill failing means today's stacked list. Re-run when the width changes and when fonts arrive (the answer depends on both). */
function fitChoices() {
  const g = document.querySelector("#q .choices");
  if (!g || !S || S.prob.type !== "mc") return;
  if (!g.offsetWidth || g.offsetWidth < 120) return;             // laid out at (near) zero width (Swap hides it): keep the last answer
  const was = g.classList.contains("inline");
  let fits = !g.classList.contains("all") && g.children.length >= 2 && g.children.length <= 3;   // pick all: never one row
  if (fits) {
    g.classList.add("inline");
    for (const c of g.children) {
      c.classList.add("probe");
      const o = c.querySelector(".opt"), t = o.querySelector(".txt");
      if (g.scrollWidth > g.clientWidth + 0.5 || o.scrollWidth > o.clientWidth + 0.5 || t.scrollWidth > t.clientWidth + 0.5) fits = false;
      c.classList.remove("probe");
      if (!fits) break;
    }
  }
  g.classList.toggle("inline", fits);
  fitMath(g);
  g.querySelectorAll(".fix").forEach(fitFix);
  if (fits !== was) layoutFreeze();
}
/* inline math wider than its row (KaTeX can't wrap a fraction or a root): shrink it to fit, down to 85%; still too wide -> it
   scrolls sideways on its own (.kx-scroll), never clipped and never wider than the card. Re-run from scratch on every resize. */
const MATH_MIN = 0.85;
function fitMath(root) {
  for (const k of root.querySelectorAll(".opt .txt .katex")) {
    const u = k.closest(".mx") || k, box = k.closest(".txt");
    k.style.fontSize = ""; u.classList.remove("kx-scroll");
    const span = () => { const a = u.getBoundingClientRect(), b = k.getBoundingClientRect(); return Math.max(a.right, b.right) - Math.min(a.left, b.left); };   // a root sign can overhang its span
    const avail = box.clientWidth, w = span();
    if (!avail || w <= avail + 0.5) continue;
    const px = parseFloat(getComputedStyle(k).fontSize), f = Math.max(MATH_MIN, avail / w);
    k.style.fontSize = (px * f).toFixed(2) + "px";
    if (span() > avail + 0.5) u.classList.add("kx-scroll");
  }
}
function opts() { return [...document.querySelectorAll("#q .opt")]; }
/* a fix box's placeholder is the problem's fix.how. When it is wider than the box (it clipped: "Type increases or decr…" at 390px),
   the same words move to a wrapping line right above the box (linked by aria-describedby) and the placeholder goes empty */
let fixCtx = null;
function fitFix(f) {
  const inp = f && f.querySelector("input"), cap = f && f.previousElementSibling;
  if (!inp || f.hidden || !cap || !cap.classList.contains("fix-how")) return;
  const how = inp.dataset.how || "", w = inp.clientWidth;
  if (!w) return;
  const cs = getComputedStyle(inp);
  fixCtx = fixCtx || document.createElement("canvas").getContext("2d");
  fixCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const fits = fixCtx.measureText(how).width + ls * how.length <= w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
  inp.placeholder = fits ? how : "";
  cap.hidden = fits;
  if (fits) inp.removeAttribute("aria-describedby"); else inp.setAttribute("aria-describedby", cap.id);
}
function select(o) {
  S.selected = o ? o.dataset.id : null;
  for (const x of opts()) {
    const on = x === o;
    x.setAttribute("aria-checked", on);
    x.parentElement.querySelector(".send").hidden = !on;
  }
  placeToast();   // a row of choices reflows when the arrow shows: the toast follows its struck choice, never lands on a live one
}
/* #q outlives every problem (only its innerHTML changes), so wire it ONCE: a listener per load stacked up and one tap
   ran select() twice (select, then "tap again = deselect"), leaving the choice with only its hover border. */
function wireMC(q) {
  if (q.dataset.mcWired) return;
  q.dataset.mcWired = "1";
  q.addEventListener("click", e => {
    if (!S || S.prob.type !== "mc") return;
    if (S.finished) return;
    const send = e.target.closest(".send");
    if (send) { submitMC(); return; }
    const o = e.target.closest(".opt"); if (!o || o.disabled) return;
    if (o.classList.contains("kept")) { keptTap(o); return; }
    if (all(S.prob)) tick(o, S.prob.fix && !o.hasAttribute("data-lock") && markOf(o) ? "x" : "on");   // prove: blank -> tick -> X -> blank
    else select(o.getAttribute("aria-checked") === "true" ? null : o);   // tap the selected choice again: deselect
    roving(o);
  });
  /* pick all: arrows only move focus, Space / A-E / 1-5 toggle, Enter = Check; prove mode: X or Backspace = mark wrong.
     A fix box: Enter goes to the next empty box, then Check. */
  q.addEventListener("input", e => { if (e.target.closest(".fix")) { e.target.parentElement.classList.remove("bad"); syncTicks(); } });
  q.addEventListener("keydown", e => {
    if (e.target.closest(".fix")) {
      if (e.key !== "Enter" || !S || S.finished) return;
      e.preventDefault();
      const n = [...q.querySelectorAll(".fix:not([hidden]) input")].find(x => !x.value.trim());
      if (n) n.focus(); else submitMC();
      return;
    }
    const o = e.target.closest(".opt"); if (!o || !S || S.finished) return;
    const many = all(S.prob), live = opts().filter(x => !x.disabled && !x.classList.contains("kept")), i = live.indexOf(o);
    const move = d => { const n = live[(i + d + live.length) % live.length]; roving(n); n.focus(); if (!many) select(n); };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (many || o.getAttribute("aria-checked") === "true") submitMC(); else select(o); }
    else if (e.key === " ") { e.preventDefault(); if (many) tick(o); else select(o.getAttribute("aria-checked") === "true" ? null : o); }
    else if (many && S.prob.fix && /^(x|Backspace)$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); tick(o, "x"); }
    else if (/^([a-e]|[1-5])$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {         // A-E or 1-5 jump to that choice
      const n = opts().find(x => x.dataset.l === (/\d/.test(e.key) ? LETTERS[+e.key - 1] : e.key.toUpperCase()));
      if (n && !n.disabled) { e.preventDefault(); roving(n); n.focus(); if (many) tick(n); else select(n); }
    }
  });
}
/* pick all: a row is "on" (ticked), "x" (prove mode: marked wrong, its fix box shows) or "" (blank).
   tick(o, m) sets m, or clears it when the row already has it. A locked choice ("None of these") is exclusive:
   ticking it clears the other ticks, ticking another clears it. Locked rows are never X'd. */
const ticked = () => opts().filter(x => x.getAttribute("aria-checked") === "true");
const markOf = o => o.getAttribute("aria-checked") === "true" ? "on" : o.dataset.mark === "x" ? "x" : "";
const fixOf = o => o.parentElement.querySelector(".fix");
function mark(o, m) {
  o.setAttribute("aria-checked", m === "on");
  if (m === "x") o.dataset.mark = "x"; else delete o.dataset.mark;
  if (!o.classList.contains("wrong")) o.querySelector(".badge").innerHTML = icon(m === "x" ? "i-x" : "i-ok");
  const f = fixOf(o); if (f) { f.hidden = m !== "x"; const h = f.previousElementSibling; if (h && h.classList.contains("fix-how")) h.hidden = true; fitFix(f); }
  o.setAttribute("aria-label", `${o.dataset.l}: ${o.querySelector(".txt").textContent.trim()}${m === "x" ? ", marked wrong" : ""}`);
}
function tick(o, m = "on") {
  if (o.classList.contains("kept")) { keptTap(o); return; }
  const lock = o.hasAttribute("data-lock");
  if (lock && opts().some(x => x.classList.contains("kept"))) return;   // "None of these" would untick the kept rows (the server calls it invalid anyway)
  if (m === "x" && (lock || !fixOf(o))) return;
  const next = markOf(o) === m ? "" : m;
  if (next === "x") window.stemT?.("_xmark", { choice: o.dataset.id });   // J6: the student's own X (not the lock path / strike); intent.js log only, telemetry.js drops "_" names
  for (const x of opts()) if (x !== o && next === "on" && (lock || x.hasAttribute("data-lock")) && markOf(x) === "on") mark(x, "");
  /* prove mode: "None of these" says every other row is false, so it X's them and opens their boxes (blank rows could never be
     sent: Check needs every row marked. Tony, Oct 3, PHYS_NPT). Struck rows keep their X already. */
  if (lock && next === "on" && S.prob.fix) for (const x of opts()) if (x !== o && !x.hasAttribute("data-lock") && !x.classList.contains("wrong") && fixOf(x) && markOf(x) !== "x") mark(x, "x");
  mark(o, next);
  syncTicks();
}
/* sugar kept rows (brain tick-lock proposal, look B, Tony Oct 20): after a pick-all miss whose ticks are ALL right (the server says so
   from the key: `kept` = the ticked ids, never an unticked one; gradeLocal mirrors it), those rows stay ticked in green and can't be
   unticked. aria-disabled (not disabled: still read and focusable); arrows skip them; a tap only toasts, once per question.
   Unticked right rows stay plain. Cleared by a new render (next question, redo); a reload keeps them again from the try record (k).
   Off: ?keep=0 (localStorage stem-keep=0; ?keep=1 clears it), like ?jev=0. Diet never: `kept` comes in sugar only */
const keepOff = (() => { try { const f = new URLSearchParams(location.search).get("keep"); if (f === "0") localStorage.setItem("stem-keep", "0"); if (f === "1") localStorage.removeItem("stem-keep"); return localStorage.getItem("stem-keep") === "0"; } catch { return false; } })();
const keepOn = () => modeOf() === "sugar" && !keepOff;
function keep(o) {
  if (!o || o.disabled) return;
  mark(o, "on");
  o.classList.add("kept"); o.setAttribute("aria-disabled", "true");
  o.setAttribute("aria-label", `${o.dataset.l}: ${o.querySelector(".txt").textContent.trim()}, right, kept`);
}
function keptTap(o) {
  window.stemT?.("_kepttap", { choice: o.dataset.id });   // intent.js log only, telemetry.js drops "_" names
  if (S.keptTold) return;
  S.keptTold = true;
  toast("That one's already correct!", o);
}
/* Check is live with 1+ ticks (empty is invalid: never sent); prove mode also needs every unlocked row ticked or X'd, every X with its fix */
function syncTicks() {
  S.selected = ticked().map(x => x.dataset.id);
  const proved = !S.prob.fix || opts().every(o => o.hasAttribute("data-lock") || markOf(o) === "on" || (markOf(o) === "x" && fixOf(o).querySelector("input").value.trim()));
  const go = $("#mcGo"); if (go) go.disabled = !proved || S.finished;      // nothing ticked = "none of them is true": a real answer
}
function strike(o) {                                        // a wrong choice: unticked, struck through, disabled (prove mode: X'd, its box live)
  if (!o) return;
  o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true");
  mark(o, fixOf(o) ? "x" : "");
  glyph(o, "i-x");
}
/* the verdict glyph (V1 thin light): pick-all's square badge is the glyph slot; a single-pick row keeps its letter and shows the glyph at its right end */
function glyph(o, id) {
  if (o.closest(".choices.all")) { o.querySelector(".badge").innerHTML = icon(id); return; }
  let g = o.querySelector(".vg");
  if (!g) { g = document.createElement("span"); g.className = "vg"; g.setAttribute("aria-hidden", "true"); o.append(g); }
  g.innerHTML = icon(id);
}
function roving(o) { for (const x of opts()) x.tabIndex = x === o ? 0 : -1; }
/* one-shot feedback on a choice (Tony, Oct 6 TK1): a wrong pick shakes once, a right one pulses. CSS only animates it (app.css
   .opt.jolt / .opt.pop), reduced motion keeps it still. Live picks only: a restored try never shakes */
function nudge(o, cls) {
  if (!o) return;
  o.classList.remove(cls); void o.offsetWidth;
  o.classList.add(cls);
  o.addEventListener("animationend", () => o.classList.remove(cls), { once: true });
}
async function submitMC() {
  if (all(S.prob)) return submitAll();
  const o = opts().find(x => x.dataset.id === S.selected); if (!o || S.finished || busy) return;
  const c = S.prob.choices.find(x => x.id === S.selected), mine = S;
  busy = true;
  let r;
  try { r = await check(S.code, { choice: c.id }); } finally { busy = false; }
  if (S !== mine) return;                                   // another problem opened meanwhile
  if (r.verdict === "timeout") { feedback(r); return; }     // not a try: the choice stays picked, retry resends it
  record({ a: c.md, c: c.id, l: o.dataset.l }, r);
  const send = o.parentElement.querySelector(".send");
  if (r.verdict === "correct") { o.classList.add("right"); glyph(o, "i-ok"); finish(); }   // no pop: Next is the one motion after Check (T17b-1)
  else if (r.verdict === "wrong") {
    o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true"); glyph(o, "i-x"); if (r.triesLeft > 0) nudge(o, "jolt");   // the closing pick: no shake
    select(null);
    const next = opts().find(x => !x.disabled); if (next) { roving(next); next.focus(); }
    if (r.triesLeft <= 0) finish(); else pips(r, ...pipsAt());
  } else if (r.verdict === "pending") { o.classList.add("pend"); send.hidden = true; }
  else if (r.verdict === "locked") finish();
  feedback(r);
}
/* pick all: send the ticked ids (prove mode: + fixes { id: text } for every X'd row). Wrong: the ticks and texts stay (the student
   edits the set); the struck row (if any) is unticked + disabled; a wrong fix turns its box red.
   Copy payload: a = the ticked choices' text, c / l = their ids / letters; prove mode: a = { tick, fix: { letter: text } } */
async function submitAll() {
  const on = ticked(), go = $("#mcGo"); if (!go || go.disabled || S.finished || busy) return;
  const mine = S, c = on.map(o => o.dataset.id), xs = S.prob.fix ? opts().filter(o => markOf(o) === "x" && fixOf(o)) : [];
  const f = Object.fromEntries(xs.map(o => [o.dataset.id, fixOf(o).querySelector("input").value.trim()]));
  busy = true;
  let r;
  try { r = await check(S.code, { choices: c, ...(S.prob.fix ? { fixes: f } : {}) }); } finally { busy = false; }
  if (S !== mine) return;
  if (r.verdict === "timeout") { feedback(r); return; }     // not a try: the ticks stay, retry resends them
  const tick = c.map(id => S.prob.choices.find(x => x.id === id).md);
  if (r.verdict !== "invalid") record({ a: S.prob.fix ? { tick, fix: Object.fromEntries(xs.map(o => [o.dataset.l, f[o.dataset.id]])) } : tick, c, l: on.map(o => o.dataset.l),
    ...(S.prob.fix ? { f } : {}), ...(r.struck ? { s: r.struck } : {}), ...(r.fixWrong ? { w: r.fixWrong } : {}), ...(r.kept ? { k: r.kept } : {}) }, r);
  if (r.verdict === "correct") {
    for (const o of on) { o.classList.remove("kept"); o.classList.add("right"); glyph(o, "i-ok"); }   // no pop: Next is the one motion (T17b-1); kept turns right in place
    for (const o of xs) fixOf(o).classList.add("ok", "done");
    finish();
  } else if (r.verdict === "wrong") {
    const o = r.struck && opts().find(x => x.dataset.id === r.struck), was = document.activeElement;
    const bad = r.fixWrong && opts().find(x => x.dataset.id === r.fixWrong); if (bad && fixOf(bad)) fixOf(bad).classList.add("bad");
    strike(o); if (r.triesLeft > 0) nudge(o, "jolt"); syncTicks();
    const kept = r.kept && keepOn() ? r.kept.map(id => opts().find(x => x.dataset.id === id)).filter(Boolean) : [];
    if (kept.length) {                                       // no pop: a miss is a wrong try. Focus goes to the first live empty row
      kept.forEach(keep); window.stemT?.("_kept", { n: kept.length });
      const n = opts().find(x => !x.disabled && !x.classList.contains("kept") && markOf(x) !== "on");
      if (n && r.triesLeft > 0 && (was === go || kept.includes(was))) { roving(n); n.focus(); }
    }
    if (o && fixOf(o) && was === go) fixOf(o).querySelector("input").focus();              // prove mode: the struck row needs its fix now
    else if (o && (was === o || (was === go && go.disabled))) { const n = opts().find(x => !x.disabled); if (n) { roving(n); n.focus(); } }
    else if (o && o.tabIndex === 0) { const n = opts().find(x => !x.disabled); if (n) roving(n); }
    if (r.triesLeft <= 0) finish(); else pips(r, ...pipsAt());
  } else if (r.verdict === "pending") for (const o of on) o.classList.add("pend");
  else if (r.verdict === "locked") finish();
  feedback(r, Object.values(f).join(", "));                 // invalid here = a fix that can't be read
}

/* ---------- freeform: the same arrow, flush inside the input ---------- */
function wireFF() {
  const ins = [...document.querySelectorAll("#q .ans")], go = $("#ansGo"), pv = $("#preview"), mathy = /^(num|expr)$/.test(S.prob.type);
  for (const inp of ins) {
    inp.addEventListener("input", () => {
      go.disabled = ins.some(x => !x.value.trim());
      const ff = $("#ff"); if (ff.classList.contains("bad")) { ff.classList.remove("bad"); vmark(ff, null); go.hidden = false; }
      if (!pv) return;
      pv.innerHTML = "";
      const t = inp.value.trim(); if (!t || !mathy || typeof math === "undefined") return;
      try { pv.innerHTML = /^dne$/i.test(t) ? "DNE" : renderMath(math.parse(t).toTex({ parenthesis: "auto", implicit: "hide" }), false); } catch { /* still typing */ }
      pvFit(pv);
    });
    /* Enter: next empty box first, submit when all are filled */
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const empty = ins.find(x => !x.value.trim());
      if (empty) empty.focus(); else submitFF();
    });
  }
  go.addEventListener("click", submitFF);
}
/* W91: the preview's room. One line is reserved (app.css); taller math ratchets it up (150 ms), it never shrinks while this question is open (the element is
   rebuilt per question), and past 3 lines the math scales down inside it: typing never moves the page more than the ratchet steps */
function pvFit(pv) {
  let w = pv.querySelector(":scope > .pvi");
  if (!w) { w = document.createElement("div"); w.className = "pvi"; w.append(...pv.childNodes); pv.append(w); }
  w.style.transform = "";
  const line = parseFloat(getComputedStyle(pv).minHeight) || 0, cap = 3 * line, nat = w.getBoundingClientRect().height;
  let need = nat;
  if (cap && nat > cap) { w.style.transform = `scale(${cap / nat})`; need = cap; }
  const room = pv._room || line;                             // unlocked, the box is the reserved line (its height: auto already grew with the new math)
  if (need <= room + 0.5) return;
  if (!pv._room) { pv.style.height = room + "px"; void pv.offsetHeight; }   // lock it at the line first, so the first step animates too
  pv._room = need; pv.style.height = need + "px";
}
async function submitFF() {
  const ins = [...document.querySelectorAll("#q .ans")], vals = ins.map(x => x.value.trim());
  if (vals.some(v => !v) || S.finished || busy) return;
  busy = true;
  const t = vals.join(" , ");
  try {
    const mine = S, r = await check(S.code, { answer: vals[0] });
    if (S !== mine) return;
    if (r.verdict === "timeout") { feedback(r); return; }  // not a try: the text stays, retry resends it
    const closes = r.verdict === "correct" || r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0);
    if (r.verdict !== "invalid") { record({ a: t }, r); const pv = $("#preview"); if (pv) { if (closes) pv.classList.add("spent"); else pv.innerHTML = ""; } }   // closing: the preview hides but keeps its room (nothing moves, T17b-1)
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish();
    else if (r.verdict === "wrong") pips(r, ...pipsAt());
    feedback(r, t);
  } finally { busy = false; }
}

/* ---------- proof (W107): a textarea (Enter = a new line, no new key handler), Check sends it to Cluck's grader ---------- */
const PROOF_MAX = 3000;                                    // serve.py PROOF_MAX
const PROOF_ROW = { base: "Base case", assume: "Assume", prove: "Prove" };
const PROOF_V = { ok: ["i-ok", "done"], missing: ["i-x", "missing"], wrong: ["i-x", "wrong"] };
function wireProof() {
  const inp = $("#ans"), go = $("#ansGo");
  inp.addEventListener("input", () => {
    go.disabled = !inp.value.trim();
    const ff = $("#ff"); if (ff.classList.contains("bad")) { ff.classList.remove("bad"); vmark(ff, null); go.hidden = false; }
  });
  go.addEventListener("click", submitProof);
}
function rubricChips(rb) {
  const el = $("#rubric"); if (!el) return;
  el.hidden = !rb;
  el.innerHTML = rb ? Object.keys(PROOF_ROW).map(k => { const [ic, w] = PROOF_V[rb[k]] || PROOF_V.missing;
    return `<span class="rb ${esc(rb[k] || "missing")}" data-id="${k}" data-v="${esc(rb[k] || "missing")}">${icon(ic)}<span>${PROOF_ROW[k]}: ${w}</span></span>`; }).join("") : "";
}
async function submitProof() {
  const inp = $("#ans"), v = inp ? inp.value : "";
  if (!v.trim() || S.finished || busy) return;
  busy = true;
  try {
    const mine = S, r = await check(S.code, { answer: v });
    if (S !== mine) return;
    if (r.verdict === "busy" || r.verdict === "timeout" || r.verdict === "pending") { proofWait(r); return; }   // not a try: the text stays
    if (r.verdict !== "invalid") record({ a: v }, r);
    if (r.rubric) rubricChips(r.rubric);
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish();
    else if (r.verdict === "wrong") pips(r, ...pipsAt());
    if (r.verdict === "invalid") { $("#fb").innerHTML = `<p class="verdict bad">${icon("i-x")}<span>Write your proof here first (up to ${PROOF_MAX} letters).</span></p>`; layoutFreeze(); return; }
    feedback(r, "");
    if (r.verdict === "wrong" && r.triesLeft > 0) { const ff = $("#ff"); ff.classList.remove("bad"); vmark(ff, null); $("#ansGo").hidden = false; }   // the chips say what is wrong; the box stays open to edit, Check with it
  } finally { busy = false; }
}
/* the grader could not answer (no key, the hourly cap, a failure, an uploaded file): one wait line, with the S- code when there is one */
function proofWait(r) {
  const why = { off: "Cluck can't check proofs right now.", hourly: "Cluck needs a short break. Try again soon.", upload: "Proof checks need the hosted bank. Open it by code." }[r.why]
    || "Cluck could not check it. Tap to try again.";
  $("#fb").innerHTML = `<p class="verdict wait">${icon("i-wait")}<span>${esc(why)}</span>${incHTML(r.inc)}${r.why === "upload" || r.why === "off" ? "" : `<button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button>`}</p>`;
  const again = $("#retry"); if (again) again.addEventListener("click", () => { $("#fb").innerHTML = ""; layoutFreeze(); submitProof(); });
  say($("#fb").textContent.replace(/\s+/g, " ").trim());
  layoutFreeze();
}

/* ---------- multi: every part has its own arrow, verdict, tries and lockout ---------- */
const partEls = i => { const r = document.querySelector(`#q .part[data-i="${i}"]`); return { row: r, box: r.querySelector(".ff"), inp: r.querySelector(".ans"), go: r.querySelector(".send"), hint: r.querySelector(".phint") }; };
function wireParts() {
  S.parts = S.prob.parts.map(() => ({ shut: false, ok: false }));
  S.prob.parts.forEach((_, i) => {
    const { inp, go, box } = partEls(i);
    inp.addEventListener("input", () => { go.hidden = !inp.value.trim(); box.classList.remove("bad"); vmark(box, null); });   // the arrow appears once there is text (like the code box)
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitPart(i); } });   // Enter submits THIS box
    go.addEventListener("click", () => submitPart(i));
  });
}
/* a part is closed for good: right (green) or out of tries (dim). Disabled, not read-only: a tap doesn't focus it. */
function shutPart(i, ok) {
  const { box, inp, go } = partEls(i);
  S.parts[i].shut = true; S.parts[i].ok = ok;
  if (box.nextElementSibling?.classList.contains("pips")) box.nextElementSibling.remove();
  box.classList.remove("bad"); box.classList.add("shut"); box.classList.toggle("ok", ok); box.classList.toggle("done", ok);
  for (const x of [inp, go]) { x.disabled = true; x.setAttribute("aria-disabled", "true"); }
  go.hidden = true;
  vmark(box, ok ? "i-ok" : "i-lock");
}
function partFeedback(i, r, typed) {
  const { hint, box, go } = partEls(i), row = hint.parentElement;
  let h = "";
  if (r.verdict === "wrong" && !S.parts[i].shut) { box.classList.add("bad"); go.hidden = true; vmark(box, "i-x"); }   // the box says it: no words
  else if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Oops! Can't read <code>${esc(typed)}</code>, try again!</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved! Tap Copy to send to Tony.</span>${incHTML(r.inc)}</p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>Timeout! Tap to try again.</span>${incHTML(r.inc)}<button type="button" class="btn retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  if (hintOf(r)) {
    const hintWithQuack = quackHint(hintOf(r), S.code + ":part" + i + ":" + S.tries.length);
    h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(hintWithQuack)}</div></div></div>`;
  }
  hint.innerHTML = h;
  row.classList.toggle("hinted", !!h);
  const again = hint.querySelector(".retry");
  if (again) again.addEventListener("click", () => { hint.innerHTML = ""; row.classList.remove("hinted"); layoutFreeze(); submitPart(i); });
  say((partEls(i).row.querySelector(".mk").textContent + " " + verdictWords(r) + " " + hint.textContent).replace(/\s+/g, " ").trim());
}
async function submitPart(i) {
  const { inp, hint } = partEls(i), v = inp.value.trim();
  if (!v || S.parts[i].shut || S.finished || busy) return;
  busy = true;
  try {
    const mine = S, r = await check(S.code, { part: i, answer: v });
    if (S !== mine) return;
    if (r.verdict === "timeout") { partFeedback(i, r); layoutFreeze(); return; }   // not a try: the text stays, retry resends it
    if (r.verdict !== "invalid") record({ a: v, part: i }, r);
    const spent = r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0);
    if (r.verdict === "correct") { shutPart(i, true); partFeedback(i, r, v); }
    else if (spent) { shutPart(i, false); partFeedback(i, r, v); const rv = reveal(r, i); if (rv) say(rv); }
    else { partFeedback(i, r, v); if (r.verdict === "wrong") pips(r, partEls(i).box, "afterend"); }
    if (mine.parts.every(x => x.shut)) { settle(); rewardMulti(mine); }
    else if (r.verdict === "correct" || spent) { const nxt = S.parts.findIndex(x => !x.shut); if (nxt >= 0 && [document.body, inp].includes(document.activeElement)) partEls(nxt).inp.focus(); }   // inp: Chromium 153 keeps focus on the just-disabled box until the next frame, 141 blurred at once (W100)
    layoutFreeze();
  } finally { busy = false; }
}
/* every part right or locked: the problem is finished. It counts as correct only if every part is right. */
function settle() {
  const right = S.parts.filter(x => x.ok).length, n = S.parts.length;
  S.solved = right === n;
  finish();
  $("#fb").innerHTML = S.solved ? ""                                         // every box shows its check: no words
    : `<p class="verdict bad">${icon("i-x")}<span>${right} of ${n} right.</span></p>`;   // no out-of-tries line (Q13): the shut boxes + Next say it
  say(S.solved ? "Correct." : "Out of tries, but you've done your best!");
}

/* ---------- attempts, feedback ---------- */
function record(a, r) {
  if (mockHold() && r.verdict === "wrong") { r.triesLeft = 0; delete r.hint; delete r.spot; delete r.correct; }   // one try (W103b): the wrong closes it
  const t = Date.now();
  /* "pending" is not a server verdict; the payload schema allows it for pre-server tries (COPY-PAYLOAD.md) */
  S.tries.push({ t, ...a, v: r.verdict });
  window.stemT?.("pick", { code: S.code, choice: a.c ?? null, part: a.part ?? null, right: r.verdict === "correct", verdict: r.verdict, tries_left: r.triesLeft ?? null, error: r.error, collide: r.collide, families: r.families, typed: a.c == null && typeof a.a === "string" && S.prob.type !== "proof" ? a.a : null });   // W107: a proof never rides in telemetry   // telemetry (telemetry.js drops error + collide + families + typed: on device only, except Tony's own devices, T36)
  /* SLIP_TIE spot: the reply's `spot` (a place in the formula) shows instead of `hint` only when Jev's gate says so (intent.js spotOk:
     improving + nearly there). Asked once, after the pick line; Jev off (no stemJev) = the plain hint. hintOf(r) reads the result */
  if (r.verdict === "wrong" && typeof r.spot === "string" && r.spot) r.shown = window.stemJev?.spot?.()?.ok === true ? "spot" : "hint";
  const mine = x => x.part === a.part;        // a multi counts wrong tries per part; the others have part undefined
  if (r.verdict === "wrong" && hintOf(r) && !r.repeat) S.hints.push({ t, ...(a.part != null ? { part: a.part } : {}), n: S.tries.filter(x => x.v === "wrong" && mine(x)).length, kind: r.shown === "spot" ? "spot" : r.error || "nudge" });
  if (typeof r.triesLeft === "number") S.triesLeft = r.triesLeft;
  if (r.verdict === "correct" || r.verdict === "wrong") saveDone(r);
  else if (r.verdict === "locked") syncServer(S);              // the server knows more than this page: ask it
  if (r.verdict === "correct" || r.verdict === "wrong") dispatchEvent(new CustomEvent("drill:answer", { detail: { code: S.code, right: r.verdict === "correct", ms: t - S.start } }));   // nav.js: the queue re-ranks
  rewardTry(a, r);
  if (r.verdict === "wrong" && S.tries.filter(x => x.v === "wrong").length === 1) window.stemDuck?.wrong?.(S.code);   // T45: the question's first wrong answer starts Cluck's sunrise within ~0.8 s (peek.js)
}

/* ---------- done questions: kept per bank + code across reloads (design/DONE.md) ----------
   Record: { v: 2, units: [{ x, done, hint, gen, sigs? }], x, done, tries, hints }. One unit per problem, one per part for a multi.
   x = wrong tries, done = "open" | "correct" | "out". Top level (for the list): x = all wrong tries, done = "correct" when every
   unit is right, "out" when every unit is closed and one isn't, else "open".
   Never the answer or the right choice: a reopened question shows only what the student did. */
const doneStore = () => window.stemOffline && window.stemOffline.doneGet ? window.stemOffline : null;
const unitCount = p => p.type === "multi" ? p.parts.length : 1;
const freshUnit = () => ({ x: 0, done: "open", hint: null, gen: 0 });
function units(rec, p) {
  const n = unitCount(p), u = rec && Array.isArray(rec.units) ? rec.units : [];
  return Array.from({ length: n }, (_, i) => ({ ...freshUnit(), ...(u[i] || {}) }));
}
function wrapRec(us, tries, hints) {
  const x = us.reduce((a, u) => a + u.x, 0);
  const done = us.every(u => u.done === "correct") ? "correct" : us.every(u => u.done !== "open") ? "out" : "open";
  return { v: 2, units: us, x, done, tries, hints };
}
function saveDone(r) {
  const st = doneStore(); if (!st) return;
  const p = S.prob, max = maxTries(p), i = p.type === "multi" ? r.part ?? 0 : 0, us = units(st.doneGet(S.code), p);
  const x = Math.max(0, max - (typeof r.triesLeft === "number" ? r.triesLeft : max)), u = us[i];
  Object.assign(u, { x, done: r.verdict === "correct" ? "correct" : x >= max ? "out" : "open" });
  if (r.verdict === "wrong") u.hint = hintOf(r) || null;               // the hint the student saw for their own wrong answer (spot or plain)
  if (typeof r.gen === "number") u.gen = r.gen;
  if (off()) u.sigs = ((localState.get(p.type === "multi" ? `${S.code}#${i}` : S.code) || {}).wrong || []).slice();
  const rec = wrapRec(us, S.tries.filter(t => t.v === "correct" || t.v === "wrong"), S.hints.slice());
  if (window.stemRedo.has(S.code)) rec.round = window.stemRedo.get().n;   // a re-showing's record names its round (stemRedo.set, T41)
  st.donePut(S.code, rec);
  if (rec.done === "correct") doneExit(S);
}
/* all correct: nothing is left to type here, so after a beat to see the ticks the pad page and the keyboard step away and the
   question row (Next) comes back into view (Tony, Oct 3). Out of tries keeps the pad: the student may want to find the mistake. */
function doneExit(mine) {
  setTimeout(() => {
    if (S !== mine) return;                                                      // moved on already
    const a = document.activeElement; if (a && a !== document.body && a.blur && !a.matches(".nx") && !a.closest("#cluck")) a.blur();   // Next in the Check slot keeps focus (T17b-1); so does Cluck's sheet (opened in the beat)
    if (mtOpen) closeMT(false);
    if (swapOn) setSwap(false);
    root.classList.remove("dock-away", "bar-off");
    /* no scroll to the top any more (A1 audit): Next sits in the Check slot where the eye already is, and the card never moves after Check */
  }, 900);
}
/* upload mode: gradeLocal picks up where it was */
function seedLocal(code, rec, p) {
  units(rec, p).forEach((u, i) => { if (u.sigs || u.done !== "open") localState.set(p.type === "multi" ? `${code}#${i}` : code, { wrong: (u.sigs || []).slice(), done: u.done === "correct" }); });
}
/* show a record on the freshly rendered question: struck wrong choices, the student's right one, their last typed answer;
   closed = read-only. The right choice is never marked unless the student picked it. */
function paint(rec) {
  painting = true;                                          // a restore: Next shows still (no g-next-in), no focus, no nod
  try { paintRec(rec); } finally { painting = false; }
}
function paintRec(rec) {
  const p = S.prob, max = maxTries(p), us = units(rec, p);
  S.tries = (rec.tries || []).slice(); S.hints = (rec.hints || []).slice();
  if (p.type === "multi") {
    us.forEach((u, i) => {
      const last = S.tries.filter(t => t.part === i).pop(), { inp, go } = partEls(i);
      if (last && typeof last.a === "string") { inp.value = last.a; go.hidden = u.done !== "open"; }
      if (u.done !== "open") shutPart(i, u.done === "correct");
      if (u.done === "correct") partFeedback(i, { verdict: "correct" });
      else if (u.x > 0) { const r = { verdict: "wrong", triesLeft: Math.max(0, max - u.x), hint: u.hint || undefined }; partFeedback(i, r); if (u.done === "open") pips(r, partEls(i).box, "afterend"); }
    });
    if (S.parts.every(x => x.shut)) settle();
    return;
  }
  const u = us[0];
  S.triesLeft = Math.max(0, max - u.x);
  if (all(p)) {                                             // struck rows, then the last try's ticks and fixes (green if it was right)
    const opt = id => opts().find(x => x.dataset.id === id), last = S.tries[S.tries.length - 1];
    for (const t of S.tries) if (t.s) strike(opt(t.s));
    if (last && Array.isArray(last.c)) for (const o of last.c.map(opt)) {
      if (!o || o.disabled) continue;
      mark(o, "on");
      if (last.v === "correct") { o.classList.add("right"); glyph(o, "i-ok"); }
      else if (last.v === "wrong" && last.k && last.k.includes(o.dataset.id) && keepOn()) keep(o);
    }
    if (last && last.f) for (const [id, v] of Object.entries(last.f)) {
      const o = opt(id), f = o && fixOf(o); if (!f) continue;
      if (!o.disabled) mark(o, "x");
      f.querySelector("input").value = v;
      f.classList.toggle("bad", last.w === id); if (last.v === "correct") f.classList.add("ok", "done");
    }
    const live = opts().find(x => !x.disabled && !x.classList.contains("kept")); if (live) roving(live);
    syncTicks();
  } else if (p.type === "mc") {
    for (const t of S.tries) {
      const o = opts().find(x => x.dataset.id === t.c); if (!o) continue;
      if (t.v === "wrong") { o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true"); glyph(o, "i-x"); }
      else if (t.v === "correct") { o.classList.add("right"); glyph(o, "i-ok"); }
    }
    const live = opts().find(x => !x.disabled); if (live) roving(live);
  } else {
    const last = S.tries[S.tries.length - 1], inp = $("#ans");
    if (last && typeof last.a === "string" && inp) { inp.value = last.a; const go = $("#ansGo"); if (go) go.disabled = !inp.value.trim(); }
    if (u.done === "correct") $("#ff").classList.add("ok", "done");
  }
  if (u.done !== "open") finish();
  if (u.done === "correct") feedback({ verdict: "correct" });
  else if (u.x > 0) { feedback({ verdict: "wrong", triesLeft: S.triesLeft, hint: u.hint || undefined }); pips({ verdict: "wrong", triesLeft: S.triesLeft }, ...pipsAt()); }   // a reload keeps the dots
}
function repaint(rec) {
  Object.assign(S, { tries: [], hints: [], triesLeft: maxTries(S.prob), finished: false, selected: null });
  renderQuestion(); $("#fb").innerHTML = "";
  if (rec) paint(rec);
  layoutFreeze();
}
/* server mode: the server is the source of truth for tries, the record is a display cache. Per unit:
   server further: it wins. Cache further: stay locked, unless the server's gen is newer (Tony deleted the entry = reset). */
async function syncServer(mine) {
  const st = doneStore(); if (!st || !mine || off() || window.stemRedo.has(mine.code)) return;   // /state is the real history, not the round
  let s;
  try { const r = await net(`state/${mine.code}`, { credentials: "same-origin" }); if (!r.ok) { r.text().catch(() => {}); return; } s = await r.json(); }   // drain a 404 so the request completes
  catch { return; }                                            // unreachable or slow: the cache stands
  if (S !== mine || busy) return;
  const p = mine.prob, max = maxTries(p), c = st.doneGet(mine.code), us = units(c, p), ss = s.parts || [s];
  if (ss.length !== us.length || ss.some(x => typeof x.wrong !== "number")) return;
  let tries = c ? (c.tries || []).slice() : [], hints = c ? (c.hints || []).slice() : [], shown = false, quiet = false;
  ss.forEach((su, i) => {
    const u = us[i], sd = su.done ? "correct" : su.wrong >= max ? "out" : "open";
    const mineOf = t => p.type === "multi" ? t.part === i : true;
    if (su.wrong > u.x || (sd !== "open" && u.done === "open") || (sd === "correct" && u.done !== "correct")) {
      Object.assign(u, { x: su.wrong, done: sd, gen: su.gen }); shown = true;
    } else if (u.x > su.wrong || (u.done !== "open" && sd === "open")) {
      if (su.gen > (u.gen || 0)) {                             // Tony reset it by hand
        us[i] = { ...freshUnit(), gen: su.gen }; shown = true;
        tries = tries.filter(t => !mineOf(t)); hints = hints.filter(t => !mineOf(t));
      }
    } else if (u.gen !== su.gen) { u.gen = su.gen; quiet = true; }
  });
  const showRev = () => { if (S === mine && modeOf() === "sugar") ss.forEach((su, i) => { if (su.correct != null && !su.done) reveal({ verdict: "wrong", correct: su.correct, part: i }, i); }); };   // T19: a reload gets the answer again (never stored here)
  if (!shown && !quiet) { showRev(); return; }
  const rec = wrapRec(us, tries, hints);
  if (!rec.x && rec.done === "open" && !tries.length) st.doneDrop(mine.code); else st.donePut(mine.code, rec);
  if (shown) repaint(rec.x || rec.done !== "open" || tries.length ? rec : null);
  showRev();
}
/* answered or out of tries: every answer control is off and looks it (dimmed, not-allowed, no hover); the right one keeps its ok look.
   Answer boxes are disabled, not just read-only, so a tap doesn't focus them (no focus ring, no keyboard) */
/* try pips (Tony, Oct 5: they replace the "One more try" toast, which covered a choice): after a wrong try with tries left, one dot
   per try, used = filled red, left = hollow. Beside Check on a tick-all question, else under the rows / the answer box. The screen
   reader already hears "Wrong. 1 try left." (verdictWords), so the dots are aria-hidden. A closed question drops them (finish, shutPart) */
function pips(r, el, pos) {
  if (!el) return;
  const old = pos === "afterend" ? el.nextElementSibling : el.previousElementSibling;
  if (old && old.classList.contains("pips")) old.remove();
  const max = maxTries(S.prob), left = r.triesLeft;
  if (r.verdict !== "wrong" || !(left > 0) || max < 2) return;
  el.insertAdjacentHTML(pos, `<span class="pips" aria-hidden="true">${'<i class="used"></i>'.repeat(max - left)}${"<i></i>".repeat(left)}</span>`);
}
const pipsAt = () => $("#mcGo") ? [$("#mcGo"), "beforebegin"] : S.prob.type === "mc" ? [$("#q .choices"), "afterend"] : [$("#ff"), "afterend"];   // single pick has no Check: under the rows
/* the retry tag (round 7 PICKER 9: retry-tag "Agreed" on the shadcn 6px shape): a re-showing says so at the top of the card, so a blank card
   never reads as lost work. Owes a miss = Pity roll, else Review; once closed: Avenged! / Reviewed, or Comes back later. No "+3" until
   D60 pays it. No lockout sub-lines (Tony, Oct 17: drop). */
const RTAG = { owe: ["Pity roll", "i-back"], won: ["Avenged!", "i-ok"], review: ["Review", "i-back"], kept: ["Reviewed", "i-ok"], out: ["Comes back later", "i-back"] };
function retryTag() {
  const t = $("#rtag"), r = window.stemRedo.get(), on = !!S && !!r && r.codes.includes(S.code);
  const won = !!S && S.finished && (S.prob.type === "multi" ? !!S.solved : S.tries.some(x => x.v === "correct"));
  const k = !on ? null : !S.finished ? (r.redeem !== false ? "owe" : "review") : won ? (r.redeem !== false ? "won" : "kept") : "out";
  t.hidden = !k;
  t.className = "rtag" + (k ? " rt-" + k : "");
  t.innerHTML = k ? `${icon(RTAG[k][1])}<span>${RTAG[k][0]}</span>` : "";
}
function finish() {
  S.finished = true;
  document.querySelectorAll("#q .pips").forEach(x => x.classList.add("spent"));   // hidden, its room kept: a closing tap never moves the page (T17b-1)
  $("#q").classList.add("closed");
  document.querySelectorAll("#q .opt, #q .ans, #q .send").forEach(x => { x.disabled = true; x.setAttribute("aria-disabled", "true"); });
  document.querySelectorAll("#q .send").forEach(b => { b.hidden = true; });
  cueNext();
  retryTag();
  const mine = S, still = painting;
  queueMicrotask(() => { if (S === mine) cueChip(still); });   // after feedback(): a wrong last try makes its own wish first (wishOnWrong)
}
/* ---------- T17b-1 DEFAULT CUE (r5/B cue3.html, the R3 REC set): a labelled Next lands in the Check slot of the last try ----------
   Every answer type: the mc row's own arrow slot, the num / expr / text box, the multi part's box, the pick-all Check row. The Check rect
   lies inside Next (96x48, right edges flush), so nothing moves and the card stays put. Focus goes to Next (no scroll); a held Enter
   (e.repeat) never skips a question. Live: g-next-in (app.css) lands it once; a restored question shows it still. No list (#qnav hidden)
   = nowhere to go, so no Next. */
let painting = false;
function cueCarrier() {
  const p = S.prob, t = S.tries.at(-1) || {};
  if (all(p)) return { box: $("#q .chk"), send: $("#mcGo") };
  if (p.type === "mc") {
    const id = t.c ?? S.selected ?? $("#q .opt.right")?.dataset.id;
    const box = (id != null && [...document.querySelectorAll("#q .ch")].find(c => c.dataset.id === String(id))) || $("#q .ch");
    return { box, send: box && box.querySelector(".send") };
  }
  if (p.type === "multi") { const e = partEls(typeof t.part === "number" ? t.part : p.parts.length - 1); return { box: e.box, send: e.go }; }
  return { box: $("#ff"), send: $("#ansGo") };
}
function cueNext() {
  document.querySelectorAll("#q .nx").forEach(x => x.remove());
  document.querySelectorAll("#q .cue").forEach(x => x.classList.remove("cue"));
  const nav = $("#qnav");
  if (!S || !nav || nav.hidden) return;
  const { box, send } = cueCarrier();
  if (!box || !send) return;
  const h0 = box.matches(".ch") ? box.offsetHeight : 0;                         // a row whose text rewraps round Next keeps Next on Check's old spot
  box.classList.add("cue");
  send.insertAdjacentHTML("afterend", `<button type="button" class="nx${painting ? "" : " g-next"}" aria-label="Next question"><span class="nf"><span>Next</span>${icon("i-tri")}</span></button>`);
  const nx = send.nextElementSibling;
  if (h0 && Math.abs(box.offsetHeight - h0) > 0.5) nx.style.top = h0 / 2 + "px";
  nx.addEventListener("click", e => {
    e.stopPropagation();
    const n = $("#qnext");
    if (!n || n.disabled) { dispatchEvent(new CustomEvent("drill:note", { detail: { text: "No more questions, no more eggs." } })); return; }
    n.click();                                                                   // nav.js go(1): the same queue as the bar's Next
  });
  const g = box.closest(".choices.inline");                                     // pills: Next must fit its pill, else the rows stack
  if (g && (g.scrollWidth > g.clientWidth + 0.5 || [...g.querySelectorAll(".opt")].some(o => o.scrollWidth > o.clientWidth + 0.5))) g.classList.remove("inline");
  if (!painting) nx.focus({ preventScroll: true });
  if ($("#padFab") && !$("#padFab").hidden) requestAnimationFrame(() => fabPlace({ avoid: true }));      // Open notes steps off Next (A1: it sat on the 4th multi box)
}
/* keys (Tony, Oct 21 locks): Enter = Check (a picked choice, a typed box) and the chat send, and NEVER Next, even though Next keeps focus
   after Check and even under the level-up overlay. A held Space that sent Check never presses Next either (only its repeats drop). */
addEventListener("keydown", e => {
  if (!e.target.matches?.("#q .nx, #qnext")) return;
  if (e.key === "Enter" || (e.repeat && e.key === " ")) e.preventDefault();
}, true);
/* → = Next, ← = Prev (the bar's own buttons: nav.js's queue), only when focus is not in a choice list (there the arrows move the pick,
   and that handler takes the key first), a text box or the splitter. An overlay up: the first → only closes it (rewards/fx.js takes the
   key on capture, same as Escape); while it fades out the arrows still do nothing. */
const ARROW_OWN = "input, textarea, select, [contenteditable]:not([contenteditable=false]), .choices, [role=radiogroup], [role=listbox], [role=separator], #qlist";
addEventListener("keydown", e => {
  if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (document.querySelector(".fx-ov")) { e.preventDefault(); return; }
  if (!e.target.matches?.("#q .nx") && e.target.closest?.(ARROW_OWN)) return;   // Next in the Check slot sits inside the choice row
  const nav = $("#qnav"), b = $(e.key === "ArrowRight" ? "#qnext" : "#qprev");
  if (!nav || nav.hidden || !b || b.disabled || b.hidden) return;
  e.preventDefault();
  b.click();
});
/* ---------- T19 SUGAR REVEAL (Tony, Oct 12): out of tries in sugar shows the right answer ----------
   The server sends `correct` only with the lockout and only in sugar (serve.py answer_of; a reload gets it from /state).
   mc: the right row turns green with a check (class right + reveal), the picked wrong rows stay struck with their x.
   Typed: an "Answer 2.02" line in the preview's room (a multi: the part's hint slot). Cluck's why is the wish already
   streaming for the wrong try (/explain). A reveal pays no XP and stays a miss (rewardTry). Diet never has r.correct. */
function reveal(r, part) {
  if (modeOf() !== "sugar" || !S || r.correct == null || r.verdict === "correct") return "";
  const p = S.prob, c = r.correct;
  if (p.type === "mc") {
    const ids = [].concat(c);
    for (const o of opts()) {
      if (ids.includes(o.dataset.id)) {
        if (all(p)) mark(o, "on");
        o.classList.remove("wrong"); o.classList.add("right"); o.classList.toggle("reveal", !o.classList.contains("kept")); glyph(o, "i-ok");   // kept = yours: solid
      } else if (all(p) && markOf(o) === "on" && !o.classList.contains("wrong")) strike(o);      // a ticked wrong row: struck, x
    }
    return "The right answer: " + opts().filter(o => ids.includes(o.dataset.id)).map(o => o.querySelector(".txt").textContent.trim()).join(", ") + ".";
  }
  const multi = p.type === "multi", i = multi ? (part ?? r.part) : 0, u = multi ? p.parts[i] : p;
  const host = multi ? partEls(i).hint : $("#preview"); if (!host) return "";
  if (p.type === "proof") {                                  // W107: the reference proof, as markdown with its math, under the box
    host.classList.remove("spent"); host.removeAttribute("aria-hidden");
    host.innerHTML = `<p class="ansl">${icon("i-ok")}<span>A proof</span></p><div class="md refmd">${md(String(c))}</div>`;
    return "A proof is shown under your box.";
  }
  let val = esc(c);
  if (u.type === "expr" && typeof math !== "undefined") { try { val = renderMath(math.parse(String(c)).toTex({ parenthesis: "auto", implicit: "hide" }), false); } catch { /* the plain text stands */ } }
  host.querySelector(".ansl")?.remove();
  if (!multi) { host.classList.remove("spent"); host.innerHTML = ""; host.removeAttribute("aria-hidden"); }
  host.insertAdjacentHTML("beforeend", `<p class="ansl">${icon("i-ok")}<span>Answer</span><b>${val}</b></p>`);
  if (!multi) pvFit(host);                                   // W91: the reveal's line uses the preview's room (the same ratchet)
  if (multi) host.parentElement.classList.add("hinted");
  return "The answer: " + host.querySelector(".ansl b").textContent.replace(/\s+/g, " ").trim() + ".";
}
/* the duck chip (sugar, questions with Cluck's key only): right = "See Cluck's steps", out of tries = "Ask Cluck". A tap pays no XP */
function cueChip(still) {
  if (mockHold()) return;
  if (modeOf() !== "sugar" || !S || !S.finished || !S.prob.wish) return;
  if (!wish || wish.code !== S.code) { wish = Object.assign(newWish(), { started: false }); wishFromCache(wish); }
  if (!still && wish.nod == null) { if (cueRight()) wish.nod = nodGate(); else { wish.nod = false; nodMiss(); } }
  wishPaint();
}
const cueRight = () => S.prob.type === "multi" ? !!S.solved : !!(document.querySelector("#q .opt.right:not(.reveal)") || $("#ff.ok"));   // a revealed row is the answer, not the student's pick
/* the calm nod (r5 BRIEF reward rule 4): the first 3 rights of a PT day nod, then about 1 in 3, never twice in a row, and always on a
   first-try right after a miss. One small record in this browser; blocked storage = no nod */
const ptDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const nodGet = () => { try { return JSON.parse(localStorage.getItem("stem-nod")) || null; } catch { return null; } };
function nodGate() {
  const day = ptDay(), first = !S.tries.some(t => t.v === "wrong");
  let st = nodGet();
  if (!st || st.day !== day) st = { day, n: 0, last: false, miss: !!(st && st.miss) };
  const n = st.n + 1, yes = n <= 3 || (first && st.miss) || (!st.last && n % 3 === 0);
  try { localStorage.setItem("stem-nod", JSON.stringify({ day, n, last: yes, miss: !first })); } catch { return false; }
  return yes;
}
function nodMiss() { const st = nodGet() || { day: ptDay(), n: 0, last: false }; st.miss = true; try { localStorage.setItem("stem-nod", JSON.stringify(st)); } catch { /* blocked */ } }
function feedback(r, typed) {
  const fb = $("#fb");
  let h = "";
  /* right / wrong / out: the answer box (or the MC badge) shows the icon; no words on the page */
  const ff = S.prob.type === "mc" ? null : $("#ff");
  if (ff && r.verdict === "correct") vmark(ff, "i-ok");
  else if (ff && (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))) { ff.classList.remove("bad"); vmark(ff, "i-lock"); }
  else if (ff && r.verdict === "wrong") { ff.classList.add("bad"); $("#ansGo").hidden = true; vmark(ff, "i-x"); }
  if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Oops! Can't read <code>${esc(typed)}</code>, try again!</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved! Tap Copy to send to Tony.</span>${incHTML(r.inc)}</p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>Timeout! Tap to try again.</span>${incHTML(r.inc)}<button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  /* out of tries: no words on the page (Q13). The lock, the struck rows / box and Next in the Check slot say it; the screen reader hears verdictWords */
  let quackHtml = "";
  if (hintOf(r)) {
    const hintWithQuack = quackHint(hintOf(r), S.code + ":" + S.tries.length);
    quackHtml = `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(hintWithQuack)}</div></div></div>`;
  }
  /* a hint on a tick-all question with tries left sits in the empty room left of Check if it fits in 2 lines (Tony, Oct 5), else under the question.
     Phones: the Scratchpad button sits on that row, so under the question. */
  const chk = $("#q .chk"); chk?.querySelector(".cluck")?.remove();
  let inRow = !!(chk && hintOf(r) && r.verdict === "wrong" && r.triesLeft > 0 && !root.classList.contains("pad-off"));
  fb.innerHTML = h;
  if (inRow) {
    chk.insertAdjacentHTML("afterbegin", quackHtml);
    const m = chk.querySelector(".cluck .md"), lh = parseFloat(getComputedStyle(m).lineHeight) || 24;
    if (m.offsetHeight > 2 * lh + 2 || m.scrollWidth > m.clientWidth) { chk.querySelector(".cluck").remove(); inRow = false; }
  }
  if (!inRow) fb.insertAdjacentHTML("beforeend", quackHtml);
  const again = $("#retry");
  if (again) again.addEventListener("click", () => { fb.innerHTML = ""; layoutFreeze(); (S.prob.type === "mc" ? submitMC : S.prob.type === "proof" ? submitProof : submitFF)(); });
  const rev = reveal(r);
  say((verdictWords(r) + " " + rev + " " + fb.textContent + " " + (inRow ? chk.querySelector(".cluck").textContent : "")).replace(/\s+/g, " ").trim());
  layoutFreeze();
  if (r.verdict === "wrong") wishOnWrong();
  window.stemBrainrot?.sync();
}

/* ---------- Cluck the genie (design/EASY.md Phase 4): easy mode, after a wrong answer ----------
   The first wrong answer of a question asks /explain in the background (at most WISH_AUTO questions an hour in this browser), so
   the solution is ready when the student looks. Past the cap nothing fires: "Ask Cluck" does it. The text is plain + $LaTeX$, read
   shown, never spoken (Tony, Oct 5: the voice is gone). A new question stops all of it. */
const WISH_AUTO = 5;
const wishLog = () => { try { return (JSON.parse(localStorage.getItem("stem-wish")) || []).filter(t => Date.now() - t < 3600e3); } catch { return []; } };
function wishLogAdd() { try { localStorage.setItem("stem-wish", JSON.stringify([...wishLog(), Date.now()])); } catch { /* blocked */ } }
let wish = null;   // { code, text, started, done, open, failed, ctl, off }
/* a plain 503 from /explain (no X-Incident) = no AI key on this server (a preview deploy, Oct 26): Cluck is off for this page load. No more
   Cluck entries (wishOnWrong); a press that already asked (w.off) gets one line in the sheet, never silence */
let cluckOff = false;
const CLUCK_OFF = "Eggs-tra help currently unavailable.";              // COPY-PENDING
const WHY_ASK = "Why does this work?";                                   // COPY-PENDING (W110): the chip under a right-pick reply, and the question it sends
/* B7 (ii) (Tony, Oct 18): ONE decision whether a wrong answer streams Cluck's reply in the background, so it is there when the duck (or
   the hint card's CTA) opens him. Jev plugs in here later. Now: only the first PREFETCH_Q questions opened this session (distinct codes,
   sessionStorage "stem-seen-q"), only within the hourly auto budget (WISH_AUTO), never on a restore. No = the "Explain my mistake" chip
   asks when tapped, as past the cap */
const PREFETCH_Q = 2, SEEN = "stem-seen-q";
let seenMem = [];
const seenQ = () => { try { const a = JSON.parse(sessionStorage.getItem(SEEN)); return Array.isArray(a) ? a : seenMem; } catch { return seenMem; } };
function qSeen(code) {
  const a = seenQ(); if (a.length >= PREFETCH_Q || a.includes(code)) return;
  seenMem = [...a, code]; try { sessionStorage.setItem(SEEN, JSON.stringify(seenMem)); } catch { /* blocked: this page only */ }
}
const shouldPrefetch = code => !painting && wishLog().length < WISH_AUTO && seenQ().includes(code);
/* the reply cache (Tony, Oct 18): the finished /explain text, in this browser only (localStorage "stem-cluck"): key = code | sorted picks | build
   (a new deploy = new prompts = a fresh reply), value { text, t }; the last 30 kept, none older than 7 days. A revisit or a reload shows the
   text at once: no new call, no wait lines, no caret. Blocked or full storage = no cache, as before */
const CK = "stem-cluck", CK_MAX = 30, CK_TTL = 7 * 864e5;
const ckKey = (code, t) => { const p = t ? (t.c ?? t.a ?? "") : ""; return code + "|" + (t && Number.isInteger(t.part) ? t.part + ":" : "") + (Array.isArray(p) ? [...p].map(String).sort().join(",") : String(p)) + "|" + (document.querySelector('meta[name="stem-build"]')?.content || "dev"); };
const ckAll = () => { try { const o = JSON.parse(localStorage.getItem(CK)); return o && typeof o === "object" ? Object.entries(o).filter(([, v]) => v && typeof v.text === "string" && Date.now() - v.t < CK_TTL) : []; } catch { return []; } };
const ckGet = key => ckAll().find(([k]) => k === key)?.[1].text || "";
function ckPut(key, text) {
  try { localStorage.setItem(CK, JSON.stringify(Object.fromEntries([...ckAll().filter(([k]) => k !== key), [key, { text, t: Date.now() }]].slice(-CK_MAX)))); } catch { /* blocked or full */ }
}
function wishFromCache(w) {                                                // a hit: the wish is finished already, shown whole (no fetch, no caret, no typing)
  const key = S && S.code === w.code ? ckKey(w.code, S.tries.at(-1)) : "", text = key ? ckGet(key) : "";
  if (!text) return false;
  Object.assign(w, { key, text, done: true, started: true, failed: 0, shown: text.length, pos: text.length, skip: true, at: 1 });
  return true;
}
function wishEl() {
  let el = $("#wish");
  if (!el) { el = document.createElement("div"); el.id = "wish"; el.className = "wish"; el.hidden = true; $("#fb").after(el); }
  return el;
}
function wishReset() {
  if (wish && wish.ctl) wish.ctl.abort();
  wish = null;
  const el = $("#wish"); if (el) { el.innerHTML = ""; el.hidden = true; }
  document.querySelectorAll(".cl-peek").forEach(p => p.remove());
  clReset();
}
const newWish = () => ({ code: S.code, text: "", started: true, done: false, open: false, failed: 0, shown: 0, at: 0, said: false, chat: [], busy: false, out: false });
/* One text source: the box always shows the live /explain stream (saccharine.narration is no longer read here). */
function wishOnWrong() {
  if (mockHold()) return;
  if (modeOf() !== "sugar" || !S || !S.prob.wish || cluckOff) return;       // only questions with a presolved key; no key on the server: no entry
  if (wish && wish.code === S.code) { wishPaint(); return; }               // a later miss redrew the hint card: Cluck's peek goes back in
  wish = newWish();
  const w = wish;
  /* a wrong answer never opens Cluck by itself (B7 ii, Tony Oct 18): the duck's sunrise comes (peek.js) and a tap on it opens him.
     Desktop with the sheet already open (the free steps): it turns to Cluck's text, as before */
  const auto = () => { if (sideMQ.matches && cl && cl.open && !w.open) clOpen("explain", "#wish .wchip", true); };
  if (wishFromCache(w)) { wishPaint(); auto(); return; }                   // a reply we already have: no call
  if (!shouldPrefetch(w.code)) w.started = false;                         // no prefetch: the "Explain my mistake" chip asks (no auto call)
  wishPaint();
  if (w.started) { wishStart(true); auto(); }                             // the reply streams now, in the background: one request, reused on open
}
const scratchTail = () => ($("#scratch")?.value || "").slice(-1500);      // the newest work: the NOTE reads the move (serve.py SCRATCH_MAX)
async function wishStart(auto) {
  const w = wish, t = S.tries.at(-1) || {}, key = ckKey(w.code, t);
  w.key = key;                                                             // the try this text explains (Compare: a later right one needs its own)
  w.started = true; w.ctl = new AbortController();
  window.stemT?.("_ask");   // telemetry: cluck_stream's first_token_ms starts here
  if (auto) wishLogAdd();
  const t0 = Date.now(), tp = traceparent(), inc = x => reqInc("explain", "/explain", t0, { q: w.code, tp, ...x }), fr = frReq("explain", tp);
  let r = null, bytes = 0;
  try {
    r = await fetch("explain", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, auto, scratch: scratchTail() }), signal: w.ctl.signal });   // part: a multi's part (W110); the server grades the pick itself
    fr.h(r);
    if (!r.ok || !r.body) {
      const sc = xInc(r)[0];                                               // a 503 with a server code (out of credit): a failure shown like any other;
      w.failed = r.status === 503 && sc ? 1 : r.status || 1;                // a plain 404/503 = no Cluck here (hidden), 429 = the cap: no incident
      if (![404, 429, 503].includes(r.status) || sc) w.inc = inc({ r, bytes: 0 });
      if (r.status === 503 && !sc) { cluckOff = true; w.off = !auto; }     // no key here: a press (not the background ask) says so in the sheet
    }
    else {
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        bytes += value.length; fr.f();
        w.text += dec.decode(value, { stream: true });
        window.stemT?.("_tok");   // telemetry: first chunk time
        if (wish === w && w.open) wishText();
        if (wish === w) peekText();
      }
      fr.e(bytes);
      if (!w.text && !w.ctl.signal.aborted) { w.failed = 1; w.inc = inc({ why: "empty", phase: "stream", bytes, status: r.status }); }   // 200 and then nothing
    }
  } catch (e) { fr.x(e); if (!w.ctl.signal.aborted) { w.failed = 1; w.inc = inc(r ? { e, phase: "stream", bytes, status: r.status } : { e }); } }   // r: the headers came, the stream broke
  w.done = true;
  if (!w.failed && w.text && !w.ctl.signal.aborted) ckPut(key, w.text);   // a whole reply only: not a failure, not one cut by leaving the question
  window.stemT?.("cluck_stream", { code: w.code, chars: w.text.length, figs: (w.text.match(WFIG) || []).length, failed: w.failed || 0, auto: !!auto });   // telemetry
  if (wish !== w) return;
  if (w.failed === 429) { w.started = false; w.failed = 0; w.capped = true; }   // the server's cap: the student can still ask
  wishPaint();
  if (w.open) wishDraw();                                                  // an open sheet shows the failure, not a caret forever (G2c row 23)
}
function wishRetry(w) {                                                    // the chip and the sheet's "Try again": a fresh request
  Object.assign(w, { failed: 0, capped: false, inc: null, text: "", done: false, shown: 0, pos: 0, at: 0, tick: 0, skip: false, said: false, drawn: 0, ended: false });
  wishStart(false);
}
/* text: one line per line, the Mathy flow (design: brain topics/ai-tutor-ux.md): sentences with $..$ math and **bold** key numbers; "1. Title — subtitle" opens a step (Gemini's steps, alt's mock) that holds what
   follows until the next step or a "---" rule; "- " lines in a row make one short list (the ChatGPT break-up, Tony's ref); a line
   that is only math ($$..$$ or $..$) is display math, and display lines in a row share one tinted callout, one equation per line; a table row
   (2+ spaces between cells) in the mono face so its columns line up */
const WDISP = /^\s*\$\$?([^$]+)\$\$?\s*$/;
const wishMath = (x, d, m) => { try { return renderMath(x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), d); } catch { return m; } };
const wishLine = l => esc(l).replace(/\$\$?([^$]+)\$\$?/g, (m, x) => wishMath(x, false, m)).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") || "&nbsp;";
const WSTEP = /^\s*(\d{1,2})[.)]\s+(.+)$/;
/* live figures (serve.py + livefig.py, Claude path only): the server sends at most one checked graph block per reply as
   "\n```fig\n<json>\n```\n". wishHTML puts a .wfig placeholder in its place (an unclosed fence shows nothing: never raw JSON);
   wishFigs draws it with Graph.render, the bank-figure path, once per figure (the drawn node is reused on every redraw). */
const WFIG = /\n?```fig\n([^\n]*)\n```\n?/g, figJSON = [], figEl = [];
const figKey = j => { let k = figJSON.indexOf(j); if (k < 0) { k = figJSON.length; figJSON.push(j); } return k; };
/* a view (P4.1, views_gate.py): the server sends at most one gated OpenUI Lang program per reply as "\n```openui\n<program>\n```\n", in the
   same one-figure slot; its key is the program behind a \u0002 mark. wishFigs draws it with views.js (loaded lazily); nothing drawn: its alt text. */
const WOUI = /\n?```openui\n([\s\S]*?)\n```\n?/g, OUI = "\u0002";
const ouiAlt = s => (/^\w+ = Geometry\(.*,\s*"((?:[^"\\]|\\.)*)"\)\s*$/m.exec(s) || [])[1] || "";
const stripFigs = t => t.replace(WFIG, "\n").replace(WOUI, "\n").replace(/```[\s\S]*$/, "");
function wishFigs(root) {
  for (const ph of root.querySelectorAll(".wfig[data-f]")) {
    const k = +ph.dataset.f, done = figEl[k];
    if (done && !done.isConnected) { ph.replaceWith(done); continue; }
    ph.removeAttribute("data-f");
    if (figJSON[k].startsWith(OUI)) {                                     // an ```openui view: views.js draws it into the placeholder
      const src = figJSON[k].slice(1), alt = ouiAlt(src), off = () => { ph.replaceChildren(); ph.textContent = alt; ph.classList.add("fig-off"); };
      ph.classList.add("wview"); ph.setAttribute("role", "figure"); ph.setAttribute("aria-label", alt || "figure");
      import("./views.js").then(V => { V.render(src, ph, {}); if (!ph.querySelector(".vw-slot.on:not(.vw-fallback) svg, .vw-slot.on:not(.vw-fallback) p")) off(); })
        .catch(e => { console.error(e); off(); });
      if (!done) figEl[k] = ph;
      continue;
    }
    let b = null; try { b = JSON.parse(figJSON[k]); } catch { /* the server checked it; a parse is still never trusted */ }
    if (!b || b.type !== "graph") { ph.remove(); continue; }
    ph._block = b; ph.setAttribute("role", "img"); ph.setAttribute("aria-label", b.alt || "figure");
    try { Graph.render(ph, b); } catch (e) { console.error(e); ph.textContent = b.alt || ""; ph.classList.add("fig-off"); }
    if (!done) figEl[k] = ph;
  }
}                                // "1. Find the momentum before — only one cart moves"
function wishHTML(t) {
  let out = "", step = null, eqs = [], li = [];
  const put = h => { if (step === null) out += h; else step += h; };
  const flush = () => {
    if (eqs.length) put(`<div class="wl wmath${eqs.length === 1 && eqs[0].includes("boxed") ? " wans" : ""}">${eqs.join("")}</div>`);   // a lone boxed answer: no box around the box
    if (li.length) put(`<ul class="wl wlist">${li.join("")}</ul>`);
    eqs = []; li = [];
  };
  const close = () => { flush(); if (step !== null) { out += step + "</div></div>"; step = null; } };
  t = t.replace(WFIG, (m, j) => `\n\u0001FIG${figKey(j)}\n`).replace(WOUI, (m, p) => `\n\u0001FIG${figKey(OUI + p)}\n`).replace(/```[\s\S]*$/, "");   // a live figure: its placeholder; an open fence waits
  t = renumberSteps(t);                                                   // badges count 1, 2, 3 whatever digits the model typed ("1." every time is common)
  t = t.replace(/^\s*\$\$\s*\n([\s\S]*?)\n\s*\$\$\s*$/gm, (m, x) => "$$" + x.trim().replace(/\s*\n\s*/g, " ") + "$$");   // live models put $$ on lines of their own (Oct 5): one display line
  for (const l of t.split("\n")) {
    const fg = /^\u0001FIG(\d+)$/.exec(l);
    if (fg) { flush(); put(`<div class="fig wfig" data-f="${fg[1]}"></div>`); continue; }
    const s = WSTEP.exec(l), d = l.match(WDISP), b = /^\s*- (.*)$/.exec(l);
    if (s) {                                                              // a step (Gemini's steps widget): number on a dotted line, title, small subtitle
      close();
      const [title, sub] = s[2].split(/\s+[—–]\s+/);
      step = `<div class="wl wstep"><span class="wnum" aria-hidden="true">${s[1]}</span><div class="wsbody"><div class="wstitle">${wishLine(title)}</div>${
        sub ? `<div class="wssub">${wishLine(sub)}</div>` : ""}`;
      continue;
    }
    if (/^\s*---+\s*$/.test(l)) { close(); out += '<hr class="wrule">'; continue; }   // the steps end: the answer comes after the rule
    if (d) { if (li.length) flush(); eqs.push(`<div class="weq">${wishMath(esc(d[1]), true, esc(l))}</div>`); continue; }
    if (b) { if (eqs.length) flush(); li.push(`<li>${wishLine(b[1])}</li>`); continue; }
    flush();
    put(!l.trim() ? '<div class="wl wgap"></div>' : `<div class="${/\S {2,}\S/.test(l) ? "wl tbl" : "wl"}">${wishLine(l)}</div>`);   // a blank line: a short breath, not a full empty row
  }
  close();
  return out;
}
/* the ChatGPT feel (Tony, Oct 4: "bit delay feels gud"): ~900 ms of a lone blinking caret (STYLE.md bans pulsing dots), then the text
   types out at ~35 chars/s word by word, a $..$ always whole, the caret riding the end. A tap on the box skips to the end; reduced motion =
   no typing (the wait stays). */
const WISH_DOTS = 900, WISH_CPS = 35;
const WCARET = '<span class="wcaret" aria-hidden="true"></span>';
/* the wait (Tony, Oct 18): a wish now waits for a draft AND its rewrite (serve.py EDITOR), so until the first chunk Cluck says what he's up
   to, one line every WISH_SWAP ms from a random start, the caret after it; each line fades in (reduced motion: swaps, no fade). The lines are
   aria-hidden: the screen reader hears "Cluck is thinking." once. */
const WISH_LINES = ["Whipping up a duck omelette…", "Splashing in the pond…", "Fluffing feathers…", "Counting breadcrumbs…", "Quacking the numbers…", "Shining up the lamp…"];
const WISH_SWAP = 1600;
function wishCut(t, n, done) {                                            // n chars, moved to a word end; a half-open $..$ or **..** waits
  n = Math.min(t.length, Math.ceil(n));
  while (n < t.length && /\S/.test(t[n])) n++;
  const fences = t.slice(0, n).split("```").length - 1;                   // inside a live figure's fence: the whole figure at once
  if (fences % 2) { const e = t.indexOf("```", n); n = e < 0 ? (done ? t.length : t.lastIndexOf("```", n - 1)) : e + 3; }
  if (done && n >= t.length) return n;                                    // the whole text: show it, even with a pair the model never closed
  const open = [...t.slice(0, n).matchAll(/\$\$?/g)];                      // $ and $$ each open or close one formula (a $$ pair may span lines)
  if (open.length % 2) { const c = /\$\$?/g; c.lastIndex = n; const e = c.exec(t); n = e ? e.index + e[0].length : open.at(-1).index; }
  if (t.slice(0, n).split("**").length % 2 === 0) { const e = t.indexOf("**", n); n = e < 0 ? Math.max(0, t.lastIndexOf("**", n - 1)) : e + 2; }
  return n;
}
/* a /chat reply types out the same way as the steps (a chunk may be a whole line): one word at a time, a formula whole; resolves when all is shown */
function wishType(el, s) {
  return new Promise(res => {
    let last = performance.now(), drawn = -1;
    const f = now => {
      if (!el.isConnected || s.off) return res();
      s.pos = reduceMQ.matches ? s.text.length : Math.max(s.pos, s.shown) + (now - last) * WISH_CPS / 1000; last = now;
      s.shown = Math.max(s.shown, wishCut(s.text, s.pos, s.done));
      const end = s.done && s.shown >= s.text.length;
      if (drawn !== s.shown || end) { el.innerHTML = wishHTML(s.text.slice(0, s.shown)) + (end ? "" : WCARET); wishFigs(el); drawn = s.shown; }
      end ? res() : requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}
let wishRaf = 0;
function wishText() { if (!wishRaf) wishRaf = requestAnimationFrame(wishFrame); }
function wishDraw() { cancelAnimationFrame(wishRaf); wishRaf = 0; wishFrame(performance.now()); }
function wishFrame(now) {
  wishRaf = 0;
  const x = $("#cluck .wtext"), w = wish;
  if (!x || !w || !w.open) return;
  if (!w.at) w.at = now + (w.shown ? 0 : WISH_DOTS);
  const t = w.text;
  if (w.done && !t && (w.failed || w.capped)) {                           // nothing came: say so in the sheet (the chip sits under it on a phone)
    if (w.drawn !== -2) {
      if (w.off) $("#cluck .cl-ft").hidden = true;                          // no ask field: /chat has no key either
      x.innerHTML = w.off ? `<div class="wl">${CLUCK_OFF}</div>` : w.failed ? `<div class="wl">Couldn't load Cluck. <button type="button" class="wretry">Try again</button>${incHTML(w.inc)}</div>`
        : `<div class="wl">Oh duck, Cluck is tired! Come back later.</div>`;
      w.drawn = -2;
      x.querySelector(".wretry")?.addEventListener("click", e => { e.stopPropagation(); wishRetry(w); wishDraw(); });
      say(w.off ? CLUCK_OFF : w.failed ? "Couldn't load Cluck." : "Cluck is out of wishes for this hour.");
    }
    x.classList.remove("wrun"); return;
  }
  if (now < w.at || !t) {
    w.l0 ??= Math.random() * WISH_LINES.length | 0; w.w0 ??= now;
    const k = t ? -1 : (w.l0 + ((now - w.w0) / WISH_SWAP | 0)) % WISH_LINES.length;   // first chunk in: the line goes, the caret stays
    if (w.drawn !== -1 || w.line !== k) {
      x.innerHTML = k < 0 ? WCARET : `<span class="wload" aria-hidden="true">${WISH_LINES[k]}</span>${WCARET}`;
      if (k >= 0 && !w.thought) { w.thought = true; say("Cluck is thinking."); }
      w.drawn = -1; w.line = k;
    }
    w.tick = now; x.classList.toggle("wrun", !w.done || now < w.at); if (!w.done || now < w.at) wishText(); return; }
  const dt = now - (w.tick || now); w.tick = now;
  w.pos = w.skip || reduceMQ.matches ? t.length : Math.min(t.length, Math.max(w.pos || 0, w.shown) + dt * WISH_CPS / 1000);
  w.shown = Math.max(w.shown, wishCut(t, w.pos, w.done));
  const end = w.done && w.shown >= t.length;
  if (w.drawn !== w.shown || end !== w.ended) {
    if (!w.quack && w.shown > 0) {   // D72: Cluck's message opens with a QUACK, as its first body line (not in the name row)
      w.quack = lastQuack = quack(w.code + ":cluck", lastQuack);
      const msg = x.parentElement;   // the reply's first line, above the body (x itself is re-set on every draw, so the QUACK sits beside it)
      if (msg) { msg.querySelector(".cl-quack")?.remove(); x.insertAdjacentHTML("beforebegin", `<p class="cl-quack">${esc(w.quack)}</p>`); }
    }
    x.innerHTML = wishHTML(t.slice(0, w.shown)) + (!end ? WCARET : w.failed && w.inc ? `<div class="wl">${incHTML(w.inc).trim()}</div>` : "");   // the stream broke mid-reply: the code under what came
    wishFigs(x);
    w.drawn = w.shown; w.ended = end;
  }
  x.classList.toggle("wrun", !end);                                       // the rim turns while Cluck thinks and types
  if (!end) { wishText(); return; }
  if (!w.said) { w.said = true; say("Cluck's steps are open."); clAsk(); }   // no voice (Tony, Oct 5: "remove the voice option"): the screen reader hears this line
}
const wishTyped = w => w.done && w.text && w.shown >= w.text.length;
/* the peek: only the start of the steps (the rest is under the fade); wishCut never splits a $..$ */
const peekHTML = w => wishHTML(w.text.slice(0, wishCut(w.text, 600, w.done)));
let peekRaf = 0;
function peekText() {                                                       // the stream fills the peek, one draw a frame
  if (!peekRaf) peekRaf = requestAnimationFrame(() => {
    peekRaf = 0;
    const s = $(".cl-peek .cl-steps"); if (!s || !wish) return;
    const h = s.offsetHeight; s.innerHTML = peekHTML(wish);
    if (s.offsetHeight !== h) layoutFreeze();
  });
}
/* E1 LOCKED (Tony, Oct 13: T2, "okay, but how?", i20): the duck glyph + label + chevron that opens Cluck's sheet. One small piece:
   no fill at rest or pressed (NO NESTED BOX), pressed = the label turns --help and the duck tilts once. T35 may host it in an AI preview card */
const ctaHTML = (label, open) => `<button type="button" class="cl-cta" aria-expanded="${!!open}" aria-controls="cluck">${icon("i-duck")}<span>${esc(label)}</span>${icon("i-right")}</button>`;
function wishPaint() {
  const el = wishEl(), w = wish;
  document.querySelectorAll(".cl-peek").forEach(p => p.remove());
  if (!w || [404, 503].includes(w.failed)) {
    el.hidden = true;
    if (w && cl && cl.open && cl.tab === "explain" && !w.off) { if (origEl) clTab("steps", false); else clClose(); }   // the auto-open found nothing to explain (a press: the sheet says Cluck is off)
    clBackSync(); return;
  }
  const off = sideMQ.matches ? w.open                                      // desktop: while the sheet shows Cluck, "Hide" is noise (Tony, Oct 5: variant a); closed, it is the way back
    : !!origEl && w.started && !w.failed;                                   // phone + a snack: one way in, the "Compare with a similar solution" card (Tony, Oct 5, TODO C); "Explain my mistake" / "Try again" stay
  el.hidden = off;
  const cue = !!S && S.finished && S.code === w.code;                       // T17b-1: the question is closed, the duck chip under the answer (r5/B R3 REC)
  if (cue ? el.previousElementSibling !== $("#q") : el.previousElementSibling !== $("#fb")) (cue ? $("#q") : $("#fb")).after(el);
  el.classList.toggle("cue", cue);
  if (cue) {
    const ok = cueRight(), nod = w.nod && !w.nodded, q = FXL().nod;         // the nod plays once, after Next has landed: fx.js queues it after the
    if (nod) w.nodded = true;                                               // answer step (one blink); no FX queue = app.css g-nod's own delay
    el.innerHTML = `<div class="wbar"><button type="button" class="wchip cue-chip${ok ? " cue-ok" : ""}" aria-expanded="${w.open}" aria-controls="cluck"><img class="dk${nod && !q ? " g-nod" : ""}" src="rewards/icons/duck-${ok ? "calm-nod" : "out-shrug"}-128.webp" width="${ok ? 45 : 57}" height="48" alt=""><span>${ok ? "See Cluck's steps" : "Ask Cluck"}</span></button></div>`;
    if (nod && q) { const mine = S; q(() => S === mine && wish === w ? $("#wish .cue-chip .dk") : null); }
  } else if (w.started && !w.failed) {                                     // Q3 = C (Tony, Oct 13): Cluck's steps inline in the hint card, faded after ~3 lines, the CTA under the fade
    const host = $("#fb > .cluck > div");                                   // no hint card here (a hint in the Check row): the peek is its own card in #wish
    el.innerHTML = host ? "" : `<div class="cluck">${icon("i-duck")}<div></div></div>`;
    if (!off) (host || el.querySelector(".cluck > div")).insertAdjacentHTML("beforeend", `<div class="cl-peek"><div class="wtext cl-steps">${peekHTML(w)}</div>${ctaHTML("okay, but how?", w.open)}</div>`);
    el.hidden = off || !!host;
  } else {
    const label = !w.started ? "Explain my mistake" : "Oops, didn't load. Tap to try again.";
    el.innerHTML = `<div class="wbar"><button type="button" class="wchip rw-skin rw-chip${w.tapped ? "" : " rw-wiggle"}" aria-expanded="${w.open}" aria-controls="cluck"><span class="rw-coin2" aria-hidden="true">${icon("i-duck")}</span><span>${label}${w.started ? incHTML(w.inc, false) : ""}</span></button></div>`;
  }
  const btn = document.querySelector("#wish .wchip, .cl-peek .cl-cta");
  btn?.addEventListener("click", () => {
    w.tapped = true;                                                       // the ad wiggle stops for good on this question
    if (!w.started && wishFromCache(w)) { /* the reply is in this browser: finished, no call; the sheet draws it */ }
    else if (!w.started || w.failed) wishRetry(w);
    else if (btn.matches(".cue-ok") && w.key && w.key !== ckKey(w.code, S.tries.at(-1))) { clOpen("explain", "#wish .wchip"); clCompare(w); return; }   // right after a miss: the text explains the miss
    else if (w.open) { clClose(); return; }
    clOpen("explain", btn.matches(".cl-cta") ? ".cl-peek .cl-cta" : "#wish .wchip");
  });
  clBackSync();                                                            // one Cluck CTA at a time (E, Tony Oct 21): "okay, but how?" up = no "Show him" row
  layoutFreeze();
  window.stemBrainrot?.sync();                                             // the corner steps off the chip / text
}
/* ---------- Cluck's sheet (Tony, Oct 5: alt's V1 side sheet; colours from his image 3): one home for everything Cluck shows ----------
   One scroll, no tabs (Tony, Oct 5: variant a of design/mockups/cluck-merge.html): Cluck's explanation of your miss on top (the box
   text, then the follow-up chat, the ask field pinned at the bottom), and under it the original's worked solution in a fold, "See
   reference solution" (Tony's wording). The fold is open when there is no explanation, closed after a miss. Side by side it fills the notes column (the videos, hint card and pad step aside while it is open);
   on a phone it covers the screen under the orange head bar (Tony's image 1). The X or Escape closes it; focus goes back to its opener. */
const CHAT_TURNS = 5;                                                       // serve.py CHAT_TURNS: the server keeps the same count
let cl = null;   // { el, tab, open, from }
function clEl() {
  if (cl) return cl.el;
  const el = document.createElement("aside");
  el.id = "cluck"; el.className = "cl ai-skin ai-box"; el.hidden = true; el.setAttribute("aria-label", "Explain");
  el.innerHTML = `<button type="button" class="cl-grab" aria-label="Expand Cluck to full screen"><i></i></button><div class="cl-bar"><span class="cl-avw" role="img" aria-label="Cluck, online"><span class="cl-av">${icon("i-duck")}</span><i class="cl-dot"></i></span><span class="cl-title">Cluck</span><span class="tag">TUTOR</span><button type="button" class="cl-x" aria-label="Close">${icon("i-x")}</button></div>
    <button type="button" class="cl-x cl-x2" aria-label="Close">${icon("i-x")}</button>
    <div class="cl-bd"><div class="cl-pane" id="clTabEP"><div class="msg">${clWho(false)}<div class="wtext" aria-live="off"></div></div><div class="cl-thread" aria-live="polite"></div><p class="cl-verify">verify b4 use lol</p></div>
      <button type="button" class="cl-fold" id="clFold" aria-expanded="false" aria-controls="clTabSP"><span class="cl-fold-t">See reference solution</span><span class="cl-fold-n"></span>${icon("i-down")}</button>
      <div class="cl-pane" id="clTabSP"></div></div>
    <div class="cl-ft"><button type="button" class="cl-more" aria-label="Scroll down">${icon("i-down")}</button><div class="cl-fi"></div></div>`;   // .cl-fi: the ask field / done row (clAsk); the hint stays
  cl = { el, tab: "explain", open: false, from: null, fold: false };
  el.querySelector(".cl-fold").addEventListener("click", () => {
    if (!cl.fold && S && S.orig && !S.orig.open && S.orig.lvl === 3) origPeeked();   // folded away after a solve: looking again is a peek
    cl.fold = !cl.fold; clTab(cl.fold ? "steps" : cl.tab, false);
  });
  el.querySelectorAll(".cl-x").forEach(b => b.addEventListener("click", () => clClose(true)));   // desktop: the X dismisses the column (design/DISMISS.md)
  cl.dim = document.createElement("div"); cl.dim.className = "cl-dim"; cl.dim.addEventListener("click", clClose);   // K1: a tap above the sheet closes it (no dim colour: the question stays bright)
  document.body.append(cl.dim);
  clDrag(el);
  const bd = el.querySelector(".cl-bd"), ro = new ResizeObserver(clMore);   // the scroll-down hint follows the scroll, the sheet's size and the text as it types in
  bd.addEventListener("scroll", clMore, { passive: true }); ro.observe(bd); [...bd.children].forEach(c => ro.observe(c));
  el.querySelector(".cl-more").addEventListener("click", () => {
    window.stemT?.("cluck_more", { act: "tap" });   // Jev (on device: telemetry.js never sends it)
    bd.scrollBy({ top: bd.clientHeight * 0.8, behavior: reduceMQ.matches ? "auto" : "smooth" });
  });
  el.querySelector(".wtext").addEventListener("click", () => { const w = wish; if (w && w.open && !w.skip && !wishTyped(w)) { w.skip = true; w.at = 1; wishDraw(); } });   // a tap skips the typing
  clPlace();
  return el;
}
/* the phone sheet drags (Tony, Oct 13 CHATBOX PICK r2: "draggable uptop, more round, round->full animation when u dragup"; mock unified-v4 frame.js).
   One number drives it: pos = the sheet's top edge. 0 = full screen (square corners), peek = the docked top (clTop), innerHeight = gone.
   Above the dock the sheet grows (top moves, radius and dim follow); below it, it slides down and a release past 64px closes it.
   The grab + the header drag; the body drags only when it cannot scroll that way (scrolled to top for a pull down; not yet full for a pull up). */
function clDrag(el) {
  const root = document.documentElement, grab = el.querySelector(".cl-grab"), bar = el.querySelector(".cl-bar"), bd = el.querySelector(".cl-bd");
  let pos = 0, peek = 0, r0 = 30, raf = 0, full = false, d = null;
  const phone = () => !sideMQ.matches;
  const paint = () => {
    const top = Math.min(pos, peek), down = Math.max(0, pos - peek);
    el.style.setProperty("--cl-top", top + "px"); el.style.setProperty("--rr", radiusAt(pos, peek, r0) + "px");
    el.style.transform = down ? `translateY(${down}px)` : "";
    el.style.setProperty("--pp", progress(pos, peek).toFixed(3));   // the ask field, the halo: they follow the same progress
    root.style.setProperty("--da", dimAt(pos, peek, innerHeight));
  };
  const state = s => { el.dataset.state = s; grab.setAttribute("aria-label", s === "full" ? "Shrink Cluck back down" : "Expand Cluck to full screen"); };
  const settle = to => {
    if (to >= innerHeight) { cl.sheetReset(); clClose(); return; }
    full = to === 0; pos = to; paint();
    if (!full) { el.style.transform = ""; el.style.removeProperty("--rr"); el.style.removeProperty("--pp"); root.style.removeProperty("--da"); el.style.setProperty("--cl-top", peek + "px"); }
    state(full ? "full" : "peek");
  };
  const go = (to, v0 = 0) => {                                              // a spring (stiffness 380, damping 34), the mock's; reduced motion: an instant snap
    cancelAnimationFrame(raf);
    if (reduceMQ.matches) { settle(to); return; }
    let vel = v0, last = performance.now(); el.dataset.state = "moving";
    const step = now => {
      let dt = Math.min(0.032, (now - last) / 1000); last = now;
      while (dt > 0) { const h = Math.min(dt, 0.004); vel += (-380 * (pos - to) - 34 * vel) * h; pos += vel * h; dt -= h; }
      if (pos < 0) { pos = 0; vel = 0; }                                    // no gap above a full sheet
      if (Math.abs(pos - to) < 0.5 && Math.abs(vel) < 8) { settle(to); return; }
      paint(); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  cl.sheetReset = () => {                                                   // opened or closed: back to the docked, round sheet
    cancelAnimationFrame(raf); full = false; d = null; delete el.dataset.state; root.classList.remove("cl-drag");
    el.style.transform = ""; el.style.removeProperty("--rr"); el.style.removeProperty("--pp"); root.style.removeProperty("--da");
    grab.setAttribute("aria-label", "Expand Cluck to full screen");
  };
  const begin = y => {                                                      // a press became a drag
    cancelAnimationFrame(raf);
    if (!full) { peek = parseFloat(el.style.getPropertyValue("--cl-top")) || el.getBoundingClientRect().top; pos = peek; }
    d = { y0: y, p0: pos, full, s: [[performance.now(), y]] }; root.classList.add("cl-drag"); el.dataset.state = "dragging";
  };
  const track = y => { pos = clampPos(d.p0 + y - d.y0, innerHeight); d.s.push([performance.now(), y]); if (d.s.length > 6) d.s.shift(); paint(); };
  const end = () => {
    const was = d; d = null; root.classList.remove("cl-drag"); if (!was) return;
    const [t0, y0] = was.s[0], [t1, y1] = was.s.at(-1), v = Math.max(-3000, Math.min(3000, t1 > t0 ? (y1 - y0) / (t1 - t0) * 1000 : 0));
    go(snapTo(pos, peek, innerHeight, v, was.full), v);
  };
  const toggle = () => { if (!full) begin(0); d = null; root.classList.remove("cl-drag"); go(full ? peek : 0); };   // a tap / Enter on the grab
  /* the grab + header: pointer events; a press is a drag only after 6px, so a tap still presses X (or toggles from the grab) */
  let p = null;
  const down = e => { if (!phone() || e.button > 0 || e.target.closest(".cl-x")) return; p = { id: e.pointerId, y: e.clientY, grab: !!e.target.closest(".cl-grab"), on: false }; };
  const move = e => {
    if (!p || e.pointerId !== p.id) return;
    if (!p.on) { if (Math.abs(e.clientY - p.y) < 6) return; p.on = true; begin(p.y); try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} }
    e.preventDefault(); track(e.clientY);
  };
  const up = e => {
    if (!p || e.pointerId !== p.id) return;
    const q = p; p = null;
    if (q.on) end(); else if (q.grab && e.type === "pointerup") toggle();
  };
  for (const t of [grab, bar]) for (const [n, f] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]]) t.addEventListener(n, f);
  grab.addEventListener("click", e => { if (e.detail === 0 && phone()) toggle(); });   // Enter / Space (a pointer tap already toggled)
  /* the body: touch events (a pointer stream is cancelled once the browser starts a scroll). Pull up while not full = grow; pull down at scrollTop 0 = shrink/close */
  let t = null;
  bd.addEventListener("touchstart", e => { t = phone() && e.touches.length === 1 ? { y: e.touches[0].clientY, top: bd.scrollTop, on: false, native: false } : null; }, { passive: true });
  bd.addEventListener("touchmove", e => {
    if (!t || t.native) return;
    const y = e.touches[0].clientY, dy = y - t.y;
    if (!t.on) {
      if (Math.abs(dy) < 6) return;
      if ((dy < 0 && !full) || (dy > 0 && bd.scrollTop <= 0 && t.top <= 0)) { t.on = true; begin(y); } else { t.native = true; return; }
    }
    if (e.cancelable) e.preventDefault(); track(y);
  }, { passive: false });
  const tend = () => { if (t && t.on) end(); t = null; };
  bd.addEventListener("touchend", tend); bd.addEventListener("touchcancel", tend);
}
function clPlace() {                                                        // side by side: the notes column; phone: over the page
  if (!cl) return;
  const home = sideMQ.matches ? $("#work") : document.body;
  if (cl.el.parentElement !== home) home.append(cl.el);
  $("#work").classList.toggle("cl-on", cl.open && sideMQ.matches);
  window.stemBrainrot?.sheet(cl.open && sideMQ.matches);
  document.documentElement.classList.toggle("cl-open", cl.open && !sideMQ.matches);
}
function clOpen(tab, from, auto) {                                        // auto (the desktop default, Tony Oct 5): no focus, no scroll
  if (clGone && sideMQ.matches) { if (auto) return; clGoneSet(false); }    // dismissed (DISMISS.md): an auto-open waits for the student; a tap brings the column back
  window.stemT?.("cluck_open", { tab, auto: !!auto, hk: hkKind() });   // telemetry; hk = the back row's humour kind (DISMISS.md A/B)
  clEl(); if (!cl.open) cl.y = scrollY;
  cl.sheetReset?.();
  cl.open = true; cl.from = from; cl.auto = !!auto; cl.el.hidden = false; cl.fold = tab === "steps";   // opened for the steps: the fold opens; for a miss: it starts closed
  clPlace(); clTop(); clAsk(true); clTab(tab, !auto); padRule();
  layoutFreeze();
  if (sideMQ.matches && !auto) cl.el.scrollIntoView({ block: "start", behavior: reduceMQ.matches ? "auto" : "smooth" });   // the sheet is one screen tall: its ask field lands in view
}
function clClose(dismiss) {
  if (!cl || !cl.open) return;
  window.stemT?.("cluck_dwell");   // telemetry: ms + scrolled_pct are measured in telemetry.js
  const back = !cl.auto || cl.el.contains(document.activeElement);         // focus goes back to the opener, but an auto-open never pulls it
  cl.open = false; cl.wantAsk = false; cl.el.hidden = true; cl.sheetReset?.();
  clTab(cl.tab, false); clPlace(); padRule();
  layoutFreeze();
  if (!sideMQ.matches && cl.y != null) scrollTo({ top: cl.y, behavior: "instant" });       // back where the student was (clTop moved the page)
  if (dismiss === true && sideMQ.matches && !origEl) clGoneSet(true);      // desktop X / Esc: the whole column goes (DISMISS.md); with a snack's original in it, the card stays the way back
  if (cl.from && back) ($(cl.from) || $(".cl-peek .cl-cta"))?.focus({ preventScroll: true });   // the chip that opened it may be the CTA now
}
/* ---------- dismiss Cluck's column (desktop; design/DISMISS.md, Tony Oct 20: "B4 look with H humor") ----------
   html.side only: the X, Escape, or the sash dragged to the right edge folds the whole right column; the question column centres and
   its type steps up. Under the verdict, one hairline row (B4) brings it back. Its sassy line rotates (H; the one humour exception in
   chrome, STYLE.md §5); "Show him" stays put; the button's name is plain. Phones: unchanged. In memory only, never stored. */
let clGone = false, hkT = 0, hkI = 0, hkK = null;
const HK_IDLE = ["Cluck's bathing in the sunshine", "Cluck's waiting for breadcrumbs",   // Tony #36: one slot of the duck kind, a random pick each time it shows
  "Cluck's paddling in place", "Cluck's counting ripples", "Cluck's practicing his waddle", "Cluck's taking a quick dip",
  "Cluck's bobbing for snacks", "Cluck's preening, back soon", "Cluck's on a pond break", "Cluck's getting his ducks in a row"];
const HK = {                                                                // the A/B by humour kind: one kind per device (hkKind)
  sassy: ["Even ducks need a rest frame.", "Cluck's got lots of wisdom. One click and it's yours.", "Gravity's keeping us grounded here.", "Cluck waits for your next rub.", "Cluck's always here for you."],
  deadpan: ["Cluck's still here, quack!", "Cluck's got the answer", "Cluck's here if needed", "Cluck remains a duck", "Cluck's on standby"],
  duck: ["Cluck knows ducks don't cluck", HK_IDLE, "Cluck can hatch eggs. And hints, too.", "Cluck zipped his beak", "Cluck is nearby, floating"],
  nerd: ["Cluck's resting with energy", "Feathered forces at work.", "The answer is... spaghetti waves?", "Cluck's polling for input...", "Gravity: still pulling for you."],
};
const HK_DEF = "deadpan";                                                   // no telemetry id (off, DNT / GPC, no key): this kind, nothing recorded
const hkForced = (() => {                                                   // QA: #hk=<kind> (alone or after a code) or ?hk=<kind>, read once; the hash
  try {                                                                     // loses it before boot reads the code (never "Can't open hk=...")
    const m = /(?:^|[#?&])hk=([a-z]+)/.exec(location.hash + "&" + location.search.slice(1));
    if (/(^#|&)hk=/.test(location.hash)) history.replaceState(history.state, "", location.pathname + location.search + location.hash.replace(/&?hk=\w*/, "").replace(/^#&/, "#").replace(/^#$/, ""));
    return m && HK[m[1]] ? m[1] : null;
  } catch { return null; }
})();
function hkKind() {
  if (hkK) return hkK;
  if (hkForced) return (hkK = hkForced);
  const ks = Object.keys(HK);
  let i = -1; try { i = window.stemHk ? window.stemHk(ks.length) : -1; } catch { i = -1; }   // telemetry.js: a stable hash of its anonymous id
  return (hkK = Number.isInteger(i) && ks[i] ? ks[i] : HK_DEF);
}
function clGoneSet(on) {
  if (clGone === on) return;
  clGone = on;
  if (on && cl && cl.open) { cl.auto = true; clClose(); }                  // the sash drag with the sheet open: it goes with the column
  applyMT(); layoutFreeze();
}
function hkStop() { clearInterval(hkT); hkT = 0; }
function hkShow(b, roll) {
  const t = b.querySelector(".hk-t"), set = HK[hkKind()];
  const l = set[hkI % set.length];
  t.textContent = Array.isArray(l) ? l[Math.floor(Math.random() * l.length)] : l;
  if (roll) { t.classList.remove("roll"); void t.offsetWidth; t.classList.add("roll"); }   // the line slides up into place (app.css hk-roll)
}
function ctaUp() { return [...document.querySelectorAll(".cl-peek .cl-cta, #wish .cue-ok")].some(c => c.getClientRects().length > 0); }   // "okay, but how?" or "See Cluck's steps" on screen (Tony Oct 21: hide "Show him" beside either; a tap on either brings the column back)
function clBackSync() {
  const show = clGone && sideMQ.matches && !!S && !ctaUp();             // E (Tony, Oct 21): only one Cluck CTA on screen; "okay, but how?" wins
  let b = $("#clBack");
  if (!show) { if (b) b.hidden = true; hkStop(); return; }
  if (!b) {
    b = document.createElement("button"); b.type = "button"; b.id = "clBack"; b.className = "cl-back"; b.hidden = true;
    b.setAttribute("aria-label", "See Cluck's explanation");
    b.innerHTML = `${icon("i-duck")}<span class="hk" aria-hidden="true"><span class="hk-t"></span></span><span class="hk-go" aria-hidden="true">Show him</span>`;
    b.addEventListener("click", clBack);
  }
  const home = $("#freezeIn");
  if (b.parentElement !== home || b.nextElementSibling) home.append(b);       // under the verdict (and Cluck's chip / peek), last in the column
  if (!b.hidden) return;
  b.hidden = false; hkI = 0; hkShow(b, false);
  window.stemT?.("cluck_back_seen", { hk: hkKind() });                      // the A/B exposure (telemetry.js: a no-op when off)
  hkStop();
  if (!reduceMQ.matches) hkT = setInterval(() => { if (b.hidden || !b.isConnected) { hkStop(); return; } hkI++; hkShow(b, true); }, 3600);   // reduced motion: one static line
}
function clBack() {
  const w = wish, said = !!w && !!S && w.code === S.code && w.started && !w.failed && ![404, 503].includes(w.failed);
  clGoneSet(false);
  if (said || origEl) clOpen(said ? "explain" : "steps", "#clBack");
}
/* T45 idle peek (peek.js): its timer waits while Cluck is open (AMA 9). A tap on the peeking duck = Cluck (AMA 4), with no new AI call
   (T34 budget) and no auto hint (T32 pry-guard): what Cluck already has (his steps, the reference solution) opens in the sheet; else
   his own way in on the page (the "Explain my mistake" chip, the hint card) gets the focus, and the student decides; nothing there = the duck just goes */
window.stemCluckOpen = () => !!cl && cl.open;
window.stemIdleTap = () => {
  const w = wish;
  if (w && S && w.code === S.code && (!w.started || w.failed) && ![404, 503].includes(w.failed)) {   // B7 (Tony, Oct 19, pick b): no prefetch (or it failed): the duck
    w.tapped = true;                                                       // tap is the "Explain my mistake" tap, the same request (the T34 exception, an explicit tap only)
    if (w.started || !wishFromCache(w)) wishRetry(w);                      // a reply in this browser's cache: no call
    clOpen("explain", null); return;
  }
  const said = !!wish && wish.started && !wish.failed;
  if (said || origEl) { clOpen(said ? "explain" : "steps", null); return; }
  const b = [...document.querySelectorAll("#wish .wchip, .cl-peek .cl-cta, #origHd")].find(x => x.getClientRects().length);
  if (b) { b.scrollIntoView({ block: "nearest", behavior: reduceMQ.matches ? "auto" : "smooth" }); b.focus({ preventScroll: true }); }
};
/* K1 (Tony, Oct 13): on a phone the sheet docks under the question's first two lines. The page goes to its top (nothing sticky
   sits over the question there), then the sheet's top sits two lines below the question text's first line (at most 45% down: the chat keeps room) */
function clTop() {
  if (sideMQ.matches) return;
  scrollTo({ top: 0, behavior: "instant" });
  const t = $("#blocks > :not(.ptitle)") || $("#problem"); if (!t) return;
  const lh = parseFloat(getComputedStyle(t).lineHeight) || 28;
  cl.el.style.setProperty("--cl-top", Math.round(Math.min(Math.max(t.getBoundingClientRect().top + 2 * lh + 2, 48), innerHeight * 0.45)) + "px");
}
function clTab(tab, focus) {
  const has = { explain: !!wish && (wish.off || ![404, 503].includes(wish.failed)) && wish.started, steps: !!origEl };   // off: the sheet holds the one line
  if (!has[tab]) tab = has.explain ? "explain" : "steps";
  cl.tab = tab;
  if (!has.explain) cl.fold = true;                                         // nothing above it: the steps are the content
  const fold = cl.el.querySelector(".cl-fold"), n = cl.el.querySelectorAll("#clTabSP .orig-sol li").length;
  cl.el.querySelector("#clTabEP").hidden = !has.explain;
  fold.hidden = !has.steps; fold.setAttribute("aria-expanded", String(cl.fold));
  fold.querySelector(".cl-fold-n").textContent = n ? `${n} step${n > 1 ? "s" : ""}` : "";
  cl.el.querySelector("#clTabSP").hidden = !has.steps || !cl.fold;
  cl.el.querySelector(".cl-ft").hidden = !has.explain || !!wish.off;           // off: no ask field (/chat has no key either)
  const w = wish, was = !!(w && w.open);
  if (w) w.open = cl.open && has.explain;
  if (w && w.open && !was) { w.said = false; w.drawn = w.ended = undefined; wishDraw(); }   // reopened: w.shown is kept, so the text is redrawn whole, not typed again
  if (w && !w.open && was) w.tick = 0;
  if (S && S.orig) {
    S.orig.open = cl.open && has.steps && cl.fold;
    $("#origHd")?.setAttribute("aria-expanded", String(S.orig.open));
    if (S.orig.open) cl.el.querySelectorAll("#clTabSP .fig").forEach(f => { if (!f.firstChild) try { Graph.render(f, f._block); } catch (e) { f.textContent = f._block.alt || ""; } });
  }
  if (w && was !== w.open) wishPaint();                                     // the chip's label follows
  clMore();
  if (focus) {                                                              // a manual open: focus goes into the sheet (an auto open never moves it)
    const ta = cl.el.querySelector(".ask textarea");
    if (has.steps && tab === "steps") fold.focus();
    else if (sideMQ.matches && ta && !ta.disabled && !cl.el.querySelector(".cl-ft").hidden) ta.focus({ preventScroll: true });
    else { cl.wantAsk = sideMQ.matches; [...cl.el.querySelectorAll(".cl-x")].find(b => b.getClientRects().length)?.focus({ preventScroll: true }); }   // desktop: the ask field once the text is typed; phone: no keyboard pop
  }
}
/* the thread reads like a chat (Lane 2, Oct 13): no name/time line; Cluck's text on the sheet (his avatar only beside it on desktop),
   the student's words in a bubble. The speaker's name stays for screen readers */
const clWho = me => me ? '<span class="sr-only">You: </span>' : `<span class="av" aria-hidden="true">${icon("i-duck")}</span><span class="sr-only">Cluck: </span>`;
function clReset() {                                                        // a new question: close, empty, a fresh ask field
  cl?.el.querySelector("#clTabEP .cl-quack")?.remove();                     // D72: the next explanation picks its own QUACK
  if (!cl) return;
  cl.y = null;                                                              // a new question: no scroll back to the old one
  clClose();
  cl.el.querySelector(".wtext").innerHTML = "";
  cl.el.querySelector(".cl-thread").innerHTML = "";
  cl.el.querySelector(".cl-fi").innerHTML = "";
}
/* the scroll-down hint (Tony, Oct 19, variant A): while more than 8px of the text is under the ask field, .cl-bd.below shows a fade over the
   field's top edge and a chevron disc inside it (app.css); a tap scrolls ~80% of the body down; at the bottom it goes. Jev hears "shown" once
   per reply (the box text, then each chat reply) and "bottom" once per reply that showed it */
function clMore(late) {
  if (!cl) return;
  const bd = cl.el.querySelector(".cl-bd"), on = cl.open && !cl.el.querySelector(".cl-ft").hidden && bd.scrollHeight - bd.scrollTop - bd.clientHeight > 8;
  if (on === bd.classList.contains("below")) { clearTimeout(cl.moreT); cl.moreT = 0; return; }
  if (on && late !== true) { cl.moreT ||= setTimeout(() => { cl.moreT = 0; clMore(true); }, 150); return; }   // it shows once the sheet has settled (side by side the column re-fits ~70ms after it opens): no flash; it hides at once
  bd.classList.toggle("below", on);
  const k = `${wish?.code}#${cl.el.querySelectorAll(".cl-thread .wreply").length}`, m = cl.more;
  if (on && m?.k !== k) { cl.more = { k }; window.stemT?.("cluck_more", { act: "shown" }); }
  else if (!on && cl.open && m?.k === k && !m.end) { m.end = true; window.stemT?.("cluck_more", { act: "bottom" }); }   // scrolled to the end (a close is not "bottom")
}
/* the ask field (STYLE.md "Cluck's surfaces" chat): CHAT_TURNS questions, "N left", a tangerine send; it opens once the box text is out */
function clAsk(build) {
  if (!cl) return;
  const ft = cl.el.querySelector(".cl-fi"), w = wish;
  cl.el.classList.toggle("wbusy", !!w && w.busy);                          // the field's rim turns while Cluck answers
  if (!w) { ft.innerHTML = ""; return; }
  const left = w.out ? 0 : CHAT_TURNS - w.chat.filter(t => t.role === "user").length;
  if (left <= 0) { ft.innerHTML = `<div class="done-row"><p>Classic Cluck, wound down at ${CHAT_TURNS}. On to the next one.</p></div>`; return; }
  if (build || !ft.querySelector(".ask")) {
    ft.innerHTML = `<form class="ask"><label class="ff"><span class="sr-only">Ask Cluck about a step</span><textarea rows="1" maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="Ask Cluck about a step"></textarea></label><span class="left"></span><button type="submit" class="send" aria-label="Send">${icon("i-send")}</button></form>`;
    const f = ft.querySelector(".ask"), inp = f.querySelector("textarea");   // inp: the typed fields' Enter (STYLE.md §5 list), no new shortcut
    f.addEventListener("submit", e => { e.preventDefault(); const m = inp.value.trim(); if (m) { inp.value = ""; askFit(inp); clSend(m); } });
    inp.addEventListener("keydown", e => {                                  // Enter sends (as the old one-line field did); Shift+Enter is a new line; never mid-IME
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault(); if (!f.querySelector(".send").disabled) f.requestSubmit();
    });
    inp.addEventListener("input", () => askFit(inp));
  }
  const ready = wishTyped(w) && !w.busy;
  /* W110 (Tony, Oct 28): Cluck's reply to a RIGHT pick ends on its one reason, no question; this chip offers more. A tap asks it through
     the chat (clSend). Only under a reply that explains the right try (the box text or Compare's), before any follow-up */
  const t = S && S.code === w.code ? S.tries.at(-1) : null, k = t && ckKey(w.code, t);
  const why = ready && t?.v === "correct" && !w.chat.length && (w.key === k || w.cmp?.key === k);
  let wb = ft.querySelector(".cl-why");
  if (why && !wb) {
    wb = document.createElement("button"); wb.type = "button"; wb.className = "cl-why"; wb.textContent = WHY_ASK;
    wb.addEventListener("click", () => clSend(WHY_ASK));
    ft.prepend(wb);
  } else if (!why && wb) wb.remove();
  ft.querySelector(".left").textContent = `${left} left`;
  ft.querySelector("textarea").disabled = !wishTyped(w);
  ft.querySelector(".send").disabled = !ready;
  if (cl.wantAsk && cl.open && wishTyped(w)) {                              // the manual open's focus, now that the field takes it; not if the student moved on
    cl.wantAsk = false;
    const a = document.activeElement;
    if (!a || a === document.body || (a.matches(".cl-x") && cl.el.contains(a))) ft.querySelector("textarea").focus({ preventScroll: true });
  }
}
/* G (Tony, Oct 21): the ask box wraps and grows with its text up to its CSS max-height (min(6 lines, 40vh)), then scrolls inside; no animation */
function askFit(ta) {
  ta.style.height = "auto";
  const h = ta.scrollHeight, max = parseFloat(getComputedStyle(ta).maxHeight) || Infinity;
  ta.style.height = Math.min(h, max) + "px";
  ta.style.overflowY = h > max + 1 ? "auto" : "hidden";
}
/* "See Cluck's steps" after a miss, then a right try (Tony, Oct 26): the sheet's text explains the miss, so Cluck's solution for the
   right answer comes as a NEW message under it (the miss stays above as history), typed like a chat reply and scrolled into view inside the
   sheet (the page does not move). One /explain (not auto) per right answer, cached like the box text; a re-press scrolls to it. Not in the
   chat history (that alternates turns) */
async function clCompare(w) {
  const t = S.tries.at(-1) || {}, key = ckKey(w.code, t), th = cl.el.querySelector(".cl-thread");
  const bd = cl.el.querySelector(".cl-bd"), top = el => { bd.scrollTop += el.getBoundingClientRect().top - bd.getBoundingClientRect().top - 8; };   // the message's top at the body's top
  if (w.cmp && w.cmp.key === key && w.cmp.el.isConnected) { top(w.cmp.el); return; }
  const box = document.createElement("div"); box.className = "msg cl-cmp"; box.innerHTML = clWho(false) + `<div class="wtext wreply">${WCARET}</div>`;
  const re = box.lastChild;
  w.cmp = { key, el: box };
  th.append(box); top(box);
  const ty = { text: ckGet(key), pos: 0, shown: 0, done: false }, typed = wishType(re, ty);
  if (ty.text) { ty.done = true; typed.then(() => top(box)); return; }    // this browser has it: no call
  w.busy = true; clAsk();
  const t0 = Date.now(), tp = traceparent(), fr = frReq("explain", tp);
  let r = null, bytes = 0, inc = null;
  const fail = x => { inc = reqInc("explain", "/explain", t0, { q: w.code, tp, ...x }); };
  try {
    r = await fetch("explain", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, auto: false, scratch: scratchTail() }) });
    fr.h(r);
    if (!r.ok || !r.body) { if (r.status !== 429) fail({ r }); }
    else {
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { value, done } = await rd.read(); if (done) break; bytes += value.length; fr.f(); ty.text += dec.decode(value, { stream: true }); }
      fr.e(bytes);
      if (!ty.text.trim()) fail({ why: "empty", phase: "stream", bytes, status: r.status });
    }
  } catch (e) { fr.x(e); fail(r ? { e, phase: "stream", bytes, status: r.status } : { e }); }
  if (wish !== w) return;
  const ok = !!r && r.ok && ty.text.trim() && !inc;
  if (ok) { ty.done = true; await typed; if (wish !== w) return; ckPut(key, ty.text); top(box); say(speakable(stripFigs(ty.text))); }
  else { ty.off = true; w.cmp = null; re.innerHTML = wishHTML(r && r.status === 429 ? "Oh duck, Cluck is tired! Come back later." : "Didn't load. Tap Compare to try again.") + incHTML(inc); }   // COPY-PENDING: the Compare retry line
  w.busy = false; clAsk();
}
async function clSend(msg) {
  const w = wish, t = S.tries.at(-1) || {};
  if (!w || w.busy || !wishTyped(w)) return;
  const th = cl.el.querySelector(".cl-thread");
  const me = document.createElement("div"); me.className = "msg me"; me.innerHTML = clWho(true) + '<p class="md"></p>'; me.lastChild.textContent = msg;
  const box = document.createElement("div"); box.className = "msg"; box.innerHTML = clWho(false) + `<div class="wtext wreply">${WCARET}</div>`;
  const re = box.lastChild;
  th.append(me, box);
  w.chat.push({ role: "user", content: msg }); w.busy = true; clAsk();
  re.scrollIntoView({ block: "nearest" });
  w.ctl = w.ctl || new AbortController();
  let text = "", err = "", inc = null, r = null, bytes = 0;
  const ty = { text: "", pos: 0, shown: 0, done: false }, typed = wishType(re, ty);   // the reply is typed word by word as it comes, not drawn per chunk
  const t0 = Date.now(), tp = traceparent(), fail = x => { err = "fail"; inc = reqInc("chat", "/chat", t0, { q: w.code, tp, ...x }); }, fr = frReq("chat", tp);
  try {
    r = await fetch("chat", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin", signal: w.ctl.signal,
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, scratch: scratchTail(), history: [{ role: "assistant", content: w.text }, ...w.chat] }) });
    fr.h(r);
    if (r.status === 429) err = ((await r.json().catch(() => ({}))).error === "limit") ? "limit" : "hourly";
    else if (!r.ok || !r.body) fail({ r });
    else {
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        bytes += value.length; fr.f();
        text += dec.decode(value, { stream: true });
        ty.text = text;
      }
      fr.e(bytes);
      if (!text.trim()) fail({ why: "empty", phase: "stream", bytes, status: r.status });
    }
  } catch (e) { fr.x(e); if (w.ctl.signal.aborted) return; fail(r ? { e, phase: "stream", bytes, status: r.status } : { e }); }
  if (wish !== w) return;
  if (err) ty.off = true; else { ty.done = true; await typed; if (wish !== w) return; }
  w.busy = false;
  if (err) {
    w.chat.pop();                                                          // not answered: it does not count
    if (err === "limit") { w.out = true; box.remove(); }
    else re.innerHTML = wishHTML(err === "hourly" ? "Oh duck, Cluck is tired! Come back later." : "Oops, didn't load. Ask again?") + incHTML(inc);
  } else { w.chat.push({ role: "assistant", content: text }); say(speakable(stripFigs(text))); }
  clAsk();
  re.scrollIntoView({ block: "nearest" });
  if (!w.out) cl.el.querySelector(".ask textarea")?.focus();
}

/* ---------- sugar rewards (design/REWARDS-WIRING.md; rewards/engine.js + rewards/fx.js) ----------
   Sugar only, and only on questions with a saccharine layer (the brainrot corner's gate): diet and plain questions never get a HUD node,
   an FX node or a stem-rw key. rewardGo() is the one funnel: every correct pays with the bells (XP, maybe a drop); a wrong try pays a
   quiet +1 (a small "+1" by the coin, no sound, no words: Cluck and the "one more try" toast own a wrong answer). State per bank. */
const RW = () => window.Rewards || null, FXL = () => window.FX || {};
const rewardOn = () => modeOf() === "sugar" && !!S && !!(S.prob.wish || S.prob.snack || S.prob.dead) && !!RW();
const rwKey = () => bank ? bank.code : off() && window.stemOffline.fileName ? "file:" + (window.stemOffline.fileName(S.code) || "") : "solo";
const rwTF = p => p.type === "mc" && maxTries(p) === 1 && (p.choices || []).length === 2;   // a True/False row: a coin flip pays less
window.stemSkipSnack = () => modeOf() === "sugar" && !!RW() && RW().on() && RW().skipSnack();   // nav.js: Next steps over a snack while cruising
let rwHud = null;
function rwSync() {
  const on = rewardOn();
  if (on) {
    RW().gap(bank ? bank.burstGap : undefined);        // T22: the bank's burst_gap_s (absent = the engine's 15 s)
    RW().use(rwKey());
    if (!rwHud) { rwHud = document.createElement("div"); rwHud.id = "rwHud"; $("#qlist").before(rwHud);
      RW().config({ toastAt: () => ($("#fb")?.textContent.trim() ? $("#fb") : $("#q")) });   // Tony #38: the stage toast sits under the question (or its verdict line)
      RW().mountHUD(rwHud); }
    else RW().render(0);
  }
  if (rwHud) rwHud.hidden = !on;
}
function rewardTry(a, r) {
  if (!rewardOn() || (r.verdict !== "correct" && r.verdict !== "wrong")) return;
  if (r.verdict === "wrong" && window.stemRedo.has(S.code)) return;              // a redo round: no +1 farming on old misses
  const p = S.prob, multi = p.type === "multi";
  if (multi && r.verdict === "correct") return;                                 // a multi pays once every part is shut (rewardMulti)
  const firstTry = !S.tries.slice(0, -1).some(t => t.v === "wrong" && (!multi || t.part === a.part));
  rewardGo(S, { correct: r.verdict === "correct", firstTry, open: r.verdict === "wrong" && r.triesLeft > 0,
    reveal: r.verdict !== "correct" && r.correct != null });                    // T19: the answer was shown = 0 XP, still a miss
}
function rewardMulti(mine) {
  if (!rewardOn() || S !== mine || !S.solved) return;
  rewardGo(S, { correct: true, firstTry: !S.tries.some(t => t.v === "wrong") });
}
function rewardGo(mine, o) {
  const p = mine.prob;
  const res = RW().answer({ code: mine.code, correct: o.correct, firstTry: o.firstTry, reveal: !!o.reveal, snack: !!p.snack, dead: !!p.dead, tf: rwTF(p), peeked: !!mine.rwPeek,
    dwellMs: Date.now() - mine.start });
  if (o.correct && o.firstTry && p.snack && p.original) RW().origSolved(p.original.q);
  if (!o.correct && !o.open && !p.dead) setTimeout(() => rwTip("miss", $("#rwHud .rw-streak")), 1050);   // T37: a closed miss (often a T19 reveal, 0 XP); the count waits. Dead-easy has no count
  const back = o.correct && window.stemRedo.has(mine.code) && window.stemRedo.get().redeem !== false;   // a past miss (a Redeem), now right
  if (!res.xp) { RW().render(0); if (back) comeback(); return; }                 // a done code: the numbers change, nothing moves
  if (back) mine.rwBack = true;
  if (res.tick) { if (o.open) mine.rwHeld = (mine.rwHeld || 0) + res.xp; else rewardTick(res, mine); return; }   // a wrong try: +1 for trying, tiny;
  // with a try left it waits, unshown (Tony, Oct 5 clutter pass C12: nothing moves up there while the eye belongs on the hint)
  requestAnimationFrame(() => rewardShow(mine, res));                           // after finish() / feedback(): the right mark is on the page
}
/* ---------- the original beside a snack (spec 1b; design/REWARDS-WIRING.md §4) ----------
   A snack (one constant swapped) shows its Practice Exam 2 original with the worked solution. Desktop (side by side): in the pad column,
   in the scratchpad's place while it is open. Phone: a card on top of the problem, folded until tapped. Fading per original question:
   level 1 (its first snack) the whole solution; 2 (a later snack) the last line behind "Peek"; 3 (after a first-try correct on one
   of its snacks) folded. Peeking (the hidden line, or opening a level 3 original) before answering pays 2 XP and rolls no drop. */
let origEl = null;
function origRender() {
  if (origEl) { origEl.remove(); origEl = null; }
  if (cl) { if (cl.open && cl.tab === "steps") clClose(); cl.el.querySelector("#clTabSP").innerHTML = ""; }
  const p = S && S.prob, o = p && p.original;
  if (modeOf() !== "sugar" || !p.snack || !o || !Array.isArray(o.body)) return;
  const R = RW(), live = !!R && R.on() && rewardOn(), lvl = live ? R.origLevel(o.q, S.code) : 1;
  if (live) R.origSeen(o.q, S.code);
  S.orig = { lvl, open: false, peeked: false };
  const el = origEl = document.createElement("section");
  el.id = "orig"; el.className = "orig"; el.setAttribute("aria-labelledby", "origHd");
  const sol = Array.isArray(o.solution) ? o.solution : [], C = snackChg();
  /* T1 (Tony, Oct 4, picked variant A "Free hint card"; Oct 5: two words, no tagline, "it looks and feels ai-ish/extraneous"): it read as a
     topic bar, so it is a filled casino button. FREE floats over its chevron corner, after the button in the DOM so it paints on top, only
     while opening it costs nothing (level 3 = folded after a solve: looking again before answering is a peek) */
  el.innerHTML = `<button type="button" class="orig-hd rw-skin rw-hint" id="origHd" aria-expanded="false" aria-controls="cluck">${HINT_BULB}<span class="rw-hint-tx"><span class="rw-hint-t">Compare with a similar solution</span><span class="sr-only">Practice Exam 2, question ${esc(o.q ?? "")}.</span></span><span class="rw-hint-chev" aria-hidden="true">${icon("i-down")}</span></button>${lvl < 3 ? '<span class="rw-skin rw-free" aria-hidden="true">FREE</span>' : ""}
    <div class="orig-body" id="origBody">${sol.length ? `<ol class="orig-sol">${sol.map((l, i) =>
      `<li${lvl === 2 && i === sol.length - 1 ? " hidden" : ""}><span>${md(markNums(l, C.olds), true)}</span></li>`).join("")}</ol>` : ""}${lvl === 2 && sol.length ? '<button type="button" class="btn btn-label orig-peek">Peek the last step (costs ~15XP)</button>' : ""}
    <p class="orig-h">The exam question</p><div class="orig-q"></div></div>`;   // steps first: the fun part in one look (Oct 5 review)
  const q = el.querySelector(".orig-q");
  for (const [i, b] of o.body.entries()) {
    if (b.type === "text") { const d = document.createElement("div"); d.className = "md"; d.innerHTML = md(C.orig[i]); q.append(d); }
    else if (b.type === "graph") { const f = document.createElement("div"); f.className = "fig"; f.setAttribute("role", "img"); f.setAttribute("aria-label", b.alt || "figure"); f._block = b; q.append(f); }
  }
  el.querySelector(".orig-hd").addEventListener("click", () => {
    if (!S.orig.open && S.orig.lvl === 3) origPeeked();                        // folded away: looking again is a peek
    origOpen(!S.orig.open);
  });
  el.querySelector(".rw-free")?.addEventListener("click", () => el.querySelector(".orig-hd").click());   // the sticker sits on the card's corner
  const body = el.querySelector(".orig-body");
  body.querySelector(".orig-peek")?.addEventListener("click", e => {
    body.querySelector(".orig-sol li[hidden]")?.removeAttribute("hidden"); e.currentTarget.remove(); origPeeked();
  });
  clEl().querySelector("#clTabSP").append(body);   // the solution reads in Cluck's sheet, "Similar steps" tab (so look it up via body, not el)
  origPlace();
  hintNudge(el.querySelector(".rw-hint"));
  if (sideMQ.matches && lvl < 3) clOpen("steps", "#origHd", true);           // desktop: the free steps open by default (Tony, Oct 5); folded (lvl 3) stays a peek
}
/* the card's one nudge: a 600 ms lift + one shine, once per browser session, a beat after it is fully on screen; never with reduced motion */
const HINT_BULB = `<span class="rw-hint-coin" aria-hidden="true"><svg viewBox="0 0 32 32"><defs><linearGradient id="hbA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#f5a623"/></linearGradient><linearGradient id="hbB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c3d6"/><stop offset="1" stop-color="#6f7c94"/></linearGradient></defs><path d="M16 3C10.5 3 6.5 7.2 6.5 12.3c0 3.3 1.7 5.6 3.4 7.4 1.1 1.2 1.6 2.4 1.6 3.6h9c0-1.2.5-2.4 1.6-3.6 1.7-1.8 3.4-4.1 3.4-7.4C25.5 7.2 21.5 3 16 3z" fill="url(#hbA)"/><path d="M12 9.5c.9-1.6 2.4-2.6 4.2-2.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/><path d="M13.3 23.3v-4.6l2.7 2.2 2.7-2.2v4.6" fill="none" stroke="#c77800" stroke-width="1.4" stroke-linejoin="round"/><rect x="11" y="23" width="10" height="3.2" rx="1.2" fill="url(#hbB)"/><rect x="11.8" y="26" width="8.4" height="2.6" rx="1.2" fill="#5b6780"/><rect x="13.8" y="28.3" width="4.4" height="1.7" rx=".8" fill="#3e4859"/></svg></span>`;
function hintNudge(btn) {
  let seen = false; try { seen = sessionStorage.getItem("stem-hint-nudged") === "1"; } catch { /* blocked: nudge once anyway */ }
  if (!btn || seen || reduceMQ.matches || !("IntersectionObserver" in window)) return;
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting) return; io.disconnect();
    setTimeout(() => { btn.classList.add("rw-nudge"); try { sessionStorage.setItem("stem-hint-nudged", "1"); } catch { /* */ } }, 1350);
  }, { threshold: 0.9 }).observe(btn);
}
function origPeeked() {
  if (S.finished || S.tries.length || S.orig.peeked) return;                    // a look after answering is free
  S.orig.peeked = S.rwPeek = true;
}
function origOpen(open) {
  if (!origEl) return;
  if (open) clOpen("steps", "#origHd"); else clClose();
}
function origPlace() {
  if (!origEl) return;
  const rot = $("#rot.docked");                                                    // desktop: the docked videos stay first in the notes column
  if (sideMQ.matches) { if (rot && rot.parentElement === $("#work")) rot.after(origEl); else $("#work").prepend(origEl); }
  else $("#freezeIn").prepend(origEl);
}
/* a wrong try's +1 (Tony, Oct 4: participation trophy): a small quiet "+1" by the HUD coin, the count ticks; no sparks, no sound, no words,
   so a right answer still feels much bigger (design/REWARDS.md: a loss dressed up as a win) */
function rewardTick(res, mine) {
  const coin = $("#rwCoin"), fx = FXL(), n = res.xp + (mine.rwHeld || 0); mine.rwHeld = 0;
  if (fx.float && coin && rwHud && !rwHud.hidden) fx.float(coin, `+${n}`, "fx-float-sm");
  RW().render(n);
}
const rwSeen = el => { const r = el && rwHud && !rwHud.hidden ? el.getBoundingClientRect() : null; return !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
async function rewardShow(mine, res) {
  const fx = FXL();
  const at = $("#q .opt.right") || $("#ff.ok") || [...document.querySelectorAll("#q .part .ff.ok")].pop() || $("#q");
  fx.pop && fx.pop(at);                                                          // the bells on every correct: pop, sparks + confetti,
  fx.sparks && fx.sparks(at, mine.prob.snack || mine.prob.dead ? "small" : "medium");             // "+N XP" rising, coins to the HUD, a shine on the coin pill
  fx.float && fx.float(at, `+${res.xp} XP`);
  const coin = $("#rwCoin");
  rwHud?.classList.remove("rw-z-xp");                                            // C1: the 0 balance was hidden; the first reward brings it in, coins fly to it
  if (rwSeen(coin)) { fx.coinFly && fx.coinFly(at, coin, Math.min(8, Math.max(2, Math.round(res.xp / 2)))); fx.shine && fx.shine(coin); }
  const held = mine.rwHeld || 0; mine.rwHeld = 0;
  fx.hud ? fx.hud(() => RW().render(res.xp + held)) : setTimeout(() => RW().render(res.xp + held), 675);   // the +1s held back count up with it; fx.js: in the HUD step (one blink)
  say(`Correct! +${res.xp} XP.${res.levelUp ? ` Level ${res.level}.` : ""}${res.line ? " " + res.line : ""}${res.sub && res.sub !== "+50 XP" ? " " + res.sub : ""}`);
  if (!res.drop && res.burst !== "levelup" && !res.streakNote) { if (mine.rwBack) comeback(); else if (!mine.prob.dead) setTimeout(() => rwTip("right", $("#rwCoin")), 1050); return; }
  /* flow C (Tony, Oct 21): one beat per answer, at most one overlay. A level up is the only overlay, with the slot reels spinning inside
     it when the same answer dropped; any other drop (WIN / BONUS / LEGEND) or a streak note is the banner (LEGEND: gold + small confetti) */
  if (res.burst === "levelup" && fx.burst) {                                 // engine.js: a level up from a +1 or a dead-easy one stays quiet
    await fx.burst("levelup", { title: "LEVEL UP", sub: `LEVEL ${res.level}`, drop: res.drop || null });
    if (mine.rwBack) comeback();
    return;
  }
  const line = res.drop ? res.line : res.streakNote;
  if (mine.rwBack) comeback();                                                   // a right Redeem owns the one toast slot (G2c row 28); the streak still counts, say() read it
  else if (line === res.streakNote && res.streak === 3 && rwTip("three", $("#rwHud .rw-star"))) { /* T37: the onboarding line says "3 cracked" itself */ }
  else if (line && fx.toast) { hideToast(); fx.toast(line, res.drop ? res.sub || res.streakNote : null, res.drop || null); }
  else if (!mine.prob.dead) rwTip("right", $("#rwCoin"));
}
/* T37 sugar onboarding (Tony, Oct 15; brain chat-redesign-2026-10-13/sugar-onboard, V1 toast trail): the HUD explains itself the first
   time each piece matters, in the plain toast (STYLE.md §3) with its caret on that piece. Per device (stem-ob-rw-<beat> = times shown).
   The miss beat speaks 3 times: the plain line, then two humor lines (Tony: "as we got used to ui already"), then never again.
   It never stacks: a toast already up wins and the beat waits for the next time. A piece not on screen (C1: the count is hidden at 0)
   waits too, uncounted. */
const RW_OB = { right: ["Points always go up and never let you down."], three: ["THREE STREAK! See your progress here."],
  miss: ["Did an oopsie or two? Your progress is safe!", "Double whammy! That's OK, happens to the best of us.", "They say third time's the charm, QUACKK—"],   // copy: Tony, Oct 15 22:5x PT (his emoji left out: STYLE §4); lines 1 + 3 Tony #36, line 2 Tony, Oct 26
  redo: ["Gravity pulled you back for review."] };                                // Tony, Oct 19: say it the first time a miss comes back
/* the redo beat: a Redeem showing (a past miss back, the "Pity roll" tag) opens unanswered; caret on the tag. Before the first
   answer only, so it never meets the one-more-try note or the Comeback toast */
function rwRedoTip() {
  const r = window.stemRedo.get();
  if (S && !S.finished && !S.tries.length && r && r.redeem !== false && r.codes.includes(S.code)) rwTip("redo", $("#rtag"));
}
function rwTip(beat, at) {
  if (!rewardOn() || toastAt || !rwSeen(at)) return false;
  const k = "stem-ob-rw-" + beat, lines = RW_OB[beat];
  try { const n = +localStorage.getItem(k) || 0; if (n >= lines.length) return false; localStorage.setItem(k, n + 1); toast(lines[n], at);
    window.stemT?.("_ob", { beat, n: n + 1 }); return true; }                     // intent.js log only ("ob <beat> <n>"): Jev sees which note it just met
  catch { return false; }                                                        // blocked storage: no way to keep it once, so never
}

/* a redo round's right answer on a past miss: a toast, no XP (the code paid once already; nothing to farm) */
function comeback() {
  const fx = FXL();
  if (fx.toast) { hideToast(); fx.toast("HONK HONK. Spacetime just applauded.", "Energy bounced BACK, quack!"); }
  say("Comeback. Missed it before, got it now.");
}

/* ---------- scratchpad + Copy ---------- */
let mounted = null;      // the box mounted for the open problem; S is replaced on every load, so the old one is kept here
function mountBox() {
  if (mounted) { mounted.box.destroy(); mounted.corner.destroy(); }
  const field = $("#xbField"); field.querySelector("textarea")?.remove();
  const ta = document.createElement("textarea");
  Object.assign(ta, { rows: 4, spellcheck: true, placeholder: "Paste GPT answer here, but me be sad..." });
  ta.setAttribute("autocapitalize", "sentences"); ta.setAttribute("autocomplete", "off");
  ta.id = "scratch"; ta.setAttribute("aria-labelledby", "xbName");
  field.prepend(ta);
  /* C10 (Tony, Oct 5): Copy shows only when the box has text. Listened before reserveCorner's, so the corner sees the button as it is */
  const copyBtn = $("#copy"), syncCopy = () => { copyBtn.hidden = !ta.value; };
  ta.addEventListener("input", syncCopy); ta.addEventListener("xb-cap", syncCopy); syncCopy();
  /* the box stops growing at the bottom of the visible viewport (minus the bottom dock) and scrolls inside itself */
  S.box = ExplainBox.mount(ta, { bottomInset: dockRoom,
    cap: () => swapOn ? swapPadMax : mtCap });                                  // Swap: the room the peek leaves
  S.corner = ExplainBox.reserveCorner(ta, copyBtn);
  mounted = { box: S.box, corner: S.corner };
  /* typing at the end: keep the whole bottom band in view (browsers only scroll the caret itself in), so the caret stays clear of Copy
     and of where the revealed code bar lies */
  ta.addEventListener("input", () => { if (ta.selectionEnd === ta.value.length && ta.scrollHeight > ta.clientHeight) ta.scrollTop = ta.scrollHeight; });
  autosave(ta);
}
/* ---------- scratchpad autosave (design/shots/autosave-*.png): draft per bank + code in localStorage.
   3 s after the last edit: "saving" (a light band sweeps through it), then "saved", gone after 2 s. Reduced motion: no sweep. */
const SAVE_IDLE = 3000, SAVE_SHOW = 700, SAVED_SHOW = 2000;
const padKey = code => "stem-pad:" + ((window.stemOffline && window.stemOffline.fileName && window.stemOffline.fileName(code)) || "server") + ":" + code;
function padGet(code) { try { return localStorage.getItem(padKey(code)) || ""; } catch { return ""; } }
function padPut(code, v) { try { if (v) localStorage.setItem(padKey(code), v); else localStorage.removeItem(padKey(code)); return true; } catch { return false; } }
let saveTimers = [], savePending = null;
function autosave(ta) {
  const st = $("#xbSave"), code = S.code;
  for (const t of saveTimers) clearTimeout(t);
  saveTimers = []; st.className = "xb-save"; st.textContent = "";
  const draft = padGet(code);
  if (draft) { ta.value = draft; ta.dispatchEvent(new Event("xb-refit")); ta.dispatchEvent(new Event("xb-cap")); }
  const flush = () => { if (savePending) { padPut(savePending.code, savePending.ta.value); savePending = null; } };
  flush();
  ta.addEventListener("input", () => {
    for (const t of saveTimers) clearTimeout(t);
    st.className = "xb-save"; st.textContent = "";
    savePending = { code, ta };
    saveTimers = [setTimeout(() => {
      flush();
      st.className = "xb-save saving"; st.textContent = "saving";
      saveTimers = [setTimeout(() => {
        st.className = "xb-save"; st.textContent = "saved";
        saveTimers = [setTimeout(() => { st.textContent = ""; }, SAVED_SHOW)];
      }, SAVE_SHOW)];
    }, SAVE_IDLE)];
  });
  autosave.flush = flush;
}
addEventListener("pagehide", () => autosave.flush && autosave.flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && autosave.flush) autosave.flush(); });
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  /* plain-http LAN (serve.py): no async clipboard, use a hidden textarea */
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.append(t); t.select(); t.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
  t.remove();
  return ok;
}
/* Copy: the notes, tries, hints and edit history as one payload; the notes stay (C10: Cut all is gone) */
async function copyPad() {
  if (!S) return;
  const b = $("#copy"), box = S.box;
  box.snapshot();
  const payload = stringify(build({ code: S.code, start: S.start, tries: S.tries, hints: S.hints, explain: box.el.value, history: box.getHistory() }));
  const ok = await copyText(payload);
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed. Try again.");
  setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 1600);
}
$("#copy").addEventListener("click", copyPad);
/* a codeblock's Copy: the raw code (the line numbers are CSS, never text), then i-ok for 2 s. Capture: the tap does nothing else */
document.addEventListener("click", async e => {
  const b = e.target.closest?.(".cb-copy"); if (!b) return;
  e.stopPropagation();
  const ok = await copyText([...b.closest(".cb").querySelectorAll(".l")].map(l => l.textContent).join("\n"));
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed. Try again.");
  clearTimeout(b.doneT); b.doneT = setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 2000);
}, true);

/* ================= freeze layer (design/FREEZE.md) =================
   .freeze is position: sticky. Its max height follows the *visual* viewport, so a tall problem becomes a strip
   with its own scroll instead of covering the scratchpad. On iOS Safari the keyboard does not shrink the layout
   viewport, and sticky/fixed stick to the layout viewport, so --kb-top moves the strip down by visualViewport.offsetTop. */
const freeze = $("#freeze"), freezeIn = $("#freezeIn"), more = $("#more"), sentinel = $("#sentinel");
let tallest = 0, lastW = 0;
const vv = window.visualViewport;
function editing() { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")); }
/* entry box: fixed bottom-centre on phones / touch (one thumb), top of the column on desktop (FREEZE.md) */
const dockMQ = matchMedia("(max-width: 700px), (pointer: coarse)");
const sideMQ = matchMedia("(min-width: 720px)");                       // multitask: problem | pad side by side from here up (design/MULTITASK.md)
/* the room the bottom bar takes from the page: its full height, or the strip's while it rests as a strip (revealed, it lies over the page) */
const barTab = $("#barTab");
function dockRoom(evenAway) {
  if (!dock.getClientRects().length) return 0;                                  // hidden (a bank's list closed on a phone: app.css C8)
  if (!root.classList.contains("dock-bottom") || (!evenAway && root.classList.contains("dock-away"))) return 0;
  if (!root.classList.contains("bar-mini")) return dock.offsetHeight;
  if (!root.classList.contains("bar-open")) stripRoom = dock.offsetHeight || stripRoom;    // measured as a strip (incl. the safe-area inset); kept while revealed
  return stripRoom;
}
let stripRoom = 24;
function barOpen(open) {
  open = open && dockMQ.matches;                             // the phone / touch strip's state only: on desktop bar-open would park the docked corner (W101, LEAKS L1)
  root.classList.toggle("bar-open", open);
  if (open && root.classList.contains("bar-mini")) root.style.setProperty("--bar-over", Math.max(0, dock.offsetHeight - stripRoom) + "px");
  barTab.setAttribute("aria-expanded", open);
  barTab.setAttribute("aria-label", open ? "Hide code box" : "Show code box");
}
/* tap toggles; a swipe (20px+) up opens, down closes. The tab never takes focus: the scratchpad keeps its caret and keyboard */
function swipeTab(el, act) {
  let y0 = null, used = false;
  el.addEventListener("pointerdown", e => { e.preventDefault(); y0 = e.clientY; used = false; try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
  el.addEventListener("pointermove", e => { if (y0 === null || used) return; const dy = e.clientY - y0; if (Math.abs(dy) > 20) { used = true; act(dy < 0 ? "up" : "down"); } });
  el.addEventListener("pointerup", () => { y0 = null; });
  el.addEventListener("pointercancel", () => { y0 = null; });
  el.addEventListener("click", () => { if (!used) act("tap"); used = false; });
}
new MutationObserver(() => { if ($("#entryMsg").textContent || !retryLoad.hidden) barOpen(true); }).observe(dock, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });   // a message or Retry: shown
dock.addEventListener("focusin", e => { if (e.target !== barTab) barOpen(true); });   // keyboard / Tab into the code box: shown
swipeTab(barTab, d => barOpen(d === "tap" ? !root.classList.contains("bar-open") : d === "up"));
/* C7 (Tony, Oct 5 clutter pass): desktop, no bank: the label opens the code box; the box folds back once focus leaves it (a message keeps it) */
/* a press on the label must not move focus: the focusin it caused ran barOpen / layoutFreeze / fabSync between pointerdown and click, the layout shifted under the
   pointer and the click landed on <body> (G2c row 10: only the 2nd click worked). Same pattern as swapBtn: cancel the press, act on the click (keyboard focus is unchanged) */
for (const ev of ["pointerdown", "mousedown"]) $("#codeChip").addEventListener(ev, e => e.preventDefault());
$("#codeChip").addEventListener("click", () => { root.classList.add("entry-open"); const c = $("#code"); c.focus(); c.select(); });
$("#entry").addEventListener("focusout", e => {
  if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => { if (!$("#entry").contains(document.activeElement) && S) root.classList.remove("entry-open"); }, 0);
});
/* C8: phones, a bank open: the code bar shows only with the list (app.css), up and ready to type */
addEventListener("drill:qlist", e => { if (dockMQ.matches && root.classList.contains("bar-mini")) barOpen(e.detail.open); layoutDock(); });
function layoutDock() {
  const bottom = dockMQ.matches, h = vv ? vv.height : innerHeight;
  if (innerWidth !== lastW) { lastW = innerWidth; tallest = 0; }        // orientation / window change
  tallest = Math.max(tallest, innerHeight, h);
  root.classList.toggle("dock-bottom", bottom);
  const inDock = dock.contains(document.activeElement);
  const shrunk = bottom && !!tallest && h < tallest * 0.8;
  const kb = shrunk && editing();
  /* Swap (design/SWAP.md): keyboard up + a field in <main> has focus. Once on, it stays on while focus is anywhere in <main>
     (its buttons too) and for a moment after focus is lost (the keyboard is still sliding away), until the viewport grows back. */
  const a = document.activeElement, inMain = !!a && a !== document.body && mainEl.contains(a);
  const grace = (!a || a === document.body) && performance.now() - lostAt < 500;
  const swapNext = !!S && !freeze.hidden && shrunk && !mtOpen && !sideMQ.matches && ((inMain && (editing() || swapOn)) || (swapOn && grace));
  root.classList.toggle("kbup", !!kb || swapNext);                    // keyboard up: no expand icon, no pill, no toggle (design/MULTITASK.md)
  /* keyboard up while typing elsewhere (scratchpad, answer): the box steps aside so it can't cover the caret */
  root.classList.toggle("dock-away", (!!kb && !inDock) || swapNext || (mtOpen && !!S));
  root.classList.toggle("bar-off", !!a && a.id === "scratch");        // from where focus IS, not from focus events: the keyboard can go and come without them
  if (swapNext !== swapOn) setSwap(swapNext);
  /* keyboard up while typing the code: ride on top of the keyboard (iOS keeps fixed elements on the layout viewport) */
  const lift = kb && inDock && vv ? Math.max(0, innerHeight - (vv.offsetTop + vv.height)) : 0;
  root.style.setProperty("--kb-bottom", lift + "px");
  root.classList.toggle("bar-mini", bottom && !!S && !freeze.hidden);
  /* start page: no problem open. The entry stands alone, centred under its title (app.css html.start); on phones in the area
     above the keyboard, so --kb-top follows the visual viewport here too (layoutFreeze owns it once a problem is open) */
  root.classList.toggle("start", !S);
  if (!S) root.style.setProperty("--kb-top", kb && inDock && vv ? Math.max(0, vv.offsetTop) + "px" : "0px");
  root.style.setProperty("--dock-h", bottom ? dockRoom(true) + "px" : "0px");
}
if (dockMQ.addEventListener) dockMQ.addEventListener("change", () => { barOpen(dock.contains(document.activeElement)); layoutDock(); layoutFreeze(); });   // W101: to the strip while typing the code: it opens with the box; to the desktop bar: no bar-open
new ResizeObserver(() => layoutDock()).observe(dock);

function layoutFreeze() {
  layoutDock();
  if (!S || freeze.hidden) return;
  if (swapOn) { layoutSwap(); return; }
  if (mtOpen || sideMQ.matches) { layoutMT(); return; }                           // multitask: the panes own the sizes
  if (root.classList.contains("pad-off")) {                                      // phones, pad off: nothing below needs room, so no strip
    freeze.classList.remove("clipped", "stuck", "open"); more.hidden = true;     // cap, no fade, no pull-tab (Tony: "big ass dark space")
    root.style.setProperty("--freeze-h", "0px");
    return;
  }                                         // one pane above the keyboard: none of the strip logic applies
  const dockH = dockRoom();
  const h = (vv ? vv.height : innerHeight) - dockH;
  const kb = editing() && h + dockH < tallest * 0.8;                            // software keyboard is up
  const inFreeze = freeze.contains(document.activeElement);
  const kbWas = root.classList.contains("kb");
  root.classList.toggle("kb", kb);
  root.style.setProperty("--kb-top", kb && vv ? Math.max(0, vv.offsetTop) + "px" : "0px");
  const frac = kb && !inFreeze ? 0.34 : h < 720 ? 0.5 : h < 960 ? 0.6 : 0.7;
  root.style.setProperty("--freeze-max", Math.round(Math.max(kb ? 96 : 180, h * frac)) + "px");
  requestAnimationFrame(() => {
    const clipped = !freeze.classList.contains("open") && freezeIn.scrollHeight > freezeIn.clientHeight + 2;
    const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2;
    freeze.classList.toggle("clipped", clipped && !atEnd);
    more.hidden = !clipped && !freeze.classList.contains("open");
    root.style.setProperty("--freeze-h", freeze.classList.contains("open") ? "0px" : freeze.offsetHeight + "px");
    stuck();
    if (S.box) S.box.limit();                                                     // scratchpad cap follows the visible viewport and dock
    if (kb && !kbWas && !inFreeze) showQuestion();
  });
}
function stuck() {
  if (!S || freeze.hidden || swapOn || mtOpen || sideMQ.matches || root.classList.contains("pad-off")) { freeze.classList.remove("stuck"); return; }
  const top = parseFloat(getComputedStyle(freeze).top) || 0;
  const now = !freeze.classList.contains("open") && sentinel.getBoundingClientRect().top < top - 0.5;
  const was = freeze.classList.contains("stuck");
  freeze.classList.toggle("stuck", now);
  if (now && !was) showQuestion();
}
/* When the layer freezes, scroll its own box so the question (and any hint) sits at the bottom of the strip:
   the question is what you answer while writing; the problem start is one small scroll up. */
function showQuestion() {
  if (swapOn || mtOpen || sideMQ.matches) return;
  const bottom = e => e.offsetHeight ? e.offsetTop + e.offsetHeight : 0;   // offsets are relative to .freeze-in
  const end = Math.max(bottom($("#q")), bottom($("#fb")));
  freezeIn.scrollTop = Math.max(0, end - freezeIn.clientHeight + 4);
}
let raf = 0;
const onView = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutFreeze); };
if (vv) { vv.addEventListener("resize", onView); vv.addEventListener("scroll", onView); }
addEventListener("resize", onView);
addEventListener("scroll", () => stuck(), { passive: true });
/* html.scrolled: content has moved up under the pinned phone top bar, so its scroll-edge fade shows (app.css "scroll edges").
   A class, not a scroll-driven animation: that one never ends, and rewards/fx.js waits for the page's animations to finish */
const edge = () => root.classList.toggle("scrolled", scrollY > 0);
addEventListener("scroll", edge, { passive: true }); edge();
/* --top-h: the pinned desktop bar's height; app.css sticks the side columns under it */
const topBar = $(".top");
if (topBar && window.ResizeObserver) new ResizeObserver(() => root.style.setProperty("--top-h", topBar.offsetHeight + "px")).observe(topBar);
document.addEventListener("focusin", onView);
document.addEventListener("focusout", e => { if (!e.relatedTarget) lostAt = performance.now(); setTimeout(onView, 60); setTimeout(onView, 520); });
freezeIn.addEventListener("scroll", () => { if (swapOn) { swapFade(); return; } const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2; freeze.classList.toggle("clipped", !atEnd && !freeze.classList.contains("open")); }, { passive: true });
swipeTab(more, d => { const open = freeze.classList.contains("open"); if (d === "tap" || (d === "down") !== open) toggleMore(); });
function toggleMore() {
  const open = !freeze.classList.contains("open");
  freeze.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open);
  more.setAttribute("aria-label", open ? "Make question small" : "Show whole question");
  if (!open) freeze.scrollIntoView({ block: "nearest" });
  layoutFreeze();
}
/* ================= Swap (design/SWAP.md) =================
   Keyboard up = ONE pane fills the visible area above the keyboard: the problem (card, answer pinned at its bottom) or the
   scratchpad (question peek on top, the box anchored to the bottom and growing upward). One icon toggle switches; focusing a field
   picks the pane too. layoutDock() decides when it is on; CSS (html.swap, .swap-problem, .swap-scratch) does the layout;
   this code sets the pane, the sizes CSS cannot know (--vv-h, --peek-max, the scratchpad's cap) and moves focus. */
const swapBtn = $("#swap"), stage = $("#stage"), problemEl = $("#problem"), work = $("#work");
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
let pane = "problem", shownPane = "problem", swapY = 0, swapPadMax = null;
const GAP = 8;                                                                   // between the peek and the scratchpad: small, the box has no outside ring
const paneOf = el => !el || !el.closest ? null : work.contains(el) ? "scratch" : el.closest("#q, #fb") ? "problem" : null;
function setSwap(on) {
  swapOn = on;
  if (on) {
    swapY = scrollY;
    root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");              // the page keeps its height, so its scroll position survives
    const p = paneOf(document.activeElement); if (p) pane = p;
    root.classList.add("swap");
    applyPane();
  } else {
    root.classList.remove("swap", "swap-problem", "swap-scratch");
    swapBtn.hidden = true; swapPadMax = null;
    freeze.classList.remove("clipped", "no-peek");
    if (scrollY !== swapY) scrollTo(0, swapY);
    requestAnimationFrame(() => { if (S && S.box) S.box.limit(); });
    backInView();
  }
}
/* the DOM change: classes, toggle, scroll positions, sizes */
function applyPane() {
  shownPane = pane;
  root.classList.toggle("swap-problem", pane === "problem");
  root.classList.toggle("swap-scratch", pane === "scratch");
  swapBtn.dataset.pane = pane;
  swapBtn.setAttribute("aria-label", pane === "problem" ? "Show notes" : "Show question");
  padPeekText();
  layoutSwap();                                                                   // scroll positions are left alone (a reset lost the field you typed in)
}
/* crossfade between panes (View Transitions where supported), instant with reduced motion or without support.
   Focus has already moved (it must, in the tap, for the keyboard to stay), so the fields are focusable in both states. */
function setPane(p) {
  if (p === pane) return;
  pane = p;
  if (!swapOn) return;
  if (document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyPane); else applyPane();
}
function layoutSwap() {
  if (!swapOn || !S) return;
  const h = vv ? vv.height : innerHeight;
  root.style.setProperty("--vv-h", Math.round(h) + "px");
  root.style.setProperty("--kb-top", (vv ? Math.max(0, vv.offsetTop) : 0) + "px");
  const cell = stage.clientHeight - 6;                                             // minus the stage's focus-ring room
  const cs = getComputedStyle(S.box.el), padMin = 3 * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + 28 + 4 || 130;   // 3 lines (not min-height: Swap sets it to the cap)
  const peekMax = Math.max(0, Math.min(Math.round(h * 0.6), cell - padMin - GAP));
  root.style.setProperty("--peek-max", peekMax + "px");
  const noPeek = peekMax < 40;
  freeze.classList.toggle("no-peek", noPeek);
  let peek = 0;
  if (!noPeek) {
    if (shownPane === "scratch") peek = freeze.offsetHeight;
    else { const how = $("#how"); peek = Math.min(peekMax, problemEl.scrollHeight + (how ? how.offsetHeight + 16 : 0) + 8); }   // what the peek will be
  }
  swapPadMax = Math.max(padMin, cell - (peek ? peek + GAP : 0));
  root.style.setProperty("--pad-max", swapPadMax + "px");
  S.box.limit();
  swapFade();
}
/* subtle bottom fade on whichever box is scrolling (the peek, or the question in the problem pane) while it has more below */
function swapFade() {
  if (!swapOn) return;
  const sc = shownPane === "scratch" ? freezeIn : problemEl;
  freeze.classList.toggle("clipped", sc.scrollHeight > sc.clientHeight + 2 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2);
}
problemEl.addEventListener("scroll", swapFade, { passive: true });
/* the main field of a pane: the scratchpad; or the first empty answer box, or the picked / current choice */
function focusField(p) {
  let el = null;
  if (p === "scratch") el = S.box && S.box.el;
  else {
    const ins = [...document.querySelectorAll("#q .ans")].filter(x => x.getClientRects().length && !x.disabled);   // a hidden fix box can't take focus
    const back = lastEdit && ins.includes(lastEdit) ? lastEdit : null;                                   // the field you were typing in
    el = back || (ins.length ? ins.find(x => !x.value.trim() && !x.readOnly) || ins[0]
      : opts().find(o => o.getAttribute("aria-checked") === "true") || opts().find(o => !o.disabled && o.tabIndex === 0) || opts().find(o => !o.disabled));
  }
  if (!el) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}
/* the toggle must not take focus from the field (that would drop the keyboard): pointerdown/mousedown are cancelled, and the click puts
   focus straight into the other pane's field, in the same tap */
for (const ev of ["pointerdown", "mousedown"]) swapBtn.addEventListener(ev, e => e.preventDefault());
swapBtn.addEventListener("click", () => { const next = pane === "problem" ? "scratch" : "problem"; focusField(next); setPane(next); });
/* focus picks the pane; focusing the scratchpad also sends the top bar away (nav row: slides up and fades, keeps its space) */
document.addEventListener("focusin", e => {
  root.classList.toggle("bar-off", e.target.id === "scratch");
  const p = paneOf(e.target); if (p) setPane(p);
});
document.addEventListener("focusout", () => setTimeout(() => root.classList.toggle("bar-off", document.activeElement && document.activeElement.id === "scratch"), 0));

/* keyboard up, PROBLEM pane: the pad peek (one line above the keyboard). Its text is the pad's last line; empty pad = "Scratchpad".
   A tap goes to the pad in the same tap: pointerdown / mousedown are cancelled (focus stays in the field, the keyboard stays up), then the
   click focuses the pad with the caret at the end, and focus picks the pane. The mirror of the question peek in the SCRATCHPAD pane. */
const padPeek = $("#padPeek"), padPeekTx = $("#padPeekTx");
function padPeekText() {
  const t = S && S.box ? S.box.el.value : "";
  const last = t.split("\n").map(x => x.trim()).filter(Boolean).pop();
  padPeekTx.textContent = last || "Notes";
  padPeek.classList.toggle("empty", !last);
}
padPeek.hidden = false;                                                         // CSS shows it only in the PROBLEM pane
for (const ev of ["pointerdown", "mousedown"]) padPeek.addEventListener(ev, e => e.preventDefault());
padPeek.addEventListener("click", () => {
  if (!S || !S.box || padGone()) return;
  if (root.classList.contains("pad-off")) openMT();                              // phones: the pad lives on the pad page
  const ta = S.box.el, n = ta.value.length;
  ta.focus({ preventScroll: true }); ta.setSelectionRange(n, n); ta.scrollTop = ta.scrollHeight;
  setPane("scratch");
});
document.addEventListener("input", e => {
  if (S && S.box && e.target === S.box.el) padPeekText();
  if (e.target.matches && e.target.matches("#main input, #main textarea")) lastEdit = e.target;
});
/* SCRATCHPAD pane: a tap on the question peek goes back to the answer, in the same tap */
for (const ev of ["pointerdown", "mousedown"]) freeze.addEventListener(ev, e => { if (swapOn && shownPane === "scratch") e.preventDefault(); });
freeze.addEventListener("click", () => { if (swapOn && shownPane === "scratch" && focusField("problem")) setPane("problem"); });
/* keyboard down (or Back with it up): the field last typed in comes back into view, without taking focus (it never gets scrollTop = 0) */
function backInView() {
  const el = lastEdit;
  if (!el || !el.isConnected || !mainEl.contains(el)) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (el.isConnected && el.offsetParent) el.scrollIntoView({ block: el.tagName === "TEXTAREA" ? "nearest" : "center", inline: "nearest" }); }));
}

/* ================= Multitask (design/MULTITASK.md) =================
   Phone (< 720px): the pad is hidden; the floating Scratchpad button (#padFab) opens the pad page: the tile on top, one drag handle in
   the gap, the pad below. The tile's q | a switch: q = the problem only, a = the answer control only (round 3b). It opens on q with a big
   pad (1/3). Anchors 1/2, 1/3 and the smallest tile; drag snaps, tap = next. Exits: Back (a pushed history entry), tapping the problem
   (caret into the answer), the collapse icon in the pad's top-right. The keyboard going down never closes it.
   Desktop (>= 720px): side by side, always: problem + answer left, pad right. Anchors strip (52px), 1/3, 1/2, 2/3.
   Memory: per device (localStorage, every access in try/catch). */
const sash = $("#sash"), mtMode = $("#mtMode"), mtExp = $("#mtExp"), pstrip = $("#pstrip");
const ANCH = { phone: [0, 1 / 3, 1 / 2], desk: [0, 1 / 3, 1 / 2, 2 / 3] };
const ANAME = r => r < 0.4 ? "one third" : r < 0.6 ? "half" : "two thirds";
let mtMem = {};
try { mtMem = JSON.parse(localStorage.getItem("stem-mt") || "{}") || {}; } catch { mtMem = {}; }
const mtKind = () => sideMQ.matches ? "desk" : "phone";
const near = (k, r) => ANCH[k].reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a);
const mtDef = k => k === "phone" ? 1 / 3 : 1 / 2;                                 // phone: a big pad
function mtRatio(k = mtKind()) { const r = mtMem[k]; return typeof r === "number" ? near(k, r) : mtDef(k); }
const nextDown = (k, r) => { const a = ANCH[k], i = a.indexOf(near(k, r)); return i > 0 ? a[i - 1] : a[a.length - 1]; };   // 1/2 -> 1/3 -> sliver/strip -> top -> 1/2
const anchorName = (k, r) => r === 0 ? (k === "desk" ? "question folded" : "answer only") : "question " + ANAME(r);
let dragR = null, mtFit = true;                                                  // mtFit: the tile hugs its content until the handle is used
/* desktop sugar: the notes pad steps aside while Cluck has something to show (the hint card, or the sheet open); else the pad is the default
   (Tony, Oct 5: "otherwise default to the scratchpad"; Oct 4's "NO SCRATCHPAD" held for questions with a layer). Diet keeps the pad.
   Phone sugar: no pad at all, so no Scratchpad button, no pad page, no pad peek (Tony, Oct 14: "HIDE THE SCRATCHPAD ON MOBILE SUGAR MODE"). */
function padRule() {
  root.classList.toggle("no-pad", !!S && modeOf() === "sugar" && (!sideMQ.matches || !!origEl || !!(cl && cl.open)));
}
const padGone = () => !sideMQ.matches && root.classList.contains("no-pad");   // phone sugar: the pad has no way in
function applyMT() {
  const side = sideMQ.matches && !!S, k = mtKind(), gone = side && clGone;
  if (sideMQ.matches || !S) mtOpen = false;
  const r = dragR != null ? dragR : mtRatio(k), on = side || mtOpen;
  root.classList.toggle("side", side);
  root.classList.toggle("cl-gone", gone);                                      // Cluck's column dismissed: one centred column (DISMISS.md)
  padRule();
  root.classList.toggle("sugar", modeOf() === "sugar");                  // Cluck's world: sugar-only bits wear the AI skin (app.css)
  root.classList.toggle("mt", mtOpen);
  const fit = mtOpen && mtFit && dragR == null;
  root.classList.toggle("mt-fit", fit);
  root.classList.toggle("mt-r0", on && !gone && !fit && dragR == null && r === 0);
  root.classList.toggle("mt-drag", dragR != null);
  root.style.setProperty("--r", r);
  root.classList.toggle("mt-q", mtOpen && mtTile === "q");
  root.classList.toggle("mt-a", mtOpen && mtTile === "a");
  root.classList.toggle("pad-off", !!S && !sideMQ.matches && !mtOpen);         // phones: no pad on the page, the button opens it
  sash.hidden = !on || gone; mtMode.hidden = !mtOpen; pstrip.hidden = !(side && !gone && r === 0 && dragR == null);
  mtMode.dataset.pane = mtTile === "q" ? "problem" : "scratch";
  mtMode.setAttribute("aria-label", mtTile === "q" ? "Show answer" : "Show question");
  mtExp.hidden = side || !mtOpen;                                               // the collapse corner of the pad page only
  mtExp.querySelector("use").setAttribute("href", mtOpen ? "#i-collapse" : "#i-expand");
  mtExp.setAttribute("aria-label", mtOpen ? "Close notes" : "Open notes");
  mtExp.title = mtExp.getAttribute("aria-label");
  /* a11y only (WAI-ARIA window splitter), never shown */
  sash.setAttribute("aria-orientation", side ? "vertical" : "horizontal");
  sash.setAttribute("aria-valuemin", "0"); sash.setAttribute("aria-valuemax", String(Math.round(Math.max(...ANCH[k]) * 100)));
  sash.setAttribute("aria-valuenow", String(Math.round(r * 100)));
  sash.setAttribute("aria-valuetext", anchorName(k, r));
  sash.setAttribute("aria-label", `Question size: ${anchorName(k, r)}. Tap for ${anchorName(k, nextDown(k, r))}`);
  if (on) layoutMT(); else mtCap = null;
  clBackSync();
  if (toastAt && !toastAt.getClientRects().length) hideToast();                 // its anchor just went away (q | a when the page closes)
  fabSync();
}
/* the sizes CSS cannot know: the visible height (phone), and the pad's height (it fills its tile / column) */
let mtCap = null;
function layoutMT() {
  if (!S || !S.box) return;
  const ta = S.box.el;
  if (mtOpen) {
    const h = vv ? vv.height : innerHeight;
    root.style.setProperty("--vv-h", Math.round(h) + "px");
    root.style.setProperty("--kb-top", (vv ? Math.max(0, vv.offsetTop) : 0) + "px");
    if (mtFit) {                                                                 // hug: what the tile shows, at most 1/3 of a short screen, 45% of a tall one
      const parts = mtTile === "q" ? [problemEl] : [$("#fb"), $("#q")];
      root.style.setProperty("--tile-h", "56px"); void problemEl.offsetHeight;  // measure from a small tile: scrollHeight never reports less than the box
      const need = parts.reduce((s, e) => s + (e && e.getClientRects().length ? e.scrollHeight : 0), 0);
      const cap = (innerHeight < 700 ? 1 / 3 : 0.45) * h;
      root.style.setProperty("--tile-h", Math.round(Math.max(56, Math.min(need, cap))) + "px");
    }
  } else root.style.setProperty("--kb-top", "0px");
  const fill = () => {
    if (!S || !S.box || (!mtOpen && !sideMQ.matches)) return;
    if (sideMQ.matches) root.style.setProperty("--cl-top", Math.max(0, Math.round(sentinel.getBoundingClientRect().top + scrollY)) + "px");   // where the notes column starts in the page: Cluck's sheet is capped to the window below it (its body scrolls), so the ask field is on screen when it opens
    if (mtOpen) mtCap = Math.max(80, Math.floor(work.getBoundingClientRect().bottom - ta.getBoundingClientRect().top));
    else mtCap = Math.max(200, Math.floor((vv ? vv.height : innerHeight) - dockRoom() - ta.getBoundingClientRect().top - 24));   // a touch tablet's bottom bar must not cover Cut / Copy
    root.style.setProperty("--pad-max", mtCap + "px");
    S.box.limit();
  };
  fill(); requestAnimationFrame(fill);
}
function mtSave() { try { localStorage.setItem("stem-mt", JSON.stringify(mtMem)); } catch { /* private mode: defaults next time */ } }
function setRatio(r, animate = true) {
  const k = mtKind();
  mtFit = false;
  mtMem[k] = r; if (r > 0) mtMem[k + "Last"] = r;
  mtSave();
  if (animate && document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyMT); else applyMT();
}
const lastPeek = () => { const k = mtKind(), r = mtMem[k + "Last"]; return typeof r === "number" && r > 0 ? near(k, r) : mtDef(k); };
function setTile(t, animate = true) {
  if (mtTile === t) return;
  mtTile = t;
  if (animate && document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyMT); else applyMT();
}
function openMT() {
  if (mtOpen || !S || sideMQ.matches || padGone()) return;
  swapY = scrollY;
  root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");
  if (swapOn) setSwap(false);
  mtOpen = true; mtTile = "q"; mtFit = true;
  if (toastAt === fab) hideToast();
  mtMem.opens = (mtMem.opens || 0) + 1; mtSave();
  try { history.pushState({ mt: 1 }, "", location.href); } catch { /* sandboxed */ }
  applyMT(); layoutDock();
  setTimeout(() => obToast(2, "Switch question/answer here.", mtMode), 400);
}
let mtSkipPop = false;
function shutMT() {
  if (!mtOpen) return;
  mtOpen = false;
  applyMT(); layoutDock();
  if (scrollY !== swapY) scrollTo(0, swapY);
  requestAnimationFrame(() => { if (S && S.box) S.box.limit(); layoutFreeze(); });
}
function closeMT(toAnswer) {
  if (!mtOpen) return;
  shutMT();
  if (toAnswer) focusField("problem");                                            // after the close (on q the answer was hidden), still in the tap: the keyboard can stay
  if (history.state && history.state.mt) { mtSkipPop = true; history.back(); }
}
addEventListener("popstate", () => { if (mtSkipPop) { mtSkipPop = false; return; } if (mtOpen) shutMT(); });   // Back closes it, never leaves the page
for (const b of [mtExp, mtMode, pstrip]) for (const ev of ["pointerdown", "mousedown"]) b.addEventListener(ev, e => e.preventDefault());   // never takes focus (keyboard stays)
mtExp.addEventListener("click", () => closeMT(false));
mtMode.addEventListener("click", () => setTile(mtTile === "q" ? "a" : "q"));
pstrip.addEventListener("click", () => setRatio(lastPeek()));
/* tap the problem (not the answer) = close, caret in the answer */
for (const ev of ["pointerdown", "mousedown"]) problemEl.addEventListener(ev, e => { if (mtOpen) e.preventDefault(); });
problemEl.addEventListener("click", () => { if (mtOpen) closeMT(true); });
/* the handle: the pane follows the finger, release snaps to the nearest anchor; a tap (no move) goes to the next anchor */
let mtDrag = null;
sash.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  e.preventDefault();
  const m = mainEl.getBoundingClientRect(), cs = getComputedStyle(mainEl), side = sideMQ.matches;
  const a = side ? m.left + parseFloat(cs.paddingLeft) : m.top + parseFloat(cs.paddingTop);
  const len = (side ? m.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : m.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) - 16;
  mtDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a, len, side, moved: false };
  try { sash.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
});
sash.addEventListener("pointermove", e => {
  const d = mtDrag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  d.moved = true;
  const pos = (d.side ? e.clientX : e.clientY) - d.a - 8;
  d.raw = pos / d.len;                                                           // past 85% to the right (desktop): the column goes (DISMISS.md)
  dragR = Math.min(Math.max(...ANCH[mtKind()]), Math.max(0.06, pos / d.len));
  applyMT();
});
function sashEnd(e) {
  const d = mtDrag; if (!d || (e && e.pointerId !== d.id)) return;
  mtDrag = null;
  const k = mtKind();
  if (!d.moved) { dragR = null; setRatio(nextDown(k, mtRatio(k))); return; }
  if (d.side && d.raw > 0.85) { dragR = null; clGoneSet(true); return; }       // the mirror of the strip: dragged to the right edge = dismissed, the ratio is kept
  let r = dragR; dragR = null;
  r = r < (d.side ? 0.2 : 1 / 6) ? 0 : near(k, r);                              // past 20% to the left (desktop) / a sixth (phone): the strip / sliver
  setRatio(r);
}
sash.addEventListener("pointerup", sashEnd);
sash.addEventListener("pointercancel", sashEnd);
sash.addEventListener("dblclick", () => { if (sideMQ.matches) setRatio(1 / 2); });
/* assistive tech only (WAI-ARIA window splitter): arrows step one anchor, Home / End go to the ends. Never shown or documented. */
sash.addEventListener("keydown", e => {
  const k = mtKind(), a = ANCH[k], i = a.indexOf(mtRatio(k));
  const to = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: a.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  setRatio(a[Math.max(0, Math.min(a.length - 1, to))], false);
});
if (sideMQ.addEventListener) sideMQ.addEventListener("change", () => { applyMT(); origPlace(); clPlace(); layoutFreeze(); });

/* the Scratchpad button (phones, STYLE.md §3): shown while the pad is off and no answer field has focus. Tap = the pad page. Drag: it
   follows the finger; on release it snaps to the nearer side edge and stays between the top and the bottom bar, where it was dropped
   (a drop is the user's choice: no step-off, even over an answer control). Where it (re)appears it steps off answer controls. Its place is kept per device (stem-mt .fab = { side, y: 0 top .. 1 bottom }). */
const fab = $("#padFab");
let fabDrag = null, fabMoved = false, fabSeen = false;
function fabSync() {
  window.stemBrainrot?.sync();
  const a = document.activeElement, typing = !!a && editing() && $("#q").contains(a);
  const show = root.classList.contains("pad-off") && !typing && !padGone();
  root.classList.toggle("fab-on", show);
  if (fab.hidden === !show) return;
  fab.hidden = !show; fab.setAttribute("aria-expanded", String(mtOpen));
  if (!show) return;
  fabPlace({ avoid: true }); requestAnimationFrame(() => requestAnimationFrame(() => fabPlace({ avoid: true })));        // again once the bottom bar is back in place
  if (!fabSeen) { fabSeen = true; setTimeout(() => obToast(1, "Quack up your thoughts here...", fab), 700); }
  else if ((mtMem.opens || 0) >= 2 && !mtMem.fabMoved) setTimeout(() => obToast(3, "Drag to move me!", fab), 700);
}
function fabBounds() {
  const h = fab.offsetHeight || 56, s = parseFloat(getComputedStyle(root).getPropertyValue("--s4")) * 16 || 16;
  const floor = root.clientHeight - dockRoom();   // layout viewport and the bar's resting height: nothing that moves while scrolling or while the URL bar slides
  return { min: s + 8, max: Math.max(s + 8, floor - s - h), h };
}
/* avoid: step off answer controls under it. Only (re)appearing asks for it; a drag end never does (the drop is the user's choice), and a resize never does, or the
   button hops by a control's height with the scroll offset it happens to be at. */
function fabPlace({ avoid } = {}) {
  const m = mtMem.fab || {}, b = fabBounds();
  let top = b.min + (typeof m.y === "number" ? m.y : 1) * (b.max - b.min);
  fab.classList.toggle("left", m.side === "l");          // default bottom right (Tony, Oct 5 ~09:5x; was left since #69); a drag keeps its side
  fab.style.transform = "";
  const r = fab.getBoundingClientRect();
  /* step off answer controls under it (up first, then down), a few tries at most */
  const ctl = [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo, #q .nx, #wish:not([hidden]) .wchip, .cl-cta")].map(e => e.getBoundingClientRect()).filter(q => q.width && q.right > r.left && q.left < r.right);
  /* the question text (the body above the choices): stepping up never takes the button above its bottom edge (it climbed over every choice onto the text) */
  const textBottom = document.querySelector("#blocks")?.getBoundingClientRect().bottom ?? 0;
  for (let n = 0; avoid && n < 6; n++) {
    const hit = ctl.find(q => q.bottom > top && q.top < top + b.h); if (!hit) break;
    const upY = hit.top - b.h - 8, downY = hit.bottom + 8;
    top = upY >= Math.max(b.min, textBottom + 8) ? upY : downY <= b.max ? downY : top;
    if (top !== upY && top !== downY) break;
  }
  /* no clear step (a long question leaves no gap between the text and the choices): the nearest place that covers neither the text nor a
     choice (a figure may be covered); failing that, the nearest place off the answer controls (the text may be covered) */
  const txt = [...document.querySelectorAll("#blocks .md")].map(e => e.getBoundingClientRect()).filter(q => q.width && q.right > r.left && q.left < r.right);
  const clear = (t, obs) => !obs.some(q => q.bottom > t && q.top < t + b.h);
  for (const obs of [[...ctl, ...txt], ctl]) {
    if (!avoid || clear(top, obs)) break;
    for (let d = 8; d <= b.max - b.min; d += 8) {
      const t = [top - d, top + d].find(t => t >= b.min && t <= b.max && clear(t, obs)); if (t !== undefined) { top = t; break; }
    }
  }
  /* anchored by its distance from the bottom, like the bar: when a phone's URL bar slides away, the bar and the button move down
     together (top-anchored, the button stayed put and left a dead band the height of the URL bar above the bar; Tony, Oct 3) */
  fab.style.bottom = Math.round(root.clientHeight - Math.min(b.max, Math.max(b.min, top)) - b.h) + "px";
}
fab.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  const r = fab.getBoundingClientRect();
  fabDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, r, moved: false };
  try { fab.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
});
fab.addEventListener("pointermove", e => {
  const d = fabDrag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  d.moved = true; fab.classList.add("dragging");
  fab.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;     // follows the finger (direct manipulation)
});
function fabEnd(e) {
  const d = fabDrag; if (!d || (e && e.pointerId !== d.id)) return;
  fabDrag = null; fab.classList.remove("dragging");
  if (!d.moved) return;
  fabMoved = true;
  const dx = e ? e.clientX - d.x0 : 0, dy = e ? e.clientY - d.y0 : 0, b = fabBounds();
  /* the drop, measured against the bar on screen (both rects are visual): no guess at how tall a slid-away URL bar is. Firefox for
     Android moves fixed-bottom things with its bottom toolbar (bug 1880375), Chrome by resizing; innerHeight means different things */
  const bar = dockRoom() ? dock.getBoundingClientRect().top : innerHeight, gap = bar - (d.r.bottom + dy);
  const cx = d.r.left + d.r.width / 2 + dx, top = Math.min(b.max, Math.max(b.min, root.clientHeight - dockRoom() - gap - b.h));
  mtMem.fab = { side: cx < innerWidth / 2 ? "l" : "r", y: b.max > b.min ? (top - b.min) / (b.max - b.min) : 1 };
  mtMem.fabMoved = 1; mtSave();
  fabPlace();                                                                     // keep the drop spot: no step-off
}
fab.addEventListener("pointerup", fabEnd);
fab.addEventListener("pointercancel", fabEnd);
fab.addEventListener("click", () => { if (fabMoved) { fabMoved = false; return; } openMT(); });   // a drag is not a tap
document.addEventListener("focusin", fabSync);
document.addEventListener("focusout", () => setTimeout(fabSync, 0));
addEventListener("resize", () => { if (!fab.hidden) fabPlace(); });                // the same spot of the (new) range: no step-off
new ResizeObserver(() => { if (!fab.hidden) fabPlace(); }).observe(dock);         // the bar changed height: stay above it

/* figures and wrapped text depend on width: redraw on width changes only (not on keyboard height changes) */
let figW = 0;
new ResizeObserver(() => { const w = $("#blocks").clientWidth; if (S && w && w !== figW) { figW = w; drawFigures(); layoutFreeze(); } }).observe($("#blocks"));
let qW = 0;
new ResizeObserver(() => { const w = $("#q").clientWidth; if (S && w > 120 && w !== qW) { qW = w; fitChoices(); } }).observe($("#q"));   // the one-row / stacked choice depends on the width

/* ================= resume (design/RELOAD.md) =================
   Back from bfcache (pageshow persisted) or a long-hidden tab: requests older than the timeout are aborted (background timers are
   throttled, so theirs may not have fired), busy is cleared, the controls that should be live are live again, the layout reruns. */
function resume(fromCache) {
  const now = Date.now();
  for (const r of [...inflight]) if (fromCache || now - r.t0 >= TIMEOUT) r.ctl.abort();
  if (fromCache) busy = false;
  if (!editing()) { lostAt = 0; if (swapOn) setSwap(false); root.classList.remove("dock-away", "bar-off"); }
  if (S && !S.finished) {
    const ins = [...document.querySelectorAll("#q .ans")], go = $("#ansGo");
    if (go && ins.length) { go.hidden = !!$("#ff .vk"); go.disabled = ins.some(x => !x.value.trim()); }   // a wrong mark holds the slot until typing
    (S.parts || []).forEach((st, i) => { if (!st.shut) { const e = partEls(i); e.go.hidden = !e.inp.value.trim() || !!e.box.querySelector(".vk"); } });
    for (const o of opts()) if (!o.classList.contains("wrong")) { o.disabled = false; o.removeAttribute("aria-disabled"); }
    if (S.selected) { const o = opts().find(x => x.dataset.id === S.selected); if (o) select(o); }
  }
  tallest = 0; lastW = 0; qW = 0;
  layoutDock(); layoutFreeze(); fitChoices();
}
addEventListener("pageshow", e => {
  if (!e.persisted) return;
  resume(true);
  const off = window.stemOffline;
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(false); });

/* ================= boot ================= */
const hashCode = () => location.hash.length > 1 ? normalizeLink(decodeURIComponent(location.hash.slice(1))) : null;
const fromHash = () => {
  const n = hashCode();
  if (!n) { if (location.hash.length > 1) note(`Quack, can't open ${location.hash.slice(1, 40)}.`); return; }   // a #code that is no code (T16: said, not silent)
  if (n.prefix !== "BANK" && S && S.code === n.code && window.stemMock?.again?.(n.code)) return load(n.code);   // the mock starting on the open X3 Q1 (nav.js, W103b): its fresh round
  if (n.prefix === "BANK") { if (!bank || bank.code !== n.code) return openBank(n.code); }
  else if (!S || S.code !== n.code) return load(n.code);
};
addEventListener("hashchange", fromHash);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) { drawFigures(); fitChoices(); layoutFreeze(); } });
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => { if (S) fitChoices(); });   // KaTeX loads a size font on first use: re-fit the math
layoutDock();
/* offline.js (it runs after this module) restores an uploaded bank from IndexedDB first, so #CODE of an uploaded problem opens */
/* the splash (index.html) waits for this: the #CODE problem opened (or failed), so the page never flashes the empty entry state first */
let firstDone;
window.stemFirst = new Promise(r => { firstDone = r; });
addEventListener("DOMContentLoaded", async () => {
  const off = window.stemOffline;
  let restored = false;
  if (off && off.ready) { try { restored = await Promise.race([off.ready, new Promise(r => setTimeout(() => r(false), 1500))]); } catch { /* storage blocked */ } }
  /* the live list (design/BANK.md): #BANK_XXX, else the last one used here, else the server's pointer (new browser,
     or storage wiped). A problem in the hash still opens; the bank then only fills the list. */
  try {
    const n = hashCode(), last = src(), q = !!n && n.prefix !== "BANK";
    if (n && n.prefix === "BANK") await openBank(n.code);
    else if (last && last !== "file") await openBank(last, { go: !q, quiet: true });
    else if (!last && !restored) await openBank("last", { go: !q, quiet: true });
    await fromHash();
  } catch { /* load() / openBank() report their own errors */ } finally { firstDone(); }
});
/* page.at (flight.js page(), flight recorder P1 §8): the app's state at a failure, as codes, counts and flags. Never a typed answer,
   notes, chat or Cluck's text: only their lengths */
const pageState = () => {
  const w = wish;
  return {
    q: S?.code ?? null, bank: bank?.code ?? null, mode: modeOf(), tries: S ? S.tries.length : null, left: S?.triesLeft ?? null, fin: !!S?.finished, hints: S ? S.hints.length : null,
    wish: w && { code: w.code, started: !!w.started, end: !!w.done, open: !!w.open, failed: w.failed || 0, capped: !!w.capped, chars: (w.text || "").length,
      shown: w.shown | 0, chat: (w.chat || []).length, busy: !!w.busy, out: !!w.out, inc: w.inc || null },
    cl: cl && { open: !!cl.open, tab: cl.tab ?? null, auto: !!cl.auto }, inflight: [...inflight].map(r => [r.ep || null, Date.now() - r.t0]),
  };
};
window.__drill = { check, get state() { return S; }, get page() { return pageState(); } };   // for tests/e2e; page: flight.js
