/* split-app.mjs (W152): part 2 of 3 of the drill page; index.html runs app.js, cluck.js, shell.js in that order. A name from an earlier part: import it. A name from a later part, or a write to another part's let: bridge.<name>, defined by its own part at its top; never declare a local named bridge. tests/split-gate.test.mjs lints it. */
import { traceparent } from "./incident.mjs";
import { modeOf } from "./mode.mjs";
import { quack } from "./quack.mjs";
import { clampPos, dimAt, progress, radiusAt, snapTo } from "./sheet.mjs";
import { speakable } from "./speak.mjs";
import { pipeHold, pipeTable, renumberSteps } from "./steps.mjs";
import { flipHTML, flipModel, tableShape, tugFromTable, tugHTML } from "./tug.mjs";
import { $, S, bank, bridge, cueRight, esc, frReq, icon, incHTML, maxTries, mockHold, noteAt, painting, rboxSync, renderMath, reqInc, rpUnmount, say, toast, waitReduced, xInc } from "./app.js";
Object.defineProperties(bridge, {   // read (or set) from another part as bridge.<name> (split-app.mjs)
  cl: { get: () => cl, enumerable: true },   // let
  clClose: { get: () => clClose, enumerable: true },
  clGone: { get: () => clGone, set: v => { clGone = v; }, enumerable: true },   // let
  clOpen: { get: () => clOpen, enumerable: true },
  qSeen: { get: () => qSeen, enumerable: true },
  wish: { get: () => wish, enumerable: true },   // let
  wishDraw: { get: () => wishDraw, enumerable: true },
  wishEl: { get: () => wishEl, enumerable: true },
  wishFromCache: { get: () => wishFromCache, enumerable: true },
  wishNew: { get: () => wishNew, enumerable: true },
  wishOnWrong: { get: () => wishOnWrong, enumerable: true },
  wishPaint: { get: () => wishPaint, enumerable: true },
  wishReset: { get: () => wishReset, enumerable: true },
});
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
/* BIG PLAN V2 (Tony, Nov 2 23:01): every line of the permanent box that is not Cluck's own reply lives here. COPY-PENDING: Tony vets all of it (the no-key
   note is meant to read like a good fun 404 page). The three starters are app chrome (like .wchip): a tap sends its text through the ask field's pipe (clSend) */
const CL_COPY = {
  idle: "Ask me anything about this question. If you miss, I'll explain what went wrong.",
  starters: ["What is this asking?", "Which formula fits?", "Check my setup"],
  nokey: "404: Cluck not found. This one hatched without a duck, so he's off paddling somewhere else. The question is all yours. You've got this!",
  done: "Want my steps? Tap the duck chip under your answer.",
};
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
  Object.assign(w, { key, tr: clTry(S.tries.at(-1)), text, done: true, started: true, failed: 0, shown: text.length, pos: text.length, skip: true, at: 1 });
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
  const el = $("#wish"); if (el) { el.innerHTML = ""; el.hidden = true; el.classList.remove("gone"); }
  document.querySelectorAll(".cl-peek, .cl-room").forEach(p => p.remove());
  clReset();
}
function wishNew(ex) {                                                       // a real wish; the idle one it replaces hands over its spent questions (the server counts per question)
  const spent = wish && wish.idle && wish.code === S.code ? wish.chat.filter(t => t.role === "user").length + (wish.spent || 0) : 0;
  if (wish && wish.ctl) wish.ctl.abort();
  if (wish && wish.idle && cl) { cl.el.querySelector(".cl-thread").innerHTML = ""; cl.el.querySelector(".wtext").innerHTML = ""; cl.el.querySelector("#clTabEP .cl-quack")?.remove(); }
  return (wish = Object.assign(newWish(), { spent }, ex));
}
const idleWish = () => Object.assign(newWish(), { text: CL_COPY.idle, done: true, started: true, shown: CL_COPY.idle.length, pos: CL_COPY.idle.length, skip: true, at: 1, said: true, idle: true, key: "idle|" + S.code });
const newWish = () => ({ code: S.code, text: "", started: true, done: false, open: false, failed: 0, shown: 0, at: 0, said: false, chat: [], busy: false, out: false });
/* One text source: the box always shows the live /explain stream (saccharine.narration is no longer read here). */
function wishOnWrong() {
  if (mockHold()) return;
  if (modeOf() !== "sugar" || !S || !S.prob.wish || cluckOff) return;       // only questions with a presolved key; no key on the server: no entry
  /* a later miss redrew the hint card: Cluck's peek goes back in. A NEW miss (another try than the one the text explains, e.g. a 2nd wrong
     number) restarts the stream with the latest try, so the box never keeps explaining the first one (C4a, "stream every miss") */
  if (wish && wish.code === S.code && !wish.idle && !(wish.started && wish.key && wish.key !== ckKey(wish.code, askTry()))) { wishPaint(); return; }
  const w = wishNew();
  /* a wrong answer never opens Cluck by itself (B7 ii, Tony Oct 18): the duck's sunrise comes (peek.js) and a tap on it opens him.
     Desktop with the sheet already open (the free steps): it turns to Cluck's text, as before */
  const auto = () => { if (bridge.sideMQ.matches && cl && cl.open && !w.open) clOpen("explain", ":is(#wish, .rbox) .wchip", true); };
  if (wishFromCache(w)) { wishPaint(); auto(); return; }                   // a reply we already have: no call
  if (!shouldPrefetch(w.code)) w.started = false;                         // no prefetch: the "Explain my mistake" chip asks (no auto call)
  wishPaint();
  if (w.started) { wishStart(true); auto(); }                             // the reply streams now, in the background: one request, reused on open
}
const scratchTail = () => ($("#scratch")?.value || "").slice(-1500);      // the newest work: the NOTE reads the move (serve.py SCRATCH_MAX)
const askTry = () => (S.prob.type === "multi" && [...S.tries].reverse().find(x => x.v === "wrong")) || S.tries.at(-1) || {};   // the try Cluck is asked about (/explain and /chat agree)
/* telemetry (cluck_ask / cluck_reply): where the student is when Cluck is asked. code = the bank, item = the question; telemetry.js scrubs the text */
const ckTel = () => ({ code: bank ? bank.code : null, item: S ? S.code : null, tries_left: S ? Math.max(0, maxTries(S.prob) - S.tries.length) : null, after_wrong: !!S && S.tries.some(x => x.v === "wrong") });
async function wishStart(auto) {
  const w = wish, t = askTry(), key = ckKey(w.code, t);   // a multi: the part that was missed (the newest try may be a later right part: the drawer's Ask Cluck came after it)
  w.key = key; w.tr = clTry(t);                                                           // the try this text explains (Compare: a later right one needs its own)
  w.started = true; w.ctl = new AbortController();
  w.stg?.stop(); w.stg = Stages.make({ host: () => wishStgHost(w) });         // stages.js: the reply's real steps, shown in the sheet only while it is open
  window.stemT?.("_ask");   // telemetry: cluck_stream's first_token_ms starts here
  if (!auto) window.stemT?.("cluck_ask", { kind: "explain", ...ckTel(), item: w.code, text: "" });   // telemetry: an Explain press (the background ask is not the student's)
  if (auto) wishLogAdd();
  const t0 = Date.now(), tp = traceparent(), inc = x => reqInc("explain", "/explain", t0, { q: w.code, tp, ...x }), fr = frReq("explain", tp);
  let r = null, bytes = 0, err = null, ftok = null;
  try {
    window.stemBrainrot?.fold?.();                                        // Tony, Nov 3: Cluck starts to generate: the brainrot folds (desktop)
    r = await fetch("explain", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, auto, scratch: scratchTail(), stages: true }), signal: w.ctl.signal });   // part: a multi's part (W110); the server grades the pick itself
    fr.h(r);
    if (!r.ok || !r.body) {
      const sc = xInc(r)[0];                                               // a 503 with a server code (out of credit): a failure shown like any other;
      w.failed = r.status === 503 && sc ? 1 : r.status || 1;                // a plain 404/503 = no Cluck here (hidden), 429 = the cap: no incident
      if (![404, 429, 503].includes(r.status) || sc) w.inc = inc({ r, bytes: 0 });
      if (r.status === 503 && !sc) { cluckOff = true; w.off = !auto; }     // no key here: a press (not the background ask) says so in the sheet
    }
    else {
      const rd = r.body.getReader(), dec = new TextDecoder(), sp = { buf: "" };
      let swap = null;
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        bytes += value.length; fr.f();
        const c = Stages.feed(sp, dec.decode(value, { stream: true }));
        for (const e of c.events) e.error ? (err = e) : typeof e.replace === "string" ? (swap = e.replace) : w.stg.event(e);       // an {"error": "S-XXXXX"} line: the server's in-band failure (status was 200 already); {"replace"}: the subject pass's fixed text
        w.text += c.text;
        window.stemT?.("_tok");   // telemetry: first chunk time
        if (ftok == null) ftok = Date.now() - t0;
        if (wish === w && w.open) wishText();
        if (wish === w) peekText();
      }
      fr.e(bytes);
      if (swap !== null && !err) wishSwap(w, swap);
      if (err && w.text) { w.text = cutClean(w.text); w.lost = true; }   // Tony 19:37 Nov 3: a reply that died mid-way keeps its whole lines, then one clean line
      if (err) { w.failed = 1; w.inc = inc({ why: err.why, server: err.error, status: err.why === "budget_cap" ? 503 : 502, phase: w.text ? "stream" : "headers", bytes }); }   // the in-band error = the unstaged 503/502 (X-Incident): the same incident, its reason and the server's code
      else if (!w.text && !w.ctl.signal.aborted) { w.failed = 1; w.inc = inc({ why: "empty", phase: "stream", bytes, status: r.status }); }   // 200 and then nothing
    }
  } catch (e) { fr.x(e); if (!w.ctl.signal.aborted) { w.failed = 1; w.inc = inc(r ? { e, phase: "stream", bytes, status: r.status } : { e }); } }   // r: the headers came, the stream broke
  w.ctl.signal.aborted ? w.stg.stop() : w.stg.finish(!w.failed && !!w.text);   // the tick only for a whole reply
  w.done = true;
  if (!w.failed && w.text && !w.ctl.signal.aborted) ckPut(key, w.text);   // a whole reply only: not a failure, not one cut by leaving the question
  window.stemT?.("cluck_stream", { code: w.code, chars: w.text.length, figs: (w.text.match(WFIG) || []).length, failed: w.failed || 0, auto: !!auto });   // telemetry
  window.stemT?.("cluck_reply", { kind: auto ? "wish" : "explain", ...ckTel(), item: w.code, ok: !w.failed && !!w.text && !w.ctl.signal.aborted, error: w.ctl.signal.aborted ? "aborted" : w.failed ? (err ? String(err.why || err.error || "stream") : "status " + w.failed) : "", chars: w.text.length, first_token_ms: ftok, total_ms: Date.now() - t0, auto: !!auto, text: w.text });   // telemetry
  if (wish !== w) return;
  if (w.failed === 429) { w.started = false; w.failed = 0; w.capped = true; }   // the server's cap: the student can still ask
  wishPaint();
  if (w.open) wishDraw();                                                  // an open sheet shows the failure, not a caret forever (G2c row 23)
}
/* the subject pass (serve.py subject_pass, Tony Nov 3 19:26 "stream first, then FLASH the correct text back"): the streamed reply is
   swapped for the fixed one. Same lines (the server checks); a line that changed and holds no math, fence or table is re-drawn in place with
   a short fade (.wswap); figures, math and views keep their DOM. Still typing (or the sheet is closed): the next draw just uses the new text. */
