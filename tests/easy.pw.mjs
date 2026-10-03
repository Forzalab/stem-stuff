// Easy mode (the default) vs hard mode (ADMIN_<code>), design/EASY.md: no "None of these" in either; easy hides None-is-the-answer
// questions, drops fix boxes and shows the "what to do" tip; nothing ticked is a real answer; UNADMIN_ goes back. Starts its own
// serve.py with a throwaway banks/ folder and tries.json:   node tests/easy.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8825), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "easy-")), BANKS = join(TMP, "banks");
const row = (id, md, x = {}) => ({ id, md, ...x });
const NONE = row("e", "None of these", { lock: true });
const P = {
  all: { code: "CALC1_E01", type: "mc", pick: "all", shuffle: false, tip: "Add the areas above the axis, subtract the ones below.",
    body: [{ type: "text", md: "Which are true?" }], choices: [row("a", "two"), row("b", "three"), row("c", "four"), NONE],
    correct: ["a", "c"], wrong: [{ choice: "b", hint: "QUACK. b" }], miss: "QUACK. Missing one." },
  none: { code: "CALC1_E02", type: "mc", shuffle: false, body: [{ type: "text", md: "Pick the even prime above 2." }],
    choices: [row("a", "3"), row("b", "5"), row("c", "7"), NONE], correct: "e" },
  prove: { code: "CALC1_E03", type: "mc", pick: "all", shuffle: false, fix: { type: "num", how: "4 sig figs" },
    body: [{ type: "text", md: "Mark each row." }], choices: [row("a", "$2+2=4$"), row("b", "$3 \\cdot 3=6$"), row("c", "$1+1=2$")],
    correct: ["a", "c"], wrong: [{ choice: "b", hint: "QUACK. times", fix: { answer: "9" } }], miss: "QUACK. Missing one." },
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_EZ12.json"), JSON.stringify({ v: 1, problems: [P.all, P.none, P.prove] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
async function typeCode(page, code) {
  if (await page.isVisible("#barTab") && !(await page.isVisible("#code"))) await page.click("#barTab");
  await page.fill("#code", code); await page.press("#code", "Enter");
}
const listCodes = async page => { if (await page.isHidden("#qlist")) await page.click("#qlistBtn"); const r = await page.$$eval("#qlist a", as => as.map(a => a.getAttribute("href").slice(1)).sort()); await page.click("#qlistBtn"); return r; };
const rows = page => page.$$eval("#q .opt .txt", xs => xs.map(x => x.textContent.trim()));

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");

  await step("easy (default): None-is-the-answer hidden, no None row, the tip on top, empty Check live", async () => {
    await typeCode(page, "BANK_EZ12");
    await page.waitForFunction(() => /^CALC1_E0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    assert.deepEqual(await listCodes(page), ["CALC1_E01", "CALC1_E03"]);
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.deepEqual(await rows(page), ["two", "three", "four"]);
    assert.equal((await page.textContent("#blocks .tip")).trim(), P.all.tip);
    assert.match(await page.textContent("#how"), /None true\? Check with none ticked/);
    assert.equal(await page.$eval("#mcGo", b => b.disabled), false, "Check needs a tick");
  });

  await step("nothing ticked is a real answer (a try, the miss hint)", async () => {
    await page.click("#mcGo");
    await page.waitForFunction(() => /Missing one/.test(document.querySelector("#fb")?.textContent || ""), null, { timeout: 4000 });
  });

  await step("easy: prove-mode question has no fix boxes; a tick-only set is graded", async () => {
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.$$eval("#q .fix", f => f.length), 0);
    await page.click('.opt[data-id="a"]'); await page.click('.opt[data-id="c"]'); await page.click("#mcGo");
    await page.waitForSelector('#q .opt.right[data-id="a"]', { timeout: 4000 });
  });

  await step("ADMIN_EZ12: hard mode, every question, no tip, fix boxes back, still no None row", async () => {
    await typeCode(page, "ADMIN_EZ12");
    await page.waitForFunction(() => /stem-mode=hard/.test(document.cookie), null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll("#qlist a").length === 3, null, { timeout: 8000 });
    assert.deepEqual(await listCodes(page), ["CALC1_E01", "CALC1_E02", "CALC1_E03"]);
    await page.evaluate(() => { location.hash = "CALC1_E02"; }); await opened(page, "CALC1_E02");
    assert.deepEqual(await rows(page), ["3", "5", "7"]);
    await page.click("#mcGo");                                               // None was the key: nothing ticked is right
    await page.waitForSelector("#q.closed", { timeout: 4000 });
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.equal(await page.$$eval("#blocks .tip", t => t.length), 0, "tip in hard mode");
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.ok(await page.$$eval("#q .fix", f => f.length) > 0, "no fix boxes in hard mode");
  });

  await step("UNADMIN_EZ12: easy again; the prefixed form is never remembered", async () => {
    await typeCode(page, "UNADMIN_EZ12");
    await page.waitForFunction(() => !/stem-mode=hard/.test(document.cookie), null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll("#qlist a").length === 2, null, { timeout: 8000 });
    const saved = await page.evaluate(() => localStorage.getItem("stem-codes") || "");
    assert.ok(!/ADMIN/.test(saved), saved);
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
