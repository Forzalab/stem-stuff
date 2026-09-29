/* app.js: the drill page. Code entry -> p/<CODE>.json (served from problems.json, or an uploaded problems.json) -> blocks -> answer -> scratchpad -> Copy.
   Layout decisions for the frozen problem: design/FREEZE.md. Payload: copy/COPY-PAYLOAD.md. */
import { build, stringify } from "./copy/payload.mjs";

const $ = s => document.querySelector(s);
const root = document.documentElement;
const CODE_RE = /^(CALC1|CSCI26|PHYS)_[A-Z0-9]{3,6}$/;
const MAX_TRIES = 2;
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
     { verdict: "correct"|"wrong"|"invalid"|"locked", triesLeft, error?, hint?, repeat? }
   Uploaded problems.json: the file is the student's own copy, so the same rules run here, on that file.
   No server and no file (static host): { verdict: "pending" }; Copy still sends the try to Tony.
   `answer` is { answer: "typed text" } or { choice: "b" }. */
const localState = new Map();
async function check(code, answer) {
  const off = window.stemOffline;
  if (off && off.has(code)) return gradeLocal(off.get(code), answer);
  try {
    const r = await fetch("check", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
                                     body: JSON.stringify({ code, ...answer }) });
    if (r.ok) return await r.json();
  } catch { /* offline */ }
  return { verdict: "pending" };
}
/* mirror of serve.py grade(): keep the two in step */
function gradeLocal(key, answer) {
  const st = localState.get(key.code) || { wrong: [], done: false };
  localState.set(key.code, st);
  const left = () => MAX_TRIES - st.wrong.length;
  if (st.done || left() <= 0) return { verdict: "locked", triesLeft: 0 };
  let hit = null, correct = false, repeat = false;
  if ("choice" in answer) {
    if (!key.choices.some(c => c.id === answer.choice)) return { verdict: "invalid", triesLeft: left() };
    correct = answer.choice === key.correct;
    hit = (key.wrong || []).find(w => w.choice === answer.choice);
    repeat = st.wrong.includes(answer.choice);
    if (!correct && !repeat) st.wrong.push(answer.choice);
  } else {
    const typed = String(answer.answer).trim(), tol = key.tol ?? 1e-6, v = key.var || "x";
    const isDne = t => /^\s*(dne|does not exist)\s*$/i.test(t);
    const sig = t => {
      if (isDne(t)) return "dne";
      const c = math.compile(t.replace(/ln\s*\(/gi, "log(").replace(/π/g, "pi").replace(/∞/g, "Infinity"));
      const at = x => { let r = c.evaluate({ [v]: x }); if (typeof r !== "number") r = math.number(r); if (Number.isNaN(r)) throw 0; return r; };
      return key.type === "expr" ? key.points.map(at) : at(undefined);
    };
    const same = (a, b) => Array.isArray(a) ? a.length === b.length && a.every((x, i) => same(x, b[i]))
      : typeof a === "string" || typeof b === "string" || !Number.isFinite(a) || !Number.isFinite(b) ? a === b
      : Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    let val;
    try { val = sig(typed); } catch { return { verdict: "invalid", triesLeft: left() }; }
    correct = same(val, key.answer === "dne" ? "dne" : sig(key.answer));
    if (!correct) {
      hit = (key.wrong || []).find(w => w.re && new RegExp(w.re, "i").test(typed))
         || (key.wrong || []).find(w => { try { return w.match != null && same(val, sig(w.match)); } catch { return false; } });
      repeat = st.wrong.some(w => same(val, w));
      if (!repeat) st.wrong.push(val);
    }
  }
  if (correct) { st.done = true; return { verdict: "correct", triesLeft: left() }; }
  const out = { verdict: "wrong", triesLeft: left(), hint: hit ? hit.hint : (key.nudge || "QUACK. Plug your answer back into the problem. Does it work?") };
  if (hit) out.error = hit.error;
  if (repeat) out.repeat = true;
  return out;
}

/* ================= entry box: code bar + upload ================= */
const codeIn = $("#code"), dock = $("#dock");
/* canonical code: PREFIX_SUFFIX ("_" joins words, so one double-tap on a phone selects the whole code).
   Accept lower case, "-" (old links), a space, or no separator at all. */
function normalize(raw) {
  const s = raw.toUpperCase().trim().replace(/^#/, "");
  const m = s.match(/^(CALC1|CSCI26|PHYS)[\s_-]*([A-Z0-9]{3,6})$/);
  return m ? { prefix: m[1], code: `${m[1]}_${m[2]}` } : null;
}
codeIn.addEventListener("input", () => { $("#entryMsg").textContent = ""; });
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

/* ================= problem state ================= */
let S = null;        // { code, prob, start, tries, hints, triesLeft, finished, selected, box }
async function fetchProblem(code) {
  const r = await fetch(`p/${code}.json`);
  if (r.ok) return r.json();
  r.text().catch(() => {});   // drain the 404 body so the request completes
  const e = new Error("not found"); e.status = r.status; throw e;
}
async function load(code) {
  if (!CODE_RE.test(code)) return;
  codeIn.value = code;
  let prob;
  try { prob = await fetchProblem(code); }
  catch (e) {
    $("#entryMsg").textContent = e.status === 404 ? `No problem ${code}.` : "Couldn't load that. Check your connection.";
    return;
  }
  $("#entryMsg").textContent = "";
  fileStatus(code);
  if (location.hash !== "#" + code) history.replaceState(null, "", "#" + code);
  S = { code, prob, start: Date.now(), tries: [], hints: [], triesLeft: MAX_TRIES, finished: false, selected: null, box: null };
  render();
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
  if (p.type === "mc") {
    q.innerHTML = `<div class="choices" role="radiogroup" aria-label="Choices">${shown(p).map((c, i) => `
      <div class="ch" data-id="${esc(c.id)}">
        <button type="button" class="opt" role="radio" aria-checked="false" tabindex="${i ? -1 : 0}" data-id="${esc(c.id)}" data-l="${LETTERS[i]}">
          <span class="badge" aria-hidden="true">${LETTERS[i]}</span><span class="txt">${md(c.md, true)}</span>
        </button>
        <button type="button" class="btn btn-go send" aria-label="Submit ${LETTERS[i]}" hidden>${icon("i-go")}</button>
      </div>`).join("")}</div>`;
    q.querySelectorAll(".opt").forEach(o => o.setAttribute("aria-label", `${o.dataset.l}: ${o.querySelector(".txt").textContent.trim()}`));
    wireMC(q);
  } else {
    const v = p.var || "x";
    const lead = p.type === "expr" ? `<span class="lead" aria-hidden="true">${renderMath(`f(${v}) =`, false)}</span>` : "";
    q.innerHTML = `<div class="ff" id="ff">${lead}
        <input id="ans" type="text" inputmode="text" aria-label="${p.type === "expr" ? `Answer: f(${v})` : "Answer"}"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="${p.type === "expr" ? "in terms of " + v : "e.g. 9/2, sqrt(3), dne"}">
        <button type="button" class="btn btn-go send" id="ansGo" aria-label="Submit answer" disabled>${icon("i-go")}</button>
      </div><div class="preview" id="preview" aria-hidden="true"></div>`;
    wireFF();
  }
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
function opts() { return [...document.querySelectorAll("#q .opt")]; }
function select(o) {
  S.selected = o ? o.dataset.id : null;
  for (const x of opts()) {
    const on = x === o;
    x.setAttribute("aria-checked", on);
    x.parentElement.querySelector(".send").hidden = !on;
  }
}
function wireMC(q) {
  q.addEventListener("click", e => {
    if (S.finished) return;
    const send = e.target.closest(".send");
    if (send) { submitMC(); return; }
    const o = e.target.closest(".opt"); if (!o || o.disabled) return;
    select(o.getAttribute("aria-checked") === "true" ? null : o);   // tap the selected choice again: deselect
    roving(o);
  });
  q.addEventListener("keydown", e => {
    const o = e.target.closest(".opt"); if (!o || S.finished) return;
    const live = opts().filter(x => !x.disabled), i = live.indexOf(o);
    const move = d => { const n = live[(i + d + live.length) % live.length]; roving(n); n.focus(); select(n); };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (o.getAttribute("aria-checked") === "true") submitMC(); else select(o); }
    else if (e.key === " ") { e.preventDefault(); select(o.getAttribute("aria-checked") === "true" ? null : o); }
    else if (/^[a-e]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const n = opts().find(x => x.dataset.l === e.key.toUpperCase());
      if (n && !n.disabled) { e.preventDefault(); roving(n); n.focus(); select(n); }
    }
  });
}
function roving(o) { for (const x of opts()) x.tabIndex = x === o ? 0 : -1; }
async function submitMC() {
  const o = opts().find(x => x.dataset.id === S.selected); if (!o || S.finished) return;
  const c = S.prob.choices.find(x => x.id === S.selected);
  const r = await check(S.code, { choice: c.id });
  record({ a: c.md, c: c.id, l: o.dataset.l }, r);
  const send = o.parentElement.querySelector(".send");
  if (r.verdict === "correct") { o.classList.add("right"); o.querySelector(".badge").innerHTML = icon("i-ok"); finish(); }
  else if (r.verdict === "wrong") {
    o.classList.add("wrong"); o.disabled = true; o.setAttribute("aria-disabled", "true"); o.querySelector(".badge").innerHTML = icon("i-x");
    select(null);
    const next = opts().find(x => !x.disabled); if (next) { roving(next); next.focus(); }
    if (r.triesLeft <= 0) finish(true);
  } else if (r.verdict === "pending") { o.classList.add("pend"); send.hidden = true; }
  else if (r.verdict === "locked") finish(true);
  feedback(r);
}

/* ---------- freeform: the same arrow, flush inside the input ---------- */
function wireFF() {
  const inp = $("#ans"), go = $("#ansGo"), pv = $("#preview");
  inp.addEventListener("input", () => {
    go.disabled = !inp.value.trim();
    pv.innerHTML = "";
    const t = inp.value.trim(); if (!t || typeof math === "undefined") return;
    try { pv.innerHTML = /^dne$/i.test(t) ? "DNE" : renderMath(math.parse(t).toTex({ parenthesis: "auto", implicit: "hide" }), false); } catch { /* still typing */ }
  });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitFF(); } });
  go.addEventListener("click", submitFF);
}
let busy = false;
async function submitFF() {
  const inp = $("#ans"), t = inp.value.trim(); if (!t || S.finished || busy) return;
  busy = true;
  try {
    const r = await check(S.code, { answer: t });
    if (r.verdict !== "invalid") { record({ a: t }, r); $("#preview").innerHTML = ""; }
    if (r.verdict === "correct") { $("#ff").classList.add("ok", "done"); inp.readOnly = true; $("#ansGo").hidden = true; finish(); }
    else if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0)) finish(true);
    feedback(r, t);
  } finally { busy = false; }
}

