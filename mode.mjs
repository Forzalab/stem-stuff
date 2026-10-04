/* mode.mjs: sugar (saccharine, the default) or diet (the original questions), per browser (design/EASY.md). The cookie stem-mode=diet
   is the one truth: the server reads it on every request (serve.py mode_of), this page reads it here. The code box sets it:
   DIET_<code> = diet, SUGAR_<code> = sugar (ADMIN_ / UNADMIN_, the old names, still work; so does an old stem-mode=hard cookie).
   view() / hidden() mirror serve.py for problems from an uploaded file (the server applies them to its own). Pure but for the cookie. */

export const modeOf = () => /(?:^|;\s*)stem-mode=(?:diet|hard)(?:;|$)/.test(typeof document === "object" ? document.cookie : "") ? "diet" : "sugar";
export function setMode(m) {
  document.cookie = m === "diet" ? "stem-mode=diet; Path=/; Max-Age=31536000; SameSite=Lax" : "stem-mode=; Path=/; Max-Age=0; SameSite=Lax";
}
/* "DIET_BANK_P2X" -> { mode: "diet", rest: "BANK_P2X" }; "SUGAR_p2x" -> { mode: "sugar", rest: "p2x" }; else null */
export function modePrefix(raw) {
  const m = String(raw || "").trim().match(/^#?(DIET|SUGAR|ADMIN|UNADMIN)[\s_-]+(.+)$/i);
  return m ? { mode: /^(DIET|ADMIN)$/i.test(m[1]) ? "diet" : "sugar", rest: m[2] } : null;
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

/* sugar leaves out a question whose answer is "None of these" */
export function hidden(p, mode) {
  if (mode !== "sugar") return false;
  const lk = locks(p), sg = p.saccharine && typeof p.saccharine === "object" ? p.saccharine : {};
  return !!sg.hide || (lk.size > 0 && !sg.split && [...rightsOf(p)].every(id => lk.has(id)));   // pruned, or None as the key (unsplit)
}
/* both modes: no "None of these" (an mc that had it becomes tick-every-true-one; None as the key = the empty set); prove mode (X + typed fix) is gone in both. tries = the authored list's count (2-choice mc = 1, else 2). Untouched problems come back as they are. */
const LAYER = ["tip", "part", "key", "slip", "narration", "saccharine"];
export function view(p, mode) {
  if (!p) return p;
  const block = p.saccharine && typeof p.saccharine === "object", sg = block ? p.saccharine : p;   // schema v2: one "saccharine" block (flat = old)
  if (LAYER.some(k => k in p)) { p = { ...p }; for (const k of LAYER) delete p[k]; }
  if (mode === "sugar") { if (block && sg.title) p.title = sg.title; if (sg.tip) p.tip = sg.tip; }
  if (p.type !== "mc") return p;
  const lk = locks(p);
  if (!lk.size && !p.fix) return p;
  const sh = shown(p), q = { ...p, choices: sh.filter(c => !c.lock), tries: sh.length === 2 ? 1 : 2 };
  if (lk.size) {
    q.pick = "all";
    q.correct = [...rightsOf(p)].filter(id => !lk.has(id)).sort();
    q.wrong = (p.wrong || []).filter(w => !lk.has(w.choice));
    if (q.miss == null) q.miss = NONE_MISS;
  }
  delete q.fix;                                            // no prove mode in either mode (Tony, Oct 3)
  return q;
}
