// GHOST-G3-GLASS smoke (Tony Nov 23): glass under the ghost numeral on the v7 question card. Loads a card at 390 and 1280, hides the text,
// screenshots the card, and takes the WORST WCAG ratio of the text colour against every background pixel inside the text-line boxes that cross the numeral (>= 4.5 required).
// Also checks the numeral is a glass layer (filter on, scrim present) and that flag off leaves no glass. Own serve.py, uploaded bank.
//   node tests/ghost-glass.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8851), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "ghostglass-")), "tries.json");
const Q = "A 0.45 kg stone is thrown horizontally at 12 m/s from the edge of a 38 m cliff above a calm lake. Treat the air as still for the first part, then switch on a linear drag force of magnitude b v with b = 0.08 kg/s, and keep the lake surface as the zero of height. The stone leaves the hand 1.6 m above the cliff edge. How far from the base of the cliff does the stone land, and by how much does the drag shorten that range compared with the drag-free flight?";
const FILE = { v: 1, problems: [{ code: "PSY_G12", type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md: Q }] }] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
const browser = await launchBrowser(pw);
let fails = 0;
const lum = c => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
async function fresh(ui, vp) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "gg.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_G12" && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
  await settled(page); await page.waitForTimeout(400);
  return { ctx, page };
}
async function measure(vp) {
  const { ctx, page } = await fresh(true, vp);
  const info = await page.evaluate(() => {
    const p = document.getElementById("problem"), num = p.querySelector(".qghost i:nth-child(2)"), pr = p.getBoundingClientRect();
    const st = getComputedStyle(num), nr = num.getBoundingClientRect(), rows = [];
    p.querySelectorAll(".qhead, .qsetup, .qlead").forEach(e => { const rg = document.createRange(); rg.selectNodeContents(e);
      for (const q of rg.getClientRects()) if (q.width > 2 && q.right > nr.left && q.left < nr.right && q.bottom > nr.top && q.top < nr.bottom) rows.push({ x: q.left - pr.left, y: q.top - pr.top, w: q.width, h: q.height, ink: getComputedStyle(e).color }); });
    return { filter: st.filter, scrim: !!p.querySelector(":scope > .qscrim i"), box: { x: pr.left, y: pr.top, w: pr.width, h: pr.height }, rows };
  });
  assert.ok(info.filter.includes("qg-glass"), "numeral has the glass filter: " + info.filter);
  assert.ok(info.scrim, "scrim pills exist");
  assert.ok(info.rows.length, "some text line crosses the numeral");
  await page.addStyleTag({ content: "#problem .blocks, #problem .blocks * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; } #problem > button { visibility: hidden !important; }" });
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ clip: { x: info.box.x, y: info.box.y, width: info.box.w, height: info.box.h } });
  const px = await page.evaluate(async ({ b64, rows }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    let worst = 99, inkWorst = null;
    for (const r of rows) {
      const d = x.getImageData(Math.max(0, r.x | 0), Math.max(0, r.y | 0), Math.max(1, Math.min(r.w | 0, c.width - (r.x | 0))), Math.max(1, r.h | 0)).data, m = r.ink.match(/\d+/g).map(Number);
      const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4, L = k => .2126 * f(k[0]) + .7152 * f(k[1]) + .0722 * f(k[2]), lt = L(m);
      let maxL = 0; for (let i = 0; i < d.length; i += 4) maxL = Math.max(maxL, L([d[i], d[i + 1], d[i + 2]]));
      const ratio = (lt + .05) / (maxL + .05); if (ratio < worst) { worst = ratio; inkWorst = r.ink; }
    }
    return { worst, inkWorst, rows: rows.length };
  }, { b64: shot.toString("base64"), rows: info.rows });
  await ctx.close(); return px;
}
async function step(name, fn) { try { const v = await fn(); console.log("ok  ", name, v ?? ""); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
for (const w of [390, 1280]) await step(`contrast at ${w} (text on numeral, worst pixel >= 4.5)`, async () => {
  const r = await measure({ width: w, height: w < 500 ? 844 : 800 });
  console.log(`     ${w}px: worst contrast ${r.worst.toFixed(2)}:1 over ${r.rows} lines crossing the numeral (ink ${r.inkWorst})`);
  assert.ok(r.worst >= 4.5, `contrast ${r.worst.toFixed(2)} < 4.5`);
});
await step("flag off: no glass", async () => {
  const { ctx, page } = await fresh(false, { width: 390, height: 844 });
  assert.equal(await page.evaluate(() => !!document.querySelector(".qscrim, #qg-glass")), false); await ctx.close();
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "ghost-glass smoke: all ok"); process.exit(fails ? 1 : 0);
