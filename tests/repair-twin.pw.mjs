// todo 117: a twin shares its template's ladder, so the keyless answer step (no `ok`, as GET /repair serves it) takes the SHOWN item's type,
// not the ladder's kind: an mc item gets a pick of its own choices, a num item a number box. Fixture tests/fixtures/repair-twin.json:
// an mc template (P3X_PHN) + its num `a` twin (P3X_A98), one ladder. Both sides render and grade right, whichever kind the ladder's answer
// step names (pick as authored, num as a variant). The grade stub mirrors serve.repair_check: each item by its OWN key (mc: the right id;
// num: 2% relative; a value that is not a number = 400, a rejected promise).
//   node tests/repair-twin.pw.mjs                          (the repair lab page from disk)
//   node tests/repair-twin.pw.mjs http://localhost:8823    (the lab through serve.py)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = process.argv[2] ? process.argv[2].replace(/\/$/, "") + "/design/repair-lab.html" : "file://" + join(HERE, "..", "design", "repair-lab.html");

const FIX = Object.fromEntries(JSON.parse(readFileSync(join(HERE, "fixtures", "repair-twin.json"), "utf8")).problems.map(p => [p.code, p]));
const TEMPLATE = FIX.P3X_PHN, TWIN = FIX.P3X_A98;
assert.equal(TEMPLATE.type, "mc"); assert.equal(TWIN.type, "num"); assert.equal(TWIN.parent_template, TEMPLATE.code);
const KEY = ["ok", "opts", "tol", "miss"];                                       // what GET /repair drops from the answer step (Tony #29.7)
const served = kind => TEMPLATE.repair.steps.map(st => st.id !== "answer" ? st
  : Object.fromEntries(Object.entries({ ...st, kind }).filter(([k]) => !KEY.includes(k))));
const client = (p, kind) => ({ code: p.code, type: p.type, stem: p.body[0].md, repair: { steps: served(kind) },   // public(): no key
  ...(p.type === "mc" ? { choices: p.choices.map(({ id, md }) => ({ id, md })) } : {}) });
const keyOf = p => p.type === "mc" ? { mc: p.correct } : { num: Number(p.answer) };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(LAB);
  const mount = (item, key) => page.evaluate(([item, key]) => {
    window.__ev = []; window.__graded = [];
    const grade = v => { window.__graded.push(v);
      return new Promise((ok, no) => setTimeout(() => {
        if (key.mc != null) return ok({ ok: v === key.mc });
        const n = parseFloat(String(v).replace(/−/g, "-"));
        if (!Number.isFinite(n)) return no(new Error("400 invalid"));
        ok({ ok: Math.abs(n - key.num) <= 0.02 * Math.abs(key.num) });
      }, 30)); };
    Repair.mount(document.getElementById("host"), item, { variant: "repair", error: null, grade, on: (name, data) => window.__ev.push([name, data]) });
  }, [item, key]);
  const toAnswer = async () => {                                               // the fallback ladder: step 1's why, then the answer is next
    await page.click('.rp-step[data-state="active"] .rp-why .rp-chip[data-why="0"]');
    assert.equal(await page.getAttribute('.rp-step[data-id="answer"]', "data-state"), "active");
  };
  const ans = '.rp-step[data-id="answer"]';
  const done = () => page.evaluate(() => window.__ev.filter(e => e[0] === "repair_done").length);

  for (const kind of ["pick", "num"]) {
    await step(`ladder answer kind ${kind}, the mc TEMPLATE shown: a pick of its own choices, graded by its own key`, async () => {
      await mount(client(TEMPLATE, kind), keyOf(TEMPLATE));
      await toAnswer();
      assert.deepEqual(await page.$$eval(`${ans} .rp-val-opts .rp-chip`, c => c.map(x => x.dataset.v)), TEMPLATE.choices.map(c => c.id), "its choices");
      assert.equal(await page.$$eval(`${ans} input`, x => x.length), 0, "no number box");
      await page.click(`${ans} .rp-chip[data-v="b"]`);
      await page.waitForSelector(`${ans} .rp-miss`);
      assert.equal(await page.getAttribute(ans, "data-state"), "active", "a wrong pick is a miss");
      await page.click(`${ans} .rp-chip[data-v="a"]`);
      await page.waitForSelector(`${ans}[data-state="done"]`);
      assert.deepEqual(await page.evaluate(() => window.__graded), ["b", "a"]);
      assert.match(await page.textContent(`${ans} .rp-val`), /20/, "the picked choice's text");
      assert.equal(await done(), 1);
    });

    await step(`ladder answer kind ${kind}, the num TWIN shown: a number box (no chips), graded by its own key`, async () => {
      await mount(client(TWIN, kind), keyOf(TWIN));
      await toAnswer();
      assert.equal(await page.$$eval(`${ans} .rp-chip`, x => x.length), 0, "no choices to pick");
      assert.equal(await page.$$eval(`${ans} input`, x => x.length), 1, "a number box");
      await page.fill(`${ans} input`, "20");                                     // the template's answer: wrong for the twin
      await page.click(`${ans} .rp-check`);
      await page.waitForSelector(`${ans} .rp-miss`);
      assert.equal(await page.getAttribute(ans, "data-state"), "active");
      await page.fill(`${ans} input`, "45");
      await page.click(`${ans} .rp-check`);
      await page.waitForSelector(`${ans}[data-state="done"]`);
      assert.deepEqual(await page.evaluate(() => window.__graded), ["20", "45"]);
      assert.match(await page.textContent(`${ans} .rp-val`), /^45/, "the typed value");
      assert.equal(await done(), 1);
    });
  }

  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally {
  await browser.close();
}
if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall ok");
