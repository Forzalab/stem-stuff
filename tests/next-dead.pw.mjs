// "Next doesn't work" (Tony, T16): every press of Next either moves to another question or says why. Never silent.
// Rows: a bank, DIET_ on a bank, an uploaded file, a file whose codes the page cannot open (CODE_RE), a direct #CODE link,
// at 1280 desktop and 393x852 phone. Each row clicks Next 10x and logs hash before/after + what it did.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/next-dead.pw.mjs [port]        (NEXT_LOG=1 prints every press)
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
import { createServer } from "node:net";
/* run-all.sh hands .pw scripts a base URL; this one starts its own server, so a number is the port, anything else a free one */
const freePort = () => new Promise(r => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : await freePort(), BASE = `http://localhost:${PORT}`;
const LOG = !!process.env.NEXT_LOG;
const TMP = mkdtempSync(join(tmpdir(), "nextdead-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const num = (code, answer, md, extra = {}) => ({ code, type: "num", answer, body: [{ type: "text", md }], ...extra });
const P2X = Array.from({ length: 8 }, (_, i) => num(`PHYS_P0${i + 1}`, String(i + 2), `Phys ${i + 1}: 1 + ${i + 1}`, { topic: `t${i % 3}` }));
writeFileSync(join(BANKS, "BANK_P2X.json"), JSON.stringify({ v: 1, problems: P2X }));
writeFileSync(join(BANKS, "BANK_ONE.json"), JSON.stringify({ v: 1, problems: [P2X[0]] }));
/* an uploaded file whose codes pass offline.js (any PREFIX_XX) but not app.js CODE_RE: nothing of it can be opened (T15 widens the regex, not this) */
const ODD = ["BEAR_001", "BEAR_002", "BEAR_003"].map((c, i) => num(c, "2", `Odd ${i + 1}: 1 + 1`));
const oddFile = { name: "ODD.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems: ODD })) };
/* an upload with one good code and two that cannot open */
const MIX = [num("PHYS_M01", "2", "Mix 1: 1 + 1"), num("BEAR_002", "2", "Mix 2"), num("CSCI26_TOOLONG7", "2", "Mix 3")];
const mixFile = { name: "MIX.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems: MIX })) };
/* a fine upload (codes CODE_RE takes), the bear bank's shape */
const FINE = ["CSCI26_BAA", "CSCI26_BAB", "CSCI26_BAC", "CSCI26_BAD"].map((c, i) => num(c, "2", `Fine ${i + 1}: 1 + 1`));
const fineFile = { name: "FINE.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems: FINE })) };

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
const ONLY = process.env.NEXT_ONLY ? new RegExp(process.env.NEXT_ONLY) : null;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const pcode = page => page.evaluate(() => document.querySelector("#pcode")?.textContent || "");
const opened = (page, code, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
const settled = page => page.waitForFunction(() => /\S/.test(document.querySelector("#pcode")?.textContent || "")
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });

/* one press: click Next, wait up to 1.2 s for a different question or a visible reason. Returns what happened. */
async function press(page, tag, n) {
  const before = await page.evaluate(() => ({ hash: location.hash, code: document.querySelector("#pcode")?.textContent || "",
    disabled: document.querySelector("#qnext").disabled, hidden: document.querySelector("#qnav").hidden }));
  if (before.hidden) return { ...before, moved: false, said: "", why: "nav hidden" };
  if (before.disabled) { await page.click("#qnext", { force: true, timeout: 1500 }).catch(() => {}); }
  else await page.click("#qnext", { timeout: 3000 });
  const t0 = Date.now(); let moved = false, said = "";
  while (Date.now() - t0 < 1200 && !moved && !said) {
    await page.waitForTimeout(60);
    const s = await page.evaluate(() => ({ code: document.querySelector("#pcode")?.textContent || "", toast: document.querySelector("#toast.on")?.textContent || "",
      msg: document.querySelector("#entryMsg")?.textContent || "" }));
    moved = s.code !== before.code; said = s.toast || s.msg;
  }
  const after = await page.evaluate(() => ({ hash: location.hash, code: document.querySelector("#pcode")?.textContent || "" }));
  const r = { ...before, hashAfter: after.hash, codeAfter: after.code, moved, said };
  if (LOG) console.log(`      ${tag} #${n} hash ${before.hash || "-"} -> ${after.hash || "-"}  shown ${before.code || "-"} -> ${after.code || "-"}  disabled=${before.disabled}  ${moved ? "MOVED" : said ? "SAID " + JSON.stringify(said) : "SILENT"}`);
  await page.waitForTimeout(150);
  return r;
}
async function tenPresses(page, tag) {
  const rows = [];
  for (let i = 1; i <= 10; i++) rows.push(await press(page, tag, i));
  return rows;
}
const silent = rows => rows.filter(r => !r.moved && !r.said);

async function ctxFor(browser, vp) {
  const phone = vp.width < 600;
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: "block", hasTouch: phone, isMobile: phone });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("stem-ob")) localStorage.setItem("stem-ob", "done"); } catch { /* blocked */ } });
  return ctx;
}
async function upload(page, file) {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles(file);
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const vp of [{ width: 1280, height: 800 }, { width: 393, height: 852 }]) {
    const V = `${vp.width}`;
    await step(`${V}: BANK_P2X, Next 10x: every press moves`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/#BANK_P2X"); await settled(page);
      const rows = await tenPresses(page, "P2X");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      assert.ok(rows.every(r => r.moved), "a press did not move");
      await ctx.close();
    });

    await step(`${V}: DIET_BANK_P2X typed in the code box, Next 10x: every press moves`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/#BANK_P2X"); await settled(page);
      if (!(await page.isVisible("#code"))) await page.click("#codeChip, #qlistBtn").catch(() => {});
      await page.evaluate(() => { const i = document.querySelector("#code"); i.value = "DIET_BANK_P2X"; i.form.requestSubmit(); });
      await page.waitForTimeout(800); await settled(page);
      const rows = await tenPresses(page, "DIET");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      await ctx.close();
    });

    await step(`${V}: an uploaded file the page can open, Next 10x: every press moves`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fineFile); await settled(page);
      const rows = await tenPresses(page, "UPLOAD");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      await ctx.close();
    });

    await step(`${V}: an uploaded file whose codes the page can't open: it says why (T15 owns the pattern)`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, oddFile); await page.waitForTimeout(1200);
      const said = await page.evaluate(() => (document.querySelector("#toast.on")?.textContent || "") + "|" + (document.querySelector("#entryMsg")?.textContent || ""));
      if (LOG) console.log(`      ODD after upload: ${JSON.stringify(said)}`);
      assert.match(said, /can't open BEAR_001/i, "an upload nothing of which opens said nothing");
      await ctx.close();
    });

    await step(`${V}: a mixed upload (one good code, two that can't open): Next moves or says why, never silent`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, mixFile); await settled(page);
      const rows = await tenPresses(page, "MIX");
      assert.deepEqual(silent(rows).map(r => r.hash), [], "silent presses");
      await ctx.close();
    });

    await step(`${V}: direct #CODE link of a question in the remembered bank: Next 10x moves`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/#BANK_P2X"); await settled(page);
      await page.goto(BASE + "/#PHYS_P05"); await opened(page, "PHYS_P05"); await page.waitForTimeout(500);
      const rows = await tenPresses(page, "DIRECT-IN");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      await ctx.close();
    });

    await step(`${V}: direct #CODE link of a question NOT in the remembered bank: Next moves or says why`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/#BANK_P2X"); await settled(page);
      await page.goto(BASE + "/#PHYS_F3N"); await opened(page, "PHYS_F3N"); await page.waitForTimeout(500);
      const rows = await tenPresses(page, "DIRECT-OUT");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      await ctx.close();
    });

    await step(`${V}: a one-question bank: Next says why`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/#BANK_ONE"); await settled(page);
      const rows = await tenPresses(page, "ONE");
      assert.deepEqual(silent(rows).map(r => r.code), [], "silent presses");
      await ctx.close();
    });
  }

  /* (a) the target is already in the hash but not on screen (its first load never ran: a failed fetch, a dropped hashchange): the hash
     assignment is a no-op, so the second Next press used to do nothing, for good. It must retry. */
  await step("393: the first load of Next's target is dropped: the next press loads it", async () => {
    const ctx = await ctxFor(browser, { width: 393, height: 852 }), page = await ctx.newPage();
    await page.addInitScript(() => { window.__swallow = 0; addEventListener("hashchange", e => { if (window.__swallow-- > 0) e.stopImmediatePropagation(); }); });   // first in line: before app.js
    await page.goto(BASE + "/#BANK_P2X"); await settled(page);
    await page.evaluate(() => { window.__swallow = 1; });
    const from = await pcode(page);
    await page.click("#qnext"); await page.waitForTimeout(700);
    assert.equal(await pcode(page), from, "the first press should have been swallowed");
    const hash = await page.evaluate(() => location.hash);
    await page.click("#qnext");
    await page.waitForFunction(f => document.querySelector("#pcode").textContent !== f, from, { timeout: 3000 }).catch(() => { throw new Error(`stuck on ${from} with hash ${hash}: the second press did nothing`); });
    await ctx.close();
  });
  /* (d) the list is open and Next is tapped: the outside-tap handler closes the list on pointerdown; the bar must not move under the finger
     before the click lands (a tap that slides off its button is no click at all) */
  await step("393: list open, tap Next: the button holds still between pointerdown and the click, and the press moves", async () => {
    const ctx = await ctxFor(browser, { width: 393, height: 852 }), page = await ctx.newPage();
    await page.goto(BASE + "/#BANK_P2X"); await settled(page);
    await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])");
    await page.waitForTimeout(300);
    const from = await pcode(page);
    const box = await page.evaluate(() => { const r = document.querySelector("#qnext").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const moved = page.evaluate(() => new Promise(res => {
      const n = document.querySelector("#qnext"), y0 = n.getBoundingClientRect().y;
      document.addEventListener("pointerdown", () => setTimeout(() => res(Math.abs(n.getBoundingClientRect().y - y0)), 120), { once: true });
    }));
    await page.touchscreen.tap(box.x, box.y);
    const d = await moved;
    if (LOG) console.log(`      LIST-OPEN next moved ${d}px after pointerdown; shown ${from} -> ${await pcode(page)}`);
    await page.waitForTimeout(500);
    assert.ok(d < 1, `Next slid ${d}px under the finger on pointerdown`);
    assert.notEqual(await pcode(page), from, "the tap did not move to another question");
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