function wishSwap(w, t) {
  const a = w.text.split("\n"), b = t.split("\n"), x = wish === w && w.open && w.ended ? $("#cluck .wtext") : null;
  w.text = t;
  if (!x || a.length !== b.length) return;
  a.forEach((o, i) => {
    if (o === b[i] || /[$`|\u0001]/.test(o + b[i]) || !o.trim()) return;
    const want = o.replace(/\*\*/g, "").replace(/^\s*- /, "").trim();
    const el = [...x.querySelectorAll(".wl, li, p")].find(e => !e.querySelector(".fig, .katex, .wl, li") && e.textContent.trim() === want);
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = wishHTML(b[i]);
    const n = el.tagName === "LI" ? tmp.querySelector("li") : tmp.firstElementChild;
    if (!n) return;
    n.classList.add("wswap");
    el.replaceWith(n);
  });
  w.shown = w.pos = w.drawn = t.length;                                   // drawn = shown: no full redraw, so the figures keep their nodes
}
/* a reply that died mid-way (an in-band error: 402, timeout, cut at max_tokens): drop the server's "stopped early" line, an unclosed fence,
   the half line at the end and a lead-in that promised a figure (ends with ":"), and the empty gaps a dropped figure left */
const LEADIN = /:\s*$/;   // a line that promised a figure; the one rule for cutClean, slotsResolve and figDrop
function cutClean(t) {
  let s = t.replace(/\n?\(Cluck stopped early\. Sorry!\)\s*$/, "");
  if ((s.match(/```/g) || []).length % 2) s = s.slice(0, s.lastIndexOf("```"));
  const lines = s.replace(/\s+$/, "").split("\n");
  if (lines.length && !/[.!?)\]$]\s*$|[^\x00-\x7f]\s*$/.test(lines.at(-1))) lines.pop();
  while (lines.length && (LEADIN.test(lines.at(-1)) || !lines.at(-1).trim())) lines.pop();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
function wishRetry(w) {                                                    // the chip and the sheet's "Try again": a fresh request
  Object.assign(w, { failed: 0, lost: false, capped: false, inc: null, stg: null, text: "", done: false, shown: 0, pos: 0, at: 0, tick: 0, skip: false, said: false, drawn: 0, ended: false });
  wishStart(false);
}
/* text: one line per line, the Mathy flow (design: brain topics/ai-tutor-ux.md): sentences with $..$ math and **bold** key numbers; "1. Title — subtitle" opens a step (Gemini's steps, alt's mock) that holds what
   follows until the next step or a "---" rule; "- " lines in a row make one short list (the ChatGPT break-up, Tony's ref); a line
   that is only math ($$..$$ or $..$) is display math, and display lines in a row share one tinted callout, one equation per line; a table row
   (2+ spaces between cells) in the mono face so its columns line up */
const WDISP = /^\s*\$\$?([^$]+)\$\$?\s*$/;
const wishMath = (x, d, m) => { try { return renderMath(x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), d); } catch { return m; } };
/* `code` in a reply (W113 vet: proof-b showed `lo = mid` with its backticks): the code span, never math or bold inside it */
const wishLine = l => esc(l).split(/`([^`\n]+)`/).map((s, i) => (i % 2 ? `<code class="wcode">${s}</code>`
  : s.replace(/\$\$?([^$]+)\$\$?/g, (m, x) => wishMath(x, false, m)).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"))).join("") || "&nbsp;";
const WSTEP = /^\s*(\d{1,2})[.)]\s+(.+)$/;
/* live figures (serve.py + livefig.py, Claude path only): the server sends at most one checked graph block per reply as
   "\n```fig\n<json>\n```\n". wishHTML puts a .wfig placeholder in its place (an unclosed fence shows nothing: never raw JSON);
   wishFigs draws it with Graph.render, the bank-figure path, once per figure (the drawn node is reused on every redraw). */
const figGone = new Set(), WFIG = /\n?```fig\n([^\n]*)\n```\n?/g, figJSON = [], figEl = [];
const figKey = j => { let k = figJSON.indexOf(j); if (k < 0) { k = figJSON.length; figJSON.push(j); } return k; };
/* a view (P4.1, views_gate.py): the server sends gated OpenUI Lang programs (with ```fig, at most two visuals a reply, todo 113) as "\n```openui\n<program>\n```\n", in the
   same one-figure slot; its key is the program behind a \u0002 mark. wishFigs draws it with views.js (loaded lazily); nothing drawn: its alt text. */
