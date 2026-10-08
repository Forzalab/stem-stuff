/* nav.js: Prev / Next and the questions list (design/NAV.md).
   The list: the open practice bank (window.stemBank, design/BANK.md), else an uploaded problems.json
   (window.stemOffline.codes()). Neither: no list (codes are the gate), so the nav stays hidden.
   Next plays a hidden queue (shuffle.mjs qPick, design/plans/QUEUE.md): fresh topics first, a miss back after 3 / 8 / 20 others,
   one queue per bank in localStorage stem-q-<bank>. Prev / Next first walk the questions already shown (history). No queue UI (D57).
   The list button says the bank code. Hooks: app.js fires "drill:problem" { code } after every load and "drill:answer"
   { code, right } after every graded pick. Navigation goes through location.hash, which app.js follows. */
import { glue, family, qNew, qPick, qShow, qAnswer, qMigrate, qLoad, qSave, qRest } from "./shuffle.mjs";
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
if (typeof document !== "undefined" && document.getElementById("qnav")) init();

function init() {
  const $ = s => document.querySelector(s);
  const root = document.documentElement;
  const nav = $("#qnav"), btn = $("#qlistBtn"), name = $("#qlistName"), panel = $("#qlist"), list = panel.querySelector("ol"), prev = $("#qprev"), next = $("#qnext");
  const bank = () => window.stemBank && window.stemBank.code ? window.stemBank : null;
  const off = () => bank() || window.stemOffline;                    // the live list: get(c), codes()
  const rd = () => window.stemRedo || null;                          // a Redeem showing's own grading namespace (app.js)
  let codes = [], cur = null;
  function mark(c) {                                                 // this browser's record first, else the bank's server mark
    const s = window.stemOffline, rec = s && s.doneGet ? s.doneGet(c) : null, b = bank();
    return rec || (b && !(rd() && rd().has(c)) ? b.mark(c) : null);   // a Redeem showing starts blank
  }
  /* sugar snacks ride right before their real (design/REWARDS-WIRING.md); a bank problem carries .before, an upload saccharine.before */
  const beforeOf = c => { const p = off() && off().get(c); return !p ? null : p.before || (p.saccharine && p.saccharine.snack && p.saccharine.before) || null; };
  const snack = c => { const p = off() && off().get(c); return !!p && !!(p.snack || (p.saccharine && p.saccharine.snack)); };
  const all = () => { const o = off(); return (o && o.codes ? o.codes() : []).filter(c => !(window.stemHidden && window.stemHidden(c))); };
  const pool = () => all().filter(c => !snack(c));                   // the queue plays the reals; a snack rides in front of its real
  /* topic: the bank's topic / parent, else the sugar title's "Question N" (its variants A, B, C group: no near-repeats), else the code */
  const group = p => { const m = /^(.*?\bQuestion\s+\d+)\b/i.exec(String(p.title || (p.saccharine && p.saccharine.title) || "")); return m ? m[1] : null; };
  const topicOf = c => { const p = off() && off().get(c); return (p && (p.topic || p.parent || group(p))) || family(c); };

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
    const live = new Set(pool());
    let code = null, redeem = false;
    if (st.then && live.has(st.then) && st.then !== cur) { code = st.then; redeem = !!(st.seen[code] && st.seen[code].owe); }
    else {
      const p = qPick(st, [...live], topicOf);
      if (!p) return null;
      code = p.code; redeem = p.redeem;
      const sn = all().find(c => snack(c) && beforeOf(c) === code && !st.seen[c]);   // a snack goes once, before its real's first showing
      if (sn && !(st.seen[code] && st.seen[code].n) && !(window.stemSkipSnack && window.stemSkipSnack())) { st.then = code; return { e: { c: sn, r: 0, redeem: false } }; }
    }
    const again = !!(st.seen[code] && st.seen[code].n);           // any re-showing is a fresh round: never a closed card (rewards never pay twice)
    return { e: { c: code, r: again && code !== cur ? Math.floor(Date.now() / 1000) : 0, redeem } };
  }
  /* the first question of a bank or an upload (app.js openBank, offline.js first()): the queue's pick, but a fresh queue (nothing
     shown or saved yet) starts where the author starts, the first real question of the file */
  window.stemOrder = list => {
    const live = list.filter(c => !snack(c) && !(window.stemHidden && window.stemHidden(c)));
    const st = Q(), fresh = st.pos === 0 && !Object.keys(st.seen).length;
    const p = !live.length ? null : fresh ? { code: live[0] } : qPick(st, live, topicOf);
    return p ? [p.code, ...list.filter(c => c !== p.code)] : list;
  };
  /* the list (a jump index, not the queue): one fixed per-bank order that never moves under you (salted, so a row's position
     can't give its topic away); snacks right above their real */
  function rows0(cs) {
    return glue(qRest(Q(), cs), beforeOf);
  }

  function update(code) {
    cur = code;
    const o = off(), cs = all();
    codes = cs.length ? rows0(cs) : [];
    const on = codes.length > 0;
    const file = !bank() && on && o.fileName ? o.fileName(cur) || o.fileName(codes[0]) || "" : "";
    name.textContent = bank() ? bank().code : "Questions";             // which bank you are in, at a glance (Tony, Oct 5; design/COPY-CTA.md)
    btn.setAttribute("aria-label", "Question list");
    btn.title = bank() ? bank().code : file;                                // which bank or file: on hover, for Tony
    nav.hidden = !on;
    root.classList.toggle("qnav-on", on);
    if (!on) { close(false); return; }
    const st = Q(), focused = document.activeElement;
    const here = codes.includes(cur);                                // a server code typed after an upload: arrows off
    prev.disabled = !here || hop(st, -1) < 0;
    next.disabled = !here || !pool().length;                        // Next always works: the queue never runs dry
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
    if (on) document.documentElement.style.setProperty("--ql-bottom", Math.round(panel.getBoundingClientRect().bottom) + "px");   // phones: the privacy link sits under the list (index.html, G3)
  }
  function say(t) { const sr = $("#sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); }
  function go(d) {
    const st = Q();
    let e = null;
    if (d < 0) { const b = hop(st, -1); if (b < 0) return; st.at = b; e = st.hist[b]; save(); }
    else {
      const n = upNext(); if (!n) return;
      e = n.e;
      if (n.step != null) { st.at = n.step; save(); } else pending = e;
    }
    close(false);
    use(e);
    if (e.c === cur && d > 0 && pending) { shown(e.c, true); update(cur); }   // a one-question bank: the same code, a new showing
    else location.hash = e.c;                                        // app.js: hashchange -> load(c)
    say(titleOf(off().get(e.c)) || e.c);
  }

  btn.addEventListener("click", () => { if (panel.hidden) open(); else close(false); });
  document.getElementById("entry")?.addEventListener("submit", () => close(false));   // a code typed in the list's box: you picked, the list goes
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); open(); } });
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
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
    qAnswer(Q(), d.code, !!d.right, { spam: typeof d.ms === "number" && d.ms < SPAM_MS }); save();   // a guess in under 2 s: logged, no weight
  });
  addEventListener("drill:problem", e => { const c = e.detail && e.detail.code; if (c && all().includes(c)) shown(c); update(c); });
  addEventListener("drill:marks", () => { if (!nav.hidden) update(cur); });   // offline.js: a mark changed (the list ticks)
  addEventListener("drill:bank", () => update(cur));                         // a bank opened or left (app.js)
  const s = window.__drill && window.__drill.state;                   // a problem loaded before this module ran
  if (s) { if (all().includes(s.code)) shown(s.code); update(s.code); }
  window.stemQueue = { item: () => { const st = Q(); return st.hist[st.at] || null; }, state: () => Q() };   // tests + the Redeem chip later
}
