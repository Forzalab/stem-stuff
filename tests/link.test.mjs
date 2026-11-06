// LINK-FEATURES v2 S1 (brain plan-2026-11-03/LINK-FEATURES.md): links.mjs core, no browser. One quantity wears one hue in its words,
// its symbol and its figure mark; as solution lines arrive the newest line's quantities are lit, the line before settles to layer 2,
// older ones to layer 3. These cover the pure parts: the tokenizer, the stable auto hues, the per-line plan, the flag's default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, ids, autoHues, plan, on, strip, plain, HUES } from "../links.mjs";

test("parse: plain text and math pass through as they are", () => {
  assert.deepEqual(parse("We use the definition of density."), [{ t: "text", s: "We use the definition of density." }]);
  assert.deepEqual(parse("so $\\rho=M/V$ here"), [{ t: "text", s: "so " }, { t: "math", s: "\\rho=M/V" }, { t: "text", s: " here" }]);
});

test("parse: [words]{#id} is a link, [[ID]] / [[ID|label]] a law (parse only in S1); tokens inside $..$ are left alone", () => {
  assert.deepEqual(parse("The [belt]{#vlead} is under water. By [[DENSITY|the definition of density]], [[BUOY]]."), [
    { t: "text", s: "The " }, { t: "ln", s: "belt", id: "vlead" }, { t: "text", s: " is under water. By " },
    { t: "law", s: "the definition of density", id: "DENSITY" }, { t: "text", s: ", " }, { t: "law", s: "BUOY", id: "BUOY" }, { t: "text", s: "." }]);
  assert.deepEqual(parse("$[a]{#x}$"), [{ t: "math", s: "[a]{#x}" }]);
});

test("ids: link ids from words and from \\htmlClass{ln-id} in math, first appearance order, no repeats", () => {
  assert.deepEqual(ids("The [diver and belt]{#mtot} sink: $\\htmlClass{ln-mtot}{(M+m)}(g-a)=\\rho_w g\\,\\htmlClass{ln-vtot}{V_{tot}}$"), ["mtot", "vtot"]);
  assert.deepEqual(ids("no links here, $x^2$"), []);
});

test("autoHues: palette hues only (no green/red), first appearance order, stable for the same ids", () => {
  const a = autoHues(["vd", "mtot", "vlead", "vtot"]);
  assert.deepEqual(a, { vd: "sky", mtot: "amber", vlead: "orange", vtot: "violet" });
  assert.deepEqual(autoHues(["vd", "mtot", "vlead", "vtot"]), a, "same ids, same hues");
  assert.ok(HUES.every(h => !["ok", "bad", "green", "red"].includes(h)));
  assert.equal(autoHues(["a", "b", "c", "d", "e", "f", "g"]).g, HUES[0], "wraps after the 6 hues");
});

test("plan: the newest line's ids are on, the line before is layer 2, older lines layer 3; a newer mention wins", () => {
  assert.deepEqual(plan([["mtot"]]), { mtot: "on" });
  assert.deepEqual(plan([["mtot"], ["vtot"]]), { mtot: "ly2", vtot: "on" });
  assert.deepEqual(plan([["mtot"], ["vtot"], ["vlead"]]), { mtot: "ly3", vtot: "ly2", vlead: "on" });
  assert.deepEqual(plan([["mtot"], ["vtot"], ["vd", "mtot"]]), { mtot: "on", vtot: "ly2", vd: "on" }, "mtot is back in the newest line");
  assert.deepEqual(plan([]), {});
});

test("on(): off by default (no ?links=1, no localStorage stem-links), so live renders nothing new", () => {
  assert.equal(on(), false);
});

test("strip: \\htmlClass{ln-id}{..} unwraps (nested braces kept) so the MathML / copy text is plain math", () => {
  assert.equal(strip("\\htmlClass{ln-mtot}{(M+m)}(g-a)"), "(M+m)(g-a)");
  assert.equal(strip("\\htmlClass{ln-vd}{V_{d}}=\\htmlClass{ln-vt}{\\frac{m}{\\htmlClass{ln-r}{\\rho}}}"), "V_{d}=\\frac{m}{\\rho}");
  assert.equal(strip("\\htmlClass{xoff}{5}"), "\\htmlClass{xoff}{5}", "chg.mjs's xoff class is not ours: kept");
});

test("plain: a line with link markup reads as its words (ladder chips sit on --sheet: no hue there)", () => {
  assert.equal(plain("take [its volume]{#vlead} out"), "take its volume out");
  assert.equal(plain("By [[DENSITY|the definition of density]], $\\htmlClass{ln-vd}{V_d}$"), "By the definition of density, $V_d$");
});
