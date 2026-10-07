/* shuffle.mjs: the seeded shuffle for an uploaded bank, used by app.js (MC choices); the question order is the queue below (nav.js).
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
export const family = code => code.replace(/_(.).*/, "_$1");   // the topic fallback: prefix + first suffix letter (CSCI26_C2A -> CSCI26_C)

/* ---------- the queue (design/plans/QUEUE.md, D49/D56-D64): a hidden, Spotify-like play order, one per bank ----------
   State st = { v, salt, pos, seen: { CODE: { n, right, miss, last, wait, gapIdx, owe, first, redeem, retry } }, hist, at }.
   pos = showings so far (the next slot is pos + 1). Pure: qPick / qShow / qAnswer read and write only st, so the same state gives
   the same pick (tests), and a JSON round trip (localStorage) changes nothing. */
export const GAPS = [3, 8, 20];   // a missed question comes back after 3, then 8, then 20 other questions (D58)
export const FAR = 30;            // a right first pick: this many others before it may come back
export const SKIP = 8;            // shown, never answered (Next): it comes back like a second miss, owing nothing
export const NEAR = 3;            // never the same code within 3 slots
export const PULL = 4;            // every 4th slot pulls the least-seen topic (D59)
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); return (h ^ (h >>> 13)) >>> 0; };
export function qNew(salt = "") { return { v: 1, salt: String(salt), pos: 0, seen: {}, hist: [], at: -1 }; }
/* the first open of a bank under the queue: the marks already saved (server or this browser) become history, so no progress is
   lost. A right one rests FAR away; a miss owes a Redeem and comes back after a short warm-up of NEAR fresh questions. */
export function qMigrate(st, codes, markOf) {
  for (const c of codes) {
    const m = markOf(c);
    if (!m || (!m.x && m.done !== "correct" && m.done !== "out")) continue;
    const ok = m.done === "correct" && !m.x;
    st.seen[c] = { n: 1, right: ok ? 1 : 0, miss: ok ? 0 : 1, last: 0, wait: ok ? FAR : NEAR, gapIdx: ok ? 0 : 1, owe: !ok, first: ok ? "right" : "wrong", redeem: false, retry: 0 };
  }
  return st;
}
/* the next slot's pick from pool (the bank's real questions, snacks left out), topicOf(code) -> topic.
   Returns { code, redeem, why } or null for an empty pool. Tiers: a due miss (earliest first) > the 4th-slot topic pull > the
   best score among the due > the soonest due. Never a code shown in the last NEAR slots; a tiny bank caps every gap at n - 1. */
export function qPick(st, pool, topicOf = family) {
  const n = pool.length;
  if (!n) return null;
  const t = st.pos + 1, cap = Math.max(0, n - 1), near = Math.min(NEAR, cap);
  const S = c => st.seen[c];
  const due = c => { const s = S(c); return !s || !s.n || s.last == null ? 0 : s.last + Math.min(s.wait ?? SKIP, cap) + 1; };
  const avg = new Map(), size = new Map();
  for (const c of pool) { const k = topicOf(c), s = S(c); size.set(k, (size.get(k) || 0) + 1); avg.set(k, (avg.get(k) || 0) + (s ? s.n : 0)); }
  for (const [k, v] of avg) avg.set(k, v / size.get(k));
  const most = Math.max(...avg.values());
  const score = c => { const s = S(c) || {}; return (most - avg.get(topicOf(c))) + (s.n ? 0 : 1) + 0.5 * (s.miss || 0) - 0.5 * (s.right || 0); };
  const tie = c => hash(st.salt + c);
  const best = (a, b) => score(b) - score(a) || tie(a) - tie(b);
  const soon = (a, b) => due(a) - due(b) || best(a, b);
  const free = pool.filter(c => { const s = S(c); return !s || s.last == null || t - s.last > near; });
  const live = free.length ? free : pool;
  const ready = live.filter(c => due(c) <= t);
  const out = (code, why) => ({ code, redeem: !!(S(code) && S(code).owe), why });
  const owed = ready.filter(c => S(c) && S(c).owe).sort(soon);
  if (owed.length) return out(owed[0], "miss");
  if (t % PULL === 0) {
    const tops = [...new Set(live.map(topicOf))].sort((a, b) => avg.get(a) - avg.get(b) || hash(st.salt + a) - hash(st.salt + b));
    const inT = live.filter(c => topicOf(c) === tops[0]), r = inT.filter(c => due(c) <= t);
    return out((r.length ? r.sort(best) : inT.sort(soon))[0], "topic");
  }
  if (ready.length) return out(ready.sort(best)[0], "score");
  return out([...live].sort(soon)[0], "soonest");
}
/* a showing starts: the slot moves on; its first pick is still to come. redeem = it came back owing a miss (D60/D61 data flag). */
export function qShow(st, code) {
  st.pos += 1;
  const s = st.seen[code] || (st.seen[code] = { n: 0, right: 0, miss: 0, last: null, wait: null, gapIdx: 0, owe: false, first: null, redeem: false, retry: 0 });
  s.n += 1; s.last = st.pos; s.first = null; s.redeem = !!s.owe;
  s.wait = SKIP;                                                 // until a first pick lands
  return st;
}
/* a graded pick on code. ONLY the first pick of a showing moves the queue: right -> rest FAR, the gaps start over; wrong -> back
   after GAPS[gapIdx] others, and the next miss waits longer. A later pick (a retry-right after the ghost) is logged, nothing else.
   Returns true when it moved the queue. */
export function qAnswer(st, code, right) {
  const s = st.seen[code];
  if (!s || s.last == null) return false;
  if (s.first) { s.retry = (s.retry || 0) + 1; if (right) s.retryRight = (s.retryRight || 0) + 1; return false; }
  s.first = right ? "right" : "wrong";
  if (right) { s.right += 1; s.owe = false; s.gapIdx = 0; s.wait = FAR; }
  else { s.miss += 1; s.owe = true; s.wait = GAPS[s.gapIdx]; s.gapIdx = Math.min(s.gapIdx + 1, GAPS.length - 1); }
  return true;
}
/* per bank, never mixed (D64): localStorage stem-q-<bank>. A broken or blocked store reads as a fresh queue. */
export const qKey = bank => "stem-q-" + bank;
export function qLoad(bank, store = globalThis.localStorage) {
  try { const st = JSON.parse(store.getItem(qKey(bank))); if (st && st.v === 1 && st.seen && Number.isInteger(st.pos)) return st; } catch { /* blocked or broken */ }
  return null;
}
export function qSave(bank, st, store = globalThis.localStorage) { try { store.setItem(qKey(bank), JSON.stringify(st)); } catch { /* blocked: this page only */ } }
/* snacks (sugar, design/REWARDS-WIRING.md: main's fixed "snack, real, real"): each snack goes right before the code it twists
   (beforeOf(code) -> that code, or null for a real). Several snacks with one target keep their order; a snack whose target is not in
   the list stays where it is. The question list runs it, so a snack row sits right above its real. */
export function glue(order, beforeOf) {
  const live = new Set(order.filter(c => !beforeOf(c))), by = new Map();
  const moves = c => { const b = beforeOf(c); return !!b && live.has(b); };
  for (const c of order) if (moves(c)) { const b = beforeOf(c); by.set(b, [...(by.get(b) || []), c]); }
  return order.flatMap(c => moves(c) ? [] : [...(by.get(c) || []), c]);
}
