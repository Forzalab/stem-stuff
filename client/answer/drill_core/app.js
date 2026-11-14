// ===== CODEMAP HEADER (comment only, no logic). Map of all files: CODEMAP.md at the repo root. =====
// FILE: app.js
// WHAT: The drill page, part 1 of 3 (split-app.mjs; index.html runs app.js, cluck.js, shell.js in that order): code entry, grading on device, answer box, MC / freeform / multi answers, repair ladder.
// START HERE: a grading or verdict bug -> §grading; code bar or upload -> §entry-box; question markdown or TeX -> §markdown-tex; banks -> §banks; a wrong-answer repair -> §repair-ladder; MC or typed arrow -> §mc-arrow, §freeform; multi-part -> §multi.
// FIND A SECTION: grep -n "== §<name> ==" app.js   (names below; line numbers are never kept)
// SECTIONS (in file order):
//   §markdown-tex    markdown + TeX
//   §grading         grading: the one place
//   §entry-box       code bar + upload
//   §banks           practice banks
//   §problem-state   problem state
//   §twist-chip      the Twist chip + its one-time toast
//   §welcome-q1      the welcome Q1
//   §repair-ladder   repair ladder after a miss
//   §mc-arrow        MC: one arrow
//   §second-try      the second try costs 10 s
//   §freeform        freeform: the same arrow
//   §multi           multi: every part
// RELATED:
//   cluck.js     part 2: the Cluck genie, reached through bridge
//   shell.js     part 3: rewards, Copy, Swap, Multitask, boot
//   nav.js       Prev / Next, question list
//   app.css      styles
// ===== END CODEMAP HEADER =====
/* app.js: the drill page. Code entry -> p/<CODE>.json (served from problems.json, or an uploaded problems.json) -> blocks -> answer -> scratchpad -> Copy.
   Layout decisions for the frozen problem: docs/design/FREEZE.md. Payload: copy/COPY-PAYLOAD.md. */
/* ./copy/payload.mjs: used by cluck.js / shell.js only (split-app.mjs) */
import { shuffled, seed } from "../../pure_logic_modules/shuffle.mjs";
import * as codes from "../../pure_logic_modules/codes.mjs";
import { suggest, remember, isBank, normalize, normalizeLink, entry } from "../../pure_logic_modules/suggest.mjs";
import { match as slipMatch, slipSpot, familyHint } from "../../pure_logic_modules/slips.mjs";   // slips v2 unit C: runtime slip matching for uploaded banks
import { modeOf, setMode, modePrefix, forceSugarOnce, view as modeView, hidden as modeHidden } from "../../pure_logic_modules/mode.mjs";
import { quack, withQuack } from "../../pure_logic_modules/quack.mjs";
/* ./speak.mjs: used by cluck.js / shell.js only (split-app.mjs) */
import { changes } from "../../pure_logic_modules/chg.mjs";
/* ./steps.mjs: used by cluck.js / shell.js only (split-app.mjs) */
/* ./tug.mjs: used by cluck.js / shell.js only (split-app.mjs) */
import { incident, debugOn, incLabel, incDiag, trackingOff, traceparent, traceOf } from "../../pure_logic_modules/incident.mjs";
/* ./sheet.mjs: used by cluck.js / shell.js only (split-app.mjs) */
/* split-app.mjs (W152): part 1 of 3 of the drill page; index.html runs app.js, cluck.js, shell.js in that order. A name from an earlier part: import it. A name from a later part, or a write to another part's let: bridge.<name>, defined by its own part at its top; never declare a local named bridge. tests/split-gate.test.mjs lints it. */
export const bridge = {};   // the bridge to cluck.js + shell.js (split-app.mjs)
Object.defineProperties(bridge, {   // read (or set) from another part as bridge.<name> (split-app.mjs)
  busy: { get: () => busy, set: v => { busy = v; }, enumerable: true },   // let
  forceWelcome: { get: () => forceWelcome, set: v => { forceWelcome = v; }, enumerable: true },   // let
  lastEdit: { get: () => lastEdit, set: v => { lastEdit = v; }, enumerable: true },   // let
  lastQuack: { get: () => lastQuack, set: v => { lastQuack = v; }, enumerable: true },   // let
  lostAt: { get: () => lostAt, set: v => { lostAt = v; }, enumerable: true },   // let
  mtForced: { get: () => mtForced, set: v => { mtForced = v; }, enumerable: true },   // let
  mtOpen: { get: () => mtOpen, set: v => { mtOpen = v; }, enumerable: true },   // let
  mtTile: { get: () => mtTile, set: v => { mtTile = v; }, enumerable: true },   // let
  proofHold: { get: () => proofHold, set: v => { proofHold = v; }, enumerable: true },   // let
  swapOn: { get: () => swapOn, set: v => { swapOn = v; }, enumerable: true },   // let
});
window.stemCodes = codes;   // offline.js (a classic script, runs after this module) reads the code rules from here

/* Vercel Web Analytics (docs/design/DEPLOY.md): only where Vercel serves the page (https, not localhost). The old http server, local runs,
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
  if (lang && /^[a-z]{2}$/.test(lang)) { const b = document.createElement("script"); b.src = "client/shell/blind/locale.js"; b.dataset.lang = lang; document.head.appendChild(b); }
} catch { /* storage blocked: no blind test */ }

const $ = s => document.querySelector(s);
const root = document.documentElement;
const MAX_TRIES = 2;   // tries for everything except a 2-choice mc (maxTries)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
/* the ONE reveal-line duck (the old "Why does this work?" CTA's i-duck, moved here after #406 dropped the CTA): Avenged!, "That's it!", "Not it." */
const revDuck = () => `<span class="rv-duck" aria-hidden="true">${icon("i-duck")}</span>`;
let lastQuack = "";   // quack.mjs: the last prefix shown, so the next one differs (Tony D72: every Cluck hint starts with a QUACK)
const quackHint = (h, seed) => { const out = withQuack(h, seed, lastQuack); lastQuack = quack(seed, lastQuack); return out; };
const say = t => { const sr = $("#sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); };
/* onboarding (STYLE.md §3 Toast): only on a new device, i.e. no stem-* key at the first load; remembered as stem-ob until all are shown */
const onboard = (() => { try {
  if (!Object.keys(localStorage).some(k => k.startsWith("stem-"))) localStorage.setItem("stem-ob", "1");
  return localStorage.getItem("stem-ob") === "1";
} catch { return false; } })();
function obToast(n, text, at, o) {
  if (!onboard || noteAt() || !at || at.hidden) return;                          // a wrong-answer note wins; try again next time
  try { if (localStorage.getItem("stem-ob-" + n)) return; } catch { return; }
  if (!toast(text, at, o)) return;                                               // no place yet (the cover rule): it waits for the next time, uncounted
  try { localStorage.setItem("stem-ob-" + n, "1");
    if ([1, 2, 3].every(i => localStorage.getItem("stem-ob-" + i))) localStorage.setItem("stem-ob", "done"); } catch { /* shown, not kept */ }
}
/* the note (docs/design/STYLE.md §3 Toast; todo 112: the one toast component's note mode, toast.js stemToast.note, element #toast): a short
   line with a caret on the thing it is about. Under its anchor, else above it (the Scratchpad button: above first); on a kept choice it
   lies on the row's own words, caret left at the badge. Strict cover rule: never on a live control, so it may not show (-> false).
   o: { x: the close button (HUD tips, the pad-mode note: Tony's B), prefer, allow, loose }. 2 s, tap or Esc closes it. */
const noteAt = () => window.stemToast?.noteAt() || null;
function hideToast() { window.stemToast?.noteHide(); }
function placeToast() { window.stemToast?.notePlace(); }
window.stemToast?.config({ foot: () => bridge.dockRoom() });                              // a note keeps off the dock (phones: the code bar, the keyboard)
function toast(text, at, o = {}) {
  const T = window.stemToast; if (!T || !at) return false;
  if (mtOpen && mtTile === "q" && $("#q").contains(at)) bridge.setTile("a", false);       // the note is about the answer: show it first
  return T.note({ text, at, ...o });
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
  say((await bridge.copyText(b.dataset.inc)) ? `Copied ${b.dataset.inc}.` : b.dataset.inc);
}, true);
/* a classic script (offline.js: the SW reload loop) cannot import incident.mjs: it fires "stem:incident" { where, why } */
addEventListener("stem:incident", e => { const d = e.detail || {}; incident(d.where, d.why); });
/* serve.py's X-Incident: "S-7K3QX budget_cap <trace id>" (its code, its reason tag, the request's trace id) */
const xInc = r => (r && r.headers.get("x-incident") || "").trim().split(/\s+/);
/* a request that failed: one incident. r = the Response when one came (its X-Incident, the server's code + reason, win), else e = what fetch threw */
/* tp: the request's traceparent (incident.mjs): its trace id goes in the incident, so this E- code and the server's lines link */
const reqInc = (where, path, t0, { r, e, why, tp, ...x } = {}) => incident(where, why || xInc(r)[1] || (r ? "http" : timedOut(e) ? "timeout" : x.phase === "parse" ? "parse" : "network"),
  { status: r && r.status, phase: timedOut(e) ? "timeout" : "headers", server: xInc(r)[0], trace_id: xInc(r)[2] || traceOf(tp), err: e, ms: Date.now() - t0, path, ...x });
/* a press that cannot move says why (nav.js "drill:note", load()): a note under Next, else the entry line (never silent, T16).
   Tony's pick "the stacked one" (Oct 28): caret under Next, no X, beside a stage toast. For its 2 s it may lie on the brainrot link and
   on the level row (the HUD: Tony, Oct 29 "COVER", the phone's full-width row right under Next), never on the question card or the
   answer area (stepped down onto the card's title it "looks buggy"). On desktop with the brainrot folded or gone (the mock) the Notes
   pad's top edge sits right under Next: the note may lie on it too (#scratch, like the pad-mode note; mock.pw). No such room = the entry
   line (under the bar on desktop, under the code bar on a phone); were that line ever out of sight, the old placement: never silent (T16) */
const NOTE_NEXT = { allow: ".rot-link, .rw-tap, #scratch", clear: "#problem, #q" };
function note(text) {
  const at = $("#qnext"), there = at && !at.hidden && at.getClientRects().length;
  if (there && toast(text, at, NOTE_NEXT)) return;
  entryMsg(text);
  const m = $("#entryMsg");
  if (there && !(m && m.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }))) toast(text, at, { loose: true });
}
addEventListener("drill:note", e => note(String(e.detail && e.detail.text || "")));
addEventListener("keydown", e => { if (e.key !== "Escape") return; if (noteAt()) hideToast(); else if (bridge.cl && bridge.cl.open) bridge.clUserClose(true); });   // Escape: the note, then Cluck's sheet (desktop: the X's dismiss, docs/design/DISMISS.md)
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

