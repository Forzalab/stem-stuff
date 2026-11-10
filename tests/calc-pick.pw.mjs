// Smoke: the calculator model picker (calc-pick.js, Tony Nov 6). A fresh device sees it once after the splash; a chip pick is saved per sid on the
// server (GET / POST /calc) and survives a reload and a wiped cache; Skip is kept. Automated browsers skip the auto-show, so this spec turns it on
// with window.__calcPickAuto.   node tests/calc-pick.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8893", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "calcpick-")), SHOTS = process.argv[3] || join(ROOT, "tests", "out");
mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "server", "serve.py"), PORT], { env: { ...process.env, STEM_TRIES: join(tmp, "tries.json"), KV_REST_API_URL: "", OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const DLG = '[role="dialog"].cpick';
const settled = async page => { await page.waitForFunction(() => !document.getElementById("splash")); await page.waitForTimeout(800); };
async function ctxPage(state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block", storageState: state });
  await ctx.addInitScript(() => { window.__calcPickAuto = true; window.__cpEv = []; addEventListener("stem-calc-model", e => window.__cpEv.push(e.detail)); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  return { ctx, page };
}

await step("fresh device: shows; a chip pick is saved on the server per sid, fires the event, survives a reload and a wiped cache", async () => {
  const { ctx, page } = await ctxPage();
  await page.waitForSelector(DLG, { timeout: 8000 });
  assert.match(await page.locator(DLG + " .lh-say").textContent(), /^Which calculator do you have\?/);
  await page.screenshot({ path: join(SHOTS, "calc-pick-1-step1.png") });
  await page.locator(DLG + " .cp-brand", { hasText: "Texas" }).click();
  assert.deepEqual(await page.locator(DLG + " .cp-chip").allTextContents(), ["TI-30XS MultiView", "TI-36X Pro", "TI-84 Plus CE"]);
  await page.screenshot({ path: join(SHOTS, "calc-pick-2-chips.png") });
  await page.locator("#cpQ").fill("36");
  assert.deepEqual(await page.locator(DLG + " .cp-opt:visible").allTextContents(), ["TI-36X Pro"]);
  await page.screenshot({ path: join(SHOTS, "calc-pick-3-search36.png") });
  await page.locator(DLG + " .cp-chip", { hasText: "TI-30XS" }).click();
  await page.waitForSelector(DLG, { state: "detached" });
  assert.deepEqual(await page.evaluate(() => window.__cpEv.map(e => e.id)), ["ti-30xs-multiview"]);
  await page.waitForFunction(async () => (await (await fetch("calc")).json()).model === "ti-30xs-multiview");
  await page.screenshot({ path: join(SHOTS, "calc-pick-4-saved.png") });
  await page.reload(); await settled(page);
  assert.equal(await page.locator(DLG).count(), 0, "reload: no popup");
  const st = await ctx.storageState(); await ctx.close();
  const b = await ctxPage({ cookies: st.cookies, origins: [] });   // same sid, cache wiped: the server's copy wins
  await settled(b.page);
  assert.equal(await b.page.locator(DLG).count(), 0, "same sid: no popup");
  assert.equal(await b.page.evaluate(() => window.stemCalcPick.get()), "ti-30xs-multiview");
  await b.ctx.close();
  const c = await ctxPage();   // another sid sees nothing
  await c.page.waitForSelector(DLG, { timeout: 8000 });
  assert.equal(await c.page.evaluate(async () => (await (await fetch("calc")).json()).model), null);
  await c.page.locator(DLG + " .cp-skip").click();   // Skip is kept
  await c.page.reload(); await settled(c.page);
  assert.equal(await c.page.locator(DLG).count(), 0, "after Skip: no popup");
  assert.equal(await c.page.evaluate(() => window.stemCalcPick.get()), null);
  await c.ctx.close();
});

await browser.close(); srv.kill();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
