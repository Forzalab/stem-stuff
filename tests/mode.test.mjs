// mode.mjs: the upload mirror of serve.py hidden() / view() (design/EASY.md, design/REWARDS-WIRING.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hidden } from "../mode.mjs";

const snack = { code: "PHYS_SK1", type: "mc", sugar_only: true, choices: [{ id: "a", md: "1" }, { id: "b", md: "2" }], correct: "a",
  saccharine: { snack: true, before: "PHYS_R1" } };
const real = { code: "PHYS_R1", type: "mc", choices: [{ id: "a", md: "1" }, { id: "b", md: "2" }], correct: "a" };

test("diet leaves out sugar_only items (the snacks); sugar keeps them", () => {
  assert.equal(hidden(snack, "diet"), true);
  assert.equal(hidden(snack, "sugar"), false);
  assert.equal(hidden(real, "diet"), false);
  assert.equal(hidden(real, "sugar"), false);
});

test("sugar view: a snack carries snack, before and its original (serve.py view); diet never sees them", async () => {
  const { view } = await import("../mode.mjs");
  const s = { ...snack, saccharine: { ...snack.saccharine, key: "k", original: { q: 2, body: [{ type: "text", md: "Orig" }], solution: ["Answer: 1"] } } };
  const v = view(s, "sugar");
  assert.equal(v.snack, true); assert.equal(v.before, "PHYS_R1"); assert.deepEqual(v.original.solution, ["Answer: 1"]);
  assert.equal("saccharine" in v, false);
  const d = view(s, "diet");
  assert.equal("snack" in d || "original" in d || "before" in d, false);
  assert.equal("snack" in view(real, "sugar"), false);
});

/* D6 (Oct 7): an old diet/hard browser goes back to sugar once (no flag stem-mode-v=2); after that DIET_ sticks across reloads.
   A fake cookie jar stands in for document.cookie; each import("../mode.mjs?load=N") = one page load. */
function jar(init) {
  const kv = new Map(Object.entries(init)), writes = [];
  return { kv, writes, doc: {
    get cookie() { return [...kv].map(([k, v]) => k + "=" + v).join("; "); },
    set cookie(s) { writes.push(s); const [nv, ...attrs] = s.split(/;\s*/), i = nv.indexOf("=");
      if (attrs.some(a => /^Max-Age=0$/i.test(a))) kv.delete(nv.slice(0, i)); else kv.set(nv.slice(0, i), nv.slice(i + 1)); },
  } };
}
let load = 0;
const page = async j => { globalThis.document = j.doc; try { return await import("../mode.mjs?load=" + ++load); } finally { delete globalThis.document; } };
const as = (j, fn) => { globalThis.document = j.doc; try { fn(); } finally { delete globalThis.document; } };

for (const old of ["diet", "hard"]) test(`D6: stem-mode=${old} without the flag → sugar once, flag set; a later DIET_ sticks across reloads`, async () => {
  const j = jar({ sid: "x", "stem-mode": old });
  let m = await page(j);
  assert.equal(m.modeOf(), "sugar");
  assert.equal(j.kv.has("stem-mode"), false, "the old mode cookie is gone");
  assert.equal(j.kv.get("stem-mode-v"), "2");
  assert.ok(j.writes.includes("stem-mode-v=2; Max-Age=31536000; Path=/; SameSite=Lax"), j.writes.join(" | "));
  assert.equal(j.kv.get("sid"), "x", "nothing else touched");
  const n = j.writes.length;
  m = await page(j);                                       // reload: still sugar, nothing written again
  assert.equal(m.modeOf(), "sugar");
  assert.equal(j.writes.length, n, "once");
  as(j, () => m.setMode(m.modePrefix("DIET_BANK_P2X").mode));
  assert.equal(m.modeOf(), "diet");
  for (let r = 0; r < 2; r++) { m = await page(j); assert.equal(m.modeOf(), "diet", "DIET_ sticks across reload " + r); }
  assert.equal(j.kv.get("stem-mode"), "diet");
  as(j, () => m.setMode(m.modePrefix("SUGAR_BANK_P2X").mode));
  m = await page(j);
  assert.equal(m.modeOf(), "sugar", "SUGAR_ still switches back");
});

test("D6: a throwing cookie (blocked storage, sandboxed frame) never breaks the import: sugar, setMode a no-op", async () => {
  for (const doc of [{ get cookie() { return "stem-mode=diet"; }, set cookie(s) { throw new Error("SecurityError"); } },
                     { get cookie() { throw new Error("SecurityError"); }, set cookie(s) { throw new Error("SecurityError"); } }]) {
    const m = await page({ doc });
    assert.equal(m.modeOf(), "sugar");
    assert.doesNotThrow(() => as({ doc }, () => m.setMode("diet")));
    assert.equal(m.modeOf(), "sugar");
    assert.doesNotThrow(() => m.reset(doc));
  }
});

test("D6: a sugar browser (no mode cookie) just gets the flag; reset() reports only real resets", async () => {
  const j = jar({});
  const m = await page(j);
  assert.equal(m.modeOf(), "sugar");
  assert.equal(j.kv.get("stem-mode-v"), "2");
  assert.equal(m.reset(jar({ "stem-mode": "diet" }).doc), true);
  assert.equal(m.reset(jar({ "stem-mode": "diet", "stem-mode-v": "2" }).doc), false);
  assert.equal(m.reset(jar({}).doc), false);
});
