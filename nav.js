/* nav.js: Prev / Next and the questions list (design/NAV.md).
   The list: the open practice bank (window.stemBank, design/BANK.md), else an uploaded problems.json
   (window.stemOffline.codes()), shuffled by a seed kept in this browser (stable across reloads; the shuffle button draws a
   new one), so a topic can't be guessed from its position. Neither: no list (codes are the gate), so the nav stays hidden.
   The list button says "Questions" (a bank code or file name means nothing to a student; design/COPY-CTA.md).
   Hook: app.js fires "drill:problem" { code } after every load. Navigation goes through location.hash, which app.js follows. */
import { shuffled, seed, newSeed, mastery, glue } from "./shuffle.mjs";
const MAX = 60;
const ORDER = "stem-order";
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
/* the part before the first ": " of a title ("Force graph 2: work" -> "Force graph 2"), or "" */
export function head(t) { const i = t.indexOf(": "); return i > 0 ? t.slice(0, i) : ""; }
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
  const nav = $("#qnav"), btn = $("#qlistBtn"), name = $("#qlistName"), shuf = $("#qshuf"), panel = $("#qlist"), list = panel.querySelector("ol"), prev = $("#qprev"), next = $("#qnext");
  const redoBtn = $("#qredo"), redoTx = $("#qredoTx");
  const redo = () => window.stemRedo && bank() ? window.stemRedo.get() : null;   // a "Redo my misses" round (app.js)
  const bank = () => window.stemBank && window.stemBank.code ? window.stemBank : null;
  const off = () => bank() || window.stemOffline;                    // the live list: get(c), codes()
  let codes = [], cur = null, setKey = "", doneSaid = false;
  function mark(c) {                                                 // this browser's record first, else the bank's server mark
    const s = window.stemOffline, rec = s && s.doneGet ? s.doneGet(c) : null, b = bank();
    return rec || (b && !(window.stemRedo && window.stemRedo.has(c)) ? b.mark(c) : null);   // a redo round starts blank
  }

  /* resort: compute the order again (a graded try, a bank, a shuffle). Opening a problem keeps the order as it is, so Prev / Next walk
     a list that holds still (re-sorting on every open would bounce Next between two open questions) */
  function update(code, resort = true) {
    cur = code;
    const o = off(), all = (o && o.codes ? o.codes() : []).filter(c => !(window.stemHidden && window.stemHidden(c))), key = [...all].sort().join(" ");
    if (resort || key !== setKey) codes = all.length ? order(all) : [];
    setKey = key;
    const on = codes.length > 0;
    const file = !bank() && on && o.fileName ? o.fileName(cur) || o.fileName(codes[0]) || "" : "";
    const r = redo(), ok = r ? codes.filter(c => (mark(c) || {}).done === "correct").length : 0;
    const shut = r ? codes.filter(c => mark(c) && mark(c).done !== "open").length : 0;
    name.textContent = r ? (shut === codes.length ? "Redo done" : "Redo") : bank() ? bank().code : "Questions";   // which bank you are in, at a glance (Tony, Oct 5; was "Questions": design/COPY-CTA.md)
    redoBtn.hidden = !bank();
    redoTx.textContent = r ? "Exit redo" : "Redo misses";                   // no counters in the bar (STYLE.md §3): the list ticks show progress
    redoBtn.setAttribute("aria-label", r ? "Exit redo" : "Redo missed questions");   // phones show the icon only
    root.classList.toggle("redo-on", !!r);
    if (r && on && shut === codes.length && !doneSaid) { doneSaid = true; say(`Redo done. ${ok} of ${codes.length} cleared.`); }
    if (!r || shut < codes.length) doneSaid = false;
    btn.setAttribute("aria-label", "Question list");
    btn.title = bank() ? bank().code : file;                                // which bank or file: on hover, for Tony
    nav.hidden = !on;
    root.classList.toggle("qnav-on", on);
    if (!on) { close(false); return; }
    const i = codes.indexOf(cur), focused = document.activeElement;
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= codes.length - 1;
    if (focused === prev || focused === next) {                      // never leave focus on a disabled arrow
      if (focused.disabled) (focused === prev ? next : prev).disabled ? btn.focus() : (focused === prev ? next : prev).focus();
    }
    /* C14 (Tony, Oct 5): neighbours that share a title prefix ("Force graph 2: work", "Force graph 2: power") sit under one header,
       each row shows the rest. The header is for the eye; the link's label keeps the full title */
    const ts = codes.map(c => titleOf(o.get(c)) || c), hs = ts.map(head);
    list.innerHTML = codes.map((c, k) => {
      const t = ts[k], h = hs[k], m = marks(mark(c)), grouped = h && (hs[k - 1] === h || hs[k + 1] === h);
      return (grouped && hs[k - 1] !== h ? `<li class="qh" aria-hidden="true">${esc(h)}</li>` : "") +
        `<li><a href="#${esc(c)}" title="${esc(t)}" aria-label="${k + 1}. ${esc(t)}.${m.say}"${m.gone ? ' class="gone"' : ""}${c === cur ? ' aria-current="true"' : ""}>` +
        `<span class="qn" aria-hidden="true">${k + 1}</span><span class="qt" aria-hidden="true">${esc(grouped ? t.slice(h.length + 2) : t)}</span>${m.html}</a></li>`;
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

  /* the order everyone reads: list, numbers, Prev/Next, [ ], and the first problem after an upload (offline.js).
     Seeded shuffle, then mastery (design/NAV.md "Mastery order"): answered first, the open one, then the families with the most
     wrong tries. Silent: it re-sorts on a bank change, the shuffle button, and the first open after a mark changed (drill:marks). */
  /* sugar snacks ride right before their real (glue, design/REWARDS-WIRING.md); a bank problem carries .before, an upload saccharine.before */
  const beforeOf = c => { const p = off() && off().get(c); return !p ? null : p.before || (p.saccharine && p.saccharine.snack && p.saccharine.before) || null; };
  const snack = c => { const p = off() && off().get(c); return !!p && !!(p.snack || (p.saccharine && p.saccharine.snack)); };
  const order = all => {
    const r = redo();                                                // a redo round: only its codes, its own shuffle, no snack glue
    return r ? shuffled(all.filter(c => r.codes.includes(c)), "redo" + r.n) : glue(mastery(shuffled(all, seed(ORDER, "")), mark, cur), beforeOf);
  };
  window.stemOrder = all => order(all);
  shuf.addEventListener("click", () => {
    newSeed(ORDER);
    update(cur);
    panel.scrollTop = 0;
    const i = codes.indexOf(cur);
    say(`Shuffled. This is ${i + 1} of ${codes.length}.`);
  });

  /* Redo my misses: the questions with a wrong try (a miss, even one fixed on try 2), read before the round starts */
  let redoT = 0;
  redoBtn.addEventListener("click", () => {
    if (redo()) { window.stemRedo.exit(); say("Back to all questions."); return; }
    const missed = codes.filter(c => ((mark(c) || {}).x || 0) > 0);
    if (!missed.length) {
      redoTx.textContent = "No misses yet"; clearTimeout(redoT);
      redoT = setTimeout(() => { if (!redo()) redoTx.textContent = "Redo misses"; }, 1600);
      say("No misses yet."); return;
    }
    close(false);
    if (window.stemRedo.start(missed)) say(`Redo: ${missed.length} missed question${missed.length > 1 ? "s" : ""}, shuffled.`);
  });

  const rows = () => [...list.querySelectorAll("a")];
  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    shown(true);
    const a = list.querySelector("[aria-current]") || rows()[0];
    if (!a) return;
    panel.scrollTop = Math.max(0, a.offsetTop - (panel.clientHeight - a.offsetHeight) / 2);
    a.focus({ preventScroll: true });
  }
  function close(back) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    shown(false);
    if (back) btn.focus();
  }
  /* the code box and Shuffle come with the list (Tony, Oct 5 clutter pass C2 / C15): html.ql-open shows them (nav.css, app.css);
     app.js puts the phone's code bar up while it is open (drill:qlist) */
  function shown(on) { document.documentElement.classList.toggle("ql-open", on); dispatchEvent(new CustomEvent("drill:qlist", { detail: { open: on } })); }
  function say(t) { const sr = $("#sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); }
  function go(d) {
    const i = codes.indexOf(cur);
    let k = i + d;
    /* Next steps over a snack while the student is cruising (last 10 first tries > 90% right: the rewards decide, app.js) */
    while (d > 0 && !redo() && codes[k + 1] && snack(codes[k]) && window.stemSkipSnack && window.stemSkipSnack()) k++;
    const c = codes[k];
    if (i < 0 || !c) return;
    d = k - i;
    close(false);
    location.hash = c;                                               // app.js: hashchange -> load(c)
    say(`${i + d + 1} of ${codes.length}. ${titleOf(off().get(c))}`);
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
  /* no close on an outside click: the list is in the flow, so closing on pointerdown would move the page under the
     pointer and the click could land on something else (an MC choice). It closes on the button, Escape, a pick, Prev/Next. */
  /* the order is a snapshot: it changes on a bank, a shuffle, or the first open after a mark changed (Tony, Oct 3: never
     under your thumb while you are on a question). The re-sort runs inside the open's own update, so Prev never flickers. */
  let dirty = false;
  addEventListener("drill:problem", e => { update(e.detail && e.detail.code, dirty); dirty = false; });
  addEventListener("drill:marks", () => { dirty = true; if (!nav.hidden) update(cur, false); });   // offline.js: a mark changed
  addEventListener("drill:bank", () => { dirty = false; update(cur); });                          // a bank opened or left (app.js)
  const s = window.__drill && window.__drill.state;                   // a problem loaded before this module ran
  if (s) update(s.code);
}
