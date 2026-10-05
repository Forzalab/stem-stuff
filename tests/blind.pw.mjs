// The blind-locale test overlay (blind/locale.js; design/UX-TOPDOWN.md §3): with ?blind=ka no Latin letter is left in the UI (text,
// aria-label, title, placeholder) outside the content (question, answers, figure, math, hints, Cluck's text, the original's body),
// and the question text is byte-identical to the English page. ?blind=off brings English back. Without the flag nothing loads.
// Starts its own serve.py with a throwaway banks/ folder:   node tests/blind.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8847), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "blind-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = { code: "CALC1_B01", type: "mc", shuffle: false, body: [{ type: "text", md: "A 2.0 kg cart rolls at $3.0$ m/s. How fast after it sticks to a 1.0 kg cart?" }],
  choices: ch("1.0 m/s", "2.0 m/s", "3.0 m/s"), correct: "b", wrong: [{ choice: "a", hint: "QUACK. Total mass." }],
  saccharine: { title: "Practice Exam 2, Question 1", tip: "Momentum before equals after.", key: "Answer: b", narration: "POOF. Six over three is two." } };
const snack = { ...real, code: "CALC1_B02", sugar_only: true, body: [{ type: "text", md: "Snack: a 4.0 kg cart at 3.0 m/s sticks to a 2.0 kg cart." }],
  saccharine: { title: "Practice Exam 2, Question 1: masses doubled", key: "Answer: b", snack: true, before: "CALC1_B01",
    original: { q: 1, body: [{ type: "text", md: "The original question 1." }], solution: ["Use: $p = mv$", "Answer: 2.0 m/s"] } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_BL12.json"), JSON.stringify({ v: 1, problems: [real, snack] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent.length > 0 && location.hash === "#" + c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
/* every Latin run left in the UI: visible text outside the content, and the labels a screen reader or a hover shows */
const leaks = page => page.evaluate(() => {
  const KEEP = "#blocks, #q .opt .txt, #q .mparts .pr, .katex, .fig, #fb .cluck, #fb code, #cluck .wtext, .cl .bub.me, .orig-body, .fcard .f, textarea, input, #padPeekTx, script, style, noscript, svg, .blind-keep";
  const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(KEEP) || !el.getClientRects().length) continue;
    if (/[A-Za-z]/.test(n.nodeValue)) out.push(n.nodeValue.trim());
  }
  for (const el of document.querySelectorAll("[aria-label], [title], [placeholder]")) {
    if (el.closest(KEEP) && !/^(INPUT|TEXTAREA)$/.test(el.tagName)) continue;
    for (const a of ["aria-label", "title", "placeholder"]) { const v = el.getAttribute(a); if (v && /[A-Za-z]/.test(v)) out.push(`${a}=${v}`); }
  }
  return out;
});
const pick = async (page, id) => { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`); };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage();
  let english = "";

  await step("no flag: English, and blind/locale.js never loads", async () => {
    const asked = []; page.on("request", r => { if (/\/blind\//.test(r.url())) asked.push(r.url()); });
    await page.goto(BASE + "/#CALC1_B01"); await opened(page, "CALC1_B01");
    english = (await page.textContent("#blocks")).trim();
    assert.match(english, /2\.0 kg cart/);
    assert.equal(await page.getAttribute("html", "data-blind"), null);
    assert.equal(asked.length, 0, asked.join(" "));
  });

  await step("?blind=ka: no Latin in the UI, the question byte-identical", async () => {
    await page.goto(BASE + "/?blind=ka#CALC1_B01"); await opened(page, "CALC1_B01");
    await page.waitForFunction(() => document.documentElement.dataset.blind === "ka", null, { timeout: 4000 });
    await page.waitForTimeout(300);
    assert.equal((await page.textContent("#blocks")).trim(), english);
    assert.deepEqual(await leaks(page), []);
  });

  await step("blind: a wrong answer (verdict, toast, Cluck chip) and the snack's original stay Latin-free; content stays English", async () => {
    await pick(page, "a");
    await page.waitForSelector("#wish:not([hidden]) .wchip", { timeout: 6000 });
    await page.waitForTimeout(400);
    assert.deepEqual(await leaks(page), []);
    assert.match(await page.textContent("#fb .cluck"), /QUACK\. Total mass\./);
    await page.click("#wish .wchip");
    await page.waitForFunction(() => /Six over three/.test(document.querySelector("#cluck .wtext, .cl .bub.me")?.textContent || ""), null, { timeout: 6000 });
    assert.deepEqual(await leaks(page), []);
    await page.evaluate(() => { location.hash = "CALC1_B02"; }); await opened(page, "CALC1_B02");
    await page.waitForTimeout(300);
    assert.deepEqual(await leaks(page), []);
  });

  await step("sticks for the tab; ?blind=off brings English back", async () => {
    await page.goto(BASE + "/#CALC1_B01"); await opened(page, "CALC1_B01");
    await page.waitForFunction(() => document.documentElement.dataset.blind === "ka", null, { timeout: 4000 });
    await page.goto(BASE + "/?blind=off#CALC1_B01"); await opened(page, "CALC1_B01");
    await page.waitForTimeout(300);
    assert.equal(await page.getAttribute("html", "data-blind"), null);
    assert.ok((await leaks(page)).length > 0, "English is back");
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
