// Frames + short video of the splash mockup: node tools/splash_shots.mjs [page] [outDir]
//   page defaults to design/mockups/splash.html; frames are frozen with document.getAnimations() so they are exact.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const page0 = path.resolve(process.argv[2] || "design/mockups/splash.html");
const out = path.resolve(process.argv[3] || "design/shots");
const url = /^https?:/.test(process.argv[2] || "") ? process.argv[2] : pathToFileURL(page0).href;
mkdirSync(out, { recursive: true });
const FRAMES = [["f1", 120], ["f2", 300], ["f3", 700], ["f4", 1850]];   // ms into the 2200 ms loop

async function freeze(page, ms) {
  await page.evaluate(t => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
  await page.waitForTimeout(60);
}
const browser = await pw.chromium.launch();
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await p.goto(url);
  for (const [n, ms] of FRAMES) { await freeze(p, ms); await p.screenshot({ path: `${out}/splash-mock-${n}-390.png` }); }
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage(); await p.goto(url); await freeze(p, 900);
  await p.screenshot({ path: `${out}/splash-mock-1920.png` }); await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const p = await ctx.newPage(); await p.goto(url);
  console.log("reduced-motion animations:", await p.evaluate(() => document.getAnimations().length));
  await p.screenshot({ path: `${out}/splash-mock-static-390.png` }); await ctx.close();
}
{
  const tmp = path.join(out, ".vid"); rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: tmp, size: { width: 390, height: 844 } } });
  const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(4600); await ctx.close();
  renameSync(path.join(tmp, readdirSync(tmp)[0]), `${out}/splash-mock.webm`); rmSync(tmp, { recursive: true });
}
await browser.close();
