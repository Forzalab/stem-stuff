// Prev/Next in a bank (design/NAV.md "Mastery order"): Next opens the question at once from the bank in memory (no wait on
// p/CODE.json), Prev stays lit, the list holds still while you are on a question, and a graded try re-sorts on the next open.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/nav-stable.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8824), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "navst-")), BANKS = join(TMP, "banks");
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const CODES = ["CALC1_N01", "CALC1_N02", "CALC1_N03", "CALC1_N04"];
const BANK = { v: 1, problems: CODES.map((c, i) => num(c, String(i + 2), `Stable ${i + 1}: 1 + ${i + 1}`)) };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_NV12.json"), JSON.stringify(BANK));

const { shuffled } = await import("../shuffle.mjs");
const SEED = Array.from({ length: 2000 }, (_, i) => "k" + i).find(s => shuffled(CODES, s).every((c, i) => c === CODES[i]));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
const order = page => page.$$eval("#qlist a", as => as.map(a => a.getAttribute("href").slice(1)));
/* Prev's disabled state, sampled every 50 ms for ms: true if it was ever disabled */
const prevEverOff = (page, ms) => page.evaluate(ms => new Promise(res => {
  const p = document.querySelector("#qprev"); let off = p.disabled;
  const t = setInterval(() => { off = off || p.disabled; }, 50);
  setTimeout(() => { clearInterval(t); res(off); }, ms);
}), ms);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
  await ctx.addInitScript(s => { try { if (localStorage.getItem("stem-order") !== s) localStorage.setItem("stem-order", s); } catch { /* blocked */ } }, SEED);
  const page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_NV12");
  await opened(page, CODES[0]);

  await step("Next: Prev lights up and stays lit, the order holds", async () => {
    const before = await order(page);
    await page.click("#qnext"); await opened(page, CODES[1]);
    assert.equal(await prevEverOff(page, 1500), false, "Prev went dim after Next");
    assert.deepEqual(await order(page), before);
    await page.click("#qnext"); await opened(page, CODES[2]);
    assert.equal(await prevEverOff(page, 1500), false, "Prev went dim after the second Next");
    assert.deepEqual(await order(page), before);
  });

  await step("Prev walks back the same list", async () => {
    await page.click("#qprev"); await opened(page, CODES[1]);
    await page.click("#qprev"); await opened(page, CODES[0]);
    assert.ok(await page.$eval("#qprev", b => b.disabled), "Prev on the first question");
  });

  await step("a graded try: the list holds while on the question, re-sorts on the next open", async () => {
    await page.click("#qnext"); await opened(page, CODES[1]);
    const before = await order(page);
    await page.fill("#ans", "3"); await page.click("#ansGo");                 // 1 + 2: correct
    await page.waitForSelector("#ff .vk[data-v=i-ok]", { timeout: 4000 });
    await page.waitForTimeout(600);
    assert.deepEqual(await order(page), before, "re-sorted while on the answered question");
    await page.click("#qnext"); await opened(page, CODES[2]);
    const after = await order(page);
    assert.equal(after[0], CODES[1], "the answered question did not move first");
    assert.equal(await page.$eval("#qprev", b => b.disabled), false, "Prev dim after the re-sort");
    assert.equal(await prevEverOff(page, 1000), false, "Prev went dim after the re-sorting open");
  });

  await step("Next does not wait on p/CODE.json (bank in memory), and still tells the server", async () => {
    let asked = 0;
    await page.route("**/p/*.json", async r => { asked++; await new Promise(res => setTimeout(res, 2000)); await r.continue(); });
    const list = await order(page), to = list[list.indexOf(await page.textContent("#pcode")) + 1];
    const t0 = Date.now();
    await page.click("#qnext"); await opened(page, to, 1500);
    const dt = Date.now() - t0;
    assert.ok(dt < 1000, `took ${dt} ms`);
    await page.waitForTimeout(300);
    assert.equal(asked, 1, "the server was not told (seen pointer)");
    await page.unroute("**/p/*.json");
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
