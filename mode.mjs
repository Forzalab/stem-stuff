/* mode.mjs: easy (the default) or hard, per browser (design/EASY.md). The cookie stem-mode=hard is the one truth: the server
   reads it on every request (serve.py mode_of), this page reads it here. The code box sets it: ADMIN_<code> = hard, UNADMIN_<code> = easy.
   view() / hidden() mirror serve.py for problems from an uploaded file (the server applies them to its own). Pure but for the cookie. */

export const modeOf = () => /(?:^|;\s*)stem-mode=hard(?:;|$)/.test(typeof document === "object" ? document.cookie : "") ? "hard" : "easy";
export function setMode(m) {
  document.cookie = m === "hard" ? "stem-mode=hard; Path=/; Max-Age=31536000; SameSite=Lax" : "stem-mode=; Path=/; Max-Age=0; SameSite=Lax";
}
/* "ADMIN_BANK_P2X" -> { mode: "hard", rest: "BANK_P2X" }; "UNADMIN_p2x" -> { mode: "easy", rest: "p2x" }; else null */
export function modePrefix(raw) {
  const m = String(raw || "").trim().match(/^#?(UN)?ADMIN[\s_-]+(.+)$/i);
  return m ? { mode: m[1] ? "easy" : "hard", rest: m[2] } : null;
}

const SHOWN = 5;
const rightsOf = p => new Set([].concat(p.correct));
function shown(p) {                                       // app.js shown() / serve.py shown()
  const ch = p.choices;
  if (ch.length <= SHOWN) return ch;
  const right = rightsOf(p), keep = ch.filter(c => right.has(c.id) || c.lock);
  keep.push(...ch.filter(c => !keep.includes(c)).slice(0, Math.max(0, SHOWN - keep.length)));
  return ch.filter(c => keep.includes(c));
}
const locks = p => p.type === "mc" ? new Set(shown(p).filter(c => c.lock).map(c => c.id)) : new Set();
export const NONE_MISS = "QUACK. A true one is still unticked, or a false one is ticked. Check every row again.";   // serve.py NONE_MISS

/* easy leaves out a question whose answer is "None of these" */
export function hidden(p, mode) {
  const lk = locks(p);
  return mode === "easy" && lk.size > 0 && [...rightsOf(p)].every(id => lk.has(id));
}
/* both modes: no "None of these" (an mc that had it becomes tick-every-true-one; None as the key = the empty set); easy also drops
   prove mode. tries = the authored list's count (2-choice mc = 1, else 2). Untouched problems come back as they are. */
export function view(p, mode) {
  if (p && mode === "hard" && "tip" in p) { p = { ...p }; delete p.tip; }   // the "what to do" line: easy only
  if (!p || p.type !== "mc") return p;
  const lk = locks(p);
  if (!lk.size && (mode === "hard" || !p.fix)) return p;
  const sh = shown(p), q = { ...p, choices: sh.filter(c => !c.lock), tries: sh.length === 2 ? 1 : 2 };
  if (lk.size) {
    q.pick = "all";
    q.correct = [...rightsOf(p)].filter(id => !lk.has(id)).sort();
    q.wrong = (p.wrong || []).filter(w => !lk.has(w.choice));
    if (q.miss == null) q.miss = NONE_MISS;
  }
  if (mode === "easy") delete q.fix;
  return q;
}
