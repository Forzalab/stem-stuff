/* tug.mjs: the Tug, a push-pull rope for cause -> effect rows (brain plan-2026-11-03/TUG-VIEW.md). Each factor is a bar from the start knot,
   right = up, left = down, longer for a bigger `size`; the rope's end knot is "?" until the answer is earned (net only when the caller passes it).
   Pure: parseRow / dirOf / tugModel make the model, tugHTML turns it into a string (wishHTML builds strings), drawTug into a DOM node. Bar length
   comes from `size` only, never from arithmetic on the move text. */
const DIR = [[/^(?:up|higher|rise|rises|rising|more|increase\w*|▲|↑)(?![a-z])/i, "up"], [/^(?:down|lower|fall|falls|falling|less|decrease\w*|▼|↓)(?![a-z])/i, "down"], [/^same(?![a-z])/i, "same"]];
/* a last-column cell -> { dir, size } (size 1..9, default 1) or null: "up", "Up 3", "↑", "higher" */
export function dirOf(cell) {
  const c = String(cell ?? "").replace(/[*_`]/g, "").trim();
  for (const [re, dir] of DIR) {
    const m = re.exec(c);
    if (m) { const n = /^\s*(\d)\b/.exec(c.slice(m[0].length)); return { dir, size: n && +n[1] >= 1 ? +n[1] : 1 }; }
  }
  return null;
}
/* the Lang row grammar "label | move | up|down|same [size]" (label <= 10, move <= 24) -> { label, move, dir, size } or null */
export function parseRow(s) {
  const p = String(s ?? "").split("|").map(x => x.trim());
  if (p.length !== 3 || !p[0] || p[0].length > 10 || p[1].length > 24) return null;
  const m = /^(up|down|same)(?:\s+([1-9]))?$/i.exec(p[2]);
  return m ? { label: p[0], move: p[1], dir: m[1].toLowerCase(), size: m[2] ? +m[2] : 1 } : null;
}
/* "tug" when a pipe table has >= 2 rows, 2-3 columns and every row's last cell starts with a direction word; any other strict table is a "table" */
export function tableShape(head, rows) {
  const n = head.length;
  return rows.length >= 2 && (n === 2 || n === 3) && rows.every(r => r.length === n && dirOf(r[n - 1])) ? "tug" : "table";
}
/* a pipe table's rows -> the rows tugModel takes (label | move | dir); `of` = the word after "effect on" in the last header cell ("effect on $P$" -> "$P$") */
export function tugFromTable(head, rows) {
  const n = head.length, m = /^\s*(?:effect|change|impact)\s+(?:on|in|to)\s+(.+?)\s*$/i.exec(head[n - 1]);
  return tugModel(rows.map(r => ({ label: r[0], move: n === 3 ? r[1] : "", ...dirOf(r[n - 1]) })), m ? m[1].slice(0, 24) : "");
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
  const rows = m.rows.map(r => `<div class="tg-row"><div class="tg-lab"><b>${line(r.label)}</b>${r.move ? ` <span class="tg-mv">${line(r.move)}</span>` : ""}</div>` +
    `<div class="tg-rope"><span class="tg-bar tg-${r.dir}${r.dir === "up" ? " tn-sky" : r.dir === "down" ? " tn-orange" : ""}" style="--w:${r.w}" aria-hidden="true">${GLYPH[r.dir]}</span></div></div>`).join("");
  const start = `<div class="tg-row tg-start"><div class="tg-lab">${m.of ? line(m.of) : ""}</div><div class="tg-rope"><span class="tg-knot" aria-hidden="true"></span></div></div>`;
  const end = `<div class="tg-row tg-end"><div class="tg-lab"></div><div class="tg-rope"><span class="tg-knot tg-net">${E(m.net || "?")}</span></div></div>`;
  const sr = m.rows.map(r => `<li>${plain(r.label)}${r.move ? ": " + plain(r.move) : ""}, ${SAY[r.dir]}</li>`).join("");
  return `<div class="vw-tug" role="figure" aria-label="${E(m.alt || "pushes and pulls" + (m.of ? " on " + plain(m.of) : ""))}">${start}${rows}${end}<ul class="sr-only">${sr}</ul></div>`;
}
export function drawTug(doc, m, o = {}) {
  const d = doc.createElement("div");
  d.innerHTML = tugHTML(m, o.line);
  return d.firstChild;
}
