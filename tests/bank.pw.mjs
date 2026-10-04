// Practice banks (design/BANK.md): type BANK_XXX, the list button reads the code, the bank reopens where it was
// (this browser's pointer, else the server's), upload vs bank, unknown bank.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/bank.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8819), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "bank-")), BANKS = join(TMP, "banks");
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const BANK = { v: 1, problems: [num("CALC1_B01", "2", "Bank one: 1 + 1"), num("CALC1_B02", "3", "Bank two: 1 + 2"), num("CALC1_B03", "4", "Bank three: 2 + 2")] };
const FILE = { v: 1, problems: [num("CALC1_U01", "1", "Upload one"), num("CALC1_U02", "2", "Upload two")] };
(await import("node:fs")).mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_AB12.json"), JSON.stringify(BANK));

/* the list is shuffled per browser (design/NAV.md): pin a seed that keeps file order for both tiny banks, re-set on every load
   (one step wipes storage) */
const { shuffled } = await import("../shuffle.mjs");
const same = (a, s) => shuffled(a, s).every((c, i) => c === a[i]);
const SEED = Array.from({ length: 500 }, (_, i) => "k" + i).find(s => same(BANK.problems.map(p => p.code), s) && same(FILE.problems.map(p => p.code), s));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 8000 });
async function typeCode(page, code) {
  if (await page.isVisible("#barTab") && !(await page.isVisible("#code"))) await page.click("#barTab");
  await page.fill("#code", code); await page.press("#code", "Enter");
}
const label = page => page.getAttribute("#qlistBtn", "title");   // which bank or file is live (the button itself says "Questions")
const rowTexts = async page => { if (await page.isHidden("#qlist")) await page.click("#qlistBtn"); return page.$$eval("#qlist a", as => as.map(a => a.textContent.trim())); };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [vname, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1920, height: 1080 }]]) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: "block", hasTouch: vname === "phone", isMobile: vname === "phone" });
    await ctx.addInitScript(s => { try { if (localStorage.getItem("stem-order") !== s) localStorage.setItem("stem-order", s); } catch { /* blocked */ } }, SEED);
    const page = await ctx.newPage();

    await step(`${vname}: new browser = blank page, no list`, async () => {
      await page.goto(BASE + "/"); await page.waitForTimeout(600);
      assert.ok(await page.isHidden("#qnav"), "nav shown with no bank");
      assert.ok(await page.isHidden("#freeze"), "a problem opened with no bank");
    });

    await step(`${vname}: unknown bank says so`, async () => {
      await typeCode(page, "BANK_NOPE");
      await page.waitForFunction(() => document.querySelector("#entryMsg").textContent === "BANK_NOPE not found.", null, { timeout: 4000 });
      assert.ok(await page.isHidden("#qnav"));
    });

    await step(`${vname}: type "bank ab12" -> first question, list button says Questions (title = the code), checklist icon`, async () => {
      await typeCode(page, "bank ab12");
      await opened(page, "CALC1_B01");
      assert.equal(await label(page), "BANK_AB12");
      assert.equal(await page.getAttribute("#qlistBtn", "aria-label"), "Question list");
      assert.equal((await page.innerText("#qlistName")).trim(), "Questions");
      assert.deepEqual(await rowTexts(page), ["1Bank one: 1 + 1", "2Bank two: 1 + 2", "3Bank three: 2 + 2"]);
      const r = await page.locator("#qlistBtn").boundingBox();
      assert.ok(r.height >= 48, "list button under 48px");
      if (vname === "phone") {
        const g = await page.evaluate(() => { const b = s => document.querySelector(s).getBoundingClientRect(); return { btn: b("#qlistBtn"), next: b("#qnext") }; });
        assert.ok(g.btn.right < g.next.left, "list button runs into the arrows");
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/bank-open-${viewport.width}.png` });
      await page.click("#qlistBtn");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/bank-closed-${viewport.width}.png` });
    });

    await step(`${vname}: Next, a wrong try, reload -> same bank, same question, X in the list`, async () => {
      await page.click("#qnext"); await opened(page, "CALC1_B02");
      await page.fill("#ans", "9"); await page.click("#ansGo");
      await page.waitForSelector("#ff .vk[data-v=i-x]", { timeout: 4000 });   // the verdict is the icon in the box
      await page.goto(BASE + "/"); await opened(page, "CALC1_B02");
      assert.equal(await label(page), "BANK_AB12");
      await page.click("#qlistBtn");
      assert.equal(await page.$eval('#qlist a[href="#CALC1_B02"]', a => a.querySelectorAll(".mk-x").length), 1);
      await page.click("#qlistBtn");
    });

    await step(`${vname}: storage wiped, cookie kept -> the server reopens the bank where it was`, async () => {
      await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const d = indexedDB.deleteDatabase("stem-stuff"); d.onsuccess = d.onerror = d.onblocked = r; }); });
      await page.goto("about:blank"); await page.goto(BASE + "/"); await opened(page, "CALC1_B02");
      assert.equal(await label(page), "BANK_AB12");
      await page.click("#qlistBtn");
      assert.equal(await page.$eval('#qlist a[href="#CALC1_B02"]', a => a.querySelectorAll(".mk-x").length), 1, "server mark missing");
      await page.click("#qlistBtn");
    });

    await step(`${vname}: upload wins over the bank, and stays after a reload`, async () => {
      if (await page.isVisible("#barTab") && !(await page.isVisible("#upload"))) await page.click("#barTab");
      const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await fc.setFiles({ name: "mine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
      await opened(page, "CALC1_U01");
      assert.equal(await label(page), "mine.json");
      await page.goto("about:blank"); await page.goto(BASE + "/"); await page.waitForTimeout(1200);
      assert.ok(!/^CALC1_B/.test(await page.textContent("#pcode")), "the bank took over after an upload");
      await page.goto("about:blank"); await page.goto(BASE + "/#CALC1_U02"); await opened(page, "CALC1_U02");
      assert.equal(await label(page), "mine.json");
    });

    await step(`${vname}: type just "ab12" -> the bank again, where it was`, async () => {
      await typeCode(page, "ab12"); await opened(page, "CALC1_B02");
      assert.equal(await label(page), "BANK_AB12");
    });

    await step(`${vname}: #BANK_AB12 link opens the bank again`, async () => {
      await page.goto("about:blank"); await page.goto(BASE + "/#BANK_AB12"); await opened(page, "CALC1_B02");
      assert.equal(await label(page), "BANK_AB12");
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
process.exit(failures ? 1 : 0);
