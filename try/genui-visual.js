/* try/genui-visual.js — round 1 mock (agent V). One question (PHYS_KWV), five variants, every toggle in the URL.
   Data = tests/visual-cases/kwv-*-good.json + SCHEMA-V2 E1/E3/E5/E10 (grid squares: x 0–8, F 0–4, 1 square = 2.5 J). */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const qs = new URLSearchParams(location.search);
const one = (k, ok, d) => (ok.includes(qs.get(k)) ? qs.get(k) : d);

const VARS = {
  A: { home: "part", predict: "pick", demo: true, name: "A · partial sheet + live figure · pick = prediction · warm-up" },
  B: { home: "full", predict: "pick", demo: true, name: "B · figure copy in a full sheet · pick = prediction · warm-up" },
  C: { home: "sticky", predict: "chips", demo: false, name: "C · sticky figure · gut-call chips first" },
  D: { home: "card", predict: "drag", demo: false, name: "D · chat card · drag your guess first" },
  E: { home: "part", predict: "pick", demo: false, name: "E · partial sheet + live figure · pick = prediction · no warm-up" }
};
const T = {
  v: one("v", Object.keys(VARS), "A"), t: one("t", ["short", "inter"], "short"), pick: one("pick", ["a", "b", "c", "d", "e"], ""),
  lvl: +one("lvl", ["1", "2", "3"], "1"), try2: qs.get("try") === "2", last: qs.get("last") === "1", tellme: qs.get("tellme") === "1",
  mech: qs.get("slip") === "mech", rm: qs.get("rm") === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches, sure: qs.get("sure") === "1"
};
const V = VARS[T.v];
const root = document.documentElement;
root.classList.add("v-" + T.v, V.home === "part" ? "home-part" : V.home === "full" ? "home-full" : V.home === "card" ? "home-card" : "home-sticky");
if (T.rm) root.classList.add("rm");

/* ---------- the question (bank PHYS_KWV; force line in c1 per DESIGN-LANGUAGE: forces are c1) ---------- */
const BASE = { type: "graph", kind: "cartesian", grid: true, axes: true, alt: "Force versus x",
  x: { min: -0.5, max: 8.8, step: 1, ticks: [{ at: 0, label: "0" }] }, y: { min: -1, max: 5, step: 1 },
  marks: [{ mark: "seg", from: [0, 4], to: [4, 4], color: "c1" }, { mark: "seg", from: [4, 4], to: [8, 0], color: "c1" },
    { mark: "point", at: [0, 4], label: "A", anchor: "n" }, { mark: "point", at: [4, 4], label: "B", anchor: "n" }, { mark: "point", at: [8, 0], label: "C", anchor: "se" }] };
const CHOICES = [["a", "40.0"], ["b", "20.0"], ["c", "60.0"], ["d", "80.0"], ["e", "24.0"]];
const KEY = "c", KIND = { a: "concept", b: "concept", d: "concept", e: "mechanical" };
const RECT = [[0, 0], [0, 4], [4, 4], [4, 0]], TRI = [[4, 0], [4, 4], [8, 0]];
const GHOST = { d: [[0, 0], [0, 4], [8, 4], [8, 0]], a: RECT, b: TRI };   // kwv-d/a/b-good.json: 32 / 16 / 8 squares
const GVAL = { d: 80, a: 40, b: 20, e: 24 };
const F = x => (x <= 4 ? 4 : Math.max(0, 4 - (x - 4)));
const sqUnder = (a, b) => { let s = 0; const n = 400; for (let i = 0; i < n; i++) { const x = a + (b - a) * (i + 0.5) / n; s += F(x); } return s * (b - a) / n; };

