// preview-shots.mjs: pre-merge visual evidence of a private Vercel preview (ship.yml mode=demo, Tony Nov 27).
//   node tools/operations/preview-shots.mjs <url> <outdir> [--expect-sha <sha>]
// The preview sits behind Vercel Authentication: every request carries the "Protection Bypass for Automation" secret
// (env VERCEL_AUTOMATION_BYPASS_SECRET) as header x-vercel-protection-bypass (+ x-vercel-set-bypass-cookie for the browser).
// 1. GET <url>/version.json; with --expect-sha it must start with / be a prefix of that sha, else exit 1 (the deploy is not the ref).
// 2. Shots into <outdir>: 390 (dsf 2), 1440, 1920x1080 of home + an MC item (#CSCI26_N4C); desktop also the welcome ladder, answered
//    through its 4 answers (pick, fill, why, typed answer).
// 3. <outdir>/numbers.json: MC letter/first-line alignment (tests/lib/mc-ink.mjs measureTiles) per viewport, best effort.
// Any failed shot exits 1: a missing screenshot is missing evidence, not a partial pass.
// Pure parts (demoUrl, shaOk) are exported; smoke: tests/preview-shots.test.mjs. The secret is never printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The preview URL ship.sh printed ("demo ready: <url>" / "demo building (...): <url>"); the last one wins.
export function demoUrl(log) {
  const m = [...String(log).matchAll(/demo (?:ready|building[^:\n]*): (https:\/\/[a-z0-9.-]+\.vercel\.app)/g)];
  return m.length ? m[m.length - 1][1] : "";
}
// version.json sha is the short sha; the expected one may be full. Prefix either way, never empty.
export function shaOk(deployed, expected) {
  const a = String(deployed || "").trim().toLowerCase(), b = String(expected || "").trim().toLowerCase();
  return a.length >= 7 && b.length >= 7 && (b.startsWith(a) || a.startsWith(b));
}

const VIEWS = [
  { name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, desktop: false },
  { name: "1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, desktop: true },
  { name: "1920", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, desktop: true },
];
const MC = "CSCI26_N4C";

async function main() {
  const args = process.argv.slice(2), pos = [];
  let expect = "";
  for (let i = 0; i < args.length; i++) { if (args[i] === "--expect-sha") expect = args[++i] || ""; else pos.push(args[i]); }
  const [base0, out] = pos;
  if (!base0 || !out) { console.error("usage: preview-shots.mjs <url> <outdir> [--expect-sha <sha>]"); process.exit(2); }
  const base = base0.replace(/\/$/, ""), secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!secret) { console.error("preview-shots: VERCEL_AUTOMATION_BYPASS_SECRET is empty (add the repo secret: Vercel project > Deployment Protection > Protection Bypass for Automation)"); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const headers = { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" };

  const r = await fetch(base + "/version.json?t=" + Date.now(), { headers: { "x-vercel-protection-bypass": secret, "Cache-Control": "no-cache" } });
  const body = await r.text();
  let v = {}; try { v = JSON.parse(body); } catch { /* not JSON: a login wall */ }
  if (!r.ok || !v.sha) { console.error(`preview-shots: ${base}/version.json -> HTTP ${r.status}, no sha (bypass secret wrong, or the deploy is not up)`); process.exit(1); }
  const verdict = expect ? (shaOk(v.sha, expect) ? "MATCH" : "MISMATCH") : "UNCHECKED";
  const line = `deployed ${v.sha} (${v.pr || "?"}) expected ${expect || "-"}: ${verdict}`;
  writeFileSync(join(out, "sha-check.txt"), line + "\n"); console.log("sha check: " + line);
  if (verdict === "MISMATCH") { console.error(`::error::preview-shots: the preview serves ${v.sha}, not the requested ${expect}`); process.exit(1); }

  const require = createRequire(import.meta.url), here = dirname(fileURLToPath(import.meta.url));
  let pw; try { pw = require(join(here, "../../tests/node_modules/playwright")); } catch { pw = require("playwright"); }
  let measureTiles = null; try { ({ measureTiles } = await import(pathToFileURL(join(here, "../../tests/lib/mc-ink.mjs")).href)); } catch { /* optional */ }
  const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const numbers = {}, fails = [];
  try {
    for (const V of VIEWS) {
      const ctx = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, extraHTTPHeaders: headers });
      await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
        for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-ui", "v7"); } catch { /* */ } });
      const p = await ctx.newPage();
      const shot = async (what, fn) => {
        try { await fn(); await p.screenshot({ path: join(out, `${V.name}-${what}.png`) }); console.log("shot", V.name, what); return true; }
        catch (e) { fails.push(`${V.name}-${what}: ${e.message.split("\n")[0]}`); console.error("shot FAILED", V.name, what, e.message.split("\n")[0]); return false; }
      };
      await shot("home", async () => {
        await p.goto(base + "/", { waitUntil: "load" });
        await p.waitForFunction(() => !document.querySelector("#splash"), null, { timeout: 20000 }); await p.waitForTimeout(800);
      });
      const mcOk = await shot("mc-" + MC, async () => {
        await p.goto(base + "/#" + MC, { waitUntil: "load" });   // a bare #CODE opens the item (app.js fromHash); no bank route first
        await p.waitForFunction(() => !document.querySelector("#splash"), null, { timeout: 20000 });
        await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, MC, { timeout: 20000 });
        await p.waitForSelector("#q .choices .opt", { timeout: 20000 });
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
      });
      if (measureTiles && mcOk) { try { numbers[V.name] = await measureTiles(p); } catch (e) { numbers[V.name] = { error: e.message.split("\n")[0] }; } }
      if (V.desktop) await shot("welcome-ladder", async () => {
        await p.goto(base + "/client/labs/welcome-lab.html", { waitUntil: "load" });
        await p.evaluate(() => window.lab && window.lab());
        await p.waitForSelector('.rp-step[data-id="formula"][data-state="active"]', { timeout: 10000 });
        await p.click('.rp-step[data-id="formula"] .rp-val-opts .rp-chip[data-v="a"]');                                   // the right formula
        await p.click('.rp-step[data-id="plug"][data-state="active"] .rp-val-opts .rp-chip[data-v="×"]');                  // the right operator; the why keeps the step open
        await p.click('.rp-step[data-id="plug"] .rp-why .rp-chip[data-why="0"]');                                         // its why
        await p.fill('.rp-step[data-id="answer"][data-state="active"] .rp-in', "6");                                      // the typed answer
        await p.click('.rp-step[data-id="answer"] .rp-check');
        await p.waitForFunction(() => [...document.querySelectorAll(".rp-step")].every(s => s.dataset.state === "done"), null, { timeout: 10000 });
        await p.waitForTimeout(400);
      });
      await ctx.close();
    }
  } finally { await browser.close(); }
  writeFileSync(join(out, "numbers.json"), JSON.stringify({ sha: v.sha, numbers, fails }, null, 1));
  if (fails.length) { console.error(`preview-shots: ${fails.length} shot(s) failed (see above); the rest are in ${out}`); process.exit(1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error("preview-shots:", e.message); process.exit(1); });
