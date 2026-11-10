// Proof item, phone keyboard up (Tony, Nov 8, PSY_8PA on Android Chrome): the question must be readable whole while typing, not
// clipped to 1/3 of the short screen over an empty proof box. Keyboard = the viewport shrinking after the box takes focus
// (index.html interactive-widget=resizes-content). Starts its own serve.py on the repo banks.   node tests/proof-kb.pw.mjs [port]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8879);
const srv = spawn("python3", ["server/serve.py", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise(ok => setTimeout(ok, 1500));
let fail = 0;
const b = await pw.chromium.launch();
try {
  const c = await b.newContext({ ...pw.devices["Pixel 7"], viewport: { width: 412, height: 860 } });
  const p = await c.newPage();
  await p.goto(`http://localhost:${PORT}/#PSY_8PA`); await p.waitForSelector("html.proof-split #q .ans");
  await p.waitForTimeout(800);
  const bar = () => p.evaluate(() => { const h = document.documentElement, t = document.querySelector("#barTab"), r = t && t.getClientRects().length && getComputedStyle(t).visibility !== "hidden" && !h.classList.contains("dock-away") ? t.getBoundingClientRect() : null;   // phones: the bar is the bottom dock, its tab opens it
    return { mt: h.classList.contains("mt"), bar: !!r && r.height > 0 && r.bottom > 0 && r.top < innerHeight }; });
  const b0 = await bar();
  const ok0 = !b0.mt && b0.bar;
  console.log(`${ok0 ? "ok  " : "FAIL"} not typing: the proof screen (no split, bar on screen) ${JSON.stringify(b0)}`);
  if (!ok0) fail++;
  await p.tap("#q .ans"); await p.waitForTimeout(300);
  const tileDown = await p.evaluate(() => document.querySelector("#problem").clientHeight);
  if (!(await bar()).mt) { console.log("FAIL focus in the proof box: the split opens"); fail++; }
  await p.setViewportSize({ width: 412, height: 430 }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const pr = document.querySelector("#problem"), a = document.querySelector("#q .ans");
    return { sh: pr.scrollHeight, ch: pr.clientHeight, box: Math.round(a.getBoundingClientRect().height), kb: document.documentElement.classList.contains("kbup") }; });
  const ok = r.kb && r.sh <= r.ch + 1 && r.box >= 64;
  console.log(`${ok ? "ok  " : "FAIL"} keyboard up: question whole (scrollHeight ${r.sh} <= clientHeight ${r.ch}), proof box ${r.box}px >= 64`);
  if (!ok) fail++;
  await p.setViewportSize({ width: 412, height: 860 }); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(800);
  const b2 = await bar();
  const ok2 = !b2.mt && b2.bar;
  console.log(`${ok2 ? "ok  " : "FAIL"} blur: back to the proof screen (no split, bar on screen) ${JSON.stringify(b2)}`);
  if (!ok2) fail++;
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/proof-blur.png" : "/dev/null" }).catch(() => {});
  /* a short-answer item (text): focus + keyboard leave the layout alone (no swap / split restyle; Tony, Nov 8) */
  await p.goto(`http://localhost:${PORT}/#PSY_8AA`); await p.waitForSelector("#q .ans"); await p.waitForTimeout(800);
  const pos = () => p.evaluate(() => { const y = e => Math.round(document.querySelector(e).getBoundingClientRect().top + scrollY);
    const h = document.documentElement.classList; return { prob: y("#problem"), ans: y("#q .ans"), swap: h.contains("swap"), mt: h.contains("mt") }; });
  const t0 = await pos();
  await p.tap("#q .ans"); await p.waitForTimeout(200);
  await p.setViewportSize({ width: 412, height: 430 }); await p.waitForTimeout(800);
  const t1 = await pos();
  const ok3 = !t1.swap && !t1.mt && t1.prob === t0.prob && t1.ans === t0.ans;
  console.log(`${ok3 ? "ok  " : "FAIL"} text item, keyboard up: layout unchanged ${JSON.stringify({ before: t0, up: t1 })}`);
  if (!ok3) fail++;
} finally { await b.close(); srv.kill(); }
process.exit(fail ? 1 : 0);
