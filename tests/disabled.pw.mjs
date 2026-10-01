// Disabled answer UI after the tries lock and after a correct answer. Needs a running server and Playwright:
//   python3 serve.py 8813 &   then   node tests/disabled.pw.mjs http://localhost:8813 [shotDir] [shotPrefix]
// /check is answered by the test (route), so no answers are needed. Runs at 390x844 and 1920x1080.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8813";
const SHOTS = process.argv[3] || "";
const PREFIX = process.argv[4] || "disabled";
const ONLY_SHOTS = !!process.env.ONLY_SHOTS;         // "before" shots on the old code: skip the asserts
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });

async function open(page, code, verdicts) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const q = [...verdicts];
  await page.route("**/check", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(q.shift() || { verdict: "locked", triesLeft: 0 }) }));
  await page.goto("about:blank"); await page.goto(BASE + "/#" + code); await opened(page, code);
}
const WRONG2 = [{ verdict: "wrong", triesLeft: 1 }, { verdict: "wrong", triesLeft: 0 }];
const RIGHT = [{ verdict: "correct", triesLeft: 2 }];
const waitFb = page => page.waitForSelector("#q .vk, #q .opt.right, #fb .verdict", { timeout: 4000 });   // graded: the box / badge icon, or a line in #fb

/* every answer control: aria-disabled, not-allowed cursor, no change on hover, clicks do nothing */
async function assertDead(page, keep) {
  const ctl = await page.$$("#q .opt, #q .ans, #q .send");
  assert.ok(ctl.length, "controls present");
  for (const el of ctl) {
    const info = await el.evaluate(e => ({ a: e.getAttribute("aria-disabled"), cur: getComputedStyle(e).cursor, hidden: !e.offsetParent, cls: e.className }));
    assert.equal(info.a, "true", `aria-disabled on ${info.cls}`);
    if (info.hidden) continue;
    assert.equal(info.cur, "not-allowed", `cursor on ${info.cls}`);
    const look = () => el.evaluate(e => { const b = e.closest(".ch .opt, .ff") || e, s = getComputedStyle(b); return [s.borderColor, s.backgroundColor, s.opacity].join("|"); });
    await page.mouse.move(0, 0); await page.waitForTimeout(150);
    const before = await look();
    await el.hover({ force: true }); await page.waitForTimeout(150);
    assert.equal(await look(), before, `hover changed ${info.cls}`);
  }
  const snap = () => page.evaluate(() => JSON.stringify({ t: window.__drill.state.tries.length, sel: window.__drill.state.selected,
    v: [...document.querySelectorAll("#q .ans")].map(x => x.value), fb: document.querySelector("#fb").textContent,
    c: [...document.querySelectorAll("#q .opt")].map(x => x.getAttribute("aria-checked")) }));
  const s0 = await snap();
  for (const el of await page.$$("#q .opt, #q .ans")) { await el.click({ force: true }); await page.keyboard.type("9"); await page.keyboard.press("Enter"); }
  await page.waitForTimeout(200);
  assert.equal(await snap(), s0, "clicks changed something");
  if (keep) {   // the right answer keeps its ok look, not dimmed
    const o = await page.$eval(keep, e => { const s = getComputedStyle(e); return { op: s.opacity, bc: s.borderColor }; });
    assert.equal(o.op, "1", "correct one not dimmed");
    assert.equal(o.bc, "rgb(95, 211, 148)", "correct one keeps --ok border");
  }
}

async function run(w, h) {
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const page = await b.newPage({ viewport: { width: w, height: h } });
  const shot = async n => { if (SHOTS) { await page.mouse.move(0, 0); await page.$eval("#freezeIn", e => { e.scrollTop = e.scrollHeight; }).catch(() => {}); await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${PREFIX}-${n}-${w}.png` }); } };
  const pickMC = async i => { const o = (await page.$$("#q .opt:not(:disabled)"))[i]; await o.click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await page.waitForTimeout(150); };

  await step(`${w} mc: locked after two wrong`, async () => {
    await open(page, "CALC1_X2P", WRONG2);
    await pickMC(0); await pickMC(0); await waitFb(page);
    await shot("mc-locked");
    if (!ONLY_SHOTS) await assertDead(page);
  });
  await step(`${w} mc: correct`, async () => {
    await open(page, "CALC1_X2P", RIGHT);
    await pickMC(1); await waitFb(page);
    await shot("mc-correct");
    if (!ONLY_SHOTS) await assertDead(page, "#q .opt.right");
  });
  await step(`${w} num: locked`, async () => {
    await open(page, "CALC1_T6B", WRONG2);
    for (const v of ["1", "2"]) { await page.fill("#ans", v); await page.click("#ansGo"); await page.waitForTimeout(150); }
    await waitFb(page);
    await shot("num-locked");
    if (!ONLY_SHOTS) await assertDead(page);
  });
  await step(`${w} num: correct`, async () => {
    await open(page, "CALC1_T6B", RIGHT);
    await page.fill("#ans", "3"); await page.click("#ansGo"); await waitFb(page);
    await shot("num-correct");
    if (!ONLY_SHOTS) await assertDead(page, "#ff");
  });
  await step(`${w} multi: locked`, async () => {
    await open(page, "CSCI26_M5V", [...WRONG2, ...WRONG2]);
    for (const part of [0, 1]) for (const v of ["1", "2"]) { await page.locator("#q .ans").nth(part).fill(v); await page.click(`#go${part}`); await page.waitForTimeout(150); }   // each part has its own tries
    await waitFb(page);
    await shot("multi-locked");
    if (!ONLY_SHOTS) await assertDead(page);
  });
  await b.close();
}
await run(390, 844);
await run(1920, 1080);
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
