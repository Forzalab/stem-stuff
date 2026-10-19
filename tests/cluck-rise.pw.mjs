// B7 (ii) (Tony, Oct 18): a wrong answer never opens Cluck by itself, on desktop too: the duck's sunrise comes (peek.js), and Cluck opens
// when the student taps the duck. Cluck's reply already streams in the background from the wrong answer (if the hourly auto budget allows,
// app.js WISH_AUTO), so the duck opens it with the text there: ONE request, reused. Budget spent = no request, the duck still rises.
// A right answer and diet ask nothing. Phone 390 + desktop 1280, on a fake clock (as idle-peek). Own serve.py + a stub OpenRouter.
//   node tests/cluck-rise.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8876", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "b7-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2, 3].map(n => ({ code: `CALC1_B7R${n}`, title: `B7 ${n}`, type: "mc", shuffle: false, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `B7 ${n}`, key: "Tick: a", slip: { b: "Two is not one." } } }));
writeFileSync(join(banks, "BANK_B7R.json"), JSON.stringify({ v: 1, problems: PROBS }));
/* a stub OpenRouter: Cluck's text in 3 pieces, 150 ms apart; counts the streamed (Cluck) requests */
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "Tick: a. Egg-cellent."];
let asked = 0;
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  asked++;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 150);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const DIET = [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }];
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const VPS = [["1280", { width: 1280, height: 900 }], ["390", { width: 390, height: 844 }]];

/* a page on a fake clock (idle-peek's open()); /explain counted at the page too */
async function open(vp, o = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  if (o.diet) await ctx.addCookies(DIET);
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.ai = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("request", r => { if (/\/(explain|chat)$/.test(new URL(r.url()).pathname)) page.ai++; });
  await page.clock.install();
  await page.goto(BASE + "/#BANK_B7R");
  await page.clock.runFor(3000);
  await page.waitForFunction(() => !!window.stemDuck && !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  if (o.spent) await page.evaluate(() => localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))));   // this hour's 5 auto asks are used up
  asked = 0;
  return page;
}
const pick = async (page, id) => {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
};
const up = page => page.evaluate(() => window.stemDuck.up);
const cluckOpen = page => page.evaluate(() => !!window.stemCluckOpen && window.stemCluckOpen());
const settle = page => page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) a.finish(); }));
/* the stream runs on the real network: wait (real time) for the whole reply, kept in this browser when it ends */
const streamed = page => page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 8000, polling: 100 });

