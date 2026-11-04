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
   column count (blank lines between rows are skipped: models put one between every row). Returns { head, rows, next } (next = the line after the
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
    if (r.length !== head.length) return null;
    rows.push(r); next = j + 1;
  }
  return rows.length ? { head, rows, next } : null;
}
