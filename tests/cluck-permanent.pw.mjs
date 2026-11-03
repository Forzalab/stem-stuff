// BIG PLAN V1 (Tony, Nov 2 22:49 / 23:01): on desktop sugar (>= 720) Cluck's box is a permanent fixture of the right column.
//   open    open from page load, no click: #work.cl-on #cluck is visible, videos above, the box below
//   no X    the X is not shown; Escape leaves it open and sets no html.cl-gone; the sash dragged to the right edge does not dismiss it
//   miss    a wrong answer streams into the open box with no click on anything
//   height  the brainrot "Hide" toggle: the box grows (>= 250 px) and the videos row shrinks to its label row (<= 40 px)
//   next    the next question has the box open again (empty), still no X
//   guard   phone sugar (393): no box on load, the X shows once opened, Escape and the X close it; desktop diet: no box
// CP_W=1280,721 (desk) or 393 (phone); default all. run-all splits them: cluck-permanent@desk, cluck-permanent@phone. Own serve.py + a stub OpenRouter.
//   node tests/cluck-permanent.pw.mjs <port> [shots dir]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8883", BASE = `http://127.0.0.1:${PORT}`;
const W = (process.env.CP_W || "1280,721,393").split(",").map(Number);
const tmp = mkdtempSync(join(tmpdir(), "cperm-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_CPM${n}`, title: `Perm ${n}`, type: "mc", shuffle: false,
  body: txt(`A 2.0 kg block starts from rest and slides 3.0 m down a frictionless ramp tilted at 30 degrees (${n}). How fast is it moving at the bottom?`), correct: "a",
  choices: ["5.4 m/s", "2.7 m/s", "7.7 m/s", "9.8 m/s"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `Perm ${n}`, key: "Tick: a", slip: { b: "Half of it." } } }));
writeFileSync(join(banks, "BANK_CPM.json"), JSON.stringify({ v: 1, problems: PROBS }));
const SHORT = ["Only the part of gravity along the ramp speeds it up.\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < SHORT.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: SHORT[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
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
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, { diet = false } = {}) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  if (diet) await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_CPM");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  return page;
}
const box = page => page.evaluate(() => {
  const c = document.querySelector("#cluck"), x = document.querySelector("#cluck .cl-bar .cl-x"), r = document.querySelector("#rot");
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  return { on: document.querySelector("#work").classList.contains("cl-on"), box: vis(c), x: vis(x), gone: document.documentElement.classList.contains("cl-gone"),
    h: c ? c.getBoundingClientRect().height : 0, rot: r ? r.getBoundingClientRect().height : -1, open: window.stemCluckOpen(), text: c ? c.innerText : "" };
});
const wrong = async page => { await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send'); };

for (const w of W.filter(w => w >= 720)) {
  await step(`@desk ${w}: Cluck's box is open from load, no X, Escape and the sash cannot close it`, async () => {
    const page = await open(w);
    let s = await box(page);
    assert.ok(s.on && s.box && s.open, "open on load, no click: " + JSON.stringify(s));
    assert.ok(!s.x, "no X");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    s = await box(page);
    assert.ok(s.on && s.box && s.open && !s.gone, "Escape leaves it open: " + JSON.stringify(s));
    const b = await page.locator("#sash").boundingBox(), y = b.y + 200, x0 = b.x + b.width / 2;
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (w - 10 - x0) * i / 10, y);
    await page.mouse.up(); await page.waitForTimeout(200);
    s = await box(page);
    assert.ok(s.on && s.box && s.open && !s.gone, "the sash dragged to the right edge does not dismiss it: " + JSON.stringify(s));
    await page.screenshot({ path: join(SHOTS, `cperm-open-${w}.png`) });
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });
  await step(`@desk ${w}: a wrong answer streams into the open box with no click`, async () => {
    const page = await open(w);
    await wrong(page);
    await page.waitForFunction(() => /ramp speeds it up/.test(document.querySelector("#cluck")?.innerText || ""), null, { timeout: 10000 });
    const s = await box(page);
    assert.ok(s.on && s.box && !s.x && s.open, "still open, no X: " + JSON.stringify(s));
    await page.context().close();
  });
  await step(`@desk ${w}: the videos Hide toggle scales the box (+250 px at 1280, +100 at 721; videos row <= 40 px)`, async () => {
    const page = await open(w);
    const a = await box(page);
    assert.ok(a.rot > 100, "the videos show above the box: " + JSON.stringify(a));
    await page.evaluate(() => { const l = [...document.querySelectorAll("#rot button, #rot a")].find(e => /hide/i.test(e.textContent)); l.click(); });
    await page.waitForTimeout(700);
    const b = await box(page);
    assert.ok(b.h - a.h >= (w >= 1000 ? 250 : 100), `box grows: ${a.h} -> ${b.h}`);
    assert.ok(b.rot >= 0 && b.rot <= 40, `videos row folds: ${b.rot}`);
    await page.context().close();
  });
  await step(`@desk ${w}: the next question has the box open again`, async () => {
    const page = await open(w);
    const code = await page.textContent("#pcode");
    await page.evaluate(() => document.querySelector("#qnext").click());
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, code, { timeout: 8000 });
    await page.waitForTimeout(500);
    const s = await box(page);
    assert.ok(s.on && s.box && !s.x && s.open, "open on Q2: " + JSON.stringify(s));
    await page.context().close();
  });
  await step(`@desk ${w} diet: no Cluck box`, async () => {
    const page = await open(w, { diet: true });
    const s = await box(page);
    assert.ok(!s.box && !s.on && !s.open, "no box in diet: " + JSON.stringify(s));
    await page.context().close();
  });
}
for (const w of W.filter(w => w < 720)) {
  await step(`@phone ${w}: no box on load; opened it has the X; Escape and the X close it`, async () => {
    const page = await open(w);
    let s = await box(page);
    assert.ok(!s.box && !s.open, "closed on load: " + JSON.stringify(s));
    await wrong(page);
    await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000 });
    await page.evaluate(() => window.stemIdleTap());
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    s = await box(page);
    assert.ok(s.box && s.x, "open with the X: " + JSON.stringify(s));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    assert.ok(!(await box(page)).open, "Escape closes it");
    await page.evaluate(() => window.stemIdleTap());
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    await page.click("#cluck .cl-bar .cl-x"); await page.waitForTimeout(300);
    assert.ok(!(await box(page)).open, "the X closes it");
    await page.context().close();
  });
}
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
