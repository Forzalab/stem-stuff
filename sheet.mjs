/* sheet.mjs: the pure parts of Cluck's phone sheet (app.js clEl). Ported from the chat-redesign unified-v4 mock (frame.js).
   pos = the sheet's top edge in px: 0 = full screen, peek = the docked top (app.js clTop), h = gone (slid off the bottom). */
export const clampPos = (pos, h) => Math.min(h, Math.max(0, pos));
/* 0 at the docked top, 1 at full screen: radius and dim follow it (round -> square) */
export const progress = (pos, peek) => peek > 0 ? Math.min(1, Math.max(0, 1 - pos / peek)) : 1;
export const radiusAt = (pos, peek, r0) => +(r0 * (1 - progress(pos, peek))).toFixed(2);
/* the dim: 80% at the dock, ramping to 96% at full; sliding down past the dock it fades out with the sheet (h = the window's height). A hard dim, never a blur. */
export function dimAt(pos, peek, h, base = 0.8, hard = 0.96) {
  if (pos > peek) return +(base * Math.max(0, 1 - (pos - peek) / Math.max(1, h - peek))).toFixed(3);
  return +(base + (hard - base) * progress(pos, peek)).toFixed(3);
}
/* release: v = px/s (+ = down). A fling (400 px/s+) goes one snap point its way; slower = the nearest. 64px down from the dock closes. */
/* fromFull: the drag began on a full-screen sheet; it comes back to the dock, a second drag from there closes (never full -> gone in one swipe) */
export function snapTo(pos, peek, h, v = 0, fromFull = false) {
  const to = snap1(pos, peek, h, v);
  return fromFull && to === h ? peek : to;
}
function snap1(pos, peek, h, v) {
  if (v < -400) return pos > peek ? peek : 0;
  if (v > 400) return pos < peek ? peek : pos > peek + 24 ? h : peek;
  return pos > peek + 64 ? h : pos < peek / 2 ? 0 : peek;
}
