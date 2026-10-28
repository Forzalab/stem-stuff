// Tony's Copy Swipe picks (brain design-round-66 TONY-DECISIONS #32 + #36, v20/copy-picks + v21/copy-swipe-2 picks): his own
// words, as shipped in copy/repair-lines.js + copy/pops.js. [[ ]] in a pick is a build note, not copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const w = {}; w.window = w;
vm.runInNewContext(read("../copy/repair-lines.js"), w);
vm.runInNewContext(read("../copy/pops.js"), w);
const R = JSON.parse(JSON.stringify(w.__stemRepairLines)), POPS = JSON.parse(JSON.stringify(w.__stemPopLines));   // out of the vm realm
const SAD = "(╥﹏╥)", ENC = "(ง •̀_•́)ง";   // builder-picked kaomoji for #36 [[sad/encouraging kaomoji]], Tony OK'd Oct 26

test("repair open (#36): one line for one fault or many; *waddles over* is the italic aside", () => {
  assert.equal(R.intro.repair, "*waddles over* Let's fix this together—QUACKK!");
});
test("repair miss + later (#36)", () => {
  assert.equal(R.miss, "Whoops! Let's try again.");
  assert.equal(R.later, "This can wait!");
});
test("repair done (#36): doneBy by level, then the tail; done (string) = L1 + tail for an older repair.js", () => {
  assert.deepEqual(R.doneBy, { L1: "You did perfectly!", L2: "Way to hang in!", L3: "You'll master it soon!",
    tail: " Now, try a similar one, QUAAACK—" });
  assert.equal(R.done, "You did perfectly! Now, try a similar one, QUAAACK—");
});
test("welcome wrong-tap hint (#36): hintBy far rotation, the second try, third+ rotation; hint (string) = far[0]", () => {
  assert.deepEqual(R.hintBy, {
    far: ["Good attempt, but keep trying!", `That's not it ${SAD} Keep calm and carry on!`, "First time?"],
    two: `Two tries is normal. Two tries, never too much. ${ENC}`,
    three: ["Third time's the charm.", "Who says three failures are bad?"]
  });
  assert.equal(R.hint, "Good attempt, but keep trying!");
});
test("the builder kaomoji lines are vetted (Tony OK'd, Oct 26): no COPY-PENDING left on them", () => {
  const src = read("../copy/repair-lines.js").split("\n");
  for (const k of [SAD, ENC]) assert.doesNotMatch(src.find(l => l.includes(k)), /COPY-PENDING/, k);
});
test("cut lines (#36): intro.repairMany gone; intro.full and auto are empty strings (older repair.js prints nothing)", () => {
  assert.equal(R.intro.repairMany, undefined);
  assert.equal(R.intro.full, "");
  assert.equal(R.auto, "");
});
test("every key an older repair.js reads stays a string", () => {
  for (const k of ["miss", "hint", "auto", "why", "done", "later", "check", "next", "skip"]) assert.equal(typeof R[k], "string", k);
  for (const k of ["repair", "fallback", "alt", "welcome", "full"]) assert.equal(typeof R.intro[k], "string", k);
});
test("unchanged lines stay", () => {
  assert.deepEqual([R.intro.fallback, R.intro.alt, R.intro.welcome, R.why, R.check, R.next, R.skip],
    ["QUACK. Let's walk it through, one step at a time.", "QUACK. Let's waddle a different path!", "Ready to waddle through some forces?",
     "Why is that?", "Check", "Next", "Skip for now"]);
});
test("signs pop (vet-pop-signs): Tony's words, the existing kaomoji in his slot", () => {
  const signs = POPS.filter(l => l.tag === "signs").map(l => l.text);
  assert.deepEqual(signs, ["The signs all aligned (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Fantastic work!"]);
});
test("the old lines are gone", () => {
  const all = JSON.stringify([R, POPS]);
  for (const old of ["we know where", "Conquered.", "Close. Try another one.", "signs agreed for once", "*waddles to you*",
    "Almost there! Try another option.", "Not that one. Look again.", "Come back to this one later.", "Here it is. Read why",
    "Nice job!", "Here's the whole way through"]) assert.ok(!all.includes(old), old);
});
