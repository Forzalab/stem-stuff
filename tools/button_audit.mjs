// Capture step for tools/button_audit.py: screenshots of every button state + their boxes (CSS px, DPR 1).
//   node tools/button_audit.mjs http://localhost:8812 outdir
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const [BASE = "http://localhost:8812", OUT = "design/shots/buttons"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1400 }, deviceScaleFactor: 1 });
const rows = [];
async function open(code) {
  await page.goto("about:blank");
  await page.goto(`${BASE}/#${code}`, { waitUntil: "load" });
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 1399);   // no hover
  await page.waitForTimeout(300);
}
async function grab(shot, items) {
  const file = `${OUT}/${shot}.png`;
  const boxes = [];
  for (const [name, sel] of items) {
    const b = await page.evaluate(s => {
      const e = document.querySelector(s); if (!e || !e.offsetParent && getComputedStyle(e).position !== "fixed") return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e), ic = e.querySelector("svg");
      const ir = ic ? ic.getBoundingClientRect() : null;
      return { current: e.getAttribute("aria-current") === "true", x: r.x, y: r.y, w: r.width, h: r.height, css_radius: cs.borderTopLeftRadius, css_border: cs.borderTopWidth,
               icon_w: ir ? ir.width : null, icon_h: ir ? ir.height : null };
    }, sel);
    if (b) boxes.push({ name, sel, ...b });
    else console.error("missing", name, sel);
  }
  if (shot !== "menu") await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.mouse.move(0, 0); await page.waitForTimeout(120);
  await page.screenshot({ path: file });
  for (const b of boxes) rows.push({ shot: file, ...b });
}

await open("CALC1-X2P");
await page.click('.opt[data-id="b"]'); await page.mouse.move(0, 1399); await page.waitForTimeout(200);
await grab("main", [["upload", "#upload"], ["code go", "#codeGo"], ["download", ".so-dl"], ["MC arrow", '.ch[data-id="b"] .send'], ["copy", "#copy"]]);


await open("CALC1-T6B");
await page.fill("#ans", "12"); await page.mouse.move(0, 1399); await page.waitForTimeout(150);
await page.evaluate(() => document.activeElement.blur());
await grab("freeform", [["freeform arrow", "#ansGo"]]);

await page.setViewportSize({ width: 390, height: 600 });   // short screen so the problem clips and the chevron shows
await open("PHYS-S2K");
await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(300);
await grab("more", [["expand chevron", "#more"]]);

await page.evaluate(() => { window.stemOffline.openPicker("CALC1-ZZZ").catch(() => {}); });
await page.waitForTimeout(300); await page.mouse.move(0, 843);
await grab("picker", [["picker close", ".so-x"], ["picker file", ".so-btn.main"], ["picker folder", ".so-btn:not(.main)"]]);

writeFileSync(`${OUT}/boxes.json`, JSON.stringify(rows, null, 1));
await browser.close();
console.log(rows.length, "buttons");
