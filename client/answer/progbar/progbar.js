/* progbar.js: the v9d top bar's DOM (PROGBAR P5, brain ui-polish/PORT-ARCH.md §D2, topbar-v9/SPEC.md + fit06/MEASURE.md V9D-POLISH).
   BEHIND html.ui-v7 (set by fx.js from ?ui=v7 / localStorage stem-ui; default OFF until P6). Flag off = this file touches nothing: no node is
   added, moved or restyled. Flag on = it re-parents the existing nav buttons into the v9d tiles (the ids stay, so nav.js is untouched) and adds
   the notch tile between them:  [ .pb-list: #qback + #qlistBtn ] [ #pbTile: 7 notches ] [ .pb-nav: #qprev + #qnext ]  (progbar.css lays them out).
   Reads state only: stem-pb:<bank> (written by app.js pbFeed, P4) through pbLoad / pbView. No writes, no globals, no bridge.
   Re-renders on: "drill:pb" (app.js pbFeed, after it saved), "drill:bank", "drill:problem", "storage" (another tab).
   States per notch (SPEC §2): empty (recessed) · next (ringed) · right · wrong (colour only) · partial (right hue bottom-up to f) · streak (taller, lighter).
   Component states: rest · hover / press (list, prev, next) · focus (2px ring, inside) · disabled (prev / next, nav.js) · locked: n/a. Morph, streak
   wave and the set-end overlay are P7 / P8, not here. */
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
  render();
}
function unmount() {
  if (!tile) return;
  for (const id of ["qback", "qlistBtn"]) { const b = document.getElementById(id); if (b) nav.insertBefore(b, listW); }
  for (const id of ["qprev", "qnext"]) { const b = document.getElementById(id); if (b) nav.insertBefore(b, navW); }
  listW.remove(); tile.remove(); navW.remove(); tile = listW = navW = null;
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
  for (const e of ["drill:pb", "drill:bank", "drill:problem", "storage"]) addEventListener(e, render);
}
