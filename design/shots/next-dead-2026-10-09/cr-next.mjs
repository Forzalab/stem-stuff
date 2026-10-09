// Chromium 393x852 shots after pressing Next: node cr-next.mjs <appRoot> <banksDir> <outPrefix> <port>   (local serve.py only)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire("/home/user/wt-next-dead/tests/x.mjs");
const pw = require("playwright");
const [root, banks, pre, port] = process.argv.slice(2), BASE = `http://localhost:${port}`;
const srv = spawn("python3", [`${root}/serve.py`, port], { cwd: root, env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: `${banks}/../tries-cr-${port}.json`, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* */ } await new Promise(r => setTimeout(r, 100)); }
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
const num = (code, md) => ({ code, type: "num", answer: "2", body: [{ type: "text", md }] });
const mix = { name: "MIX.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems: [num("PHYS_M01", "Mix 1: 1 + 1"), num("BEAR_002", "Mix 2"), num("CSCI26_TOOLONG7", "Mix 3")] })) };
const ctx = async () => { const c = await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: "block", hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } }); return c.newPage(); };
const line = async (p, tag) => console.log(tag, JSON.stringify(await p.evaluate(() => ({ hash: location.hash, shown: document.querySelector("#pcode").textContent, toast: document.querySelector("#toast.on")?.textContent || "", msg: document.querySelector("#entryMsg").textContent, nextDisabled: document.querySelector("#qnext").disabled }))));
try {
  let p = await ctx();
  await p.goto(BASE + "/#BANK_P2X"); await p.waitForTimeout(1500);
  await p.goto(BASE + "/#PHYS_F3N"); await p.waitForTimeout(1500);
  await line(p, "out before-press"); await p.click("#qnext", { force: true, timeout: 2000 }).catch(() => {}); await p.waitForTimeout(500);
  await line(p, "out after-press"); await p.screenshot({ path: `${pre}-out.png` });
  p = await ctx();
  await p.goto(BASE + "/"); await p.waitForTimeout(800);
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#upload")]); await fc.setFiles(mix); await p.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) { await p.click("#qnext"); await p.waitForTimeout(500); await line(p, "mix press " + (i + 1)); }
  await p.screenshot({ path: `${pre}-mix.png` });
  p = await ctx();
  await p.goto(BASE + "/#BANK_ONE"); await p.waitForTimeout(1500);
  await p.click("#qnext"); await p.waitForTimeout(500); await line(p, "one press"); await p.screenshot({ path: `${pre}-one.png` });
} finally { await b.close(); srv.kill(); }
