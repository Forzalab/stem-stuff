/* flip.mjs: the Flip view, one card per row [step, you did, the fix]. Face A (you did, orange, x) then face B (the fix, sky, check).
   The card flips to B after a beat by CSS alone (the pipe fallback is a string: no timer can ride it); a tap flips it back to A
   and again to B (flipTap, one delegated listener). Pure: flipModel makes the model, flipHTML turns it into a string (wishHTML builds
   strings), drawFlip into a DOM node. */
const E = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* any other strict table is a "table"; "step | you did | the fix" (3 columns, <= 4 rows) is a "flip" */
export function tableShape(head, rows) {
  const n = head.length;
  return n === 3 && rows.length <= 4 && /\b(you|your|did|yours)\b/i.test(head[1]) && /\b(fix|right|should|correct)\b/i.test(head[2]) ? "flip" : "table";
}
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
