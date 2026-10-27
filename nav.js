/* nav.js: Prev / Next and the questions list (design/NAV.md).
   The list: the open practice bank (window.stemBank, design/BANK.md), else an uploaded problems.json
   (window.stemOffline.codes()). Neither: no list (codes are the gate), so the nav stays hidden.
   Next plays a hidden queue (shuffle.mjs qPick, design/plans/QUEUE.md): fresh topics first, a miss back after 3 / 8 / 20 others,
   one queue per bank in localStorage stem-q-<bank>. Prev / Next first walk the questions already shown (history). No queue UI (D57).
   The list button says the bank code. Hooks: app.js fires "drill:problem" { code } after every load and "drill:answer"
   { code, right } after every graded pick. Navigation goes through location.hash, which app.js follows.
   The front door (DESIGN-v3 §1, Tony #2-#4): the front bank is the one "/" opens (serve.py's "last" for a new browser); serve.py FRONT
   is the one source, its payload says "front": the bar title (window.stemBank.front). Its bar says only that title, and Next plays the
   noob ramp (shuffle.mjs ramp) until "Mix it up" (the queue above). */
import { glue, family, qNew, qPick, qShow, qAnswer, qMigrate, qLoad, qSave, deadOpen, deadLead, ramp, rampAnswer, skipAhead, mockList, mockNew, mockNext, mockAnswer, mockOn } from "./shuffle.mjs";
import { isBankId, bareBank } from "./codes.mjs";
/* ?bank=P2X or ?bank=BANK_P2X (the instructor's link) -> that bank code, else null */
export function deepBank(search) {
  const s = String(new URLSearchParams(search).get("bank") || "").trim().toUpperCase();
  return isBankId(s) ? s : (bareBank(s) || {}).code || null;
}
const MAX = 60;
const SPAM_MS = 2000;                                               // a pick faster than this is a guess (Fable fix 4)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* ---------- titles: problem.title, else the first paragraph of the first text block as plain text ---------- */
const SYM = { mu: "μ", pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", omega: "ω", lambda: "λ",
  sigma: "σ", rho: "ρ", phi: "φ", tau: "τ", epsilon: "ε", varepsilon: "ε", cdot: "·", times: "×", div: "÷", le: "≤", leq: "≤",
  ge: "≥", geq: "≥", ne: "≠", neq: "≠", infty: "∞", to: "→", approx: "≈", pm: "±", circ: "°", degree: "°", ldots: "…", dots: "…",
  cap: "∩", cup: "∪", setminus: "∖", subseteq: "⊆", subset: "⊂", in: "∈", notin: "∉", emptyset: "∅", forall: "∀", exists: "∃",
  neg: "¬", lnot: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨", oplus: "⊕", rightarrow: "→", Rightarrow: "⇒", leftrightarrow: "↔",
  therefore: "∴", Box: "□", Diamond: "◇", square: "□", lozenge: "◇", vert: "|", mid: "|" };
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
const wrap = x => /^[\w.]+$/.test(x) ? x : `(${x})`;
export function texText(src) {
  let s = String(src);
  s = s.replace(/\^\s*\{?\\circ\}?/g, "°");
  for (let i = 0; i < 4; i++) {                                    // innermost first, so nesting unwinds
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|operatorname)\s*\{([^{}]*)\}/g, "$1")
         .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
         .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`);
  }
  s = s.replace(/\^\s*\{(-?\d+)\}|\^(\d)/g, (_, a, b) => [...(a ?? b)].map(c => SUP[c]).join(""))
       .replace(/\\(left|right)\b/g, "")
       .replace(/\\[,;: ]|~/g, " ").replace(/\\!/g, "")
       .replace(/\\([{}])/g, "$1")
       .replace(/\\([A-Za-z]+)/g, (_, n) => SYM[n] ?? n)
       .replace(/[{}]/g, "").replace(/_/g, "");
  return s.replace(/\s+/g, " ").trim();
}
/* markdown marks out, TeX to plain text; "\$" is a literal dollar (same cut as app.js md()) */
export function plain(md) {
  const math = [];
  let s = String(md).replace(/\\\$/g, () => { math.push("$"); return `\u0001${math.length - 1}\u0002`; });
  s = s.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, a, b) => { math.push(texText(a ?? b)); return `\u0001${math.length - 1}\u0002`; });
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")                   // links, images
       .replace(/`([^`]*)`/g, "$1")
       .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")     // emphasis
       .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
       .replace(/<[^>]*>/g, "");
  return s.replace(/\u0001(\d+)\u0002/g, (_, i) => math[+i]).replace(/\s+/g, " ").trim();
}
export function clip(s, n = MAX) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(" ");
  return (sp > n / 2 ? cut.slice(0, sp) : cut).replace(/[\s,.;:(—-]+$/, "") + "…";
}
export function titleOf(p) {
  if (!p) return "";
  if (typeof p.title === "string" && p.title.trim()) return clip(p.title.trim().replace(/\s+/g, " "));
  const b = (p.body || []).find(x => x && x.type === "text" && x.md);
  if (!b) return "";
  const para = [];
  for (const line of (Array.isArray(b.md) ? b.md.join("\n") : String(b.md)).split("\n")) {
    if (/^\s*\|/.test(line) || /^\s*\$\$\s*$/.test(line)) break;     // a table or a display block ends the title
    if (!line.trim()) { if (para.length) break; continue; }
    para.push(line.trim());
  }
  return sentences(plain(para.join(" ")));
}
/* too long: end at the last full sentence that fits, else cut at a word */
function sentences(s, n = MAX) {
  if (s.length <= n) return s;
  let end = -1;
  for (const m of s.matchAll(/[.?!](?=\s)/g)) { if (m.index >= n) break; end = m.index; }
  return end >= n / 3 ? s.slice(0, end + 1) : clip(s, n);
}