/* == §markdown-tex == */
/* ================= markdown + TeX ================= */
/* bug 7: a typed answer as TeX, numbers as typed. math.js toTex prints 222222 as 2.22222·10^{+5} (format upperExp 5);
   a number JS writes plainly stays plain, a typed e-number (1.2e-7) keeps the ·10^ form */
const NUM_TEX = n => n.type === "ConstantNode" && typeof n.value === "number" && !/e/i.test(String(n.value)) ? String(n.value) : undefined;
const answerTex = s => math.parse(s).toTex({ parenthesis: "auto", implicit: "hide", handler: NUM_TEX });
function renderMath(src, display) {
  if (typeof katex === "undefined") return `<code>${esc(src)}</code>`;
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "htmlAndMathml", trust: c => c.command === "\\htmlClass" });   // \htmlClass: a snack's changed number (chg.mjs)
}
/* the codeblock (T43; docs/design/STYLE.md "Codeblock"): a fenced block in question or choice text. One span per real line: its number
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

/* == §grading == */
/* ================= grading: THE one place =================
   Server problems: POST /check grades (answers never reach the browser). Reply shape (SCHEMA.md "Grading"):
     { verdict: "correct"|"wrong"|"invalid"|"locked", triesLeft, error?, hint?, repeat?, part? }
   Uploaded problems.json: the file is the student's own copy, so the same rules run here, on that file.
   No server and no file (static host): { verdict: "pending" }; Copy still sends the try to Tony.
   `answer` is { answer: "typed text" } or { choice: "b" } or, pick all, { choices: ["a", "c"] } (wrong adds struck?); a multi grades one part at a time: { part: i, answer: "typed text" }. */
/* every request goes through net(): aborted after 8 s (a call may pass its own ms: the proof Check waits 25 s), so nothing can wait forever (docs/design/RELOAD.md).
   In-flight requests are kept so a resumed page (bfcache, a long-hidden tab) can abort the stale ones. */
const TIMEOUT = 8000, PROOF_TIMEOUT = 25000;   // PROOF_TIMEOUT: serve.py PROOF_TIMEOUT is 20 s per model; the proof Check waits 25 s (todo 109)
const inflight = new Set();
const timedOut = e => !!e && e.name === "AbortError";
/* flight.js: one request's start / headers / first byte / end / error in the page's ring (on the device; only an incident carries it) */
const FR_NONE = { h() {}, f() {}, e() {}, x() {} };
const frReq = (ep, tp) => window.stemFR?.req(ep, tp) || FR_NONE;
async function net(url, init = {}, ms = TIMEOUT) {
  const ctl = new AbortController(), req = { ctl, ms, t0: Date.now(), ep: url.split(/[/?]/)[0] };
  const t = setTimeout(() => ctl.abort(), ms), fr = frReq(req.ep, init.headers?.traceparent);
  inflight.add(req);
  try {
    let r;
    try { r = await fetch(url, { ...init, signal: ctl.signal }); }
    catch (e) {   // a GET killed by a non-abort TypeError (Safari "Load failed" as the service worker takes control mid-fetch): once more; never a POST, never a timeout
      if (!(e instanceof TypeError) || timedOut(e) || ctl.signal.aborted || String(init.method || "GET").toUpperCase() !== "GET") throw e;
      fr.x(e);
      r = await fetch(url, { ...init, signal: ctl.signal });
    }
    fr.h(r); return r;
  }
  catch (e) { fr.x(e); throw e; }
  finally { if (!init.stream) clearTimeout(t); inflight.delete(req); }   // init.stream (a staged body): the cut-off also covers the body, headers come first
}
const localState = new Map();
/* /check timed out twice in a row (flight recorder P2): the 2nd is its own incident, timeout_x2, so it is not folded into the 1st (flight.js
   dedupe) and its report shows the page after two waits; any other answer resets the count */
let checkSlow = 0;
async function check(code, answer, st) {   // st: the proof Check's stage tracker (stages.js)
  const off = window.stemOffline;
  if (off && off.has(code)) return gradeLocal(modeView(off.get(code), modeOf()), answer);   // an upload: the same mode view the server uses
  const t0 = Date.now(), tp = traceparent(), slow = checkSlow;
  let inc = null;
  checkSlow = 0;
  try {
    const rd = window.stemRedo.has(code) ? { round: window.stemRedo.get().n } : {};   // a redo round grades in its own namespace
    const r = await net("check", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
                                     body: JSON.stringify({ code, ...answer, ...rd, ...(st && { stages: true }) }), stream: !!st }, S?.prob?.code === code && S.prob.type === "proof" ? PROOF_TIMEOUT : TIMEOUT);
    if (r.ok) { try { return st ? await staged(r, st) : await r.json(); } catch (e) { if (timedOut(e)) throw e; inc = reqInc("check", "/check", t0, { e, phase: "parse", q: code, tp }); } }   // a staged body cut by the 25 s abort is a timeout, not a parse failure
    else if (r.status >= 500) inc = reqInc("check", "/check", t0, { r, q: code, tp });   // a 4xx: no grader here (a static host), not a failure
  } catch (e) {
    if (timedOut(e)) checkSlow = slow + 1;
    st?.finish(false);
    inc = reqInc("check", "/check", t0, { e, q: code, tp, why: checkSlow >= 2 ? "timeout_x2" : undefined });
    if (timedOut(e)) return { verdict: "timeout", inc }; /* else offline */
  }
  st?.finish(false);
  return { verdict: "pending", inc };
}
/* a staged /check body (stages.js): event lines drive the stage rows, the rest is today's JSON; no event at all = a plain JSON body */
async function staged(r, st) {
  const rd = r.body.getReader(), dec = new TextDecoder(), sp = { buf: "" };
  let text = "";
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    const c = Stages.feed(sp, dec.decode(value, { stream: true }));
    c.events.forEach(st.event); text += c.text;
  }
  const v = JSON.parse(text);
  st.finish(v.verdict !== "busy" && v.verdict !== "timeout");   // a tick only for a real verdict: busy = the grader gave up
  return v;
}
/* mirror of serve.py grade(): keep the two in step */
const PROOF_TRIES = 3;                                     // serve.py PROOF_TRIES (W107, Tony Oct 27: a proof gets 3 Checks)
const maxTries = p => p.tries ?? (p.type === "proof" ? PROOF_TRIES : p.type === "mc" && !p.grid && shown(p).length === 2 ? 1 : MAX_TRIES);   // serve.py max_tries(): 2-choice mc = ONE try (a grid: two), else two; a mode view keeps its count
const all = p => p.type === "mc" && p.pick === "all";                              // checkboxes, graded as a set (docs/design/CHOOSE-ALL.md)
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
    /* slips v2 (docs/design/HANDOFF-slips-v2.md): author wrong -> a slip of `form` (family hint, same shape as a wrong hit) -> nudge */
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

/* == §entry-box == */
/* ================= entry box: code bar + upload ================= */
const codeIn = $("#code"), dock = $("#dock"), mainEl = $("#main");
let mtForced = false;                                                          // phone: the split opened by itself for a proof item (isProof), not by the Open notes button
const isProof = () => !!S && S.prob.type === "proof";
const oneBox = () => !!S && /^(text|num|expr)$/.test(S.prob.type);       // a typed single-box item: the keyboard never restyles the page (Tony, Nov 8)
/* a proof item's split is for typing (Tony, Nov 8: "If unfocused, return back to the old proof screen"): on while focus is in the proof
   pane (#work: the box, Check, the ladder) or a press there is down (a tap on Check blurs the box before its click lands) */
