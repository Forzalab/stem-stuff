// 20261022-overscroll (Firefox phone: page scrolled ~224px into empty space): the off-screen measuring "mirror" div of design/explain-box.js
// was position:absolute and, while the notes pad is hidden on phones (width 0), grew ~1068px tall; Gecko counts it in the page's scroll height.
// Pinned two ways: (a) engine-agnostic: no off-screen element may be absolute and taller than the viewport; (b) scrollHeight <= innerHeight on a short question.
// Phone context (390x844, touch), diet mode, states: loaded, answer graded, blurred, notes open, notes closed.
//   node tests/overscroll.pw.mjs [<baseURL> <shotsDir>]   (run-all.sh passes those two; the spec needs a numeric bank that banks/ does not have,
//                                                          so it starts its own serve.py on a free port and only uses shotsDir)
//   PW_BROWSER=firefox node tests/overscroll.pw.mjs ...    (Gecko; a named engine that is not installed FAILS, it never skips)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = process.env.PW_BROWSER || "chromium";
const SHOTS = process.argv[3] || "";
const port = await new Promise(res => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const BASE = `http://127.0.0.1:${port}`;
const tmp = mkdtempSync(join(tmpdir(), "os-")), banks = join(tmp, "banks");
mkdirSync(banks);
const num = n => ({ code: `CALC1_P3${n}`, type: "num", body: [{ type: "text", md: `What is 2 + 2? (${n})` }], answer: "4" });
writeFileSync(join(banks, "BANK_P3Q.json"), JSON.stringify({ v: 1, problems: [num("A"), num("B")] }));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

if (!pw[ENGINE] || typeof pw[ENGINE].launch !== "function") { console.log(`FAIL engine: PW_BROWSER=${ENGINE} is not a Playwright engine (chromium|firefox|webkit)`); process.exit(1); }
let browser;
try { browser = await pw[ENGINE].launch(ENGINE === "chromium" ? { args: ["--no-sandbox"] } : {}); }
catch (e) { console.log(`FAIL engine: PW_BROWSER=${ENGINE} could not launch (not installed? PLAYWRIGHT_BROWSERS_PATH?): ${String(e.message).split("\n")[0]}`); process.exit(1); }
const srv = spawn(process.env.PY || "python3", [join(ROOT, "serve.py"), String(port)], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
try {
  console.log("engine", ENGINE, browser.version());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...(ENGINE === "firefox" ? {} : { isMobile: true }), serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage();
  const check = async state => {
    const m = await page.evaluate(() => {
      const se = document.scrollingElement;
      const offscreen = [...document.body.querySelectorAll("*")].map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.right < 0)
        .map(x => ({ tag: x.el.tagName.toLowerCase() + (x.el.id ? "#" + x.el.id : ""), position: getComputedStyle(x.el).position, h: Math.round(x.r.height) }));
      return { scrollHeight: se.scrollHeight, innerHeight, offscreen };
    });
    const bad = m.offscreen.filter(o => o.position !== "fixed" && o.h > m.innerHeight);   // (a) a measurer that can inflate layout
    const tall = m.scrollHeight > m.innerHeight + 1;                                       // (b)
    const ok = !bad.length && !tall;
    if (!ok) failures++;
    console.log(ok ? "ok  " : "FAIL", state.padEnd(14), `scrollHeight=${m.scrollHeight} innerHeight=${m.innerHeight}`, bad.length ? "inflating off-screen: " + JSON.stringify(bad) : "");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `overscroll-${ENGINE}-${state.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  };
  await page.goto(`${BASE}/#BANK_P3Q`);
  await page.waitForFunction(() => /_P3/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#freeze").hidden, null, { timeout: 10000 });
  await page.waitForTimeout(1000); await check("loaded");
  await page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100);
  await page.fill("#ans", "7"); await page.$eval("#ansGo", b => b.click()); await page.waitForTimeout(2000);
  await page.fill("#ans", "4"); await page.$eval("#ansGo", b => b.click());
  await page.waitForFunction(() => !!document.querySelector("#q .nx"), null, { timeout: 9000 });
  await page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1500); await check("graded");
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(500); await check("blurred");
  if (!await page.isVisible("#padFab")) { failures++; console.log("FAIL notes-open   #padFab not visible in diet mode on a phone"); }
  else {
    await page.tap("#padFab"); await page.waitForTimeout(800); await check("notes open");
    await page.$eval("#mtExp", b => b.click()); await page.waitForTimeout(800); await check("notes closed");
  }
} catch (e) { failures++; console.log("FAIL", String(e.message).slice(0, 900)); }
finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} FAILED` : "overscroll: all states ok");
process.exit(failures ? 1 : 0);
