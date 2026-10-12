// T19 sugar reveal (Tony, Oct 12): out of tries in SUGAR shows the right answer; diet (calm) never does.
//   1. no `correct` in any response before lockout     2. diet never gets it (response, DOM, /state)
//   3. sugar after lockout gets it (green right row + check, picked row stays x; typed: "Answer ..."; a reload shows it again)
//   4. the revealed pick pays 0 XP and stays a miss.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:   node tests/reveal.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8841), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "rv-")), BANKS = join(TMP, "banks");
const sac = title => ({ title, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const mc = (code, n, choices) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Q${n}: pick a.` }],
  choices: choices.map((md, i) => ({ id: "abcde"[i], md })), correct: "a",
  wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(`Question ${n}`) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_RV12.json"), JSON.stringify({ v: 1, problems: [
  mc("CALC1_V01", 1, ["one", "two", "three"]),
  { code: "CALC1_V02", type: "num", body: [{ type: "text", md: "Q2: type 2.02." }], answer: "2.02", nudge: "QUACK. Try again.", saccharine: sac("Question 2") },
  mc("CALC1_V03", 3, ["one", "two"]),
  mc("CALC1_V04", 4, ["one", "two", "three"])] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function showCode(page) { for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); } }
async function openBank(page) {
  await page.goto(BASE + "/");
  await showCode(page);
  await page.fill("#code", "BANK_RV12"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /^CALC1_V/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
}
/* every /check reply, in order, as the network sees it */
const watch = page => { const log = []; page.on("response", async r => { if (/\/check$/.test(r.url())) log.push(await r.json().catch(() => null)); }); return log; };
const settled = async (log, n) => { for (let i = 0; i < 60 && log.length < n; i++) await new Promise(r => setTimeout(r, 50)); };   // the response listener is async
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function typed(page, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill("#ans", v); await page.click("#ansGo");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
const xp = page => page.evaluate(() => window.Rewards.state().xp);
const rows = page => page.$$eval("#q .opt", os => os.map(o => ({ id: o.dataset.id, cls: o.className, badge: o.querySelector(".badge use")?.getAttribute("href") || "" })));

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const mk = async (diet) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    if (diet) await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
    const page = await ctx.newPage(), log = watch(page);
    await openBank(page);
    return { ctx, page, log };
  };

  const S = await mk(false);
  await step("sugar, mc (3 choices, 2 tries): no `correct` in the reply to the first wrong pick", async () => {
    await go(S.page, "CALC1_V01");
    await pick(S.page, "b");
    await settled(S.log, 1);
    assert.equal(S.log.length, 1);
    assert.equal(S.log[0].verdict, "wrong"); assert.equal(S.log[0].triesLeft, 1);
    assert.ok(!("correct" in S.log[0]), JSON.stringify(S.log[0]));
    assert.ok(!(await rows(S.page)).some(r => /\bright\b/.test(r.cls)), "no green row before lockout");
    const st = await (await fetch(`${BASE}/state/CALC1_V01`, { headers: { cookie: "sid=" + "a".repeat(32) } })).json();
    assert.ok(!("correct" in st));
    const pub = await (await fetch(`${BASE}/p/CALC1_V01.json`)).text();
    assert.ok(!/"correct"/.test(pub), "the problem the page loads has no key");
  });
  let x1;
  await step("sugar, mc: the lockout pick gets `correct`; the right row turns green with a check, the picked rows stay x'd; it pays 0 XP", async () => {
    x1 = await xp(S.page);
    await pick(S.page, "c");
    await settled(S.log, 2);
    assert.equal(S.log[1].verdict, "wrong"); assert.equal(S.log[1].triesLeft, 0);
    assert.equal(S.log[1].correct, "a");
    await S.page.waitForSelector("#q .opt.reveal");
    const r = Object.fromEntries((await rows(S.page)).map(o => [o.id, o]));
    assert.match(r.a.cls, /\bright\b/); assert.match(r.a.cls, /\breveal\b/); assert.match(r.a.badge, /i-ok$/);
    for (const id of ["b", "c"]) { assert.match(r[id].cls, /\bwrong\b/); assert.doesNotMatch(r[id].cls, /\bright\b/); assert.match(r[id].badge, /i-x$/); }
    await S.page.waitForTimeout(1200);
    assert.equal(await xp(S.page), x1, "the revealed pick pays 0 XP");
    assert.match(await S.page.textContent("#sr"), /right answer: one/i);
    assert.equal(await S.page.$$eval(".nod, .rw-nod", e => e.length), 0, "a reveal is not a right answer: no calm nod");
  });
  await step("sugar, mc: it still counts as a miss (the done record is out; the engine keeps it a miss)", async () => {
    const rec = await S.page.evaluate(() => { const o = window.stemOffline; return o && o.doneGet ? o.doneGet("CALC1_V01") : null; });
    assert.equal(rec && rec.done, "out");
    assert.ok(await S.page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("stem-rw") && JSON.parse(localStorage[k]).missed?.CALC1_V01 === 1)));
  });
  await step("sugar, mc: a reload shows the green row again (from /state; the page never stored it)", async () => {
    assert.ok(!(await S.page.evaluate(() => JSON.stringify(localStorage))).includes('"correct"'), "nothing stored");
    await S.page.reload();
    await opened(S.page, "CALC1_V01");
    await S.page.waitForSelector("#q .opt.reveal", { timeout: 6000 });
    assert.match(await S.page.getAttribute('#q .opt[data-id="a"]', "class"), /\bright\b/);
  });
  await step("sugar, 2-choice mc (one try): the one wrong pick reveals the right row", async () => {
    await go(S.page, "CALC1_V03");
    S.log.length = 0;
    await pick(S.page, "b");
    await settled(S.log, 1);
    assert.equal(S.log[0].correct, "a");
    await S.page.waitForSelector("#q .opt.reveal");
    assert.match(await S.page.getAttribute('#q .opt[data-id="b"]', "class"), /\bwrong\b/);
  });
  await step("sugar, typed num: no answer after try 1; \"Answer 2.02\" after the lockout; 0 XP", async () => {
    await go(S.page, "CALC1_V02");
    S.log.length = 0;
    await typed(S.page, "5");
    await settled(S.log, 1);
    assert.ok(!("correct" in S.log[0]) && S.log[0].triesLeft === 1);
    assert.equal(await S.page.$$eval("#q .ansl", e => e.length), 0);
    const x = await xp(S.page);
    await typed(S.page, "6");
    await settled(S.log, 2);
    assert.equal(S.log[1].correct, "2.02");
    await S.page.waitForSelector("#q .ansl");
    assert.equal(await S.page.textContent("#q .ansl b"), "2.02");
    assert.match(await S.page.textContent("#q .ansl"), /^Answer/);
    await S.page.waitForTimeout(1200);
    assert.equal(await xp(S.page), x, "0 XP on the revealed pick");
  });
  await S.ctx.close();

  const D = await mk(true);
  await step("diet: lockout of an mc and of a num: no `correct` in any reply, no green row, no Answer line, /state clean", async () => {
    await go(D.page, "CALC1_V04");
    await pick(D.page, "b"); await pick(D.page, "c");
    await go(D.page, "CALC1_V03");
    await pick(D.page, "b");
    await go(D.page, "CALC1_V02");
    await typed(D.page, "5"); await typed(D.page, "6");
    await settled(D.log, 5);
    assert.equal(D.log.length, 5);
    for (const r of D.log) assert.ok(!("correct" in r), JSON.stringify(r));
    assert.equal(D.log.at(-1).triesLeft, 0);
    for (const code of ["CALC1_V04", "CALC1_V03", "CALC1_V02"]) {
      await go(D.page, code);
      assert.equal(await D.page.$$eval("#q .opt.right, #q .opt.reveal, #q .ansl", e => e.length), 0, code);
    }
    const sid = (await D.ctx.cookies()).find(c => c.name === "sid")?.value;
    const st = await (await D.ctx.request.get(`${BASE}/state/CALC1_V04`)).json();
    assert.ok(sid && st.wrong === 2 && !("correct" in st), JSON.stringify(st));
    const again = await (await D.ctx.request.post(`${BASE}/check`, { data: { code: "CALC1_V04", choice: "a" } })).json();
    assert.deepEqual([again.verdict, "correct" in again], ["locked", false], "locked in diet: still nothing");
    assert.equal(await D.page.$$eval("#rwHud, .cue-chip, #wish .wchip", e => e.length), 0, "no rewards, no Cluck in diet");
  });
  await D.ctx.close();
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
