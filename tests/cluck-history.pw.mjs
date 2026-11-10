// W2 (Nov 5): Cluck's sheet reads as a history of the student's picks. Each answer turn starts with a status line ("chose 1.80 J ✓",
// the choice's VALUE, never its letter); once a later turn exists, an earlier WRONG reply folds under its line (the line toggles it);
// the latest reply and every right one stay open. Also: the busy ring's rim follows the field's radius (--ask-r) at 390 and 1280.
// Own serve.py + a stub OpenRouter (as cluck-more.pw.mjs).   node tests/cluck-history.pw.mjs <port> [shots dir]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8878", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "chist-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const VALUES = ["1.20 J", "1.80 J", "2.40 J", "3.60 J"];
const PROBS = [{ code: "CALC1_CHIST1", title: "History", type: "mc", shuffle: false, body: [{ type: "text", md: "A force does work on a block. How much work? Pick one." }], correct: "b",
  choices: VALUES.map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: "History", key: "Tick: b", slip: { c: "Three is not two." } } }];
const LONGC = "for (int i = 0; i < n; i++) { total += fib(i) * 2; } return total;";   // 63 chars of code
PROBS.push({ code: "CALC1_CHIST2", title: "Long", type: "mc", shuffle: false, body: [{ type: "text", md: "Which line? Pick one." }], correct: "a",
  choices: [{ id: "a", md: "return 1;" }, { id: "b", md: LONGC }, { id: "c", md: "x" }, { id: "d", md: "y" }], saccharine: { title: "Long", key: "Tick: a", slip: { b: "No loop." } } });
PROBS.push({ code: "CALC1_CHIST3", title: "Grid", type: "mc", pick: "all", grid: true, shuffle: false, body: [{ type: "text", md: "Tick every true option." }], correct: ["a"],
  choices: [{ id: "a", md: "Good base" }, { id: "b", md: "Good step" }], saccharine: { title: "Grid", key: "Tick: a", slip: { b: "The step is not good." } } });
