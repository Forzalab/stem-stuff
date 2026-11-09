// The generated proof ladder (client half; server = serve.py proof_grade / proof_step_check, STEM_PROOF_LADDER=1): a wrong proof's /check reply
// carries repair {gen:true, att, steps} (no answers); repair.js draws the steps empty and grades each one through POST /repair/<code>/check.
// Starts its own serve.py (flag on) with a throwaway banks/ folder and a stub grader:   node tests/proof-ladder.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8874), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "proofld-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
copyFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), join(BANKS, "BANK_PRF.json"));
const CODE = "PRF_PRA";
/* the expected answers: they must never reach the browser */
const SECRET = ["7351", "k*(3*k+1)/2"];   // a pick answer is one of the option ids the page must show, so only the typed answers are scanned
const LADDER = [
  { id: "s_num", label: "Find the value of the sum at n = 1", kind: "num", ask: "What is the sum at n = 1, as a number?", ok: "7351", var: "", opts: [] },
  { id: "s_expr", label: "Write the sum up to k", kind: "expr", ask: "The sum up to k, written in k.", ok: "k*(3*k+1)/2", var: "k", opts: [] },
  { id: "s_pick", label: "Which line uses the assumption", kind: "pick", ask: "Pick the line that uses the case for k.", ok: "optb", var: "",
    opts: [{ id: "opta", md: "The base case" }, { id: "optb", md: "The line with the sum to k" }] },
  { id: "s_last", label: "Take 2 from 6", kind: "num", ask: "Which number is left when you take 2 from 6?", ok: "4", var: "", opts: [] },
];
const stub = createServer((req, res) => {
  let b = ""; req.on("data", c => { b += c; });
  req.on("end", () => {
    const user = JSON.parse(b).messages[1].content, bad = /BADSTEP/.test(user);
    const out = { verdict: bad ? "wrong" : "correct", hint: bad ? "QUACK. Did you use what you assumed for k?" : "", ladder: bad ? LADDER : [] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
  });
});
await new Promise(ok => stub.listen(0, "127.0.0.1", ok));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), STEM_PROOF_LADDER: "1",
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "stub-key", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = page => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), CODE, { timeout: 8000 });
const GOOD = "Base case: n = 1, both sides are 2.\nAssume it for k.\nAdd 3k+2 and factor: (k+1)(3k+4)/2.";
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(viewport = { width: 1280, height: 860 }, touch = false) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(), errs = [], wire = [], reqs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("request", r => reqs.push(r.method() + " " + new URL(r.url()).pathname));
  await page.exposeFunction("__wire", t => { wire.push(t); });                    // every /check and /repair/ reply body, read in the page (a response event may not hold the body)
  await page.addInitScript(() => { const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a);
    try { if (/\/(check|repair\/)/.test(new URL(r.url).pathname)) r.clone().text().then(t => window.__wire(t)); } catch { /* not a tracked call */ } return r; }; });
  await page.goto(BASE + "/#" + CODE); await opened(page);
  return { ctx, page, errs, wire, reqs };
}
async function miss(page) {
  await page.fill("#ans", "BADSTEP " + GOOD); await page.click("#ansGo");
  await page.waitForSelector("#rpHost .rp-step", { timeout: 6000 });
}
const leaks = async (page, wire) => [...SECRET.filter(s => wire.some(b => b.includes(s))).map(s => "wire:" + s),
  ...await page.evaluate(S => S.filter(s => document.documentElement.outerHTML.includes(s) || [...document.querySelectorAll("input")].some(i => i.value.includes(s))).map(s => "dom:" + s), SECRET)];
const state = (page, id) => page.$eval(`#rpHost .rp-step[data-id="${id}"]`, li => li.dataset.state);
async function answer(page, id, v) {
  await page.fill(`#rpHost .rp-step[data-id="${id}"] .rp-in`, v); await page.click(`#rpHost .rp-step[data-id="${id}"] .rp-check`);
  await page.waitForTimeout(400);
}