const WOUI = /\n?```openui\n([\s\S]*?)\n```\n?/g, OUI = "\u0002";
const ouiAlt = s => (/^\w+ = Geometry\(.*,\s*"((?:[^"\\]|\\.)*)"\)\s*$/m.exec(s) || [])[1] || "";
/* a figure the server is still drawing (serve.py v4_visible, Nov 3): the words stream on past a one-char anchor \u0005 where a dropped figure was; at the
   reply's end \u0006<fence or nothing>\u0007 follows. slotsResolve puts the fill AT the anchor, or removes the anchor and its blank line: while pending
   (and for good when nothing was drawn) the anchor leaves no DOM, so no gap and no empty box. Stripped of every control char, never shown. */
const SLOT_FILL = /\u0006([\s\S]*?)\u0007/;
function leadOut(a) {                                                    // text before a dropped figure: its ":" lead-in line goes, the blank line above it stays
  const x = a.replace(/\n+$/, ""), i = x.lastIndexOf("\n");
  return LEADIN.test(x.slice(i + 1)) ? x.slice(0, i + 1) : a.replace(/\n+$/, "\n");
}
function slotsResolve(t) {
  if (!/[\u0005-\u0007]/.test(t)) return t;
  const m = SLOT_FILL.exec(t), fill = m ? m[1] : "";
  t = m ? t.slice(0, m.index) + t.slice(m.index + m[0].length) : t.replace(/\u0006[\s\S]*$/, "");
  const i = t.indexOf("\u0005");
  if (i >= 0) {
    const a = t.slice(0, i), b = t.slice(i + 1);
    t = fill ? a + fill + b : leadOut(a) + b.replace(/^\n+/, "");   // pending or nothing drawn: the lead-in goes too (no status line stands in: Tony, Nov 4)
  }
  return t.replace(/[\u0005-\u0007]/g, "");
}
const stripFigs = t => slotsResolve(t).replace(WFIG, "\n").replace(WOUI, "\n").replace(/```[\s\S]*$/, "");
/* the static fallback (todo 113 spec, Tony Oct 28: "a STATIC IMAGE of the same visual, never an error box"): every view, once drawn, is drawn
   again off screen at STATIC_W px and kept as an image (SVG foreignObject, its computed look inlined). A phone too narrow for the view (the
   slot under TINY_W px, or the view wider than its slot) shows that image, scaled to fit; a later draw of the same program that fails shows it
   too. Nothing drawn and no image yet: the alt text, as before. */
const STATIC_W = 420, TINY_W = 300, staticImg = new Map();             // program -> data: URL of its image
const VIEW_DRAWN = ".vw-slot.on:not(.vw-fallback) > *";                // any drawn child (a Table-only view has no svg or p)
const LOOK = ["display", "box-sizing", "width", "height", "margin", "padding", "border", "border-collapse", "border-spacing", "font", "line-height",
  "letter-spacing", "text-align", "vertical-align", "white-space", "color", "background-color", "fill", "stroke", "stroke-width", "stroke-dasharray",
  "opacity", "text-anchor", "dominant-baseline", "font-variant-numeric", "flex-direction", "flex-wrap", "gap", "align-items", "justify-content"];
function inlineLook(src, dst) {
  if (src.nodeType !== 1) return;
  const cs = getComputedStyle(src);
  dst.setAttribute("style", LOOK.map(p => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  dst.removeAttribute("class");
  for (let i = 0; i < src.children.length; i++) inlineLook(src.children[i], dst.children[i]);
}
function viewImage(V, src) {
  if (staticImg.has(src)) return staticImg.get(src);
  const host = document.createElement("div");
  host.className = "wtext";                                              // the reply's own cascade
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${STATIC_W}px;visibility:hidden;pointer-events:none`;
  const ph = document.createElement("div");
  ph.className = "fig wfig wview";
  host.append(ph); document.body.append(host);
  let url = null;
  try {
    V.render(src, ph, {});
    for (const b of ph.querySelectorAll(".vw-foot")) b.remove();           // a stepper's Back / Next: no buttons in a picture
    if (ph.querySelector(VIEW_DRAWN)) {
      const copy = ph.cloneNode(true);
      inlineLook(ph, copy);
      const w = STATIC_W, h = Math.ceil(ph.getBoundingClientRect().height) + 2;
      copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject width="100%" height="100%">${
        new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`;
      url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }
  } catch (e) { console.error(e); }
  host.remove();
  if (url) staticImg.set(src, url);
  return url;
}
function showStatic(ph, url, alt) {
  const img = document.createElement("img");
  img.className = "vw-static"; img.src = url; img.alt = alt || "figure"; img.decoding = "async";
  ph.replaceChildren(img); ph.classList.add("wstatic");
}
const tooNarrow = ph => ph.clientWidth < TINY_W || [...ph.querySelectorAll(".vw-slot.on > *")].some(x => x.scrollWidth > ph.clientWidth + 1);
function figDrop(ph) {                                                   // a figure that drew nothing: its placeholder, the gaps around it and a ":" lead-in line right before it
  const gap = e => e && e.classList.contains("wgap");
  while (gap(ph.previousElementSibling)) ph.previousElementSibling.remove();
  while (gap(ph.nextElementSibling)) ph.nextElementSibling.remove();
  const p = ph.previousElementSibling;
  if (p && p.classList.contains("wl") && !p.classList.contains("wstep") && LEADIN.test(p.textContent)) p.remove();
  ph.remove();
}
/* the stepper's end cheer (Tony, Nov 8): the last step of a Cluck stepper, the first time -> the duck avatar rolls 360° fast, then a warm,
   slow, solid pastel confetti. Nothing under prefers-reduced-motion. views.js Steps sends "vw-steps-end" (bubbles). */
const CHEER_PASTEL = ["#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff", "#ffc6ff"];
document.addEventListener("vw-steps-end", e => {
  if (waitReduced()) return;
  const av = [...document.querySelectorAll("#cluck .cl-av")].find(a => a.offsetParent !== null);
  const roll = av ? av.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 450, easing: "cubic-bezier(.4,0,.2,1)" }).finished.catch(() => {}) : Promise.resolve();
  /* iteration 2: the confetti falls inside the stepper (rewards/fx.js confettiIn: a canvas in that element), never over the input or a toast */
  const par = e.target instanceof Element ? e.target : null, f = par && window.FX && window.FX.confettiIn ? window.FX.confettiIn(par) : null;
  roll.then(() => {
    if (!f) return;
    Promise.resolve(f({ particleCount: 60, spread: 110, startVelocity: 14, gravity: .35, drift: 0, ticks: 360, scalar: 1, colors: CHEER_PASTEL,
      shapes: ["circle", "square"], flat: true, origin: { x: .5, y: .1 }, disableForReducedMotion: true })).finally(() => f.canvas.remove());
  });
});
function wishFigs(root) {
  for (const ph of root.querySelectorAll(".wfig[data-f]")) {
    const k = +ph.dataset.f, done = figEl[k];
    if (figGone.has(k)) { figDrop(ph); continue; }                      // drawn nothing before: it stays gone on every redraw
    if (done && !done.isConnected) { ph.replaceWith(done); continue; }
    ph.removeAttribute("data-f");
    if (figJSON[k].startsWith(OUI)) {                                     // an ```openui view: views.js draws it into the placeholder
      const src = figJSON[k].slice(1), alt = ouiAlt(src), off = () => { figGone.add(k); figDrop(ph); };   // nothing drawn, no image: nothing at all, not a box with the description (Nov 3 prod, PHYS_NYT)
      ph.classList.add("wview"); ph.setAttribute("role", "figure"); ph.setAttribute("aria-label", alt || "figure");
      import("./views.js").then(V => {
        let drawn = false;
        try { V.render(src, ph, {}); drawn = !!ph.querySelector(VIEW_DRAWN); } catch (e) { console.error(e); }
        const url = drawn || staticImg.has(src) ? viewImage(V, src) : null;   // pre-rendered once it drew (W113 static fallback)
        if (url && (!drawn || tooNarrow(ph))) showStatic(ph, url, alt);
        else if (!drawn) off();
      }).catch(e => { console.error(e); if (staticImg.has(src)) showStatic(ph, staticImg.get(src), alt); else off(); });
      if (!done) figEl[k] = ph;
      continue;
    }
    let b = null; try { b = JSON.parse(figJSON[k]); } catch { /* the server checked it; a parse is still never trusted */ }
    if (!b || b.type !== "graph") { figGone.add(k); figDrop(ph); continue; }
    ph._block = b; ph.setAttribute("role", "img"); ph.setAttribute("aria-label", b.alt || "figure");
    try { Graph.render(ph, b); } catch (e) { console.error(e); figGone.add(k); figDrop(ph); continue; }
    if (!done) figEl[k] = ph;
  }
}                                // "1. Find the momentum before — only one cart moves"
function wishHTML(t, ended) {
  t = slotsResolve(t);
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
  const lines = t.replace(/\s+$/, "").split("\n");                       // a trailing newline (text cut mid-stream after a line) is not a blank line: no gap at the end
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], fg = /^\u0001FIG(\d+)$/.exec(l);
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
    const tb = pipeTable(lines, i);                                       // a strict GFM pipe table (the model's habit): a table, not raw bars
    if (tb) {
      flush(); i = tb.next - 1;
      const row = (r, tag) => `<tr>${r.map(c => `<${tag}>${wishLine(c)}</${tag}>`).join("")}</tr>`;
      if (tableShape(tb.head, tb.rows) === "tug") { put(`<div class="wl wtug">${tugHTML(tugFromTable(tb.head, tb.rows), wishLine)}</div>`); continue; }   // cause -> up/down rows: a Tug (tug.mjs)
      if (tableShape(tb.head, tb.rows) === "flip") { put(`<div class="wl wflip">${flipHTML(flipModel(tb.rows), wishLine)}</div>`); continue; }   // step | you did | the fix: flip cards (tug.mjs)
      put(`<div class="wl wtbl"><table><thead>${row(tb.head, "th")}</thead><tbody>${tb.rows.map(r => row(r, "td")).join("")}</tbody></table></div>`);
      continue;
    }
    const hold = pipeHold(lines, i);                                      // a table still arriving (header, separator, a cut row): wait for it, no raw bars
    if (hold !== null) { flush(); i = hold - 1; continue; }
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
/* the caret follows the words (Tony, Nov 4): it sits inline at the end of the last line that has text, never on a line of its own; no text yet = no caret */
function wishBody(el, html, caret) {
  el.innerHTML = html;
  if (!caret) return;
  const hosts = [...el.querySelectorAll(".wl:not(.wgap):not(.wlist), li")].filter(e => !e.closest(".wfig, .wtbl") && e.textContent.trim());
  hosts.at(-1)?.insertAdjacentHTML("beforeend", WCARET);
}
/* the wait: nothing on the page until the first word (Tony, Nov 4: no "Thinking…", no wait lines, no lone caret); the screen reader hears "Cluck is thinking." once */
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
      s.pos = bridge.reduceMQ.matches ? s.text.length : Math.max(s.pos, s.shown) + (now - last) * WISH_CPS / 1000; last = now;
      s.shown = Math.max(s.shown, wishCut(s.text, s.pos, s.done));
      const end = s.done && s.shown >= s.text.length;
      if (drawn !== s.shown || end) { wishBody(el, wishHTML(s.text.slice(0, s.shown), end), !end); wishFigs(el); drawn = s.shown; }
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
  if (w.stg?.seen) w.stg.paint(); else x.parentElement.querySelector(":scope > .stg")?.remove();   // a stale row list from another question never stays
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
    if (w.drawn !== -1) {                                                 // before the first word: nothing on the page (no caret, no status line)
      x.innerHTML = "";
      if (!w.thought) { w.thought = true; say("Cluck is thinking."); }
      w.drawn = -1;
    }
    w.tick = now; x.classList.toggle("wrun", !w.done || now < w.at); if (!w.done || now < w.at) wishText(); return; }
  const dt = now - (w.tick || now); w.tick = now;
  w.pos = w.skip || bridge.reduceMQ.matches ? t.length : Math.min(t.length, Math.max(w.pos || 0, w.shown) + dt * WISH_CPS / 1000);
  w.shown = Math.max(w.shown, wishCut(t, w.pos, w.done));
  const end = w.done && w.shown >= t.length;
  if (w.drawn !== w.shown || end !== w.ended) {
    if (!w.quack && w.shown > 0) {   // D72: Cluck's message opens with a QUACK, as its first body line (not in the name row)
      w.quack = bridge.lastQuack = quack(w.code + ":cluck", bridge.lastQuack);
      const msg = x.parentElement;   // the reply's first line, above the body (x itself is re-set on every draw, so the QUACK sits beside it)
      if (msg) { msg.querySelector(".cl-quack")?.remove(); x.insertAdjacentHTML("beforebegin", `<p class="cl-quack">${esc(w.quack)}</p>`); }
    }
    wishBody(x, wishHTML(t.slice(0, w.shown), end) + (!end ? "" : w.failed && w.lost ? `<div class="wl wlost">Cluck lost signal. <button type="button" class="wretry">Tap to retry.</button>${incHTML(w.inc)}</div>`
      : w.failed && w.inc ? `<div class="wl">${incHTML(w.inc).trim()}</div>` : ""), !end);   // the stream broke mid-reply: what came, then the clean line (+ its code)
    x.querySelector(".wlost .wretry")?.addEventListener("click", e => { e.stopPropagation(); wishRetry(w); wishDraw(); });
    wishFigs(x);
    w.drawn = w.shown; w.ended = end;
  }
  x.classList.toggle("wrun", !end);                                       // the rim turns while Cluck thinks and types
  if (!end) { wishText(); return; }
  if (!w.said) { w.said = true; say("Cluck's steps are open."); clAsk(); }   // (the idle wish is born said: the box opening on load is not announced)   // no voice (Tony, Oct 5: "remove the voice option"): the screen reader hears this line
}
/* the stage rows' home: above the reply in the open sheet (null = closed: stages.js paints when asked again, so opening shows the state so far) */
function wishStgHost(w) {
  const x = wish === w && w.open && $("#cluck .wtext"); if (!x) return null;
  const p = x.parentElement; let h = p.querySelector(":scope > .stg");
  if (!h) { h = document.createElement("div"); h.className = "stg"; h.setAttribute("aria-live", "off"); (p.querySelector(":scope > .cl-quack") || x).before(h); }
  return h;
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
    if (s.offsetHeight !== h) bridge.layoutFreeze();
  });
}
/* E1 LOCKED (Tony, Oct 13: T2, "okay, but how?", i20): the duck glyph + label + chevron that opens Cluck's sheet. One small piece:
   no fill at rest or pressed (NO NESTED BOX), pressed = the label turns --help and the duck tilts once. T35 may host it in an AI preview card */
