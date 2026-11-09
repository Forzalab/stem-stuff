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
const srv = spawn("python3", ["serve.py", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise(ok => setTimeout(ok, 1500));
let fail = 0;
const b = await pw.chromium.launch();
try {
  const c = await b.newContext({ ...pw.devices["Pixel 7"], viewport: { width: 412, height: 860 } });
  const p = await c.newPage();
  await p.goto(`http://localhost:${PORT}/#PSY_8PA`); await p.waitForSelector("html.proof-split #q .ans");
  await p.waitForTimeout(800);
  const tileDown = await p.evaluate(() => document.querySelector("#problem").clientHeight);
  await p.tap("#q .ans"); await p.waitForTimeout(200);
  await p.setViewportSize({ width: 412, height: 430 }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const pr = document.querySelector("#problem"), a = document.querySelector("#q .ans");
    return { sh: pr.scrollHeight, ch: pr.clientHeight, box: Math.round(a.getBoundingClientRect().height), kb: document.documentElement.classList.contains("kbup") }; });
  const ok = r.kb && r.sh <= r.ch + 1 && r.box >= 64;
  console.log(`${ok ? "ok  " : "FAIL"} keyboard up: question whole (scrollHeight ${r.sh} <= clientHeight ${r.ch}), proof box ${r.box}px >= 64`);
  if (!ok) fail++;
  await p.setViewportSize({ width: 412, height: 860 }); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(800);
  const back = await p.evaluate(() => document.querySelector("#problem").clientHeight);
  const ok2 = Math.abs(back - tileDown) <= 1;
  console.log(`${ok2 ? "ok  " : "FAIL"} keyboard down: tile back to its hug (${back} vs ${tileDown})`);
  if (!ok2) fail++;
} finally { await b.close(); srv.kill(); }
process.exit(fail ? 1 : 0);