/* Cluck copy (FABLE-1 C7 rules: line 1 = wise feedback / normalize, ≤2 lines, no math, no joke, no QUACK; value only at L3; end on a choice) */
const LINE = {
  d: { l1: "Tricky one. Your 80 J (dashed) counts the slope as a full box.", l1b: "Your rectangle is right. A triangle is half its box.",
       l2: "Grab the corner and pull it down onto the line. Watch your box shrink.", h: "apex" },
  a: { l1: "Tricky one. Your 40 J (dashed) stops at B.", l1b: "Your rectangle is right. The trip runs all the way to C.",
       l2: "Grab the line at B and slide it to C. Watch the work keep growing.", h: "sweepR" },
  b: { l1: "This one trips lots of people. Your 20 J (dashed) starts at B.", l1b: "Your triangle is right. The trip starts back at A.",
       l2: "Grab the line at B and slide it back to A. Watch the work grow.", h: "sweepL" }
};
const SECOND = { d: "a", a: "d", b: "d" };
const LINE2 = { a: "Your 40 J is the rectangle alone. The solid shape keeps going to C.", d: "Your 80 J adds a full box past B. The solid part past B is half of that." };
const L3LINE = "This one trips most people: the triangle is half its box. Here is the whole thing.";
const TEX_L2 = "W = \\underbrace{4\\cdot 4}_{\\text{box}} + \\underbrace{\\frac12\\cdot 4\\cdot 4}_{\\text{half a box}}\\ \\text{squares}";
const TEX_L3 = "\\begin{aligned} W &= \\Big(4\\cdot 4 + \\frac12\\cdot 4\\cdot 4\\Big)\\ \\text{squares} \\\\ &= 24 \\times 2.5\\ \\text{J} = 60\\ \\text{J} \\end{aligned}";

/* ---------- state ---------- */
const S = { sel: "", picks: [], tries: 3, lvl: 1, done: false, right: false, touched: false, viewAt: 0, bet: null, pts: 12,
  h: 4, t: 4, s: 4, pred: "", predY: 2, demo: V.demo, skips: 0 };
try { S.skips = +(localStorage.getItem("stem-tellme-skips") || 0); } catch {}
let PREF = T.tellme;
try { if (!T.tellme && localStorage.getItem("stem-tellme") === "1") PREF = true; } catch {}

/* ---------- telemetry preview (names: RUNTIME §6 + TELEMETRY.md; T-ev owns the real wiring) ---------- */
const EV = [];
let BOOT = 1;   // replaying URL state: no smooth scroll
function emit(name, p = {}) {
  const e = { ev: name, code: "PHYS_KWV", v: T.v, home: V.home, layout: T.t, ...p, ms: Math.round(performance.now()) };
  EV.push(e); const li = document.createElement("li"); li.textContent = JSON.stringify(e); $("#ev").appendChild(li); code();
}

