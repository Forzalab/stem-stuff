// Redo my misses (cram week, Oct 6): the round holds only the questions with a wrong try, graded fresh; the real marks come back on Exit;
// a past miss right again = the Comeback toast and no XP; diet works; no misses = a short note; an upload has no button.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:   node tests/redo.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8841), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "redo-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_RD12.json"), JSON.stringify({ v: 1, problems: [real("CALC1_R01", 1), real("CALC1_R02", 2), real("CALC1_R03", 3), real("CALC1_R04", 4)] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const cur = page => page.evaluate(() => document.querySelector("#pcode")?.textContent || "");
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function showCode(page) {
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
async function openBank(page) {
  await page.goto(BASE + "/");
  await showCode(page);
  await page.fill("#code", "BANK_RD12"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
}
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
  await page.waitForTimeout(200);
}
const quiet = page => page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 });
const listOpen = async (page, on) => { if (await page.isHidden("#qlist") === on) await page.$eval("#qlistBtn", b => b.click()); };
const rows = async page => { await listOpen(page, true); const r = await page.$$eval("#qlist a", as => as.map(a => ({ code: a.getAttribute("href").slice(1),
  x: a.querySelectorAll(".mk-x").length, ok: a.querySelectorAll(".mk-ok").length }))); await listOpen(page, false); return r; };
