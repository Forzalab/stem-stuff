// W137 expression answers v1 (todo 137, brain _files/w137; serve.py EXPR_MODE, expr.py, app.js xPreview / xDiag): on an Exam 3 bank with
// EXPR_MODE=1, a miss on a typed num answer turns the box into "type your whole working"; a bare number then gets that prompt (no try), a
// syntax slip a friendly line (no try); the working renders live under the box with its own value dim "(= ...)"; a wrong working opens
// Cluck with the 6 moves (L3 from a fake Claude on a local port) and underlines the off span. EXPR_MODE off: today's box.
// 390x844, 1440x900, 1366x768. Starts its own serve.py (two: flag on / off) + the fake Claude:   node tests/expr.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as tcp } from "node:net";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const free = () => new Promise(res => { const s = tcp().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = +(process.argv[2] || 8851), OFFP = await free(), FAKE = await free(), SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "expr-")), BANKS = join(TMP, "banks");
const GOLD = "Sqrt(7^2+8.5^2+1.5^2)*30*(2*Pi)/60";
const FORM = "(2*3.0^2+3*3.0^2+5*3.0^2+6*3.0^2)*(30*2*pi/60)";
const ANS = String(144 * 30 * 2 * Math.PI / 60);
const body = md => [{ type: "text", md }];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 20261022, problems: [
  { code: "PHYS_XG1", title: "Practice: spinning frame", type: "num", answer: ANS, form: FORM, tol: 0.01,
    body: body("Four particles ($m_1..m_4$ = 2, 3, 5, 6 kg) sit on the corners of a frame $2a \\times 2b$, $a$ = 3.0 m, $b$ = 7.0 m. It turns about the y axis through its centre and speeds up by 30 rev/min each second. Find the torque, in N·m.") },
  { code: "PHYS_XG2", title: "Practice: lift piston", type: "num", answer: String(900 * 9.8 / (Math.PI * 0.64)), form: "900*9.8/(pi*0.8^2)", tol: 0.01,
    body: body("A 900 kg crate sits on a piston of radius 0.8 m. Find the pressure, in Pa.") },
] }));
/* the fake Claude (Messages API, non-stream): the L3 diagnosis as structured JSON text, the golden answer's shape */
const L3 = { family: null, concept: "perpendicular distance to the axis", confidence: 0.9, student_view: {
  affirm: [{ span: "30*(2*Pi)/60", what: "α part" }], off: { span: "Sqrt(7^2+8.5^2+1.5^2)", what: "the square root" },
  explain_each: ["7", "8.5", "1.5"], recall: { rule: "moment of inertia rule for point masses", decider: "The axis is y." },
  next: "Write I_y as a sum with four terms, one term per mass.", guard: "Keep the square root out of it." } };
let fakeCalls = 0;
const fake = createServer((req, res) => {
  let b = ""; req.on("data", c => { b += c; });
  req.on("end", () => {
    fakeCalls++;
    const j = JSON.parse(b || "{}");
    const ok = j.output_config?.format?.type === "json_schema" && j.model === "claude-sonnet-5-5";
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { content: [{ type: "text", text: JSON.stringify(L3) }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 200 } } : { error: "bad request shape" }));
  });
}).listen(FAKE);
const env = on => ({ ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3", STEM_TRIES: join(TMP, `tries-${on}.json`),
  EXPR_MODE: on ? "1" : "", CLAUDE_API: "fake", CLAUDE_BASE: `http://localhost:${FAKE}`, OPENROUTER_API_KEY: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "" });
const srvs = [spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: env(true), stdio: "ignore" }),
  spawn("python3", [join(ROOT, "serve.py"), String(OFFP)], { env: env(false), stdio: "ignore" })];
