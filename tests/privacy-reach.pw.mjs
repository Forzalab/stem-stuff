// G3 "Telemetry safe": the privacy opt-out is reachable on a phone (393x852) WHILE A QUESTION IS OPEN, in 2 taps:
// the question list button, then the quiet "privacy" link under the list (index.html #privacy, nav.js --ql-bottom). Also: the start
// page footer link still works, and the link covers nothing (not the list, not the code bar). Needs a running server and Playwright:
//   python3 serve.py 8816 &   then   node tests/privacy-reach.pw.mjs http://localhost:8816 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8816";
const SHOTS = process.argv[3] || "";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const phone = () => browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
const box = (page, s) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, s);

await step("393 phone, a question open: list button -> 'privacy' link -> privacy.html (2 taps), covering nothing", async () => {
  const ctx = await phone(), page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_PSY6");   // a tracked practice bank: the list is on
  await page.waitForFunction(() => !document.querySelector("#freeze").hidden && !document.querySelector("#qnav").hidden && document.querySelector("#pcode").textContent, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  assert.ok(await page.locator("#privacy").isHidden(), "over a closed question the bottom stays the bar's (D75)");
  await page.tap("#qlistBtn");                                                      // tap 1
  await page.waitForFunction(() => document.documentElement.classList.contains("ql-open"), null, { timeout: 4000 });
  await page.waitForTimeout(400);
  const a = page.locator("a#privacy");
  assert.ok(await a.isVisible(), "privacy link not shown with the open list");
  assert.equal(await a.getAttribute("href"), "privacy.html");
  assert.equal(await a.getAttribute("aria-label"), "Privacy");
  const g = { a: await box(page, "#privacy"), list: await box(page, "#qlist"), dock: await box(page, "#dock") };
  assert.ok(g.a.top >= g.list.bottom - 1, `link over the list: ${JSON.stringify(g)}`);
  assert.ok(g.a.bottom <= g.dock.top + 1, `link over the code bar: ${JSON.stringify(g)}`);
  const hit = await page.evaluate(() => { const r = document.querySelector("#privacy").getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("#privacy") != null; });
  assert.ok(hit, "something (the dim?) sits over the link");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/privacy-reach-list-393.png` });
  await a.tap();                                                                    // tap 2
  await page.waitForURL(/privacy\.html$/, { timeout: 5000 });
  assert.ok(await page.locator("#offBtn").isVisible(), "privacy page without its opt-out button");
  await ctx.close();
});

await step("393 phone: keyboard reaches it too (Tab from the open list lands on the link)", async () => {
  const ctx = await phone(), page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_PSY6");
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden && document.querySelector("#pcode").textContent, null, { timeout: 8000 });
  await page.focus("#qlistBtn"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.classList.contains("ql-open"), null, { timeout: 4000 });
  let on = false;
  for (let i = 0; i < 200 && !on; i++) { await page.keyboard.press("Tab"); on = await page.evaluate(() => document.activeElement?.id === "privacy"); }
  assert.ok(on, "Tab never reached #privacy");
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("ql-open")), "the list closed on the way");
  await ctx.close();
});

await step("393 phone, start page: the footer link still works", async () => {
  const ctx = await phone(), page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("stem-src", "file"); } catch { /* blocked */ } });   // no server pointer: the start page
  await page.goto(BASE + "/");
  await page.waitForFunction(() => document.documentElement.classList.contains("start"), null, { timeout: 8000 });
  const a = page.locator("a#privacy");
  assert.ok(await a.isVisible(), "start page footer link hidden");
  await a.tap();
  await page.waitForURL(/privacy\.html$/, { timeout: 5000 });
  await ctx.close();
});

await browser.close();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