for (const [tag, vp] of VPS) {
  await step(`${tag}: a wrong answer leaves Cluck closed, streams his reply in the background, the duck rises; the duck opens Cluck on that text (one request)`, async () => {
    const page = await open(vp);
    await pick(page, "b");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), false, "a wrong answer does not open Cluck");
    await streamed(page);                                               // already streaming before the duck is tapped
    assert.equal(asked, 1, "the background stream: one Cluck request");
    await page.clock.runFor(1200);
    assert.equal(await up(page), true, "the duck's sunrise comes ~0.7 s after the wrong answer");
    assert.equal(await cluckOpen(page), false, "still closed while the duck is up");
    await settle(page); await page.clock.runFor(1000); await settle(page);
    const duck = await page.evaluate(() => { const b = document.querySelector(".ck-peek").getBoundingClientRect(); return { op: +getComputedStyle(document.querySelector(".ck-duck")).opacity, top: b.top, bottom: b.bottom }; });
    assert.ok(duck.op === 1 && duck.top < vp.height && duck.bottom > 0, "the duck is up, on screen: " + JSON.stringify(duck));
    assert.match(await page.textContent(".cl-peek .cl-steps"), /POOF! A wish is a wish\./, "the hint card already shows the start of Cluck's text");
    await page.screenshot({ path: join(SHOTS, `b7-duck-risen-${tag}.png`) });
    await page.click(".ck-peek");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), true, "the duck opens Cluck");
    await page.click("#cluck .wtext").catch(() => {});                  // a tap skips the typing
    await page.clock.runFor(2000);
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 4000 });
    assert.match(await page.textContent("#cluck .wtext"), /POOF! A wish is a wish\./, "the streamed text is in the sheet");
    assert.equal(await page.isVisible("#cluck .cl-bar"), true, "the Cluck / TUTOR header bar shows (B5)");
    assert.equal(await page.isVisible("#cluck .cl-bar .cl-x"), true, "its X shows");
    assert.equal(await page.isHidden("#cluck .cl-x2"), true, "no corner X");
    await page.screenshot({ path: join(SHOTS, `b7-cluck-open-${tag}.png`) });
    await page.waitForTimeout(500);
    assert.equal(asked, 1, "exactly one Cluck request: opening reuses the stream");
    assert.equal(page.ai, 1, "one /explain from the page");
    await page.click("#cluck .cl-bar .cl-x");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), false, "the bar's X closes it");
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });

  await step(`${tag}: the hourly auto budget spent: no request, the duck still rises, Cluck stays closed`, async () => {
    const page = await open(vp, { spent: true });
    await pick(page, "b");
    await page.clock.runFor(1500);
    assert.equal(await up(page), true, "the duck rises");
    assert.equal(await cluckOpen(page), false, "Cluck stays closed");
    await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForTimeout(600);
    assert.equal(asked, 0, "no Cluck request"); assert.equal(page.ai, 0, "no /explain");
    await page.click(".ck-peek");                                       // the duck: no new AI call (T34), the chip gets the focus
    await page.clock.runFor(300); await page.waitForTimeout(400);
    assert.equal(asked, 0, "the duck's tap does not spend a call");
    await page.context().close();
  });
}

/* app.js shouldPrefetch (Tony, Oct 18): only the first 2 questions opened this session prefetch; the 3rd asks when the student opens Cluck */
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.getElementById("freeze").hidden, code, { timeout: 8000 }); };
for (const [tag, vp] of VPS) await step(`${tag}: Q1 + Q2 wrong prefetch once each; Q3 wrong asks nothing until Cluck is opened, then one normal request`, async () => {
  const page = await open(vp);
  for (const [i, code] of ["CALC1_B7R1", "CALC1_B7R2"].entries()) {
    await go(page, code);
    await pick(page, "b");
    await streamed(page);
    await page.waitForFunction(n => (localStorage.getItem("stem-cluck") || "").split("Egg-cellent").length - 1 === n, i + 1, { timeout: 8000, polling: 100 });
    assert.equal(asked, i + 1, `${code}: exactly one prefetch`);
    assert.equal(await cluckOpen(page), false, `${code}: Cluck stays closed`);
  }
  await go(page, "CALC1_B7R3");
  await pick(page, "b");
  await page.clock.runFor(1500);
  await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
  await page.waitForTimeout(800);
  assert.equal(asked, 2, "Q3: no prefetch"); assert.equal(page.ai, 2, "Q3: no /explain yet");
  assert.equal(await cluckOpen(page), false, "Q3: Cluck stays closed");
  await page.click("#wish .wchip");                                     // the student opens Cluck: the normal request
  await page.clock.runFor(300);
  assert.equal(await cluckOpen(page), true, "the chip opens Cluck");
  await page.click("#cluck .wtext").catch(() => {});
  await page.clock.runFor(2000);
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 6000, polling: 100 });
  assert.equal(asked, 3, "Q3: one request, on open"); assert.equal(page.ai, 3);
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("1280: a right answer and diet ask Cluck nothing", async () => {
  const page = await open(VPS[0][1]);
  await pick(page, "a");
  await page.clock.runFor(1500); await page.waitForTimeout(600);
  assert.equal(page.ai, 0, "right: no /explain"); assert.equal(await cluckOpen(page), false);
  await page.context().close();
  const d = await open(VPS[0][1], { diet: true });
  await pick(d, "b");
  await d.clock.runFor(1500); await d.waitForTimeout(600);
  assert.equal(d.ai, 0, "diet: no /explain"); assert.equal(asked, 0); assert.equal(await cluckOpen(d), false);
  await d.context().close();
});

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