let proofHold = false;
const proofTyping = () => proofHold || ($("#work").contains(document.activeElement) && (mtOpen || bridge.editing()));   // opens on a typing field only: a press on Skip / Check must not move the page under the finger
let swapOn = false, lostAt = 0, mtOpen = false, mtTile = "q", lastEdit = null;   // mtOpen: the phone's pad page (variant 9); lastEdit: see backInView          // Swap state (see "Swap" below)
/* the box is empty while a problem is open (its code is the placeholder); empty = Paste button, text = submit arrow */
const codeGo = $("#codeGo"), codePaste = $("#codePaste");
function syncCode() { const empty = !codeIn.value; codePaste.hidden = !empty; codeGo.hidden = empty; }
/* typing keeps the box up: clearing the message below must not hide a dock that only the message was holding open (focus would be lost) */
codeIn.addEventListener("input", () => { entryMsg(""); root.classList.add("entry-open"); syncCode(); sugShow(); });
function putCode(code) { if (code) bridge.barOpen(true); codeIn.value = code; syncCode(); sugHide(); }   // a code landing in the box: the bar shows
syncCode();
/* suggestions (suggest.mjs): the codes this browser knows (opened here before, newest first; the live bank and its list; an
   uploaded file) that contain what is typed. Banks first, then questions. The server never lists codes (docs/design/NAV.md).
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
  if (sugEl.hidden || !vv || !bridge.dockMQ.matches) { root.style.removeProperty("--sug-max"); return; }
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
  if (!bridge.dockMQ.matches || bridge.sideMQ.matches || root.classList.contains("start") || root.classList.contains("coding")) return;   // phones only: a touch tablet (iPad: pointer coarse, side by side) keeps its page
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
addEventListener("resize", () => { if (!bridge.dockMQ.matches || bridge.sideMQ.matches) codingOff(); });
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
  const mp = modePrefix(codeIn.value);                                    // DIET_<code> = the original questions, SUGAR_<code> = saccharine (docs/design/EASY.md)
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
/* == §banks == */
/* ================= practice banks (docs/design/BANK.md) =================
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
/* a re-showing (docs/design/plans/QUEUE.md, D60/D61; replaces "Redo my misses", D50): the queue (nav.js) brings a question back (a
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
  const to = bank.codes.includes(b.at) ? b.at : bank.codes.find(c => welcomeDue(bank.get.get(c)))   // resume where you were, else the welcome Q1 (once),
    || (window.stemOrder ? window.stemOrder(bank.codes) : bank.codes)[0];                            // else the queue's pick (nav.js)
  if (S && S.code === to && !modeFlip) { putCode(""); entryMsg(""); } else await load(to);
  return true;
}
/* == §problem-state == */
/* ================= problem state ================= */
let busy = false;    // a grading request is out (MC and typed answers)
let S = null;        // { code, prob, start, tries, hints, triesLeft, finished, selected, box }
/* one problem source: the open bank already holds every question (the same public view the server sends), so it answers at
   once; p/CODE.json still goes out in the background (the server's resume pointer for this browser). Else the network
   (offline.js answers it for an uploaded file). docs/design/NAV.md */
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
  const wl = welcomeDue(prob) ? await welcomeLadder(code) : null;         // the welcome Q1: its ladder (none: the item as a normal question)
  entryMsg("");
  putCode(""); codeIn.placeholder = code;   // the open problem's code is the placeholder
  remembered(code);
  if (location.hash !== "#" + code) history.replaceState(history.state && history.state.stemD != null ? { stemD: history.state.stemD } : null, "", "#" + code);   // keeps the in-app depth (nav.js iOS Back)
  if (!S || S.code !== code) bridge.barOpen(false);                        // another problem opened: the bar goes back to its strip
  if (!S || S.code !== code) bridge.wishReset();                                  // a new question: Cluck's wish stops
  $("#rpHost")?.remove();                                                  // the last question's repair ladder
  cancelWait(true);
  S = { code, prob, start: Date.now(), tries: [], hints: [], triesLeft: maxTries(prob), finished: false, selected: null, box: null, wl };
  bridge.qSeen(code);                                                             // B7: the first questions this session get Cluck's prefetch
  root.classList.remove("start");   // leave the start page now: html.start hides main, so figures drawn under it measure 0 wide
  const rec =doneStore() ? doneStore().doneGet(code) : null;
  if (rec && off()) seedLocal(code, rec, prob);
  render();
  window.stemT?.("q_open", { code, bank: bank ? bank.code : null, type: prob.type, mode: modeOf(), tries: maxTries(prob) });   // telemetry (docs/design/plans/TELEMETRY.md)
  if (rec) paint(rec);
  window.stemLockHelp?.resume(code);   // LOCK-HELP: a stored lock offer for this item shows again after a reload / when the student returns
  if (!off()) syncServer(S);
  retryTag();
  dispatchEvent(new CustomEvent("drill:problem", { detail: { code } }));   // nav.js (docs/design/NAV.md)
  if (S.finished && !$("#q .nx")) { painting = true; try { cueNext(); } finally { painting = false; } }   // first load: the list came on after paint(), so a restored closed question gets its still Next now (T17b-1)
  $("#codeChipTx").textContent = code; root.classList.remove("entry-open");    // C7: the box rests as a label again
  bridge.rwSync();
  bridge.rwRedoTip();
  twistToast();
  bridge.origRender();
  bridge.padRule();
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
  if (prob.twist === true) twistChip(blocks);                             // W133: a twist item's "Twist" chip, left of the title (none: nothing at all)
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
  proofHome();
  renderQuestion();
  $("#fb").innerHTML = "";
  bridge.mountBox();
  window.CalcCoach?.onItem(bank && bank.code);                                   // Calc chip, cram strip + toast on BANK_P3X (calc-coach.js)
  $("#freezeIn").scrollTop = 0;
  scrollTo({ top: 0 });
  $("#pstripCode").textContent = code;
  lastEdit = null; bridge.padPeekText();
  bridge.clGone = false;                                                                 // a new question starts side by side again: the dismiss is for this question's column (DISMISS.md)
  bridge.applyMT();
  if (isProof()) bridge.layoutDock();                                                    // the split opened by itself: the dock steps away as it does for the pad page
  bridge.layoutFreeze();
}
/* Proof items (Tony, Nov 4: "NO NESTED BOX. NO."): the proof box takes the notes pad's place in the multitask split (docs/design/MULTITASK.md
   Pick 9 + stage 2). #q (the how line, the box, the chips, the reference proof) and #fb (the verdict) live in #work, the pad's pane; the
   notes pad (#xb) is not shown. Any other item: both go back into the question card. Same #sash, same anchors (applyMT). */
function proofHome() {
  const on = isProof(), fi = $("#freezeIn"), w = $("#work");
  if (on && !w.contains($("#q"))) w.append($("#q"), $("#fb"));
  else if (!on && !fi.contains($("#q"))) fi.append($("#q"), $("#fb"));
  root.classList.toggle("proof-split", on);
}
/* == §twist-chip == */
/* ---------- the Twist chip + its one-time toast (W133, todo 133; copy LOCKED, Tony Oct 29, verbatim) ----------
   An item with `twist: true` (SCHEMA.md) gets a small "Twist" chip in the card's header, left of the title (the title row when sugar
   shows one, else a header row of its own). A tap opens a note popover (popover.js, docs/design/POPOVER.md) with TWIST_POP. The first twist
   on this device also gets the short toast (toast.js: no bar, one action): TWIST_TOAST + "What is that?", which opens the chip's popover.
   Once per device: localStorage TWIST_KEY, set when the toast is on screen (blocked storage: no toast, never a toast every time).
   The toast keeps off the answer area (#q: the box, the ladder, the choices) and Next, tap or no tap. No twist: no chip, no row, no toast. */
const TWIST_TOAST = "You found a twist.", TWIST_ACT = "What is that?";
const TWIST_POP = "You’ll see twists often. These twists change one detail from real exam questions, which will improve retention.";
const TWIST_KEY = "stem-twist-seen";
let twistAsked = false;                                                    // queued once per page load (a re-load of the same code never queues a second)
/* the chip's own glyph (W139, Tony Oct 31): three drawn variants, 16px, strokes in currentColor; a swap = change TWIST_ICON's key.
   A: a ribbon turning over once. B: an arrow bending back on itself. C: a twisted pair */
