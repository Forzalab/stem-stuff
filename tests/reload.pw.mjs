// Reload / idle / stalled-network tests (design/RELOAD.md). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/reload.pw.mjs http://localhost:8812 [shotDir]
// Chromium always; Firefox too when Playwright has it installed (else "skip firefox").
// Not part of `npm test` (that one needs no server or browser).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const BANK = { v: 1, problems: [
  { code: "CALC1_ZZ9", type: "num", answer: "2", body: [{ type: "text", md: "What is $1 + 1$?" }] },
  { code: "CALC1_ZZ8", type: "num", answer: "3", body: [{ type: "text", md: "What is $1 + 2$?" }] }] };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const answer = async (page, v) => { await page.fill("#ans", v); await page.click("#ansGo"); };
const verdict = page => page.waitForSelector("#fb .verdict", { timeout: 4000 }).then(() => page.textContent("#fb"));

async function run(type, label, launchOpts) {
  const dir = mkdtempSync(join(tmpdir(), "reload-"));
  const launch = () => type.launchPersistentContext(dir, { ...launchOpts, viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  let ctx;
  try { ctx = await launch(); } catch (e) { console.log(`skip ${label}: ${e.message.split("\n")[0]}`); return; }
  let page = ctx.pages()[0] || await ctx.newPage();

  await step(`${label} (a) bank survives closing and reopening the browser`, async () => {
    await page.goto(BASE + "/");
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await fc.setFiles({ name: "mine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(BANK)) });
    await opened(page, "CALC1_ZZ9");
    await page.waitForTimeout(300);                              // the IndexedDB write
    await ctx.close();
    ctx = await launch(); page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(BASE + "/#CALC1_ZZ9");
    await opened(page, "CALC1_ZZ9");
    assert.equal(await page.textContent("#fileStatus"), "File mine.json in use.");
    assert.equal(await page.isHidden("#qnav"), false, "question nav back");
    await answer(page, "2");
    assert.match(await verdict(page), /Correct/);
    await page.click("#qnext");
    await opened(page, "CALC1_ZZ8");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/reload-restored-${label}-390.png` });
  });

  await step(`${label} (b) pageshow persisted after a stalled request: buttons work`, async () => {
    let n = 0;
    await page.route("**/check", r => { if (++n === 1) return; r.continue(); });   // first request never answers
    await page.goto("about:blank"); await page.goto(BASE + "/#CALC1_T6B"); await opened(page, "CALC1_T6B");
    await answer(page, "1");
    await page.waitForTimeout(300);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await answer(page, "1");
    await page.waitForFunction(() => /Not quite|Out of tries/.test(document.querySelector("#fb").textContent), null, { timeout: 4000 });
    assert.equal(n, 2);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  await step(`${label} (c) a request that never answers times out at 8 s; retry works`, async () => {
    let stall = true, n = 0;
    await page.route("**/check", r => { n++; if (stall) return; r.continue(); });
    await page.goto("about:blank"); await page.goto(BASE + "/#CALC1_T6B"); await opened(page, "CALC1_T6B");
    const before = await page.evaluate(() => window.__drill.state.tries.length);   // (b)'s try is kept across reloads (design/DONE.md)
    const t0 = Date.now();
    await answer(page, "7");
    await page.waitForSelector("#retry", { timeout: 12000 });
    const dt = Date.now() - t0;
    assert.ok(dt >= 7500 && dt < 10000, `timed out after ${dt} ms`);
    assert.match(await page.textContent("#fb"), /took too long/);
    assert.equal(await page.inputValue("#ans"), "7", "typed answer kept");
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), before, "a timeout is not a try: " + JSON.stringify(await page.evaluate(() => window.__drill.state.tries)));
    if (SHOTS) { await page.$eval("#freezeIn", e => { e.scrollTop = e.scrollHeight; }); await page.waitForTimeout(100); await page.screenshot({ path: `${SHOTS}/reload-timeout-${label}-390.png` }); }
    stall = false;
    await page.click("#retry");
    assert.match(await verdict(page), /Not quite|Out of tries/);
    assert.equal(n, 2);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  await step(`${label} (c2) problem load that never answers: timeout, retry button in the entry row`, async () => {
    let stall = true;
    await page.route("**/p/CALC1_A9R.json", r => { if (stall) return; r.continue(); });
    await page.goto(BASE + "/#CALC1_A9R");
    await page.waitForSelector("#retryLoad:not([hidden])", { timeout: 12000 });
    assert.match(await page.textContent("#entryMsg"), /took too long/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/reload-load-timeout-${label}-390.png` });
    stall = false;
    await page.click("#retryLoad");
    await opened(page, "CALC1_A9R");
    assert.equal(await page.isHidden("#retryLoad"), true);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}

await run(pw.chromium, "chromium", { args: ["--no-sandbox"] });
await run(pw.firefox, "firefox", {});
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
