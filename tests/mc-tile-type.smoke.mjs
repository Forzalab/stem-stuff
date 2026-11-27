// MC tile type smoke (Tony Nov 27, phone shot): every single-choice tile answer wears the BODY weight (regular; #762 carried the old short-text bold into the flow tile) and the letter A/B/C sits on the same BASELINE as the first line of its answer (1-line and wrapped; 360 / 390 / 1280).  node tests/mc-tile-type.smoke.mjs [port]   (SHOTS=<dir> saves a shot per case)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { measureTiles } from "./lib/mc-ink.mjs";
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
for (const [w, h] of [[360, 780], [390, 844], [1280, 800]])
  for (const [code, what] of [["CALC1_AL3", "plain text, 7 options (one wraps)"], ["CALC1_AL4", "mixed text + math"], ["CALC1_AL5", "long text (wrapped tiles)"]])
    await step(`${w}x${h} ${what}: weight == body, letter ink centre == first-line ink centre (<= 1px)`, async () => {
      const p = await open(code, w, h);
      const res = await p.evaluate(() => {
        // a zero-size inline-block at the start of an element: its bottom edge is that line's baseline
        const base = el => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; el.insertBefore(s, el.firstChild); const y = s.getBoundingClientRect().bottom; s.remove(); return y; };
        const bodyW = getComputedStyle(document.body).fontWeight;
        return { bodyW, rows: [...document.querySelectorAll("#q .opt")].map(o => { const t = o.querySelector(".txt"), b = o.querySelector(".badge"), lh = parseFloat(getComputedStyle(t).lineHeight), tb = t.querySelector("p") || t;
          return { l: o.dataset.l, fw: getComputedStyle(t).fontWeight, fs: getComputedStyle(t).fontSize, lfs: getComputedStyle(b).fontSize, ff: getComputedStyle(b).fontFamily === getComputedStyle(t).fontFamily, lines: Math.round(t.getBoundingClientRect().height / lh), dy: +(base(b) - base(tb)).toFixed(2) }; }) };
      });
      // INK centres on pixels (Tony Nov 27: judge by eye + centred axis): the letter's ink vs the first line's ink (rows down to its baseline, so descenders do not drag the centre)
      for (const r of res.rows) {
        await p.evaluate(l => document.querySelector(`#q .opt[data-l="${l}"]`).scrollIntoView({ block: "center" }), r.l);
        const g = await p.evaluate(l => { const o = document.querySelector(`#q .opt[data-l="${l}"]`), t = o.querySelector(".txt"), b = o.querySelector(".badge"), tb = t.querySelector("p") || t;
          const s = document.createElement("span"); s.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; tb.insertBefore(s, tb.firstChild); const bl = s.getBoundingClientRect().bottom; s.remove();
          const R = o.getBoundingClientRect(), T = t.getBoundingClientRect(), B = b.getBoundingClientRect();
          return { x: R.x, y: R.y, w: R.width, h: R.height, bl: bl - R.y, tx0: T.left - R.x, tx1: T.right - R.x, ty0: T.top - R.y, bx0: B.left - R.x, bx1: B.right - R.x, by0: B.top - R.y, by1: B.bottom - R.y }; }, r.l);
        const b64 = (await p.screenshot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h } })).toString("base64");
        const px = await p.evaluate(async b64 => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
          const x = c.getContext("2d"); x.drawImage(im, 0, 0); return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; }, b64);
        const bg = px.d.slice(0, 3), on = (x, y) => { const i = (y * px.w + x) * 4; return Math.abs(px.d[i] - bg[0]) + Math.abs(px.d[i + 1] - bg[1]) + Math.abs(px.d[i + 2] - bg[2]) > 90; };
        const span = (x0, x1, y0, y1) => { let a = 1e9, z = -1; for (let y = Math.max(0, Math.floor(y0 * 2)); y < Math.min(px.h, Math.ceil(y1 * 2)); y++) for (let x = Math.floor(x0 * 2); x < Math.ceil(x1 * 2); x++) if (on(x, y)) { a = Math.min(a, y); z = Math.max(z, y + 1); } return z < 0 ? null : [a / 2, z / 2]; };
        const L = span(g.bx0, g.bx1, g.by0, g.by1), T = span(g.tx0, g.tx1, g.ty0, g.bl + 0.5);
        r.inkDy = L && T ? +(((L[0] + L[1]) / 2) - ((T[0] + T[1]) / 2)).toFixed(2) : null;
      }
      console.log("      body " + res.bodyW + " | " + res.rows.map(r => `${r.l}:${r.fw}/${r.fs}/letter ${r.lfs}/${r.lines}L/dy${r.dy}/ink${r.inkDy}`).join(" "));
      if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await p.evaluate(() => document.querySelector("#q .choices").scrollIntoView({ block: "center" })); await p.screenshot({ path: join(process.env.SHOTS, `${code}-${w}.png`) }); }
      await p.context().close();
      assert.ok(res.rows.every(r => r.fw === res.bodyW), "tile weight != body weight " + res.bodyW + ": " + JSON.stringify(res.rows.map(r => [r.l, r.fw])));
      assert.ok(res.rows.every(r => r.lfs === r.fs && r.ff), "letter must share the answer text size + family (same x-height / cap height): " + JSON.stringify(res.rows.map(r => [r.l, r.lfs, r.fs, r.ff])));
      assert.ok(res.rows.every(r => r.inkDy !== null && Math.abs(r.inkDy) <= 1 && Math.abs(r.dy) <= 1), "letter ink centre off the first-line ink centre by > 1px (or baseline > 1px): " + JSON.stringify(res.rows.filter(r => r.inkDy === null || Math.abs(r.inkDy) > 1 || Math.abs(r.dy) > 1)));
    });