const TWIST_SVG = {
  A: '<path d="M1.5 4.5h3c3.5 0 3.5 7 7 7h3M1.5 11.5h3c3.5 0 3.5-7 7-7h3"/>',
  B: '<path d="M4 13.5V7.5a4 4 0 0 1 8 0v3.5"/><path d="M9.5 8.5 12 11l2.5-2.5"/>',
  C: '<path d="M1.5 8c1.6-4.3 4.9-4.3 6.5 0s4.9 4.3 6.5 0M1.5 8c1.6 4.3 4.9 4.3 6.5 0s4.9-4.3 6.5 0"/>',
};
const TWIST_ICON = TWIST_SVG.A;
function twistChip(blocks) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "qtag twist-chip"; b.id = "twistChip";
  b.innerHTML = `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TWIST_ICON}</svg><span>Twist</span>`;
  b.addEventListener("click", () => twistPop(b, true));
  let row = blocks.querySelector(".ptitle");
  if (!row) { row = document.createElement("p"); row.className = "ptitle twist-row"; blocks.append(row); }
  row.prepend(b);
}
function twistPop(b, toggle) {
  const o = { variant: "note", label: "What is a twist?", build: el => { const p = document.createElement("p"); p.textContent = TWIST_POP; el.append(p); } };
  return toggle ? Pop.toggle(b, o) : Pop.open(b, o);
}
function twistToast() {
  const T = window.stemToast, code = S && S.code;
  if (!T || !S || S.prob.twist !== true || twistAsked) return;
  try { if (localStorage.getItem(TWIST_KEY)) return; } catch { return; }
  twistAsked = true;
  T.show({ text: TWIST_TOAST, bar: false, ms: 6000, until: Date.now() + 15000, clear: "#q, .nx",
    at: () => S && S.code === code ? ($("#fb")?.textContent.trim() ? $("#fb") : $("#q")) : null,
    onshow: () => { try { localStorage.setItem(TWIST_KEY, "1"); } catch { /* shown, not kept */ } },
    action: { label: TWIST_ACT, run: () => { const b = $("#twistChip"); if (!b || S.code !== code) return; b.scrollIntoView({ block: "nearest" }); twistPop(b, false); } } });
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

/* == §welcome-q1 == */
/* ---------- the welcome Q1 (todo 119; brain design-round-66 DESIGN-v3 §2, TONY-DECISIONS #5) ----------
   A bank's `welcome: true` item opens first on a fresh device, once per bank and device: welcome.js (repair.js's welcome variant; its
   ladder from GET /repair/<code>, served for this item before any try) takes the answer box's place, the question stays above it.
   Done: welcome_done (telemetry) + stem-welcome-<bank>, then its Next goes on to the queue (the cue's Next). Not for a returner
   (stem-noob-<bank>: nav.js sets it at the first answer), nor with no ladder (offline, an error): then it is a normal question. */
let forceWelcome = false;                                                         // set by the boot redirect, cleared when the welcome is done (this page load only)
const wlKey = () => "stem-welcome-" + bank.code;
function welcomeDue(p) {
  if (!bank || !p || p.welcome !== true || !bank.codes.includes(p.code) || !window.Welcome) return false;
  if (forceWelcome) return true;                                                  // the cram-window redirect (welcome-first.js): even an established user sees the welcome once
  try { return !localStorage.getItem(wlKey()) && !localStorage.getItem("stem-noob-" + bank.code); } catch { return false; }
}
async function welcomeLadder(code) {
  try { const r = await net(`repair/${code}`, { headers: { traceparent: traceparent() } }); return r.ok ? await r.json() : null; } catch { return null; }
}
function welcomeQ(q) {
  $("#fcard")?.remove();                                                         // the Key formulas card would answer its sheet step
  const mine = S, code = S.code;
  const grade = (value, n) => net(`repair/${code}/check`, { method: "POST", headers: { "content-type": "application/json", traceparent: traceparent() },
    credentials: "same-origin", body: JSON.stringify({ value, n }) }).then(r => r.ok ? r.json() : null, () => null);   // no answer: a hint, never a dead tap
  const w = Welcome.mount(q, { ...S.prob, repair: S.wl }, { sheet: S.wl.sheet, grade, on: (name, d) => {
    if (name !== "welcome_done" || S !== mine) return;
    forceWelcome = false;
    try { localStorage.setItem(wlKey(), "1"); } catch { /* blocked: it shows again next visit */ }
    S.finished = true;
    window.stemT?.("welcome_done", { code, bank: bank && bank.code, why_ok: !!d.why_ok });
    if (!$("#qnav").hidden) { const nx = nextBtn(); w.el.append(nx); nx.focus({ preventScroll: true }); }
  } });
  window.CalcCoach?.welcomeCard(q);                                              // Calc Coach's welcome entry (calc-coach.js): app chrome under the ladder, never a reply
}

/* == §repair-ladder == */
/* ---------- the repair ladder after a miss (brain design-round-66 DESIGN-v3 §3, T8; Tony Nov 3) ----------
   Every graded wrong try on an item with `repair` draws its ladder (repair.js, variant "repair") under the verdict: GET /repair/<code>
   is sent only after the /check that recorded the miss (403 before it), 404 = no ladder = nothing changes. Not on the welcome item or in
   the mock. The same slip family on the next miss keeps the element (a step is never reset); another family redraws. The answer box,
   the tries and Cluck (the tray, Ask Cluck) are untouched: this is no Cluck entry. */
function rpUnmount() {                                                          // the brown repair box goes: Cluck's close, a right main answer
  if (S?.rp) { S.rp.m?.destroy(); S.rp = null; }
  $("#rpHost")?.remove(); $("#rpGone")?.remove();
}
function repairAfterMiss(r) {
  if (r.repair && r.repair.gen === true && S?.prob.type === "proof") return genLadder(r.repair);   // the server's generated proof ladder (PR3): steps in the reply, no GET
  if (!S || S.wl || !S.prob.has_repair || S.prob.type === "proof" || mockHold() || !window.Repair) return;       // has_repair (public()): no ladder = no request
  const mine = S, code = S.code, fam = r.error || "";
  if (mine.rp && mine.rp.fam === fam) return;                                    // same family: the ladder stays as the student left it
  const host = (() => { let h = $("#rpHost"); if (!h) { h = document.createElement("div"); h.id = "rpHost"; $("#fb").after(h); } return h; })();
  mine.rp?.m?.destroy();                                                          // another family: the old ladder goes first
  const tok = mine.rp = { fam };                                                  // a slower fetch of an earlier miss must not land over this one
  net(`repair/${code}`, { headers: { traceparent: traceparent() } }).then(x => x.ok ? x.json() : null, () => null).then(rp => {
    if (S !== mine || mine.rp !== tok) return;
    if (!rp || !rp.steps) { mine.rp = null; return; }
    const grade = (value, n) => net(`repair/${code}/check`, { method: "POST", headers: { "content-type": "application/json", traceparent: traceparent() },
      credentials: "same-origin", body: JSON.stringify({ value, n }) }).then(x => x.ok ? x.json() : null, () => null);
    mine.rp.m = Repair.mount(host, { ...mine.prob, repair: rp }, { variant: "repair", error: fam || null, sheet: rp.sheet, grade, on: (name, d) => { if (name === "repair_answer") repairPick(mine, d); else if (name === "repair_skip") repairSkip(mine); } });
  });
}

/* The generated proof ladder (STEM_PROOF_LADDER=1; serve.py proof_grade): a wrong proof's /check reply carries repair {gen: true, att, steps}, steps
   with no `ok` (the keys stay on the server, 1 h). Each wrong Check brings a fresh set (new att): the old one goes. Steps grade through
   POST /repair/<code>/check {value, step, att} -> {ok}; 404 = the keys expired: one line, the ladder unmounts. Without gen:true (flag off, an authored
   proof) this is never reached and a proof miss draws nothing, as before. */
function genLadder(rp) {
  if (S.wl || mockHold() || !window.Repair || !Array.isArray(rp.steps) || !rp.steps.length) return;
  const mine = S, code = S.code, att = rp.att;
  rpUnmount();
  const host = document.createElement("div"); host.id = "rpHost"; $("#fb").after(host);
  const grade = (value, n, step) => net(`repair/${code}/check`, { method: "POST", headers: { "content-type": "application/json", traceparent: traceparent() },
    credentials: "same-origin", body: JSON.stringify({ value, step, att }) }).then(x => x.ok ? x.json() : x.status === 404 ? { expired: true } : null, () => null);
  mine.rp = { fam: "", gen: true };
  mine.rp.m = Repair.mount(host, { type: "proof", repair: { steps: rp.steps } }, { variant: "repair", gen: true, grade, on: name => {
    if (name === "repair_skip") repairSkip(mine);
    else if (name === "repair_expired" && S === mine) {                           // the keys are gone: say so, once, where the ladder was
      rpUnmount();
      const p = document.createElement("p"); p.id = "rpGone"; p.className = "rp-line"; p.textContent = "These steps expired. Check again for new ones.";
      $("#fb").after(p);
    }
  } });
}

/* "Skip for now" (repair.js repair_skip): the brown box goes and the focus goes back to the answer box; preventScroll keeps the page where it is */
function repairSkip(mine) {
  if (S !== mine) return;
  rpUnmount();
  const t = $("#q #ans") || $("#q textarea, #q input:not([disabled])") || $("#q .opt:not(.disabled):not([disabled])");
  try { t?.focus({ preventScroll: true }); } catch { /* not focusable */ }
}

/* the ladder's "Final answer" chip, graded right (repair.js repair_answer): the main box takes the same option and checks it, so one tap is not two.
   The option whose shown value equals the chip's value (its id only if the words differ in markup); none matches = nothing happens */
function repairPick(mine, d) {
  if (S !== mine || S.finished || busy || S.prob.type !== "mc" || all(S.prob)) return;
  const plain = t => String(t ?? "").replace(/[$\s]+/g, "").toLowerCase();
  const o = opts().find(x => !x.disabled && plain(x.querySelector(".txt")?.textContent) === plain(d.md)) || opts().find(x => !x.disabled && x.dataset.id === d.value);
  if (!o) return;
  select(o); submitMC();
}

/* == §mc-arrow == */
/* ---------- MC: one arrow, flush inside the selected choice ---------- */
const LETTERS = "ABCDE";
function renderQuestion() {
  const q = $("#q"), p = S.prob;
  q.classList.remove("closed", "solved");
  $("#freezeIn").classList.toggle("boxed", p.type === "multi");      // multi: question + boxes in one box (Tony's sketch)
  if (S.wl) return welcomeQ(q);
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
    /* W107 (Tony approved, Oct 27): one tall box for the whole proof, Check in its corner (the Next slot, T17b-1); the one verdict chip
       (correct | partly there | not yet) under it after a Check; the reference proof in #preview once a sugar lockout reveals it */
    q.innerHTML = `${howLine(p)}<div class="ff proof" id="ff">
        <textarea id="ans" class="ans" rows="8" maxlength="${PROOF_MAX}" aria-label="Your answer"${p.how ? ' aria-describedby="how"' : ""} ${INPUT_ATTRS.replace(' enterkeyhint="send"', "")}
          placeholder="Write your answer here"></textarea>
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Check proof" disabled>${icon("i-go")}</button>
      </div><div class="proof-len" id="plen" aria-live="polite" hidden></div><div class="stg" id="stgp" aria-live="off"></div><div class="rubric" id="rubric" aria-live="polite" hidden></div><div class="preview proofref" id="preview" aria-hidden="true"></div>`;
    wireProof();
  } else {
    const v = p.var || "x";
    const lead = p.type === "expr" ? `<span class="lead" aria-hidden="true">${renderMath(`f(${v}) =`, false)}</span>` : "";
    const ph = p.type === "expr" ? "Use " + v + " in your answer" : p.type === "num" ? "Ex: 9/2, 5e-4, sqrt(3), dne" : "";
    q.innerHTML = `${howLine(p)}<div class="ff" id="ff">${lead}
        <input id="ans" class="ans" type="text" aria-label="${p.type === "expr" ? `Answer: f(${v})` : "Answer"}"${p.how ? ' aria-describedby="how"' : ""}
          ${INPUT_ATTRS} placeholder="${ph}">${ph ? `<span class="fl" aria-hidden="true">${ph}</span>` : ""}
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Check answer" disabled>${icon("i-go")}</button>
      </div><div class="preview" id="preview" aria-hidden="true"></div>`;
    wireFF();
  }
  formulaCard();
}
/* sugar: Key formulas (Tony, Oct 5, archive/design/mockups/formula-use.html ?v=7): the question's formula-sheet rows (saccharine.part) in the order
   they get used, centred, a thin arrow between, under a "Key formulas" label notched into the box's border. Under the answer, before the hint */
