// Tony's Copy Swipe picks (brain design-round-66 TONY-DECISIONS #32, v20/copy-picks/picks/vet-*.json): his own words, as shipped
// in copy/repair-lines.js + copy/pops.js. [[ ]] in a pick is a build note, not copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const w = {}; w.window = w;
vm.runInNewContext(read("../copy/repair-lines.js"), w);
vm.runInNewContext(read("../copy/pops.js"), w);
const R = w.__stemRepairLines, POPS = JSON.parse(JSON.stringify(w.__stemPopLines));   // out of the vm realm, as pops.test.mjs

test("repair open (vet-repair-open): one fault vs more than one; *waddles to you* is the italic aside", () => {
  assert.equal(R.intro.repair, "*waddles to you* Let's fix our mistake—QUACKK— step-by-step.");
  assert.equal(R.intro.repairMany, "*waddles to you* Let's fix our mistakes—QUACKK— step-by-step.");
});
test("repair done (vet-repair-done)", () => assert.equal(R.done, "Nice job! Now, try a similar one, QUAAACK—"));
test("welcome wrong-tap hint (vet-welcome-hint): the fallback line", () => assert.equal(R.hint, "Almost there! Try another option."));
test("signs pop (vet-pop-signs): Tony's words, the existing kaomoji in his slot", () => {
  const signs = POPS.filter(l => l.tag === "signs").map(l => l.text);
  assert.deepEqual(signs, ["The signs all aligned (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Fantastic work!"]);
});
test("the old lines are gone", () => {
  const all = JSON.stringify([R, POPS]);
  for (const old of ["we know where", "Conquered.", "Close. Try another one.", "signs agreed for once"]) assert.ok(!all.includes(old), old);
});
