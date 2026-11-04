// REVEAL-TRAY (demo flow, Nov 3, shots 05/06 + INDEX: Exam 3 num item, sugar):
//   reveal  after the 2nd miss the answer strip's drawer (Ask Cluck + close; absolute, under the bar) lay on the reveal line
//           "Not it. The answer is <value>": the value was hidden behind the tray. The line must show whole, drawer open or closed,
//           and closing the drawer still moves nothing (strip-layers' reflow 0)
//   toast   the stage toast ("Ready when you are.") sat on the hint card on desktop: it may never lie on the hint card (#fb)
// 393 phone (touch) + 1280 + 721, sugar. Own serve.py + a throwaway bank (no brain bank). No page.clock.   node tests/reveal-tray.pw.mjs <port> [shots dir]
//   RT_W=393 or RT_W=1280,721 picks the widths (default all).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8888, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "reveal-tray-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `PHYS_RT${n}`, title: `Roll ${n}`, type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.",
  body: txt(`A solid sphere rolls without slipping down a ${n}.0 m ramp. How fast is it moving at the bottom?` + "\n\nThe ramp is tilted at 25.0 degrees and the sphere starts from rest at the top. ".repeat(6)),   // a long stem: the hint card lands near the viewport foot (the toast's desktop spot)
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. A rolling ball also spins. Where is the rotational kinetic energy?" }, { value: "0.650", error: "trig", hint: "QUACK. Height along a slope uses which trig function?" }],
  saccharine: { title: `Roll ${n}`, key: "Use: energy with spin\nAnswer: 1.38", slip: { "1.636": "Left out the spin." } }, ...(n === 2 ? { twist: true } : {}) }));
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_RTR.json"), JSON.stringify({ v: 1, problems: PROBS }));
const stub = createServer(async (req, res) => {                              // a stub OpenRouter (the tray needs a live Cluck), as cluck-v2
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "The ball also spins. Egg-cellent." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 500;   // > the drawer's 380 ms slide
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, o = {}) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(keepToast => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (keepToast) { const t0 = Date.now(); window.__rtToast = []; setInterval(() => { const e = document.querySelector(".stoast.on"); if (e) window.__rtToast.push({ t: Date.now() - t0, r: e.getBoundingClientRect().toJSON(), fb: document.querySelector("#fb")?.getBoundingClientRect().toJSON(), fbt: !!document.querySelector("#fb")?.textContent.trim() }); }, 50); } }, !!o.toast);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_RTR");
  await page.waitForFunction(() => !document.getElementById("splash") && /^#PHYS_RT/.test(location.hash) && !!document.querySelector("#ff input, #ff textarea"), null, { timeout: 10000 });
  return page;
}
const typeAnswer = async (page, v) => {
  const f = page.locator("#ff :is(input, textarea)").first();
  await f.fill(v); await f.press("Enter");
};
/* the reveal line's value and the open drawer: rects + what is painted at the value's centre */
const reveal = page => page.evaluate(() => {
  const b = document.querySelector("#q .ansl b"), d = document.querySelector("#q .vdrawer:not([hidden])");
  if (!b) return null;
  const r = b.getBoundingClientRect(), dr = d && d.getClientRects().length ? d.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const s = document.querySelector("#q .ansl > span")?.getBoundingClientRect();
  const hitS = s && document.elementFromPoint(s.left + 4, s.top + s.height / 2);
  return { b: r.toJSON(), d: dr && dr.toJSON(), onValue: !!hit && !!hit.closest(".ansl"), onWords: !hitS || !!hitS.closest(".ansl"), text: b.closest(".ansl").textContent.trim(),
    overlap: !!dr && !(dr.right <= r.left || dr.left >= r.right || dr.bottom <= r.top || dr.top >= r.bottom) };
});
/* the open drawer's Ask Cluck chip: its duck (the rw-chip's i-duck svg, or the cue chip's raster) is there, drawn, at least 16px, not transparent */
const duck = page => page.evaluate(() => {
  const c = document.querySelector("#q .vdrawer:not([hidden]) .wchip");
  if (!c) return { chip: false };
  const ic = c.querySelector("svg, img"), r = ic && ic.getBoundingClientRect();
  let o = 1; for (let e = ic; e && e !== c.parentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity;
  const use = ic && ic.querySelector("use"), ref = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
  const rgb = s => (/rgba?\(([^)]+)\)/.exec(s) || [0, "0,0,0"])[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
  const lum = c => { const [a, b, d] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a + 0.7152 * b + 0.0722 * d; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* the body's paint vs the chip's fill (an orange duck on the orange chip is no duck): the sprite's currentColor, or the inline art's first shape */
  const body = ic && ic.tagName !== "IMG" && (use ? getComputedStyle(ic).color : getComputedStyle(ic.querySelector("ellipse, circle, path")).fill);
  const cr = body ? +ratio(rgb(body), rgb(getComputedStyle(c).backgroundColor)).toFixed(2) : null;
  return { chip: true, label: c.textContent.trim(), tag: ic && ic.tagName, w: r && Math.round(r.width), h: r && Math.round(r.height), o, cr,
    vis: !!ic && getComputedStyle(ic).visibility === "visible" && getComputedStyle(ic).display !== "none",
    drawn: !ic ? false : ic.tagName === "IMG" ? ic.complete && ic.naturalWidth > 0 : (use ? !!(ref && document.querySelector(ref)) : true) && cr >= 3, html: c.innerHTML.slice(0, 200) };
});
const hasDuck = (d, when) => assert.ok(d.chip && d.tag && d.vis && d.drawn && d.w >= 16 && d.h >= 16 && d.o > 0.9, `${when}: the Ask Cluck chip has no visible duck: ` + JSON.stringify(d));
const W = (process.env.RT_W || "393,1280,721").split(",").map(Number);
try {
  for (const w of W) {
    await step(`${w}: 2nd miss: the drawer's Ask Cluck chip has its duck (2nd miss + right); closing the drawer moves nothing`, async () => {
      const page = await open(w);
      try {
        await typeAnswer(page, "1.636");
        await page.waitForFunction(() => window.__drill && window.__drill.state && window.__drill.state.tries.length === 1, null, { timeout: 6000 });
        if (await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 4000 }).then(() => true, () => false)) {
          await page.waitForTimeout(SETTLE); hasDuck(await duck(page), "1st miss");
        } else console.log(`     ${w}: no drawer after the 1st miss (the duck checked after the 2nd)`);
        await page.waitForTimeout(2200);                                     // the 2 s spam gate between tries (redo-note / queue-walk)
        await typeAnswer(page, "0.650");
        await page.waitForSelector("#q .ansl b", { timeout: 6000 });
        await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 });
        await page.waitForTimeout(SETTLE);
        await page.locator("#q .ansl").scrollIntoViewIfNeeded();
        const m = await reveal(page);
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `rt-reveal-${w}.png`) });
        assert.ok(m && m.d, "a reveal line and an open drawer: " + JSON.stringify(m));
        assert.match(m.text, /1\.38/, "the value");
        hasDuck(await duck(page), "2nd miss");
        const at = () => page.evaluate(() => { const t = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }; return { ff: t("#ff"), pv: t("#preview"), ansl: t("#q .ansl"), fb: t("#fb") }; });
        const a = await at();
        await page.click("#q .vdrawer .vd-x"); await page.waitForTimeout(SETTLE);
        assert.deepEqual(await at(), a, "closing the drawer moved something");
        await page.click("#q .nx");                                           // Next -> the next item, answered right first time
        await page.waitForFunction(() => location.hash === "#PHYS_RT2" && !!document.querySelector("#ff input:not([disabled]), #ff textarea:not([disabled])"), null, { timeout: 8000 });
        await typeAnswer(page, "1.38");
        await page.waitForSelector("#q .ansl b", { timeout: 6000 });
        await page.waitForTimeout(SETTLE);
        await page.locator("#q .ansl").scrollIntoViewIfNeeded();
        const ok = await reveal(page);
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `rt-right-${w}.png`) });
        assert.ok(ok, "right: a reveal line");
        if (ok.d) hasDuck(await duck(page), "right");
        assert.deepEqual(page.errs, [], "page errors");
      } finally { await page.context().close(); }
    });
  }
  for (const w of W) {
    await step(`${w}: tags: "Pity roll" + "Twist" sit on ONE row before the title (never stacked)`, async () => {
      const page = await open(w);
      try {
        await page.goto(BASE + "/#PHYS_RT2");
        await page.waitForSelector("#twistChip", { state: "visible", timeout: 8000 });
        const m = await page.evaluate(() => {                                // the retry tag as retryTag() paints a re-showing that owes a miss
          const t = document.querySelector("#rtag"); t.hidden = false; t.className = "qtag rtag rt-owe"; t.innerHTML = "<span>Pity roll</span>";
          const r = e => e.getBoundingClientRect(), a = r(t), b = r(document.querySelector("#twistChip")), title = document.querySelector("#blocks > .ptitle");
          const rng = document.createRange(); rng.selectNodeContents(title); const words = [...rng.getClientRects()].filter(x => x.width > 1);
          return { a: [Math.round(a.left), Math.round(a.top), Math.round(a.bottom)], b: [Math.round(b.left), Math.round(b.top), Math.round(b.bottom)], firstLineTop: words.length ? Math.round(Math.min(...words.map(x => x.top))) : null };
        });
        if (SHOTS) await page.locator("#problem").screenshot({ path: join(SHOTS, `rt-tags-${w}.png`) });
        assert.ok(Math.abs(m.a[1] - m.b[1]) <= 2 && m.a[0] < m.b[0], "the two tags are not side by side on one row: " + JSON.stringify(m));
      } finally { await page.context().close(); }
    });
  }
  for (const w of W.filter(w => w >= 720)) {
    await step(`${w}: Cluck's box: the stage row and the reply's first line sit in the text column, right of the avatar, nothing clipped`, async () => {
      const page = await open(w);
      try {
        await typeAnswer(page, "1.636");
        await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck")?.innerText || ""), null, { timeout: 10000 });
        await page.waitForTimeout(SETTLE);
        const m = await page.evaluate(() => {
          const msg = [...document.querySelectorAll("#cluck .msg:not(.me)")].find(x => /Egg-cellent/.test(x.textContent));
          const r = e => e && e.getBoundingClientRect(), av = r(msg.querySelector(".av")), rows = [...msg.children].filter(e => !e.matches(".av") && e.getClientRects().length);
          let clip = null; for (let e = msg.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { clip = r(e); break; } }
          const out = rows.filter(e => !e.matches(".sr-only")).map(e => ({ cls: e.className, l: Math.round(r(e).left) }));
          return { av: av && [Math.round(av.left), Math.round(av.right)], rows: out, clip: clip && Math.round(clip.left), msgL: Math.round(r(msg).left) };
        });
        if (SHOTS) await page.locator("#cluck").screenshot({ path: join(SHOTS, `rt-cluck-${w}.png`) });
        assert.ok(m.av && m.clip != null && m.av[0] >= m.clip, "the avatar is clipped on the left: " + JSON.stringify(m));
        assert.ok(m.rows.length && m.rows.every(x => x.l >= m.av[1] + 4), "a row starts under the avatar column: " + JSON.stringify(m));
      } finally { await page.context().close(); }
    });
    await step(`${w}: Cluck starts to generate: the brainrot folds (as its Hide link does) and the box takes the room`, async () => {
      const page = await open(w);
      try {
        await page.waitForSelector("#rot.docked:not(.stashed) .vid", { timeout: 8000 });
        const h0 = await page.evaluate(() => Math.round(document.querySelector("#cluck").getBoundingClientRect().height));
        await typeAnswer(page, "1.636");
        await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck")?.innerText || ""), null, { timeout: 10000 });
        await page.waitForTimeout(SETTLE);
        const m = await page.evaluate(() => ({ st: document.querySelector("#rot").classList.contains("stashed"), link: document.querySelector("#rot .rot-link")?.textContent.trim(),
          h: Math.round(document.querySelector("#cluck").getBoundingClientRect().height) }));
        assert.ok(m.st, "the brainrot is still open after Cluck started: " + JSON.stringify(m));
        assert.match(m.link || "", /Show curated brainrot/, "its link offers it back");
        assert.ok(m.h > h0, `the box is not taller: ${h0} -> ${m.h}`);
        await page.click("#rot .rot-link"); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.querySelector("#rot").classList.contains("stashed")), false, "the student's link opens it again");
      } finally { await page.context().close(); }
    });
    await step(`${w}: the stage toast ("Ready when you are.") never lies on the hint card after a miss`, async () => {
      const page = await open(w, { toast: true });
      try {
        await page.waitForFunction(() => window.__rtToast.length > 0, null, { timeout: 8000 });   // the start line is up
        await typeAnswer(page, "1.636");                                     // a miss while it shows: the hint card lands
        await page.waitForFunction(() => !!document.querySelector("#fb")?.textContent.trim(), null, { timeout: 6000 });
        await page.waitForTimeout(4500);                                     // the toast's 4 s
        const bad = await page.evaluate(() => window.__rtToast.filter(s => s.fbt && s.fb && s.fb.height > 0 && !(s.r.right <= s.fb.left || s.r.left >= s.fb.right || s.r.bottom <= s.fb.top || s.r.top >= s.fb.bottom)));
        const seen = await page.evaluate(() => window.__rtToast.filter(s => s.fbt).length);
        console.log(`     ${w}: ${seen} toast samples with the hint card up`);
        if (SHOTS && bad.length) await page.screenshot({ path: join(SHOTS, `rt-toast-${w}.png`) });
        assert.deepEqual(bad.slice(0, 2), [], `the toast lay on the hint card in ${bad.length} of ${seen} samples (50 ms) after the miss`);
      } finally { await page.context().close(); }
    });
  }
} finally { await browser.close(); srv.kill(); stub.close(); }
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
