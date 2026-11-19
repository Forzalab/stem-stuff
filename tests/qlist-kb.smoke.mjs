// qlist-kb.smoke.mjs (Tony Nov 17): phone, the question list open, the keyboard up for the code box that comes with
// the list. The list used to shrink to a one-row sliver; now its rows hide while the keyboard is up, and the code box /
// its suggestions stay. Keyboard down: the rows come back at the same scroll position, the aria-current row still in view.
// Also: ?ui=v7 and the flag off; a keyboard up for another field with the list closed changes nothing; desktop is unchanged.
//   node tests/qlist-kb.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8831), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "qlistkb-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
/* 16 rows: more than the phones' list cap (32rem / 60svh), so the list scrolls and a middle row can be centred */
const CODES = Array.from({ length: 16 }, (_, i) => `CALC1_K${String(i + 1).padStart(2, "0")}`);
writeFileSync(join(BANKS, "BANK_QK12.json"), JSON.stringify({ v: 1,
  problems: CODES.map((c, i) => ({ code: c, type: "num", answer: "2", body: [{ type: "text", md: `Kb ${i + 1}: 1 + 1` }] })) }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)],
  { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: process.env.STEM_TODAY || "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);

const ready = (page, code, timeout = 8000) => page.waitForFunction(c => (c ? document.querySelector("#pcode")?.textContent === c : /^CALC1_K/.test(document.querySelector("#pcode")?.textContent || ""))
  && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
const opened = (page, code) => ready(page, code);
const booted = page => ready(page, null);
const listOpen = page => page.waitForFunction(() => !document.querySelector("#qlist").hidden
  && document.documentElement.classList.contains("ql-open"), null, { timeout: 5000 });
/* everything a step reads, in one round trip (the html class list is in every failure message) */
const probe = page => page.evaluate(() => {
  const root = document.documentElement, panel = document.querySelector("#qlist"), ol = panel.querySelector("ol");
  const row = panel.querySelector("a[aria-current]"), sug = document.querySelector("#codeSug"), code = document.querySelector("#code");
  const pr = panel.getBoundingClientRect(), or = ol.getBoundingClientRect(), cs = getComputedStyle(ol);
  const rr = row ? row.getBoundingClientRect() : null;
  return { cls: root.className, qlOpen: root.classList.contains("ql-open"), kbup: root.classList.contains("kbup"),
    dockBottom: root.classList.contains("dock-bottom"), panelHidden: panel.hidden,
    panelTop: pr.top, panelBottom: pr.bottom, panelScroll: panel.scrollTop,
    rows: { h: or.height, visibility: cs.visibility, display: cs.display },
    rowVis: rr ? { top: rr.top, bottom: rr.bottom } : null,
    code: { w: code.getBoundingClientRect().width, h: code.getBoundingClientRect().height, visibility: getComputedStyle(code).visibility, focus: document.activeElement === code },
    sug: { hidden: sug.hidden, n: sug.querySelectorAll("li[data-code]").length, h: sug.getBoundingClientRect().height, visibility: getComputedStyle(sug).visibility } };
});

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}

async function phone(browser, v7) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + (v7 ? "/?ui=v7" : "/") + "#BANK_QK12");
    await booted(page);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), v7, "the ui-v7 flag did not land");

    await page.evaluate(() => { location.hash = "#CALC1_K06"; });
    await opened(page, CODES[5]);
    await page.click("#qlistBtn");
    await listOpen(page);
    await page.focus("#code");
    await page.fill("#code", "CALC1_K0");
    await page.waitForSelector("#codeSug:not([hidden]) li[data-code]", { timeout: 4000 });

    const before = await probe(page);
    assert.equal(before.panelHidden, false);
    assert.ok(before.panelScroll > 0, `the list did not scroll to the current row (scrollTop ${before.panelScroll})`);
    assert.ok(before.rowVis && before.rowVis.top >= before.panelTop - 1 && before.rowVis.bottom <= before.panelBottom + 1,
      `the current row is not in view before the keyboard (row ${JSON.stringify(before.rowVis)}, panel ${before.panelTop}..${before.panelBottom})`);

    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForFunction(() => document.documentElement.classList.contains("kbup"), null, { timeout: 5000 });
    const up = await probe(page);
    assert.ok(up.kbup, `the keyboard-up detection did not fire (html class: ${up.cls})`);
    assert.ok(up.rows.h === 0 || up.rows.visibility === "hidden" || up.rows.display === "none",
      `the rows are still shown with the keyboard up (${up.rows.h}px, visibility ${up.rows.visibility}; html class: ${up.cls})`);
    assert.equal(up.code.visibility, "visible", "the code box is hidden");
    assert.ok(up.code.w > 0 && up.code.h > 0, "the code box has no size");
    assert.equal(up.code.focus, true, "the code box lost focus");
    assert.equal(up.qlOpen, true, "the list closed");
    assert.equal(up.panelHidden, false, "the panel hid itself");
    assert.equal(up.sug.hidden, false, "the code suggestions hid");
    assert.ok(up.sug.n > 0 && up.sug.h > 0 && up.sug.visibility === "visible", "the code suggestions are not visible");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.documentElement.classList.contains("kbup"), null, { timeout: 5000 });
    const down = await probe(page);
    assert.ok(down.rows.h > 0 && down.rows.visibility === "visible" && down.rows.display !== "none",
      `the rows did not come back (${down.rows.h}px, visibility ${down.rows.visibility})`);
    assert.equal(down.panelScroll, before.panelScroll, "the list lost its scroll position");
    assert.ok(down.rowVis && down.rowVis.top >= down.panelTop - 1 && down.rowVis.bottom <= down.panelBottom + 1,
      "the current row is not in view after the keyboard went down");

    /* the keyboard up for another field while the list is closed: the list stays shut, ql-open stays off */
    await page.$eval("#qlistBtn", b => b.click());                              // close (the v7 dock can lie over the button: no hit test)
    await page.waitForFunction(() => document.querySelector("#qlist").hidden, null, { timeout: 5000 });
    await page.evaluate(() => document.querySelector("#ans").focus());
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForFunction(() => document.documentElement.classList.contains("kbup"), null, { timeout: 5000 });
    const shut = await page.evaluate(() => ({ hidden: document.querySelector("#qlist").hidden, open: document.documentElement.classList.contains("ql-open") }));
    assert.equal(shut.hidden, true, "the list opened with the keyboard up for another field");
    assert.equal(shut.open, false, "ql-open came on with the list closed");
    await page.setViewportSize({ width: 390, height: 844 });
  } finally { await ctx.close(); }
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/#BANK_QK12");
    await booted(page);
    await page.evaluate(() => { location.hash = "#CALC1_K06"; });
    await opened(page, CODES[5]);
    await page.click("#qlistBtn");
    await listOpen(page);
    await page.focus("#code");
    await page.fill("#code", "CALC1_K0");
    await page.waitForSelector("#codeSug:not([hidden]) li[data-code]", { timeout: 4000 });
    await page.setViewportSize({ width: 1280, height: 500 });                   // a short window: still no phone dock, no hide
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const s = await probe(page);
    assert.equal(s.dockBottom, false, "the desktop took the phone dock");
    assert.ok(s.rows.h > 0 && s.rows.visibility === "visible" && s.rows.display !== "none",
      `the desktop rows hid with a short window (${s.rows.h}px, visibility ${s.rows.visibility})`);
    assert.equal(s.qlOpen, true, "the desktop list closed");
  } finally { await ctx.close(); }
}

const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
try {
  await step("phone 390x844, ?ui=v7: rows hide with the keyboard up, code box + suggestions stay, rows return at the same scroll", () => phone(browser, true));
  await step("phone 390x844, flag off: same", () => phone(browser, false));
  await step("desktop 1280x800: a short window does not hide the rows", () => desktop(browser));
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
