// W3 (Nov 5): Cluck / repair / rewards polish. One serve.py, a stub OpenRouter, a throwaway bank. 390 phone + 1280 desk.
//   (1 and 4: phone only; desktop sugar keeps Cluck open as a permanent box: no close, no peek)
//   1  closing Cluck's sheet unmounts the repair box (#rpHost); the first time ever a note says where Cluck went (flag stem-ob-cluck)
//   2  a right main answer unmounts the repair box
//   3  a repair "Final answer" chip graded right picks and checks the same option in the main box
//   4  the 2nd "?" tap on a question: the duck peeks "stuck? ask me"; a tap on it opens Cluck (never auto)
//   5  the key-formulas ladder reveals its next piece every 30 s (visible time, sheet closed)
//   7  a swipe up on the reward banner hides it; a tap still opens its popover; the next question brings it back
//   node tests/w3.pw.mjs <port> [only: 1,2,3,4,5,7]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8879", BASE = `http://127.0.0.1:${PORT}`;
const ONLY = (process.argv[3] || "1,2,3,4,5,6,7,8,9").split(",");
const tmp = mkdtempSync(join(tmpdir(), "w3-")), banks = join(tmp, "banks");
mkdirSync(banks);
const doc = { purpose: "Work is force times distance.", sym: [{ s: "W", m: "work", u: "J" }], when: "A force moves something.", ex: "5 N over 2 m is 10 J." };
writeFileSync(join(banks, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Work", rows: [
  { id: "FA", tex: "W = F d", doc }, { id: "FB", tex: "K = \\tfrac12 m v^2", doc }, { id: "FC", tex: "P = W / t", doc }] }] }));
const mc = { code: "CALC1_W3MC", title: "MC", type: "mc", shuffle: false, body: [{ type: "text", md: "How much work? Pick one." }], correct: "b",
  choices: ["1.20 J", "1.80 J", "2.40 J", "3.60 J"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: "MC", key: "Tick: b", part: ["FA", "FB", "FC"], slip: { c: "Three is not two." } },
  repair: { steps: [{ id: "answer", label: "Final answer", kind: "pick" }] } };
const num = n => ({ code: `CALC1_W3N${n}`, title: `Num ${n}`, type: "num", body: [{ type: "text", md: `Find the work (${n}).` }], answer: "42", saccharine: { title: `Num ${n}`, key: "Answer: 42", part: ["FA", "FB", "FC"] } });
writeFileSync(join(banks, "BANK_WTHR.json"), JSON.stringify({ v: 1, problems: [mc, num(1), num(2)] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const parts = ["POOF! A reply with some words in it.\n", "Tick: b. Egg-cellent."]; let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: ["ignore", "ignore", process.env.W3_LOG ? "inherit" : "ignore"] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(vp, code, o = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  if (o.clock) await page.clock.install();
  await page.goto(BASE + "/#BANK_WTHR");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  if (code) await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => (!c || document.querySelector("#pcode")?.textContent === c) && !!document.querySelector("#q .opt, #ans"), code, { timeout: 8000 });
  await page.waitForTimeout(300);
  return page;
}
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
async function pick(page, id) {
  await skipRetryWait(page);
  const n = await tries(page);
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
}
const miss = async page => { await skipRetryWait(page); const n = await tries(page); await page.fill("#ans", "999"); await page.press("#ans", "Enter");
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 8000 }); await page.waitForTimeout(150); };
const replied = page => page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
const VPS = [["390", { width: 390, height: 844 }], ["1280", { width: 1280, height: 800 }]];

