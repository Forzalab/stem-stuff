// The proof Check waits 25 s (todo 109 item 1; serve.py PROOF_TIMEOUT is 20 s per model, net()'s 8 s cut it as "Cluck could not check it").
// Case 1: /check answers after 12 s -> the verdict shows. Case 2: it never answers -> at 25 s a timeout line + Try again, no try spent; Try again re-sends.
// Page clock faked (no real sleeps); own serve.py:   node tests/proof-timeout.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8874), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "proof-to-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
copyFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), join(BANKS, "BANK_PRF.json"));
const CODE = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), "utf8")).problems[0].code;
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
const OK = { verdict: "wrong", triesLeft: 2, rubric: { base: "missing", assume: "ok", prove: "ok" }, hint: "QUACK. Where do you check n = 1?" };
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
/* a page on a fake clock whose POST /check is held until the test lets it go (or never) */
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  const page = await ctx.newPage(), held = [];
  await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
  await page.route("**/check", r => { if (r.request().method() === "POST") held.push(r); else r.continue(); });
  await page.goto(BASE + "/#" + CODE);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, CODE, { timeout: 8000 });
  await page.fill("#ans", "Base case: n = 1.\nAssume it for k.\nAdd 3k+2 and factor."); await page.click("#ansGo");
  await page.waitForFunction(() => document.querySelector("#ansGo") !== null);
  return { ctx, page, held };
}
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
try {
  await step("a slow-but-valid proof (answer at 12 s) shows its verdict, not 'could not check it'", async () => {
    const { ctx, page, held } = await open();
    await page.waitForTimeout(300); assert.equal(held.length, 1, "Check sent no request");
    await page.clock.fastForward(12000);
    await held[0].fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OK) });
    await page.waitForSelector("#rubric .rb", { timeout: 6000 });
    assert.doesNotMatch(await page.textContent("#fb"), /could not check|taking too long/i);
    assert.match(await page.textContent("#fb .cluck"), /Where do you check n = 1\?/);
    await ctx.close();
  });
  await step("no answer: at 25 s a timeout line + Try again, no try spent; Try again re-sends", async () => {
    const { ctx, page, held } = await open();
    await page.waitForTimeout(300);
    for (let i = 0; i < 100 && !held.length; i++) await page.waitForTimeout(50);   // the 25 s timer starts when the request is sent: jump the clock only after that, or a slow runner's late send leaves the timer ahead of the jump
    assert.equal(held.length, 1, "Check sent no request");
    await page.clock.fastForward(24000);
    assert.equal(await page.locator("#fb .verdict.wait").count(), 0, "gave up before 25 s");
    await page.clock.fastForward(1500);
    await page.waitForSelector("#fb .verdict.wait #retry, #fb .verdict.wait .retry", { timeout: 6000 });
    assert.match(await page.textContent("#fb"), /taking too long/i);
    assert.equal(await tries(page), 0, "a try was spent");
    assert.equal(await page.evaluate(() => window.__drill.state.triesLeft), 3);
    await page.click("#retry");
    await page.waitForFunction(() => document.querySelector("#fb .verdict.wait") === null);
    await page.waitForTimeout(300); assert.equal(held.length, 2, "Try again did not re-send");
    await held[1].fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OK) });
    await page.waitForSelector("#rubric .rb", { timeout: 6000 });
    assert.equal(await tries(page), 1);
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
