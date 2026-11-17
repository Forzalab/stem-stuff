// Wide content in a question stem (9-col table, 12-col pmatrix display math) scrolls inside its own box (ui-v7 G4.3):
// content wider than the box, the page never scrolls sideways, the box is scrollable + keyboard-focusable.
// Starts its own serve.py:   node tests/wide-content.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: wait on state, not time
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8874), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "wc-"));
const BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const table = "| a | b | c | d | e | f | g | h | i |\n|---|---|---|---|---|---|---|---|---|\n" +
  [0, 1, 2, 3].map(r => "| " + [...Array(9).keys()].map(c => `${r * 9 + c}.00000000`).join(" | ") + " |").join("\n");
const nums = [...Array(30).keys()].map(i => (i + 1) * 1111).join("&");
const pm = String.raw`$$A=\begin{pmatrix}${nums}\\${"0&".repeat(29)}1\end{pmatrix}$$`;
const P = [["WC1_1A5A", "Read the table:\n\n" + table + "\n\nWhich number is in row 3?"], ["WC1_1A6A", "Consider\n\n" + pm + "\n\nWhat is the rank?"]]
  .map(([code, md]) => ({ code, title: code, type: "text", body: [{ type: "text", md }], how: "Type it.", answer: "2", accept: [], nudge: "x" }));
writeFileSync(join(BANKS, "BANK_WC1.json"), JSON.stringify({ v: 20261114, problems: P }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);

/* in the page: the nearest ancestor-or-self that scrolls sideways and has more content than box */
const measure = sel => {
  const el = document.querySelector(sel);
  if (!el) return { err: "no " + sel };
  let box = null;
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1) { box = e; break; }
  }
  const vw = document.documentElement.clientWidth;
  const wide = el.scrollWidth > (box ? box.clientWidth : el.clientWidth) + 1;
  const r = { box: !!box, wide, hScroll: document.documentElement.scrollWidth - vw, focus: !!box && box.tabIndex === 0 };
  if (box) { box.scrollLeft = 10; r.canScroll = box.scrollLeft > 0; }
  return r;
};
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
let bad = 0;
try {
  for (const width of [360, 1366]) {
    for (const [code, sel] of [["WC1_1A5A", ".md table"], ["WC1_1A6A", ".md .katex-display > .katex"]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block", isMobile: width < 700, hasTouch: width < 700 });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`); await page.waitForSelector("#code");
      await page.fill("#code", "BANK_WC1"); await page.press("#code", "Enter");
      await page.waitForFunction(() => document.querySelectorAll("#qlist a").length >= 2, null, { timeout: 8000 });   // the bank's 2 questions listed
      if (await page.isHidden("#qlist")) await page.click("#qlistBtn").catch(() => {});
      await page.locator("#qlist a").nth(code.endsWith("5A") ? 0 : 1).click();
      await page.waitForSelector(".md table, .md .katex-display", { state: "attached", timeout: 8000 });
      await page.evaluate(() => document.fonts.ready); await settled(page, sel);
      const m = await page.evaluate(measure, sel);
      const ok = !m.err && m.box && m.wide && m.hScroll <= 0 && m.focus && m.canScroll;
      if (!ok) bad++;
      await ctx.close();
      console.log(`${ok ? "ok  " : "FAIL"} ${width}px ${code}: ${JSON.stringify(m)}`);
    }
  }
} finally { await browser.close(); srv.kill(); }
process.exit(bad ? 1 : 0);