const FC_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* The thinking ladder (SCHEMA.md "Formula ladder", Tony Oct 21): with p.ladder the card starts as the big pieces only (the part rows); S.lad pieces are out,
   in order: the mid pieces (each pops inside its row), then the chain arrows. window.stemLadder.step() shows the next one (Jev's hit, lane 4) */
const ladderSteps = p => {
  const ld = p.ladder, ids = (p.formulas || []).map(f => f.id);
  if (!ld) return [...ids.slice(1).map((id, i) => ({ k: "row", id })), ...ids.slice(1).map((to, i) => ({ k: "arrow", from: ids[i], to }))];   // no ladder (every Exam 3 item): synthesized, row 1 only at first, then the rows, then the arrows, one per step
  return [...(ld.mid || []).filter(m => ids.includes(m.of)).map((m, i) => ({ k: "mid", i, ...m })),
    ...(ld.arrows || []).filter(a => ids.indexOf(a.to) > 0 && ids[ids.indexOf(a.to) - 1] === a.from).map(a => ({ k: "arrow", ...a }))];
};
function ladderStep() {
  const sec = $("#fcard"), steps = S && sec ? ladderSteps(S.prob) : [];
  if (!steps.length || (S.lad ||= 0) >= steps.length) return false;
  const st = steps[S.lad++], el = sec.querySelector(st.k === "mid" ? `[data-mid="${st.i}"]` : st.k === "row" ? `.f[data-row="${st.id}"]` : `.to[data-to="${st.to}"]`);
  sec.querySelectorAll(".f.mid.cur").forEach(m => midOpen(m, false));                 // the last piece's notes fold to its "why?"
  if (el) { el.hidden = false; el.classList.add("lad-in"); if (st.k === "mid") midOpen(el, true); }
  ladClock();                                                                          // any reveal restarts the 30 s clock
  const sr = $("#sr"); if (sr) sr.textContent = st.k === "row" ? "A formula was added to the key formulas." : st.k === "mid" ? `A step was added to the key formulas${st.use || st.why ? ", with a note" : ""}.` : "A link was added between key formulas.";
  return true;
}
/* the clock (Tony, Nov 5): on the question with Cluck's sheet closed, the next piece shows 30 s after the last reveal (or after the question loaded), until all are
   out. Counted in visible seconds: a hidden tab does not run it. A wrong try or Jev's hit still reveals at once and restarts it */
const LAD_S = 30;
let ladTimer = 0;
function ladClock() {
  clearInterval(ladTimer); ladTimer = 0;
  const mine = S;
  if (!mine || !$("#fcard") || (mine.lad || 0) >= ladderSteps(mine.prob).length) return;
  let n = 0;
  ladTimer = setInterval(() => {
    if (S !== mine || !$("#fcard")) { clearInterval(ladTimer); ladTimer = 0; return; }
    if (document.visibilityState === "hidden" || window.stemCluckModal?.()) return;
    if (++n >= LAD_S) ladderStep();                                                // reveals, then ladClock() restarts (or stops when all are out)
  }, 1000);
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
/* the "?" popover (Tony, Oct 23): popover.js, variant "doc" (docs/design/POPOVER.md). Built on open, removed on close. The row's formula again (same KaTeX,
   same size, centred under the row's formula), the purpose as its bold title, then the muted body: symbols + units, when, example */
/* a row's picture (formula-figs.js, docs/design/FORMULA-FIGS.md; Tony, Oct 26): under the formula, drawn by graph.js once the popover is in the page */
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
    const arrow = steps.find(x => x.k === "arrow" && x.to === f.id), rowStep = steps.find(x => x.k === "row" && x.id === f.id);
    const q = f.doc ? `<button type="button" class="fq" data-i="${i}" aria-haspopup="dialog" aria-expanded="false" aria-label="What do the symbols in this formula mean?">?</button>` : "";
    return `${i ? `<li class="to" aria-hidden="true"${arrow ? ` data-to="${esc(f.id)}"${out(arrow) ? "" : " hidden"}` : ""}>${FC_ARROW}</li>` : ""}<li class="f"${rowStep ? ` data-row="${esc(f.id)}"${out(rowStep) ? "" : " hidden"}` : ""}><span class="fm">${renderMath(f.tex, false)}</span>${q}</li>`   /* no copy button on the card (Tony, Nov 3 18:14: "hide the copy buttons on the key formula box"); a drag still copies plain text */
      + steps.filter(m => m.k === "mid" && m.of === f.id).map(m => `<li class="f mid${m === cur ? " cur" : ""}" data-mid="${m.i}"${out(m) ? "" : " hidden"}><span class="fm">${renderMath(m.tex, false)}</span>${midNotes(m, m === cur)}</li>`).join("");
  }).join("")}</ol>`;
  sec.addEventListener("click", e => {
    const w = e.target.closest(".fh-more");
    if (w) { const open = w.getAttribute("aria-expanded") !== "true"; w.setAttribute("aria-expanded", String(open)); sec.querySelector("#" + w.getAttribute("aria-controls")).hidden = !open; return; }
    const b = e.target.closest(".fq"); if (!b) return;
    if ((S.fqTaps = (S.fqTaps || 0) + 1) >= 2 && !S.fqPeek && window.stemDuck?.say?.("stuck? ask me", { onOpen: () => window.stemIdleTap() })) S.fqPeek = true;   // the 2nd "?" tap on a question: the duck peeks (once); a tap on it opens Cluck, never auto
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
  ladClock();                                                                       // the question loaded: the first piece's 30 s start now
}
const INPUT_ATTRS = 'inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"';
/* the problem's "how to type the answer" line, right above the answer box */
/* the default choose-all line is sugar only: diet shows the question as authored (Tony, Oct 3).
   It shows on the first choose-all question of the visit only (clutter C6, Tony Oct 5); an authored how always shows */
let howAt = null;
const GRID_HOW = "Tick all correct options. You may submit an answer with none, some, or all ticks.";   // a grid item with no how (SCHEMA.md grid)
const howLine = p => {
  let h = p.how;
  if (!h && all(p) && p.grid) h = GRID_HOW;                                    // a grid: say that nothing ticked is an answer too, in both modes
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
  if (fits !== was) bridge.layoutFreeze();
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
    if (waiting() && !all(S.prob)) return;                                   // the 10 s second-try wait: a single MC's options ignore taps
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
    if (waiting() && !all(S.prob)) return;                                   // the second-try wait: no select / Enter on a single MC
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
  if (!toast("That one's already correct!", o)) S.keptTold = false;            // kept A: on the row; no place (the cover rule) = the next tap tries again
}
/* Check is live with nothing ticked too (that is the answer "none of them": docs/design/EASY.md); prove mode also needs every unlocked row ticked or X'd, every X with its fix */
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
/* == §second-try == */
/* ---------- the second try costs 10 s (Tony Nov 5; sugar, 2-try items only) ----------
   The first wrong verdict starts S.wait = { until }. The submit is the progress bar: a typed item's #ansGo and a choose-all's #mcGo get a CCW clock sweep (app.css .waiting),
   a single MC's live, un-picked options drain 100% -> 0% in the same neutral tone and ignore taps (aria-disabled + .waiting only: o.disabled means "struck wrong"). Typing / ticking stay allowed.
   No stored timer: a reload with one try left restarts the 10 s (paintRec); leaving the item cancels it. Telemetry retry_wait {code, item, phase, waited_ms}. */
const WAIT_MS = 10000;
let waitTimer = 0, waitTick = 0;
const waiting = () => !!(S && S.wait);
function waitLive() {
  let e = document.getElementById("waitLive");
  if (!e) { e = document.createElement("div"); e.id = "waitLive"; e.className = "sr-only"; e.setAttribute("aria-live", "polite"); document.body.append(e); }
  return e;
}
const waitReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function waitEls() {
  const p = S.prob;
  if (all(p)) return { btn: $("#mcGo") };
  if (p.type === "mc") return { box: $("#q .choices") };
  return { btn: $("#ansGo") };
}
function waitPaint() {
  const { btn, box } = waitEls(), n = Math.max(0, Math.ceil((S.wait.until - Date.now()) / 1000));
  for (const e of [btn, box]) if (e && !e.style.getPropertyValue("--wd")) e.style.setProperty("--wd", `${-(Date.now() - S.wait.t0)}ms`);   // the sweep's animation-delay: a layer shown late (hidden -> shown) still starts at the elapsed time
  if (btn) {
    btn.classList.add("waiting"); btn.setAttribute("aria-disabled", "true"); btn.dataset.w = "1";
    if (!btn.dataset.lbl) btn.dataset.lbl = btn.getAttribute("aria-label") || "Check";
    btn.setAttribute("aria-label", `Check (wait ${n} s)`);
  }
  if (box) {
    box.classList.add("waiting");
    for (const o of opts()) if (!o.disabled) { o.setAttribute("aria-disabled", "true"); o.dataset.w = "1"; }
  }
}
function waitClear() {
  clearTimeout(waitTimer); clearInterval(waitTick); waitTimer = waitTick = 0;
  document.querySelectorAll("#q .waiting").forEach(x => { x.classList.remove("waiting"); x.style.removeProperty("--wd"); });
  document.querySelectorAll("#q [data-w]").forEach(x => {
    x.removeAttribute("aria-disabled"); delete x.dataset.w;
    if (x.dataset.lbl) { x.setAttribute("aria-label", x.dataset.lbl); delete x.dataset.lbl; }
  });
}
/* the deadline survives a reload / a discarded tab coming back (same tab only: sessionStorage, one item at a time). Wall-clock: an expired one means ready, not a new 10 s. */
const WAIT_KEY = "stem-wait";
function waitSaved(code) {
  try { const o = JSON.parse(sessionStorage.getItem(WAIT_KEY) || "null"); return o && o.code === code && typeof o.until === "number" ? o : null; } catch (e) { return null; }
}
function waitSave(code, w) { try { sessionStorage.setItem(WAIT_KEY, JSON.stringify({ code, until: w.until, t0: w.t0 })); } catch (e) {} }
function waitForget(code) { try { if (waitSaved(code)) sessionStorage.removeItem(WAIT_KEY); } catch (e) {} }
function startWait() {
  if (!S || S.finished || modeOf() !== "sugar" || S.triesLeft !== 1 || maxTries(S.prob) !== 2 || /^(proof|multi)$/.test(S.prob.type)) return;
  const fresh = !S.wait, mine = S;
  if (fresh) {
    const sv = waitSaved(S.code);
    if (sv && sv.until <= Date.now()) return;                                          // the wait ran out before the reload: ready, no new 10 s
    if (sv) S.wait = { until: sv.until, t0: sv.t0 };                                    // this tab's own wait, picked up where it was
    else { S.wait = { until: Date.now() + WAIT_MS, t0: Date.now() }; waitSave(S.code, S.wait); window.stemT?.("retry_wait", { code: S.code, item: S.code, phase: "start", waited_ms: 0 }); }
  }
  clearTimeout(waitTimer); clearInterval(waitTick);
  waitPaint(); if (S.prob.type !== "mc") $("#ansGo").hidden = false;                // the typed Check is the bar: up even though the miss hid it (a reload paints the miss first)
  const red = waitReduced(), say = n => { if (red) waitLive().textContent = `Check unlocks in ${n} s`; };
  say(Math.ceil((S.wait.until - Date.now()) / 1000));
  waitTick = setInterval(() => {
    if (S !== mine || !S.wait) return;
    const n = Math.ceil((S.wait.until - Date.now()) / 1000); waitPaint();
    if (n === 5) say(5);
  }, 1000);
  waitTimer = setTimeout(() => {
    if (S !== mine || !S.wait) return;
    const ms = Date.now() - S.wait.t0; S.wait = null; S.waited = ms; waitClear();
    waitLive().textContent = "Ready";
    window.stemT?.("retry_wait", { code: S.code, item: S.code, phase: "ready", waited_ms: ms });
  }, Math.max(0, S.wait.until - Date.now()));
}
function cancelWait(left) {   // the item closed or another opened: the wait stops (left = the student walked away mid-wait)
  if (left && S && S.wait) window.stemT?.("retry_wait", { code: S.code, item: S.code, phase: "left", waited_ms: Date.now() - S.wait.t0 });
  if (S) { S.wait = null; waitForget(S.code); }
  waitClear();
}
function waitSubmitted() {   // the first submit after the unlock
  if (S && S.waited != null) { window.stemT?.("retry_wait", { code: S.code, item: S.code, phase: "submit", waited_ms: S.waited }); S.waited = null; }
}
async function submitMC() {
  if (waiting()) return;
  if (all(S.prob)) return submitAll();
  const o = opts().find(x => x.dataset.id === S.selected); if (!o || S.finished || busy) return;
  const c = S.prob.choices.find(x => x.id === S.selected), mine = S;
  busy = true; waitSubmitted();
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
    if (r.triesLeft <= 0) finish();
  } else if (r.verdict === "pending") { o.classList.add("pend"); send.hidden = true; }
  else if (r.verdict === "locked") finish();
  feedback(r);
}
/* pick all: send the ticked ids (prove mode: + fixes { id: text } for every X'd row). Wrong: the ticks and texts stay (the student
   edits the set); the struck row (if any) is unticked + disabled; a wrong fix turns its box red.
   Copy payload: a = the ticked choices' text, c / l = their ids / letters; prove mode: a = { tick, fix: { letter: text } } */
async function submitAll() {
  const on = ticked(), go = $("#mcGo"); if (!go || go.disabled || S.finished || busy || waiting()) return;
  waitSubmitted();
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
    if (r.triesLeft <= 0) finish();
  } else if (r.verdict === "pending") for (const o of on) o.classList.add("pend");
  else if (r.verdict === "locked") finish();
  feedback(r, Object.values(f).join(", "));                 // invalid here = a fix that can't be read
}

/* == §freeform == */
/* ---------- freeform: the same arrow, flush inside the input ---------- */
function wireFF() {
  const ins = [...document.querySelectorAll("#q .ans")], go = $("#ansGo"), pv = $("#preview"), mathy = /^(num|expr)$/.test(S.prob.type);
  for (const inp of ins) {
    inp.addEventListener("input", () => {
      go.disabled = ins.some(x => !x.value.trim());
      const ff = $("#ff"); if (ff.classList.contains("bad")) { ff.classList.remove("bad"); go.hidden = false; }
      if (!pv) return;
      if (xOn(null)) { xPreview(pv, inp.value, null); const ln = $("#xline"); if (ln && ln.classList.contains("bad")) { ln.className = "xline"; ln.textContent = X_PROMPT; } return; }   // W137: the working + its value
      pv.innerHTML = "";
      const t = inp.value.trim(); if (!t || !mathy || typeof math === "undefined") return;
      try { pv.innerHTML = /^dne$/i.test(t) ? "DNE" : renderMath(answerTex(t), false); } catch { /* still typing */ }
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
/* ---------- W137 expression answers (todo 137; serve.py EXPR_MODE, expr.py): after one miss on a typed num answer / num part of an
   Exam 3 bank, the server's reply says exprMode and the box asks for the whole working (X_PROMPT). Under the box: the working, rendered
   (KaTeX), and its own value dim "(= 67.87)", live as they type (never the right answer: only what they typed). A bare number gets the
   prompt, a syntax slip a friendly line: neither is a try. A wrong working: Cluck opens with the 6 moves (diag.msg; L3 via POST /diagnose
   when L1 named no family), the off span underlined in the rendered working. The flag off: the server never says exprMode, nothing here runs. */
const X_PROMPT = "Type your whole working, e.g. 2.5*9.8/(pi*0.4^2)";   // expr.PROMPT
const XNAMES = /^(sqrt|sin|cos|tan|asin|acos|atan|exp|log|ln|abs|pi|g)$/i;
const xClean = t => String(t).replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/−/g, "-")
  .replace(/[A-Za-z]+/g, w => XNAMES.test(w) ? w.toLowerCase() : w);
const xImplicit = t => /(\d|\))\s*(?![eE][-+]?\d)[A-Za-z(]|\)\s*[\d.]/.test(t);                 // expr.py refuses hidden multiplying: no value then
const xVal = v => Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3).replace(/\.?0+e/, "e").replace(/e\+?(-?\d+)/, "×10^$1") : String(Number(v.toPrecision(4)));
const xKey = i => i == null ? "ff" : "p" + i;
const xOn = i => !!S?.xm?.has(xKey(i));
function xPreview(pv, text, off) {
  if (!pv) return;
  const t = xClean(String(text || "").trim()).replace(/\bln\(/g, "log(");
  pv.innerHTML = "";
  if (!t || typeof math === "undefined") return;
  let node; try { node = math.parse(t); } catch { return; }                                    // still typing
  const opt = { parenthesis: "keep", implicit: "show" };
  let want = null, hit = false;
  if (off) try { want = math.parse(xClean(off).replace(/\bln\(/g, "log(")).toString(); } catch { want = null; }
  let tex;
  try { tex = node.toTex({ ...opt, handler: n => { if (want && !hit && n.toString() === want) { hit = true; return `\\htmlClass{xoff}{\\underline{${n.toTex(opt)}}}`; } } }); } catch { return; }
  let v = null;
  if (!xImplicit(t)) try { const r = node.evaluate({ g: Number(S?.prob?.g) || 9.8 }); if (typeof r === "number" && Number.isFinite(r)) v = r; } catch { v = null; }
  pv.innerHTML = `<span class="xexpr">${renderMath(tex, false)}</span>${v == null ? "" : ` <span class="xval">(= ${esc(xVal(v))})</span>`}`;
  if (pv.id === "preview") pvFit(pv);
}
function xEls(i) {                                                         // the box's preview (the working) and its prompt line
  if (i == null) {
    const pv = $("#preview"); if (!pv) return {};
    let ln = $("#xline"); if (!ln) { ln = document.createElement("p"); ln.id = "xline"; ln.className = "xline"; ln.setAttribute("aria-live", "polite"); pv.after(ln); }
    return { pv, ln, inp: $("#ans") };
  }
  const { row, box, inp } = partEls(i);
  let pv = row.querySelector(".xpv"), ln = row.querySelector(".xline");
  if (!pv) { pv = document.createElement("div"); pv.className = "preview xpv"; pv.setAttribute("aria-hidden", "true"); box.after(pv); }
  if (!ln) { ln = document.createElement("p"); ln.className = "xline"; ln.setAttribute("aria-live", "polite"); pv.after(ln); }
  return { pv, ln, inp };
}
function xOpen(i) {                                                        // the box now wants the whole working
  (S.xm ||= new Set()).add(xKey(i));
  const { ln, inp } = xEls(i);
  if (inp) inp.placeholder = X_PROMPT;
  if (ln) { ln.className = "xline"; ln.textContent = X_PROMPT; }
}
function xLine(i, r) {                                                     // not a try: the prompt again, or the syntax line
  const { ln } = xEls(i); if (!ln) return;
  ln.className = "xline " + (r.verdict === "unparsed" ? "bad" : "nudge");
  ln.textContent = r.verdict === "unparsed" ? r.syntax || "I can't read that working." : r.prompt || X_PROMPT;
  say(ln.textContent);
}
function xCluck(msg) {                                                     // Cluck's 6 moves, as his message; he opens (the wrong-answer prefetch path)
  if (!S || !msg) return;
  bridge.wishNew();
  Object.assign(bridge.wish, { text: msg, done: true, started: true, failed: 0, shown: msg.length, pos: msg.length, skip: true, at: 1, key: "expr|" + S.code, expr: true });
  bridge.wishPaint();
  bridge.clOpen("explain", ":is(#wish, .rbox) .wchip", true);
  if (bridge.wish.open) bridge.wishDraw();
}
async function xDiag(r, text, i) {                                         // a wrong working: underline + Cluck; L3 when L1 named no family
  const d = r.diag; if (!d) return;
  const { pv, ln } = xEls(i);
  if (pv) { pv.classList.remove("spent"); xPreview(pv, text, d.off?.span); }
  if (ln) { ln.className = "xline"; ln.textContent = ""; }
  xCluck(d.msg);
  if (!d.pending) return;
  const mine = S, w = bridge.wish;
  try {
    const rd = window.stemRedo.has(S.code) ? { round: window.stemRedo.get().n } : {};
    const res = await net("diagnose", { method: "POST", headers: { "content-type": "application/json", traceparent: traceparent() }, credentials: "same-origin",
      body: JSON.stringify({ code: S.code, expr: text, ...(i == null ? {} : { part: i }), ...rd }) });
    const o = res.ok ? await res.json() : null;
    if (!o || S !== mine || bridge.wish !== w || !o.msg) return;
    Object.assign(w, { text: o.msg, shown: o.msg.length, pos: o.msg.length });
    bridge.wishPaint(); if (w.open) bridge.wishDraw();
    if (pv && o.off?.span) xPreview(pv, text, o.off.span);
  } catch { /* the L1 moves stay */ }
}
async function submitFF() {
  const ins = [...document.querySelectorAll("#q .ans")], vals = ins.map(x => x.value.trim());
  if (vals.some(v => !v) || S.finished || busy || waiting()) return;
  busy = true; waitSubmitted();
  const t = vals.join(" , ");
  vmark($("#ff"), null);   // a new verdict replaces the old mark, never stacks on it
  try {
    const mine = S, r = await check(S.code, { answer: vals[0] });
    if (S !== mine) return;
    if (r.verdict === "timeout") { feedback(r); return; }  // not a try: the text stays, retry resends it
    if (r.verdict === "expr_needed" || r.verdict === "unparsed") { xOpen(null); xLine(null, r); return; }   // W137: not a try, the text stays
    const closes = r.verdict === "correct" || r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0);
    if (r.verdict !== "invalid") { record({ a: t }, r); const pv = $("#preview"); if (pv) { if (closes) pv.classList.add("spent"); else pv.innerHTML = ""; } }   // closing: the preview hides but keeps its room (nothing moves, T17b-1)
    if (r.diag) xDiag(r, vals[0], null);                    // W137: before feedback(), so wishOnWrong finds Cluck's 6 moves, not a new /explain
    else if (xOn(null)) { const ln = $("#xline"); if (ln) ln.textContent = ""; }
    if (r.exprMode && !closes) xOpen(null);
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish();
    feedback(r, t);
  } finally { busy = false; }
}

/* ---------- proof (W107): a textarea (Enter = a new line, no new key handler), Check sends it to Cluck's grader ---------- */
const PROOF_MAX = 3000;                                    // serve.py PROOF_MAX
const PROOF_V = { correct: ["i-ok", "correct"], partial: ["i-x", "partly there"], wrong: ["i-x", "not yet"] };   // the one verdict chip (Nov 8: no rubric rows)
function wireProof() {
  const inp = $("#ans"), go = $("#ansGo");
  inp.addEventListener("input", () => {
    go.disabled = !inp.value.trim();
    proofLen(inp.value);
    const ff = $("#ff"); if (ff.classList.contains("bad")) { ff.classList.remove("bad"); go.hidden = false; }
  });
  go.addEventListener("click", submitProof);
  proofLen("");
}
/* the soft length guard (item.len.sentences [lo, hi]): a counter and a gentle note outside the range; Check is never blocked */
function proofLen(v) {
  const el = $("#plen"), r = S?.prob.len?.sentences; if (!el) return;
  if (!r) { el.hidden = true; return; }
  const n = (v.match(/[^.!?\n]+[.!?]*/g) || []).filter(x => /\w/.test(x)).length, [lo, hi] = r;
  el.hidden = false;
  el.textContent = `${n} sentence${n === 1 ? "" : "s"} (aim for ${lo === hi ? lo : lo + " to " + hi})` + (n && n < lo ? ". A little more?" : n > hi ? ". Maybe trim it a bit?" : "");
}
function rubricChips(g) {
  const el = $("#rubric"); if (!el) return;
  el.hidden = !g;
  const [ic, w] = PROOF_V[g] || PROOF_V.wrong;
  el.innerHTML = g ? `<span class="rb ${esc(g)}" data-v="${esc(g)}">${icon(ic)}<span>${w}</span></span>` : "";
}
async function submitProof() {
  const inp = $("#ans"), v = inp ? inp.value : "";
  if (!v.trim() || S.finished || busy) return;
  busy = true;
  try {
    const mine = S, host = () => (S === mine ? $("#stgp") : null), st = Stages.make({ host, cap: PROOF_TIMEOUT / 1000 });   // stages.js: the Check's real steps, live
    const h0 = host(); if (h0) h0.innerHTML = h0._stg = "";
    const r = await check(S.code, { answer: v }, st);
    if (S !== mine) { st.stop(); return; }
    if (r.verdict === "busy" || r.verdict === "timeout" || r.verdict === "pending") { proofWait(r); return; }   // not a try: the text stays
    if (r.verdict !== "invalid") record({ a: v }, r);
    if (r.grade) rubricChips(r.grade);
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish();
    if (r.verdict === "invalid") { $("#fb").innerHTML = `<p class="verdict bad">${icon("i-x")}<span>Write your answer here first (up to ${PROOF_MAX} letters).</span></p>`; bridge.layoutFreeze(); return; }
    feedback(r, "");
    if (r.verdict === "wrong" && r.triesLeft > 0) { const ff = $("#ff"); ff.classList.remove("bad"); vmark(ff, null); $("#ansGo").hidden = false; }   // the chips say what is wrong; the box stays open to edit, Check with it
  } finally { busy = false; }
}
/* the grader could not answer (no key, the hourly cap, a failure, an uploaded file): one wait line, with the S- code when there is one */
function proofWait(r) {
  const why = { off: "Cluck can't check proofs right now.", hourly: "Cluck needs a short break. Try again soon.", upload: "Proof checks need the hosted bank. Open it by code." }[r.why]
    || (r.verdict === "timeout" ? "Cluck is taking too long. Tap to try again." : "Cluck could not check it. Tap to try again.");
  $("#fb").innerHTML = `<p class="verdict wait">${icon("i-wait")}<span>${esc(why)}</span>${incHTML(r.inc)}${r.why === "upload" || r.why === "off" ? "" : `<button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button>`}</p>`;
  const again = $("#retry"); if (again) again.addEventListener("click", () => { $("#fb").innerHTML = ""; bridge.layoutFreeze(); submitProof(); });
  say($("#fb").textContent.replace(/\s+/g, " ").trim());
  bridge.layoutFreeze();
}

/* == §multi == */
/* ---------- multi: every part has its own arrow, verdict, tries and lockout ---------- */
const partEls = i => { const r = document.querySelector(`#q .part[data-i="${i}"]`); return { row: r, box: r.querySelector(".ff"), inp: r.querySelector(".ans"), go: r.querySelector(".send"), hint: r.querySelector(".phint") }; };
function wireParts() {
  S.parts = S.prob.parts.map(() => ({ shut: false, ok: false }));
  S.prob.parts.forEach((_, i) => {
    const { inp, go, box } = partEls(i);
    inp.addEventListener("input", () => { go.hidden = !inp.value.trim(); box.classList.remove("bad"); vmark(box, null); if (xOn(i)) xPreview(xEls(i).pv, inp.value, null); });   // the arrow appears once there is text (like the code box); W137: the working + its value
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitPart(i); } });   // Enter submits THIS box
    go.addEventListener("click", () => submitPart(i));
  });
}
/* a part is closed for good: right (green) or out of tries (dim). Disabled, not read-only: a tap doesn't focus it. */
function shutPart(i, ok) {
  const { box, inp, go } = partEls(i);
  S.parts[i].shut = true; S.parts[i].ok = ok;
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
  if (again) again.addEventListener("click", () => { hint.innerHTML = ""; row.classList.remove("hinted"); bridge.layoutFreeze(); submitPart(i); });
  say((partEls(i).row.querySelector(".mk").textContent + " " + verdictWords(r) + " " + hint.textContent).replace(/\s+/g, " ").trim());
}
async function submitPart(i) {
  const { inp, hint } = partEls(i), v = inp.value.trim();
  if (!v || S.parts[i].shut || S.finished || busy) return;
  busy = true;
  try {
    const mine = S, r = await check(S.code, { part: i, answer: v });
    if (S !== mine) return;
    if (r.verdict === "timeout") { partFeedback(i, r); bridge.layoutFreeze(); return; }   // not a try: the text stays, retry resends it
    if (r.verdict === "expr_needed" || r.verdict === "unparsed") { xOpen(i); xLine(i, r); bridge.layoutFreeze(); return; }   // W137: not a try
    if (r.verdict !== "invalid") record({ a: v, part: i }, r);
    if (r.diag) xDiag(r, v, i);
    if (r.exprMode && r.verdict === "wrong" && r.triesLeft > 0) xOpen(i);
    const spent = r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0);
    if (r.verdict === "correct") { shutPart(i, true); partFeedback(i, r, v); }
    else if (spent) { shutPart(i, false); partFeedback(i, r, v); const rv = reveal(r, i); if (rv) say(rv); }
    else partFeedback(i, r, v);
    if (mine.parts.every(x => x.shut)) { settle(); bridge.rewardMulti(mine); }
    else if (r.verdict === "correct" || spent) { const nxt = S.parts.findIndex(x => !x.shut); if (nxt >= 0 && [document.body, inp].includes(document.activeElement)) partEls(nxt).inp.focus(); }   // inp: Chromium 153 keeps focus on the just-disabled box until the next frame, 141 blurred at once (W100)
    bridge.layoutFreeze();
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
  bridge.rewardTry(a, r);
  if (r.verdict === "wrong" && S.tries.filter(x => x.v === "wrong").length === 1) window.stemDuck?.wrong?.(S.code);   // T45: the question's first wrong answer starts Cluck's sunrise within ~0.8 s (peek.js)
  if (r.verdict === "wrong") startWait();                                                                                       // the second try costs 10 s (sugar, 2-try items: startWait gates)
}

