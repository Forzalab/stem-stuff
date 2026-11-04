/* tug.mjs: the Tug, a push-pull rope for cause -> effect rows (brain plan-2026-11-03/TUG-VIEW.md). Each factor is a bar from the start knot,
   right = up, left = down, longer for a bigger `size`; the rope's end knot is "?" until the answer is earned (net only when the caller passes it).
   Pure: parseRow / dirOf / tugModel make the model, tugHTML turns it into a string (wishHTML builds strings), drawTug into a DOM node. Bar length
   comes from `size` only, never from arithmetic on the move text. */
const DIR = [[/^(?:up|higher|rise|rises|rising|increase\w*|▲|↑)(?![a-z])/i, "up"], [/^(?:down|lower|fall|falls|falling|decrease\w*|▼|↓)(?![a-z])/i, "down"], [/^same(?![a-z])/i, "same"]];
const LOOSE = [[/^more(?![a-z])/i, "up"], [/^less(?![a-z])/i, "down"]];          // "more" / "less" start ordinary sentences: a direction only when the column header says so
export const dirHeader = h => /\b(effect|direction|change|impact|result|goes)\b/i.test(h ?? "");
/* a last-column cell -> { dir, size } (size 1..9, default 1) or null: "up", "Up 3", "↑", "higher"; loose = the column header names a direction (adds more / less) */
export function dirOf(cell, loose = false) {
  const c = String(cell ?? "").replace(/[*_`]/g, "").trim();
  for (const [re, dir] of loose ? [...DIR, ...LOOSE] : DIR) {
    const m = re.exec(c);
    if (m) { const n = /^\s*(\d)\b/.exec(c.slice(m[0].length)); return { dir, size: n && +n[1] >= 1 ? +n[1] : 1 }; }
  }
  return null;
}
/* the Lang row grammar "label | move | up|down|same [size] [| why]" (label <= 10, move <= 24, why <= 60) -> { label, move, dir, size, why } or null */
export function parseRow(s) {
  const p = String(s ?? "").split("|").map(x => x.trim());
  if (p.length < 3 || p.length > 4 || !p[0] || p[0].length > 10 || p[1].length > 24 || (p[3] ?? "").length > 60) return null;
  const m = /^(up|down|same)(?:\s+([1-9]))?$/i.exec(p[2]);
  return m ? { label: p[0], move: p[1], dir: m[1].toLowerCase(), size: m[2] ? +m[2] : 1, why: p[3] || "" } : null;
}
/* "tug" when a pipe table has >= 2 rows, 2-3 columns and every row's last cell starts with a direction word; any other strict table is a "table" */
export function tableShape(head, rows) {
  const n = head.length, loose = dirHeader(head[n - 1]);
  if (rows.length >= 2 && (n === 2 || n === 3) && rows.every(r => r.length === n && dirOf(r[n - 1], loose))) return "tug";
  return n === 3 && rows.length <= 4 && /\b(you|your|did|yours)\b/i.test(head[1]) && /\b(fix|right|should|correct)\b/i.test(head[2]) ? "flip" : "table";
}
/* a pipe table's rows -> the rows tugModel takes (label | move | dir); `of` = the word after "effect on" in the last header cell ("effect on $P$" -> "$P$") */
export function tugFromTable(head, rows) {
  const n = head.length, loose = dirHeader(head[n - 1]), m = /^\s*(?:effect|change|impact)\s+(?:on|in|to)\s+(.+?)\s*$/i.exec(head[n - 1]);
  return tugModel(rows.map(r => ({ label: r[0], move: n === 3 ? r[1] : "", ...dirOf(r[n - 1], loose) })), m ? m[1].slice(0, 24) : "");
}
/* rows [{label, move, dir, size}] -> the model: each row gets w = its share of the longest bar (0..100) */
export function tugModel(rows, of = "", net = "", alt = "") {
  const max = Math.max(1, ...rows.map(r => r.size || 1));
  return { rows: rows.map(r => ({ ...r, size: r.size || 1, w: Math.round(((r.size || 1) / max) * 100) })), of, net, alt };
}
const E = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GLYPH = { up: "▲", down: "▼", same: "=" }, SAY = { up: "pulls up", down: "pulls down", same: "no pull" };
/* line(s) -> html for a label (the caller's inline KaTeX path); the default escapes only */
export function tugHTML(m, line = E) {
  const plain = s => E(String(s).replace(/\$/g, "").replace(/[*_`]/g, ""));
  const rows = m.rows.map((r, i) => `<div class="tg-row tg-pull" role="button" tabindex="0" style="--i:${i}"><div class="tg-lab"><b>${line(r.label)}</b>${r.move ? ` <span class="tg-mv">${line(r.move)}</span>` : ""}` +
    `${r.why ? `<span class="tg-why">${line(r.why)}</span>` : ""}</div>` +
    `<div class="tg-rope"><span class="tg-bar tg-${r.dir}${r.dir === "up" ? " tn-sky" : r.dir === "down" ? " tn-orange" : ""}" style="--w:${r.w}" aria-hidden="true">${GLYPH[r.dir]}</span></div></div>`).join("");
  const start = `<div class="tg-row tg-start"><div class="tg-lab">${m.of ? line(m.of) : ""}</div><div class="tg-rope"><span class="tg-knot" aria-hidden="true"></span></div></div>`;
  const end = `<div class="tg-row tg-end"><div class="tg-lab"></div><div class="tg-rope"><span class="tg-knot tg-net">${E(m.net || "?")}</span></div></div>`;
  const sr = m.rows.map(r => `<li>${plain(r.label)}${r.move ? ": " + plain(r.move) : ""}, ${SAY[r.dir]}</li>`).join("");
  return `<div class="vw-tug" role="figure" aria-label="${E(m.alt || "pushes and pulls" + (m.of ? " on " + plain(m.of) : ""))}">${start}${rows}${end}<ul class="sr-only">${sr}</ul></div>`;
}
export function drawTug(doc, m, o = {}) {
  const d = doc.createElement("div");
  d.innerHTML = tugHTML(m, o.line);                       // every string is escaped by tugHTML (or by the caller's line())
  return d.firstChild;
}

