// MC text alignment smoke (Tony, Nov 21: "centre in the whole tile"): under html.ui-v7 the INK of a tile's words sits at the tile's true vertical middle (|ink centre - tile centre| <= 3px, measured on pixels),
// the letter stays in its corner. Guard: a tile where centred words would crowd the letter moves its words down just enough: there the gap letter ink -> words ink must be >= 6px
// (vertically OR sideways) and the words stay inside the tile. Math, plain text (one line wraps), mixed text + math; 4 and 7 options; phone 390x844 (fill rows) + desktop 1280x800 (mosaic).
//   node tests/mc-align.smoke.mjs [port]      (SHOTS=<dir> saves one shot per case)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8848), BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "mcal-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
copyFileSync(join(ROOT, "tests", "fixtures", "BANK_MCAL.json"), join(BANKS, "BANK_MCAL.json"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
const browser = await launchBrowser(pw);
async function open(code, w, h) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-ui", "v7"); } catch { /* */ } });
  const p = await c.newPage();
  await p.goto(BASE + "/#BANK_MCAL");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 10000 });
  await p.evaluate(h => { location.hash = h; }, code);
  await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, code, { timeout: 8000 });
  await p.waitForSelector("#qnav:not([hidden])", { timeout: 10000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => !!document.querySelector("#q .choices")?.dataset.bento, null, { timeout: 5000 });
  await p.waitForFunction(() => !document.querySelector("#splash"), null, { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { for (const e of document.querySelectorAll("body *")) if (e.children.length === 0 && /Ready when you are/.test(e.textContent)) { let b = e; while (b && getComputedStyle(b).position !== "fixed") b = b.parentElement; if (b) b.style.visibility = "hidden"; } });   // the rewards banner floats over a tile
  return p;
}
// ink of one tile (pixels, css px from the tile top-left): the letter box, the words (everything else), the tile size
async function ink(p, l) {
  await p.evaluate(l => document.querySelector(`#q .opt[data-l="${l}"]`).scrollIntoView({ block: "center" }), l);
  const re = await p.evaluate(l => { const o = document.querySelector(`#q .opt[data-l="${l}"]`), r = o.getBoundingClientRect(), L = (o.querySelector(".lt") || o.querySelector(".badge")).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, lx: L.left - r.x, lw: L.width, lt: L.top - r.y, lb: L.bottom - r.y }; }, l);
  const b64 = (await p.screenshot({ clip: { x: re.x, y: re.y, width: re.w, height: re.h } })).toString("base64");
  const px = await p.evaluate(async b64 => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0); return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; }, b64);
  const bg = px.d.slice(0, 3), on = (x, y) => { const i = (y * px.w + x) * 4; return Math.abs(px.d[i] - bg[0]) + Math.abs(px.d[i + 1] - bg[1]) + Math.abs(px.d[i + 2] - bg[2]) > 90; };
  const lx0 = Math.floor(re.lx * 2) - 2, lx1 = Math.ceil((re.lx + re.lw) * 2) + 2, ly0 = Math.floor(re.lt * 2) - 2, ly1 = Math.ceil(re.lb * 2) + 2;
  const inL = (x, y) => x >= lx0 && x < lx1 && y >= ly0 && y < ly1;
  const L = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 }, T = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
  for (let y = 2; y < px.h - 2; y++) for (let x = 12; x < px.w - 12; x++) { if (!on(x, y)) continue; const B = inL(x, y) ? L : T; B.x0 = Math.min(B.x0, x); B.x1 = Math.max(B.x1, x + 1); B.y0 = Math.min(B.y0, y); B.y1 = Math.max(B.y1, y + 1); }
  const c = o => ({ x0: o.x0 / 2, x1: o.x1 / 2, y0: o.y0 / 2, y1: o.y1 / 2 });
  return { L: c(L), T: c(T), h: re.h, w: re.w };
}
for (const [w, h] of [[390, 844], [1280, 800]])
  for (const [code, what] of [["CALC1_AL1", "math, 4 options"], ["CALC1_AL2", "math, 7 options"], ["CALC1_AL3", "plain text, 7 options (one wraps)"], ["CALC1_AL4", "mixed text + math, 7 options"], ["CALC1_AL5", "long text, 7 options (3-line tiles)"]])
    await step(`${w}x${h} ${what}: words centred in the whole tile (ink, <= 3px) or clear of the letter (>= 6px)`, async () => {
      const p = await open(code, w, h), ls = await p.evaluate(() => [...document.querySelectorAll("#q .opt")].map(o => o.dataset.l)), rows = [];
      for (const l of ls) rows.push({ l, ...await ink(p, l) });
      const dist = (T, L) => Math.max(0, T.x0 - L.x1, L.x0 - T.x1, T.y0 - L.y1, L.y0 - T.y1);
      const res = rows.map(r => { const cen = (r.T.y0 + r.T.y1) / 2 - r.h / 2, gap = dist(r.T, r.L), centredGap = dist({ ...r.T, y0: r.T.y0 - cen, y1: r.T.y1 - cen }, r.L);
        return { l: r.l, cen: +cen.toFixed(1), gap: +gap.toFixed(1), centredGap: +centredGap.toFixed(1), inside: r.T.y0 >= 0 && r.T.y1 <= r.h && r.T.x0 >= 0 && r.T.x1 <= r.w, guarded: Math.abs(cen) > 3 }; });
      // bad: words outside the tile, or < 6px from the letter, or off the middle by > 3px although centring them would have cleared the letter (a guard that did not need to bite)
      const bad = res.filter(r => !r.inside || r.gap < 6 || (r.guarded && r.centredGap >= 7));
      console.log("      guard bites in: " + (res.filter(r => r.guarded).map(r => r.l + "(" + r.cen + "px, gap " + r.gap + ")").join(" ") || "none") + "  | worst centre " + Math.max(...res.filter(r => !r.guarded).map(r => Math.abs(r.cen))).toFixed(1));
      if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: join(process.env.SHOTS, `${code}-${w}.png`), fullPage: true }); }
      await p.context().close();
      assert.equal(bad.length, 0, "ink centre off the tile middle by > 3px without need, or words < 6px from the letter / outside the tile: " + JSON.stringify(bad));
    });
await browser.close(); srv.kill();
if (fails) { console.log(fails + " FAIL"); process.exit(1); }
console.log("all ok");
