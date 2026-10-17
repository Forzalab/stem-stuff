// mode.mjs forceSugarOnce: BANK_CEQ switches a diet browser to sugar once; a later DIET_ sticks; other banks untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forceSugarOnce, setMode, modeOf } from "../mode.mjs";

function jar(init = {}, { dead = false } = {}) {
  const kv = new Map(Object.entries(init));
  return { kv, get cookie() { return [...kv].map(([k, v]) => k + "=" + v).join("; "); },
    set cookie(s) { if (dead) return; const [nv, ...a] = s.split(/;\s*/), i = nv.indexOf("=");
      if (a.some(x => /^Max-Age=0$/i.test(x))) kv.delete(nv.slice(0, i)); else kv.set(nv.slice(0, i), nv.slice(i + 1)); } };
}
const T = { BANK_FX: "c1" };

test("diet cookie -> open the bank -> sugar once; DIET_ then sticks on reopen; another bank unaffected", () => {
  const d = jar({ "stem-mode": "diet", "stem-mode-v": "2" });
  assert.equal(modeOf(d), "diet");
  assert.equal(forceSugarOnce("BANK_OTHER", T, d), false);
  assert.equal(modeOf(d), "diet", "other bank untouched");
  assert.equal(forceSugarOnce("BANK_FX", T, d), true);
  assert.equal(modeOf(d), "sugar");
  assert.equal(d.kv.get("stem-mode-v"), "2");
  assert.equal(d.kv.get("stem-force-sugar-BANK_FX"), "c1");
  setMode("diet", d);
  assert.equal(forceSugarOnce("BANK_FX", T, d), false, "no second force");
  assert.equal(forceSugarOnce("FX_Q1", T, d), false, "nor via a question code");
  assert.equal(modeOf(d), "diet", "the diet choice sticks");
});
test("a question code opens the same campaign; already sugar = marker only; new id forces again", () => {
  const d = jar({ "stem-mode": "diet", "stem-mode-v": "2" });
  assert.equal(forceSugarOnce("FX_Q1", T, d), true);
  assert.equal(modeOf(d), "sugar");
  const s = jar();
  assert.equal(forceSugarOnce("BANK_FX", T, s), false);
  assert.equal(s.kv.get("stem-force-sugar-BANK_FX"), "c1");
  setMode("diet", d);
  assert.equal(forceSugarOnce("BANK_FX", { BANK_FX: "c2" }, d), true);
});
test("cookies that do not stick: nothing forced, no loop", () => {
  const d = jar({ "stem-mode": "diet", "stem-mode-v": "2" }, { dead: true });
  assert.equal(forceSugarOnce("BANK_FX", T, d), false);
  assert.equal(forceSugarOnce("BANK_FX", T, d), false);
  assert.equal(modeOf(d), "diet");
  assert.equal(forceSugarOnce("BANK_FX", T, null), false);
});