/* ---------- done questions: kept per bank + code across reloads (docs/design/DONE.md) ----------
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
    const a = document.activeElement; if (a && a !== document.body && a.blur && !a.matches(".nx") && !a.closest("#cluck, #q .vdrawer, #q .vk, #q .vkb")) a.blur();   // Next in the Check slot keeps focus (T17b-1); so does Cluck's sheet (opened in the beat), and the strip: its verdict icon / drawer take focus on purpose (a close inside the beat returns it to the icon)
    if (mtOpen) bridge.closeMT(false);
    if (swapOn) bridge.setSwap(false);
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
      else if (u.x > 0) { const r = { verdict: "wrong", triesLeft: Math.max(0, max - u.x), hint: u.hint || undefined }; partFeedback(i, r); }
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
  else if (u.x > 0) feedback({ verdict: "wrong", triesLeft: S.triesLeft, hint: u.hint || undefined });
  if (!S.finished && S.triesLeft === 1) startWait();       // a reload / reopen with one try left: the 10 s starts over (no stored timer, no bypass)
}
function repaint(rec) {
  Object.assign(S, { tries: [], hints: [], triesLeft: maxTries(S.prob), finished: false, selected: null });
  renderQuestion(); $("#fb").innerHTML = "";
  if (rec) paint(rec);
  bridge.layoutFreeze();
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
/* the retry tag (round 7 PICKER 9: retry-tag "Agreed" on the shadcn 6px shape): a re-showing says so at the top of the card, so a blank card
   never reads as lost work. Owes a miss = Pity roll, else Review; once closed: Avenged! / Reviewed, or Comes back later. No "+3" until
   D60 pays it. No lockout sub-lines (Tony, Oct 17: drop). */
