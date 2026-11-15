// BRAINROT-B smoke (Tony, Nov 14: "go with bento style, the O one with the expand-jut-out button on mobile as video bkg"; phones SHOW it):
// html.ui-v7 only. Phone 390x844: a stashed 44x96 tab on the edge whose background is the live first player (clipped), tap = two 84x148 players with - / x
// ABOVE them; desktop 1366x768: no box, 5 players in view (one large + four small), a tap on a small one swaps it large; no borders on any of it.
// Flag off: a phone still gets none (the Oct 17 rule). Own serve.py + a one-problem sugar bank; YouTube is a blank stub (no request leaves).
// usage: node tests/brainrot-b.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8884), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "brainrot-b-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const Q = "PHYS_DA1";
writeFileSync(join(BANKS, "BANK_DSK.json"), JSON.stringify({ v: 1, problems: [{ code: Q, type: "num", answer: "3", body: [{ type: "text", md: "What is 1 + 2?" }], noob: { tier: 1 }, saccharine: { title: "Sum", tip: "Add.", key: "$1+2$\nAnswer: 3" } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DSK", STEM_FRONT_TITLE: "Exam", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(vp, flag, extra = {}) {
  const c = await b.newContext({ viewport: vp, serviceWorkers: "block", reducedMotion: "no-preference", ...extra });
  await c.route(/youtube|ytimg|googlevideo/, r => r.fulfill({ contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#234'></body>" }));
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-welcome-BANK_DSK", "1"); if (f) localStorage.setItem("stem-ui", "v7");
    for (const k of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + k, "9"); } catch { /* */ } }, flag);
  const page = await c.newPage();
  await page.goto(BASE + "/#" + Q); await page.waitForSelector("#ans", { timeout: 10000 }); await page.waitForTimeout(1500);
  return { c, page };
}
const rect = (page, sel) => page.$$eval(sel, es => es.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }));
try {
  await step("v7 phone 390: stashed 44x96 tab on the edge, the first live player clipped behind it; tap opens two 84x148 players with - / x above them", async () => {
    const { c, page } = await open({ width: 390, height: 844 }, true, { hasTouch: true, isMobile: true });
    const st = await page.evaluate(() => { const r = document.querySelector("#rot"); return { cls: r?.className, hid: r?.hidden, n: document.querySelectorAll("#rot iframe").length }; });
    assert.equal(st.hid, false, "shown on a phone"); assert.match(st.cls, /stashed/); assert.ok(st.n >= 2, "players are loaded");
    const [tab] = await rect(page, "#rot .rtab"), [vid] = await rect(page, "#rot .vid");
    assert.deepEqual([tab.x, tab.w, tab.h], [0, 44, 96], "the tab juts from the edge, 44x96");
    assert.deepEqual([Math.round(vid.x), Math.round(vid.y), vid.w, vid.h], [Math.round(tab.x), Math.round(tab.y), 44, 96], "the player is the tab's background");
    await page.tap("#rot .rtab"); await page.waitForTimeout(500);
    const vs = await rect(page, "#rot .vid:nth-child(-n+2)"), cs = await rect(page, "#rot .ctl button");
    assert.deepEqual(vs.map(v => [v.w, v.h]), [[84, 148], [84, 148]], "two 9:16 players");
    assert.equal(cs.length, 2); assert.ok(cs.every(x => x.b <= vs[0].y + 0.5 && x.w === 44 && x.h === 44), "- and x float above the picture: " + JSON.stringify(cs));
    assert.equal(await page.$eval("#rot .vid", e => getComputedStyle(e).borderTopWidth), "0px", "no border");
    await c.close();
  });
  await step("v7 desktop 1366x768: no box, 5 players all in view, the playing one large; a tap on a small one swaps it large; zero borders", async () => {
    const { c, page } = await open({ width: 1366, height: 768 }, true);
    await page.waitForSelector("#rot.docked .vid");
    const vs = await rect(page, "#rot .vid");
    assert.equal(vs.length, 5);
    assert.ok(vs.every(v => v.x >= 0 && v.r <= 1366 && v.y >= 0 && v.b <= 768), "all 5 in the window");
    const big = i => page.$$eval("#rot .vid", es => es.findIndex(e => e.classList.contains("hero")));
    assert.equal(await big(), 0);
    const [h, s] = [vs[0], vs[1]]; assert.ok(h.w > s.w * 1.9 && h.h > s.h * 1.9, `one large, four small: ${JSON.stringify([h, s])}`);
    assert.equal(await page.$eval("#rot .duo", e => { const s = getComputedStyle(e); return [s.boxShadow, s.backgroundColor, s.borderTopWidth].join("|"); }), "none|rgba(0, 0, 0, 0)|0px", "no box");
    assert.equal(await page.$$eval("#rot .vid", es => es.every(e => getComputedStyle(e).borderTopWidth === "0px")), true);
    await page.click("#rot .vid:nth-child(3)"); await page.waitForTimeout(200);
    assert.equal(await big(), 2, "the tapped one is large now");
    const after = await rect(page, "#rot .vid"); assert.ok(after[2].w > after[0].w * 1.9, "and the old one is small");
    await c.close();
  });
  await step("flag off, phone 390: still no brainrot at all (the Oct 17 rule stays)", async () => {
    const { c, page } = await open({ width: 390, height: 844 }, false);
    assert.deepEqual(await page.evaluate(() => [!!document.querySelector("#rot:not([hidden])"), document.querySelectorAll("iframe").length]), [false, 0]);
    await c.close();
  });
} finally { await b.close(); srv.kill(); }
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log("ALL OK");