const name = page => page.$eval("#qlistName", n => n.textContent);
async function redoClick(page) {
  if (!(await page.isVisible("#qredo"))) await listOpen(page, true);
  await page.click("#qredo");
  await page.waitForTimeout(300);
}
const ctxOpts = (viewport, phone) => ({ viewport, serviceWorkers: "block", hasTouch: phone, isMobile: phone });
const init = () => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [vname, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext(ctxOpts(viewport, vname === "phone"));
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await openBank(page);

    await step(`${vname}: no misses yet = a short note, no round`, async () => {
      await redoClick(page);
      assert.equal(await page.$eval("#qredoTx", t => t.textContent), "No misses yet");
      assert.equal(await page.evaluate(() => window.stemRedo.get()), null);
      await listOpen(page, false);
    });

    await step(`${vname}: R01 right, R02 fixed on try 2, R03 out of tries, R04 untouched`, async () => {
      await go(page, "CALC1_R01"); await pick(page, "a"); await quiet(page);
      await go(page, "CALC1_R02"); await pick(page, "b"); await pick(page, "a"); await quiet(page);
      await go(page, "CALC1_R03"); await pick(page, "b"); await pick(page, "c"); await quiet(page);
      const r = Object.fromEntries((await rows(page)).map(x => [x.code, x]));
      assert.deepEqual([r.CALC1_R01.x, r.CALC1_R02.x, r.CALC1_R03.x, r.CALC1_R04.x], [0, 1, 2, 0]);
    });

    let xp0 = 0;
    await step(`${vname}: Redo misses = exactly R02 + R03, blank, "Redo 0/2", Exit on the bar`, async () => {
      xp0 = await page.evaluate(() => window.Rewards.state().xp);
      assert.equal(await page.$eval("#qredoTx", t => t.textContent), "Redo misses (2)");
      await redoClick(page);
      const r = await rows(page);
      assert.deepEqual(r.map(x => x.code).sort(), ["CALC1_R02", "CALC1_R03"]);
      assert.ok(r.every(x => !x.x && !x.ok), JSON.stringify(r));
      assert.equal(await name(page), "Redo 0/2");
      assert.ok(["CALC1_R02", "CALC1_R03"].includes(await cur(page)));
      assert.equal(await page.isVisible("#qredo"), true, "Exit stays on the bar");
      assert.equal(await page.$eval("#qredoTx", t => t.textContent), "Exit redo");
      const live = await page.$$eval("#q .opt:not(:disabled)", o => o.length);
      assert.equal(live, 5, "the old lockout is gone in the round");
      const b = await page.$eval("#qredo", e => e.getBoundingClientRect().toJSON());
      assert.ok(b.right <= viewport.width && b.left >= 0, `Exit fits on screen: ${JSON.stringify(b)}`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `redo-${vname}.png`) });
    });

    await step(`${vname}: R02 right again = Comeback toast, no XP; R03 pays once; "Redo done 2/2"`, async () => {
      for (let k = 0; k < 2; k++) {
        const c = await cur(page), before = await page.evaluate(() => window.Rewards.state().xp);
        await pick(page, "a");
        if (c === "CALC1_R02") {
          await page.waitForFunction(() => [...document.querySelectorAll(".fx-toast")].some(t => /Comeback!/.test(t.textContent)), null, { timeout: 4000 });
          assert.equal(await page.evaluate(() => window.Rewards.state().xp), before, "a paid code pays nothing again");
        }
        await page.waitForTimeout(900); await quiet(page);              // a streak note lands 600 ms after the bells: let it pass
        if (k === 0) { await page.click("#qnext"); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, c, { timeout: 6000 }); }
      }
      assert.ok(await page.evaluate(() => window.Rewards.state().xp) > xp0, "R03 never paid: it pays now");
      await page.waitForFunction(() => document.querySelector("#qlistName").textContent === "Redo done 2/2", null, { timeout: 4000 });
    });

    await step(`${vname}: a reload stays in the round with its record`, async () => {
      const c = await cur(page);
      await page.reload();
      await opened(page, c);
      assert.equal(await name(page), "Redo done 2/2");
      assert.ok(await page.$eval("#q", q => q.classList.contains("closed") || !!q.querySelector(".opt.right")), "the round's right answer shows");
    });

    await step(`${vname}: Exit redo = the real marks and lockout come back`, async () => {
      await go(page, "CALC1_R03");
      await page.click("#qredo"); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.stemRedo.get()), null);
      assert.equal(await name(page), "BANK_RD12");
      const r = Object.fromEntries((await rows(page)).map(x => [x.code, x]));
      assert.deepEqual([r.CALC1_R02.x, r.CALC1_R02.ok, r.CALC1_R03.x, r.CALC1_R03.ok], [1, 1, 2, 0]);
      assert.deepEqual(await page.$$eval("#q .opt.wrong", o => o.map(x => x.dataset.id).sort()), ["b", "c"]);
      assert.equal(await page.$$eval("#q .opt:not(:disabled)", o => o.length), 0, "R03 is still out of tries");
    });
    await ctx.close();
  }

  await step("diet: a miss, a round, right again, exit", async () => {
    const ctx = await browser.newContext(ctxOpts({ width: 1280, height: 900 }, false));
    await ctx.addInitScript(init);
    await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }]);
    const page = await ctx.newPage();
    await openBank(page);
    await go(page, "CALC1_R04"); await pick(page, "b"); await pick(page, "c");
    await redoClick(page);
    assert.equal(await cur(page), "CALC1_R04");
    assert.equal(await name(page), "Redo 0/1");
    await pick(page, "a");
    await page.waitForFunction(() => document.querySelector("#qlistName").textContent === "Redo done 1/1", null, { timeout: 4000 });
    assert.equal(await page.$(".fx-toast"), null, "diet: no reward toast");
    await page.click("#qredo"); await page.waitForTimeout(400);
    assert.equal(await page.$$eval("#q .opt:not(:disabled)", o => o.length), 0, "the real record: out of tries");
    await ctx.close();
  });

  await step("an upload has no Redo button", async () => {
    const ctx = await browser.newContext(ctxOpts({ width: 1280, height: 900 }, false));
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.goto(BASE + "/");
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await fc.setFiles({ name: "u.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems: [real("CALC1_U01", 1), real("CALC1_U02", 2)] })) });
    await page.waitForFunction(() => /^CALC1_U/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    await listOpen(page, true);
    assert.equal(await page.isVisible("#qredo"), false);
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
