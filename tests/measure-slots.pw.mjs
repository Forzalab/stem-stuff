// tools/measure_slots.mjs (views plan Oct 20, step 3 "Measure") in Chromium on the lab page, at 360 / 390 / 1280:
// (a) tests/fixtures/measure-view.oui -> the rows of measure-view.json (role, wordClass, lines exact; maxChars within its tol);
// (b) A–D regression (measure-ad.oui): a choice slot sized for "a)" gets a small maxChars, so a phrase like
//     "Divide by the first cart's mass" is longer than its budget (the later copy gate catches it);
// plus: every row is a .vw-tslot box, the CLI writes slots.json + slots.png and exits 0, and a prop with no registry role has none.
// usage: python3 serve.py 8815 &   node tests/measure-slots.pw.mjs http://localhost:8815 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measure, roleOf } from "../tools/measure_slots.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8815";
const SHOTS = process.argv[3] || "";
const FX = new URL("./fixtures/", import.meta.url);
const VIEW = readFileSync(new URL("measure-view.oui", FX), "utf8");
const AD = readFileSync(new URL("measure-ad.oui", FX), "utf8");
const WANT = JSON.parse(readFileSync(new URL("measure-view.json", FX), "utf8"));
const PHRASE = "Divide by the first cart's mass";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const W of [360, 390, 1280]) {
  await step(`${W} fixture view: one row per slot, roles + word classes from the registry, maxChars within tol`, async () => {
    const { rows, errors } = await measure(VIEW, { width: W, base: BASE, browser: b, out: SHOTS ? join(SHOTS, `measure-view-${W}`) : undefined });
    assert.deepEqual(errors, []);
    assert.deepEqual(rows.map(r => r.id), ["title", "sub", "intro", "tag", "q", "a", "b", "c", "d"]);
    const roles = new Set(rows.map(r => r.role));
    assert.ok(roles.size >= 3, `>= 3 roles, got ${[...roles]}`);
    for (const w of WANT.rows) {
      const r = rows.find(x => x.id === w.id);
      for (const k of ["component", "prop", "role", "wordClass"]) assert.equal(r[k], w[k], `${w.id}.${k}`);
      if (w.lines != null) assert.equal(r.lines, w.lines, `${w.id}.lines`);
      const want = w.maxChars[W], tol = Math.max(2, Math.round(want * WANT.tol));
      assert.ok(Math.abs(r.maxChars - want) <= tol, `${w.id}.maxChars ${r.maxChars} vs ${want} ±${tol}`);
      assert.ok(r.box.w > 0 && r.box.h > 0 && r.box.x >= 0 && r.box.x + r.box.w <= W, `${w.id} box inside the page: ${JSON.stringify(r.box)}`);
    }
    const intro = rows.find(r => r.id === "intro");
    assert.ok(intro.lines > 1, "body text gets more than one line");
  });

  await step(`${W} A–D regression: a choice slot sized for "a)" cannot take "${PHRASE}"`, async () => {
    const { rows, errors } = await measure(AD, { width: W, base: BASE, browser: b });
    assert.deepEqual(errors, []);
    const opts = rows.filter(r => r.prop === "choices");
    assert.equal(opts.length, 4);
    for (const r of opts) {
      assert.equal(r.role, "button");
      assert.equal(r.lines, 1);
      assert.ok(r.maxChars >= 2, `"a)" fits (${r.maxChars})`);
      assert.ok(r.maxChars < PHRASE.length, `${r.id}: maxChars ${r.maxChars} must be < ${PHRASE.length}`);
    }
    const title = rows.find(r => r.id === "title");
    assert.ok(title.maxChars >= PHRASE.length, `the heading has room for the phrase (${title.maxChars})`);
  });
}

await step("CLI writes slots.json + slots.png and exits 0", async () => {
  const out = mkdtempSync(join(tmpdir(), "measure-"));
  execFileSync("node", [new URL("../tools/measure_slots.mjs", import.meta.url).pathname, new URL("measure-view.oui", FX).pathname,
    "--out", out, "--width", "360", "--base", BASE], { stdio: "pipe", timeout: 60000 });
  const j = JSON.parse(readFileSync(join(out, "slots.json"), "utf8"));
  assert.equal(j.width, 360);
  assert.equal(j.rows.length, 9);
  for (const r of j.rows) assert.deepEqual(Object.keys(r), ["id", "component", "prop", "role", "wordClass", "box", "lines", "maxChars"]);
  assert.ok(existsSync(join(out, "slots.png")));
});

await step("registry roles: a data prop (not_words) or a component without words has no role", async () => {
  assert.deepEqual(roleOf("Predict", "choices"), { role: "button", wordClass: "noun_phrase" });
  assert.equal(roleOf("Math", "tex"), null);
  assert.equal(roleOf("Predict", "answer"), null);
  assert.equal(roleOf("Graph", "cols"), null);
  assert.equal(roleOf("Nope", "x"), null);
});

await b.close();
if (failures) { console.log(`${failures} FAIL`); process.exit(1); }
console.log("all ok");
