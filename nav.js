/* nav.js: Prev / Next and the questions list (design/NAV.md).
   The list: the open practice bank (window.stemBank, design/BANK.md), else an uploaded problems.json
   (window.stemOffline.codes()), shuffled by a seed kept in this browser (stable across reloads; the shuffle button draws a
   new one), so a topic can't be guessed from its position. Neither: no list (codes are the gate), so the nav stays hidden.
   The list button's text is the bank code; for an upload, the file name (".json" dimmed, hidden on phones).
   Hook: app.js fires "drill:problem" { code } after every load. Navigation goes through location.hash, which app.js follows. */
import { shuffled, seed, newSeed } from "./shuffle.mjs";
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
  const bank = () => window.stemBank && window.stemBank.code ? window.stemBank : null;
  const off = () => bank() || window.stemOffline;                    // the live list: get(c), codes()
  let codes = [], cur = null;
  function mark(c) {                                                 // this browser's record first, else the bank's server mark
    const s = window.stemOffline, rec = s && s.doneGet ? s.doneGet(c) : null, b = bank();
    return rec || (b ? b.mark(c) : null);
  }

  function update(code) {
    cur = code;
    const o = off();
    codes = o && o.codes ? order(o.codes()) : [];
    const on = codes.length > 0;
    const file = !bank() && on && o.fileName ? o.fileName(cur) || o.fileName(codes[0]) || "" : "";
    const label = bank() ? bank().code : file.replace(/\.json$/i, "");
    name.innerHTML = esc(label) + (file.length > label.length ? `<span class="ext">${esc(file.slice(label.length))}</span>` : "");
    btn.setAttribute("aria-label", label ? `${label} questions list` : "Questions list");
    nav.hidden = !on;
    root.classList.toggle("qnav-on", on);
    if (!on) { close(false); return; }
    const i = codes.indexOf(cur), focused = document.activeElement;
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= codes.length - 1;
    if (focused === prev || focused === next) {                      // never leave focus on a disabled arrow
      if (focused.disabled) (focused === prev ? next : prev).disabled ? btn.focus() : (focused === prev ? next : prev).focus();
    }
    list.innerHTML = codes.map((c, k) => {
      const t = titleOf(o.get(c)) || c, m = marks(mark(c));
      return `<li><a href="#${esc(c)}" aria-label="${k + 1}. ${esc(t)}.${m.say}"${m.gone ? ' class="gone"' : ""}${c === cur ? ' aria-current="true"' : ""}>` +
        `<span class="qn" aria-hidden="true">${k + 1}</span><span class="qt" aria-hidden="true">${esc(t)}</span>${m.html}</a></li>`;
    }).join("");
  }

  /* done marks (design/DONE.md, variant A): one X per wrong try, a tick for correct, at the row's right edge.
     Crossed out + greyed only when it can't be answered any more (correct, or out of tries); still a link. */
  const ico = (id, cls) => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  function marks(rec) {
    if (!rec || (!rec.x && rec.done === "open")) return { html: "", gone: false, say: "" };
    const html = `<span class="mk" aria-hidden="true">${ico("i-x", "mk-x").repeat(rec.x || 0)}${rec.done === "correct" ? ico("i-ok", "mk-ok") : ""}</span>`;
    const say = rec.done === "correct" ? " Correct." : rec.done === "out" ? " Out of tries." : " One wrong try, one left.";
    return { html, gone: rec.done !== "open", say };
  }

  /* the order everyone reads: list, numbers, Prev/Next, [ ], and the first problem after an upload (offline.js) */
  const order = all => shuffled(all, seed(ORDER, ""));
  window.stemOrder = all => order(all);
  shuf.addEventListener("click", () => {
    newSeed(ORDER);
    update(cur);
    panel.scrollTop = 0;
    const i = codes.indexOf(cur);
    say(`Shuffled. This is ${i + 1} of ${codes.length}.`);
  });

  const rows = () => [...list.querySelectorAll("a")];
  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const a = list.querySelector("[aria-current]") || rows()[0];
    if (!a) return;
    panel.scrollTop = Math.max(0, a.offsetTop - (panel.clientHeight - a.offsetHeight) / 2);
    a.focus({ preventScroll: true });
  }
  function close(back) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (back) btn.focus();
  }
  function say(t) { const sr = $("#sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); }
  function go(d) {
    const i = codes.indexOf(cur), c = codes[i + d];
    if (i < 0 || !c) return;
    close(false);
    location.hash = c;                                               // app.js: hashchange -> load(c)
    say(`${i + d + 1} of ${codes.length}. ${titleOf(off().get(c))}`);
  }

  btn.addEventListener("click", () => { if (panel.hidden) open(); else close(false); });
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
  /* [ and ]: previous / next. Not while typing, not over the file picker dialog, not with Ctrl/Cmd (AltGr layouts still work) */
  document.addEventListener("keydown", e => {
    if ((e.key !== "[" && e.key !== "]") || nav.hidden || e.defaultPrevented) return;
    if (e.metaKey || (e.ctrlKey && !(e.getModifierState && e.getModifierState("AltGraph")))) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector(".so:not([hidden])")) return;
    e.preventDefault();
    go(e.key === "]" ? 1 : -1);
  });
  addEventListener("drill:problem", e => update(e.detail && e.detail.code));
  addEventListener("drill:state", () => { if (!nav.hidden) update(cur); });     // a graded try (offline.js donePut)
  addEventListener("drill:bank", () => update(cur));                             // a bank opened or left (app.js)
  const s = window.__drill && window.__drill.state;                   // a problem loaded before this module ran
  if (s) update(s.code);
}
