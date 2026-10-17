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
