/* steps.mjs: Cluck's step badges count 1, 2, 3... in the order the steps appear, whatever digits the model typed.
   Models often write every item of a list as "1." (markdown lazy numbering), and the badge used to print those digits as they came,
   so a second step showed "1" too. A "---" rule ends the steps: the count starts again after it. */
export const WSTEP = /^\s*(\d{1,2})[.)]\s+(.+)$/;
export function renumberSteps(t) {
  let n = 0;
  return t.split("\n").map(l => {
    if (/^\s*---+\s*$/.test(l)) { n = 0; return l; }
    const s = WSTEP.exec(l);
    return s ? `${++n}. ${s[2]}` : l;
  }).join("\n");
}

/* A strict GFM pipe table at lines[i]: a header row, a "|---|" separator row with the same column count, then >=1 body rows, every row the same
   column count (blank lines between rows are skipped: models put one between every row; a short LAST line is a row still arriving, not part of the table). Returns { head, rows, next } (next = the line after the
   last row) or null, and then the caller renders the line as it always did. */
const cells = l => { const m = /^\s*\|(.*)\|\s*$/.exec(l); return m ? m[1].split("|").map(c => c.trim()) : null; };
export function pipeTable(lines, i) {
  const head = cells(lines[i] ?? "");
  if (!head) return null;
  let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
  const sep = cells(lines[j] ?? "");
  if (!sep || sep.length !== head.length || !sep.every(c => /^:?-+:?$/.test(c))) return null;
  const rows = []; let next = ++j;
  for (; j < lines.length; j++) {
    if (!lines[j].trim()) continue;
    const r = cells(lines[j]);
    if (!r) break;
    if (r.length !== head.length) {
      if (lines.slice(j + 1).every(x => !x.trim())) break;                // the last line, cut short while it streams (pipeHold keeps it back)
      return null;
    }
    rows.push(r); next = j + 1;
  }
  return rows.length ? { head, rows, next } : null;
}
/* A table still arriving: the text so far ends in a lone header row, a header + a separator still being typed, a header + separator with no body row yet,
   or a body row cut short. Returns the index to resume at (past the held lines) or null. Held, not drawn: no raw bars flash and the layout does not
   jump when the rows land. A held line opens with "|" then a space or nothing ("|x| = 3", absolute value, is prose). */
const OPEN = /^\s*\|(?: |$)/, SEPISH = /^\s*\|[\s:|-]*$/;
export function pipeHold(lines, i) {
  if (!OPEN.test(lines[i] ?? "")) return null;
  let last = lines.length - 1; while (last > i && !lines[last].trim()) last--;
  if (i === last) return last + 1;                                         // a lone header, or a cut row, at the end
  if (!/^\s*\|/.test(lines[last])) return null;
  const head = cells(lines[i]); if (!head) return null;
  let j = i + 1; while (j < last && !lines[j].trim()) j++;
  if (j === last) return SEPISH.test(lines[last]) || cells(lines[last]) === null || cells(lines[last]).length !== head.length ? last + 1 : null;   // header, then the separator being typed (or a bad line)
  const sep = cells(lines[j]);
  if (!sep || sep.length !== head.length || !sep.every(c => /^:?-+:?$/.test(c))) return null;
  const done = lines.slice(j + 1, last).some(l => l.trim());              // body rows already complete before the last line
  if (!done) return cells(lines[last]) === null || cells(lines[last]).length !== head.length ? last + 1 : null;   // the first row, cut
  return null;
}
