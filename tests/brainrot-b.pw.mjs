// BRAINROT-B smoke (Tony, Nov 14: "go with bento style, the O one with the expand-jut-out button on mobile as video bkg"; phones SHOW it):
// html.ui-v7 only. Phone 390x844: a stashed 44x96 tab on the edge whose background is the live first player (clipped), tap = two 84x148 players with - / x
// ABOVE them; desktop: BRAINROT-B2 full-width bento of 8 varied tiles (hero 2x2 + tall + wide + small), a tap swaps a tile into the hero; no borders on any of it.
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
    const [tab] = await rect(page, "#rot .rtab"), [vid] = await rect(page, "#rot .duo:not(.dupe) .vid");
    assert.deepEqual([tab.x, tab.w, tab.h], [0, 44, 96], "the tab juts from the edge, 44x96");
    assert.deepEqual([Math.round(vid.x), Math.round(vid.y), vid.w, vid.h], [Math.round(tab.x), Math.round(tab.y), 44, 96], "the player is the tab's background");
    await page.tap("#rot .rtab"); await page.waitForTimeout(500);
    const vs = await rect(page, "#rot .duo:not(.dupe) .vid:nth-child(-n+2)"), cs = await rect(page, "#rot .ctl button");
    assert.deepEqual(vs.map(v => [v.w, v.h]), [[84, 148], [84, 148]], "two 9:16 players");
    assert.equal(cs.length, 2); assert.ok(cs.every(x => x.b <= vs[0].y + 0.5 && x.w === 44 && x.h === 44), "- and x float above the picture: " + JSON.stringify(cs));
    assert.equal(await page.$eval("#rot .duo:not(.dupe) .vid", e => getComputedStyle(e).borderTopWidth), "0px", "no border");
    await c.close();
  });
  for (const [W, H] of [[1366, 768], [1024, 768], [1920, 1080]]) await step(`v7 desktop ${W}x${H} (BRAINROT-B2): full-width bento of 8 (1 hero 2x2, tall, wide, small), no holes, rows on 4, zero borders; Cluck sheet still shows header + ask without page scroll; a tap swaps a tile into the hero`, async () => {
    const { c, page } = await open({ width: W, height: H }, true);
    await page.waitForSelector("#rot.docked .vid");
    const duo = (await rect(page, "#rot .duo"))[0], col = (await rect(page, "#work"))[0];
    const vs = await rect(page, "#rot .duo:not(.dupe) .vid");
    assert.equal(vs.length, 8, "8 tiles (one per category)");
    assert.ok(Math.abs(duo.w - col.w) <= 1 && Math.abs(duo.x - col.x) <= 1, `the mosaic fills the notes column: ${JSON.stringify([duo.x, duo.w, col.x, col.w])}`);
    /* no holes, no overlaps: every 4px sample point of the grid lies in a tile (a tile grown by half the 8px gap), and no two tiles overlap */
    const hit = (x, y) => vs.filter(v => x >= v.x - 4.5 && x <= v.r + 4.5 && y >= v.y - 4.5 && y <= v.b + 4.5).length;
    for (let y = duo.y + 2; y < duo.b; y += 4) for (let x = duo.x + 2; x < duo.r; x += 4) assert.ok(hit(x, y) >= 1, `a hole at ${Math.round(x)},${Math.round(y)}`);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const a = vs[i], b = vs[j]; assert.ok(Math.min(a.r, b.r) - Math.max(a.x, b.x) <= 1 || Math.min(a.b, b.b) - Math.max(a.y, b.y) <= 1, `tiles ${i} and ${j} overlap`); }
    assert.ok(Math.abs(Math.max(...vs.map(v => v.b)) - duo.b) <= 1 && Math.abs(Math.min(...vs.map(v => v.y)) - duo.y) <= 1 && Math.abs(Math.max(...vs.map(v => v.r)) - duo.r) <= 1, "the tiles' union reaches every edge of the grid");
    assert.ok(vs.every(v => Math.abs(((v.y - duo.y) % 4 + 4) % 4) < 0.01 || Math.abs(((v.y - duo.y) % 4 + 4) % 4 - 4) < 0.01), "every tile's top is on 4 from the grid's top: " + JSON.stringify(vs.map(v => v.y - duo.y)));
    assert.ok(vs.every(v => v.h % 4 === 0 || Math.abs(v.h % 4 - 4) < 0.01 || Math.abs(v.h % 4) < 0.01) || vs.every(v => (v.h + 8) % 4 === 0), "heights: whole rows");
    const shapes = new Set(vs.map(v => Math.round(v.w / 10) + "x" + Math.round(v.h / 10)));
    assert.ok(shapes.size >= 4, "a real mix of sizes: " + [...shapes]);
    const big = () => page.$$eval("#rot .duo:not(.dupe) .vid", es => es.findIndex(e => e.classList.contains("hero")));
    assert.equal(await big(), 0);
    assert.ok(vs[0].w > vs[1].w * 1.9 && vs[0].h > vs[2].h * 1.9, "the hero is the 2x2");
    assert.equal(await page.$eval("#rot .duo", e => { const s = getComputedStyle(e); return [s.boxShadow, s.backgroundColor, s.borderTopWidth].join("|"); }), "none|rgba(0, 0, 0, 0)|0px", "no box");
    assert.equal(await page.$$eval("#rot .duo:not(.dupe) .vid", es => es.every(e => getComputedStyle(e).borderTopWidth === "0px")), true);
    assert.ok(await page.$$eval("#rot .duo:not(.dupe) .vid", vs => { const s = document.querySelector("#rot .shelf").getBoundingClientRect(); return vs.filter(v => { const r = v.getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom && r.right > s.left && r.left < s.right; }).every(v => v.querySelector("iframe").hasAttribute("src")); }), "every tile in the window has its player loaded (the torus loads a tile when it shows)");
    /* the sheet (open from load) keeps its header and the ask field in the window; the page does not scroll */
    const sh = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, cl: document.querySelector("#work .cl").getBoundingClientRect().top, ask: document.querySelector("#work .cl-ft .ask").getBoundingClientRect().bottom }));
    const gap = await page.evaluate(() => ({ main: document.querySelector("#main").getBoundingClientRect().top, work: document.querySelector("#work").getBoundingClientRect(), dock: document.querySelector("#rot .shelf").getBoundingClientRect().height }));
    assert.ok(gap.main <= 80 && gap.work.top <= 104, "TOP-GAP: no empty band under the top bar (the idle HUD takes no room): " + JSON.stringify([gap.main, gap.work.top]));
    assert.ok(gap.dock <= gap.work.height * .4 + 1 && gap.dock >= gap.work.height * .3 || gap.dock === 360, `the dock is ~40% of the column: ${gap.dock} of ${gap.work.height}`);
    assert.ok(sh.sh <= sh.ih && sh.ask <= sh.ih && sh.cl < sh.ask - 100, "Cluck's sheet fits: " + JSON.stringify(sh));
    const frames = await page.$$eval("#rot iframe", es => es.map(e => e.src)), before = vs[3];
    /* the dock is a capped window onto a torus, so tile 4 may be out of it: wheel the world until some copy of tile k=3 shows (centre inside the window), then tap THAT copy (original or .dupe) */
    const seen = () => page.evaluate(() => { const s = document.querySelector("#rot .shelf").getBoundingClientRect(); const vs = [...document.querySelectorAll("#rot .vid[data-k='3']")];
      const i = vs.findIndex(v => { const r = v.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; return cx > s.left + 4 && cx < s.right - 4 && cy > s.top + 20 && cy < s.bottom - 20; }); vs.forEach(v => v.removeAttribute("data-tap")); if (i >= 0) vs[i].setAttribute("data-tap", "1"); return i; });
    const sb = (await rect(page, "#rot .shelf"))[0]; await page.mouse.move(sb.x + sb.w / 2, sb.y + sb.h / 2);
    for (let i = 0; i < 40 && await seen() < 0; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(40); }
    assert.ok(await seen() >= 0, "tile 4 can be wheeled into the window");
    await page.click("#rot .vid[data-tap]"); await page.waitForTimeout(200);
    assert.equal(await big(), 3, "the tapped one is the hero now");
    assert.deepEqual(await page.$$eval("#rot .vid.hero", es => [...new Set(es.map(e => e.dataset.k))]), ["3"], "every copy agrees on the hero");
    const after = await rect(page, "#rot .duo:not(.dupe) .vid");
    assert.ok(Math.abs(after[3].w - vs[0].w) <= 1 && Math.abs(after[3].h - vs[0].h) <= 1 && Math.abs(after[3].x - vs[0].x) <= 1, "it took the hero's cells");
    assert.ok(Math.abs(after[0].w - before.w) <= 1 && Math.abs(after[0].h - before.h) <= 1 && Math.abs(after[0].x - before.x) <= 1, "and the old hero took its cells");
    const now = await page.$$eval("#rot iframe", es => es.map(e => e.src));   // the wheel may load more tiles (lazy, by design); none that had a player may change or reload
    assert.deepEqual(frames.map((f, i) => f && f !== "about:blank" && f !== BASE + "/" ? now[i] : f), frames, "no loaded iframe reloaded");
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