const ctaHTML = (label, open) => `<button type="button" class="cl-cta" aria-expanded="${!!open}" aria-controls="cluck">${icon("i-duck")}<span>${esc(label)}</span>${icon("i-right")}</button>`;
function wishPaint() {
  const el = wishEl(), w = wish;
  const room = Math.max(0, ...[...document.querySelectorAll(".cl-peek, .cl-room")].map(p => p.getBoundingClientRect().height));   // the room the peek had (W129 L4)
  document.querySelectorAll(".cl-peek, .cl-room").forEach(p => p.remove());
  el.classList.remove("gone");
  if (!w || w.idle || [404, 503].includes(w.failed)) {                    // (the idle wish is the box's own opener: nothing on the page yet)
    el.hidden = true;
    if (w && cl && cl.open && cl.tab === "explain" && !w.off) { if (bridge.origEl) clTab("steps", false); else clClose(); }   // the auto-open found nothing to explain (a press: the sheet says Cluck is off)
    clBackSync(); return;
  }
  const perm = clPerm();                                                   // V2: the permanent box is never "the way back": the chip stays (the strip tray's Ask Cluck, the verdict's See steps)
  const off = perm ? false : bridge.sideMQ.matches ? w.open                       // desktop: while the sheet shows Cluck, "Hide" is noise (Tony, Oct 5: variant a); closed, it is the way back
    : !!bridge.origEl && w.started && !w.failed;                                   // phone + a snack: one way in, the "Compare with a similar solution" card (Tony, Oct 5, TODO C); "Explain my mistake" / "Try again" stay
  el.hidden = off;
  el.toggleAttribute("data-box", perm && !!w.open);                          // V2: what hiding #wish did to the spent preview (app.css), for the permanent box
  const cue = !!S && S.finished && S.code === w.code;                       // T17b-1: the question is closed, the duck chip under the answer (r5/B R3 REC)
  if (cue ? el.previousElementSibling !== $("#q") : el.previousElementSibling !== $("#fb")) (cue ? $("#q") : $("#fb")).after(el);
  el.classList.toggle("cue", cue);
  if (cue) {
    const ok = cueRight(), nod = w.nod && !w.nodded, q = bridge.FXL().nod;         // the nod plays once, after Next has landed: fx.js queues it after the
    if (nod) w.nodded = true;                                               // answer step (one blink); no FX queue = app.css g-nod's own delay
    el.innerHTML = `<div class="wbar"><button type="button" class="wchip cue-chip${ok ? " cue-ok" : ""}" aria-expanded="${w.open}" aria-controls="cluck">${icon("i-duck", "dk ico" + (nod && !q ? " g-nod" : ""))}<span>${ok ? "See Cluck's steps" : "Ask Cluck"}</span></button></div>`;
    if (nod && q) { const mine = S; q(() => S === mine && wish === w ? $(":is(#wish, .rbox) .cue-chip .dk") : null); }
  /* GENMISS (Tony, Nov 3): the Q3 = C inline peek + "okay, but how?" card is gone: on every wrong try, matched or generic, on every layout, the only Cluck entry is the strip tray's "Ask Cluck" (the chip below) */
  } else {
    const label = !w.started ? "Explain my mistake" : w.failed ? "Oops, didn't load. Tap to try again." : "Ask Cluck";   // permanent box + a reply on its way: the chip (the tray's "Ask Cluck") takes the student to the box's ask field
    el.innerHTML = `<div class="wbar"><button type="button" class="wchip rw-skin rw-chip${w.tapped || (w.started && !w.failed) ? "" : " rw-shine"}" aria-expanded="${w.open}" aria-controls="cluck"><span class="rw-coin2" aria-hidden="true">${icon("i-duck")}</span><span>${label}${w.started ? incHTML(w.inc, false) : ""}</span></button></div>`;
  }
  rboxSync();
  const btn = document.querySelector("#wish .wchip, .cl-peek .cl-cta") || document.querySelector(".rbox .wchip");   // the chip painted just now: in #wish, or already docked (typed bar). Never an older chip that the strip drawer (a .rbox before #wish in the DOM) still holds: it is about to be replaced, and the new one would get no handler
  btn?.addEventListener("click", () => {
    w.tapped = true;                                                       // the ad shine stops for good on this question
    if (!w.started && wishFromCache(w)) { /* the reply is in this browser: finished, no call; the sheet draws it */ }
    else if (!w.started || w.failed) wishRetry(w);
    else if (btn.matches(".cue-ok") && w.key && w.key !== ckKey(w.code, S.tries.at(-1))) { clOpen("explain", ":is(#wish, .rbox) .wchip"); clCompare(w); return; }   // right after a miss: the text explains the miss
    else if (perm && w.open) { clAskFocus(); return; }                      // the box is always open: the chip goes to its ask field
    else if (w.open) { clClose(); return; }
    clOpen("explain", btn.matches(".cl-cta") ? ".cl-peek .cl-cta" : ":is(#wish, .rbox) .wchip");
  });
  clBackSync();                                                            // one Cluck CTA at a time (E, Tony Oct 21): "okay, but how?" up = no "Show him" row
  bridge.layoutFreeze();
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
    <div class="cl-bd"><p class="cl-note" hidden></p><div class="cl-pane" id="clTabEP"><div class="msg">${clWho(false)}<div class="wtext" aria-live="off"></div></div><div class="cl-starters" role="group" aria-label="Ask Cluck" hidden></div><div class="cl-thread" aria-live="polite"></div><p class="cl-verify">verify b4 use lol</p></div>
      <button type="button" class="cl-fold" id="clFold" aria-expanded="false" aria-controls="clTabSP"><span class="cl-fold-t">See reference solution</span><span class="cl-fold-n"></span>${icon("i-down")}</button>
      <div class="cl-pane" id="clTabSP"></div></div>
    <div class="cl-ft"><button type="button" class="cl-more" aria-label="Scroll down">${icon("i-down")}</button><div class="cl-fi"></div></div>`;   // .cl-fi: the ask field / done row (clAsk); the hint stays
  cl = { el, tab: "explain", open: false, from: null, fold: false };
  window.CalcCoach?.chrome(el);                                                  // the Calc Coach link in Cluck's chrome, under his text (calc-coach.js)
  el.querySelector(".cl-fold").addEventListener("click", () => {
    if (!cl.fold && S && S.orig && !S.orig.open && S.orig.lvl === 3) bridge.origPeeked();   // folded away after a solve: looking again is a peek
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
    bd.scrollBy({ top: bd.clientHeight * 0.8, behavior: bridge.reduceMQ.matches ? "auto" : "smooth" });
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
  const phone = () => !bridge.sideMQ.matches;
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
    if (bridge.reduceMQ.matches) { settle(to); return; }
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
  const home = bridge.sideMQ.matches ? $("#work") : document.body;
  if (cl.el.parentElement !== home) home.append(cl.el);
  $("#work").classList.toggle("cl-on", cl.open && bridge.sideMQ.matches);
  window.stemBrainrot?.sheet(cl.open && bridge.sideMQ.matches);
  document.documentElement.classList.toggle("cl-open", cl.open && !bridge.sideMQ.matches);
}
function clOpen(tab, from, auto) {                                        // auto (the desktop default, Tony Oct 5): no focus, no scroll
  if (clGone && bridge.sideMQ.matches) { if (auto) return; clGoneSet(false); }    // dismissed (DISMISS.md): an auto-open waits for the student; a tap brings the column back
  window.stemT?.("cluck_open", { tab, auto: !!auto, hk: hkKind() });   // telemetry; hk = the back row's humour kind (DISMISS.md A/B)
  clEl(); if (!cl.open) cl.y = scrollY;
  cl.sheetReset?.();
  cl.perm = clPerm();
  if (cl.perm && !S.finished && S.prob.wish && !cluckOff && !S.prob.original && (!wish || wish.code !== S.code)) wish = idleWish();   // V2: before any miss the box holds the opener + starters, not a blank
  cl.open = true; cl.from = from; cl.auto = !!auto; cl.el.hidden = false; cl.fold = tab === "steps";   // opened for the steps: the fold opens; for a miss: it starts closed
  clPlace(); clTop(); clAsk(true); clTab(tab, !auto); bridge.padRule();
  bridge.layoutFreeze();
  dispatchEvent(new CustomEvent("stem:layers"));                            // nav.js: the iOS Back button
  if (bridge.sideMQ.matches && !auto) {                                            // its ask field lands in view. The sheet fits the window below the column's top (app.css
    const ft = cl.el.querySelector(".cl-ft"), r = ft.getBoundingClientRect();   // #work.cl-on), so the page moves only when the field is really off screen (W129 L4: "start" scrolled the page under the student)
    if (r.top < 0 || r.bottom > innerHeight) ft.scrollIntoView({ block: "nearest", behavior: bridge.reduceMQ.matches ? "auto" : "smooth" });
  }
}
const clPerm = () => modeOf() === "sugar" && bridge.sideMQ.matches && !!S;           // BIG PLAN V1 (Tony Nov 2, 22:49): desktop sugar keeps Cluck's box open from the first paint, no X, no Escape, no dismiss. Phones and diet: unchanged
/* the first close of Cluck's sheet on this device (flag stem-ob-cluck, set only when the note was placed): a note on the way back in */
function cluckToast() {
  try { if (localStorage.getItem("stem-ob-cluck")) return; } catch { return; }
  setTimeout(() => {
    const at = document.querySelector(":is(#wish, .rbox) .wchip");
    if (!at || at.hidden || !at.getClientRects().length || noteAt() || !toast("Cluck lives in Ask Cluck. Tap it to reopen.", at)) return;
    try { localStorage.setItem("stem-ob-cluck", "1"); } catch { /* shown, not kept */ }
  }, 80);
}
function clClose(dismiss, force) {                                         // force: clReset only (a new question empties the box, applyMT opens it again)
  if (!cl || !cl.open || (clPerm() && !force)) return;
  rpUnmount(); if (!force) cluckToast();                                   // the brown repair box goes with the sheet; the first time ever, a note says where Cluck went
  window.stemT?.("cluck_dwell");   // telemetry: ms + scrolled_pct are measured in telemetry.js
  const back = !cl.auto || cl.el.contains(document.activeElement);         // focus goes back to the opener, but an auto-open never pulls it
  cl.open = false; cl.wantAsk = false; cl.el.hidden = true; cl.sheetReset?.();
  clTab(cl.tab, false); clPlace(); bridge.padRule();
  bridge.layoutFreeze();
  dispatchEvent(new CustomEvent("stem:layers"));
  if (!bridge.sideMQ.matches && cl.y != null) scrollTo({ top: cl.y, behavior: "instant" });       // back where the student was (clTop moved the page)
  if (dismiss === true && bridge.sideMQ.matches && !bridge.origEl) clGoneSet(true);      // desktop X / Esc: the whole column goes (DISMISS.md); with a snack's original in it, the card stays the way back
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
  bridge.applyMT(); bridge.layoutFreeze();
}
function hkStop() { clearInterval(hkT); hkT = 0; }
function hkShow(b, roll) {
  const t = b.querySelector(".hk-t"), set = HK[hkKind()];
  const l = set[hkI % set.length];
  t.textContent = Array.isArray(l) ? l[Math.floor(Math.random() * l.length)] : l;
  if (roll) { t.classList.remove("roll"); void t.offsetWidth; t.classList.add("roll"); }   // the line slides up into place (app.css hk-roll)
}
function ctaUp() { return [...document.querySelectorAll(".cl-peek .cl-cta, #wish .cue-ok, .rbox .cue-ok")].some(c => c.getClientRects().length > 0); }   // "okay, but how?" or "See Cluck's steps" on screen (Tony Oct 21: hide "Show him" beside either; a tap on either brings the column back)
function clBackSync() {
  const show = clGone && bridge.sideMQ.matches && !!S && !ctaUp();             // E (Tony, Oct 21): only one Cluck CTA on screen; "okay, but how?" wins
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
  if (!bridge.reduceMQ.matches) hkT = setInterval(() => { if (b.hidden || !b.isConnected) { hkStop(); return; } hkI++; hkShow(b, true); }, 3600);   // reduced motion: one static line
}
function clBack() {
  const w = wish, said = !!w && !!S && w.code === S.code && w.started && !w.failed && ![404, 503].includes(w.failed);
  clGoneSet(false);
  if (said || bridge.origEl) clOpen(said ? "explain" : "steps", "#clBack");
}
/* T45 idle peek (peek.js): its timer waits while Cluck is open (AMA 9). A tap on the peeking duck = Cluck (AMA 4), with no new AI call
   (T34 budget) and no auto hint (T32 pry-guard): what Cluck already has (his steps, the reference solution) opens in the sheet; else
   his own way in on the page (the "Explain my mistake" chip, the hint card) gets the focus, and the student decides; nothing there = the duck just goes */
window.stemCluckOpen = () => !!cl && cl.open;
window.stemCluckClose = () => clClose(false);                               // nav.js: the iOS Back button closes the sheet
window.stemClOpen = (tab, from, auto) => clOpen(tab, from, auto);   // lockhelp.js: "Open help panel"
window.stemCluckModal = () => !!cl && cl.open && !cl.perm;                 // Cluck's sheet is in the way (toast yields, Escape is his): not the permanent box (BIG PLAN V1)
window.stemLayout = () => { if (S) bridge.layoutFreeze(); };                        // brainrot.js: the docked players folded / unfolded; the notes take the room in the same frame (W129 L4)
window.stemIdleTap = () => {
  const w = wish;
  if (w && S && w.code === S.code && (!w.started || w.failed) && ![404, 503].includes(w.failed)) {   // B7 (Tony, Oct 19, pick b): no prefetch (or it failed): the duck
    w.tapped = true;                                                       // tap is the "Explain my mistake" tap, the same request (the T34 exception, an explicit tap only)
    if (w.started || !wishFromCache(w)) wishRetry(w);                      // a reply in this browser's cache: no call
    clOpen("explain", null); return;
  }
  const said = !!wish && wish.started && !wish.failed;
  if (said || bridge.origEl) { clOpen(said ? "explain" : "steps", null); return; }
  const b = [...document.querySelectorAll(":is(#wish, .rbox) .wchip, .cl-peek .cl-cta, #origHd")].find(x => x.getClientRects().length);
  if (b) { b.scrollIntoView({ block: "nearest", behavior: bridge.reduceMQ.matches ? "auto" : "smooth" }); b.focus({ preventScroll: true }); }
};
/* K1 (Tony, Oct 13): on a phone the sheet docks under the question's first two lines. The page goes to its top (nothing sticky
   sits over the question there), then the sheet's top sits two lines below the question text's first line (at most 45% down: the chat keeps room) */
function clTop() {
  if (bridge.sideMQ.matches) return;
  scrollTo({ top: 0, behavior: "instant" });
  const t = $("#blocks > :not(.ptitle)") || $("#problem"); if (!t) return;
  const lh = parseFloat(getComputedStyle(t).lineHeight) || 28;
  cl.el.style.setProperty("--cl-top", Math.round(Math.min(Math.max(t.getBoundingClientRect().top + 2 * lh + 2, 48), innerHeight * 0.45)) + "px");
}
function clTab(tab, focus) {
  const has = { explain: !!wish && (wish.off || ![404, 503].includes(wish.failed)) && wish.started, steps: !!bridge.origEl };   // off: the sheet holds the one line
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
  clHist(!!(w && w.open && !was));
  if (w && !w.open && was) w.tick = 0;
  if (S && S.orig) {
    S.orig.open = cl.open && has.steps && cl.fold;
    $("#origHd")?.setAttribute("aria-expanded", String(S.orig.open));
    if (S.orig.open) cl.el.querySelectorAll("#clTabSP .fig").forEach(f => { if (!f.firstChild) try { Graph.render(f, f._block); } catch (e) { f.textContent = f._block.alt || ""; } });
  }
  if (w && was !== w.open) wishPaint();                                     // the chip's label follows
  clIdleSync();
  clMore();
  if (focus) {                                                              // a manual open: focus goes into the sheet (an auto open never moves it)
    const ta = cl.el.querySelector(".ask textarea");
    if (has.steps && tab === "steps") fold.focus();
    else if (bridge.sideMQ.matches && ta && !ta.disabled && !cl.el.querySelector(".cl-ft").hidden) ta.focus({ preventScroll: true });
    else { cl.wantAsk = bridge.sideMQ.matches; [...cl.el.querySelectorAll(".cl-x")].find(b => b.getClientRects().length)?.focus({ preventScroll: true }); }   // desktop: the ask field once the text is typed; phone: no keyboard pop
  }
}
/* the thread reads like a chat (Lane 2, Oct 13): no name/time line; Cluck's text on the sheet (his avatar only beside it on desktop),
   the student's words in a bubble. The speaker's name stays for screen readers */
const clWho = me => me ? '<span class="sr-only">You: </span>' : `<span class="av" aria-hidden="true">${icon("i-duck")}</span><span class="sr-only">Cluck: </span>`;
function clReset() {                                                        // a new question: close, empty, a fresh ask field
  cl?.el.querySelector("#clTabEP .cl-quack")?.remove();                     // D72: the next explanation picks its own QUACK
  if (!cl) return;
  cl.y = null;                                                              // a new question: no scroll back to the old one
  clClose(false, true);
  cl.el.querySelector(".wtext").innerHTML = "";
  cl.el.querySelector(".cl-thread").innerHTML = "";
  cl.el.querySelector("#clTabEP > .cl-st")?.remove();
  cl.el.querySelectorAll("#clTabEP [hidden]").forEach(e => { e.hidden = false; });
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
  if (wish && wish.idle) return;                                           // V2: the opener + starters are not a reply: Jev hears nothing for them
  const k = `${wish?.code}#${cl.el.querySelectorAll(".cl-thread .wreply").length}`, m = cl.more;
  if (on && m?.k !== k) { cl.more = { k }; window.stemT?.("cluck_more", { act: "shown" }); }
  else if (!on && cl.open && m?.k === k && !m.end) { m.end = true; window.stemT?.("cluck_more", { act: "bottom" }); }   // scrolled to the end (a close is not "bottom")
}
/* the ask field (STYLE.md "Cluck's surfaces" chat): CHAT_TURNS questions, "N left", a tangerine send; it opens once the box text is out */
/* V2: the permanent box's own words. Idle (before any miss): Cluck's opener line (the idle wish's text) + three starter chips; each sends through the ask field's pipe, so it counts against the 5.
   A question with no Cluck key: the note instead (CL_COPY.nokey). Right on the first try, no steps asked yet: the note points at the duck chip */
