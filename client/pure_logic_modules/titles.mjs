// titles.mjs: is a problem title a human title, or a slug? (ES module, pure; also read by tools/bank_tools/schema-check.mjs.)
// A slug is a label for the author ("X3 Q4 twin rectangle Ix Iy Iz", "ch7_card_1"), never for the student. The card shows NO big title for one,
// and the question list falls back to what it uses for an untitled item (nav.js titleOf). SCHEMA.md "title": 2 to 6 words, human, $math$ allowed.
// The rule is deliberately small. Slug-like when ANY of (rules 1 to 4):
//   1. empty or not a string;
//   2. it is the item's code turned into words (code lower-cased, `_`/`-` to spaces), or just the code;
//   3. it has no spaces but has `_` or `-` between lowercase words (snake / kebab);
//   4. it has a code-ish token ([a-z]{1,2}\d+ : q4, x3, ch7, ex2) among its FIRST TWO words, and no `:` / middle dot / dash (a separator
//      means a prefix + a human label: "Q11 Q1(a): net torque" stays);
// Not a slug: anything with $math$ or a separator, or a title whose first two words are not code-ish ("Rectangle: $I_x, I_y, I_z$").
// False-positive risks (a real title hidden): a real title that starts with a short word + digit and has no separator ("Q1 review", "Ch7 Terms",
// "W2 Recap", "Q2 of the exam"); a title that is exactly the code in words. False negatives (a slug kept): a slug with a separator ("HW11 #8: beads on a rod"),
// or one with no code-ish token ("twin rectangle inertia"). Those need a human to rewrite them (schema-check warns only on old banks).
const codeWords = c => String(c ?? "").toLowerCase().replace(/[_\-\s]+/g, " ").trim();
export function isSlugTitle(title, code) {
  if (typeof title !== "string") return true;
  const t = title.trim().replace(/\s+/g, " ");
  if (!t) return true;
  const low = t.toLowerCase();
  if (code && (low === codeWords(code) || low === String(code).toLowerCase())) return true;
  const words = t.split(" ");
  if (words.length === 1 && /[a-z0-9][_-][a-z0-9]/i.test(t) && !/[A-Z]/.test(t.slice(1)) && !/\$/.test(t)) return true;
  if (!/[:·—]/.test(t) && words.slice(0, 2).some(w => /^[a-z]{1,2}\d+$/i.test(w))) return true;   // "Q4 ...: a human label" is a prefixed title, kept
  return false;
}
/* NO-MAGIC-CODE (Tony Nov 18: "no magic code in title like x3 q4, makes no sense for students"): an author's code token: exam / question / homework / chapter
   tags (X3, Q4, Q1(a), HW11, Ch7, Ex2, WA3, WS7, PE2, D1, W2) and "#8". Known prefixes only, so v0, t2, CO2, H2O are not codes. $math$ is never looked at. */
const CODE_TOK = /^(?:(?:q|x|ch|hw|ex|wa|ws|pe|d|w)\d+(?:-\d+)?(?:\([a-z0-9]\))?|#\d+)$/i;
const bare = w => w.replace(/^[(\[]+|[)\]:;,.·—–-]+$/g, "");
export const titleCodes = title => String(title ?? "").replace(/\$[^$]*\$/g, " ").split(/\s+/).filter(w => CODE_TOK.test(bare(w)) || CODE_TOK.test(w.replace(/[:;,.·—–-]+$/, "")));
/* the title to show (card + list): "" for a slug / none; a "CODE CODE: human label" title loses its code prefix ("Q11 Q1(a): net torque about the axle"
   -> "Net torque about the axle"); a title that still holds a code after that shows nothing */
export function cardTitle(title, code) {
  if (isSlugTitle(title, code)) return "";
  let t = String(title).trim().replace(/\s+/g, " ");
  const m = t.match(/^(.*?)\s*[:·—]\s*(.+)$/);
  if (m && titleCodes(m[1]).length && m[1].split(" ").every(w => titleCodes(w).length)) t = m[2].charAt(0).toUpperCase() + m[2].slice(1);
  return titleCodes(t).length ? "" : t;
}
