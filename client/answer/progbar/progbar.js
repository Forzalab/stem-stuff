/* progbar.js: the v9d top bar's DOM (PROGBAR P5, brain ui-polish/PORT-ARCH.md §D2, topbar-v9/SPEC.md + fit06/MEASURE.md V9D-POLISH).
   BEHIND html.ui-v7 (set by fx.js from ?ui=v7 / localStorage stem-ui; default OFF until P6). Flag off = this file touches nothing: no node is
   added, moved or restyled. Flag on = it re-parents the existing nav buttons into the v9d tiles (the ids stay, so nav.js is untouched) and adds
   the notch tile between them:  [ .pb-list: #qback + #qlistBtn ] [ #pbTile: 7 notches ] [ .pb-nav: #qprev + #qnext ]  (progbar.css lays them out).
   Reads state only: stem-pb:<bank> (written by app.js pbFeed, P4) through pbLoad / pbView. No writes, no globals, no bridge.
   Re-renders on: "drill:pb" (app.js pbFeed, after it saved), "drill:bank", "drill:problem", "storage" (another tab).
   States per notch (SPEC §2): empty (recessed) · next (ringed) · right · wrong (colour only) · partial (right hue bottom-up to f) · streak (taller, lighter).
   Component states: rest · hover / press (list, prev, next) · focus (2px ring, inside) · disabled (prev / next, nav.js) · locked: n/a. Morph and the
   set-end overlay are P7 / P8, not here. Streak wave = P7 (brain ui-polish/wave/P7-SPEC.md, Tony WAVE-SPRING + "ship spring C"): see wave() below. */
import { pbKey, pbLoad, pbView } from "../../pure_logic_modules/progbar.mjs";

const H = document.documentElement, $ = s => document.querySelector(s);
const nav = $("#qnav");
let tile = null, listW = null, navW = null;

const on = () => H.classList.contains("ui-v7");
const bankCode = () => (window.stemBank && window.stemBank.code) || null;

function mount() {
  if (tile || !nav) return;
  const back = $("#qback"), list = $("#qlistBtn"), prev = $("#qprev"), next = $("#qnext");
  if (!list || !prev || !next) return;
  listW = document.createElement("div"); listW.className = "pb-list";
  nav.insertBefore(listW, back || list); if (back) listW.append(back); listW.append(list);
  tile = document.createElement("div"); tile.id = "pbTile"; tile.className = "pb"; tile.setAttribute("role", "img"); tile.hidden = true;
  navW = document.createElement("div"); navW.className = "pb-nav";
  nav.insertBefore(tile, prev); nav.insertBefore(navW, prev); navW.append(prev, next);
  render(); seen();
}
function unmount() {
  if (!tile) return;
  for (const id of ["qback", "qlistBtn"]) { const b = document.getElementById(id); if (b) nav.insertBefore(b, listW); }
  for (const id of ["qprev", "qnext"]) { const b = document.getElementById(id); if (b) nav.insertBefore(b, navW); }
  stopWave(); listW.remove(); tile.remove(); navW.remove(); tile = listW = navW = null;
}
/* == §wave == P7 streak wave: underdamped spring per lit streak notch, driven by a damped sine (spec §1-§6, demo-c2 spring2Play).
   Fires on notch land (streak run grew) and set done (7th notch / early end, streak lit), only from "drill:pb", never on a plain re-render.
   Params (Tony Nov 14, "faster, bouncier, slightly stiff"): zeta 0.40, Td 0.90 s, envelope attack 0.05 s, settle 0.01.
   ASSUMPTION: the sheen is dead (SHEEN-KILL), so there is no separate 600/900 ms window: the wave runs its own length (spec §4). */
