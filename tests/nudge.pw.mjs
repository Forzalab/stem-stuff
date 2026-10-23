// J5 Cluck nudge, Tier 0 (intent.js → peek.js stemDuck.say; brain cluck-nudge.md 🔒): Jev on by default (art. 11, no flag), the first item idle past 80 s with
// no pick (Q) → Cluck's peek rises carrying a Q line from copy/nudge-lines.js. Any input puts it away (a dismiss: Jev's gap doubles); a tap
// counts as taken. ?jev=0 (this device off) = no nudge. The roll is pinned (__stemJevRand = 0) so it always fires. Phone 390 + desktop 1280, shots.
//   node tests/nudge.pw.mjs <port> [shots dir]      (starts its own serve.py on that port)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8875", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "j5-")), banks = join(tmp, "banks"), shots = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(shots, { recursive: true });
const LINES = (() => { const w = {}; w.window = w; vm.runInNewContext(readFileSync(join(ROOT, "copy/nudge-lines.js"), "utf8"), w); return w.__stemNudgeLines; })();
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_T95M${n}`, title: `T95 ${n}`, type: "mc", shuffle: false, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })) }));
writeFileSync(join(banks, "BANK_T95.json"), JSON.stringify({ v: 1, problems: PROBS }));
/* ladder lane 4: an MC item carrying the pilot's Q11 Q4e ladder (2 mid pieces) + the pilot sheet, so #fcard shows in sugar */
const LAD = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/ladder-pilot.json"), "utf8")).items.find(i => i.code === "PHYS_Z3X");
writeFileSync(join(banks, "formula-sheet.json"), readFileSync(join(ROOT, "tests/fixtures/formula-sheet-pilot.json")));
writeFileSync(join(banks, "BANK_T95L.json"), JSON.stringify({ v: 1, problems: [{ ...PROBS[0], code: "CALC1_T95L1", title: "T95 ladder",
  saccharine: { title: LAD.title, part: LAD.part, ladder: LAD.ladder } }] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch();

async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, hasTouch: !!o.touch });
  const page = await ctx.newPage();
  page.errs = []; page.ai = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) page.errs.push(m.text()); });
  page.on("request", r => { if (/\/(explain|chat|nudge)$/.test(new URL(r.url()).pathname)) page.ai++; });
  await page.addInitScript(() => { window.__stemJevRand = () => 0; });
  await page.clock.install();
  await page.goto(BASE + "/" + (o.jev === false ? "?jev=0" : "") + "#" + (o.bank || "BANK_T95"));
  await page.clock.runFor(3000);
  await page.waitForFunction(() => !!window.stemDuck && !document.getElementById("splash"), null, { timeout: 10000 });
  await page.waitForFunction(() => !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  return page;
}
/* runFor can land short while the page is busy: top it up from the page's own clock (as idle-peek.pw.mjs) */
async function idle(page, ms) {
  const t0 = await page.evaluate(() => performance.now());
  await page.clock.runFor(ms);
  for (let k = 0; k < 5; k++) {
    const left = ms - ((await page.evaluate(() => performance.now())) - t0);
    if (left < 500) return;
    await page.clock.runFor(Math.ceil(left));
  }
}
const up = page => page.evaluate(() => window.stemDuck.up);
const settle = page => page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) a.finish(); }));
const look = page => page.evaluate(() => {
  const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const duck = r(document.querySelector(".ck-peek")), say = r(document.querySelector(".ck-say"));
  const hit = (a, b) => a.l < b.right && a.r > b.left && a.t < b.bottom && a.b > b.top;
  const over = [...document.querySelectorAll("button, a, input, textarea, [role=button], .opt")].filter(e => !e.closest(".ck-rise") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
    .filter(e => hit(duck, e.getBoundingClientRect()) || hit(say, e.getBoundingClientRect())).map(e => e.id || e.className);
  const s = document.querySelector(".ck-say");
  return { say: s.textContent, sayOp: +getComputedStyle(s).opacity, oneLine: s.getBoundingClientRect().height < 2 * parseFloat(getComputedStyle(s).lineHeight || "20") + 1,
    label: document.querySelector(".ck-peek").getAttribute("aria-label"), over, W: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth };
});
const jev = page => page.evaluate(() => window.stemJev().nudge);

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
  await step(`${name}: default on (no flag), first item idle past 80 s with no pick → the peek rises with a Q line; a key puts it away and the gap doubles`, async () => {
    const page = await open({ vp, touch: name === "phone" });
    await idle(page, 75000);
    assert.equal(await up(page), false, "nothing before the Q depth");
    await idle(page, 15000);
    assert.equal(await up(page), true, "the nudge at ~80 s (Jev ticks every 5 s)");
    await settle(page);
    const L = await look(page), N = await jev(page);
    assert.ok(LINES.Q.includes(L.say), "a Q line: " + L.say);
    assert.equal(L.label, "Cluck: " + L.say);
    assert.equal(L.sayOp, 1, "the line shows");
    assert.ok(L.oneLine, "one line");
    assert.deepEqual(L.over, [], "the duck and its line rest on no control");
    assert.ok(L.scrollW <= L.W, "no sideways scroll");
    assert.equal(N.n, 1); assert.equal(N.last.state, "Q"); assert.equal(N.last.line, L.say);
    await page.screenshot({ path: join(shots, `nudge-${vp.width}.png`) });
    await page.keyboard.press("Shift");
    assert.equal(await up(page), false, "any input puts it away");
    const M = await jev(page);
    assert.equal(M.dismissed, 1); assert.equal(M.gap, 360);
    await idle(page, 120000);
    assert.equal((await jev(page)).n, 1, "1 per item");
    assert.equal(page.ai, 0, "Tier 0: no server call");
    assert.deepEqual(page.errs, [], "no console errors");
    await page.context().close();
  });
}

await step("a tap on the nudge = taken (no back-off)", async () => {
  const page = await open({ vp: { width: 1280, height: 800 } });
  await idle(page, 90000);
  assert.equal(await up(page), true);
  await settle(page);
  await page.click(".ck-peek");
  const N = await jev(page);
  assert.equal(N.taps, 1); assert.equal(N.dismissed, 0); assert.equal(N.gap, 180);
  assert.deepEqual(page.errs, [], "no console errors");
  await page.context().close();
});

await step("lane 4: a held pick past 20 s (no samples yet) pops one ladder piece + a hold_mid line; no input, the 2nd still fires", async () => {
  const page = await open({ vp: { width: 1280, height: 800 }, bank: "BANK_T95L" });
  const mids = () => page.$$eval("#fcard li.f.mid", ms => ms.filter(m => !m.hidden).length);
  assert.equal(await mids(), 0, "the ladder starts as the big pieces");
  await page.click("#q .opt[data-id=b]");
  assert.equal(await page.getAttribute("#q .opt[data-id=b]", "aria-checked"), "true");
  await idle(page, 15000);
  assert.equal(await mids(), 0, "not before 20 s");
  await idle(page, 10000);
  assert.equal(await mids(), 1, "one piece out");
  await settle(page);
  const L = await look(page), H = await page.evaluate(() => window.stemJev().hold);
  assert.ok(LINES.hold_mid.includes(L.say), "a hold_mid line: " + L.say);
  assert.deepEqual(H, { code: "CALC1_T95L1", n: 1 });
  await idle(page, 21000);
  assert.equal(await mids(), 2, "no input since: the 2nd still fires (stalling = normal idling)");
  assert.deepEqual(await page.evaluate(() => window.stemJev().hold), { code: "CALC1_T95L1", n: 2 });
  assert.equal(page.ai, 0, "no server call");
  assert.deepEqual(page.errs, [], "no console errors");
  await page.context().close();
});

await step("?jev=0 (off on this device): no nudge at 90 s, no stemJev", async () => {
  const page = await open({ jev: false });
  await idle(page, 90000);
  assert.equal(await up(page), false);
  assert.equal(await page.evaluate(() => typeof window.stemJev), "undefined");
  await page.context().close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAILED` : "ALL OK", "(shots:", shots + ")");
process.exit(failures ? 1 : 0);
