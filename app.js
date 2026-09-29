/* app.js: the drill page. Code entry -> p/<CODE>.json (served from problems.json, or an uploaded problems.json) -> blocks -> answer -> scratchpad -> Copy.
   Layout decisions for the frozen problem: design/FREEZE.md. Payload: copy/COPY-PAYLOAD.md. */
import { build, stringify } from "./copy/payload.mjs";

const $ = s => document.querySelector(s);
const root = document.documentElement;
const CODE_RE = /^(CALC1|CSCI26|PHYS)_[A-Z0-9]{3,6}$/;
const MAX_TRIES = 2;   // tries for everything except a 2-choice mc (maxTries)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
const say = t => { const sr = $("#sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); };

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
   `answer` is { answer: "typed text" } or { choice: "b" }; a multi grades one part at a time: { part: i, answer: "typed text" }. */
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
const unitOk = (u, g) => u.type === "text" ? [u.answer, ...(u.accept || [])].map(squash).includes(g)
  : same(g, u.answer === "dne" ? "dne" : unitSig(u, u.answer), u.tol ?? 1e-6);
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
  if (key.type === "mc") {
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
  const out = { verdict: "wrong", triesLeft: left(), hint: hit ? hit.hint : (key.nudge || "QUACK. Plug your answer back into the problem. Does it work?") };
  if (hit) out.error = hit.error;
  if (repeat) out.repeat = true;
  return R(out);
}

/* ================= entry box: code bar + upload ================= */
const codeIn = $("#code"), dock = $("#dock"), mainEl = $("#main");
let swapOn = false, lostAt = 0;          // Swap state (see "Swap" below)
/* canonical code: PREFIX_SUFFIX ("_" joins words, so one double-tap on a phone selects the whole code).
   Accept lower case, "-" (old links), a space, or no separator at all. */
function normalize(raw) {
  const s = raw.toUpperCase().trim().replace(/^#/, "");
  const m = s.match(/^(CALC1|CSCI26|PHYS)[\s_-]*([A-Z0-9]{3,6})$/);
  return m ? { prefix: m[1], code: `${m[1]}_${m[2]}` } : null;
}
/* the box is empty while a problem is open (its code is the placeholder); empty = Paste button, text = submit arrow */
const codeGo = $("#codeGo"), codePaste = $("#codePaste");
function syncCode() { const empty = !codeIn.value; codePaste.hidden = !empty; codeGo.hidden = empty; }
codeIn.addEventListener("input", () => { $("#entryMsg").textContent = ""; syncCode(); });
function putCode(code) { codeIn.value = code; syncCode(); }
syncCode();
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
  const n = normalize(codeIn.value);
  if (!n) { $("#entryMsg").textContent = "Codes look like CALC1_T6B."; codeIn.focus(); return; }
  codeIn.blur();
  load(n.code);
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
    load(typed && off.has(typed.code) ? typed.code : p.code);
  });
});
function fileStatus(code) {
  const off = window.stemOffline, name = off && off.has && off.has(code) ? off.fileName(code) : null;
  const el = $("#fileStatus");
  el.hidden = !name;
  el.textContent = name ? `File ${name} in use.` : "";
  layoutDock();
}

