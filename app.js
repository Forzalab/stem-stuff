/* app.js: the drill page. Code entry -> p/<CODE>.json (served from problems.json, or an uploaded problems.json) -> blocks -> answer -> scratchpad -> Copy.
   Layout decisions for the frozen problem: design/FREEZE.md. Payload: copy/COPY-PAYLOAD.md. */
import { build, stringify } from "./copy/payload.mjs";
import { shuffled, seed } from "./shuffle.mjs";
import { suggest, remember, isBank } from "./suggest.mjs";

const $ = s => document.querySelector(s);
const root = document.documentElement;
const CODE_RE = /^(CALC1|CSCI26|PHYS|PSY)_[A-Z0-9]{3,6}$/;
const MAX_TRIES = 2;   // tries for everything except a 2-choice mc (maxTries)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
const say = t => { const sr = $("#sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); };
/* the "one more try" note (design/TOAST.md, take 5f): hangs under the wrong answer box with a caret at its verdict mark; on MC it
   lies on the struck-out choice (a dead control, so no live choice is covered). Page type, no colour of its own. 2.5 s, paused while
   the pointer rests on it or the tab is hidden; tap or Esc closes it. Follows the box on scroll. */
let toastT = 0, toastAt = null, toastLeft = 0, toastSince = 0;
function placeToast() {
  const t = $("#toast"); if (!t || !toastAt || !toastAt.isConnected) return;
  const b = toastAt.getBoundingClientRect(), row = toastAt.classList.contains("opt");
  const m = (toastAt.querySelector(".vk, .badge") || toastAt).getBoundingClientRect(), mx = m.left + m.width / 2;
  const gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gut")) || 20;
  t.classList.toggle("row", row);
  if (row) { t.style.width = b.width + "px"; t.style.minHeight = b.height + "px"; t.style.left = b.left + "px"; t.style.top = (b.top + b.height / 2 - t.offsetHeight / 2) + "px"; return; }
  t.style.width = ""; t.style.minHeight = "";
  const w = t.offsetWidth;
  let x = mx > b.left + b.width / 2 ? b.right - w : b.left;
  x = Math.min(Math.max(gut, x), innerWidth - gut - w);
  t.style.left = x + "px"; t.style.top = (b.bottom + 12) + "px";
  t.style.setProperty("--px", Math.max(18, Math.min(w - 18, mx - x)) + "px");
}
function hideToast() { clearTimeout(toastT); toastLeft = 0; toastAt = null; $("#toast")?.classList.remove("on"); }
function armToast(ms) { clearTimeout(toastT); toastLeft = ms; toastSince = Date.now(); toastT = setTimeout(hideToast, ms); }
function holdToast() { if (toastLeft) { clearTimeout(toastT); toastLeft = Math.max(600, toastLeft - (Date.now() - toastSince)); } }
function goToast() { if (toastLeft && toastAt) armToast(toastLeft); }
function toast(text, at) {
  const t = $("#toast"); if (!t || !at) return;
  t.textContent = text; toastAt = at; t.classList.add("on");
  placeToast(); armToast(2500);
}
$("#toast")?.addEventListener("click", hideToast);
$("#toast")?.addEventListener("pointerenter", holdToast);
$("#toast")?.addEventListener("pointerleave", goToast);
document.addEventListener("visibilitychange", () => { document.hidden ? holdToast() : goToast(); });
addEventListener("keydown", e => { if (e.key === "Escape" && toastAt) hideToast(); });
addEventListener("scroll", placeToast, { passive: true });
addEventListener("resize", placeToast);
const AGAIN = "One more try, so\u00A0choose\u00A0wisely.";   // no-break spaces keep "choose wisely." together
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
const verdictWords = r => r.verdict === "correct" ? "Correct." : r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0) ? "Out of tries."
  : r.verdict === "wrong" ? "Not quite. One more try." : "";

/* ================= markdown + TeX ================= */
function renderMath(src, display) {
  if (typeof katex === "undefined") return `<code>${esc(src)}</code>`;
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
}
/* $$..$$ and $..$ are cut out before markdown so marked never sees TeX; "\$" is a literal dollar. */
function md(text, inline = false) {
  const src = Array.isArray(text) ? text.join("\n") : String(text);
  const math = [];
  const tok = i => `KXMATH${i}Z`;
  let s = src.replace(/\\\$/g, () => { math.push({ lit: "$" }); return tok(math.length - 1); });
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { math.push({ t, d: true }); return tok(math.length - 1); });
  s = s.replace(/\$([^$\n]+?)\$/g, (_, t) => { math.push({ t, d: false }); return tok(math.length - 1); });
  let html;
  if (typeof marked !== "undefined") {
    const renderer = new marked.Renderer();
    renderer.html = tokOrText => esc(typeof tokOrText === "string" ? tokOrText : tokOrText.text);   // raw HTML is escaped
    renderer.image = () => "";                                                                         // images ignored
    renderer.table = function (...a) { return `<div class="tbl">${marked.Renderer.prototype.table.apply(this, a)}</div>`; };
    html = inline ? marked.parseInline(s, { renderer, gfm: true }) : marked.parse(s, { renderer, gfm: true });
  } else {
    html = esc(s).split(/\n{2,}/).map(p => inline ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  }
  return html.replace(/KXMATH(\d+)Z/g, (_, i) => { const m = math[+i]; return m.lit ? "$" : renderMath(m.t, m.d); });
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
async function net(url, init = {}) {
  const ctl = new AbortController(), req = { ctl, t0: Date.now() };
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  inflight.add(req);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); inflight.delete(req); }
}
const localState = new Map();
async function check(code, answer) {
  const off = window.stemOffline;
  if (off && off.has(code)) return gradeLocal(off.get(code), answer);
  try {
    const r = await net("check", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
                                     body: JSON.stringify({ code, ...answer }) });
    if (r.ok) return await r.json();
  } catch (e) { if (timedOut(e)) return { verdict: "timeout" }; /* else offline */ }
  return { verdict: "pending" };
}
/* mirror of serve.py grade(): keep the two in step */
const maxTries = p => p.type === "mc" && shown(p).length === 2 ? 1 : MAX_TRIES;   // serve.py max_tries(): 2-choice mc = ONE try, else two
const all = p => p.type === "mc" && p.pick === "all";                              // checkboxes, graded as a set (design/CHOOSE-ALL.md)
const FIX_NUDGE = "QUACK. Right call on which ones are false. One fix is off: redo that row's math.";   // serve.py FIX_NUDGE
const squash = t => String(t).replace(/\s+/g, "").toLowerCase();
function unitSig(u, t) {                                  // serve.py signature()
  if (u.type === "text") { if (!squash(t)) throw 0; return squash(t); }
  if (/^\s*(dne|does not exist)\s*$/i.test(t)) return "dne";
  const v = u.var || "x", c = math.compile(t.replace(/ln\s*\(/gi, "log(").replace(/π/g, "pi").replace(/∞/g, "Infinity"));
  const at = x => { let r = c.evaluate({ [v]: x }); if (typeof r !== "number") r = math.number(r); if (Number.isNaN(r)) throw 0; return r; };
  return u.type === "expr" ? u.points.map(at) : at(undefined);
}
const same = (a, b, tol) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i], tol))
  : typeof a === "string" || typeof b === "string" || !Number.isFinite(a) || !Number.isFinite(b) ? a === b
  : Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
