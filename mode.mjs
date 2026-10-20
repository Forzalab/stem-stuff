/* mode.mjs: sugar (saccharine, the default) or diet (the original questions), per browser (design/EASY.md). The cookie stem-mode=diet
   is the one truth: the server reads it on every request (serve.py mode_of), this page reads it here. The code box sets it:
   DIET_<code> = diet, SUGAR_<code> = sugar (ADMIN_ / UNADMIN_, the old names, still work).
   D6 (Oct 7): a diet/hard cookie counts only beside stem-mode-v=2. A browser with the old cookie and no flag goes back to sugar
   once, silently (reset(), run on import, before app.js asks anything); setMode() always sets the flag, so a DIET_ entry sticks.
   view() / hidden() mirror serve.py for problems from an uploaded file (the server applies them to its own). Pure but for the cookie. */

const DOC = typeof document === "object" ? document : null;
const OLD = /(?:^|;\s*)stem-mode=(?:diet|hard)(?:;|$)/, V2 = /(?:^|;\s*)stem-mode-v=2(?:;|$)/;
const FLAG = "stem-mode-v=2; Max-Age=31536000; Path=/; SameSite=Lax";
/* cookies can throw (blocked storage, sandboxed frame): never at import (= a blank page); no cookie = sugar */
const read = doc => { try { return doc ? String(doc.cookie) : ""; } catch { return ""; } };
const write = (doc, s) => { try { doc.cookie = s; return true; } catch { return false; } };
export function reset(doc = DOC) {                         // true = an old diet/hard browser was put back on sugar
  const c = read(doc);
  if (!doc || V2.test(c)) return false;
  const old = OLD.test(c);
  if (old) write(doc, "stem-mode=; Path=/; Max-Age=0; SameSite=Lax");
  write(doc, FLAG);
  return old;
}
reset();
export const modeOf = (doc = DOC) => { const c = read(doc); return OLD.test(c) && V2.test(c) ? "diet" : "sugar"; };
/* diet first, then the flag: both are capped at 7 days on iOS (ITP, JS cookies), so the flag never expires before the diet cookie */
export function setMode(m, doc = typeof document === "object" ? document : null) {
  if (!doc) return;
  write(doc, m === "diet" ? "stem-mode=diet; Path=/; Max-Age=31536000; SameSite=Lax" : "stem-mode=; Path=/; Max-Age=0; SameSite=Lax");
  write(doc, FLAG);
}
/* One-time sugar switch (Tony, Oct 17): bank -> campaign id. A browser that opens one of these banks with no marker for that id is put on
   sugar (same setMode path: cookie + v2 flag), the marker is written, and app.js refetches. After the marker, DIET_ sticks. Add a row to run a
   new campaign (a new id forces again); the marker is the cookie stem-force-sugar-<bank>=<id> (a cookie so serve.py can see it too). */
export const FORCE_SUGAR_ONCE = { BANK_CEQ: "2026-10-17" };
/* code: a bank code (BANK_CEQ) or a question code (CEQ_Q1, its bank is BANK_CEQ). true = the mode was switched just now (reopen what is open).
   Storage that throws or does not keep the marker = do nothing (never a loop). Idempotent: the second call is always false. */
export function forceSugarOnce(code, table = FORCE_SUGAR_ONCE, doc = DOC) {
  const c = String(code || ""), bank = /^BANK_/.test(c) ? c : "BANK_" + c.split("_")[0];
  const id = Object.hasOwn(table, bank) ? table[bank] : null;
  if (!id || !doc) return false;
  const key = "stem-force-sugar-" + bank, has = () => read(doc).split(/;\s*/).includes(key + "=" + id);
  if (has()) return false;
  const was = modeOf(doc);
  if (!write(doc, `${key}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`) || !has()) return false;   // marker first: if it cannot stick, do not switch
  if (was === "sugar") return false;                                                                  // already sugar: just the marker
  setMode("sugar", doc);
  return true;
}
/* "DIET_BANK_P2X" ->{ mode: "diet", rest: "BANK_P2X" }; "SUGAR_p2x" -> { mode: "sugar", rest: "p2x" }; else null */
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
export const NONE_MISS = "QUACK. Did you consider any of the unticked option(s)? Sussy. ಠ\u2060_\u2060ಠ QUACK.";   // serve.py NONE_MISS

/* sugar leaves out a question whose answer is "None of these"; diet leaves out every sugar_only item (the snacks) */
export function hidden(p, mode) {
  if (mode !== "sugar") return !!(p && p.sugar_only);
  const lk = locks(p), sg = p.saccharine && typeof p.saccharine === "object" ? p.saccharine : {};
  return !!sg.hide || (lk.size > 0 && !sg.split && [...rightsOf(p)].every(id => lk.has(id)));   // pruned, or None as the key (unsplit)
}
/* both modes: no "None of these" (an mc that had it becomes tick-every-true-one; None as the key = the empty set); prove mode (X + typed fix) is gone in both. tries = the authored list's count (2-choice mc = 1, else 2). Untouched problems come back as they are. */
const LAYER = ["tip", "part", "key", "slip", "narration", "saccharine"];
export function view(p, mode) {
  if (!p) return p;
  const block = p.saccharine && typeof p.saccharine === "object", sg = block ? p.saccharine : p;   // schema v2: one "saccharine" block (flat = old)
  if (LAYER.some(k => k in p)) { p = { ...p }; for (const k of LAYER) delete p[k]; }
  if (mode === "sugar") {
    if (block && sg.title) p.title = sg.title; if (sg.tip) p.tip = sg.tip;
    if (block && sg.snack) {                                 // serve.py view(): a snack's target and its original
      p.snack = true;
      if (sg.before) p.before = sg.before;
      const o = sg.original;
      if (o && typeof o === "object" && o.body) p.original = Object.fromEntries(["q", "body", "solution"].filter(k => k in o).map(k => [k, o[k]]));
    }
  }
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
