// Calc Coach (calc-coach.js, design/CALC-COACH.md): data schema, only verified steps shown, model read (picker API, then localStorage), promo expiry,
// and "no new Cluck reply format" (the reply library, the prompts and the server renderers know nothing of Calc Coach).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = f => JSON.parse(readFileSync(join(ROOT, f), "utf8"));
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const CC = createRequire(import.meta.url)(join(ROOT, "calc-coach.js"));
const data = () => structuredClone({ layout: J("calc/calc-layout.json"), steps: J("calc/calc-steps.json"), keys: J("calc/calc-keys.json"), pad: J("calc/calc-pad.json") });

test("schema: the shipped research data validates", () => assert.deepEqual(CC.validate(data()), []));
test("schema: catches a step with no press, a missing screen_verified flag and a nameless model", () => {
  const d = data(); d.steps.ti36xpro.R2_store_dont_retype__g_and_M[0].press = []; delete d.steps.ti30xsmv.preflight_deg[0].screen_verified; delete d.keys.fx115esplus.name;
  const e = CC.validate(d).join("|");
  assert.match(e, /ti36xpro\.R2.*press/); assert.match(e, /screen_verified must be/); assert.match(e, /fx115esplus: no name/);
});
test("only verified shown: a model with no source = nothing (check your manual); a step sourced UNVERIFIED is a hidden stub", () => {
  const d = data();
  assert.ok(CC.shownSteps(d, "fx991ex", "R1").length >= 3, "fx-991EX shows its verified steps now");
  assert.equal(CC.shownSteps(d, "nomodel", "R1"), null);
  const steps = CC.shownSteps(d, "ti36xpro", "R1"); assert.ok(steps.length >= 7); assert.ok(steps.every(s => !s.hidden && s.press.length));
  d.steps.ti36xpro.R1_alt_quadratic_direct = d.steps.ti36xpro.R1_solve_one_equation__energy_for_d; d.steps.ti36xpro.R1_solve_one_equation__energy_for_d[1].source_loc = "key positions: UNVERIFIED";
  assert.deepEqual(CC.shownSteps(d, "ti36xpro", "R1")[3], { hidden: true });
  assert.equal(CC.plain("UNVERIFIED (inferred): d=0"), "d=0");
});
test("model choice: the picker's get() wins, else the localStorage key; none = null", () => {
  assert.equal(CC.model(), null);
  localStorage.setItem("stem-calc-model", "ti30xs"); assert.equal(CC.model(), "ti30xs");
  globalThis.stemCalcPick = { get: () => "ti-36x-pro" }; assert.equal(CC.model(), "ti36xpro");
  globalThis.stemCalcPick = { get: () => "fx-991ex" }; assert.equal(CC.model(), "fx991ex");
  globalThis.stemCalcPick = { get: () => "other" }; assert.equal(CC.model(), "other");
  localStorage.setItem("stem-calc-model", "skip"); delete globalThis.stemCalcPick; assert.equal(CC.model(), null);
  delete globalThis.stemCalcPick; localStorage.removeItem("stem-calc-model"); assert.equal(CC.model(), null);
});
test("promo: exam-day copy until 2026-11-09T23:59 Los Angeles, neutral after; one QUACK at most", () => {
  const real = Date.now;
  try {
    assert.equal(CC.EXAM_END, Date.parse("2026-11-10T08:00:00Z"));
    Date.now = () => Date.parse("2026-11-10T07:59:59Z"); assert.equal(CC.promo().exam, true);
    assert.match(CC.promo().title, /^Stuck\? Click here for TI\/Casio tricks\.$/);
    Date.now = () => Date.parse("2026-11-10T08:00:00Z"); const p = CC.promo();
    assert.equal(p.exam, false); assert.doesNotMatch(p.title + p.body, /exam day|QUACK/i);
  } finally { Date.now = real; }
  assert.ok((CC.COPY.exam.body.match(/QUACK/g) || []).length <= 1);
});
test("hail-mary slot: a flag, on while its cram data is live", () => assert.equal(CC.FLAGS.hailMary, true));
test("no new reply format: the reply component library, prompts and renderers do not know Calc Coach", () => {
  const lib = Object.keys(J("views/library.json").components);
  assert.deepEqual(lib, ["View", "Head", "Text", "Legend", "Table", "Tug", "Flip", "Callout", "Steps", "Step", "Hints", "Predict", "Reveal", "Answer", "Doodle", "Graph", "Geometry"]);
  for (const f of ["prompts/cluck-v4.txt", "prompts/mini-cluck.txt", "views/registry.json", "views/library.json", "views.js", "oui.py", "views_gate.py"])
    assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /calc[ -_]?coach|CalcCoach|stemCalc/i, f);
  for (const f of readdirSync(join(ROOT, "views/prompt"))) assert.doesNotMatch(readFileSync(join(ROOT, "views/prompt", f), "utf8"), /calc[ -_]?coach/i, f);
});

test("routine deck: strip keys come from the verified steps; telemetry events carry ids and phases only", () => {
  CC.setData(data());
  assert.deepEqual(CC.stripKeys("ti36xpro", "R1"), ["2nd", "sin"]);
  assert.deepEqual(CC.stripKeys("fx115esplus", "R1"), ["SHIFT", "CALC"]);
  assert.equal(CC.routineDeck("ti36xpro").cards.length, 2);
  const seen = []; globalThis.stemT = (n, o) => seen.push([n, o]);
  CC.routineDeck("ti36xpro").onSlide(1);
  delete globalThis.stemT;
  assert.deepEqual(seen, [["calc_coach", { phase: "slide", slide: 2, routine: "R2", model: "ti36xpro" }]]);
});