for (const p of [PORT, OFFP]) for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${p}/`)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, c) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), c, { timeout: 8000 });
const nTries = page => page.evaluate(() => window.__drill.state.tries.length);
async function send(page, v) {
  await page.fill("#ans", v);
  await page.waitForFunction(() => !document.querySelector("#ansGo").disabled);
  const r = page.waitForResponse(r => r.url().endsWith("/check"));
  await page.click("#ansGo");
  return (await r).json();
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + ".png") }); };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [w, h] of [[390, 844], [1440, 900], [1366, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    const BASE = `http://localhost:${PORT}`;

    await step(`${w}: first try is a number, as today; the miss turns the box to the whole working`, async () => {
      await page.goto(`${BASE}/#PHYS_XG1`); await opened(page, "PHYS_XG1");
      const r = await send(page, "34.9");
      assert.equal(r.verdict, "wrong"); assert.equal(r.exprMode, true);
      await page.waitForFunction(() => document.querySelector("#xline")?.textContent.startsWith("Type your whole working"));
      assert.equal(await page.getAttribute("#ans", "placeholder"), "Type your whole working, e.g. 2.5*9.8/(pi*0.4^2)");
    });
    await step(`${w}: a bare number gets the prompt, not a grade (no try used)`, async () => {
      const n = await nTries(page), r = await send(page, "67.9");
      assert.equal(r.verdict, "expr_needed");
      await page.waitForFunction(() => document.querySelector("#xline.nudge"));
      assert.equal(await nTries(page), n, "a bare number was counted as a try");
      await shot(page, `expr-${w}-prompt`);
    });
    await step(`${w}: a syntax slip is a friendly line, never a try`, async () => {
      const n = await nTries(page), r = await send(page, "900*9.8/(pi0.8^2)");
      assert.equal(r.verdict, "unparsed");
      assert.match(await page.textContent("#xline"), /Put \*/);
      assert.equal(await nTries(page), n);
    });
    await step(`${w}: the working renders live with its own value, dim; never the answer`, async () => {
      await page.fill("#ans", "");
      await page.type("#ans", GOLD, { delay: 0 });
      await page.waitForFunction(() => document.querySelector("#preview .xval"));
      const t = await page.textContent("#preview .xval");
      assert.equal(t, "(= 34.91)");
      assert.ok(await page.$("#preview .xexpr .katex"), "the working is not rendered");
      assert.ok(!(await page.textContent("#preview")).includes("452"), "the right answer showed");
      const op = await page.$eval("#preview .xval", e => +getComputedStyle(e).opacity);
      assert.ok(op < 1, "the value is not dim");
      await shot(page, `expr-${w}-live`);
    });
    await step(`${w}: a wrong working opens Cluck with the 6 moves (L3) and underlines the off span`, async () => {
      const r = await send(page, GOLD);
      assert.equal(r.verdict, "wrong"); assert.equal(r.diag.pending, true);
      await page.waitForFunction(() => /Keep the square root out of it/.test(document.querySelector("#cluck")?.textContent || ""), null, { timeout: 8000 });
      const txt = (await page.textContent("#cluck")).replace(/\s+/g, " ");
      const order = ["α part is right", "square root is the part that's off", "the 7, the 8.5, and the 1.5", "The axis is y.", "Write I_y as a sum", "Keep the square root out of it."];
      const at = order.map(s => txt.indexOf(s));
      assert.ok(at.every(i => i >= 0), "a move is missing: " + JSON.stringify(at));
      assert.deepEqual([...at].sort((a, b) => a - b), at, "the moves are out of order");
      assert.equal(await page.$eval("#cluck", e => !e.hidden && e.getBoundingClientRect().height > 0), true, "Cluck did not open");
      assert.ok(await page.$("#preview .xoff"), "no underline on the off span");
      assert.match(await page.textContent("#preview .xoff"), /7/);
      assert.ok(!txt.includes("144") && !txt.includes("452") && !txt.includes("3.0"), "a key number leaked");
      await page.waitForTimeout(300);
      await shot(page, `expr-${w}-cluck`);
    });
    await step(`${w}: no page errors, no sideways scroll`, async () => {
      assert.deepEqual(errs, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the page scrolls sideways");
    });
    await ctx.close();
  }

  await step("L3 asked once per (item, working) (cache), with the structured-output request shape", async () => {
    assert.equal(fakeCalls, 1);
  });

  await step("EXPR_MODE off: today's box (a second number is graded, no prompt, no exprMode)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* blocked */ } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${OFFP}/#PHYS_XG2`); await opened(page, "PHYS_XG2");
    const r1 = await send(page, "1"); assert.equal(r1.verdict, "wrong"); assert.equal("exprMode" in r1, false);
    await page.waitForFunction(() => !document.querySelector("#ansGo").hidden || document.querySelector("#ff.bad"));
    const r2 = await send(page, "2"); assert.equal(r2.verdict, "wrong"); assert.equal(r2.triesLeft, 0); assert.equal("diag" in r2, false);
    assert.equal(await page.$("#xline"), null);
    await ctx.close();
  });
} finally {
  await browser.close();
  for (const s of srvs) s.kill();
  fake.close();
}
console.log(fails ? `${fails} FAIL` : "all ok");
process.exit(fails ? 1 : 0);
