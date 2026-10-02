/* suggest.mjs: the code box's suggestion list (design/STYLE.md, "Code box").
   Pure: no DOM, so tests/suggest.test.mjs can import it. app.js feeds it the codes this browser knows (codes it opened before,
   the live bank code, the live list) and shows what it returns. The server never lists codes (design/NAV.md). */

/* letters and digits only, uppercase: "bank p2x", "BANK_P2X" and "#bank-p2x" all compare the same */
const key = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isBank = c => /^BANK_/.test(c);

/* codes that contain what was typed. Banks first, then questions; inside each group the order the codes came in (the caller
   passes recent first). Duplicates dropped; the exact code already typed is not suggested back. */
export function suggest(typed, codes, limit = 8) {
  const q = key(typed);
  if (!q) return [];
  const seen = new Set(), hits = [];
  for (const c of codes) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const k = key(c);
    if (k.includes(q) && k !== q) hits.push(c);
  }
  return [...hits.filter(isBank), ...hits.filter(c => !isBank(c))].slice(0, limit);
}

/* the recent list: newest first, no duplicates, at most `max` */
export function remember(list, code, max = 40) {
  return [code, ...(list || []).filter(c => c !== code)].slice(0, max);
}
