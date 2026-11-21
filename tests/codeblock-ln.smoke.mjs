// CB-LN-SMALL + WRAP-TOGGLE smoke (Tony Nov 17), phone 390x844, own serve.py:  node tests/codeblock-ln.smoke.mjs [port]
// (a) v7 phone: every .l::before = its line number, 9px. (b) the number shares the code baseline. (c) Wrap = Lucide icon + label, aria-pressed toggles, 44px hit box. (d) flag off: no numbers on phones.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8841), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "cb-ln-")), "tries.json");
const CODE = ["#include <iostream>", "int main() {", "  int total = 0;", "  for (int i = 0; i < 5; i++) {", "    total += i * 2;", "  }", "  std::cout << total << std::endl;", "  return 0;", "}"].join("\n");
const FILE = { v: 1, problems: [{ code: "CSCI26_U01", type: "mc", pick: "one", shuffle: false,
  body: [{ type: "text", md: "What does this print?\n\n```cpp\n" + CODE + "\n```" }], choices: ["20", "10"].map((md, i) => ({ id: "ab"[i], md })), correct: ["a"], miss: "QUACK. miss", wrong: [{ choice: "b", error: "misread", hint: "QUACK. b" }] }] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
process.on("exit", () => srv.kill());
await serverUp(BASE);
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 500)); } }
async function fresh(ui) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ln.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForSelector("#blocks .cb .l", { timeout: 8000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
try {
  const v7 = await fresh(true);
  await step("a: v7 phone, each .l::before = its number, 9px", async () => {
    const r = await v7.page.$$eval("#blocks .cb .l", ls => ls.map(l => { const s = getComputedStyle(l, "::before"); return [s.content, s.fontSize]; }));
    assert.equal(r.length, 9);
    r.forEach(([c, f], i) => { assert.equal(c, "counter(ln)", `line ${i + 1} content`); assert.equal(f, "9px", `line ${i + 1} font-size`); });
  });
  /* (b) method: a ::before has no Range, so two checks. (1) CSS: it is an inline-block, vertical-align baseline, in the line's own box (static), line-height = font-size, so the
     browser baseline-aligns it with the code text, and the row does not grow. (2) PIXELS: screenshot line 1 ("#include <iostream>": no descenders in "include <iostream>"), then
     find the lowest ink row of the digit column and of the code column (decoded in-page from the PNG): they must differ by <= 1 css px (2 device px). */
  await step("b: line 1 number baseline == code baseline within 1px", async () => {
    const m = await v7.page.evaluate(() => { const l = document.querySelector("#blocks .cb .l"), s = getComputedStyle(l, "::before"); return { d: s.display, va: s.verticalAlign, pos: s.position, lh: s.lineHeight, h: l.getBoundingClientRect().height }; });
    assert.deepEqual([m.d, m.va, m.pos, m.lh], ["inline-block", "baseline", "static", "9px"]);
    assert.ok(m.h < 24, `row height ${m.h}`);
    const box = await v7.page.evaluate(() => { const l = document.querySelector("#blocks .cb .l"), r = l.getBoundingClientRect(), cb = l.closest(".cb").getBoundingClientRect(), pad = parseFloat(getComputedStyle(l).paddingLeft), g = document.createRange(); g.selectNodeContents(l); const tr = Math.max(...[...g.getClientRects()].map(q => q.right)); return { x: cb.left, y: r.top, w: r.width, h: r.height, gut: pad, txt: tr - cb.left }; });   // txt: the code text's right edge (the scan must stop there: the box edge / fade band right of it is not ink, seen since #690)
    const png = await v7.page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
    const rows = await v7.page.evaluate(async ({ b64, gut, txt, cbx }) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, bg = [d[0], d[1], d[2]];
      const low = (x0, x1) => { let lo = -1; for (let y = 0; y < c.height; y++) for (let X = x0; X < x1; X++) { const k = (y * c.width + X) * 4; if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 90) { lo = y; break; } } return lo; };
      return { num: low(0, Math.round((gut - 4) * 2)), code: low(Math.round(gut * 2), Math.min(c.width, Math.round(txt * 2))) };
    }, { b64: png.toString("base64"), gut: box.gut, txt: box.txt, cbx: 0 });
    assert.ok(rows.num > 0 && rows.code > 0, `no ink found ${JSON.stringify(rows)}`);
    assert.ok(Math.abs(rows.num - rows.code) <= 2, `lowest ink row: number ${rows.num} vs code ${rows.code} (device px)`);
  });
  await step("c: Wrap = i-wrap icon + label, aria-pressed toggles, >=44px hit area", async () => {
    const w = v7.page.locator("#blocks .cb-wrap");
    assert.equal(await w.locator('svg use[href="#i-wrap"]').count(), 1);
    assert.match(await w.textContent(), /Wrap/);
    assert.equal(await w.getAttribute("aria-pressed"), "false");
    const hit = await w.evaluate(b => { const a = getComputedStyle(b, "::after"), r = b.getBoundingClientRect(); return { h: r.height + Math.abs(parseFloat(a.top)) * 0 + (parseFloat(a.height)), vis: r.height, ah: parseFloat(a.height), br: getComputedStyle(b).borderRadius, gap: getComputedStyle(b).columnGap }; });
    assert.ok(hit.ah >= 44, `::after hit height ${hit.ah}`); assert.equal(hit.vis, 32); assert.equal(hit.br, "6px"); assert.equal(hit.gap, "6px");
    await w.click(); assert.equal(await w.getAttribute("aria-pressed"), "true");
    await w.click(); assert.equal(await w.getAttribute("aria-pressed"), "false");
  });
  await v7.ctx.close();
  await step("d: without ui-v7 the phone shows no numbers", async () => {
    const { ctx, page } = await fresh(false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), false);
    assert.equal(await page.$eval("#blocks .cb .l", l => getComputedStyle(l, "::before").content), "none");
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : "all ok"); process.exit(fails ? 1 : 0);