const RTAG = { owe: ["Pity roll", "i-back"], won: ["Avenged!", "i-ok"], review: ["Review", "i-back"], kept: ["Reviewed", "i-ok"], out: ["Comes back later", "i-back"] };
function retryTag() {
  const t = $("#rtag"), r = window.stemRedo.get(), on = !!S && !!r && r.codes.includes(S.code);
  const won = !!S && S.finished && (S.prob.type === "multi" ? !!S.solved : S.tries.some(x => x.v === "correct"));
  const k = !on ? null : !S.finished ? (r.redeem !== false ? "owe" : "review") : won ? (r.redeem !== false ? "won" : "kept") : "out";
  t.hidden = !k;
  t.className = "qtag rtag" + (k ? " rt-" + k : "");
  t.innerHTML = k ? `${icon(RTAG[k][1])}<span>${RTAG[k][0]}</span>` : "";
}
/* W104 Sleeping guard (MC only): a closed item says so in a row under the choices, three cues so colour never carries it: the lock, the words,
   Cluck napping on it. A Redeem closed right wakes him instead: the feather burst plays on the live moment only (a revisit is still, and
   reduced motion never gets one). Kind copy; no clock (nothing on the page knows when it comes back). */
function guard() {
  $("#q .guard")?.remove();
  if (!S || S.prob.type !== "mc") return;
  const r = window.stemRedo.get(), redeem = !!r && r.codes.includes(S.code) && r.redeem !== false;
  const won = S.tries.some(x => x.v === "correct");
  if (won && !redeem) return;
  const burst = won && !painting && !matchMedia("(prefers-reduced-motion: reduce)").matches ? `<span class="burst" aria-hidden="true">${"<i></i>".repeat(8)}</span>` : "";
  $("#q").insertAdjacentHTML("beforeend", won
    ? `<div class="guard won${painting ? "" : " live"}"><span class="gd-burst" aria-hidden="true">${burst}</span><p><b class="gd-win">Avenged!</b> Locked in for good.</p></div>`
    : `<div class="guard lock"><span class="gd-lock" aria-hidden="true">${icon("i-lock")}</span><p><b>I'm guarding this one.</b> It comes back for a revenge round.</p></div>`);
}
function finish() {
  S.finished = true; cancelWait();
  $("#q").classList.add("closed");
  $("#q").classList.toggle("solved", S.tries.at(-1)?.v === "correct");   // right: the Key formulas box goes (Tony Nov 13: "no one would need it anymore")
  document.querySelectorAll("#q .opt, #q .ans, #q .send").forEach(x => { x.disabled = true; x.setAttribute("aria-disabled", "true"); });
  document.querySelectorAll("#q .send").forEach(b => { b.hidden = true; });
  cueNext();
  retryTag();
  guard();
  const mine = S, still = painting;
  queueMicrotask(() => { if (S === mine) cueChip(still); });   // after feedback(): a wrong last try makes its own wish first (wishOnWrong)
}
/* ---------- T17b-1 DEFAULT CUE (r5/B cue3.html, the R3 REC set): a labelled Next lands in the Check slot of the last try ----------
   Every answer type: the mc row's own arrow slot, the num / expr / text box, the multi part's box, the pick-all Check row. The Check rect
   lies inside Next (96x48, right edges flush), so nothing moves and the card stays put. Focus goes to Next (no scroll); a held Enter
   (e.repeat) never skips a question. Live: g-next-in (app.css) lands it once; a restored question shows it still. No list (#qnav hidden)
   = nowhere to go, so no Next. */