/* ---------- attempts, feedback ---------- */
function record(a, r) {
  const t = Date.now();
  /* "pending" is not a server verdict; the payload schema allows it for pre-server tries (COPY-PAYLOAD.md) */
  S.tries.push({ t, ...a, v: r.verdict });
  if (r.verdict === "wrong" && r.hint && !r.repeat) S.hints.push({ t, n: S.tries.filter(x => x.v === "wrong").length, kind: r.error || "nudge" });
  if (typeof r.triesLeft === "number") S.triesLeft = r.triesLeft;
}
function finish(out) {
  S.finished = true;
  opts().forEach(o => { o.disabled = true; });
  document.querySelectorAll("#q .send").forEach(b => { b.hidden = true; });
  if (out) { const inp = $("#ans"); if (inp) inp.readOnly = true; }
}
function feedback(r, typed) {
  const fb = $("#fb");
  let h = "";
  if (r.verdict === "correct") h = `<p class="verdict ok">${icon("i-ok")}<span>Correct</span></p>`;
  else if (r.verdict === "wrong") h = `<p class="verdict bad">${icon("i-x")}<span>${r.triesLeft > 0 ? "Not quite. One more try." : "Out of tries."}</span></p>`;
  else if (r.verdict === "invalid") h = `<p class="verdict bad">${icon("i-x")}<span>Can't read <code>${esc(typed)}</code>. It didn't count.</span></p>`;
  else if (r.verdict === "pending") h = `<p class="verdict wait">${icon("i-wait")}<span>Saved. Grading isn't live yet; Copy sends it to Tony.</span></p>`;
  if (r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0))
    h += `<p class="verdict lock">${icon("i-lock")}<span>Ask Tony about ${esc(S.code)}.</span></p>`;
  if (r.hint) h += `<div class="cluck">${icon("i-duck")}<div><div class="md">${md(r.hint)}</div></div></div>`;
  fb.innerHTML = h;
  say(fb.textContent.replace(/\s+/g, " ").trim());
  layoutFreeze();
}

