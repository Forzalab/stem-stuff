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
   lost. A right one rests FAR away; a miss owes a Redeem: the first after a warm-up of NEAR fresh questions, the rest one per PULL. */
export function qMigrate(st, codes, markOf) {
  let k = 0;                                                     // old misses come back one per PULL slots (4, 8, 12...), not back to back
  for (const c of codes) {
    const m = markOf(c);
    if (!m || (!m.x && m.done !== "correct" && m.done !== "out")) continue;
    const ok = m.done === "correct" && !m.x;
    st.seen[c] = { n: 1, right: ok ? 1 : 0, miss: ok ? 0 : 1, last: 0, wait: ok ? FAR : NEAR + PULL * k++, gapIdx: ok ? 0 : 1, owe: !ok, first: ok ? "right" : "wrong", redeem: false, retry: 0 };
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
  const out = (code, why) => ({ code, redeem: !!(S(code) && S(code).owe), again: !!(S(code) && S(code).n), why });   // again: a re-showing (graded fresh)
  const owes = c => !!(S(c) && S(c).owe);
  const owed = ready.filter(owes).sort(soon);
  /* no two redos back to back (Tony Oct 19): the last slot was a Redeem and a non-owed question is ready -> the due miss waits
     ONE slot (the gap is a minimum, D58). Only when its wait is under the tiny-bank cap, so wait + 1 still fits n - 1; only redos
     left -> they go in due order */
  const prev = Object.values(st.seen).some(s => s.last === st.pos && s.redeem), rest = ready.filter(c => !owes(c));
  const hold = prev && rest.length > 0 && owed.length > 0 && (S(owed[0]).wait ?? SKIP) < cap;
  if (owed.length && !hold) return out(owed[0], "miss");
  const pick = hold ? live.filter(c => !owes(c)) : live;           // held: the topic pull and the score skip the owed ones too
  if (t % PULL === 0) {
    const tops = [...new Set(pick.map(topicOf))].sort((a, b) => avg.get(a) - avg.get(b) || hash(st.salt + a) - hash(st.salt + b));
    const inT = pick.filter(c => topicOf(c) === tops[0]), r = inT.filter(c => due(c) <= t);
    return out((r.length ? r.sort(best) : inT.sort(soon))[0], "topic");
  }
  if (hold) return out(rest.sort(best)[0], "score");
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
export function qAnswer(st, code, right, { spam = false } = {}) {
  const s = st.seen[code];
  if (!s || s.last == null) return false;
  if (s.first) { s.retry = (s.retry || 0) + 1; if (right) s.retryRight = (s.retryRight || 0) + 1; return false; }
  if (spam && !right) { s.first = "spam"; s.spam = (s.spam || 0) + 1; return false; }   // a wrong guess in under 2 s (nav.js): logged, the showing counts as a skip; a fast RIGHT pick counts (a Redeem gets paid off)
  s.first = right ? "right" : "wrong";
  if (right) { s.right += 1; s.owe = false; s.gapIdx = 0; s.wait = FAR; }
  else { s.miss += 1; s.owe = true; s.wait = GAPS[s.gapIdx]; s.gapIdx = Math.min(s.gapIdx + 1, GAPS.length - 1); }
  return true;
}
/* what a fresh queue with this salt plays when every showing is skipped (tests pin a salt, like they pinned the old seed) */
export function qFresh(codes, salt, topicOf = family) {
  const st = qNew(salt), out = [];
  for (let i = 0; i < codes.length; i++) { const p = qPick(st, codes, topicOf); qShow(st, p.code); out.push(p.code); }
  return out;
}
/* per bank, never mixed (D64): localStorage stem-q-<bank>. A broken or blocked store reads as a fresh queue. */
export const qKey = bank => "stem-q-" + bank;
export function qLoad(bank, store = globalThis.localStorage) {
  try { const st = JSON.parse(store.getItem(qKey(bank))); if (st && st.v === 1 && st.seen && Number.isInteger(st.pos)) return st; } catch { /* blocked or broken */ }
  return null;
}
export function qSave(bank, st, store = globalThis.localStorage) { try { store.setItem(qKey(bank), JSON.stringify(st)); } catch { /* blocked: this page only */ } }
/* dead-easy (T28, sugar; saccharine.dead): P2, a fresh bank opens with 1-2 of them; P1, one goes before SOME snacks (DEAD_LEAD %, a fixed
   draw per snack and queue salt, so a reload agrees). Each returns the next unseen dead-easy code in deads, or null. */
export const DEAD_LEAD = 40;
export function deadOpen(st, deads) {
  const k = 1 + (hash(st.salt + ":open") & 1), fresh = st.pos === 0 && !Object.keys(st.seen).length;
  return st.pos < k && (fresh || deads.includes(st.hist[0]?.c)) ? deads.find(c => !st.seen[c]) || null : null;
}
export function deadLead(st, deads, snack) {
  return hash(st.salt + ":lead:" + snack) % 100 < DEAD_LEAD ? deads.find(c => !st.seen[c]) || null : null;
}
/* ---------- the noob ramp (DESIGN-v3 §2, Tony #25.6): a first-timer's order; "Shuffle" stays qPick ----------
   tierOf(code) -> 0 for a dead-easy, else the author's noob.tier 1|2|3. The opener (deadOpen) goes first, then new codes from
   st.ramp.tier (the nearest tier, easier first, once that one is spent) in a fixed salt order. From slot REVIEW_FROM, every
   REVIEW_EVERY-th slot re-shows a seen one (qPick over them, so a due miss goes first). Every new one seen -> qPick takes over.
   The gate (rampAnswer, on a first pick only: when qAnswer returned true): RAMP_UP clean ones at the tier -> up one; a 1st miss
   resets the clean count only, a 2nd miss IN A ROW -> down one (floor 1) and the run starts over; a clean one ends the run
   (PLAN §6.6, Oct 26). Pure like qPick; st.ramp {tier, clean, miss} rides along in the saved queue (an old one without miss = 0). */
export const RAMP_UP = 2;         // TUNABLE: clean first picks at a tier to move up
export const REVIEW_FROM = 4;     // TUNABLE: the first re-injection slot
export const REVIEW_EVERY = 5;    // TUNABLE: then one every this many slots
const gate = st => st.ramp || (st.ramp = { tier: 1, clean: 0 });
export function ramp(st, pool, tierOf) {
  const od = deadOpen(st, pool.filter(c => !tierOf(c)));
  if (od) return { code: od, redeem: false, again: false, why: "open" };
  const real = pool.filter(c => tierOf(c)), t = st.pos + 1, tier = st.ramp ? st.ramp.tier : 1, S = c => st.seen[c];
  if (t >= REVIEW_FROM && (t - REVIEW_FROM) % REVIEW_EVERY === 0) {
    const back = real.filter(c => S(c) && S(c).n && S(c).last < st.pos);   // never the one just shown
    if (back.length) return { ...qPick(st, back), why: "review" };
  }
  const d = c => Math.abs(tierOf(c) - tier);
  const fresh = real.filter(c => !(S(c) && S(c).n)).sort((a, b) => d(a) - d(b) || tierOf(a) - tierOf(b) || hash(st.salt + a) - hash(st.salt + b));
  if (fresh.length) return { code: fresh[0], redeem: false, again: false, why: "tier" };
  return qPick(st, real.length ? real : pool);
}
export function rampAnswer(st, code, right, tierOf) {
  const r = gate(st), k = tierOf(code);
  if (!k) return r.tier;                                         // a dead-easy is a warm-up, not a gate pass
  if (!right) { r.clean = 0; r.miss = (r.miss || 0) + 1; if (r.miss >= 2) { r.tier = Math.max(1, r.tier - 1); r.miss = 0; } return r.tier; }
  r.miss = 0;
  if (k >= r.tier && ++r.clean >= RAMP_UP) { r.tier = Math.min(3, r.tier + 1); r.clean = 0; }   // a review of an easier one moves nothing
  return r.tier;
}
/* "Skip this question": up one tier now (cap 3), the clean count starts over */
export function skipAhead(st) { const r = gate(st); r.tier = Math.min(3, r.tier + 1); r.clean = 0; return st; }
/* snacks (sugar, design/REWARDS-WIRING.md: main's fixed "snack, real, real"): each snack goes right before the code it twists
   (beforeOf(code) -> that code, or null for a real). Several snacks with one target keep their order; a snack whose target is not in
   the list stays where it is. The question list runs it, so a snack row sits right above its real. */
export function glue(order, beforeOf) {
  const live = new Set(order.filter(c => !beforeOf(c))), by = new Map();
  const moves = c => { const b = beforeOf(c); return !!b && live.has(b); };
  for (const c of order) if (moves(c)) { const b = beforeOf(c); by.set(b, [...(by.get(b) || []), c]); }
  return order.flatMap(c => moves(c) ? [] : [...(by.get(c) || []), c]);
}
/* ---------- the night-before mock (W103b, PLAN §6.9): the PE3 questions in exam order, one try each, then the misses ----------
   mockList(items, salt): one code per exam position, in order. The position: the item's exam_q, else its title's "X3 Q<n>" (today's
   BANK_P3X; a range "X3 Q10-11" is no position). A template = no twin / parent_template and no "twin" / "twist" in its title. A template
   with twins (SCHEMA.md twin a|b + parent_template) plays one of them, picked by hash(salt + n) so a reload agrees; none -> itself.
   st.mock = mockNew(list) rides in the saved queue (additive, like st.ramp): { list, at, res: { CODE: right }, miss, back, done }. */
const examQ = p => Number.isInteger(p.exam_q) ? p.exam_q : +((/^X3 Q(\d{1,2})\b(?!-)/.exec(p.title || "") || [])[1] || 0);
export function mockList(items, salt = "") {
  const twins = new Map(), at = new Map();
  for (const p of items) if (p.parent_template) twins.set(p.parent_template, [...(twins.get(p.parent_template) || []), p.code]);
  for (const p of items) {
    const n = examQ(p);
    if (n && !p.twin && !p.parent_template && (Number.isInteger(p.exam_q) || !/\b(twin|twist)\b/i.test(p.title)) && !at.has(n)) at.set(n, p.code);
  }
  return [...at.keys()].sort((a, b) => a - b).map(n => {
    const t = at.get(n), tw = (twins.get(t) || []).sort();
    return tw.length ? tw[hash(salt + ":mock:" + n) % tw.length] : t;
  });
}
export const mockNew = list => ({ list: [...list], at: 0, res: {}, miss: null, back: 0, done: false });
/* the mock phase is on for code: no peek, no Cluck hint, no ladder, one try (app.js, peek.js, repair.js read it through nav.js) */
export const mockOn = (m, code) => !!m && !m.done && m.miss === null && m.list.includes(code);
/* a graded first pick in the mock phase; returns true when it counted */
export function mockAnswer(m, code, right) {
  if (!mockOn(m, code) || code in m.res) return false;
  m.res[code] = !!right;
  return true;
}
/* Next: { code, end } (end: the mock just ended, with its score / of), or null when it is all done (the normal queue takes over).
   Unanswered = a miss. The misses come back in exam order, with the normal flow. */
export function mockNext(m) {
  if (!m || m.done) return null;
  if (m.miss === null) {
    if (m.at < m.list.length) return { code: m.list[m.at++], end: false };
    m.miss = m.list.filter(c => m.res[c] !== true);
    const code = m.miss[m.back++] ?? null;
    if (!code) m.done = true;
    return { code, end: true, score: m.list.length - m.miss.length, of: m.list.length };
  }
  if (m.back < m.miss.length) return { code: m.miss[m.back++], end: false };
  m.done = true;
  return null;
}