function clIdleSync() {
  if (!cl) return;
  const st = cl.el.querySelector(".cl-starters"), nt = cl.el.querySelector(".cl-note"), w = wish, perm = cl.open && cl.perm && !!S;
  const idle = perm && !!w && w.idle && w.code === S.code && !w.chat.length && !w.busy && !w.out && CHAT_TURNS - (w.spent || 0) > 0;
  st.hidden = !idle;
  if (idle && !st.firstChild) {
    for (const t of CL_COPY.starters) {
      const b = document.createElement("button"); b.type = "button"; b.className = "cl-starter"; b.textContent = t;
      b.addEventListener("click", () => { if (wish && wish.idle && !wish.busy) clSend(t); });
      st.append(b);
    }
  }
  const text = !perm ? "" : (!S.prob.wish || cluckOff) ? CL_COPY.nokey : (!!w && !w.idle && !w.started && S.finished) ? CL_COPY.done : "";
  nt.hidden = !text; nt.textContent = text;
}
function clAskFocus() {                                                     // the tray's Ask Cluck on the permanent box: the field takes the cursor (the box stays where it is)
  const ta = cl && cl.el.querySelector(".cl-ft:not([hidden]) .ask textarea:not(:disabled)");
  if (ta) ta.focus({ preventScroll: false }); else cl?.el.querySelector(".cl-bd")?.scrollTo({ top: 1e5, behavior: "smooth" });
}
function clAsk(build) {
  if (!cl) return;
  clIdleSync();
  const ft = cl.el.querySelector(".cl-fi"), w = wish;
  cl.el.classList.toggle("wbusy", !!w && w.busy);                          // the field's rim turns while Cluck answers
  if (!w) { ft.innerHTML = ""; return; }
  const left = w.out ? 0 : CHAT_TURNS - (w.spent || 0) - w.chat.filter(t => t.role === "user").length;   // spent: the starters asked before the miss
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
/* Cluck's history (W2, Nov 5): each Cluck turn that answers a graded pick or typed answer starts with a status line (rules either side, small
   muted text, no box): "chose 1.80 J ✓" / "typed 6 ✗", the choice's VALUE, never its letter. Lines build up in order = the history. Once a
   later turn exists, an earlier WRONG reply folds under its line (the line is the toggle); the latest reply and every right one stay open */
const clPlain = md => /[$\\]/.test(String(md ?? "")) ? clTex(md) : String(md ?? "").replace(/`/g, "").replace(/\s+/g, " ").trim();   // plain text (code) stays as shown; only TeX is flattened
const clTex = md => String(md ?? "").replace(/\\(?:text|mathrm|mathbf|textbf)\{([^}]*)\}/g, "$1").replace(/\\circ/g, "°").replace(/\\cdot/g, "·").replace(/\\times/g, "×").replace(/\\pi/g, "π")
  .replace(/\\[,;:! ]|~/g, " ").replace(/\\([%$&#_{}])/g, "$1").replace(/\\(?:left|right|mathit)\b/g, "").replace(/\\[a-zA-Z]+/g, "").replace(/[$*`{}]/g, "").replace(/\s+/g, " ").trim();
