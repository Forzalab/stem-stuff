// W110 (todo 110, Tony Oct 28): a right pick's Cluck reply ends on one reason, no question; the chip "Why does this work?" under it asks
// the follow-up through the chat (/chat). A multi's /explain, Compare and /chat bodies carry the part of the pick (the server grades it).
// The model is stubbed: /explain and /chat are routed in the browser (bodies recorded). Own serve.py + throwaway banks and tries.json.
//   node tests/why-chip.pw.mjs <port>
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8879", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "why-")), banks = join(tmp, "banks");
mkdirSync(banks);
const txt = md => [{ type: "text", md }];
const PROBS = [
  { code: "CALC1_WHY1", title: "Why 1", type: "mc", shuffle: false, body: txt("A motor does 52.0 J of work in 4.0 s. Power?"), correct: "a",
    choices: ["13.0 W", "208 W", "56.0 W", "48.0 W"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: "Why 1", key: "Divide: 13.0 W. Tick: a" } },
  { code: "CALC1_WHY2", title: "Why 2", type: "multi", body: txt("Trace the loop for n = 5."),
    parts: [{ label: "a", prompt: "What is i when the test fails?", type: "num", answer: "6", tol: 0.0001 },
            { label: "b", prompt: "What does it return?", type: "num", answer: "10", tol: 0.0001 }],
    saccharine: { title: "Why 2", key: "It stops at i = 6 and returns 10." } },
];
writeFileSync(join(banks, "BANK_WHY.json"), JSON.stringify({ v: 1, problems: PROBS }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });

async function open(code) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.sent = { explain: [], chat: [] };
  page.on("pageerror", e => page.errs.push(String(e)));
  for (const k of ["explain", "chat"]) {
    await ctx.route(new RegExp(`/${k}$`), r => { page.sent[k].push(JSON.parse(r.request().postData() || "{}"));
      r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: k === "chat" ? "It splits the work by time.\n" : "Yes! That is right. Power is work split by time.\n" }); });
  }
  await page.goto(BASE + "/#" + code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 10000 });
  return page;
}
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
async function mc(page, id) {
  const n = await tries(page);
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
}
async function part(page, i, v) {
  const n = await tries(page), row = `#q .part[data-i="${i}"]`;
  await page.fill(`${row} .ans`, v); await page.press(`${row} .ans`, "Enter");
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
}
/* the closed question's "See Cluck's steps" -> Compare's reply for the right try, typed out; then the chip */
async function compare(page) {
  await page.click("#wish .cue-ok");
  await page.waitForFunction(() => /Power is work/.test(document.querySelector("#cluck .cl-cmp")?.textContent || "") && !document.querySelector("#cluck .cl-cmp .wcaret"), null, { timeout: 8000 });
  await page.waitForSelector("#cluck .cl-why", { state: "visible", timeout: 4000 });
}

await step("mc: a miss, then right: Compare's reply has the chip; a tap asks it through /chat; then the chip goes", async () => {
  const page = await open("CALC1_WHY1");
  await mc(page, "b");
  for (let i = 0; i < 50 && !page.sent.explain.length; i++) await page.waitForTimeout(100);   // the miss's background ask (prefetch)
  assert.equal(page.sent.explain[0]?.answer, "b");
  assert.equal(await page.locator("#cluck .cl-why").count(), 0, "no chip on a wrong pick");
  await mc(page, "a");
  await compare(page);
  assert.equal((await page.textContent("#cluck .cl-why")).trim(), "Why does this work?");
  assert.equal(page.sent.explain.at(-1).answer, "a");
  assert.equal(page.sent.explain.at(-1).part, undefined, "a single item sends no part");
  await page.click("#cluck .cl-why");
  await page.waitForFunction(() => /splits the work/.test(document.querySelector("#cluck .cl-thread")?.textContent || ""), null, { timeout: 6000 });
  const c = page.sent.chat.at(-1);
  assert.equal(c.history.at(-1).role, "user");
  assert.equal(c.history.at(-1).content, "Why does this work?");
  assert.equal(c.answer, "a");
  assert.equal(await page.locator("#cluck .cl-why").count(), 0, "asked once: the chip goes");
  assert.deepEqual(page.errs, []);
  await page.context().close();
});

await step("multi (the Oct 28 path): finished, 'See Cluck\'s steps' asks /explain with the last try's part; the chip asks /chat with it", async () => {
  const page = await open("CALC1_WHY2");
  await part(page, 0, "5");
  await part(page, 0, "6");
  await part(page, 1, "10");
  await page.click("#wish .cue-ok");
  for (let i = 0; i < 50 && !page.sent.explain.length; i++) await page.waitForTimeout(100);
  assert.deepEqual([page.sent.explain.at(-1)?.answer, page.sent.explain.at(-1)?.part], ["10", 1], "the pick names its part");
  await page.click("#cluck .wtext").catch(() => {});                    // a tap skips the typing
  await page.waitForSelector("#cluck .cl-why", { state: "visible", timeout: 6000 });
  await page.click("#cluck .cl-why");
  await page.waitForFunction(() => /splits the work/.test(document.querySelector("#cluck .cl-thread")?.textContent || ""), null, { timeout: 6000 });
  const c = page.sent.chat.at(-1);
  assert.deepEqual([c.answer, c.part, c.history.at(-1).content], ["10", 1, "Why does this work?"], "the chat turn carries the part");
  assert.deepEqual(page.errs, []);
  await page.context().close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