const SP = { z: 0.40, Td: 0.90, T: 1.8, tail: 0.6, tau: 0.05, thr: 0.01 };
SP.wn = 2 * Math.PI / (SP.Td * Math.sqrt(1 - SP.z * SP.z)); SP.k = SP.wn * SP.wn; SP.c = 2 * SP.z * SP.wn;   // k ~58.0, c ~6.09
const DRV = [{ P: 1.30, a: 0.36, d: 0 }, { P: 1.55, a: 0.36, d: 0.07 }, { P: 1.40, a: 0.32, d: 0.15 }];
const env = t => (1 - Math.exp(-t / SP.tau)) * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (t - (SP.T - SP.tail)) / SP.tail))));
let raf = 0;
function stopWave() {
  if (raf) cancelAnimationFrame(raf); raf = 0;
  if (tile) for (const e of tile.querySelectorAll(".pb-n.streak")) { e.style.transform = ""; e.style.willChange = ""; }
}
function wave() {
  stopWave();
  if (!tile || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const x = [], v = []; let t0 = null, last = 0;
  const frame = now => {
    if (t0 === null) { t0 = last = now; }
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000, els = tile ? tile.querySelectorAll(".pb-n.streak") : [];   // re-read: a re-render swaps the nodes
    let done = true;
    els.forEach((e, i) => {
      const m = i % 3, d = DRV[m], tb = t - d.d; if (x[i] === undefined) { x[i] = 1; v[i] = 0; }
      const tgt = tb > 0 && tb < SP.T ? 1 - d.a * env(tb) * (1 - Math.cos(2 * Math.PI * tb / d.P)) / 2 : 1;
      v[i] += (SP.k * (tgt - x[i]) - SP.c * v[i]) * dt; x[i] += v[i] * dt;
      if (x[i] > 1) { x[i] = 1; v[i] = 0; }               // rest is the ceiling: the release overshoot is clipped
      e.style.willChange = "transform"; e.style.transform = `scaleY(${x[i].toFixed(4)})`;
      if (!(t > SP.T && Math.abs(x[i] - 1) < SP.thr && Math.abs(v[i]) < 0.02)) done = false;
    });
    if (done) { raf = 0; for (const e of els) { e.style.transform = ""; e.style.willChange = ""; } } else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
let prevRun = 0, prevDone = false;
function feed() {                                          // "drill:pb": render, then decide whether the wave plays
  render(); if (!tile) return;
  const ns = [...tile.querySelectorAll(".pb-n")], run = tile.querySelectorAll(".pb-n.streak").length, full = ns.length > 0 && !tile.querySelector(".pb-n.empty, .pb-n.next");
  if (run && (run > prevRun || (full && !prevDone))) wave();
  prevRun = run; prevDone = full;
}
function seen() {                                          // other re-renders only re-baseline, so a reload / bank switch never plays
  const ns = tile ? [...tile.querySelectorAll(".pb-n")] : [];
  prevRun = tile ? tile.querySelectorAll(".pb-n.streak").length : 0; prevDone = !!tile && ns.length > 0 && !tile.querySelector(".pb-n.empty, .pb-n.next");
}

function render() {
  if (!tile) return;
  const code = bankCode();
  tile.hidden = !code;                                   // an upload / no bank: no set, no tile
  if (!code) return;
  let raw = null; try { raw = localStorage.getItem(pbKey(code)); } catch { /* blocked: an empty set */ }
  const v = pbView(pbLoad(raw));
  tile.innerHTML = `<span class="pb-ns">${v.map(x => `<i class="pb-n ${x.state}${x.streak ? " streak" : ""}"${x.state === "partial" ? ` style="--f:${+x.f.toFixed(3)}"` : ""}>${x.state === "partial" || x.streak ? "<u></u>" : ""}</i>`).join("")}</span>`;
  const n = c => v.filter(x => x.state === c).length, run = v.filter(x => x.streak).length;
  tile.setAttribute("aria-label", `This set: ${n("right") + n("wrong") + n("partial")} of ${v.length} answered, ${n("right")} right, ${n("partial")} partly right, ${n("wrong")} wrong${run ? `, ${run} right in a row` : ""}`);
}
function sync() { if (on() !== !!tile) (on() ? mount : unmount)(); }

if (nav) {
  sync();
  new MutationObserver(sync).observe(H, { attributes: true, attributeFilter: ["class"] });
  addEventListener("drill:pb", feed);
  for (const e of ["drill:bank", "drill:problem", "storage"]) addEventListener(e, () => { render(); seen(); });
}
