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