/* a tap (or Enter / Space) on a row: it goes .on (its why line shows, its bar pulses once), the other rows' bars go to layer 3 (.ly3, never opacity); again: cleared */
export function tugTap(row) {
  const root = row?.closest(".vw-tug");
  if (!root) return;
  const was = row.classList.contains("on");
  for (const r of root.querySelectorAll(".tg-pull")) { r.classList.remove("on"); r.querySelector(".tg-bar")?.classList.toggle("ly3", !was && r !== row); }
  if (!was) row.classList.add("on");
}
if (typeof document !== "undefined" && !globalThis.__stemTugTap) {
  globalThis.__stemTugTap = true;
  document.addEventListener("click", e => tugTap(e.target.closest?.(".vw-tug .tg-pull")));
  document.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const r = e.target.closest?.(".vw-tug .tg-pull"); if (r) { e.preventDefault(); tugTap(r); } } });
}

/* ---- Flip: one card per row [step, you did, the fix]. Face A (you did, orange, x) then face B (the fix, sky, check). The card flips to B after
   a beat by CSS alone (the pipe fallback is a string: no timer can ride it); a tap flips it back to A and again to B (flipTap, one delegated listener). */
export function flipModel(rows, alt = "") { return { rows: rows.map(r => ({ step: r[0] ?? "", a: r[1] ?? "", b: r[2] ?? "" })), alt }; }
export function flipHTML(m, line = E) {
  const face = (c, gl, r, t) => `<div class="fl-face ${c}"><span class="fl-gl" aria-hidden="true">${gl}</span><span class="fl-st">${line(r.step)}</span><span class="fl-tx">${line(t)}</span></div>`;
  const cards = m.rows.map(r => `<div class="fl-card" role="button" tabindex="0" aria-label="${E(String(r.step).replace(/[$*_`]/g, ""))}: tap to flip between what you did and the fix">` +
    `<div class="fl-in">${face("fl-a tn-orange", "✗", r, r.a)}${face("fl-b tn-sky", "✓", r, r.b)}</div></div>`).join("");
  return `<div class="vw-flip" role="group" aria-label="${E(m.alt || "what you did and the fix")}">${cards}</div>`;
}
export function drawFlip(doc, m, o = {}) { const d = doc.createElement("div"); d.innerHTML = flipHTML(m, o.line); return d.firstChild; }
/* a tap (or Enter / Space) on a card: still on the arrival flip -> A; then A <-> B, static */
export function flipTap(card) {
  if (!card) return;
  const c = card.classList, next = c.contains("sa") ? "sb" : "sa";
  c.remove("sa", "sb"); c.add(next);
}
if (typeof document !== "undefined" && !globalThis.__stemFlipTap) {
  globalThis.__stemFlipTap = true;
  document.addEventListener("click", e => flipTap(e.target.closest?.(".vw-flip .fl-card")));
  document.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const c = e.target.closest?.(".vw-flip .fl-card"); if (c) { e.preventDefault(); flipTap(c); } } });
}
