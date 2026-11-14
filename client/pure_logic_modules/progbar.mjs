/* progbar.mjs: state + rules of the notch progress bar (topbar-v9, brain ui-polish/topbar-v9/SPEC.md §2-§3; PORT-ARCH §D2 P3).
   Pure: no DOM, no storage, no globals; every fn reads/writes only st, so a JSON round trip changes nothing (the caller persists
   it under pbKey(bank) = "stem-pb:<bank>"). Not wired yet (P4 feeds it from record()/finish()/settle()).
   State st = { v, n, notches: [{ q, f, c }], run, sets }. Set = CURRENT set only, n = 7 notches, filled in ANSWERED order, one per
   submit (opening a question = nothing). f = fraction right 0..1 (1 right, 0 wrong, between = partial: multi-part k/n, proof
   partial 1/2, typed/MC/TF/pick-all 0 or 1). c = this notch counted toward the streak (a full right that was not a retry).
   run = own streak counter (consecutive full rights, NOT the engine streak); it carries across sets.
   Streak: starts at the 3rd full right in a row; the WHOLE run lights (view().streak) and only the live run: a wrong or partial
   breaks it and its notches fall back to plain right. Retry wrong -> right (ev.retry): the question's notch in the current set
   flips in place (appended if its set is gone), shows right, earns no streak credit and leaves run as it is.
   Notch states in view(): empty | next (ringed, the first empty) | right | wrong | partial; streak is a flag on right notches. */
export const SET_SIZE = 7;
export const STREAK_AT = 3;
export const pbKey = bank => "stem-pb:" + bank;
export function pbNew(n = SET_SIZE) { return { v: 1, n, notches: [], run: 0, sets: 0 }; }
/* Tolerant load of a saved/JSON state: anything off -> a fresh state (a bar must never throw). */
export function pbLoad(raw, n = SET_SIZE) {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || o.v !== 1 || !Array.isArray(o.notches)) return pbNew(n);
    const size = Number.isInteger(o.n) && o.n > 0 ? o.n : n;
    const notches = o.notches.slice(0, size).map(x => ({ q: x && x.q != null ? x.q : null, f: clamp(x && x.f), c: !!(x && x.c) }));
    return { v: 1, n: size, notches, run: Math.max(0, o.run | 0), sets: Math.max(0, o.sets | 0) };
  } catch (e) { return pbNew(n); }
}
const clamp = f => { f = Number(f); return f >= 1 ? 1 : f > 0 ? f : 0; };
/* ev = { q, f, retry }. f = fraction right (a boolean works: true = 1). left = questions still unanswered in the bank after this
   one (optional): 0 ends the set early, so the reward fires. Returns { done, index, streak }: done = the set is closed (7th notch or
   early end; the caller shows the reward on the Next press, then calls pbNext); index = the notch slot touched; streak = the live
   run is lit now. A full set takes no more submits (ignored, index -1) until pbNext. */
export function pbSubmit(st, ev, left) {
  const f = clamp(ev.f === true ? 1 : ev.f);
  const q = ev.q != null ? ev.q : null;
  if (ev.retry) {
    const i = q == null ? -1 : st.notches.findIndex(x => x.q === q);
    if (i >= 0) { st.notches[i] = { q, f, c: false }; return out(st, i, left); }
    if (pbFull(st)) return out(st, -1, left);
    st.notches.push({ q, f, c: false });
    return out(st, st.notches.length - 1, left);
  }
  if (pbFull(st)) return out(st, -1, left);
  st.run = f === 1 ? st.run + 1 : 0;
  st.notches.push({ q, f, c: f === 1 });
  return out(st, st.notches.length - 1, left);
}
const out = (st, index, left) => ({ done: pbFull(st) || (left === 0 && st.notches.length > 0), index, streak: pbLit(st).some(Boolean) });
export const pbFull = st => st.notches.length >= st.n;
/* Next set: empty bar, sets + 1; run carries. Call on the Next press after the reward. */
export function pbNext(st) { st.notches = []; st.sets += 1; return st; }
/* Which notches (by index) are in the live run: walk back from the newest notch, spend the run budget on counted rights (retry
   rights pass for free), stop at a wrong/partial or when the budget is gone; lit only when run >= STREAK_AT. */
function pbLit(st) {
  const lit = st.notches.map(() => false);
  if (st.run < STREAK_AT) return lit;
  let budget = st.run;
  for (let i = st.notches.length - 1; i >= 0 && budget > 0; i--) {
    const x = st.notches[i];
    if (x.f !== 1) break;
    if (x.c) { lit[i] = true; budget--; }
  }
  return lit;
}
/* Render model: n slots, [{ state, f, streak }]. Partial draws right hue bottom-up to f, wrong hue above. */
export function pbView(st) {
  const lit = pbLit(st);
  const next = Math.min(st.notches.length, st.n);
  return Array.from({ length: st.n }, (_, i) => {
    const x = st.notches[i];
    if (!x) return { state: i === next ? "next" : "empty", f: 0, streak: false };
    const state = x.f === 1 ? "right" : x.f === 0 ? "wrong" : "partial";
    return { state, f: x.f, streak: lit[i] && state === "right" };
  });
}