/* ---------- the nav ---------- */
/* a ?bank= link makes its bank this browser's live list (app.js stem-src, read on DOMContentLoaded, after this module ran); the query
   goes, so a later switch to another bank sticks on reload (the last bank is remembered: stem-src) */
if (typeof location !== "undefined" && deepBank(location.search)) {
  try { localStorage.setItem("stem-src", deepBank(location.search)); } catch { /* blocked: the default opens */ }
  const u = new URLSearchParams(location.search); u.delete("bank");
  history.replaceState(history.state, "", location.pathname + (String(u) ? "?" + u : "") + location.hash);
}
/* ?mock=1 (the night-before link, W103b): the front bank starts its mock once it is open (update); the query goes, so a reload resumes it */
let wantMock = false;
if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mock") === "1") {
  wantMock = true;
  const u = new URLSearchParams(location.search); u.delete("mock");
  history.replaceState(history.state, "", location.pathname + (String(u) ? "?" + u : "") + location.hash);
}
if (typeof document !== "undefined" && document.getElementById("qnav")) init();

function init() {
  const $ = s => document.querySelector(s);
  const root = document.documentElement;
  const nav = $("#qnav"), btn = $("#qlistBtn"), name = $("#qlistName"), panel = $("#qlist"), list = panel.querySelector("ol"), prev = $("#qprev"), next = $("#qnext");
  const modes = $("#qmodes"), mix = $("#qmix"), skip = $("#qskip"), mockBtn = $("#qmock");
  const bank = () => window.stemBank && window.stemBank.code ? window.stemBank : null;
  const off = () => bank() || window.stemOffline;                    // the live list: get(c), codes()
  const rd = () => window.stemRedo || null;                          // a Redeem showing's own grading namespace (app.js)
  let codes = [], cur = null;
  function mark(c) {                                                 // this browser's record first, else the bank's server mark
    const s = window.stemOffline, rec = s && s.doneGet ? s.doneGet(c) : null, b = bank();
    const m = rec || (b ? b.mark(c) : null);
    return b && rd() && rd().has(c) ? { ...m, again: true } : m;     // a re-showing: its old marks stay, faded, behind the history glyph (retry tag)
  }
  /* sugar snacks ride right before their real (design/REWARDS-WIRING.md); a bank problem carries .before, an upload saccharine.before */
  const beforeOf = c => { const p = off() && off().get(c); return !p ? null : p.before || (p.saccharine && p.saccharine.snack && p.saccharine.before) || null; };
  const snack = c => { const p = off() && off().get(c); return !!p && !!(p.snack || (p.saccharine && p.saccharine.snack)); };
  const dead = c => { const p = off() && off().get(c); return !!p && !!(p.dead || (p.saccharine && p.saccharine.dead)); };   // T28 dead-easy: a sugar warm-up, placed by shuffle.mjs deadOpen / deadLead
  const all = () => { const o = off(); return (o && o.codes ? o.codes() : []).filter(c => !(window.stemHidden && window.stemHidden(c))); };
  const pool = () => all().filter(c => !snack(c) && !dead(c));                 // the queue plays the reals; a snack rides in front of its real
  /* topic: the bank's topic / parent, else the sugar title's "Question N" (its variants A, B, C group: no near-repeats), else the code */
  const group = p => { const m = /^(.*?\bQuestion\s+\d+)\b/i.exec(String(p.title || (p.saccharine && p.saccharine.title) || "")); return m ? m[1] : null; };
  const topicOf = c => { const p = off() && off().get(c); return (p && (p.topic || p.parent || group(p))) || family(c); };
  /* noob mode (the front bank, until "Mix it up"): tier 0 = a dead-easy, else the author's noob.tier 1-3, untagged = 3 */
  const front = () => !!bank() && !!bank().front;
  const noob = () => front() && !Q().mix;
  const tierOf = c => { if (dead(c)) return 0; const p = off() && off().get(c), t = p && p.noob && p.noob.tier; return [1, 2, 3].includes(t) ? t : 3; };
  /* a returner (stem-noob-<bank>, set at the first answer; read once per page, so this visit's own opener plays out) skips the opener */
  const back = new Map();
  const returner = () => {
    const id = bank().code;
    if (!back.has(id)) { let v = false; try { v = !!localStorage.getItem("stem-noob-" + id); } catch { /* blocked */ } back.set(id, v); }
    return back.get(id);
  };
  const opener = deads => front() && returner() ? [] : deads;

  /* ---------- the queue: one per bank (D64), saved after every change; the first open migrates the saved marks ---------- */
  let q = null, qFor = "", pending = null;
  function Q() {
    const id = bank() ? bank().code : "upload";
    if (q && qFor === id) return q;
    qFor = id; pending = null;
    q = qLoad(id);
    if (!q) { q = qMigrate(qNew(Math.random().toString(36).slice(2)), pool(), mark); qSave(id, q); }
    return q;
  }
  const save = () => { if (q) qSave(qFor, q); };
  /* a Redeem showing (D60/D61 data flag): the item carries redeem; app.js grades it fresh in round r, so the old lockout stays */
  function use(e) {
    const R = rd(); if (!R) return;
    if (e.r) R.set(e.c, e.r, e.redeem); else R.clear();
  }
  function shown(code, fresh = false) {                              // a load: history, else a new showing (a pick, a list row, a typed code)
    const st = Q(), h = st.hist[st.at];
    if (!fresh && h && h.c === code) return;                         // a reload, Prev / Next through history: the same showing
    const e = pending && pending.c === code ? pending : { c: code, r: rd() && rd().has(code) ? rd().get().n : 0, redeem: false };
    pending = null;
    qShow(st, code);
    if (st.then === code) st.then = null;
    st.hist = st.hist.slice(0, st.at + 1).concat([{ c: e.c, r: e.r, redeem: !!e.redeem }]).slice(-80);
    st.at = st.hist.length - 1;
    save();
  }
  /* the next item: forward through history first, then a real waiting behind its snack, then the queue's pick */
  /* the nearest history item in direction d that is still in the list (an older upload's codes are skipped), or -1 */
  function hop(st, d) {
    const live = new Set(all());
    for (let i = st.at + d; i >= 0 && i < st.hist.length; i += d) if (live.has(st.hist[i].c)) return i;
    return -1;
  }
  function upNext() {
    const st = Q();
    const fw = hop(st, 1);
    if (fw >= 0) return { e: st.hist[fw], step: fw };
    if (st.mock && !st.mock.done) {                                    // the night-before mock (W103b): its list, then its misses (before the dead-easy opener)
      const m = mockNext(st.mock); save();
      if (m && m.end) note(`Night-before mock: ${m.score} / ${m.of}`);   // COPY-PENDING (W103b) the score line
      if (m && m.code) {
        const k = mark(m.code), back = st.mock.miss !== null, again = back || !!(st.seen[m.code] && st.seen[m.code].n) || !!(k && (k.x || k.done === "correct" || k.done === "out"));
        return { e: { c: m.code, r: again ? Math.floor(Date.now() / 1000) : 0, redeem: !!(st.seen[m.code] && st.seen[m.code].owe) } };   // a closed card plays a fresh round
      }
    }
    const deads = all().filter(dead), od = deadOpen(st, opener(deads));   // T28 P2: a fresh bank opens with 1-2 dead-easy
    if (od) return { e: { c: od, r: 0, redeem: false } };
    const live = new Set(pool());
    let code = null, redeem = false;
    if (st.then && live.has(st.then) && st.then !== cur) { code = st.then; redeem = !!(st.seen[code] && st.seen[code].owe); }
    else {
      const p = noob() ? ramp(st, [...live], tierOf) : qPick(st, [...live], topicOf);
      if (!p) return null;
      code = p.code; redeem = p.redeem;
    }
    const sn = all().find(c => snack(c) && beforeOf(c) === code && !st.seen[c]);   // a snack goes once, before its real's first showing
    if (sn && !(st.seen[code] && st.seen[code].n) && !(window.stemSkipSnack && window.stemSkipSnack())) {
      st.then = code;                                                 // T28 P1: at random a dead-easy first (not twice in a row: cur is then the dead-easy), the snack next
      return { e: { c: (!dead(cur) && deadLead(st, deads, sn)) || sn, r: 0, redeem: false } };
    }
    const again = !!(st.seen[code] && st.seen[code].n);           // any re-showing is a fresh round: never a closed card (rewards never pay twice)
    return { e: { c: code, r: again && code !== cur ? Math.floor(Date.now() / 1000) : 0, redeem } };
  }
  /* the first question of a bank or an upload (app.js openBank, offline.js first()): the queue's pick, but a fresh queue (nothing
     shown or saved yet) starts where the author starts, the first real question of the file */
  window.stemOrder = list => {
    const live = list.filter(c => !snack(c) && !dead(c) && !(window.stemHidden && window.stemHidden(c)));
    const st = Q(), fresh = st.pos === 0 && !Object.keys(st.seen).length;
    const od = deadOpen(st, opener(list.filter(c => dead(c) && !(window.stemHidden && window.stemHidden(c)))));   // T28 P2: a fresh queue starts on a dead-easy
    const p = od ? { code: od } : !live.length ? null : noob() ? ramp(st, live, tierOf) : fresh ? { code: live[0] } : qPick(st, live, topicOf);
    return p ? [p.code, ...list.filter(c => c !== p.code)] : list;
  };
  /* the list (a jump index, not the queue): file order, Q1, Q2, ... as the bank JSON lists them (a second upload joins after the
     first; Tony, Oct 20); snacks right above their real. Next still plays the hidden queue. */
  function rows0(cs) {
    return glue(cs, beforeOf);
  }

  function update(code) {
    cur = code;
    const o = off(), cs = all();
    codes = cs.length ? rows0(cs) : [];
    const on = codes.length > 0;
    const file = !bank() && on && o.fileName ? o.fileName(cur) || o.fileName(codes[0]) || "" : "";
    name.textContent = bank() ? (front() ? bank().front : bank().code) : "Questions";   // which bank you are in, at a glance (Tony, Oct 5; design/COPY-CTA.md); the front bank: its title only (Tony #4)
    modes.hidden = !front();                                         // Mix it up / Skip ahead / Other banks: the front bank's list only
    if (front()) { mix.textContent = Q().mix ? "Easy first" : "Mix it up"; skip.hidden = !!Q().mix; }
    mockBtn.hidden = !!(Q().mock && Q().mock.miss === null && !Q().mock.done);   // the mock is running: no restart
    btn.setAttribute("aria-label", "Question list");
    btn.title = bank() ? bank().code : file;                                // which bank or file: on hover, for Tony
    nav.hidden = !on;
    root.classList.toggle("qnav-on", on);
    if (!on) { close(false); return; }
    const st = Q(), focused = document.activeElement;
    const here = codes.includes(cur);                                // a server code typed after an upload: arrows off
    prev.disabled = !here || hop(st, -1) < 0;
    next.disabled = (!here && !bank()) || !pool().length;            // Next always works: the queue never runs dry, even from a code that is not in the bank (a direct link); after an upload a server code still turns the arrows off
    if (focused === prev || focused === next) {                      // never leave focus on a disabled arrow
      if (focused.disabled) (focused === prev ? next : prev).disabled ? btn.focus() : (focused === prev ? next : prev).focus();
    }
    /* one row = its number + one label, the whole title (owner, Oct 6) */
    list.innerHTML = codes.map((c, k) => {
      const t = titleOf(o.get(c)) || c, m = marks(mark(c));
      return `<li><a href="#${esc(c)}" title="${esc(t)}" aria-label="${k + 1}. ${esc(t)}.${m.say}"${m.gone ? ' class="gone"' : ""}${c === cur ? ' aria-current="true"' : ""}>` +
        `<span class="qn" aria-hidden="true">${k + 1}</span><span class="qt" aria-hidden="true">${esc(t)}</span>${m.html}</a></li>`;
    }).join("");
  }

  /* done marks (design/DONE.md, variant A): one X per wrong try, a tick for correct, at the row's right edge.
     Crossed out + greyed only when it can't be answered any more (correct, or out of tries); still a link. */
  const ico = (id, cls) => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  function marks(rec) {
    if (rec && rec.again) return { html: `<span class="mk mk-again" aria-hidden="true">${ico("i-back", "mk-back")}${ico("i-x", "mk-x").repeat(rec.x || 0)}</span>`, gone: false, say: " Back again." };
    if (!rec || (!rec.x && rec.done === "open")) return { html: "", gone: false, say: "" };
    const html = `<span class="mk" aria-hidden="true">${ico("i-x", "mk-x").repeat(rec.x || 0)}${rec.done === "correct" ? ico("i-ok", "mk-ok") : ""}</span>`;
    const say = rec.done === "correct" ? " Correct." : rec.done === "out" ? " No tries left." : " 1 wrong, 1 try left.";
    return { html, gone: rec.done !== "open", say };
  }

  const rows = () => [...list.querySelectorAll("a")];
  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    showList(true);
    const a = list.querySelector("[aria-current]") || rows()[0];
    if (!a) return;
    panel.scrollTop = Math.max(0, a.offsetTop - (panel.clientHeight - a.offsetHeight) / 2);
    a.focus({ preventScroll: true });
  }
  function close(back) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    showList(false);
    if (back) btn.focus();
  }
  /* the code box comes with the list (Tony, Oct 5 clutter pass C2 / C15): html.ql-open shows it (nav.css, app.css);
     app.js puts the phone's code bar up while it is open (drill:qlist) */
  function showList(on) {
    document.documentElement.classList.toggle("ql-open", on); dispatchEvent(new CustomEvent("drill:qlist", { detail: { open: on } }));
    if (on) fit();
  }
  /* phones (bar on top, code bar at the bottom): the list starts right under the nav row, over the XP strip, and runs down to the
     code bar's top edge (its pull-tab right under the list, no dead band), inside what the VISUAL viewport shows: the keyboard can
     come up for the code box and the list stays, shorter, scrolling inside itself. Desktop keeps nav.css (a dropdown under the bar). */
  const vv = window.visualViewport, dock = $(".dock");
  function fit() {
    if (panel.hidden) return;
    if (!root.classList.contains("dock-bottom") || root.classList.contains("start")) { panel.style.top = panel.style.maxHeight = ""; return; }
    const gap = 8, bar = panel.offsetParent ? panel.offsetParent.getBoundingClientRect().top : 0;
    const top = Math.max(nav.getBoundingClientRect().bottom, vv ? vv.offsetTop : 0) + gap;
    let bottom = vv ? vv.offsetTop + vv.height : innerHeight;
    if (dock && dock.getClientRects().length) bottom = Math.min(bottom, dock.getBoundingClientRect().top);
    bottom -= 44;                                                     // the privacy link's 44px under the list, off the code bar (its pull-tab is part of .dock)
    panel.style.top = Math.round(top - bar) + "px";
    panel.style.maxHeight = Math.max(96, Math.floor(bottom - top)) + "px";
    root.style.setProperty("--ql-bottom", Math.round(panel.getBoundingClientRect().bottom) + "px");   // the privacy link sits under the list (index.html, G3)
  }
  const refit = () => requestAnimationFrame(fit);                   // after app.js has moved the code bar onto the keyboard (layoutDock, --kb-bottom)
  if (vv) for (const ev of ["resize", "scroll"]) vv.addEventListener(ev, refit);
  addEventListener("resize", refit);
  function say(t) { const sr = $("#sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); }
  /* a press that cannot move says why (app.js drill:note: a toast under Next); never a silent return (T16) */
  const note = text => { dispatchEvent(new CustomEvent("drill:note", { detail: { text } })); say(text); };
  function go(d) {
    const st = Q();
    let e = null;
    if (d < 0) { const b = hop(st, -1); if (b < 0) { note("This is the first question you opened."); return; } st.at = b; e = st.hist[b]; save(); }
    else {
      const n = upNext(); if (!n) { note("No other question to open here."); return; }
      e = n.e;
      if (n.step != null) { st.at = n.step; save(); } else pending = e;
    }
    close(false);
    use(e);
    if (e.c === cur) {                                               // already on screen: a one-question list, the same code, a new showing
      if (d > 0 && pending) shown(e.c, true);
      update(cur); note("This is the only question here.");
      return;
    }
    if (location.hash === "#" + e.c) dispatchEvent(new HashChangeEvent("hashchange"));   // the hash is already there (that load failed or never ran): no event would come, so ask again
    else location.hash = e.c;                                        // app.js: hashchange -> load(c)
    say(titleOf(off().get(e.c)) || e.c);
  }

  btn.addEventListener("click", () => { if (panel.hidden) open(); else close(false); });
  document.getElementById("entry")?.addEventListener("submit", () => close(false));   // a code typed in the list's box: you picked, the list goes
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); open(); } });
  prev.addEventListener("click", () => go(-1));
  mix.addEventListener("click", () => { const st = Q(); st.mix = !st.mix; save(); update(cur); });   // the student switches the order (Tony #3)
  skip.addEventListener("click", () => { skipAhead(Q()); save(); go(1); });                           // strong starters: a tier up, and on
  $("#qbanks").addEventListener("click", () => $("#code").focus());   // the code box comes with the list: type a bank code there
  next.addEventListener("click", () => go(1));
  /* the night-before mock (W103b): the front bank's exam-order list (shuffle.mjs mockList), from its first question */
  let reload = null;                                                 // one same-code reload asked of app.js (stemMock.again)
  function startMock() {
    const st = Q(), o = off();
    st.mock = mockNew(mockList(pool().map(c => ({ code: c, ...o.get(c) })), st.salt));
    st.hist = st.hist.slice(0, st.at + 1); save();                   // Next plays the mock, not the history ahead
    if (st.mock.list[0] && st.mock.list[0] === cur) {                // already on X3 Q1: a fresh showing of it in place (go(1) would say "only question")
      const n = upNext(); use(n.e); pending = n.e; shown(cur, true);
      reload = cur; dispatchEvent(new HashChangeEvent("hashchange")); return;   // app.js fromHash reloads it (stemMock.again) in its fresh round
    }
    go(1);
  }
  mockBtn.addEventListener("click", startMock);
  list.addEventListener("click", e => { if (e.target.closest("a")) close(true); });   // the link itself navigates (#CODE)
  panel.addEventListener("keydown", e => {
    const r = rows(), i = r.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: r.length - 1 }[e.key];
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (to !== undefined && r.length) { e.preventDefault(); r[Math.max(0, Math.min(r.length - 1, to))].focus(); }
  });
  /* an outside tap closes it: the list floats over the page (Tony, Oct 6), so closing moves nothing under the pointer.
     Taps on its own bar row (the button, the code box) keep it open. Also: the button, Escape, a pick, Prev/Next. */
  document.addEventListener("pointerdown", e => {
    if (panel.hidden || e.target.closest("#qlist, #qlistBtn, #entry, .code-sug, #privacy")) return;   // #privacy: phones show it with the list (index.html, G3)
    close(false);
  });
  /* re-rank after every answer (D62): only the FIRST graded pick of a showing moves the queue; a retry is logged (shuffle.mjs) */
  addEventListener("drill:answer", e => {
    const d = e.detail || {};
    if (!d.code || d.code !== cur || !off()) return;
    const st = Q(), first = qAnswer(st, d.code, !!d.right, { spam: typeof d.ms === "number" && d.ms < SPAM_MS });   // a guess in under 2 s: logged, no weight
    mockAnswer(st.mock, d.code, !!d.right);
    if (first && noob()) rampAnswer(st, d.code, !!d.right, tierOf);   // the ramp's gate counts first picks only
    if (front()) try { localStorage.setItem("stem-noob-" + bank().code, "1"); } catch { /* blocked */ }
    save();
  });
  addEventListener("drill:problem", e => { const c = e.detail && e.detail.code; if (c && all().includes(c)) shown(c); update(c);
    if (wantMock && front()) { wantMock = false; setTimeout(startMock); } });   // ?mock=1: once the first question has opened, so app.js's first load never overwrites the mock's hash
  addEventListener("drill:marks", () => { if (!nav.hidden) update(cur); });   // offline.js: a mark changed (the list ticks)
  addEventListener("drill:bank", () => update(cur));                         // a bank opened or left (app.js)
  const s = window.__drill && window.__drill.state;                   // a problem loaded before this module ran
  if (s) { if (all().includes(s.code)) shown(s.code); update(s.code); }
  window.stemMock = { on: () => !!cur && mockOn(Q().mock, cur), state: () => Q().mock || null, again: c => { const y = reload === c; reload = null; return y; } };   // app.js / peek.js / repair.js: the mock phase holds the hints
  window.stemQueue = { item: () => { const st = Q(); return st.hist[st.at] || null; }, state: () => Q(), mode: () => noob() ? "noob" : "mix" };   // tests + the Redeem chip later
}