/* right to 4 significant figures (serve.py sig4): correctness only, never wrong-entry matching or repeats */
const sig4 = (a, b) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => sig4(x, b[i]))
  : typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && b !== 0
    && Math.abs(a - b) <= 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(b))) - 3) * (1 + 1e-9);
function unitOk(u, g) {
  if (u.type === "text") return [u.answer, ...(u.accept || [])].map(squash).includes(g);
  const a = u.answer === "dne" ? "dne" : unitSig(u, u.answer);
  return same(g, a, u.tol ?? 1e-6) || sig4(g, a);
}
function unitHit(u, t, g) {                               // re entries first, then match
  const w = u.wrong || [];
  return w.find(x => x.re && new RegExp(x.re, "i").test(t))
    || w.find(x => { try { return x.match != null && same(g, unitSig(u, x.match), u.tol ?? 1e-6); } catch { return false; } });
}
function gradeLocal(key, answer) {                        // multi: { part: i, answer } grades ONE part, with its own tries and lockout
  const multi = key.type === "multi", idx = answer.part;
  if (multi && !(Number.isInteger(idx) && idx >= 0 && idx < key.parts.length)) return { verdict: "invalid", triesLeft: maxTries(key) };
  const sk = multi ? `${key.code}#${idx}` : key.code, st = localState.get(sk) || { wrong: [], done: false };
  localState.set(sk, st);
  const R = o => multi ? { ...o, part: idx } : o;
  const left = () => maxTries(key) - st.wrong.length;
  if (st.done || left() <= 0) return R({ verdict: "locked", triesLeft: 0 });
  let hit = null, correct, sig;
  if (all(key)) {                                         // { choices: [ids] }; hint = first ticked distractor in shown (authored) order, else miss
    /* prove mode (key.fix): + fixes { id: text } for exactly the un-ticked, unlocked rows; a right set then grades each fix like a part */
    const ch = answer.choices, sh = shown(key), right = [].concat(key.correct), lk = sh.filter(c => c.lock).map(c => c.id), fx = answer.fixes;
    const need = key.fix && Array.isArray(ch) ? sh.filter(c => !c.lock && !ch.includes(c.id)).map(c => c.id) : [];
    if (!Array.isArray(ch) || !ch.length || ch.some(x => !sh.some(c => c.id === x)) || new Set(ch).size !== ch.length
        || (ch.length > 1 && ch.some(x => lk.includes(x)))
        || (key.fix && (!fx || typeof fx !== "object" || Array.isArray(fx) || Object.keys(fx).length !== need.length
            || need.some(id => typeof fx[id] !== "string" || !fx[id].trim())))) return { verdict: "invalid", triesLeft: left() };
    sig = [...ch].sort().join(",");
    correct = ch.length === right.length && ch.every(x => right.includes(x));
    const w = key.wrong || [];
    if (!correct) {
      const c = sh.find(c => ch.includes(c.id) && !right.includes(c.id) && w.some(x => x.choice === c.id));
      hit = c ? { ...w.find(x => x.choice === c.id), struck: c.id } : { error: "incomplete", hint: key.miss };
      if (key.fix) sig = [sig, ...need.map(id => squash(fx[id]).slice(0, 200))];
    } else if (key.fix) {                                 // unreadable fix = invalid; else the first wrong fix in authored order
      const us = need.map(id => { const e = w.find(x => x.choice === id); return e && e.fix ? { id, u: { ...key.fix, ...e.fix }, t: fx[id].slice(0, 200) } : null; }).filter(Boolean);
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
  }
  if (correct) { st.done = true; return R({ verdict: "correct", triesLeft: left() }); }
  const tol = (multi ? key.parts[idx] : key).tol ?? 1e-6;
  const repeat = st.wrong.some(w => same(sig, w, tol));
  if (!repeat) st.wrong.push(sig);
  const out = { verdict: "wrong", triesLeft: left(), hint: hit && hit.hint ? hit.hint : (key.nudge || "QUACK. Plug your answer back into the problem. Does it work?") };
  if (hit && hit.error) out.error = hit.error;
  if (hit && hit.struck) out.struck = hit.struck;
  if (hit && hit.fixWrong) out.fixWrong = hit.fixWrong;
  if (repeat) out.repeat = true;
  return R(out);
}

/* ================= entry box: code bar + upload ================= */
const codeIn = $("#code"), dock = $("#dock"), mainEl = $("#main");
let swapOn = false, lostAt = 0, mtOpen = false, lastEdit = null;   // mtOpen: the phone's pad page (variant 9); lastEdit: see backInView          // Swap state (see "Swap" below)
/* canonical code: PREFIX_SUFFIX ("_" joins words, so one double-tap on a phone selects the whole code).
   Accept lower case, "-" (old links), a space, or no separator at all. */
function normalize(raw) {
  const s = raw.toUpperCase().trim().replace(/^#/, "");
  const m = s.match(/^(CALC1|CSCI26|PHYS|PSY|BANK)[\s_-]*([A-Z0-9]{3,6})$/);
  return m ? { prefix: m[1], code: `${m[1]}_${m[2]}` } : null;
}
/* the box is empty while a problem is open (its code is the placeholder); empty = Paste button, text = submit arrow */
const codeGo = $("#codeGo"), codePaste = $("#codePaste");
function syncCode() { const empty = !codeIn.value; codePaste.hidden = !empty; codeGo.hidden = empty; }
codeIn.addEventListener("input", () => { $("#entryMsg").textContent = ""; syncCode(); sugShow(); });
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
function sugShow() {
  sugList = suggest(codeIn.value, knownCodes());
  sugAt = -1;
  sugEl.innerHTML = sugList.map((c, i) => `<li role="option" id="sug${i}" aria-selected="false" data-code="${esc(c)}">${icon(isBank(c) ? "i-list" : "i-doc")}<span>${esc(c)}</span></li>`).join("");
  sugEl.hidden = !sugList.length;
  codeIn.setAttribute("aria-expanded", String(!!sugList.length));
  codeIn.removeAttribute("aria-activedescendant");
}
function sugHide() {
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
codeIn.addEventListener("blur", () => sugHide());
/* a whole problem code pasted into any other field lands in the code box instead (not opened: the user presses the arrow) */
document.addEventListener("paste", e => {
  const t = e.target;
  if (t === codeIn || !(t instanceof HTMLElement) || !t.matches("input:not([type=file]), textarea")) return;
  const n = normalize((e.clipboardData && e.clipboardData.getData("text")) || "");
  if (!n) return;
  e.preventDefault();
  putCode(n.code); $("#entryMsg").textContent = ""; codeIn.focus();
});
codePaste.addEventListener("click", async () => {
  let n = null;
  try { n = normalize(await navigator.clipboard.readText()); } catch { /* plain http or denied: paste by hand */ }
  if (!n) { codeIn.focus(); return; }
  putCode(n.code); $("#entryMsg").textContent = ""; codeGo.focus();
});
$("#entry").addEventListener("submit", e => {
  e.preventDefault();
  sugHide();
  const n = normalize(codeIn.value);
  if (!n) { $("#entryMsg").textContent = "Codes look like CALC1_T6B."; codeIn.focus(); return; }
  codeIn.blur();
  if (n.prefix === "BANK") openBank(n.code); else load(n.code);
});
/* upload = offline.js reads ONE problems.json (every problem in it) into memory; that store also answers fetch("p/<CODE>.json").
   After a file is loaded: open the code already typed if the file has it, else the file's first problem. */
$("#upload").addEventListener("click", async () => {
  const off = window.stemOffline;
  if (!off || !off.pickFile) { $("#entryMsg").textContent = "Can't open files here."; return; }
  const r = await off.pickFile();
  if (r && r.error) $("#entryMsg").textContent = r.error;
});
addEventListener("DOMContentLoaded", () => {
  /* offline.js loads after this module; take over its "file loaded" event */
  if (window.stemOffline) window.stemOffline.onProblemLoaded(p => {
    const typed = normalize(codeIn.value), off = window.stemOffline;
    leaveBank();                                                     // an upload is the live list now
    load(typed && off.has(typed.code) ? typed.code : p.code);
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
  codes: () => bank ? bank.codes.slice() : [],
  get: c => bank && bank.get.get(c),
  mark: c => (bank && bank.marks[c]) || null
};
const bankChanged = () => dispatchEvent(new CustomEvent("drill:bank"));
function leaveBank() { src("file"); if (bank) { bank = null; bankChanged(); } }
/* code: BANK_XXX, or "last" (the server's pointer for this browser). go: open a question (at, else the first).
   quiet (boot): no message, no retry; a bank that is gone just leaves the page as it is. */
async function openBank(code, { go = true, quiet = false } = {}) {
  retryLoad.hidden = true;
  let b = null;
  try {
    const r = await net(`b/${code}.json`);
    if (r.ok) b = await r.json(); else r.text().catch(() => {});
  } catch (e) {
    if (!quiet) {
      $("#entryMsg").textContent = timedOut(e) ? "timeout" : "Couldn't load that. Check your connection.";
      retryLoad.hidden = false; retryLoad.onclick = () => openBank(code, { go });
    }
    return false;
  }
  if (!b || !b.problems.length) { if (!quiet) $("#entryMsg").textContent = `No bank ${code}.`; return false; }
  bank = { code: b.code, codes: b.problems.map(p => p.code), get: new Map(b.problems.map(p => [p.code, p])), marks: b.marks || {} };
  src(b.code);
  remembered(b.code);
  bankChanged();
  if (!go) return true;
  const to = bank.codes.includes(b.at) ? b.at : (window.stemOrder ? window.stemOrder(bank.codes) : bank.codes)[0];   // first in the shuffled list (nav.js)
  if (S && S.code === to) { putCode(""); $("#entryMsg").textContent = ""; } else await load(to);
  return true;
}
/* ================= problem state ================= */
let busy = false;    // a grading request is out (MC and typed answers)
let S = null;        // { code, prob, start, tries, hints, triesLeft, finished, selected, box }
async function fetchProblem(code) {
  const r = await net(`p/${code}.json`);
  if (r.ok) return r.json();
  r.text().catch(() => {});   // drain the 404 body so the request completes
  const e = new Error("not found"); e.status = r.status; throw e;
}
async function load(code) {
  if (!CODE_RE.test(code)) return;
  let prob;
  retryLoad.hidden = true;
  try { prob = await fetchProblem(code); }
  catch (e) {
    $("#entryMsg").textContent = e.status === 404 ? `No problem ${code}.` : timedOut(e) ? "timeout" : "Couldn't load that. Check your connection.";
    if (e.status !== 404) { retryLoad.hidden = false; retryLoad.onclick = () => load(code); }
    return;
  }
  $("#entryMsg").textContent = "";
  putCode(""); codeIn.placeholder = code;   // the open problem's code is the placeholder
  remembered(code);
  if (location.hash !== "#" + code) history.replaceState(null, "", "#" + code);
  if (!S || S.code !== code) barOpen(false);                        // another problem opened: the bar goes back to its strip
  S = { code, prob, start: Date.now(), tries: [], hints: [], triesLeft: maxTries(prob), finished: false, selected: null, box: null };
  root.classList.remove("start");   // leave the start page now: html.start hides main, so figures drawn under it measure 0 wide
  const rec =doneStore() ? doneStore().doneGet(code) : null;
  if (rec && off()) seedLocal(code, rec, prob);
  render();
  if (rec) paint(rec);
  if (!off()) syncServer(S);
  dispatchEvent(new CustomEvent("drill:problem", { detail: { code } }));   // nav.js (design/NAV.md)
}

function render() {
  const { prob, code } = S;
  document.title = code;
  $("#freeze").hidden = false; $("#work").hidden = false;
  $("#freeze").classList.remove("open");
  $("#pcode").textContent = code;
  const blocks = $("#blocks"); blocks.innerHTML = "";
  for (const b of prob.body) {
    if (b.type === "text") { const d = document.createElement("div"); d.className = "md"; d.innerHTML = md(b.md); blocks.append(d); }
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
  applyMT();
  layoutFreeze();
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
    q.innerHTML = `${howLine(p)}<div class="choices${many ? " all" : ""}" ${many ? 'role="group" aria-labelledby="how"' : 'role="radiogroup" aria-label="Choices"'}>${list.map((c, i) => `
      <div class="ch" data-id="${esc(c.id)}">
        <button type="button" class="opt" role="${many ? "checkbox" : "radio"}" aria-checked="false" tabindex="${i ? -1 : 0}" data-id="${esc(c.id)}" data-l="${LETTERS[i]}"${c.lock ? " data-lock" : ""}>
          ${many ? `<span class="badge" aria-hidden="true">${icon("i-ok")}</span><span class="lt" aria-hidden="true">${LETTERS[i]}</span>`
            : `<span class="badge" aria-hidden="true">${LETTERS[i]}</span>`}<span class="txt">${md(c.md, true)}</span>
        </button>
        ${many ? "" : `<button type="button" class="btn btn-go send" aria-label="Submit ${LETTERS[i]}" hidden>${icon("i-go")}</button>`}
        ${p.fix && many && !c.lock ? `<p class="fix-how" id="fh${i}" hidden>${esc(p.fix.how || "correct value")}</p><div class="ff fix" hidden><input class="ans" type="text" aria-label="Correct value for ${LETTERS[i]}" ${INPUT_ATTRS}
          data-how="${esc(p.fix.how || "correct value")}" placeholder="${esc(p.fix.how || "correct value")}"></div>` : ""}
      </div>`).join("")}</div>${many ? `<div class="chk"><button type="button" class="btn btn-go send" id="mcGo" aria-label="Check" disabled>${icon("i-go")}</button></div>` : ""}`;
    q.querySelectorAll(".opt").forEach(o => o.setAttribute("aria-label", `${o.dataset.l}: ${o.querySelector(".txt").textContent.trim()}`));
    wireMC(q);
    fitChoices();
  } else if (p.type === "multi") {
    /* one row per part: "a)", its sub-question (if it has one), its own box with its own arrow inside (the freeform pattern).
       Each part is graded alone, with its own tries and lockout (SCHEMA.md "Grading"). */
    q.innerHTML = `${howLine(p)}<div class="mparts" id="ff" role="group" aria-label="Answers"${p.how ? ' aria-describedby="how"' : ""}>${p.parts.map((u, i) => {
      const l = esc(u.label || LETTERS[i].toLowerCase());
      return `<div class="part${u.prompt ? "" : " nopr"}" data-i="${i}"><span class="mk" id="mk${i}" aria-hidden="true">${l})</span>${u.prompt ? `<div class="pr md" id="pr${i}">${md(u.prompt)}</div>` : ""}
        <div class="ff"><input class="ans" type="text" aria-labelledby="mk${i}${u.prompt ? ` pr${i}` : ""}" ${INPUT_ATTRS}>
          <button type="button" class="btn btn-go send" id="go${i}" aria-label="Submit ${l}" hidden>${icon("i-go")}</button></div>
        <div class="phint" id="ph${i}" aria-live="polite"></div></div>`;
    }).join("")}</div>`;
    wireParts();
  } else {
    const v = p.var || "x";
    const lead = p.type === "expr" ? `<span class="lead" aria-hidden="true">${renderMath(`f(${v}) =`, false)}</span>` : "";
    const ph = p.type === "expr" ? "in terms of " + v : p.type === "num" ? "e.g. 9/2, sqrt(3), dne" : "";
    q.innerHTML = `${howLine(p)}<div class="ff" id="ff">${lead}
        <input id="ans" class="ans" type="text" aria-label="${p.type === "expr" ? `Answer: f(${v})` : "Answer"}"${p.how ? ' aria-describedby="how"' : ""}
          ${INPUT_ATTRS} placeholder="${ph}">
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Submit answer" disabled>${icon("i-go")}</button>
      </div><div class="preview" id="preview" aria-hidden="true"></div>`;
    wireFF();
  }
}
const INPUT_ATTRS = 'inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"';
/* the problem's "how to type the answer" line, right above the answer box */
const howLine = p => { const h = p.how || (all(p) ? "Choose all that apply." : ""); return h ? `<p class="how" id="how">${md(h, true)}</p>` : ""; };
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
  g.querySelectorAll(".fix").forEach(fitFix);
  if (fits !== was) layoutFreeze();
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
    const many = all(S.prob), live = opts().filter(x => !x.disabled), i = live.indexOf(o);
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
  const lock = o.hasAttribute("data-lock");
  if (m === "x" && (lock || !fixOf(o))) return;
  const next = markOf(o) === m ? "" : m;
  for (const x of opts()) if (x !== o && next === "on" && (lock || x.hasAttribute("data-lock")) && markOf(x) === "on") mark(x, "");
  mark(o, next);
  syncTicks();
}
/* Check is live with 1+ ticks (empty is invalid: never sent); prove mode also needs every unlocked row ticked or X'd, every X with its fix */
function syncTicks() {
  S.selected = ticked().map(x => x.dataset.id);
  const proved = !S.prob.fix || opts().every(o => o.hasAttribute("data-lock") || markOf(o) === "on" || (markOf(o) === "x" && fixOf(o).querySelector("input").value.trim()));
  const go = $("#mcGo"); if (go) go.disabled = !S.selected.length || !proved || S.finished;
}
function strike(o) {                                        // a wrong choice: unticked, struck through, disabled (prove mode: X'd, its box live)
  if (!o) return;
  o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true");
  mark(o, fixOf(o) ? "x" : "");
  o.querySelector(".badge").innerHTML = icon("i-x");
}
function roving(o) { for (const x of opts()) x.tabIndex = x === o ? 0 : -1; }
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
  if (r.verdict === "correct") { o.classList.add("right"); o.querySelector(".badge").innerHTML = icon("i-ok"); finish(); }
  else if (r.verdict === "wrong") {
    o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true"); o.querySelector(".badge").innerHTML = icon("i-x");
    select(null);
    const next = opts().find(x => !x.disabled); if (next) { roving(next); next.focus(); }
    if (r.triesLeft <= 0) finish(); else toast(AGAIN, o);
  } else if (r.verdict === "pending") { o.classList.add("pend"); send.hidden = true; }
  else if (r.verdict === "locked") finish();
  feedback(r);
}
/* pick all: send the ticked ids (prove mode: + fixes { id: text } for every X'd row). Wrong: the ticks and texts stay (the student
   edits the set); the struck row (if any) is unticked + disabled; a wrong fix turns its box red.
   Copy payload: a = the ticked choices' text, c / l = their ids / letters; prove mode: a = { tick, fix: { letter: text } } */
async function submitAll() {
  const on = ticked(), go = $("#mcGo"); if (!on.length || !go || go.disabled || S.finished || busy) return;
  const mine = S, c = on.map(o => o.dataset.id), xs = S.prob.fix ? opts().filter(o => markOf(o) === "x" && fixOf(o)) : [];
  const f = Object.fromEntries(xs.map(o => [o.dataset.id, fixOf(o).querySelector("input").value.trim()]));
  busy = true;
  let r;
  try { r = await check(S.code, { choices: c, ...(S.prob.fix ? { fixes: f } : {}) }); } finally { busy = false; }
  if (S !== mine) return;
  if (r.verdict === "timeout") { feedback(r); return; }     // not a try: the ticks stay, retry resends them
  const tick = c.map(id => S.prob.choices.find(x => x.id === id).md);
  if (r.verdict !== "invalid") record({ a: S.prob.fix ? { tick, fix: Object.fromEntries(xs.map(o => [o.dataset.l, f[o.dataset.id]])) } : tick, c, l: on.map(o => o.dataset.l),
    ...(S.prob.fix ? { f } : {}), ...(r.struck ? { s: r.struck } : {}), ...(r.fixWrong ? { w: r.fixWrong } : {}) }, r);
  if (r.verdict === "correct") {
    for (const o of on) { o.classList.add("right"); o.querySelector(".badge").innerHTML = icon("i-ok"); }
    for (const o of xs) fixOf(o).classList.add("ok", "done");
    finish();
  } else if (r.verdict === "wrong") {
    const o = r.struck && opts().find(x => x.dataset.id === r.struck), was = document.activeElement;
    const bad = r.fixWrong && opts().find(x => x.dataset.id === r.fixWrong); if (bad && fixOf(bad)) fixOf(bad).classList.add("bad");
    strike(o); syncTicks();
    if (o && fixOf(o) && was === go) fixOf(o).querySelector("input").focus();              // prove mode: the struck row needs its fix now
    else if (o && (was === o || (was === go && go.disabled))) { const n = opts().find(x => !x.disabled); if (n) { roving(n); n.focus(); } }
    else if (o && o.tabIndex === 0) { const n = opts().find(x => !x.disabled); if (n) roving(n); }
    if (r.triesLeft <= 0) finish(); else toast(AGAIN, o || $("#q .choices"));   // take 5f, as on single MC: on the struck row
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
async function submitFF() {
  const ins = [...document.querySelectorAll("#q .ans")], vals = ins.map(x => x.value.trim());
  if (vals.some(v => !v) || S.finished || busy) return;
  busy = true;
  const t = vals.join(" , ");
  try {
    const mine = S, r = await check(S.code, { answer: vals[0] });
    if (S !== mine) return;
    if (r.verdict === "timeout") { feedback(r); return; }  // not a try: the text stays, retry resends it
    if (r.verdict !== "invalid") { record({ a: t }, r); if ($("#preview")) $("#preview").innerHTML = ""; }
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish();
    else if (r.verdict === "wrong") toast(AGAIN, $("#ff"));
    feedback(r, t);
  } finally { busy = false; }
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
  box.classList.remove("bad"); box.classList.add("shut"); box.classList.toggle("ok", ok); box.classList.toggle("done", ok);
  for (const x of [inp, go]) { x.disabled = true; x.setAttribute("aria-disabled", "true"); }
  go.hidden = true;
  vmark(box, ok ? "i-ok" : "i-lock");
}
function partFeedback(i, r, typed) {
  const { hint, box, go } = partEls(i), row = hint.parentElement;
  let h = "";
  if (r.verdict === "wrong" && !S.parts[i].shut) { box.classList.add("bad"); go.hidden = true; vmark(box, "i-x"); }   // the box says it: no words
  else if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Can't read <code>${esc(typed)}</code>. It didn't count.</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved. Grading isn't live yet; Copy sends it to Tony.</span></p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>The server took too long. It didn't count.</span><button type="button" class="btn retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  if (r.hint) h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(r.hint)}</div></div></div>`;
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
    else if (spent) { shutPart(i, false); partFeedback(i, r, v); }
    else { partFeedback(i, r, v); if (r.verdict === "wrong") toast(AGAIN, partEls(i).box); }
    if (mine.parts.every(x => x.shut)) settle();
    else if (r.verdict === "correct" || spent) { const nxt = S.parts.findIndex(x => !x.shut); if (nxt >= 0 && document.activeElement === document.body) partEls(nxt).inp.focus(); }
    layoutFreeze();
  } finally { busy = false; }
}
/* every part right or locked: the problem is finished. It counts as correct only if every part is right. */
function settle() {
  const right = S.parts.filter(x => x.ok).length, n = S.parts.length;
  S.solved = right === n;
  finish();
  $("#fb").innerHTML = S.solved ? ""                                         // every box shows its check: no words
    : `<p class="verdict bad">${icon("i-x")}<span>${right} of ${n} right.</span></p><p class="verdict lock">${icon("i-lock")}<span>Ask Tony about ${esc(S.code)}.</span></p>`;
  say(S.solved ? "Correct." : $("#fb").textContent.replace(/\s+/g, " ").trim());
}

/* ---------- attempts, feedback ---------- */
function record(a, r) {
  const t = Date.now();
  /* "pending" is not a server verdict; the payload schema allows it for pre-server tries (COPY-PAYLOAD.md) */
  S.tries.push({ t, ...a, v: r.verdict });
  const mine = x => x.part === a.part;        // a multi counts wrong tries per part; the others have part undefined
  if (r.verdict === "wrong" && r.hint && !r.repeat) S.hints.push({ t, ...(a.part != null ? { part: a.part } : {}), n: S.tries.filter(x => x.v === "wrong" && mine(x)).length, kind: r.error || "nudge" });
  if (typeof r.triesLeft === "number") S.triesLeft = r.triesLeft;
  if (r.verdict === "correct" || r.verdict === "wrong") saveDone(r);
  else if (r.verdict === "locked") syncServer(S);              // the server knows more than this page: ask it
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
  if (r.verdict === "wrong") u.hint = r.hint || null;                  // the hint for the student's own wrong answer
  if (typeof r.gen === "number") u.gen = r.gen;
  if (off()) u.sigs = ((localState.get(p.type === "multi" ? `${S.code}#${i}` : S.code) || {}).wrong || []).slice();
  st.donePut(S.code, wrapRec(us, S.tries.filter(t => t.v === "correct" || t.v === "wrong"), S.hints.slice()));
}
/* upload mode: gradeLocal picks up where it was */
function seedLocal(code, rec, p) {
  units(rec, p).forEach((u, i) => { if (u.sigs || u.done !== "open") localState.set(p.type === "multi" ? `${code}#${i}` : code, { wrong: (u.sigs || []).slice(), done: u.done === "correct" }); });
}
/* show a record on the freshly rendered question: struck wrong choices, the student's right one, their last typed answer;
   closed = read-only. The right choice is never marked unless the student picked it. */
function paint(rec) {
  const p = S.prob, max = maxTries(p), us = units(rec, p);
  S.tries = (rec.tries || []).slice(); S.hints = (rec.hints || []).slice();
  if (p.type === "multi") {
    us.forEach((u, i) => {
      const last = S.tries.filter(t => t.part === i).pop(), { inp, go } = partEls(i);
      if (last && typeof last.a === "string") { inp.value = last.a; go.hidden = u.done !== "open"; }
      if (u.done !== "open") shutPart(i, u.done === "correct");
      if (u.done === "correct") partFeedback(i, { verdict: "correct" });
      else if (u.x > 0) partFeedback(i, { verdict: "wrong", triesLeft: Math.max(0, max - u.x), hint: u.hint || undefined });
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
      if (last.v === "correct") { o.classList.add("right"); o.querySelector(".badge").innerHTML = icon("i-ok"); }
    }
    if (last && last.f) for (const [id, v] of Object.entries(last.f)) {
      const o = opt(id), f = o && fixOf(o); if (!f) continue;
      if (!o.disabled) mark(o, "x");
      f.querySelector("input").value = v;
      f.classList.toggle("bad", last.w === id); if (last.v === "correct") f.classList.add("ok", "done");
    }
    const live = opts().find(x => !x.disabled); if (live) roving(live);
    syncTicks();
  } else if (p.type === "mc") {
    for (const t of S.tries) {
      const o = opts().find(x => x.dataset.id === t.c); if (!o) continue;
      if (t.v === "wrong") { o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true"); o.querySelector(".badge").innerHTML = icon("i-x"); }
      else if (t.v === "correct") { o.classList.add("right"); o.querySelector(".badge").innerHTML = icon("i-ok"); }
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
  const st = doneStore(); if (!st || !mine || off()) return;
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
  if (!shown && !quiet) return;
  const rec = wrapRec(us, tries, hints);
  if (!rec.x && rec.done === "open" && !tries.length) st.doneDrop(mine.code); else st.donePut(mine.code, rec);
  if (shown) repaint(rec.x || rec.done !== "open" || tries.length ? rec : null);
}
/* answered or out of tries: every answer control is off and looks it (dimmed, not-allowed, no hover); the right one keeps its ok look.
   Answer boxes are disabled, not just read-only, so a tap doesn't focus them (no focus ring, no keyboard) */
function finish() {
  S.finished = true;
  $("#q").classList.add("closed");
  document.querySelectorAll("#q .opt, #q .ans, #q .send").forEach(x => { x.disabled = true; x.setAttribute("aria-disabled", "true"); });
  document.querySelectorAll("#q .send").forEach(b => { b.hidden = true; });
}
function feedback(r, typed) {
  const fb = $("#fb");
  let h = "";
  /* right / wrong / out: the answer box (or the MC badge) shows the icon; no words on the page */
  const ff = S.prob.type === "mc" ? null : $("#ff");
  if (ff && r.verdict === "correct") vmark(ff, "i-ok");
  else if (ff && (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))) { ff.classList.remove("bad"); vmark(ff, "i-lock"); }
  else if (ff && r.verdict === "wrong") { ff.classList.add("bad"); $("#ansGo").hidden = true; vmark(ff, "i-x"); }
  if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Can't read <code>${esc(typed)}</code>. It didn't count.</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved. Grading isn't live yet; Copy sends it to Tony.</span></p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>timeout</span><button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))
    h += `<p class="verdict lock">${icon("i-lock")}<span>Ask Tony about ${esc(S.code)}.</span></p>`;
  if (r.hint) h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(r.hint)}</div></div></div>`;
  fb.innerHTML = h;
  const again = $("#retry");
  if (again) again.addEventListener("click", () => { fb.innerHTML = ""; layoutFreeze(); (S.prob.type === "mc" ? submitMC : submitFF)(); });
  say((verdictWords(r) + " " + fb.textContent).replace(/\s+/g, " ").trim());
  layoutFreeze();
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
  /* the box stops growing at the bottom of the visible viewport (minus the bottom dock) and scrolls inside itself */
  S.box = ExplainBox.mount(ta, { bottomInset: dockRoom,
    cap: () => swapOn ? swapPadMax : mtCap });                                  // Swap: the room the peek leaves
  S.corner = ExplainBox.reserveCorner(ta, [$("#cut"), $("#copy")]);
  mounted = { box: S.box, corner: S.corner };
  /* typing at the end: keep the whole bottom band in view (browsers only scroll the caret itself in), so the caret stays clear of Cut / Copy
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
/* Copy, and Cut all (= Copy, then empty the box; only if the copy worked). Cut keeps the edit history and records the clear. */
async function copyPad(b, icon, clear) {
  if (!S) return;
  const box = S.box, text = box.el.value;
  box.snapshot();
  const payload = stringify(build({ code: S.code, start: S.start, tries: S.tries, hints: S.hints, explain: text, history: box.getHistory() }));
  const ok = await copyText(payload);
  if (ok && clear && box.el.value === text) { box.el.value = ""; box.el.dispatchEvent(new Event("input")); box.snapshot(); }
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? (clear ? "Copied and cleared." : "Copied.") : "Copy failed.");
  setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", icon); }, 1600);
}
$("#copy").addEventListener("click", () => copyPad($("#copy"), "#i-copy", false));
$("#cut").addEventListener("click", () => copyPad($("#cut"), "#i-cut", true));

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
  if (!root.classList.contains("dock-bottom") || (!evenAway && root.classList.contains("dock-away"))) return 0;
  if (!root.classList.contains("bar-mini")) return dock.offsetHeight;
  if (!root.classList.contains("bar-open")) stripRoom = dock.offsetHeight || stripRoom;    // measured as a strip (incl. the safe-area inset); kept while revealed
  return stripRoom;
}
let stripRoom = 24;
function barOpen(open) {
  root.classList.toggle("bar-open", open);
  if (open && root.classList.contains("bar-mini")) root.style.setProperty("--bar-over", Math.max(0, dock.offsetHeight - stripRoom) + "px");
  barTab.setAttribute("aria-expanded", open);
  barTab.setAttribute("aria-label", open ? "Hide the code bar" : "Show the code bar");
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
if (dockMQ.addEventListener) dockMQ.addEventListener("change", () => { layoutDock(); layoutFreeze(); });
new ResizeObserver(() => layoutDock()).observe(dock);

function layoutFreeze() {
  layoutDock();
  if (!S || freeze.hidden) return;
  if (swapOn) { layoutSwap(); return; }
  if (mtOpen || sideMQ.matches) { layoutMT(); return; }                           // multitask: the panes own the sizes                                         // one pane above the keyboard: none of the strip logic applies
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
  if (!S || freeze.hidden || swapOn || mtOpen || sideMQ.matches) { freeze.classList.remove("stuck"); return; }
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
document.addEventListener("focusin", onView);
document.addEventListener("focusout", e => { if (!e.relatedTarget) lostAt = performance.now(); setTimeout(onView, 60); setTimeout(onView, 520); });
freezeIn.addEventListener("scroll", () => { if (swapOn) { swapFade(); return; } const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2; freeze.classList.toggle("clipped", !atEnd && !freeze.classList.contains("open")); }, { passive: true });
swipeTab(more, d => { const open = freeze.classList.contains("open"); if (d === "tap" || (d === "down") !== open) toggleMore(); });
function toggleMore() {
  const open = !freeze.classList.contains("open");
  freeze.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open);
  more.setAttribute("aria-label", open ? "Freeze the problem again" : "Show the whole problem");
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
  swapBtn.setAttribute("aria-label", pane === "problem" ? "Show the scratchpad" : "Show the problem");
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
  padPeekTx.textContent = last || "Scratchpad";
  padPeek.classList.toggle("empty", !last);
}
padPeek.hidden = false;                                                         // CSS shows it only in the PROBLEM pane
for (const ev of ["pointerdown", "mousedown"]) padPeek.addEventListener(ev, e => e.preventDefault());
padPeek.addEventListener("click", () => {
  if (!S || !S.box) return;
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
   Phone (< 720px): variant 9, Answer sliver. Tapping the pad (or its expand icon) opens the pad page: the problem tile on top (its bottom
   edge is the answer, always there), one drag handle in the gap, the pad below. Anchors 1/2, 1/3 and the sliver (answer only); drag snaps,
   tap = next. The pill: document = problem and pad, pencil = pad wide (sliver). Exits: Back (a pushed history entry), tapping the
   problem (caret into the answer), the collapse icon in the pad's top-right. The keyboard going down never closes it.
   Desktop (>= 720px): side by side, always: problem + answer left, pad right. Anchors strip (52px), 1/3, 1/2, 2/3.
   Memory: per device (localStorage, every access in try/catch). */
const sash = $("#sash"), mtMode = $("#mtMode"), mtExp = $("#mtExp"), pstrip = $("#pstrip");
const ANCH = { phone: [0, 1 / 3, 1 / 2], desk: [0, 1 / 3, 1 / 2, 2 / 3] };
const ANAME = r => r < 0.4 ? "one third" : r < 0.6 ? "half" : "two thirds";
let mtMem = {};
try { mtMem = JSON.parse(localStorage.getItem("stem-mt") || "{}") || {}; } catch { mtMem = {}; }
const mtKind = () => sideMQ.matches ? "desk" : "phone";
const near = (k, r) => ANCH[k].reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a);
function mtRatio(k = mtKind()) { const r = mtMem[k]; return typeof r === "number" ? near(k, r) : 1 / 2; }
const nextDown = (k, r) => { const a = ANCH[k], i = a.indexOf(near(k, r)); return i > 0 ? a[i - 1] : a[a.length - 1]; };   // 1/2 -> 1/3 -> sliver/strip -> top -> 1/2
const anchorName = (k, r) => r === 0 ? (k === "desk" ? "problem strip" : "answer only") : "problem " + ANAME(r);
let dragR = null;
function applyMT() {
  const side = sideMQ.matches && !!S, k = mtKind();
  if (sideMQ.matches || !S) mtOpen = false;
  const r = dragR != null ? dragR : mtRatio(k), on = side || mtOpen;
  root.classList.toggle("side", side);
  root.classList.toggle("mt", mtOpen);
  root.classList.toggle("mt-r0", on && dragR == null && r === 0);
  root.classList.toggle("mt-drag", dragR != null);
  root.style.setProperty("--r", r);
  sash.hidden = !on; mtMode.hidden = !on; pstrip.hidden = !(side && r === 0 && dragR == null);
  mtMode.dataset.pane = r === 0 ? "scratch" : "problem";
  mtMode.setAttribute("aria-label", r === 0 ? "Show the problem" : "Pad wide");
  mtExp.hidden = side;
  mtExp.querySelector("use").setAttribute("href", mtOpen ? "#i-collapse" : "#i-expand");
  mtExp.setAttribute("aria-label", mtOpen ? "Close the scratchpad page" : "Open the scratchpad");
  mtExp.title = mtExp.getAttribute("aria-label");
  /* a11y only (WAI-ARIA window splitter), never shown */
  sash.setAttribute("aria-orientation", side ? "vertical" : "horizontal");
  sash.setAttribute("aria-valuemin", "0"); sash.setAttribute("aria-valuemax", String(Math.round(Math.max(...ANCH[k]) * 100)));
  sash.setAttribute("aria-valuenow", String(Math.round(r * 100)));
  sash.setAttribute("aria-valuetext", anchorName(k, r));
  sash.setAttribute("aria-label", `Problem size: ${anchorName(k, r)}. Tap for ${anchorName(k, nextDown(k, r))}`);
  if (on) layoutMT(); else mtCap = null;
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
  } else root.style.setProperty("--kb-top", "0px");
  const fill = () => {
    if (!S || !S.box || (!mtOpen && !sideMQ.matches)) return;
    if (mtOpen) mtCap = Math.max(80, Math.floor(work.getBoundingClientRect().bottom - ta.getBoundingClientRect().top));
    else mtCap = Math.max(200, Math.floor((vv ? vv.height : innerHeight) - ta.getBoundingClientRect().top - 24));
    root.style.setProperty("--pad-max", mtCap + "px");
    S.box.limit();
  };
  fill(); requestAnimationFrame(fill);
}
function setRatio(r, animate = true) {
  const k = mtKind();
  mtMem[k] = r; if (r > 0) mtMem[k + "Last"] = r;
  try { localStorage.setItem("stem-mt", JSON.stringify(mtMem)); } catch { /* private mode: defaults next time */ }
  if (animate && document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyMT); else applyMT();
}
const lastPeek = () => { const k = mtKind(), r = mtMem[k + "Last"]; return typeof r === "number" && r > 0 ? near(k, r) : 1 / 2; };
function openMT() {
  if (mtOpen || !S || sideMQ.matches) return;
  swapY = scrollY;
  root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");
  if (swapOn) setSwap(false);
  mtOpen = true;
  try { history.pushState({ mt: 1 }, "", location.href); } catch { /* sandboxed */ }
  applyMT(); layoutDock();
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
  if (toAnswer) focusField("problem");                                            // in the tap: the keyboard can stay
  shutMT();
  if (history.state && history.state.mt) { mtSkipPop = true; history.back(); }
}
addEventListener("popstate", () => { if (mtSkipPop) { mtSkipPop = false; return; } if (mtOpen) shutMT(); });   // Back closes it, never leaves the page
/* open: a tap into the pad (not a script's focus: Swap still serves those), or the expand icon */
$("#xbField").addEventListener("pointerdown", e => { if (!mtOpen && !sideMQ.matches && S && S.box && e.target === S.box.el) openMT(); });
for (const b of [mtExp, mtMode, pstrip]) for (const ev of ["pointerdown", "mousedown"]) b.addEventListener(ev, e => e.preventDefault());   // never takes focus (keyboard stays)
mtExp.addEventListener("click", () => { if (mtOpen) closeMT(false); else openMT(); });
mtMode.addEventListener("click", () => setRatio(mtRatio() === 0 ? lastPeek() : 0));
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
  dragR = Math.min(Math.max(...ANCH[mtKind()]), Math.max(0.06, pos / d.len));
  applyMT();
});
function sashEnd(e) {
  const d = mtDrag; if (!d || (e && e.pointerId !== d.id)) return;
  mtDrag = null;
  const k = mtKind();
  if (!d.moved) { dragR = null; setRatio(nextDown(k, mtRatio(k))); return; }
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
if (sideMQ.addEventListener) sideMQ.addEventListener("change", () => { applyMT(); layoutFreeze(); });

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
const hashCode = () => location.hash.length > 1 ? normalize(decodeURIComponent(location.hash.slice(1))) : null;
const fromHash = () => {
  const n = hashCode();
  if (!n) return;
  if (n.prefix === "BANK") { if (!bank || bank.code !== n.code) return openBank(n.code); }
  else if (!S || S.code !== n.code) return load(n.code);
};
addEventListener("hashchange", fromHash);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) { drawFigures(); fitChoices(); layoutFreeze(); } });
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
window.__drill = { check, get state() { return S; } };   // for tests/e2e
