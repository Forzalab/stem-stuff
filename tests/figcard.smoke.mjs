// FIG-CLEAR smoke (bug log 20261121): on the v7 question card a figure (graph block) must sit fully in its .fig box, above the title, at 390 and 1280.
// Red before: the Ask Cluck squircle floats top right, a block-level svg may not overlap a float, so the svg dropped 52 px below its .fig box (labels are absolute spans in .fig: they stayed up, the title overlapped the figure foot).
// Own serve.py, fixture tests/fixtures/BANK_FIGC.json (a cartesian and a scene figure).   node tests/figcard.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..");
const PORT = +(process.argv[2] || 8843), BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "figcard-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS); copyFileSync(join(HERE, "fixtures", "BANK_FIGC.json"), join(BANKS, "BANK_FIGC.json"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
process.on("exit", () => srv.kill());
await serverUp(BASE);
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 500)); } }
async function measure(w, h, code) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); } catch { /* none */ } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?ui=v7#${code}`);
  await page.waitForSelector("#problem .fig svg .lbl, #problem .fig .lbl", { timeout: 10000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const R = e => e.getBoundingClientRect(), f = document.querySelector("#problem .fig"), s = f.querySelector("svg"), fr = R(f), sr = R(s);
    const t = document.querySelector("#problem .qhead, #problem .ptitle");
    const out = [...f.querySelectorAll(".lbl")].filter(l => { const q = R(l), x = q.left + q.width / 2, y = q.top + q.height / 2; return x < sr.left - 2 || x > sr.right + 2 || y < sr.top - 2 || y > sr.bottom + 2; }).length;
    return { dy: sr.top - fr.top, svgBottom: sr.bottom, figBottom: fr.bottom, titleTop: t ? R(t).top : null, labels: f.querySelectorAll(".lbl").length, out };
  });
  await ctx.close();
  return r;
}
for (const [w, h] of [[390, 844], [1280, 800]]) for (const code of ["PHYS_FC1", "PHYS_FC2"]) {
  await step(`${code} @${w}: svg fills its .fig box, labels on it, title below the figure`, async () => {
    const r = await measure(w, h, code);
    assert.ok(r.labels > 0, "no labels drawn");
    assert.ok(Math.abs(r.dy) <= 1, `svg top is ${r.dy.toFixed(1)}px below its .fig box top (labels sit in the box)`);
    assert.ok(r.svgBottom <= r.figBottom + 1, `svg bottom ${r.svgBottom} past .fig bottom ${r.figBottom}`);
    assert.equal(r.out, 0, `${r.out} label(s) outside the svg`);
    assert.ok(r.titleTop === null || r.titleTop >= r.svgBottom - 1, `title top ${r.titleTop} is inside the figure (bottom ${r.svgBottom})`);
  });
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "figcard smoke: all ok");
process.exit(fails ? 1 : 0);
