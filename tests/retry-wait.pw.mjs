// The second try costs 10 s (Tony Nov 5; sugar, 2-try items): after the first wrong verdict the submit IS a CCW clock-sweep progress bar,
// disabled for 10 s (typed Check, choose-all Check); a single MC's live, un-picked options each drain 100% -> 0% (no ring). One neutral subtle tone, no blue (Tony Nov 5). Diet: no wait. Reload mid-wait: keeps the deadline (sessionStorage stem-wait). Reduced motion: no sweep.
// /check is answered by the test (route); page.clock moves Date / timers (CSS animations run in real time).
//   STEM_TODAY=2026-10-23 python3 serve.py 8813 &   then   STEM_TODAY=2026-10-23 node tests/retry-wait.pw.mjs http://localhost:8813
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { jump } from "./lib/clock.mjs";
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
  // the server saw the first wrong too, but only once a check was answered (a state with a wrong at open would start the wait before the first click)
  await page.route("**/state/*", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ wrong: page.checks > 0 && r.request().url().endsWith("/" + page.sc) ? 1 : 0, done: false, gen: 0 }) }));
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
const ff = (page, ms) => jump(page, "fastForward", ms);   // frozen jump: a raw fastForward under CI load can be rewound by an in-flight real-time tick (bug class playwright-clock-race)
/* the option's current --drain (percent), read off the computed gradient's first colour stop (-1 = no gradient) */
const drain = (page, sel) => page.$eval(sel, e => { const m = /\)\s+([\d.]+)%/.exec(getComputedStyle(e).backgroundImage); return m ? parseFloat(m[1]) : -1; });
/* does the painted layer use the --action blue (#5aa9ff = rgb(90, 169, 255))? */
const blue = (page, sel, pseudo) => page.$eval(sel, (e, ps) => /90,\s*169,\s*255/.test(getComputedStyle(e, ps || null).backgroundImage), pseudo);

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
  assert.equal(await blue(page, "#ansGo", "::before"), false, "the sweep is the neutral tone, no --action blue");
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

await step("(c) single MC: options ignore taps for 10 s; each live un-picked option drains 100% -> 0%, no ring", async () => {
  const page = await mk(b); page.q = [WRONG, RIGHT];
  await open(page, "CALC1_X2P");
  const live = () => page.$$("#q .opt:not(:disabled)");
  let o = await live(); await o[0].click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await graded(page, 1);
  assert.equal(await page.$eval("#q .choices", e => getComputedStyle(e, "::before").content), "none", "no ring on .choices");
  await page.waitForTimeout(700);
  const d0 = await drain(page, "#q .opt:not(:disabled)"); assert.ok(d0 > 0 && d0 < 100, "--drain is falling: " + d0);
  assert.equal(await page.$eval("#q .opt:disabled", e => getComputedStyle(e).backgroundImage), "none", "the struck wrong pick shows no drain");
  assert.equal(await blue(page, "#q .opt:not(:disabled)"), false, "the drain is the neutral tone, no --action blue");
  await page.waitForTimeout(600); const d1 = await drain(page, "#q .opt:not(:disabled)"); assert.ok(d1 < d0, `drains (CSS animations run in real time): ${d0} -> ${d1}`);
  o = await live(); assert.equal(await o[0].getAttribute("aria-disabled"), "true");
  await ff(page, 5000); await o[0].click({ force: true }); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  assert.equal(await page.locator("#q .opt[aria-checked=true]").count(), 0, "a tap at 5 s selects nothing"); assert.equal(page.checks, 1);
  await ff(page, 5100);
  o = await live(); assert.equal(await o[0].getAttribute("aria-disabled"), null);
  assert.equal(await page.$eval("#q .opt:not(:disabled)", e => getComputedStyle(e).backgroundImage), "none", "the drain is gone at 10 s");
  await o[0].click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(d) diet mode: no wait", async () => {
  const page = await mk(b, { diet: true }); await typedFirstWrong(page);
  assert.equal(await dis(page, "#ansGo"), null); assert.equal(await page.$eval("#ansGo", e => e.classList.contains("waiting")), false);
  await page.fill("#ans", "2"); await page.click("#ansGo"); await graded(page, 2); assert.equal(page.checks, 2);
  await page.context().close();
});

await step("(e) reload during the wait: it keeps the deadline (no restart to 10 s; tests/tab-countdown.pw.mjs)", async () => {
  const page = await mk(b); await typedFirstWrong(page);
  await ff(page, 5000);   // ~5 s stay on the clock: a slow reload (CI load; the flowing clock keeps running) cannot eat the 1 s bar below
  const deadline = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("stem-wait") || "null")?.until ?? null);
  const until0 = await deadline();
  await page.reload(); await page.waitForSelector("#ansGo", { timeout: 8000 });
  await page.waitForTimeout(300);
  // the flowing clock also runs through the reload, so judge against the stored deadline, not a fixed jump
  assert.equal(await deadline(), until0, "the same deadline after the reload (not a new 10 s)");
  assert.equal(await dis(page, "#ansGo"), "true", "still waiting after the reload");
  const left = await page.evaluate(u => u - Date.now(), until0);
  assert.ok(left > 1000, `the original deadline still ahead after the reload: ${left} ms`);
  await ff(page, left - 1000); assert.equal(await dis(page, "#ansGo"), "true", "still waiting 1 s before the original deadline");
  await ff(page, 1100); assert.equal(await dis(page, "#ansGo"), null, "ready when the original deadline passes");
  await page.context().close();
});

await step("(f) reduced motion: no sweep animation, unlock at 10 s, countdown announced", async () => {
  const page = await mk(b, { reduced: true }); await typedFirstWrong(page);
  assert.equal(await dis(page, "#ansGo"), "true");
  assert.equal(await page.$eval("#ansGo", e => getComputedStyle(e, "::before").animationName), "none");
  await page.waitForTimeout(700); assert.equal(await sweep(page, "#ansGo"), 0, "dim, never advances");
  assert.match(await page.textContent("#waitLive"), /10 s/);
  await jump(page, "runFor", 5100); assert.match(await page.textContent("#waitLive"), /5 s/);   /* runFor, not fastForward: the 5 s countdown line is a 1 s interval tick, and fastForward fires a due interval only once, at the end of the jump */ assert.equal(await dis(page, "#ansGo"), "true");
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
