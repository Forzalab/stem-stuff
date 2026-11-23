// ASK-ALIGN smoke (Tony, Nov 22): in Cluck's ask field the input's text line (caret / placeholder / first typed line) shares its vertical
// centre with the send button (+-2px) when the field holds one line, at 1280 and 390, empty and with one line typed; a long text still grows the field.
// Own serve.py + an uploaded bank (no LLM: a canned wrong-answer reply is not needed, the footer is built when the sheet opens).
//   node tests/ask-align.smoke.mjs [port] [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8849), BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv[3] || ""; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TRIES = join(mkdtempSync(join(tmpdir(), "askal-")), "tries.json");
const FILE = { v: 1, problems: [{ code: "PSY_T61", type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md: "What is six times seven? Say it as a number." }] }] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
async function open(vp) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage(); await page.goto(`${BASE}/?ui=v7`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ask.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_T61" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
  await settled(page);
  if (phone) {   // a phone has no idle box: a wrong answer makes the sheet + its ask field (the LLM reply may fail, the field stays)
    await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }));
    await page.click("#ans"); await page.keyboard.type("7"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 }); await page.waitForTimeout(1000);
    await page.evaluate(() => window.stemClOpen("explain", null));
  } else await page.click("#cluckBtn", { force: true });
  await page.waitForSelector("#cluck .ask textarea", { state: "visible", timeout: 8000 });
  await settled(page, "#cluck");
  return { ctx, page };
}
// centre of the text line: the textarea's content box (rows=1 -> one line box), against the send button's centre
const geo = page => page.evaluate(() => {
  const ta = document.querySelector("#cluck .ask textarea"), sd = document.querySelector("#cluck .ask .send"), cs = getComputedStyle(ta);
  const r = ta.getBoundingClientRect(), s = sd.getBoundingClientRect(), px = v => parseFloat(v) || 0;
  const top = r.top + px(cs.paddingTop) + px(cs.borderTopWidth), lh = px(cs.lineHeight) || px(cs.fontSize) * 1.4;
  return { line: top + lh / 2, btn: s.top + s.height / 2, h: r.height, lh };
});
for (const [tag, vp] of [["1280", { width: 1280, height: 800 }], ["390", { width: 390, height: 844 }]]) {
  const { ctx, page } = await open(vp);
  const crop = async n => { if (SHOTS) { const b = await page.locator("#cluck .cl-ft").boundingBox(); if (b) await page.screenshot({ path: join(SHOTS, `ask-${n}-${tag}.png`), clip: b }); } };
  await step(`${tag}: empty field, placeholder line centred on the send button (<= 2px)`, async () => {
    const g = await geo(page); await crop("empty");
    assert.ok(Math.abs(g.line - g.btn) <= 2, `line ${g.line.toFixed(1)} vs button ${g.btn.toFixed(1)} (field ${g.h}px)`);
  });
  await step(`${tag}: one line typed, caret line centred on the send button (<= 2px)`, async () => {
    await page.fill("#cluck .ask textarea", "why is it 42?"); await page.dispatchEvent("#cluck .ask textarea", "input");
    const g = await geo(page); await crop("typed");
    assert.ok(Math.abs(g.line - g.btn) <= 2, `line ${g.line.toFixed(1)} vs button ${g.btn.toFixed(1)} (field ${g.h}px)`);
  });
  await step(`${tag}: a long text still grows the field (askFit)`, async () => {
    const h0 = (await geo(page)).h;
    await page.fill("#cluck .ask textarea", Array(6).fill("a long line of words to wrap the field").join("\n")); await page.dispatchEvent("#cluck .ask textarea", "input");
    const h1 = (await geo(page)).h; assert.ok(h1 > h0 + 20, `height ${h0} -> ${h1}`);
  });
  await ctx.close();
}
await browser.close(); srv.kill();
console.log(fails ? `${fails} failed` : "all ok"); process.exit(fails ? 1 : 0);
