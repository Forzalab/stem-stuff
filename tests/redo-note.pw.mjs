// Redo note (Tony, Oct 19: "make it CLEAR first time ... we are hitting a retrial question"): the first time a missed question comes back
// as a Redeem showing (the "Pity roll" tag) on this device, the plain toast (STYLE.md §3) says "Gravity pulled you back for review."
// with its caret on the tag. Once per device (app.js rwTip beat "redo", stem-ob-rw-redo): the second Redeem says nothing. Sugar only
// (rewardOn), and it logs "ob redo 1" for intent.js (Jev). Own serve.py on a temp bank, real clock (a pick needs the 2 s dwell).
//   node tests/redo-note.pw.mjs [port]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8877", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "redo-")), banks = join(tmp, "banks");
mkdirSync(banks);
const NOTE = "Gravity pulled you back for review.";
const PROBS = Array.from({ length: 8 }, (_, i) => ({ code: `CALC1_RDN${i + 1}`, title: `Redo ${i + 1}`, type: "mc", shuffle: false,
  body: [{ type: "text", md: `Redo ${i + 1}: pick a.` }], correct: "a", choices: ["one", "two", "three", "four"].map((md, j) => ({ id: "abcd"[j], md })),
  saccharine: { title: `Practice Exam 2, Question ${i + 1}`, key: "Tick: a", slip: { b: "Not b.", c: "Not c." } } }));
writeFileSync(join(banks, "BANK_RDN.json"), JSON.stringify({ v: 1, problems: PROBS }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const code = page => page.textContent("#pcode");
const nTries = page => page.evaluate(() => window.__drill.state.tries.length);
const dwell = page => page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100, null, { timeout: 6000 });
const item = page => page.evaluate(() => window.stemQueue && JSON.parse(JSON.stringify(window.stemQueue.item())));
async function pick(page, id) {
  const n = await nTries(page);
  await page.$eval(`#q .opt[data-id="${id}"]`, b => b.click());
  await page.waitForTimeout(80);
  await page.$eval(`#q .ch[data-id="${id}"] .send`, b => b.click());
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 }).catch(() => {});
}
async function miss(page) {                                     // wrong until the question closes (4 choices = 2 tries)
  await dwell(page);
  for (const id of ["b", "c", "d"]) { if (!(await page.$(`#q .opt[data-id="${id}"]:not(:disabled)`))) continue; await pick(page, id); if (await page.evaluate(() => window.__drill.state.finished)) return; }
}
async function next(page) {
  const c = await code(page);
  await page.$eval("#qnext", b => b.click());
  await page.waitForFunction(c => { const p = document.querySelector("#pcode")?.textContent; return p && p !== c && !document.querySelector("#freeze").hidden; }, c, { timeout: 8000 });
  await page.waitForTimeout(250);
}
/* Next (answering right on the way) until a Redeem showing opens; returns its code */
async function toRedeem(page) {
  for (let i = 0; i < 14; i++) {
    await next(page);
    const it = await item(page);
    if (it && it.redeem && it.r) return code(page);
    await dwell(page); await pick(page, "a");
  }
  throw new Error("no Redeem showing within 14 Nexts");
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [w, vp] of [["1280", { width: 1280, height: 900 }], ["390", { width: 390, height: 844 }]]) {
  await step(`${w}: the first Redeem says "${NOTE}" once, on the retry tag; the second Redeem does not`, async () => {
    const phone = vp.width < 500;
    const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(BASE + (phone ? "/" : "/?jev=1") + "#BANK_RDN");                 // desktop: intent.js on (Jev flag), so its log is checked
    await page.waitForFunction(() => /^CALC1_RDN/.test(document.querySelector("#pcode")?.textContent || "") && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
    await page.evaluate(() => { window.__notes = []; const t = document.querySelector("#toast");
      new MutationObserver(() => { if (t.classList.contains("on")) window.__notes.push({ text: t.textContent, at: window.__drill.state.code }); }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true }); });
    const notes = () => page.evaluate(n => window.__notes.filter(x => x.text === n), NOTE);

    const m1 = await code(page);
    await miss(page);
    assert.deepEqual(await notes(page), [], "no redo note before any redo");
    const r1 = await toRedeem(page);
    assert.equal(r1, m1, "the missed one comes back");
    assert.match(await page.textContent("#rtag"), /Pity roll/);
    await page.waitForFunction(n => { const t = document.querySelector("#toast"); return t.classList.contains("on") && t.textContent === n; }, NOTE, { timeout: 3000 })
      .catch(async () => { throw new Error("no redo note on the first Redeem; toasts: " + JSON.stringify(await page.evaluate(() => window.__notes))); });
    const [t, a] = await page.evaluate(() => ["#toast", "#rtag"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom, width: r.width }; }));
    const mid = await page.$eval("#toast", t => parseFloat(t.style.left) + parseFloat(getComputedStyle(t).getPropertyValue("--px")));
    assert.ok(Math.abs(mid - (a.left + a.width / 2)) < 2 && t.top >= a.bottom, "caret on the retry tag " + JSON.stringify([t, a, mid]));
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-ob-rw-redo")), "1");
    const jl = await page.evaluate(() => { try { return window.stemJev.dump(); } catch { return ""; } });
    if (!phone) assert.match(jl, /"c":"CALC1_RDN\d","l":"\+[\d.]+  ob  redo 1"/, "intent.js logs the note on the Redeem item: " + jl.slice(-600));
    await dwell(page); await pick(page, "a");                            // redeemed (Comeback)

    const m2 = await code(page).then(async () => { await next(page); return code(page); });
    const it2 = await item(page);
    if (it2 && it2.redeem) throw new Error("the next item was already a Redeem");
    await miss(page);
    const r2 = await toRedeem(page);
    assert.equal(r2, m2, "the second miss comes back");
    assert.match(await page.textContent("#rtag"), /Pity roll/);
    await page.waitForTimeout(1200);
    const seen = await notes(page);
    assert.equal(seen.length, 1, "the redo note shows once per device: " + JSON.stringify(seen));
    assert.equal(seen[0].at, m1);
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-ob-rw-redo")), "1");
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}
await browser.close();
srv.kill();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