const CL_ST_MAX = 28;
function clTry(t) {                                                         // { v, label } of a graded try; null = no status line (no grade, or no value to show)
  if (!t || (t.v !== "correct" && t.v !== "wrong") || !S || S.prob.type === "proof") return null;   // a proof has no value to name
  const p = S.prob, u = p.type === "multi" && Number.isInteger(t.part) ? p.parts?.[t.part] || p : p;
  let val = t.c != null ? [].concat(t.c).map(id => clPlain((u.choices || []).find(c => c.id === id)?.md ?? "")).filter(Boolean).join(", ") : String(t.a ?? "").trim();
  if (t.c != null && !val) val = "none";                                    // a choose-all with nothing ticked ("neither" can be the key)
  if (!val) return null;
  const pre = t.c != null ? "chose " : "typed ", cut = val.length > CL_ST_MAX ? val.slice(0, CL_ST_MAX - 1).trimEnd() + "\u2026" : val;   // a long (code) choice: cut at ~28 chars, the full text in the title
  return { v: t.v, label: pre + cut, full: pre + val };
}
window.__clTry = clTry;   // tests (as __drill): the status line's label for a try
function clStatus(tr) {
  const d = document.createElement("div"); d.className = "cl-st"; d.dataset.v = tr.v; const mark = tr.v === "correct" ? "✓" : "✗";
  d.dataset.t = `${tr.label} ${mark}`; d.dataset.full = `${tr.full || tr.label} ${mark}`;
  d.innerHTML = '<i aria-hidden="true"></i><span class="cl-st-b"></span><i aria-hidden="true"></i>';
  return d;
}
function clHist(land) {                                                     // idempotent: add the first line, fold/open each turn, land on the latest
  if (!cl) return;
  const pane = cl.el.querySelector("#clTabEP");
  if (wish?.tr && !pane.querySelector(":scope > .cl-st")) pane.querySelector(":scope > .msg")?.before(clStatus(wish.tr));
  const segs = [];
  for (const e of pane.querySelectorAll(":scope > .cl-st, :scope > .msg, .cl-thread > *")) {
    if (e.classList.contains("cl-st")) segs.push({ st: e, items: [] }); else segs.at(-1)?.items.push(e);
  }
  segs.forEach(({ st, items }, i) => {
    const fold = st.dataset.v === "wrong" && i < segs.length - 1, open = !fold || !!st._open, lab = st.dataset.t;
    items.forEach(e => { e.hidden = !open; });
    const b = document.createElement(fold ? "button" : "span"); b.className = "cl-st-b"; b.title = st.dataset.full; if (st.dataset.full !== lab) b.setAttribute("aria-label", st.dataset.full);
    if (fold) {
      b.type = "button"; b.setAttribute("aria-expanded", String(open));
      b.innerHTML = `<span class="cl-st-c" aria-hidden="true">${open ? "▾" : "▸"}</span> `; b.append(lab);
      b.addEventListener("click", () => { st._open = !open; clHist(); st.querySelector(".cl-st-b").focus({ preventScroll: true }); });
    } else b.textContent = lab;
    st.children[1].replaceWith(b);
  });
  if (land && segs.length > 1 && !pane.hidden) {                           // the sheet opens on the latest reply
    const bd = cl.el.querySelector(".cl-bd"), st = segs.at(-1).st;
    bd.scrollTop += st.getBoundingClientRect().top - bd.getBoundingClientRect().top - 8;
  }
}
/* "See Cluck's steps" after a miss, then a right try (Tony, Oct 26): the sheet's text explains the miss, so Cluck's solution for the
   right answer comes as a NEW message under it (the miss stays above as history), typed like a chat reply and scrolled into view inside the
   sheet (the page does not move). One /explain (not auto) per right answer, cached like the box text; a re-press scrolls to it. Not in the
   chat history (that alternates turns) */
