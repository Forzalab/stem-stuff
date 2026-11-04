// REVEAL-DUCK (Nov 3, Tony 22:48): the reveal lines under the strip drawer wear the dark duck (the old "Why does this work?" CTA's i-duck, one shared
//   icon: app.js revDuck / .rv-duck, trailing the copy button so nothing shifts; NOT on Avenged!, guard.pw asserts no duck there): "That's it! ..." (right), "Not it. The answer is ..." (wrong). Present, drawn, not hidden,
//   contrast >= 3:1 against the line's background; dark + light colour scheme, 393 + 1280.   node tests/reveal-duck.pw.mjs <port>
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8891, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "reveal-duck-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const num = n => ({ code: `PHYS_RD${n}`, title: `Roll ${n}`, type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.", body: [{ type: "text", md: `Roll ${n}: how fast at the bottom?` }],
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. Spin." }, { value: "0.650", error: "trig", hint: "QUACK. Trig." }], saccharine: { title: `Roll ${n}`, key: "Answer: 1.38", slip: {} } });
const mc = { code: "PHYS_RDM", title: "Pick", type: "mc", shuffle: false, body: [{ type: "text", md: "Pick one." }], correct: "a", choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })) };
writeFileSync(join(BANKS, "BANK_RDK.json"), JSON.stringify({ v: 1, problems: [num(1), num(2), mc] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, scheme, hash, redeem) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: 852 }, hasTouch: phone, isMobile: phone, colorScheme: scheme, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_RDK");
  await page.waitForFunction(() => /^#PHYS_RD/.test(location.hash) && !!document.querySelector("#ff input, #ff textarea, #q .opt"), null, { timeout: 10000 });
  if (hash !== "#PHYS_RD1") { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForFunction(h => location.hash === h && document.querySelector("#q .opt"), hash, { timeout: 8000 }); }
  if (redeem) await page.evaluate(() => window.stemRedo.set("PHYS_RDM", 1, true));
  await page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100, null, { timeout: 6000 });
  return page;
}
const typeAnswer = async (page, v) => { const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
/* the reveal line's duck: there, boxed, not hidden/transparent, and its paint vs the first opaque background behind it >= 3:1 */
const duckOf = (page, line) => page.evaluate(sel => {
  const host = document.querySelector(sel), d = host && host.querySelector(".rv-duck"), ic = d && d.querySelector("svg");
  if (!ic) return { has: false, host: !!host };
  const r = ic.getBoundingClientRect(); let o = 1;
  for (let e = ic; e && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity;
  const rgb = s => (/rgba?\(([^)]+)\)/.exec(s) || [0, "0,0,0,0"])[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  let bg = [2, 6, 12];
  for (let e = ic; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.9) { bg = c.slice(0, 3); break; } }
  const lum = c => { const [a, b, x] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a + 0.7152 * b + 0.0722 * x; };
  const fg = rgb(getComputedStyle(ic).color).slice(0, 3), L = lum(fg), B = lum(bg);
  return { has: true, w: r.width, h: r.height, o, vis: getComputedStyle(ic).visibility, cr: +((Math.max(L, B) + 0.05) / (Math.min(L, B) + 0.05)).toFixed(2) };
}, line);
const ok = (d, when) => assert.ok(d.has && d.w > 0 && d.h > 0 && d.vis === "visible" && d.o > 0.9 && d.cr >= 3, `${when}: no visible duck: ` + JSON.stringify(d));
try {
  for (const w of [393, 1280]) for (const scheme of ["dark", "light"]) {
    await step(`${w} ${scheme}: right -> "That's it!" line has the duck`, async () => {
      const page = await open(w, scheme, "#PHYS_RD1");
      try { await typeAnswer(page, "1.38"); await page.waitForSelector("#q .ansl b", { timeout: 6000 }); await page.waitForTimeout(500); ok(await duckOf(page, "#q .ansl"), "right"); } finally { await page.context().close(); }
    });
    await step(`${w} ${scheme}: 2nd miss -> "Not it. The answer is" line has the duck`, async () => {
      const page = await open(w, scheme, "#PHYS_RD1");
      try {
        await typeAnswer(page, "1.636"); await page.waitForFunction(() => window.__drill.state.tries.length === 1, null, { timeout: 6000 });
        await page.waitForTimeout(2200); await typeAnswer(page, "0.650");
        await page.waitForSelector("#q .ansl b", { timeout: 6000 }); await page.waitForTimeout(500);
        assert.match(await page.textContent("#q .ansl"), /Not it/); ok(await duckOf(page, "#q .ansl"), "wrong");
      } finally { await page.context().close(); }
    });
  }
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("reveal-duck: all ok");
