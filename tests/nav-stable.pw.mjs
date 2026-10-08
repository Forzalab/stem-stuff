// Prev/Next in a bank (design/NAV.md "Mastery order", design/plans/QUEUE.md): Next opens the question at once from the bank in
// memory (no wait on p/CODE.json), Prev stays lit, Prev walks back what was shown, the list keeps the shown ones in their order.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/nav-stable.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8824), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "navst-")), BANKS = join(TMP, "banks");
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const CODES = ["CALC1_N01", "CALC1_N02", "CALC1_N03", "CALC1_N04"];
const BANK = { v: 1, problems: CODES.map((c, i) => num(c, String(i + 2), `Stable ${i + 1}: 1 + ${i + 1}`)) };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_NV12.json"), JSON.stringify(BANK));
const MC = { code: "CALC1_M01", type: "mc", correct: "a", shuffle: false, body: [{ type: "text", md: "Pick A. " + "Long text. ".repeat(120) }],
  choices: [{ id: "a", md: "right" }, { id: "b", md: "nope" }, { id: "c", md: "nah" }] };
/* with a presolved key (saccharine), so the XP strip shows in the bar: the dim test needs it */
const sweet = n => ({ code: `CALC1_D0${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Dim ${n}: pick a.` }],
  choices: [{ id: "a", md: "one" }, { id: "b", md: "two" }], correct: "a", saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Answer: a" } });
writeFileSync(join(BANKS, "BANK_NV56.json"), JSON.stringify({ v: 1, problems: [sweet(1), sweet(2), sweet(3)] }));
writeFileSync(join(BANKS, "BANK_NV34.json"), JSON.stringify({ v: 1, problems: [MC, num("CALC1_M02", "2", "1 + 1")] }));