/* ---------- figure: graph.js base + an overlay on its own world->px map ---------- */
const NS = "http://www.w3.org/2000/svg";
const P = pts => pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
function figState(kind) {   // what one figure shows right now
  if (kind === "q" && (V.home === "full" || V.home === "card") && !S.right) return { ghosts: [], truth: S.lvl >= 3 && S.done, lvl: S.lvl, handle: "", demo: S.demo && !S.picks.length, drag: V.predict === "drag" && !S.picks.length && !S.done };
  const ghosts = kind === "affirm" ? [] : S.picks.filter(p => GHOST[p]).slice(-2);
  return { ghosts, truth: ghosts.length > 0 || kind === "affirm" || S.lvl >= 3, lvl: S.lvl, handle: S.lvl === 2 && ghosts.length ? LINE[ghosts[ghosts.length - 1]].h : "",
    demo: S.demo && !S.picks.length, drag: V.predict === "drag" && !S.picks.length && !S.done };
}
function draw(el, kind = "q") {
  if (!el.clientWidth) return;
  el._g = null; Graph.render(el, BASE); el._kind = kind; overlay(el);
}
function overlay(el) {
  el.querySelectorAll(".ov, .glbl").forEach(n => n.remove());
  const X = el._X; if (!X) return;
  const st = figState(el._kind), W = el.clientWidth, H = el.clientHeight;
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "ov"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("aria-hidden", "true");
  let s = "";
  const poly = (pts, st2) => `<polygon points="${P(pts.map(X))}" ${st2}/>`;
  if (st.demo) s += `<g data-role="demo">${poly([[0, 0], [0, 1], [1, 1], [1, 0]], `fill="var(--mark)" fill-opacity="0.18" stroke="var(--mark)" stroke-width="2"`)}</g>`;
  if (st.truth) s += `<g data-role="truth">${poly(RECT, `fill="var(--c1)" fill-opacity="0.22" stroke="var(--c1)" stroke-width="2"`)}${poly(TRI, `fill="var(--c1)" fill-opacity="0.22" stroke="var(--c1)" stroke-width="2"`)}</g>`;
  let hp = null, read = null;
  if (st.handle === "apex") {
    const live = [[0, 0], [0, 4], [4, 4], [8, S.h], [8, 0]];
    const e1 = [[4, 4], [8, S.h], [8, 0]].map(X);
    s += `<g data-role="handle">${poly(live, `fill="var(--mark)" fill-opacity="0.12" stroke="none"`)}<polyline points="${P(e1)}" fill="none" stroke="var(--mark)" stroke-width="2.5"/></g>`;
    hp = X([8, S.h]); read = { at: X([6.4, 0.9]), v: Math.round(60 + 5 * S.h) };
  } else if (st.handle === "sweepR" || st.handle === "sweepL") {
    const a = st.handle === "sweepR" ? 0 : S.s, b = st.handle === "sweepR" ? S.t : 8, xs = [];
    for (let i = 0; i <= 40; i++) { const x = a + (b - a) * i / 40; xs.push([x, F(x)]); }
    s += `<g data-role="handle">${poly([[a, 0], ...xs, [b, 0]], `fill="var(--mark)" fill-opacity="0.12" stroke="var(--mark)" stroke-width="2.5"`)}`;
    const e = st.handle === "sweepR" ? S.t : S.s; s += `<line x1="${X([e, 0])[0]}" y1="${X([e, 0])[1]}" x2="${X([e, 4.6])[0]}" y2="${X([e, 4.6])[1]}" stroke="var(--mark)" stroke-width="1.5" stroke-dasharray="2 4"/></g>`;
    hp = X([e, 0]); read = { at: X([e, 4.9]), v: Math.round(2.5 * sqUnder(a, b)) };
  } else if (st.drag) {
    const live = [[0, 0], [0, 4], [4, 4], [8, S.predY], [8, 0]];
    s += `<g data-role="predict">${poly(live, `fill="var(--mark)" fill-opacity="0.08" stroke="var(--mark)" stroke-width="2"`)}</g>`;
    hp = X([8, S.predY]);
  }
  st.ghosts.forEach(g => { s += `<g data-role="ghost" data-pick="${g}">${poly(GHOST[g], `fill="var(--muted)" fill-opacity="0.06" stroke="var(--muted)" stroke-width="2" stroke-dasharray="8 5"`)}</g>`; });
  if (hp) s += `<circle cx="${hp[0]}" cy="${hp[1]}" r="11" fill="var(--mark)" stroke="var(--paper)" stroke-width="3"/><circle class="hit" data-hit="1" cx="${hp[0]}" cy="${hp[1]}" r="26" fill="transparent"/>`;
  svg.innerHTML = s; el.appendChild(svg);
  const pill = (txt, at, cls, anchor = "c") => {
    const sp = document.createElement("span"); sp.className = "glbl " + cls; sp.textContent = txt; sp.setAttribute("aria-hidden", "true"); el.appendChild(sp);
    const w = sp.offsetWidth, h = sp.offsetHeight; let x = at[0] - w / 2, y = anchor === "n" ? at[1] - h - 6 : at[1] - h / 2;
    x = Math.max(2, Math.min(W - w - 2, x)); sp.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  // ghost labels: L1 carries "your 80 J" (her number), never the truth's value (D30/D42)
  st.ghosts.forEach((g, i) => {
    const at = g === "d" ? [6.6, 4] : g === "a" ? [2, 4] : [6.2, 2.6];
    const p = X(at); if (st.ghosts.length === 2 && i === 0 && g === "a") p[1] += 28;
    pill(`your ${GVAL[g]} J`, p, "", g === "b" ? "c" : "n");
  });
  if (st.lvl >= 3 && st.truth) { pill("40 J", X([2, 1.6]), "truth"); pill("20 J", X([5.3, 1.2]), "truth"); }
  if (read && S.touched) pill(`${read.v} J`, read.at, "read");
  if (st.demo) pill("1 square", X([0.5, 1]), "read", "n");
  el.classList.toggle("live", !!hp);
}
function inv(el) { const X = el._X, o = X([0, 0]), e = X([1, 1]); return (px, py) => [(px - o[0]) / (e[0] - o[0]), (py - o[1]) / (e[1] - o[1])]; }
const FIGS = new Set();
function hook(el, kind) {
  FIGS.add(el); el._kind = kind;
  let grab = false, moved = false, dragT = 0;
  el.addEventListener("pointerdown", e => {
    if (!(e.target instanceof Element) || !e.target.closest(".hit")) return;
    grab = true; moved = false; el.setPointerCapture(e.pointerId); e.preventDefault();
    if (!S.touched && S.picks.length) emit("viz_touch", { level: S.lvl, target: "handle", ms_from_view: Math.round(performance.now() - S.viewAt) });
    S.touched = true; S.skips = 0; saveSkips(); FIGS.forEach(f => f.isConnected && f.clientWidth && overlay(f));
  });
  el.addEventListener("pointermove", e => {
    if (!grab) return; moved = true;
    const r = el.getBoundingClientRect(), w = inv(el)(e.clientX - r.left, e.clientY - r.top), snap = v => Math.round(v * 4) / 4;
    const h = figState(kind).handle;
    if (h === "apex") S.h = Math.max(0, Math.min(4, snap(w[1])));
    else if (h === "sweepR") S.t = Math.max(4, Math.min(8, snap(w[0])));
    else if (h === "sweepL") S.s = Math.max(0, Math.min(4, snap(w[0])));
    else if (figState(kind).drag) { S.predY = Math.max(0, Math.min(4, snap(w[1]))); S.pred = "drag:" + S.predY; }
    requestAnimationFrame(() => FIGS.forEach(f => f.isConnected && f.clientWidth && overlay(f)));
  });
  const end = () => { if (grab && moved) { code(); dragT = performance.now(); } grab = false; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("click", e => { if (performance.now() - dragT < 400 || (e.target instanceof Element && e.target.closest(".hit"))) return; if (el.id !== "fsfig") openFs(kind); });
  el.addEventListener("keydown", e => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; const h = figState(kind).handle;
    if (e.key === "Enter") { openFs(kind); return; }
    if (!d || !h) return; e.preventDefault(); S.touched = true;
    if (h === "apex") S.h = Math.max(0, Math.min(4, S.h + d * 0.5)); else if (h === "sweepR") S.t = Math.max(4, Math.min(8, S.t + d * 0.5)); else S.s = Math.max(0, Math.min(4, S.s - d * 0.5));
    FIGS.forEach(f => f.isConnected && f.clientWidth && overlay(f));
  });
}
function openFs(kind) {   // D26: tap the figure -> full screen (same state, same handle)
  const d = $("#fs"); if (d.open) return; d.showModal(); const f = $("#fsfig"); f._kind = kind; draw(f, kind);
  emit("viz_fullscreen", { level: S.lvl });
}
$("#fsX").addEventListener("click", () => $("#fs").close());

/* ---------- viz_view: ≥50% in view, once per level ---------- */
let seenLvl = 0;
const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting && S.picks.length && !S.right && seenLvl !== S.lvl) {
    seenLvl = S.lvl; S.viewAt = performance.now();
    emit("viz_view", { pick: S.picks[S.picks.length - 1], kind: KIND[S.picks[S.picks.length - 1]] || "none", level: S.lvl, n_ghosts: figState("q").ghosts.length, src: "pregen" });
  }
}), { threshold: 0.5 }) : null;

