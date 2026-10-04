/* shuffle.mjs: the seeded shuffle for an uploaded bank, shared by app.js (MC choices) and nav.js (question order).
   Same seed -> same order, so it survives a reload. Items with .lock keep their slot (MC "none of these"). */
export function shuffled(items, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const free = items.map((c, i) => c && c.lock ? -1 : i).filter(i => i >= 0), moved = free.map(i => items[i]);
  for (let i = moved.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [moved[i], moved[j]] = [moved[j], moved[i]]; }
  const out = [...items];
  free.forEach((i, k) => { out[i] = moved[k]; });
  return out;
}
/* a random id kept in this browser under key; newSeed() replaces it. Storage blocked -> the fixed fallback */
export function seed(key, fallback) {
  try { let s = localStorage.getItem(key); if (!s) { s = newSeed(key); } return s; }
  catch { return fallback; }
}
export function newSeed(key) {
  const s = Math.random().toString(36).slice(2);
  try { localStorage.setItem(key, s); } catch { /* blocked: this page only */ }
  return s;
}
/* mastery order (design/NAV.md "Mastery order"): order = the seeded list, recOf(code) -> { x, done } | null, cur = the open code.
   Answered (done correct | out) first, in seeded order; then cur if it is still open; then the rest, the families with the most
   wrong tries first (family = prefix + first letter of the suffix: CSCI26_C2A -> CSCI26_C). Stable: seeded order breaks ties. */
export const family = code => code.replace(/_(.).*/, "_$1");
export function mastery(order, recOf, cur) {
  const rec = c => recOf(c) || null, answered = c => { const r = rec(c); return !!r && (r.done === "correct" || r.done === "out"); };
  const weight = new Map();
  for (const c of order) { const r = rec(c), f = family(c); weight.set(f, (weight.get(f) || 0) + ((r && r.x) || 0)); }
  const done = order.filter(answered), open = order.filter(c => !answered(c));
  const head = open.includes(cur) ? [cur] : [];
  const rest = open.filter(c => c !== cur).map((c, i) => ({ c, i, w: weight.get(family(c)) }))
    .sort((a, b) => b.w - a.w || a.i - b.i).map(o => o.c);
  return [...done, ...head, ...rest];
}
/* snacks (sugar, design/REWARDS-WIRING.md: main's fixed "snack, real, real"): each snack goes right before the code it twists
   (beforeOf(code) -> that code, or null for a real). Several snacks with one target keep their order; a snack whose target is not in
   the list stays where it is. Runs after mastery(), so the shuffle and the mastery sort never pull a snack away from its real. */
export function glue(order, beforeOf) {
  const live = new Set(order.filter(c => !beforeOf(c))), by = new Map();
  const moves = c => { const b = beforeOf(c); return !!b && live.has(b); };
  for (const c of order) if (moves(c)) { const b = beforeOf(c); by.set(b, [...(by.get(b) || []), c]); }
  return order.flatMap(c => moves(c) ? [] : [...(by.get(c) || []), c]);
}