async function clCompare(w) {
  const t = S.tries.at(-1) || {}, key = ckKey(w.code, t), th = cl.el.querySelector(".cl-thread");
  const bd = cl.el.querySelector(".cl-bd"), top = el => { bd.scrollTop += el.getBoundingClientRect().top - bd.getBoundingClientRect().top - 8; };   // the message's top at the body's top
  if (w.cmp && w.cmp.key === key && w.cmp.el.isConnected) { top(w.cmp.st || w.cmp.el); return; }
  const tr = clTry(t), st = tr && clStatus(tr);
  const box = document.createElement("div"); box.className = "msg cl-cmp"; box.innerHTML = clWho(false) + `<div class="wtext wreply"></div>`;
  const re = box.lastChild;
  w.cmp = { key, el: box, st };
  if (st) th.append(st);
  th.append(box); clHist(); top(st || box);
  const ty = { text: ckGet(key), pos: 0, shown: 0, done: false }, typed = wishType(re, ty);
  window.stemT?.("cluck_ask", { kind: "other", ...ckTel(), item: w.code, text: "" });   // telemetry: the Compare press
  if (ty.text) { ty.done = true; typed.then(() => top(st || box)); return; }    // this browser has it: no call
  w.busy = true; clAsk();
  const t0 = Date.now(), tp = traceparent(), fr = frReq("explain", tp);
  let r = null, bytes = 0, inc = null, ftok = null;
  const fail = x => { inc = reqInc("explain", "/explain", t0, { q: w.code, tp, ...x }); };
  try {
    window.stemBrainrot?.fold?.();                                        // Tony, Nov 3: Cluck starts to generate: the brainrot folds (desktop)
    r = await fetch("explain", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin",
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, auto: false, scratch: scratchTail() }) });
    fr.h(r);
    if (!r.ok || !r.body) { if (r.status !== 429) fail({ r }); }
    else {
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { value, done } = await rd.read(); if (done) break; if (ftok == null) ftok = Date.now() - t0; bytes += value.length; fr.f(); ty.text += dec.decode(value, { stream: true }); }
      fr.e(bytes);
      if (!ty.text.trim()) fail({ why: "empty", phase: "stream", bytes, status: r.status });
    }
  } catch (e) { fr.x(e); fail(r ? { e, phase: "stream", bytes, status: r.status } : { e }); }
  window.stemT?.("cluck_reply", { kind: "other", ...ckTel(), item: w.code, ok: !!r && r.ok && !!ty.text.trim() && !inc, error: inc ? String(inc.why || inc.status || "fail") : r && r.status === 429 ? "429" : "", chars: ty.text.length, first_token_ms: ftok, total_ms: Date.now() - t0, auto: false, text: ty.text });   // telemetry
  if (wish !== w) return;
  const ok = !!r && r.ok && ty.text.trim() && !inc;
  if (ok) { ty.done = true; await typed; if (wish !== w) return; ckPut(key, ty.text); top(st || box); say(speakable(stripFigs(ty.text))); }
  else { ty.off = true; w.cmp = null; re.innerHTML = wishHTML(r && r.status === 429 ? "Oh duck, Cluck is tired! Come back later." : "Didn't load. Tap Compare to try again.") + incHTML(inc); }   // COPY-PENDING: the Compare retry line
  w.busy = false; clAsk();
}
async function clSend(msg) {
  const w = wish, t = askTry();
  if (!w || w.busy || !wishTyped(w)) return;
  const th = cl.el.querySelector(".cl-thread");
  const me = document.createElement("div"); me.className = "msg me"; me.innerHTML = clWho(true) + '<p class="md"></p>'; me.lastChild.textContent = msg;
  const box = document.createElement("div"); box.className = "msg"; box.innerHTML = clWho(false) + `<div class="wtext wreply"></div>`;
  const re = box.lastChild;
  th.append(me, box);
  w.chat.push({ role: "user", content: msg }); w.busy = true; clAsk();
  window.stemT?.("cluck_ask", { kind: "ask", ...ckTel(), item: w.code, text: msg });   // telemetry: the student's typed question (telemetry.js scrubs it)
  re.scrollIntoView({ block: "nearest" });
  w.ctl = w.ctl || new AbortController();
  let text = "", err = "", inc = null, r = null, bytes = 0, ftok = null;
  const ty = { text: "", pos: 0, shown: 0, done: false }, typed = wishType(re, ty);   // the reply is typed word by word as it comes, not drawn per chunk
  const t0 = Date.now(), tp = traceparent(), fail = x => { err = "fail"; inc = reqInc("chat", "/chat", t0, { q: w.code, tp, ...x }); }, fr = frReq("chat", tp);
  try {
    window.stemBrainrot?.fold?.();                                        // Tony, Nov 3: Cluck starts to generate: the brainrot folds (desktop)
    r = await fetch("chat", { method: "POST", headers: { "content-type": "application/json", traceparent: tp }, credentials: "same-origin", signal: w.ctl.signal,
      body: JSON.stringify({ code: w.code, answer: t.c ?? t.a ?? "", part: t.part, scratch: scratchTail(), history: [{ role: "assistant", content: w.text }, ...w.chat] }) });
    fr.h(r);
    if (r.status === 429) err = ((await r.json().catch(() => ({}))).error === "limit") ? "limit" : "hourly";
    else if (!r.ok || !r.body) fail({ r });
    else {
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        if (ftok == null) ftok = Date.now() - t0;
        bytes += value.length; fr.f();
        text += dec.decode(value, { stream: true });
        ty.text = text;
      }
      fr.e(bytes);
      if (!text.trim()) fail({ why: "empty", phase: "stream", bytes, status: r.status });
    }
  } catch (e) { fr.x(e); if (w.ctl.signal.aborted) return; fail(r ? { e, phase: "stream", bytes, status: r.status } : { e }); }
  window.stemT?.("cluck_reply", { kind: "ask", ...ckTel(), item: w.code, ok: !err, error: err, chars: text.length, first_token_ms: ftok, total_ms: Date.now() - t0, auto: false, text });   // telemetry
  if (wish !== w) return;
  if (err) ty.off = true; else { ty.done = true; await typed; if (wish !== w) return; }
  w.busy = false;
  if (err) {
    w.chat.pop();                                                          // not answered: it does not count
    if (err === "limit") { w.out = true; box.remove(); }
    else re.innerHTML = wishHTML(err === "hourly" ? "Oh duck, Cluck is tired! Come back later." : "Oops, didn't load. Ask again?") + incHTML(inc);
  } else { w.chat.push({ role: "assistant", content: slotsResolve(text) }); say(speakable(stripFigs(text))); }
  clAsk();
  re.scrollIntoView({ block: "nearest" });
  if (!w.out) cl.el.querySelector(".ask textarea")?.focus();
}


export { clBackSync, clEl, clGoneSet, clPerm, clPlace };
