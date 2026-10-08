// Cluck sheet right after an explanation streams, at 393x852 (Chromium). Local serve.py only; /explain is stubbed.
// usage: node shot-cluck.mjs <appRoot> <out.png> [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const [ROOT, OUT, PORTARG] = process.argv.slice(2);
const PORT = +(PORTARG || 8851), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cluck-shot-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = { code: "CALC1_B01", type: "mc", shuffle: false, body: [{ type: "text", md: "A 2.0 kg cart rolls at $3.0$ m/s. How fast after it sticks to a 1.0 kg cart?" }],
  choices: ch("1.0 m/s", "2.0 m/s", "3.0 m/s"), correct: "b", wrong: [{ choice: "a", hint: "QUACK. Total mass." }],
  saccharine: { title: "Practice Exam 2, Question 1", tip: "Momentum before equals after.", key: "Answer: b" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_BL12.json"), JSON.stringify({ v: 1, problems: [real] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { cwd: ROOT, env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
  const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const body = "Momentum is conserved in the sticking collision. Before: 2.0 kg times 3.0 m/s. After: 3.0 kg times v. So v is 2.0 m/s, which is choice b.\n\nCheck: the heavier cart slows the pair to the same speed the light one had before.";
    await page.route("**/explain", r => r.fulfill({ contentType: "text/plain", body }));
    await page.goto(BASE + "/#CALC1_B01");
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent.length > 0 && location.hash === "#CALC1_B01", null, { timeout: 8000 });
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
    await page.waitForSelector("#wish .wchip:not([hidden])", { timeout: 6000 });
    await page.click("#wish .wchip");
    await page.waitForFunction(() => /Check: the heavier/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wtext.wrun"), null, { timeout: 10000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const q = document.querySelector("#cluck .cl-quack"), who = document.querySelector("#cluck .who");
      const r = el => el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
      return { quackCount: document.querySelectorAll("#cluck .cl-quack").length, quackInWho: !!who?.querySelector(".cl-quack"), quackText: q?.textContent,
        quackColor: q && getComputedStyle(q).color, bodyColor: getComputedStyle(document.querySelector("#cluck .wtext")).color,
        whoH: r(who), quackH: r(q), wtextTop: document.querySelector("#cluck .wtext")?.getBoundingClientRect().top, scrollW: document.documentElement.scrollWidth };
    });
    console.log(JSON.stringify(info));
    await page.locator("#cluck .msg").first().screenshot({ path: OUT, animations: "disabled" }).catch(async () => { await page.screenshot({ path: OUT, fullPage: false }); });
    await page.screenshot({ path: OUT.replace(/\.png$/, "-viewport.png") });
    await page.locator("#cluck .msg").first().screenshot({ path: OUT, animations: "disabled" }).catch(async () => { await page.screenshot({ path: OUT, fullPage: false }); });
    await page.screenshot({ path: OUT.replace(/\.png$/, "-viewport.png") });
    assert.equal(info.quackCount, 1, "exactly one QUACK in the reply");
    assert.equal(info.quackInWho, false, "not in the name row");
    assert.equal(info.quackColor, info.bodyColor, "body colour");
    assert.equal(info.scrollW, 393, "no sideways scroll");
    console.log("ok shot", OUT);
  } finally { await browser.close(); }
} finally { srv.kill(); }