writeFileSync(join(banks, "BANK_CHIST.json"), JSON.stringify({ v: 1, problems: PROBS }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const tick = (/Tick: ([a-d])/.exec(body) || [, "b"])[1];                // the stub's reply names the item's own key letter (the server's leak gate checks it)
  const parts = ["POOF! A reply with some words in it.\n", `Tick: ${tick}. Egg-cellent.`]; let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const pick = async (page, id) => {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
};
async function flow(vp) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_CHIST");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await pick(page, "c");                                                  // wrong: 2.40 J
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
  await pick(page, "b");                                                  // right: 1.80 J
  await page.waitForSelector(".cue-ok", { timeout: 5000 });
  await page.click(".cue-ok");                                            // See Cluck's steps: the sheet opens, the right reply comes under the miss
  await page.waitForFunction(() => document.querySelectorAll("#cluck .cl-st").length === 2, null, { timeout: 5000 });
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .cl-cmp .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  return page;
}
for (const [tag, vp] of [["390", { width: 390, height: 844 }], ["1280", { width: 1280, height: 800 }]]) {
  await step(`${tag}: wrong then right: "chose 2.40 J ✗" folds its reply, "chose 1.80 J ✓" stays open, no letter in either line`, async () => {
    const page = await flow(vp);
    const info = await page.evaluate(() => {
      const sts = [...document.querySelectorAll("#cluck .cl-st")];
      const vis = e => !!e && e.checkVisibility();
      return { texts: sts.map(s => s.textContent.trim()), first: vis(document.querySelector("#cluck #clTabEP > .msg")), cmp: vis(document.querySelector("#cluck .cl-cmp")),
        btn: sts.map(s => s.querySelector("button")?.getAttribute("aria-expanded") ?? null) };
    });
    assert.deepEqual(info.texts, ["▸ chose 2.40 J ✗", "chose 1.80 J ✓"], JSON.stringify(info));
    assert.equal(info.first, false, "the miss's reply is collapsed");
    assert.equal(info.cmp, true, "the right reply is visible");
    assert.deepEqual(info.btn, ["false", null], "the miss line is the toggle, the right one is plain");
    assert.ok(info.texts.every(t => !/\b[a-d]\b/i.test(t.replace(/[▸▾]/g, ""))), "no choice letter in a status line");
    await page.click("#cluck .cl-st button");                              // open the miss again: it reads as history
    assert.equal(await page.evaluate(() => document.querySelector("#cluck #clTabEP > .msg").checkVisibility()), true);
    assert.equal(await page.evaluate(() => document.querySelector("#cluck .cl-st button").getAttribute("aria-expanded")), "true");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step(`${tag}: the busy ring follows the field's radius`, async () => {
    const page = await flow(vp);
    await page.evaluate(() => setInterval(() => document.querySelector("#cluck").classList.add("wbusy"), 16));   // clAsk() may clear it: keep it on
    const r = await page.evaluate(() => { const a = document.querySelector("#cluck .ask"), c = getComputedStyle(a); return { v: c.getPropertyValue("--ask-r").trim(), r: c.borderBottomLeftRadius + "/" + c.borderTopLeftRadius }; });
    assert.ok(r.v !== "", "--ask-r is set on the field: " + JSON.stringify(r));
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS, `w2-ring-${tag}.png`), clip: { x: 0, y: vp.height - 130, width: vp.width, height: 130 } });
    await page.context().close();
  });
}
/* status line edge cases (BANK_CER-shaped fixtures): long code choice, pick-all joins, empty selection, no line for a proof */
async function openAt(vp, code) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_CHIST");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !!document.querySelector("#q .opt"), code, { timeout: 8000 });
  await page.waitForTimeout(300);
  return page;
}
async function sheetLine(page) {
  await page.waitForTimeout(2500);                                       // the prefetch has started (the line needs the try, not the reply)
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen() && !!document.querySelector("#cluck .cl-st"), null, { timeout: 5000 });
  return page.evaluate(() => { const st = document.querySelector("#cluck .cl-st"), b = st.querySelector(".cl-st-b"), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { text: st.textContent.trim(), title: b.title, h: r.height, lh: parseFloat(cs.lineHeight) || 17, right: r.right, vw: innerWidth, cut: b.scrollWidth > b.clientWidth + 1 }; });
}
for (const [tag, vp] of [["390", { width: 390, height: 844 }]]) {
  await step(`${tag}: a long code choice is cut near 28 chars with an ellipsis, the full text in the title, the mark stays visible on one line`, async () => {
    const page = await openAt(vp, "CALC1_CHIST2");
    await pick(page, "b");
    const g = await sheetLine(page);
    assert.match(g.text, /^chose .{1,29}… ✗$/u, g.text);
    assert.equal(g.title, `chose ${LONGC} ✗`);
    assert.ok(g.h < g.lh * 1.6, "one line: " + JSON.stringify(g)); assert.ok(g.right <= g.vw - 8 && !g.cut, "the mark is inside the screen: " + JSON.stringify(g));
    await page.context().close();
  });
  await step(`${tag}: pick-all joins with ", " (cut the same way); an empty selection reads "chose none"`, async () => {
    let page = await openAt(vp, "CALC1_CHIST3");
    await page.click('.opt[data-id="a"]'); await page.click('.opt[data-id="b"]'); await page.click("#mcGo");
    await page.waitForFunction(() => window.__drill.state.tries.length === 1, null, { timeout: 5000 });
    let g = await sheetLine(page);
    assert.equal(g.text, "chose Good base, Good step ✗");
    await page.context().close();
    page = await openAt(vp, "CALC1_CHIST3");                               // Check is disabled with nothing ticked here, so the label is asked directly
    const none = await page.evaluate(() => ({ w: window.__clTry({ v: "wrong", c: [] }), r: window.__clTry({ v: "correct", c: [] }) }));
    assert.equal(none.w.label, "chose none"); assert.equal(none.r.label, "chose none"); assert.equal(none.r.v, "correct");
    await page.context().close();
  });
  await step(`${tag}: a proof gets no status line`, async () => {
    const page = await openAt(vp, "CALC1_CHIST1");
    const r = await page.evaluate(() => { const p = window.__drill.state.prob, ty = p.type; const ok = window.__clTry({ v: "wrong", c: "a" }); p.type = "proof"; const pr = window.__clTry({ v: "wrong", a: "Base case: ..." }); p.type = ty; return { ok, pr }; });
    assert.ok(r.ok && /^chose /.test(r.ok.label), JSON.stringify(r)); assert.equal(r.pr, null);
    await page.context().close();
  });
}
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} failed` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
