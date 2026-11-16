// Practice banks (docs/design/BANK.md): type BANK_XXX, the list button reads the code, the bank reopens where it was
// (this browser's pointer, else the server's), upload vs bank, unknown bank, the old-bank banner (SCHEMA.md Version table).
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/bank.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bankReady, watchBank } from "./lib/bankguard.mjs";
const require = createRequire(import.meta.url);
/* the code box: a bank keeps it with the list (Tony, Oct 5 clutter pass C2 / C8), a lone question as a label (C7), a phone strip in the bar */
async function showCode(page) {
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8819), BASE = `http://localhost:${PORT}`;
const PORT2 = PORT + 1, BASE2 = `http://localhost:${PORT2}`;   // a second server, its clock past SUNSET (the dropped step)
const PIN_DAY = "2026-11-04", PAST_SUNSET = "2026-11-06";   // BANK_AB12 (v 1) loads with its banner on PIN_DAY
const SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "bank-")), BANKS = join(TMP, "banks");
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const BANK = { v: 1, problems: [num("CALC1_B01", "2", "Bank one: 1 + 1"), num("CALC1_B02", "3", "Bank two: 1 + 2"), num("CALC1_B03", "4", "Bank three: 2 + 2")] };
const FILE = { v: 1, problems: [num("CALC1_U01", "1", "Upload one"), num("CALC1_U02", "2", "Upload two")] };
(await import("node:fs")).mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_AB12.json"), JSON.stringify(BANK));
/* a bank at the newest Version-table row: never a banner. BANK_AB12 (v 1) shows one until 2026-11-05 (the server's real clock) */
writeFileSync(join(BANKS, "BANK_NW12.json"), JSON.stringify({ v: 20261022, problems: [{ ...num("CALC1_N01", "2", "New one: 1 + 1"), form: "1+1" }] }));

/* the order is a per-bank queue with a random salt (docs/design/plans/QUEUE.md): pin a salt that plays file order for both tiny banks,
   set again whenever it is missing (one step wipes storage) */
const { qFresh } = await import("../client/pure_logic_modules/shuffle.mjs");
const same = (a, s) => qFresh(a, s).every((c, i) => c === a[i]);
const SEED = Array.from({ length: 2000 }, (_, i) => "k" + i).find(s => same(BANK.problems.map(p => p.code), s) && same(FILE.problems.map(p => p.code), s));
const PIN = s => { try { for (const k of ["stem-q-BANK_AB12", "stem-q-upload"]) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 })); } catch { /* blocked */ } };
const SERVE = join(ROOT, "server", "http_server", "serve.py");
const srv = spawn("python3", [SERVE, String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), STEM_TODAY: PIN_DAY }, stdio: "ignore" });
const srv2 = spawn("python3", [SERVE, String(PORT2)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries2.json"), STEM_TODAY: PAST_SUNSET }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok && (await fetch(BASE2 + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
// the harness guard first: both servers alive, the healthy banks load (a stale port or a dropped bank fails here, with the server's text)
await bankReady({ child: srv, port: PORT, bank: "BANK_AB12" });
await bankReady({ child: srv, port: PORT, bank: "BANK_NW12" });

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 8000 });
async function typeCode(page, code) {
  await showCode(page);
  await page.fill("#code", code); await page.press("#code", "Enter");
}
const label = page => page.getAttribute("#qlistBtn", "title");   // which bank or file is live (the button says the bank code, or "Questions" for a file)
const rowTexts = async page => { if (await page.isHidden("#qlist")) await page.click("#qlistBtn"); return page.$$eval("#qlist a", as => as.map(a => a.textContent.trim())); };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [vname, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1920, height: 1080 }]]) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: "block", hasTouch: vname === "phone", isMobile: vname === "phone" });
    await ctx.addInitScript(PIN, SEED);
    const page = await ctx.newPage();
    const watch = watchBank(page);   // every bank incident line and page error of this viewport

    await step(`${vname}: new browser = blank page, no list`, async () => {
      await page.goto(BASE + "/"); await page.waitForTimeout(600);
      assert.ok(await page.isHidden("#qnav"), "nav shown with no bank");
      assert.ok(await page.isHidden("#freeze"), "a problem opened with no bank");
    });

    await step(`${vname}: unknown bank says so`, async () => {
      await typeCode(page, "BANK_NOPE");
      await page.waitForFunction(() => document.querySelector("#entryMsg").textContent === "QUACKK, code not found.", null, { timeout: 4000 });
      assert.ok(await page.isHidden("#qnav"));
      assert.deepEqual(watch.lines.map(j => [j.where, j.reason]), [["bank", "not_found"]], "want one incident line: " + JSON.stringify(watch.lines));
      assert.equal(watch.errors.length, 0);
      watch.clear();   // a typo is the one bank line this viewport expects
    });

    await step(`${vname}: type "bank ab12" -> first question, list button says the bank code (Tony, Oct 5), checklist icon`, async () => {
      await typeCode(page, "bank ab12");
      await opened(page, "CALC1_B01");
      assert.equal(await label(page), "BANK_AB12");
      assert.equal(await page.getAttribute("#qlistBtn", "aria-label"), "Question list");
      assert.equal((await page.innerText("#qlistName")).trim(), "BANK_AB12");
      assert.ok(await page.$("#qlistBtn svg.ico"), "the list icon stays");
      assert.deepEqual(await rowTexts(page), ["1Bank one: 1 + 1", "2Bank two: 1 + 2", "3Bank three: 2 + 2"]);
      assert.equal(await page.textContent("#qlist .bank-banner.entry-msg.warn"), "BANK_AB12 must be updated by 2026-11-05");   // v 1: the banner tops the list
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
      await page.waitForSelector("#ff.bad .vk[data-v=i-x]", { state: "attached", timeout: 4000 });   // the verdict is the icon in the box; the 10 s second-try wait (retry-wait.pw.mjs) keeps the Check bar in its slot, so the x is attached, not shown (render.pw.mjs / expr.pw.mjs)
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
      await showCode(page);
      const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await fc.setFiles({ name: "mine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
      await opened(page, "CALC1_U01");
      assert.equal(await label(page), "mine.json");
      assert.equal(await page.$("#qlist .bank-banner"), null, "the bank's banner outlived the bank");
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

    await step(`${vname}: a v 20261022 bank has no banner`, async () => {
      await typeCode(page, "BANK_NW12"); await opened(page, "CALC1_N01");
      assert.deepEqual(await rowTexts(page), ["1New one: 1 + 1"]);
      assert.equal(await page.$("#qlist .bank-banner"), null);
      await page.click("#qlistBtn");
    });
    await step(`${vname}: healthy banks gave no bank incident line or page error`, () => watch.assertClean());
    await ctx.close();
  }
  await step("v 1 bank past SUNSET: incident reason dropped, the server's message on screen", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const watch = watchBank(page);
    await page.goto(BASE2 + "/"); await page.waitForTimeout(600);
    await typeCode(page, "bank ab12");
    await page.waitForFunction(() => /must be updated by/.test(document.querySelector("#entryMsg")?.textContent || ""), null, { timeout: 4000 });
    assert.deepEqual(watch.lines.map(j => [j.where, j.reason, j.status]), [["bank", "dropped", 200]], "want one dropped line: " + JSON.stringify(watch.lines));
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
  srv2.kill();
}
process.exit(failures ? 1 : 0);
