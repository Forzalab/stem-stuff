// Desktop notes box (#xb), kept (Tony, Nov 2: keep it, fix its 2 bugs). Diet keeps the box at every size. Sugar hides it on desktop (>= 720px,
// app.js sideMQ) from the first paint, as a static rule on html.sugar (not padRule's layer toggle): "notes still show for sugar mode when it
// should be hidden" = it leaked before a layer opened; "explain Cluck clicked, then note cannot be reopened" = the layer toggle hid it with
// no way back. Hidden = visibility (the box height stays the column floor, W129 L4). Phones keep the notes in both modes.
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
  const box = page => page.evaluate(() => { const e = document.querySelector("#xb"), r = e.getBoundingClientRect(); return { h: Math.round(r.height), vis: getComputedStyle(e).visibility, shown: r.height > 0 && getComputedStyle(e).visibility !== "hidden" }; });
  for (const w of [720, 721, 1280]) for (const mode of ["diet", "sugar"]) {
    await step(`${w}px ${mode}: notes ${mode === "diet" ? "stay (usable)" : "hidden, box height kept"}, load / Explain Cluck open / closed`, async () => {
      const { ctx, page } = await open(browser, w, 800, mode);
      const want = mode === "diet";
      const check = async (when) => {
        const b = await box(page);
        assert.equal(b.shown, want, `notes ${want ? "missing" : "visible"} ${when}`);
        if (when === "on load" && want) assert.ok(b.h > 0, `#xb lost its height ${when} (display:none?)`);   // diet only: sugar has Cluck's box from load, which fills #work (BIG PLAN V1, Tony Nov 2: no X, no Escape, so no height to keep)
      };
      await check("on load");
      if (SHOT) await page.screenshot({ path: join(SHOT, `desk-${w}-${mode}-load.png`) });
      await page.fill("#ans", "1"); await page.keyboard.press("Enter");
      if (mode === "sugar") {
        await page.waitForSelector("#work.cl-on .cl-ft .ask", { timeout: 5000 });   // open from load: nothing to click
        await page.waitForTimeout(600);
        await check("after Explain Cluck opened");
        await page.keyboard.press("Escape"); await page.waitForTimeout(500);
        assert.equal(await shown(page, "#work.cl-on #cluck"), true, "Escape leaves Cluck's box open");
        await check("after Escape");
      } else await check("after a wrong answer");
      if (want) {
        await page.fill("#xbField textarea", "my note"); await page.waitForTimeout(700);
        assert.ok(await shown(page, "#xbLabel"), "notes label gone");
      }
      await ctx.close();
    });
  }
  await step("719px (diet): phone pad opens", async () => {
    const { ctx, page } = await open(browser, 719, 800, "diet");
    await page.click("#padFab"); await page.waitForTimeout(500);
    assert.equal(await shown(page, "#scratch"), true, "phone pad does not open");
    await ctx.close();
  });
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
