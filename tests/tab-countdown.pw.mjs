// Bug (user report): the 10 s second-try countdown restarts from 10 when the user comes back to the tab.
// Spec: the wait keeps its deadline across hide/show and across a page reload of the same tab (sessionStorage), never restarts to 10 s.
//   STEM_TODAY=2026-10-23 python3 server/http_server/serve.py 8813 &   then   node tests/tab-countdown.pw.mjs http://localhost:8813
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8813";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const WRONG = { verdict: "wrong", triesLeft: 1 };
const secs = page => page.$eval("#ansGo", e => { const m = /\((?:wait )?(\d+) s\)/.exec(e.getAttribute("aria-label") || ""); return m ? +m[1] : null; });
const setVis = (page, v) => page.evaluate(v => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => v !== "visible" });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}, v);
const open = async page => {
  await page.goto(BASE + "/#CALC1_T6B");
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_T6B" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
};
async function mk(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/state/*", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ wrong: 0, done: false, gen: 0 }) }));
  await page.route("**/check", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(WRONG) }));
  return { ctx, page };
}

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });

await step("hide/show mid-wait keeps the remaining time (no restart to 10)", async () => {
  const { ctx, page } = await mk(b);
  await open(page);
  await page.fill("#ans", "1"); await page.click("#ansGo");
  await page.waitForFunction(() => window.__drill.state.wait, null, { timeout: 5000 });
  await page.waitForTimeout(3000);
  const before = await secs(page);
  await setVis(page, "hidden"); await page.waitForTimeout(2000); await setVis(page, "visible");
  await page.waitForTimeout(300);
  const after = await secs(page);
  console.log("     remaining before hide:", before, "after return:", after);
  assert.ok(after !== null && after <= before, `countdown restarted: ${after} s left after return (was ${before})`);
  await ctx.close();
});

await step("reload of the same tab mid-wait keeps the remaining time (no restart to 10)", async () => {
  const { ctx, page } = await mk(b);
  await open(page);
  await page.fill("#ans", "1"); await page.click("#ansGo");
  await page.waitForFunction(() => window.__drill.state.wait, null, { timeout: 5000 });
  await page.waitForTimeout(3000);
  const before = await secs(page);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_T6B" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const after = await secs(page);
  console.log("     remaining before reload:", before, "after reload:", after);
  assert.ok(after !== null && after <= before, `countdown restarted: ${after} s left after reload (was ${before})`);
  await ctx.close();
});

await b.close();
if (failures) { console.log(failures + " failed"); process.exit(1); }
console.log("all ok");