const retryLoad = $("#retryLoad");
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
    $("#entryMsg").textContent = e.status === 404 ? `No problem ${code}.` : timedOut(e) ? "The server took too long." : "Couldn't load that. Check your connection.";
    if (e.status !== 404) { retryLoad.hidden = false; retryLoad.onclick = () => load(code); }
    return;
  }
  $("#entryMsg").textContent = "";
  putCode(""); codeIn.placeholder = code;   // the open problem's code is the placeholder
  fileStatus(code);
  if (location.hash !== "#" + code) history.replaceState(null, "", "#" + code);
  S = { code, prob, start: Date.now(), tries: [], hints: [], triesLeft: maxTries(prob), finished: false, selected: null, box: null };
  render();
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
    q.innerHTML = `${howLine(p)}<div class="choices" role="radiogroup" aria-label="Choices">${list.map((c, i) => `
      <div class="ch" data-id="${esc(c.id)}">
        <button type="button" class="opt" role="radio" aria-checked="false" tabindex="${i ? -1 : 0}" data-id="${esc(c.id)}" data-l="${LETTERS[i]}">
          <span class="badge" aria-hidden="true">${LETTERS[i]}</span><span class="txt">${md(c.md, true)}</span>
        </button>
        <button type="button" class="btn btn-go send" aria-label="Submit ${LETTERS[i]}" hidden>${icon("i-go")}</button>
      </div>`).join("")}</div>`;
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
          <button type="button" class="btn btn-go send" id="go${i}" aria-label="Submit ${l}" disabled>${icon("i-go")}</button></div>
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
const howLine = p => p.how ? `<p class="how" id="how">${md(p.how, true)}</p>` : "";
const off = () => window.stemOffline && window.stemOffline.has(S.code);
/* shuffle for problems from an uploaded file (the server shuffles its own): seeded by a random id kept in this browser */
function localSeed() {
  try { let s = localStorage.getItem("stem-seed"); if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem("stem-seed", s); } return s; }
  catch { return "stem"; }
}
function shuffled(choices, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const free = choices.map((c, i) => c.lock ? -1 : i).filter(i => i >= 0), moved = free.map(i => choices[i]);
  for (let i = moved.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [moved[i], moved[j]] = [moved[j], moved[i]]; }
  const out = [...choices];
  free.forEach((i, k) => { out[i] = moved[k]; });
  return out;
}
/* 5 choices shown. The server already cut them (serve.py public()); an uploaded file may have up to 8:
   same rule here: the right one, locked ones, then the rest, in authored order */
function shown(p) {
  const ch = p.choices;
  if (ch.length <= 5) return ch;
  const keep = ch.filter(c => c.id === p.correct || c.lock);
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
  let fits = g.children.length >= 2 && g.children.length <= 3;
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
  if (fits !== was) layoutFreeze();
}
function opts() { return [...document.querySelectorAll("#q .opt")]; }
function select(o) {
  S.selected = o ? o.dataset.id : null;
  for (const x of opts()) {
    const on = x === o;
    x.setAttribute("aria-checked", on);
    x.parentElement.querySelector(".send").hidden = !on;
  }
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
    select(o.getAttribute("aria-checked") === "true" ? null : o);   // tap the selected choice again: deselect
    roving(o);
  });
  q.addEventListener("keydown", e => {
    const o = e.target.closest(".opt"); if (!o || !S || S.finished) return;
    const live = opts().filter(x => !x.disabled), i = live.indexOf(o);
    const move = d => { const n = live[(i + d + live.length) % live.length]; roving(n); n.focus(); select(n); };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (o.getAttribute("aria-checked") === "true") submitMC(); else select(o); }
    else if (e.key === " ") { e.preventDefault(); select(o.getAttribute("aria-checked") === "true" ? null : o); }
    else if (/^([a-e]|[1-5])$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {         // A-E or 1-5 jump to that choice
      const n = opts().find(x => x.dataset.l === (/\d/.test(e.key) ? LETTERS[+e.key - 1] : e.key.toUpperCase()));
      if (n && !n.disabled) { e.preventDefault(); roving(n); n.focus(); select(n); }
    }
  });
}
function roving(o) { for (const x of opts()) x.tabIndex = x === o ? 0 : -1; }
async function submitMC() {
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
    if (r.triesLeft <= 0) finish();
  } else if (r.verdict === "pending") { o.classList.add("pend"); send.hidden = true; }
  else if (r.verdict === "locked") finish();
  feedback(r);
}

