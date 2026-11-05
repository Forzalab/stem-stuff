// The second try costs 10 s (Tony Nov 5; sugar, 2-try items): after the first wrong verdict the submit IS a CCW clock-sweep progress bar,
// disabled for 10 s (typed Check, choose-all Check; a single MC's options + ring). Diet: no wait. Reload mid-wait: restarts. Reduced motion: no sweep.
// /check is answered by the test (route); page.clock moves Date / timers (CSS animations run in real time).
//   STEM_TODAY=2026-10-23 python3 serve.py 8813 &   then   STEM_TODAY=2026-10-23 node tests/retry-wait.pw.mjs http://localhost:8813
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
const WRONG = { verdict: "wrong", triesLeft: 1 }, WRONG0 = { verdict: "wrong", triesLeft: 0 }, RIGHT = { verdict: "correct", triesLeft: 1 };
const graded = (page, n) => page.waitForFunction(k => window.__drill.state.tries.length >= k, n, { timeout: 5000 });

async function mk(b, { diet = false, reduced = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  if (diet) await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
  page.checks = 0; page.q = [];
  await page.route("**/state/*", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ wrong: r.request().url().endsWith("/" + page.sc) ? 1 : 0, done: false, gen: 0 }) }));   // the server saw the first wrong too
  await page.route("**/check", r => { page.checks++; r.fulfill({ contentType: "application/json", body: JSON.stringify(page.q.shift() || WRONG0) }); });
  return page;
}
async function open(page, code) {
  await page.goto(BASE + "/#" + code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
}
const sweep = (page, sel) => page.$eval(sel, e => parseFloat(getComputedStyle(e, "::before").getPropertyValue("--sweep")) || 0);
const dis = (page, sel) => page.$eval(sel, e => e.getAttribute("aria-disabled"));
const label = (page, sel) => page.$eval(sel, e => e.getAttribute("aria-label"));
const ff = (page, ms) => page.clock.fastForward(ms);

async function typedFirstWrong(page, code = "CALC1_T6B") {
  page.q = [WRONG, RIGHT]; page.sc = code;
  await open(page, code);
  await page.fill("#ans", "1"); await page.click("#ansGo"); await graded(page, 1);
}

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });

await step("(a) typed num: wrong -> Check is a disabled CCW sweep for 10 s", async () => {
  const page = await mk(b); await typedFirstWrong(page);
  assert.equal(await dis(page, "#ansGo"), "true"); assert.match(await label(page, "#ansGo"), /^Check \(wait \d+ s\)$/);
  assert.ok(await page.$eval("#ansGo", e => e.classList.contains("waiting")), ".waiting");
  await page.waitForTimeout(700);
  const sw = await sweep(page, "#ansGo"); assert.ok(sw > 0 && sw < 360, "--sweep advances: " + sw);
  assert.equal(await page.$eval("#ansGo", e => getComputedStyle(e, "::before").transform !== "none"), true, "mirrored layer");
  await page.fill("#ans", "2");                                   // typing stays allowed
  await ff(page, 5000);
  await page.click("#ansGo", { force: true }); await page.press("#ans", "Enter"); await page.waitForTimeout(200);
  assert.equal(page.checks, 1, "no /check at 5 s");
  await ff(page, 5100);
  assert.equal(await dis(page, "#ansGo"), null, "enabled at 10 s"); assert.equal(await label(page, "#ansGo"), "Check answer");
  await page.click("#ansGo"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(b) choose-all: Check is the sweep", async () => {
  const page = await mk(b); page.q = [WRONG, RIGHT];
  await open(page, "CSCI26_A7K");
  const o = await page.$$("#q .opt"); await o[0].click(); await page.click("#mcGo"); await graded(page, 1);
  assert.equal(await dis(page, "#mcGo"), "true"); assert.match(await label(page, "#mcGo"), /^Check \(wait \d+ s\)$/);
  await page.waitForTimeout(700); assert.ok(await sweep(page, "#mcGo") > 0, "--sweep advances");
  await ff(page, 5000); await page.click("#mcGo", { force: true }); await page.waitForTimeout(200);
  assert.equal(page.checks, 1, "no /check at 5 s");
  await ff(page, 5100); assert.equal(await dis(page, "#mcGo"), null);
  await page.click("#mcGo"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(c) single MC: options ignore taps for 10 s, ring sweeps", async () => {
  const page = await mk(b); page.q = [WRONG, RIGHT];
  await open(page, "CALC1_X2P");
  const live = () => page.$$("#q .opt:not(:disabled)");
  let o = await live(); await o[0].click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await graded(page, 1);
  assert.ok(await page.$eval("#q .choices", e => e.classList.contains("waiting")), "ring on .choices");
  await page.waitForTimeout(700); assert.ok(await sweep(page, "#q .choices") > 0, "--sweep advances");
  o = await live(); assert.equal(await o[0].getAttribute("aria-disabled"), "true");
  await ff(page, 5000); await o[0].click({ force: true }); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  assert.equal(await page.locator("#q .opt[aria-checked=true]").count(), 0, "a tap at 5 s selects nothing"); assert.equal(page.checks, 1);
  await ff(page, 5100);
  o = await live(); assert.equal(await o[0].getAttribute("aria-disabled"), null);
  await o[0].click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(d) diet mode: no wait", async () => {
  const page = await mk(b, { diet: true }); await typedFirstWrong(page);
  assert.equal(await dis(page, "#ansGo"), null); assert.equal(await page.$eval("#ansGo", e => e.classList.contains("waiting")), false);
  await page.fill("#ans", "2"); await page.click("#ansGo"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(e) reload during the wait: it restarts at 10 s", async () => {
  const page = await mk(b); await typedFirstWrong(page);
  await ff(page, 8000);
  await page.reload(); await page.waitForSelector("#ansGo", { timeout: 8000 });
  await page.waitForTimeout(300);
  assert.equal(await dis(page, "#ansGo"), "true", "waiting again after the reload");
  await ff(page, 5000); assert.equal(await dis(page, "#ansGo"), "true", "still waiting 5 s into the new wait");
  await ff(page, 5100); assert.equal(await dis(page, "#ansGo"), null);
  await page.context().close();
});

await step("(f) reduced motion: no sweep animation, unlock at 10 s, countdown announced", async () => {
  const page = await mk(b, { reduced: true }); await typedFirstWrong(page);
  assert.equal(await dis(page, "#ansGo"), "true");
  assert.equal(await page.$eval("#ansGo", e => getComputedStyle(e, "::before").animationName), "none");
  await page.waitForTimeout(700); assert.equal(await sweep(page, "#ansGo"), 0, "dim, never advances");
  assert.match(await page.textContent("#waitLive"), /10 s/);
  await ff(page, 5100); assert.match(await page.textContent("#waitLive"), /5 s/); assert.equal(await dis(page, "#ansGo"), "true");
  await ff(page, 5000); assert.equal(await dis(page, "#ansGo"), null); assert.equal(await page.textContent("#waitLive"), "Ready");
  await page.context().close();
});

await step("(g) leaving the item cancels the wait", async () => {
  const page = await mk(b); await typedFirstWrong(page);
  await open(page, "CALC1_X2P");
  assert.equal(await page.locator("#q .waiting").count(), 0);
  await page.context().close();
});

await b.close();
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