for (const [tag, vp] of VPS) {
  if (ONLY.includes("1") && tag === "390") await step(`${tag} 1: closing Cluck unmounts the repair box; the first close shows the note once`, async () => {
    const page = await open(vp, "CALC1_W3MC");
    await pick(page, "c"); await page.waitForSelector("#rpHost .rp", { timeout: 5000 }); await replied(page);
    await page.evaluate(() => window.stemIdleTap());
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    await page.click("#cluck .cl-x");
    await page.waitForFunction(() => !window.stemCluckOpen(), null, { timeout: 3000 });
    assert.equal(await page.locator("#rpHost").count(), 0, "the repair box is gone after the sheet closed");
    await page.waitForFunction(() => /Cluck lives in Ask Cluck/.test(document.querySelector("#toast")?.textContent || ""), null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-ob-cluck")), "1", "the flag is set once the note was placed");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  if (ONLY.includes("9")) await step(`${tag} 9: "Skip for now" removes the repair box and puts the focus back in the answer box`, async () => {
    const page = await open(vp, "CALC1_W3MC");
    await pick(page, "c"); await page.waitForSelector("#rpHost .rp-skip", { timeout: 5000 });
    await page.click("#rpHost .rp-skip");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#rpHost").count(), 0, "Skip left the repair box up");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest("#q")), true, "the focus is not in the question box");
    await page.context().close();
  });
  if (ONLY.includes("2")) await step(`${tag} 2: a right main answer unmounts the repair box`, async () => {
    const page = await open(vp, "CALC1_W3MC");
    await pick(page, "c"); await page.waitForSelector("#rpHost .rp", { timeout: 5000 });
    await pick(page, "b");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#rpHost").count(), 0, "the repair box is gone after the right answer");
    await page.context().close();
  });
  if (ONLY.includes("3")) await step(`${tag} 3: a right "Final answer" chip picks and checks the same option in the main box`, async () => {
    const page = await open(vp, "CALC1_W3MC");
    await pick(page, "c"); await page.waitForSelector('#rpHost .rp-chip[data-v="b"]', { timeout: 5000 });
    await skipRetryWait(page);                                    // the chip is the second try: it waits the 10 s too
    await page.click('#rpHost .rp-chip[data-v="b"]');
    await page.waitForFunction(() => window.__drill.state.tries.length === 2 && window.__drill.state.tries.at(-1).v === "correct", null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__drill.state.tries.at(-1).c), "b");
    assert.equal(await page.locator('.opt[data-id="b"].right').count(), 1, "the main box shows 1.80 J right");
    await page.context().close();
  });
  if (ONLY.includes("4") && tag === "390") await step(`${tag} 4: the 2nd "?" tap: the duck peeks "stuck? ask me"; its tap opens Cluck`, async () => {
    const page = await open(vp, "CALC1_W3N1");
    await miss(page); await replied(page); await page.waitForTimeout(1200);       // the wrong-answer sunrise has come and goes with the first input
    await page.click("#fcard .fq");
    await page.waitForTimeout(800);
    assert.ok(!(await page.evaluate(() => /stuck\? ask me/.test(document.querySelector(".ck-say")?.textContent || "") && window.stemDuck.up)), "one tap: no such peek");
    await page.click("#fcard .fq");
    await page.waitForFunction(() => window.stemDuck.up && /stuck\? ask me/.test(document.querySelector(".ck-say")?.textContent || ""), null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.stemCluckOpen()), false, "never auto-open");
    await page.click(".ck-peek", { force: true });
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    await page.context().close();
  });
  if (ONLY.includes("5")) await step(`${tag} 5: the ladder reveals one piece every 30 s; a hidden tab or an open sheet pauses it`, async () => {
    const page = await open(vp, "CALC1_W3N2", { clock: true });
    const count = () => page.evaluate(() => document.querySelectorAll("#fcard li:not([hidden])").length);
    const n0 = await count();
    await page.clock.runFor(29000); assert.equal(await count(), n0, "before 30 s: nothing new");
    await page.clock.runFor(2500); assert.equal(await count(), n0 + 1, "after 30 s: the next piece");
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
    await page.clock.runFor(90000); assert.equal(await count(), n0 + 1, "a hidden tab: the clock waits");
    await page.evaluate(() => { delete document.visibilityState; });
    await page.clock.runFor(31000); assert.equal(await count(), n0 + 2, "visible again: the next piece 30 s later");
    await page.context().close();
  });
  if (ONLY.includes("6")) await step(`${tag} 6: the "See Cluck's steps" chip wears the solid i-duck, no webp pose`, async () => {
    const page = await open(vp, "CALC1_W3MC");
    await pick(page, "c"); await replied(page); await pick(page, "b");
    await page.waitForSelector(":is(#wish, .rbox) .cue-chip", { timeout: 5000 }); await page.waitForTimeout(600);
    const g = await page.evaluate(() => { const c = document.querySelector(":is(#wish, .rbox) .cue-chip"), s = c.querySelector("svg.dk");
      return { img: !!c.querySelector("img"), svg: !!s, use: s?.querySelector("use")?.getAttribute("href"), w: s?.getBoundingClientRect().width }; });
    assert.deepEqual([g.img, g.svg, g.use], [false, true, "#i-duck"], JSON.stringify(g));
    if (process.env.W3_SHOTS) await page.locator(":is(#wish, .rbox) .cue-chip").first().screenshot({ path: join(process.env.W3_SHOTS, `w3-chip-${tag}.png`) });
    await page.context().close();
  });
  if (ONLY.includes("8")) await step(`${tag} 8: the key-formulas card's rim is --line, not --action`, async () => {
    const page = await open(vp, "CALC1_W3N1");
    const g = await page.evaluate(() => { const f = document.querySelector("#fcard"), p = document.createElement("i"); p.style.color = "var(--line)"; f.append(p);
      const line = getComputedStyle(p).color; p.remove(); p.style.color = "var(--action)"; f.append(p); const act = getComputedStyle(p).color; p.remove();
      return { rim: getComputedStyle(f).borderTopColor, line, act }; });
    assert.equal(g.rim, g.line, "the rim is --line: " + JSON.stringify(g)); assert.notEqual(g.line, g.act);
    if (process.env.W3_SHOTS) await page.locator("#fcard").screenshot({ path: join(process.env.W3_SHOTS, `w3-fcard-${tag}.png`) });
    await page.context().close();
  });
  if (ONLY.includes("7")) await step(`${tag} 7: a swipe up on the reward banner hides it; a tap opens its popover; the next question brings it back`, async () => {
    const page = await open(vp, "CALC1_W3N1");
    await page.waitForSelector("#rwHud:not([hidden]) .rw-tap", { timeout: 5000 });
    const b = await page.locator("#rwHud .rw-tap").boundingBox();
    await page.locator("#rwHud .rw-tap").click();
    assert.equal(await page.evaluate(() => document.getElementById("rwPop").matches(":popover-open")), true, "a plain tap opens the popover");
    await page.keyboard.press("Escape");
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 20, { steps: 3 }); await page.mouse.move(x, y - 45, { steps: 3 }); await page.mouse.up();
    await page.waitForFunction(() => document.getElementById("rwHud").hidden, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => document.getElementById("rwPop").matches(":popover-open")), false, "the swipe is not a tap");
    await page.evaluate(() => { location.hash = "#CALC1_W3N2"; });
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_W3N2" && !document.getElementById("rwHud").hidden, null, { timeout: 5000 });
    await page.context().close();
  });
}
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