/* ---------- choices, predict, bet ---------- */
function choices() {
  $("#choices").innerHTML = CHOICES.map(([id, v]) => `<button type="button" class="vopt" role="radio" aria-checked="false" data-id="${id}"><span class="l">${id})</span><span class="tex">$${v}$</span></button>`).join("");
  texIn($("#choices"));
  $("#choices").addEventListener("click", e => {
    const b = e.target instanceof Element && e.target.closest(".vopt"); if (!b || b.disabled || S.done) return;
    S.sel = b.dataset.id; document.querySelectorAll(".vopt").forEach(o => o.setAttribute("aria-checked", String(o === b)));
    setMain(S.picks.length ? "Check again" : "Check", false);
  });
}
function predict() {
  const box = $("#predict");
  if (V.predict === "chips") {
    box.hidden = false;
    box.innerHTML = `<p>Gut call first: from B to C, the area is…</p><div class="chips" role="group" aria-label="Gut call">${["a full box", "half a box", "not sure"].map(c => `<button type="button" class="chip" aria-pressed="false">${c}</button>`).join("")}</div>`;
    box.addEventListener("click", e => { const c = e.target instanceof Element && e.target.closest(".chip"); if (!c) return; S.pred = c.textContent;
      box.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x === c))); code(); });
  } else if (V.predict === "drag") {
    box.hidden = false; box.innerHTML = `<p class="dragnote">Before you pick: drag the yellow dot to the shape you would count from B to C.</p>`;
  }
}