const { qFresh, qRest, qNew } = await import("../shuffle.mjs");   // pin the queue's salt so it plays file order (it was the shuffle seed)
const SEED = Array.from({ length: 2000 }, (_, i) => "k" + i).find(s => qFresh(CODES, s).every((c, i) => c === CODES[i]) && qRest(qNew(s), CODES).every((c, i) => c === CODES[i]));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
const order = page => page.$$eval("#qlist a", as => as.map(a => a.getAttribute("href").slice(1)));
/* Prev's disabled state, sampled every 50 ms for ms: true if it was ever disabled */
const prevEverOff = (page, ms) => page.evaluate(ms => new Promise(res => {
  const p = document.querySelector("#qprev"); let off = p.disabled;
  const t = setInterval(() => { off = off || p.disabled; }, 50);
  setTimeout(() => { clearInterval(t); res(off); }, ms);
}), ms);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
  await ctx.addInitScript(s => { try { if (!localStorage.getItem("stem-q-BANK_NV12")) localStorage.setItem("stem-q-BANK_NV12", JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 })); } catch { /* blocked */ } }, SEED);
  const page = await ctx.newPage();
  await page.goto(BASE + "/#BANK_NV12");
  await opened(page, CODES[0]);

  await step("Next: Prev lights up and stays lit, the order holds", async () => {
    const before = await order(page);
    await page.click("#qnext"); await opened(page, CODES[1]);
    assert.equal(await prevEverOff(page, 1500), false, "Prev went dim after Next");
    assert.deepEqual(await order(page), before);
    await page.click("#qnext"); await opened(page, CODES[2]);
    assert.equal(await prevEverOff(page, 1500), false, "Prev went dim after the second Next");
    assert.deepEqual(await order(page), before);
  });

  await step("Prev walks back the same list", async () => {
    await page.click("#qprev"); await opened(page, CODES[1]);
    await page.click("#qprev"); await opened(page, CODES[0]);
    assert.ok(await page.$eval("#qprev", b => b.disabled), "Prev on the first question");
  });

  await step("a graded try: the list holds; Next after Prev steps forward through what was shown; shown rows keep their order", async () => {
    await page.click("#qnext"); await opened(page, CODES[1]);
    const before = await order(page);
    await page.fill("#ans", "3"); await page.click("#ansGo");                 // 1 + 2: correct
    await page.waitForSelector("#ff .vk[data-v=i-ok]", { timeout: 4000 });
    await page.waitForTimeout(600);
    assert.deepEqual(await order(page), before, "re-sorted while on the answered question");
    await page.click("#qnext"); await opened(page, CODES[2]);
    assert.deepEqual((await order(page)).slice(0, 3), CODES.slice(0, 3), "the shown rows moved");
    assert.equal(await page.$eval("#qprev", b => b.disabled), false, "Prev dim after the answer");
    assert.equal(await prevEverOff(page, 1000), false, "Prev went dim after the open");
  });

  await step("Next does not wait on p/CODE.json (bank in memory), and still tells the server", async () => {
    let asked = 0;
    await page.route("**/p/*.json", async r => { asked++; await new Promise(res => setTimeout(res, 2000)); await r.continue().catch(() => {}); });
    const list = await order(page), to = list[list.indexOf(await page.textContent("#pcode")) + 1];
    const t0 = Date.now();
    await page.click("#qnext"); await opened(page, to, 1500);
    const dt = Date.now() - t0;
    assert.ok(dt < 1000, `took ${dt} ms`);
    await page.waitForTimeout(300);
    assert.equal(asked, 1, "the server was not told (seen pointer)");
    await page.unroute("**/p/*.json");
  });

  await step("all correct with the pad page open: the pad closes and the question row (Next) comes back", async () => {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
    await c2.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    const pg = await c2.newPage();
    await pg.goto(BASE + "/#BANK_NV34");
    await pg.waitForFunction(() => /^CALC1_M0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    if ((await pg.textContent("#pcode")) !== MC.code) { await pg.goto(BASE + "/#" + MC.code); await opened(pg, MC.code); }
    await pg.waitForTimeout(400);
    await pg.click("#padFab");
    await pg.waitForFunction(() => document.documentElement.classList.contains("mt"), null, { timeout: 3000 });
    if (!(await pg.isVisible('.opt[data-id="a"]'))) await pg.click("#mtMode");                // the a tile
    await pg.click('.opt[data-id="a"]'); await pg.click('.ch[data-id="a"] .send');
    await pg.waitForFunction(() => !document.documentElement.classList.contains("mt"), null, { timeout: 3000 });
    await pg.waitForTimeout(800);                                                   // the smooth scroll
    const g = await pg.evaluate(() => ({ next: document.querySelector("#qnext").getBoundingClientRect().top, y: scrollY }));
    assert.ok(g.next >= 0 && g.next < 100, `Next not in view: top ${g.next}, scrollY ${g.y}`);
    await c2.close();
  });

  /* the open list: one even scrim over the page, the top bar and its XP strip; the bar's buttons still work under it
     (nav.css .ql-dim + .top::after, Tony's Oct 7 bug shot: an undimmed bar, the strip's own dim, row 1 over the strip) */
  for (const w of [393, 1366]) await step(`open list at ${w}: one even dim over the page, the bar and the XP strip; row 1 under the strip; a tap on the dim closes it`, async () => {
    const phone = w < 700, H = phone ? 852 : 768;
    const c3 = await browser.newContext({ viewport: { width: w, height: H }, serviceWorkers: "block", hasTouch: phone, isMobile: phone });
    const pg = await c3.newPage();
    await pg.goto(BASE + "/#BANK_NV56");
    await pg.waitForFunction(() => !document.querySelector("#qnav").hidden && !document.querySelector("#rwHud")?.hidden && !!document.querySelector("#pcode")?.textContent, null, { timeout: 8000 });
    await pg.waitForFunction(() => !document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0", null, { timeout: 8000 });
    /* what is on top at the middle of the list button, of the XP strip, and at a spot on the page off the list and the phone's code bar */
    const spot = [w - 12, phone ? 680 : 700];
    const hit = () => pg.evaluate(([x, y]) => {
      const at = el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); };
      const dim = document.querySelector("#qlDim"), hud = document.querySelector(".top > .rw-hud");
      const list = document.querySelector("#qlist"), row = list.querySelector("li"), top = document.querySelector(".top");
      if (!list.hidden) list.scrollTop = 0;
      const tb = top.getBoundingClientRect();
      return { chip: !!at(document.querySelector("#qlistBtn"))?.closest("#qlistBtn"), lb: list.getBoundingClientRect().bottom,
        hud: hud && !hud.hidden ? { tap: !!at(hud)?.closest(".top > .rw-hud"), bottom: hud.getBoundingClientRect().bottom } : null,
        row1: !list.hidden && row ? { top: row.getBoundingClientRect().top, hit: !!at(row)?.closest("#qlist") } : null,
        page: document.elementFromPoint(x, y)?.id, dim: getComputedStyle(dim).visibility };
    }, spot);
    await pg.click("#qlistBtn");
    await pg.waitForFunction(() => getComputedStyle(document.querySelector("#qlDim")).opacity === "1", null, { timeout: 2000 });
    let h = await hit();
    assert.equal(h.dim, "visible");
    assert.equal(h.chip, true, "the list button is not on top (it must still close the list)");
    assert.ok(h.hud, "no XP strip in the bar");
    /* even: the bar's empty edge, the XP strip's row beside the strip and the page under the list are the same colour (main: bar 8,17,31 vs page 3,7,14) */
    const px = (x, y) => pg.screenshot({ clip: { x, y, width: 1, height: 1 } }).then(b => b.toString("base64"));
    const page0 = await px(2, h.lb + 48), bar0 = await px(2, 2), hud0 = await px(2, h.hud.bottom - 4);
    const rgb = b => {   /* a 1x1 PNG's pixel: its IDAT chunks, inflated; byte 0 is the row filter */
      const buf = Buffer.from(b, "base64"), dat = [];
      for (let o = 8; o < buf.length; o += 12 + buf.readUInt32BE(o)) if (buf.toString("latin1", o + 4, o + 8) === "IDAT") dat.push(buf.subarray(o + 8, o + 8 + buf.readUInt32BE(o)));
      return [...zlib.inflateSync(Buffer.concat(dat), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).subarray(1, 4)].join();
    };
    const near = (a, b) => rgb(a).split(",").every((v, i) => Math.abs(v - rgb(b).split(",")[i]) <= 3);   /* the list's soft shadow reaches far */
    assert.ok(near(bar0, page0), `the top bar (${rgb(bar0)}) is not under the same dim as the page (${rgb(page0)})`);
    assert.ok(near(hud0, page0), `the XP strip's row (${rgb(hud0)}) is not under the same dim as the page (${rgb(page0)})`);
    assert.ok(h.row1, "no list row");
    assert.equal(h.row1.hit, true, "row 1 is not above the dim");
    if (phone) assert.ok(h.row1.top >= h.hud.bottom, `row 1 (top ${h.row1.top}) overlaps the XP strip (bottom ${h.hud.bottom})`);
    assert.equal(h.page, "qlDim", "the page is not under the dim");
    await pg.mouse.click(...spot);                                              // a tap on the dim
    await pg.waitForFunction(() => document.querySelector("#qlist").hidden, null, { timeout: 2000 });
    await pg.waitForFunction(() => getComputedStyle(document.querySelector("#qlDim")).visibility === "hidden", null, { timeout: 2000 });
    h = await hit();
    assert.equal(h.hud.tap, true, "the XP strip's tap target is covered after close");
    assert.notEqual(h.page, "qlDim", "the dim still covers the page");
    await pg.click("#qlistBtn"); await pg.keyboard.press("Escape");             // Escape closes it too
    await pg.waitForFunction(() => document.querySelector("#qlist").hidden && getComputedStyle(document.querySelector("#qlDim")).visibility === "hidden", null, { timeout: 2000 });
    await c3.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
