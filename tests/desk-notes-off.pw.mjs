// Desktop has no notes box (todo 97, Tony Nov 1: "notes still show for sugar mode when it should be hidden ... the note box shows, but then
// explain Cluck clicked, then note cannot be reopened no more. Fix: just disable the note on desktop"). From the side-by-side breakpoint
// (min-width 720px, app.js sideMQ) up #scratch / #xb never render: normal mode, sugar mode, after Explain Cluck. Phones keep the notes.
//   node tests/desk-notes-off.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8887), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "desk-notes-")), BANKS = join(TMP, "banks");
const SHOT = process.env.SHOT_DIR || "";
const sac = { title: "Notes off", tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 4" };
const prob = { code: "PHYS_DA1", title: "Notes off", type: "num", answer: "4", body: [{ type: "text", md: "What is 2 + 2?" }], noob: { tier: 1 }, saccharine: sac };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_DNO.json"), JSON.stringify({ v: 1, problems: [prob] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DNO", STEM_FRONT_TITLE: "Exam 3", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const shown = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"), sel);
async function open(browser, w, h, mode) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode", value: mode, url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }));
  await ctx.route(/\/explain$/, r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Pressure is force over area." }));
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-welcome-BANK_DNO", "1"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/#PHYS_DA1");
  await page.waitForSelector("#ans", { timeout: 10000 }).catch(async e => { console.log(await page.evaluate(() => document.body.innerText.slice(0, 300)), page.url()); throw e; });
  await page.waitForTimeout(800);
  return { ctx, page };
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const mode of ["diet", "sugar"]) {
    await step(`1280x800 ${mode}: no notes box, before and after Explain Cluck`, async () => {
      const { ctx, page } = await open(browser, 1280, 800, mode);
      if (SHOT) await page.screenshot({ path: join(SHOT, `desk-${mode}-load.png`) });
      assert.equal(await shown(page, "#scratch, #xb"), false, "notes visible on load");
      await page.fill("#ans", "1"); await page.keyboard.press("Enter");
      if (mode === "sugar") {
        await page.waitForSelector(".cl-peek .cl-cta", { timeout: 8000 });
        await page.click(".cl-peek .cl-cta");
        await page.waitForSelector("#work.cl-on .cl-ft .ask", { timeout: 5000 });
      }
      await page.waitForTimeout(600);
      if (SHOT) await page.screenshot({ path: join(SHOT, `desk-${mode}-explain.png`) });
      assert.equal(await shown(page, "#scratch, #xb"), false, "notes visible after Explain Cluck");
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      assert.equal(await shown(page, "#scratch, #xb"), false, "notes visible after Cluck closed");
      await ctx.close();
    });
  }
  for (const [w, desk] of [[719, false], [720, true], [721, true]]) {
    await step(`${w}px (diet): notes ${desk ? "absent" : "present, openable"}`, async () => {
      const { ctx, page } = await open(browser, w, 800, "diet");
      if (desk) assert.equal(await shown(page, "#scratch, #xb"), false);
      else { await page.click("#padFab"); await page.waitForTimeout(500); assert.equal(await shown(page, "#scratch"), true, "phone pad does not open"); }
      await ctx.close();
    });
  }
  await step("390x844 diet: phone notes open, take text, close, reopen", async () => {
    const { ctx, page } = await open(browser, 390, 844, "diet");
    for (let i = 0; i < 2; i++) {
      await page.click("#padFab"); await page.waitForTimeout(500);
      assert.equal(await shown(page, "#scratch"), true, `pad closed on open #${i + 1}`);
      if (i === 0) await page.fill("#scratch", "my note");
      await page.click("#mtExp"); await page.waitForTimeout(500);
    }
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(failures + " failed"); process.exit(1); }
console.log("all passed");