/* ---------- grading + levels ---------- */
function setMain(label, dis) { const m = $("#main"); m.textContent = label; m.disabled = dis; }
function check() {
  if (!S.sel || S.done) return;
  const p = S.sel, first = !S.picks.length; S.picks.push(p); S.demo = false; $("#demo").hidden = true; $("#predict").hidden = true;
  if (first && $("#sure").checked) {
    S.bet = { sure: true };
    emit("bet_place", { stake: 1, sure: true });
  }
  $("#sureRow").hidden = true;
  const opt = $(`.vopt[data-id="${p}"]`);
  if (p === KEY) return right(first);
  S.tries--; opt.classList.add("mine"); opt.disabled = true; opt.setAttribute("aria-checked", "false");
  if (first && S.bet) { $("#seg").hidden = false; $("#seg").textContent = "−1"; emit("bet_result", { stake: 1, right: false, delta: -1 }); }
  const lastTry = S.tries <= 0 || T.last;
  S.lvl = PREF ? 3 : lastTry ? 3 : S.picks.length > 1 ? Math.max(2, Math.min(3, S.lvl + 1)) : S.lvl;
  if (lastTry) { S.done = true; document.querySelectorAll(".vopt").forEach(o => { o.disabled = true; if (o.dataset.id === KEY && S.lvl >= 3) o.classList.add("right"); }); }
  paint();
}
function right(first) {
  S.done = true; S.right = true;
  document.querySelectorAll(".vopt").forEach(o => { o.disabled = true; });
  $(`.vopt[data-id="${KEY}"]`).classList.add("right");
  if (first && S.bet) { const g = 3 + Math.floor(Math.random() * 3); S.pts += g; $("#pts").textContent = S.pts; const el = $("#gain"); el.hidden = false; el.textContent = "+" + g; emit("bet_result", { stake: 1, right: true, delta: g }); }
  // D31/D41 + FABLE A1#1: words first (names the fix), joke on its own line (humor rule e), thumbnail second; Next stays live
  const fix = S.picks.length > 1 ? "You halved the triangle this time." : "You split it into a box and half a box.";
  $("#fb").innerHTML = `<div class="affirm"><svg class="thumbfig" viewBox="-6 -6 92 52" role="img" aria-label="Rectangle plus triangle, 60 J">
    <line x1="0" y1="40" x2="84" y2="40" stroke="var(--muted)" stroke-width="1.5"/><line x1="0" y1="40" x2="0" y2="-2" stroke="var(--muted)" stroke-width="1.5"/>
    <polygon points="0,40 0,0 40,0 40,40" fill="var(--c1)" fill-opacity="0.22" stroke="var(--c1)" stroke-width="2"/><polygon points="40,40 40,0 80,40" fill="var(--c1)" fill-opacity="0.22" stroke="var(--c1)" stroke-width="2"/>
    <text x="40" y="28" fill="var(--ink)" font-size="13" text-anchor="middle">60 J</text></svg>
    <div><p>${fix} That's the move on the exam.</p><p class="joke">QUACK. Triangles: the half-price boxes of physics.</p></div></div>`;
  $("#cl").hidden = true; root.classList.remove("part-open", "vcl-open");
  FIGS.forEach(f => f.isConnected && f.clientWidth && overlay(f));
  setMain("Next", false); code();
  requestAnimationFrame(() => $("#fb").scrollIntoView({ block: "nearest", behavior: T.rm || BOOT ? "auto" : "smooth" }));
}
function cluckHTML() {
  const last = S.picks[S.picks.length - 1], mech = T.mech || KIND[last] === "mechanical", L = S.lvl;
  const b = [], two = S.picks.filter(p => GHOST[p]).length > 1;
  if (mech) {
    b.push(`<p class="line">Your shape is right: box plus half a box. The last step stopped at squares.</p>`);
    b.push(`<div class="chipm" role="img" aria-label="W equals 24 squares times the joules in one square"><span class="tex-d">${Graph.tex("$W = 24\\ \\text{squares} \\times$")} <span class="miss">${Graph.tex("$\\text{J in one square}$")}</span></span></div>`);
    if (L >= 2) b.push(`<p class="line2">One square is ${Graph.tex("$2.5\\ \\text{m}$")} wide and ${Graph.tex("$1.0\\ \\text{N}$")} tall.</p>`);
  } else {
    b.push(`<p class="line">${L >= 3 ? L3LINE : two ? LINE2[last] || LINE[last].l1 : predLead(last) + LINE[last].l1}</p>`);
    if (V.home === "full" || V.home === "card") b.push(`<div class="fig copyfig" id="cfig" tabindex="0" role="img" aria-label="Your answer as a dashed shape beside the real area."></div>`);
    if (T.t === "inter" && L < 3 && !two) b.push(`<p class="line2">${LINE[last].l1b}</p>`);
    if (L === 2) b.push(`<p class="line2">${LINE[last].l2}</p>`);
    if (L === 2 && T.t === "inter") b.push(`<div class="math">${dtex(TEX_L2)}</div>`);
  }
  if (L >= 3) b.push(`<div class="math">${dtex(TEX_L3)}</div><p class="line2">Answer: <span class="vboxed">c) ${Graph.tex("$60\\ \\text{J}$")}</span></p>`);
  if (S.done && !S.right) {
    b.push(`<p class="note">It'll come back around in a few questions, with fresh tries.</p>`);
    b.push(`<div class="strip"><button type="button" data-act="twin">Try a twin</button><button type="button" data-act="next">Next</button></div>`);
  } else if (L < 3) {
    if (L === 1) b.push(`<div class="strip"><button type="button" data-act="hint">${mech ? "Hint" : "Explain in detail"}</button></div>`);
  }
  if (PREF) b.push(`<p class="note">You turned on tell-me mode. <button type="button" class="linkish" data-act="tmoff">Try it yourself instead</button></p>`);
  b.push(`<p class="disc">verify b4 use lol, and pls no private shit in it xoxo</p>`);
  return b.join("");
}
function predLead(last) { return V.predict === "chips" && S.pred === "half a box" && last === "d" ? "Your gut said half a box. " : ""; }
function paint() {
  const cl = $("#cl"); cl.hidden = false; root.classList.add("vcl-open"); if (V.home === "part") root.classList.add("part-open");
  $("#clBody").innerHTML = cluckHTML();
  const cf = $("#cfig"); if (cf) { hook(cf, "copy"); draw(cf, "copy"); io && io.observe(cf); }
  const q = $("#qfig");
  draw(q, "q");
  if (V.home !== "full" && V.home !== "card") io && io.observe(q);
  $("#sureNote").hidden = !(S.picks.length && !S.done && !S.right);
  syncPref();
  setMain(S.done ? "Next" : "Try again", false);
  if (V.home === "sticky") requestAnimationFrame(() => {   // C: panel lands right under the stuck figure
    const fw = $("#figwrap").getBoundingClientRect(), r = cl.getBoundingClientRect(), dy = r.top - fw.height - 8;
    if (dy > 2) scrollBy({ top: dy, behavior: T.rm || BOOT ? "auto" : "smooth" });
  });
  if (V.home === "part") requestAnimationFrame(() => {   // keep the whole figure above the sheet (RUNTIME §1 A)
    const r = $("#figwrap").getBoundingClientRect(), top = V.home === "part" && innerWidth < 900 ? cl.getBoundingClientRect().top : innerHeight;
    const dy = r.top < 0 ? r.top - 8 : Math.min(r.top - 8, Math.max(0, r.bottom - top + 8));
    if (Math.abs(dy) > 2) scrollBy({ top: dy, behavior: T.rm || BOOT ? "auto" : "smooth" });
  });
  if (V.home === "card") cl.scrollIntoView({ block: "nearest", behavior: T.rm || BOOT ? "auto" : "smooth" });
  code();
}
function retry() {
  if (!S.touched && S.picks.length) skip("retry");
  S.sel = ""; document.querySelectorAll(".vopt").forEach(o => { if (!o.classList.contains("mine")) o.disabled = false; o.setAttribute("aria-checked", "false"); });
  if (V.home === "full") closeCl();
  if (V.home === "part") $("#cl").classList.remove("full");
  setMain("Check again", true);
  $("#choices").scrollIntoView({ block: "nearest", behavior: T.rm || BOOT ? "auto" : "smooth" });
}
function skip(via) {
  S.skips++; saveSkips();
  emit("viz_skip", { level: S.lvl, via, ms_from_view: Math.round(performance.now() - S.viewAt), skips_in_row: S.skips });
  if (S.skips >= 3 && !PREF) { PREF = true; try { localStorage.setItem("stem-tellme", "1"); } catch {} emit("tellme_on", { on: true, via: "auto_3_skips", skips_in_row: S.skips }); }
  syncPref();
}
function saveSkips() { try { localStorage.setItem("stem-tellme-skips", String(S.skips)); } catch {} }
function tellme() {
  if (S.right) return;
  if (S.picks.length && !S.touched) skip("tellme"); else if (!S.picks.length) skip("tellme");
  if (!S.picks.length) S.picks.push("");
  S.lvl = 3; S.done = true;
  document.querySelectorAll(".vopt").forEach(o => { o.disabled = true; if (o.dataset.id === KEY) o.classList.add("right"); });
  $("#sureRow").hidden = true; $("#demo").hidden = true; $("#predict").hidden = true; S.demo = false;
  if (!S.picks[0]) { S.picks = []; showL3Only(); return; }
  paint();
}
function showL3Only() {   // "Just tell me" before any pick: the whole thing, no ghost (there is no pick to interpret)
  const cl = $("#cl"); cl.hidden = false; root.classList.add("vcl-open"); if (V.home === "part") root.classList.add("part-open");
  $("#clBody").innerHTML = `<p class="line">Here is the whole thing: a box plus half a box.</p><div class="math">${dtex(TEX_L3)}</div>
    <p class="line2">Answer: <span class="vboxed">c) ${Graph.tex("$60\\ \\text{J}$")}</span></p><p class="note">It'll come back around later, with fresh tries.</p>
    <div class="strip"><button type="button" data-act="twin">Try a twin</button><button type="button" data-act="next">Next</button></div>`;
  draw($("#qfig"), "q"); setMain("Next", false); code();
}
function closeCl() { $("#cl").hidden = true; root.classList.remove("vcl-open", "part-open"); }
function syncPref() { $("#tmPref").hidden = !PREF || S.picks.length > 0; }