/* ---------- freeform: the same arrow, flush inside the input ---------- */
function wireFF() {
  const ins = [...document.querySelectorAll("#q .ans")], go = $("#ansGo"), pv = $("#preview"), mathy = /^(num|expr)$/.test(S.prob.type);
  for (const inp of ins) {
    inp.addEventListener("input", () => {
      go.disabled = ins.some(x => !x.value.trim());
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
    feedback(r, t);
  } finally { busy = false; }
}

/* ---------- multi: every part has its own arrow, verdict, tries and lockout ---------- */
const partEls = i => { const r = document.querySelector(`#q .part[data-i="${i}"]`); return { row: r, box: r.querySelector(".ff"), inp: r.querySelector(".ans"), go: r.querySelector(".send"), hint: r.querySelector(".phint") }; };
function wireParts() {
  S.parts = S.prob.parts.map(() => ({ shut: false, ok: false }));
  S.prob.parts.forEach((_, i) => {
    const { inp, go, box } = partEls(i);
    inp.addEventListener("input", () => { go.disabled = !inp.value.trim(); box.classList.remove("bad"); });
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
}
function partFeedback(i, r, typed) {
  const { hint, box } = partEls(i), row = hint.parentElement;
  let h = "";
  if (r.verdict === "wrong") {
    box.classList.add("bad");
    h = `<p class="verdict bad">${icon("i-x")}<span>${r.triesLeft > 0 ? "Not quite. One more try." : "Out of tries."}</span></p>`;
  } else if (r.verdict === "locked") h = `<p class="verdict lock">${icon("i-lock")}<span>Out of tries.</span></p>`;
  else if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Can't read <code>${esc(typed)}</code>. It didn't count.</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved. Grading isn't live yet; Copy sends it to Tony.</span></p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>The server took too long. It didn't count.</span><button type="button" class="btn retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  if (r.hint) h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(r.hint)}</div></div></div>`;
  hint.innerHTML = h;
  row.classList.toggle("hinted", !!h);
  const again = hint.querySelector(".retry");
  if (again) again.addEventListener("click", () => { hint.innerHTML = ""; row.classList.remove("hinted"); layoutFreeze(); submitPart(i); });
  say((partEls(i).row.querySelector(".mk").textContent + " " + (r.verdict === "correct" ? "Correct. " : "") + hint.textContent).replace(/\s+/g, " ").trim());
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
    else partFeedback(i, r, v);
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
  $("#fb").innerHTML = S.solved ? `<p class="verdict ok">${icon("i-ok")}<span>Correct</span></p>`
    : `<p class="verdict bad">${icon("i-x")}<span>${right} of ${n} right.</span></p><p class="verdict lock">${icon("i-lock")}<span>Ask Tony about ${esc(S.code)}.</span></p>`;
  say($("#fb").textContent.replace(/\s+/g, " ").trim());
}

/* ---------- attempts, feedback ---------- */
function record(a, r) {
  const t = Date.now();
  /* "pending" is not a server verdict; the payload schema allows it for pre-server tries (COPY-PAYLOAD.md) */
  S.tries.push({ t, ...a, v: r.verdict });
  const mine = x => x.part === a.part;        // a multi counts wrong tries per part; the others have part undefined
  if (r.verdict === "wrong" && r.hint && !r.repeat) S.hints.push({ t, ...(a.part != null ? { part: a.part } : {}), n: S.tries.filter(x => x.v === "wrong" && mine(x)).length, kind: r.error || "nudge" });
  if (typeof r.triesLeft === "number") S.triesLeft = r.triesLeft;
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
  if (r.verdict === "correct") h = `<p class="verdict ok">${icon("i-ok")}<span>Correct</span></p>`;
  else if (r.verdict === "wrong") h = `<p class="verdict bad">${icon("i-x")}<span>${r.triesLeft > 0 ? "Not quite. One more try." : "Out of tries."}</span></p>`;
  else if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Can't read <code>${esc(typed)}</code>. It didn't count.</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved. Grading isn't live yet; Copy sends it to Tony.</span></p>`;
  else if (r.verdict === "timeout") h = `<p class="verdict wait">${icon("i-wait")}<span>The server took too long. It didn't count.</span><button type="button" class="btn retry" id="retry" aria-label="Try again" title="Try again">${icon("i-retry")}</button></p>`;
  if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))
    h += `<p class="verdict lock">${icon("i-lock")}<span>Ask Tony about ${esc(S.code)}.</span></p>`;
  if (r.hint) h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(r.hint)}</div></div></div>`;
  fb.innerHTML = h;
  const again = $("#retry");
  if (again) again.addEventListener("click", () => { fb.innerHTML = ""; layoutFreeze(); (S.prob.type === "mc" ? submitMC : submitFF)(); });
  say(fb.textContent.replace(/\s+/g, " ").trim());
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
  ta.id = "scratch"; ta.setAttribute("aria-labelledby", "xbLabel");
  field.prepend(ta);
  /* the box stops growing at the bottom of the visible viewport (minus the bottom dock) and scrolls inside itself */
  S.box = ExplainBox.mount(ta, { bottomInset: () => root.classList.contains("dock-bottom") && !root.classList.contains("dock-away") ? dock.offsetHeight : 0,
    cap: () => swapOn ? swapPadMax : null });                                  // Swap: the room the peek leaves
  S.corner = ExplainBox.reserveCorner(ta, [$("#cut"), $("#copy")]);
  mounted = { box: S.box, corner: S.corner };
}
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
  const swapNext = !!S && !freeze.hidden && shrunk && ((inMain && (editing() || swapOn)) || (swapOn && grace));
  /* keyboard up while typing elsewhere (scratchpad, answer): the box steps aside so it can't cover the caret */
  root.classList.toggle("dock-away", (!!kb && !inDock) || swapNext);
  if (swapNext !== swapOn) setSwap(swapNext);
  /* keyboard up while typing the code: ride on top of the keyboard (iOS keeps fixed elements on the layout viewport) */
  const lift = kb && inDock && vv ? Math.max(0, innerHeight - (vv.offsetTop + vv.height)) : 0;
  root.style.setProperty("--kb-bottom", lift + "px");
  root.style.setProperty("--dock-h", bottom ? dock.offsetHeight + "px" : "0px");
}
if (dockMQ.addEventListener) dockMQ.addEventListener("change", () => { layoutDock(); layoutFreeze(); });
new ResizeObserver(() => layoutDock()).observe(dock);

function layoutFreeze() {
  layoutDock();
  if (!S || freeze.hidden) return;
  if (swapOn) { layoutSwap(); return; }                                         // one pane above the keyboard: none of the strip logic applies
  const dockH = root.classList.contains("dock-bottom") && !root.classList.contains("dock-away") ? dock.offsetHeight : 0;
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
  if (!S || freeze.hidden || swapOn) return;
  const top = parseFloat(getComputedStyle(freeze).top) || 0;
  const now = !freeze.classList.contains("open") && sentinel.getBoundingClientRect().top < top - 0.5;
  const was = freeze.classList.contains("stuck");
  freeze.classList.toggle("stuck", now);
  if (now && !was) showQuestion();
}
/* When the layer freezes, scroll its own box so the question (and any hint) sits at the bottom of the strip:
   the question is what you answer while writing; the problem start is one small scroll up. */
function showQuestion() {
  if (swapOn) return;
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
more.addEventListener("click", () => {
  const open = !freeze.classList.contains("open");
  freeze.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open);
  more.setAttribute("aria-label", open ? "Freeze the problem again" : "Show the whole problem");
  if (!open) freeze.scrollIntoView({ block: "nearest" });
  layoutFreeze();
});
/* ================= Swap (design/SWAP.md) =================
   Keyboard up = ONE pane fills the visible area above the keyboard: the problem (card, answer pinned at its bottom) or the
   scratchpad (question peek on top, the box anchored to the bottom and growing upward). One icon toggle switches; focusing a field
   picks the pane too. layoutDock() decides when it is on; CSS (html.swap, .swap-problem, .swap-scratch) does the layout;
   this code sets the pane, the sizes CSS cannot know (--vv-h, --peek-max, the scratchpad's cap) and moves focus. */
const swapBtn = $("#swap"), stage = $("#stage"), problemEl = $("#problem"), work = $("#work");
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
let pane = "problem", shownPane = "problem", swapY = 0, swapPadMax = null;
const GAP = 10;                                                                  // between the peek and the scratchpad: clears the box's 5px focus ring
const paneOf = el => !el || !el.closest ? null : work.contains(el) ? "scratch" : el.closest("#q, #fb") ? "problem" : null;
function setSwap(on) {
  swapOn = on;
  if (on) {
    swapY = scrollY;
    root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");              // the page keeps its height, so its scroll position survives
    const p = paneOf(document.activeElement); if (p) pane = p;
    root.classList.add("swap");
    swapBtn.hidden = false;
    applyPane();
  } else {
    root.classList.remove("swap", "swap-problem", "swap-scratch");
    swapBtn.hidden = true; swapPadMax = null;
    freeze.classList.remove("clipped", "no-peek");
    if (scrollY !== swapY) scrollTo(0, swapY);
    requestAnimationFrame(() => { if (S && S.box) S.box.limit(); });
  }
}
/* the DOM change: classes, toggle, scroll positions, sizes */
function applyPane() {
  shownPane = pane;
  root.classList.toggle("swap-problem", pane === "problem");
  root.classList.toggle("swap-scratch", pane === "scratch");
  swapBtn.dataset.pane = pane;
  swapBtn.setAttribute("aria-label", pane === "problem" ? "Show the scratchpad" : "Show the problem");
  freezeIn.scrollTop = 0; problemEl.scrollTop = 0;                                 // the question always shows from its start
  layoutSwap();
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
  const padMin = parseFloat(getComputedStyle(S.box.el).minHeight) || 130;         // 3 lines
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
    const ins = [...document.querySelectorAll("#q .ans")];
    el = ins.length ? ins.find(x => !x.value.trim() && !x.readOnly) || ins[0]
      : opts().find(o => o.getAttribute("aria-checked") === "true") || opts().find(o => !o.disabled && o.tabIndex === 0) || opts().find(o => !o.disabled);
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
document.addEventListener("focusout", e => { if (e.target.id === "scratch" && (!e.relatedTarget || e.relatedTarget.id !== "scratch")) root.classList.remove("bar-off"); });

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
    if (go && ins.length) { go.hidden = false; go.disabled = ins.some(x => !x.value.trim()); }
    (S.parts || []).forEach((st, i) => { if (!st.shut) { const e = partEls(i); e.go.hidden = false; e.go.disabled = !e.inp.value.trim(); } });
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
  if (off && off.ready && S && !off.has(S.code)) off.ready.then(() => { if (S && off.has(S.code)) fileStatus(S.code); });
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(false); });

/* ================= boot ================= */
const fromHash = () => { const n = normalize(decodeURIComponent(location.hash.slice(1))); if (n && location.hash.length > 1 && (!S || S.code !== n.code)) load(n.code); };
addEventListener("hashchange", fromHash);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) { drawFigures(); fitChoices(); layoutFreeze(); } });
layoutDock();
/* offline.js (it runs after this module) restores an uploaded bank from IndexedDB first, so #CODE of an uploaded problem opens */
addEventListener("DOMContentLoaded", async () => {
  const off = window.stemOffline;
  if (off && off.ready) { try { await Promise.race([off.ready, new Promise(r => setTimeout(r, 1500))]); } catch { /* storage blocked */ } }
  fromHash();
});
window.__drill = { check, get state() { return S; } };   // for tests/e2e