/* ---------- scratchpad + Copy ---------- */
function mountBox() {
  if (S.box) S.box.destroy();
  if (S.corner) S.corner.destroy();
  const field = $("#xbField"); field.querySelector("textarea")?.remove();
  const ta = document.createElement("textarea");
  Object.assign(ta, { rows: 4, spellcheck: true, placeholder: "Paste GPT answer here, but me be sad..." });
  ta.setAttribute("autocapitalize", "sentences"); ta.setAttribute("autocomplete", "off");
  ta.id = "scratch";
  field.prepend(ta);
  S.box = ExplainBox.mount(ta);
  S.corner = ExplainBox.reserveCorner(ta, $("#copy"));
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
$("#copy").addEventListener("click", async () => {
  if (!S) return;
  S.box.snapshot();
  const payload = stringify(build({ code: S.code, start: S.start, tries: S.tries, hints: S.hints, explain: S.box.el.value, history: S.box.getHistory() }));
  const ok = await copyText(payload);
  const b = $("#copy");
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed.");
  setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 1600);
});

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
  const kb = bottom && editing() && tallest && h < tallest * 0.8;
  /* keyboard up while typing elsewhere (scratchpad, answer): the box steps aside so it can't cover the caret */
  root.classList.toggle("dock-away", !!kb && !inDock);
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
    if (kb && !kbWas && !inFreeze) showQuestion();
  });
}
function stuck() {
  if (!S || freeze.hidden) return;
  const top = parseFloat(getComputedStyle(freeze).top) || 0;
  const now = !freeze.classList.contains("open") && sentinel.getBoundingClientRect().top < top - 0.5;
  const was = freeze.classList.contains("stuck");
  freeze.classList.toggle("stuck", now);
  if (now && !was) showQuestion();
}
/* When the layer freezes, scroll its own box so the question (and any hint) sits at the bottom of the strip:
   the question is what you answer while writing; the problem start is one small scroll up. */
function showQuestion() {
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
document.addEventListener("focusout", () => setTimeout(onView, 60));
freezeIn.addEventListener("scroll", () => { const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2; freeze.classList.toggle("clipped", !atEnd && !freeze.classList.contains("open")); }, { passive: true });
more.addEventListener("click", () => {
  const open = !freeze.classList.contains("open");
  freeze.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open);
  more.setAttribute("aria-label", open ? "Freeze the problem again" : "Show the whole problem");
  if (!open) freeze.scrollIntoView({ block: "nearest" });
  layoutFreeze();
});
/* figures and wrapped text depend on width: redraw on width changes only (not on keyboard height changes) */
let figW = 0;
new ResizeObserver(() => { const w = $("#blocks").clientWidth; if (S && w && w !== figW) { figW = w; drawFigures(); layoutFreeze(); } }).observe($("#blocks"));

/* ================= boot ================= */
const fromHash = () => { const n = normalize(decodeURIComponent(location.hash.slice(1))); if (n && location.hash.length > 1 && (!S || S.code !== n.code)) load(n.code); };
addEventListener("hashchange", fromHash);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) { drawFigures(); layoutFreeze(); } });
layoutDock();
fromHash();
window.__drill = { check, get state() { return S; } };   // for tests/e2e