$("#main").addEventListener("click", () => {
  const m = $("#main").textContent;
  if (m.startsWith("Check")) check(); else if (m === "Try again") retry();
  else { if (!S.right && !S.touched && S.picks.length) skip("next"); location.reload(); }
});
$("#tellme").addEventListener("click", tellme);
$("#clBody").addEventListener("click", e => {
  const b = e.target instanceof Element && e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "hint") { S.lvl = 2; paint(); }
  else if (a === "retry") retry();
  else if (a === "next") location.reload();
  else if (a === "twin") { emit("twin_start", { twin: "PHYS_YGH" }); b.textContent = "Twin loads here (mock)"; b.disabled = true; }
  else if (a === "tmoff") tmOff();
});
function tmOff() { PREF = false; S.skips = 0; saveSkips(); try { localStorage.setItem("stem-tellme", "0"); } catch {} emit("tellme_off", { on: false, via: "link" }); syncPref(); if (S.picks.length) paint(); }
$("#tmOff").addEventListener("click", tmOff);
$("#clX").addEventListener("click", () => {
  closeCl(); const r = document.createElement("button"); r.type = "button"; r.className = "btn-q"; r.textContent = "Open Cluck";
  r.addEventListener("click", () => { r.remove(); paint(); }); $("#fb").appendChild(r);
});
$("#clGrab").addEventListener("click", () => { const c = $("#cl"); c.classList.toggle("full"); $("#clGrab").setAttribute("aria-label", c.classList.contains("full") ? "Shrink Cluck" : "Expand Cluck"); });
$("#demoOk").addEventListener("click", () => { S.demo = false; $("#demo").hidden = true; overlay($("#qfig")); });