try {
  await step("a wrong proof: the generated steps render empty, no GET /repair, no answer in the DOM or on the wire", async () => {
    const { ctx, page, errs, wire, reqs } = await open();
    await miss(page);
    assert.equal(await page.$$eval("#rpHost .rp-step", x => x.length), 4);
    assert.equal(await page.$$eval("#rpHost .rp-step .rp-in", x => x.map(i => i.value).join("")), "", "an input came pre-filled");
    assert.equal(await page.$$eval("#rpHost .rp-ok, #rpHost .rp-val", x => x.length), 0, "a step shows done");
    assert.ok(!reqs.some(r => r.startsWith("GET /repair/")), "GET /repair sent for a generated ladder");
    assert.match(await page.textContent("#rpHost .rp-line"), /fix it one step at a time/i);
    assert.ok(wire.some(b => /"gen":\s*true/.test(b)), "the reply carried no gen ladder: " + JSON.stringify(wire).slice(0, 300));
    assert.deepEqual(await leaks(page, wire), []);
    assert.deepEqual(errs, []);
    await ctx.close();
  });
  await step("right answers (num, expr, pick) turn their steps done with a check; a wrong try is not done", async () => {
    const { ctx, page, wire } = await open();
    await miss(page);
    await answer(page, "s_num", "1");
    assert.equal(await state(page, "s_num"), "active", "a wrong number finished the step");
    await answer(page, "s_num", "7351");
    assert.equal(await state(page, "s_num"), "done");
    assert.equal(await page.$$eval('#rpHost .rp-step[data-id="s_num"] .rp-ok', x => x.length), 1);
    assert.equal(await page.$eval('#rpHost .rp-step[data-id="s_expr"] .rp-in', i => i.inputMode), "text");
    await answer(page, "s_expr", "(3*k^2+k)/2");
    assert.equal(await state(page, "s_expr"), "done");
    await page.click('#rpHost .rp-step[data-id="s_pick"] .rp-chip[data-v="optb"]'); await page.waitForTimeout(400);
    assert.equal(await state(page, "s_pick"), "done");
    assert.deepEqual((await leaks(page, wire)).filter(x => x.startsWith("wire:")), []);
    await ctx.close();
  });
  await step("two wrong tries end a step as skipped: muted, no check, no value, no answer filled in", async () => {
    const { ctx, page, wire } = await open();
    await miss(page);
    await answer(page, "s_num", "1"); await answer(page, "s_num", "2");
    assert.equal(await state(page, "s_num"), "skipped");
    assert.equal(await page.$$eval('#rpHost .rp-step[data-id="s_num"] :is(.rp-ok, .rp-val)', x => x.length), 0, "a skipped step shows a check or a value");
    assert.equal(await state(page, "s_expr"), "active", "the ladder did not move on");
    assert.deepEqual(await leaks(page, wire), []);
    await ctx.close();
  });
  await step("expired (404): one line, the ladder is gone", async () => {
    const { ctx, page } = await open();
    await page.route("**/repair/*/check", r => r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"expired"}' }));
    await miss(page);
    await answer(page, "s_num", "1");
    assert.equal(await page.$("#rpHost"), null, "the ladder host stays");
    assert.equal(await page.$$eval(".rp-step", x => x.length), 0);
    assert.match(await page.textContent("#rpGone"), /These steps expired\. Check again for new ones\./);
    await ctx.close();
  });
  for (const [w, h] of [[390, 700], [360, 640]]) {
    await step(`${w}x${h} phone: the last generated step + Skip are reachable (scroll #work, elementFromPoint)`, async () => {
      const { ctx, page } = await open({ width: w, height: h }, true);
      await miss(page);
      await page.$eval("#work", e => { e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(100);
      const hit = await page.evaluate(() => {
        const vh = innerHeight, steps = [...document.querySelectorAll("#rpHost .rp-step")], out = {};
        for (const [k, el] of [["last", steps.at(-1)], ["skip", document.querySelector("#rpHost .rp-skip")]]) {
          const r = el.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          out[k] = { top: r.top, bottom: r.bottom, inView: r.top >= 0 && r.bottom <= vh, hit: !!t && (el === t || el.contains(t)) };
        }
        return out;
      });
      assert.ok(hit.last.inView && hit.last.hit, "last step not reachable: " + JSON.stringify(hit.last));
      assert.ok(hit.skip.inView && hit.skip.hit, "Skip not reachable: " + JSON.stringify(hit.skip));
      await page.click("#rpHost .rp-skip");
      assert.equal(await page.$("#rpHost"), null, "Skip left the ladder");
      await ctx.close();
    });
  }
} finally {
  await browser.close();
  srv.kill();
  stub.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