// REAL items, every content kind (Tony Nov 27): text wrapped to 2+ lines, code (`.ch code`, #767), KaTeX numbers / symbols / fraction, mixed text + KaTeX. Pixel ink scan (tests/lib/mc-ink.mjs):
// words + code: letter ink centre == first-line cap-line ink centre (<= 1px); math: == the whole first-line ink centre (fraction, parens), exponents ignored. Weight == body everywhere.
const ITEMS = [["text, wrapped", "CSCI26_N4C"], ["code", "CSCI26_C2A"], ["code, 2 tiles", "CSCI26_CE25"], ["KaTeX + fraction", "CALC1_X2P"], ["KaTeX symbols", "CSCI26_D7N"], ["mixed text + KaTeX", "CSCI26_D4B"], ["text + KaTeX fraction", "CSCI26_N2A"]];
for (const [w, h] of [[390, 844], [1440, 900]])
  for (const [what, code] of ITEMS)
    await step(`${w}px real item ${code} (${what}): letter ink centre on the first line's ink centre (<= 1px), body weight`, async () => {
      const p = await open(code, w, h), rows = await measureTiles(p), bodyW = await p.evaluate(() => getComputedStyle(document.body).fontWeight);
      console.log("      " + rows.map(r => `${r.l}:${r.kind}/${r.lines}L cap${r.capDy} full${r.fullDy}`).join(" "));
      await p.context().close();
      assert.ok(rows.length >= 2, "no single-choice tiles measured");
      assert.ok(rows.every(r => r.fw === bodyW), "tile weight != body " + bodyW + ": " + JSON.stringify(rows.map(r => [r.l, r.fw])));
      const bad = rows.filter(r => !(r.capDy !== null && Math.abs(r.capDy) <= 1) && !(r.kind === "math" && r.fullDy !== null && Math.abs(r.fullDy) <= 1));
      assert.equal(bad.length, 0, "letter ink centre off the first-line ink centre by > 1px: " + JSON.stringify(bad));
    });
await browser.close(); srv.kill();
if (fails) { console.log(fails + " FAIL"); process.exit(1); }
console.log("all ok");