/* ---------- Tony's panel: variants, switches, Copy all ---------- */
function href(set) { const u = new URLSearchParams(qs); for (const k in set) set[k] == null ? u.delete(k) : u.set(k, set[k]); return "?" + u.toString(); }
function panel() {
  $("#vname").textContent = V.name;
  $("#vpick").innerHTML = Object.keys(VARS).map(k => `<a href="${href({ v: k })}"${k === T.v ? ' aria-current="page"' : ""}>${k}</a>`).join("");
  const tg = [["t=short", { t: "short" }, T.t === "short"], ["t=inter", { t: "inter" }, T.t === "inter"],
    ["fresh", { pick: null, try: null, last: null, slip: null, lvl: null }, !T.pick],
    ["pick=d", { pick: "d", slip: null }, T.pick === "d"], ["pick=a", { pick: "a", slip: null }, T.pick === "a"], ["pick=b", { pick: "b", slip: null }, T.pick === "b"], ["pick=c (right)", { pick: "c", slip: null }, T.pick === "c"],
    ["lvl=1", { lvl: "1" }, T.lvl === 1], ["lvl=2", { lvl: "2" }, T.lvl === 2], ["lvl=3", { lvl: "3" }, T.lvl === 3],
    ["try=2", { try: T.try2 ? null : "2", pick: T.pick || "d" }, T.try2], ["last=1", { last: T.last ? null : "1", pick: T.pick || "d" }, T.last],
    ["tellme=1", { tellme: T.tellme ? null : "1" }, T.tellme], ["slip=mech", { slip: T.mech ? null : "mech", pick: T.mech ? null : "e" }, T.mech],
    ["sure=1 (bet)", { sure: T.sure ? null : "1" }, T.sure], ["rm=1", { rm: T.rm && qs.get("rm") === "1" ? null : "1" }, qs.get("rm") === "1"]];
  $("#toggles").innerHTML = tg.map(([l, s, on]) => `<a href="${href(s)}" aria-current="${on}">${l}</a>`).join("");
}
function code() {
  const note = $("#note").value.replace(/[;\n]+/g, " ").trim();
  const flow = EV.map(e => e.ev).join(">");
  $("#code").value = `VIS;v=${T.v};t=${T.t};pick=${T.pick || "-"};lvl=${T.lvl};try=${T.try2 ? 2 : 1};last=${+T.last};tellme=${+T.tellme};slip=${T.mech ? "mech" : "-"};rm=${+T.rm};` +
    `picks=${S.picks.join(",") || "-"};level=${S.lvl};touched=${+S.touched};pred=${S.pred || "-"};bet=${S.bet ? 1 : 0};w=${innerWidth};flow=${flow || "-"};note=${note}`;
  grow($("#code"));
}
const grow = t => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
$("#note").addEventListener("input", () => { grow($("#note")); code(); });
$("#copy").addEventListener("click", async () => {
  code();
  try { await navigator.clipboard.writeText($("#code").value); $("#copied").textContent = "Copied. Paste it to Claude."; }
  catch { $("#code").select(); $("#copied").textContent = "Selected: copy it by hand."; }
});

function dtex(t) { try { return katex.renderToString(t, { displayMode: true, throwOnError: false, strict: "ignore" }); } catch { return t; } }
function texIn(el) { el.querySelectorAll(".tex").forEach(x => { x.innerHTML = Graph.tex(x.textContent); }); }

/* ---------- boot ---------- */
if (V.home === "sticky") $("#qcard").appendChild($("#cl"));   // C: the panel scrolls under the sticky figure, inside the question card
texIn(document.body); panel(); choices(); predict(); syncPref();
$("#demo").hidden = !V.demo;
const q = $("#qfig"); q.tabIndex = 0; hook(q, "q"); hook($("#fsfig"), "fs"); draw(q, "q");
if (T.sure) $("#sure").checked = true;
if (T.lvl > 1) S.lvl = T.lvl;
if (T.mech && !T.pick) T.pick = "e";
if (T.pick) {   // replay the state from the URL so Tony (and the shots) land on it
  S.sel = T.pick; check();
  if (T.try2 && T.pick !== KEY && GHOST[T.pick] && !S.done) { S.sel = SECOND[T.pick]; check(); }
}
BOOT = 0;
let rz = 0;
addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => FIGS.forEach(f => f.isConnected && f.clientWidth && draw(f, f._kind))); });
code();
