// BRAINROT-DOCK-SCROLL smoke (Tony, approved; html.ui-v7, desktop + tablet only). The bento dock is a window 40% of the notes column tall; the mosaic
// inside it is a torus: wheel moves it and going past an edge shows the opposite one. Checks: at 1366x768 the dock is <= 40% of the column and Cluck's
// header + ask field are on screen; a wheel of one block height + 60px wraps (a tile's screen y lands where the wrap says, and the page does not
// scroll); flag off keeps the old scroller. Own serve.py + a one-problem sugar bank; YouTube is a blank stub (no request leaves).
// usage: node tests/brainrot-torus.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8885), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "brainrot-torus-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const Q = "PHYS_DA1";
writeFileSync(join(BANKS, "BANK_DSK.json"), JSON.stringify({ v: 1, problems: [{ code: Q, type: "num", answer: "3", body: [{ type: "text", md: "What is 1 + 2?" }], noob: { tier: 1 }, saccharine: { title: "Sum", tip: "Add.", key: "$1+2$\nAnswer: 3" } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DSK", STEM_FRONT_TITLE: "Exam", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(vp, flag) {
  const c = await b.newContext({ viewport: vp, serviceWorkers: "block", reducedMotion: "no-preference" });
  await c.route(/youtube|ytimg|googlevideo/, r => r.fulfill({ contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#234'></body>" }));
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-welcome-BANK_DSK", "1"); if (f) localStorage.setItem("stem-ui", "v7");
    for (const k of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + k, "9"); } catch { /* */ } }, flag);
  const page = await c.newPage();
  await page.goto(BASE + "/#" + Q); await page.waitForSelector("#ans", { timeout: 10000 }); await page.waitForTimeout(1500);
  return { c, page };
}
const box = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
try {
  await step("v7 desktop 1366x768: the dock is <= 40% of the notes column; Cluck's header and ask field are on screen", async () => {
    const { c, page } = await open({ width: 1366, height: 768 }, true);
    await page.waitForSelector("#rot.docked .vid");
    const shelf = await box(page, "#rot .shelf"), col = await box(page, "#work"), ask = await box(page, "#work .cl-ft .ask"), cl = await box(page, "#work .cl");
    assert.ok(shelf.h <= 0.4 * col.h + 1, `dock ${shelf.h}px is more than 40% of the column ${col.h}px`);
    assert.ok(shelf.h >= 180 - 1, `dock ${shelf.h}px under its 180px floor`);
    assert.ok(cl.y >= shelf.b - 1, "the Cluck sheet starts under the dock");
    assert.ok(cl.y >= 0 && ask.y >= 0 && ask.b <= 768, `Cluck header and ask field on screen: sheet top ${cl.y}, ask ${ask.y}..${ask.b}`);
    assert.ok(await page.$eval("#work .cl-ft .ask", e => { const r = e.getBoundingClientRect(); const f = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!f && (f === e || e.contains(f)); }), "the ask field is not covered");
    await c.close();
  });
  await step("v7 desktop 1366x768: a wheel of one block height + 60px wraps: the tile lands where the wrap says, and the page does not scroll", async () => {
    const { c, page } = await open({ width: 1366, height: 768 }, true);
    await page.waitForSelector("#rot.docked .vid");
    const pick = await page.evaluate(() => {
      const shelf = document.querySelector("#rot .shelf").getBoundingClientRect(), duo = document.querySelector("#rot .duo:not(.dupe)").getBoundingClientRect();
      const t = [...document.querySelectorAll("#rot .duo:not(.dupe) .vid")].map(v => ({ k: +v.dataset.k, rel: v.getBoundingClientRect().top - duo.top })).find(v => v.rel >= 60 && v.rel + 40 < shelf.height);
      return t ? { k: t.k, rel: t.rel, H: duo.height, top: shelf.top, cx: shelf.left + shelf.width / 2, cy: shelf.top + shelf.height / 2 } : null;
    });
    assert.ok(pick, "a tile sits in the window, 60px below the block's top");
    await page.mouse.move(pick.cx, pick.cy);
    await page.mouse.wheel(0, pick.H + 60); await page.waitForTimeout(150);
    const ys = await page.$$eval(`#rot .vid[data-k="${pick.k}"]`, vs => vs.map(v => v.getBoundingClientRect().top));
    const want = pick.top + (((pick.rel - 60) % pick.H) + pick.H) % pick.H;
    assert.ok(ys.some(y => Math.abs(y - want) < 1.5), `no copy of tile ${pick.k} at ${want.toFixed(1)} (copies at ${ys.map(y => y.toFixed(1)).join(", ")})`);
    assert.equal(await page.evaluate(() => scrollY), 0, "the page did not scroll");
    await c.close();
  });
  await step("v7 desktop 1366x768: a wheel to the right past the block's width wraps too (the tile comes back from the other side)", async () => {
    const { c, page } = await open({ width: 1366, height: 768 }, true);
    await page.waitForSelector("#rot.docked .vid");
    const pick = await page.evaluate(() => {
      const shelf = document.querySelector("#rot .shelf").getBoundingClientRect(), duo = document.querySelector("#rot .duo:not(.dupe)").getBoundingClientRect();
      const t = [...document.querySelectorAll("#rot .duo:not(.dupe) .vid")].map(v => ({ k: +v.dataset.k, rel: v.getBoundingClientRect().left - duo.left })).find(v => v.rel >= 60 && v.rel + 40 < shelf.width);
      return t ? { k: t.k, rel: t.rel, W: duo.width, left: shelf.left, cx: shelf.left + shelf.width / 2, cy: shelf.top + shelf.height / 2 } : null;
    });
    assert.ok(pick, "a tile sits in the window, 60px in from the block's left");
    await page.mouse.move(pick.cx, pick.cy);
    await page.mouse.wheel(pick.W + 60, 0); await page.waitForTimeout(150);
    const xs = await page.$$eval(`#rot .vid[data-k="${pick.k}"]`, vs => vs.map(v => v.getBoundingClientRect().left));
    const want = pick.left + (((pick.rel - 60) % pick.W) + pick.W) % pick.W;
    assert.ok(xs.some(x => Math.abs(x - want) < 1.5), `no copy of tile ${pick.k} at ${want.toFixed(1)} (copies at ${xs.map(x => x.toFixed(1)).join(", ")})`);
    await c.close();
  });
  await step("flag off, desktop 1366x768: no torus (no copies, no window); the dock is the old sideways scroller", async () => {
    const { c, page } = await open({ width: 1366, height: 768 }, false);
    await page.waitForSelector("#rot.docked .duo");
    const st = await page.evaluate(() => ({ dupes: document.querySelectorAll("#rot .dupe").length, world: getComputedStyle(document.querySelector("#rot .world")).display,
      ox: getComputedStyle(document.querySelector("#rot .duo")).overflowX, shelfH: document.querySelector("#rot .shelf").getBoundingClientRect().height }));
    assert.deepEqual([st.dupes, st.world, st.ox], [0, "contents", "auto"], JSON.stringify(st));
    await c.close();
  });
} finally { await b.close(); srv.kill(); }
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log("ALL OK");