let painting = false;
function nextBtn() {                                                             // the cue's Next: nav.js go(1), the same queue as the bar's Next
  const b = document.createElement("button");
  b.type = "button"; b.className = "nx" + (painting ? "" : " g-next"); b.setAttribute("aria-label", "Next question");
  b.innerHTML = `<span class="nf"><span>Next</span>${icon("i-tri")}</span>`;
  b.addEventListener("click", e => {
    e.stopPropagation();
    const n = $("#qnext");
    if (!n || n.disabled) { dispatchEvent(new CustomEvent("drill:note", { detail: { text: "No more questions, no more eggs." } })); return; }
    n.click();
  });
  return b;
}
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
/* 114r v1f (Tony Nov 2: "build + ship"; mock brain mock-opus/114r/v1f.html): a closed typed single-field question in sugar is ONE reveal box. The field tints with the
   verdict and keeps the student's answer; Ask Cluck (the duck chip, adopted from #wish) is the field's flush right segment in Cluck's brown; Next sits outside the
   field, beside it; the line under it is a plain sentence. Nothing is added after Check, so nothing moves. Idempotent: called after every paint of the pieces */
const rboxOn = () => !!S && modeOf() === "sugar" && !!S.prob.wish && !["mc", "multi", "proof"].includes(S.prob.type);
const DUCK = `<svg class="dk" viewBox="0 2 24 20.5" aria-hidden="true"><ellipse cx="10" cy="16" rx="9" ry="6" fill="#f6a623"/><circle cx="15" cy="8" r="5" fill="#f6a623"/><path d="M19.5 7.5l4 1.5-4 1.6z" fill="#ff7a1a"/><circle cx="16" cy="7" r="1" fill="#222"/></svg>`;
function rboxSync() {
  const ff = document.querySelector("#q #ff.ff.cue");
  if (!ff || !rboxOn() || !S.finished) return;
  ff.classList.add("rbox");
  const ok = ff.classList.contains("ok");
  ff.classList.toggle("tight", ff.parentElement.clientWidth < 480);        // the label needs room: below it, the duck-only segment (the mock's 390 fallback)
  const wb = document.querySelector("#wish .wbar"), btn = wb && wb.querySelector(".wchip");
  if (btn) {
    ff.querySelectorAll(":scope > .wchip").forEach(x => x.remove());
    const img = btn.querySelector(".dk");
    if (img) { const t = document.createElement("template"); t.innerHTML = DUCK; const svg = t.content.firstChild; if (img.classList.contains("g-nod")) svg.classList.add("g-nod"); img.replaceWith(svg); }
    btn.hidden = bridge.wishEl().hidden;
    ff.insertBefore(btn, ff.querySelector(".nx"));
    wb.remove();
  }
  if (ok && !document.querySelector("#q .ansl")) {                         // right: the line says it too; the value is what the student typed
    const u = S.prob, host = $("#preview"), v = $("#ans").value.trim();
    if (host && v) {
      let val = esc(v);
      if (u.type === "expr" && typeof math !== "undefined") { try { val = renderMath(answerTex(v), false); } catch { /* the plain text stands */ } }
      const unit = u.type === "num" && u.unit ? `<span class="ansv"><b>${val}</b> <span class="ansu">${esc(u.unit).replace(/\^(-?\d+)/g, "<sup>$1</sup>")}</span></span>` : `<b>${val}</b>`;
      host.classList.remove("spent"); host.innerHTML = ""; host.removeAttribute("aria-hidden");
      host.insertAdjacentHTML("beforeend", `<p class="ansl">${revDuck()}<span>That's it! The answer is </span>${unit}${bridge.mathCopyBtn("Copy answer", v)}</p>`);
      pvFit(host);
    }
  }
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
  const nx = nextBtn();
  send.after(nx);
  if (h0 && Math.abs(box.offsetHeight - h0) > 0.5) nx.style.top = h0 / 2 + "px";
  const g = box.closest(".choices.inline");                                     // pills: Next must fit its pill, else the rows stack
  if (g && (g.scrollWidth > g.clientWidth + 0.5 || [...g.querySelectorAll(".opt")].some(o => o.scrollWidth > o.clientWidth + 0.5))) g.classList.remove("inline");
  if (!painting) nx.focus({ preventScroll: true });
  rboxSync();
  if ($("#padFab") && !$("#padFab").hidden) requestAnimationFrame(() => bridge.fabPlace({ avoid: true }));      // Open notes steps off Next (A1: it sat on the 4th multi box)
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
  if (u.type === "expr" && typeof math !== "undefined") { try { val = renderMath(answerTex(String(c)), false); } catch { /* the plain text stands */ } }
  host.querySelector(".ansl")?.remove();
  if (!multi) { host.classList.remove("spent"); host.innerHTML = ""; host.removeAttribute("aria-hidden"); }
  const unit = u.type === "num" && u.unit ? `<span class="ansv"><b>${val}</b>\u2009<span class="ansu">${esc(u.unit).replace(/\^(-?\d+)/g, "<sup>$1</sup>")}</span></span>` : `<b>${val}</b>`;   // W132: value green + thin space + unit in ink; copy = the value only
  const sentence = !multi && rboxOn();                       // 114r v1f: the line under the reveal box is a plain sentence, no check, no chip
  host.insertAdjacentHTML("beforeend", `<p class="ansl">${sentence ? `<span>Not it. The answer is\u00a0</span>` : `${icon("i-ok")}<span>Answer</span>`}${unit}${bridge.mathCopyBtn("Copy answer", String(c))}${sentence ? revDuck() : ""}</p>`);
  if (!multi) pvFit(host);                                   // W91: the reveal's line uses the preview's room (the same ratchet)
  if (multi) host.parentElement.classList.add("hinted");
  return "The answer: " + (host.querySelector(".ansl .ansv") || host.querySelector(".ansl b")).textContent.replace(/\s+/g, " ").trim() + ".";
}
/* the duck chip (sugar, questions with Cluck's key only): right = "See Cluck's steps", out of tries = "Ask Cluck". A tap pays no XP */
function cueChip(still) {
  if (mockHold()) return;
  if (modeOf() !== "sugar" || !S || !S.finished || !S.prob.wish) return;
  if (!bridge.wish || bridge.wish.code !== S.code || bridge.wish.idle) { bridge.wishNew({ started: false }); bridge.wishFromCache(bridge.wish); }
  if (!still && bridge.wish.nod == null) { if (cueRight()) bridge.wish.nod = nodGate(); else { bridge.wish.nod = false; nodMiss(); } }
  bridge.wishPaint();
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
  if (r.verdict === "correct") rpUnmount();                                  // right: the repair box has done its job
  const fb = $("#fb");
  let h = "";
  /* right / wrong / out: the answer box (or the MC badge) shows the icon; no words on the page */
  const ff = S.prob.type === "mc" ? null : $("#ff");
  if (ff && r.verdict === "correct") vmark(ff, "i-ok");
  else if (ff && (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))) { ff.classList.remove("bad"); ff.classList.add("lock"); vmark(ff, "i-lock"); }
  else if (ff && r.verdict === "wrong") { ff.classList.add("bad"); $("#ansGo").hidden = !waiting(); vmark(ff, "i-x"); }   // the 10 s second-try wait: the Check stays up as the progress bar
  if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Oops! Can't read <code>${esc(typed)}</code>, try again!</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved! Tap Copy to send to Tony.</span>${incHTML(r.inc)}</p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>Timeout! Tap to try again.</span>${incHTML(r.inc)}<button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  /* out of tries: no words on the page (Q13). The lock, the struck rows / box and Next in the Check slot say it; the screen reader hears verdictWords.
     The mock night (W103b) is the exception: one try, no hint, no Cluck, so the lock alone read as a dead end (Tony, Nov 3 18:14, img3): one line says why and where next */
  else if (mockHold() && r.verdict === "wrong") h = `<p class="verdict wait mock-next">${icon("i-back")}<span>Mock round: one try each. Tap Next. Misses come back at the end.</span></p>`;
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
  if (again) again.addEventListener("click", () => { fb.innerHTML = ""; bridge.layoutFreeze(); (S.prob.type === "mc" ? submitMC : S.prob.type === "proof" ? submitProof : submitFF)(); });
  const rev = reveal(r);
  say((verdictWords(r) + " " + rev + " " + fb.textContent + " " + (inRow ? chk.querySelector(".cluck").textContent : "")).replace(/\s+/g, " ").trim());
  bridge.layoutFreeze();
  rboxSync();
  if (r.verdict === "wrong") { if (S && !S.prob.ladder) ladderStep(); bridge.wishOnWrong(); repairAfterMiss(r); }   // no ladder: each wrong try shows the next formula row, then the arrows
  window.stemBrainrot?.sync();
}

/* the hash routing (moved here from the boot section by split-app.mjs MOVE_TO_APP) */
const hashCode = () => location.hash.length > 1 ? normalizeLink(decodeURIComponent(location.hash.slice(1))) : null;
const fromHash = () => {
  const n = hashCode();
  if (!n) { if (location.hash.length > 1) note(`Quack, can't open ${location.hash.slice(1, 40)}.`); return; }   // a #code that is no code (T16: said, not silent)
  if (n.prefix !== "BANK" && S && S.code === n.code && window.stemMock?.again?.(n.code)) return load(n.code);   // the mock starting on the open X3 Q1 (nav.js, W103b): its fresh round
  if (n.prefix === "BANK") { if (!bank || bank.code !== n.code) return openBank(n.code); }
  else if (!S || S.code !== n.code) return load(n.code);
};

export { $, S, bank, check, cueRight, dock, drawFigures, esc, fitChoices, frReq, fromHash, hashCode, hideToast, icon, incHTML, inflight, isProof, mainEl, maxTries, md, mockHold, noteAt, obToast, off, oneBox, openBank, opts, painting, partEls, proofTyping, rboxSync, renderMath, reqInc, retryLoad, root, rpUnmount, say, select, snackChg, src, toast, waitReduced, xInc };
