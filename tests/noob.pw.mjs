// The front door (DESIGN-v3 §1, Tony #2-#4): a fresh "/" opens the Exam 2 bank's dead-easy opener, the bar says "Exam 2" only,
// no bank menu; noob order (shuffle.mjs ramp): tier 1 first, 2 clean first tries -> tier 2; "Shuffle" = the old queue; a returner
// (localStorage stem-noob-<bank>) skips the opener; ?bank=X opens X and stays the last bank. A fixture bank stands in for BANK_P2X
// (the real one lives in the brain, never on GitHub). Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/noob.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8835), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "noob-")), BANKS = join(TMP, "banks");
/* answer = 2 + the item's number; tier in noob.tier; a dead-easy is saccharine.dead (one try) */
const TIER = { PHYS_RC1: 3, PHYS_RB1: 2, PHYS_RA1: 1, PHYS_RD1: 0, PHYS_RX1: null, PHYS_RB2: 2, PHYS_RA2: 1, PHYS_RD2: 0 };
const CODES = Object.keys(TIER);                                   // file order: hardest first, so file order is not the ramp
const ANS = Object.fromEntries(CODES.map((c, i) => [c, String(i + 3)]));
const item = (c, i) => ({ code: c, type: "num", answer: ANS[c], body: [{ type: "text", md: `Ramp ${i + 1}: 2 + ${i + 1}` }],
  ...(TIER[c] ? { noob: { tier: TIER[c] } } : {}), ...(TIER[c] === 0 ? { saccharine: { dead: true } } : {}) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P2X.json"), JSON.stringify({ v: 1, problems: CODES.map(item) }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [1, 2].map(n => ({ code: `CALC1_O0${n}`, type: "num", answer: "1", body: [{ type: "text", md: `Other ${n}` }] })) }));

/* pin the queue's salt (nav.js shown() keeps hist, which deadOpen reads): one whose opener is two dead-easy, so slot 4 (the first review slot) has nothing older to re-show */
const { qNew, qShow, qAnswer, ramp, rampAnswer } = await import("../shuffle.mjs");
const tierOf = c => TIER[c] ?? 3;
const plays = salt => { const st = qNew(salt), out = []; for (let i = 0; i < 5; i++) { const c = ramp(st, CODES, tierOf).code; qShow(st, c); st.hist.push({ c }); if (qAnswer(st, c, true)) rampAnswer(st, c, true, tierOf); out.push(c); } return out; };
const SALT = Array.from({ length: 500 }, (_, i) => "n" + i).find(s => plays(s).slice(0, 2).every(c => TIER[c] === 0));
assert.ok(SALT, "no salt with a two dead-easy opener");
const PLAN = plays(SALT);
assert.deepEqual(PLAN.map(tierOf), [0, 0, 1, 1, 2], "the pure ramp (B1) changed");

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P2X", STEM_FRONT_TITLE: "Exam 2", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });   // the front bank pinned to this fixture (serve.py FRONT is the real one)
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const code = page => page.evaluate(() => document.querySelector("#freeze")?.hidden ? "" : document.querySelector("#pcode")?.textContent || "");
const opened = (page, c, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), c, { timeout });
const anyOpen = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
async function right(page, c) {                                    // a clean first try
  await page.fill("#ans", ANS[c]); await page.click("#ansGo");
  await page.waitForSelector("#ff .vk[data-v=i-ok]", { timeout: 4000 });
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function fresh(init = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
  await ctx.addInitScript(({ s, init }) => { try {
    localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    if (!localStorage.getItem("stem-q-BANK_P2X")) localStorage.setItem("stem-q-BANK_P2X", JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 }));
    if (!sessionStorage.getItem("noob-init")) { sessionStorage.setItem("noob-init", "1"); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); }
  } catch { /* blocked */ } }, { s: SALT, init });
  return { ctx, page: await ctx.newPage() };
}
try {
  const { ctx, page } = await fresh();
  await step("fresh '/': the Exam 2 bank's dead-easy opener, the bar says 'Exam 2' only, no bank menu", async () => {
    await page.goto(BASE + "/");
    await opened(page, PLAN[0]);
    assert.equal(TIER[await code(page)], 0, "not a dead-easy");
    assert.equal((await page.textContent("#qlistName")).trim(), "Exam 2");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("start")), false, "the start page is up");
    assert.equal(await page.$eval("#qlist", el => el.hidden), true, "a menu is open");
  });

  await step("noob order: the opener, then tier 1; 2 clean tier-1 first tries -> the next is tier 2", async () => {
    for (let i = 0; i < 4; i++) {
      await opened(page, PLAN[i]);
      await right(page, PLAN[i]);
      await page.click("#qnext");
    }
    await opened(page, PLAN[4]);
    assert.equal(tierOf(PLAN[4]), 2);
  });

  await step("'Shuffle' switches to the shuffle queue and stays switched; 'Start with easy ones' switches back", async () => {
    await page.click("#qlistBtn");
    assert.equal((await page.textContent("#qmix")).trim(), "Shuffle");
    assert.equal(await page.isVisible("#qskip"), true, "no Skip this question in noob mode");
    await page.click("#qmix");
    assert.equal(await page.evaluate(() => window.stemQueue.mode()), "mix");
    assert.equal((await page.textContent("#qmix")).trim(), "Start with easy ones");
    assert.equal(await page.isVisible("#qskip"), false, "Skip this question in mix mode");
    await page.reload(); await anyOpen(page);
    assert.equal(await page.evaluate(() => window.stemQueue.mode()), "mix", "the mode did not survive a reload");
    await page.click("#qlistBtn"); await page.click("#qmix");
    assert.equal(await page.evaluate(() => window.stemQueue.mode()), "noob");
  });

  await step("'Skip this question': up one tier and on to the next question", async () => {
    const t0 = await page.evaluate(() => window.stemQueue.state().ramp.tier), was = await code(page);
    await page.click("#qskip");
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, was, { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.stemQueue.state().ramp.tier), Math.min(3, t0 + 1));
    assert.equal(await page.evaluate(() => document.querySelector("#qlist").hidden), true, "the list stayed open");
  });

  await step("a small 'Explore other banks' link in the list: it opens the code box", async () => {
    await page.click("#qlistBtn");
    await page.click("#qbanks");
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "code");
  });
  await ctx.close();

  await step("a returner (stem-noob-BANK_P2X) skips the opener", async () => {
    const r = await fresh({ "stem-noob-BANK_P2X": "1" });
    await r.page.goto(BASE + "/"); await anyOpen(r.page);
    assert.equal(tierOf(await code(r.page)), 1, `opened ${await code(r.page)}`);
    await r.ctx.close();
  });

  await step("?bank=OTH1 opens BANK_OTH1 (its code in the bar, the query gone), and stays the last bank on '/'", async () => {
    const r = await fresh();
    await r.page.goto(BASE + "/?bank=OTH1"); await anyOpen(r.page);
    assert.match(await code(r.page), /^CALC1_O0/);
    assert.equal((await r.page.textContent("#qlistName")).trim(), "BANK_OTH1");
    assert.equal(await r.page.evaluate(() => location.search), "");
    await r.page.goto("about:blank"); await r.page.goto(BASE + "/"); await anyOpen(r.page);
    assert.match(await code(r.page), /^CALC1_O0/, "the front door took over a remembered bank");
    assert.equal(await r.page.isVisible("#qmix"), false, "noob controls on another bank");
    await r.ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
