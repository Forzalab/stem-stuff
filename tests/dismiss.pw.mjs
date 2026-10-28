// Dismiss Cluck's column (desktop; design/DISMISS.md, Tony Oct 20: "B4 look with H humor"). html.side: the X, Escape or the sash dragged
// to the right edge fold the right column; one centred column, the question one type step up, no "Question" label. Under the verdict a
// 44px+ row (#clBack) brings it back: its name is plain ("See Cluck's explanation"), its rotating line is aria-hidden, "Show him" stays.
// Reduced motion: one static line. The humour kind is a stable hash of telemetry's own id (window.stemHk), forced by #hk=<kind>, a fixed
// default without an id. Phones: unchanged. Own serve.py + a stub OpenRouter.
//   node tests/dismiss.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8879", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "dismiss-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_DSM${n}`, title: `Dismiss ${n}`, type: "mc", shuffle: false,
  body: txt(`A 2.0 kg block starts from rest and slides 3.0 m down a frictionless ramp tilted at 30 degrees (${n}). How fast is it moving at the bottom?`), correct: "a",
  choices: ["5.4 m/s", "2.7 m/s", "7.7 m/s", "9.8 m/s"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `Dismiss ${n}`, key: "Tick: a", slip: { b: "Half of it." } } }));
writeFileSync(join(banks, "BANK_DSM.json"), JSON.stringify({ v: 1, problems: PROBS }));
const SHORT = ["Only the part of gravity along the ramp speeds it up.\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < SHORT.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: SHORT[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const DESK = { width: 1280, height: 800 }, PHONE = { width: 393, height: 852 };
const KINDS = {   // app.js HK, first lines (the default, deadpan, when there is no telemetry id)
  sassy: "Even ducks need a rest frame.", deadpan: "Cluck's still here, quack!", duck: "Cluck knows ducks don't cluck", nerd: "Cluck's resting with energy" };

/* a wrong pick streams Cluck's reply; the idle duck's tap opens the sheet on it */
/* close (default): then the other wrong picks use up the tries, so the question closes with the "Ask Cluck" chip, not the "okay, but how?" peek
   or the "See Cluck's steps" chip: with either of those up the row stays hidden (E, Tony Oct 21: one Cluck CTA on screen at a time;
   checked on its own below) */
async function cluck(vp, { hash = "", motion = "no-preference", hk = null, close = true } = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: motion });
  await ctx.addInitScript(hk => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (hk != null) window.stemHk = n => hk % n; }, hk);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_DSM" + hash);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.evaluate(() => { window.__ev = []; const o = window.stemT; window.stemT = (n, p) => { window.__ev.push([n, p]); return o && o(n, p); }; });
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
  if (close) {
    for (const id of await page.$$eval(".opt[data-id]", os => os.map(o => o.dataset.id).filter(d => d !== "a" && d !== "b"))) {
      if (await page.evaluate(() => window.__drill.state.finished)) break;
      const k = await page.evaluate(() => window.__drill.state.tries.length);
      await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
      await page.waitForFunction(k => window.__drill.state.tries.length > k, k, { timeout: 5000 });
    }
    await page.waitForFunction(() => window.__drill.state.finished, null, { timeout: 5000 });
  }
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await page.waitForTimeout(300);
  return page;
}
const state = page => page.evaluate(() => {
  const vis = s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none"; };
  const b = document.querySelector("#clBack"), f = document.querySelector("#freeze").getBoundingClientRect(), m = document.querySelector("#main").getBoundingClientRect();
  return { gone: document.documentElement.classList.contains("cl-gone"), open: window.stemCluckOpen(), work: vis("#work"), sash: vis("#sash"), label: vis(".freeze .q-label"),
    back: vis("#clBack"), backH: b ? b.getBoundingClientRect().height : 0, name: b && b.getAttribute("aria-label"), hkHidden: b && b.querySelector(".hk").getAttribute("aria-hidden"),
    go: b && b.querySelector(".hk-go").textContent, line: b && b.querySelector(".hk-t").textContent, last: !!b && !b.nextElementSibling && b.parentElement.id === "freezeIn",
    fs: parseFloat(getComputedStyle(document.querySelector("#problem")).fontSize), gapL: f.left - m.left, gapR: m.right - f.right, hscroll: document.documentElement.scrollWidth > innerWidth };
});
const ev = (page, n) => page.evaluate(n => window.__ev.filter(e => e[0] === n).map(e => e[1]), n);

await step("desktop: the X folds the column; one centred column, a bigger question, no label; the B4 row under the verdict; a tap brings it back", async () => {
  const page = await cluck(DESK);
  const s0 = await state(page);
  assert.ok(s0.open && s0.work && s0.sash && s0.label && !s0.gone && !s0.back, "starts side by side, Cluck open: " + JSON.stringify(s0));
  await page.screenshot({ path: join(SHOTS, "dismiss-0-open-1280.png") });
  await page.click("#cluck .cl-bar .cl-x");
  const s = await state(page);
  assert.ok(s.gone && !s.open && !s.work && !s.sash && !s.label, "dismissed: " + JSON.stringify(s));
  assert.ok(s.fs > s0.fs, `the question steps up (${s0.fs} -> ${s.fs})`);
  assert.ok(Math.abs(s.gapL - s.gapR) <= 2, `centred: ${s.gapL} | ${s.gapR}`);
  assert.ok(!s.hscroll, "no sideways scroll");
  assert.ok(s.back && s.backH >= 44 && s.last, "the row shows, 44px+, last under the verdict: " + JSON.stringify(s));
  assert.equal(s.name, "See Cluck's explanation", "a plain accessible name");
  assert.equal(s.hkHidden, "true", "the rotating line is aria-hidden");
  assert.equal(s.go, "Show him", "the action word stays");
  assert.equal(s.line, KINDS.deadpan, "no telemetry id (local run): the fixed default kind");
  assert.deepEqual(await ev(page, "cluck_back_seen"), [{ hk: "deadpan" }], "one exposure, with its kind");
  await page.screenshot({ path: join(SHOTS, "dismiss-1-gone-1280.png") });
  await page.waitForFunction(l => document.querySelector("#clBack .hk-t").textContent !== l, s.line, { timeout: 6000 });
  assert.ok(await page.$eval("#clBack .hk-t", t => t.classList.contains("roll")), "the next line slides in");
  assert.equal((await state(page)).go, "Show him", "only the line rotates");
  await page.click("#clBack");
  const r = await state(page);
  assert.ok(!r.gone && r.open && r.work && r.sash && !r.back, "restored, Cluck open: " + JSON.stringify(r));
  assert.equal((await ev(page, "cluck_open")).at(-1).hk, "deadpan", "the open event carries the kind");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("desktop: Escape dismisses; the sash dragged to the right edge dismisses; the row restores each time", async () => {
  const page = await cluck(DESK);
  await page.keyboard.press("Escape");
  let s = await state(page);
  assert.ok(s.gone && s.back && !s.work, "Escape: " + JSON.stringify(s));
  await page.click("#clBack");
  s = await state(page);
  assert.ok(!s.gone && s.open, "back: " + JSON.stringify(s));
  const b = await page.locator("#sash").boundingBox(), y = b.y + 200, x0 = b.x + b.width / 2;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (1270 - x0) * i / 10, y);
  await page.mouse.up(); await page.waitForTimeout(200);
  s = await state(page);
  assert.ok(s.gone && !s.open && s.back && !s.work, "dragged to the right edge: " + JSON.stringify(s));
  await page.click("#clBack");
  s = await state(page);
  assert.ok(!s.gone && s.open && s.work, "back again: " + JSON.stringify(s));
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("reduced motion: one static line, no slide", async () => {
  const page = await cluck(DESK, { motion: "reduce" });
  await page.click("#cluck .cl-bar .cl-x");
  const l = (await state(page)).line;
  await page.waitForTimeout(4500);
  const s = await state(page);
  assert.ok(s.back, "the row shows");
  assert.equal(s.line, l, "the line stays put");
  assert.equal(await page.$eval("#clBack .hk-t", t => t.classList.contains("roll")), false, "no slide");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("the bucket: a stable hash of the one telemetry id; stemHk picks the kind; #hk=<kind> forces it", async () => {
  const page = await cluck(DESK, { hk: 2 });
  const b = await page.evaluate(() => { const B = window.__stemTelemetry.bucket, ids = ["t1", "tabc123", "tlz9x0q", "t" + "x".repeat(40)]; return { same: ids.map(i => B(i, 4) === B(i, 4)), range: ids.every(i => B(i, 4) >= 0 && B(i, 4) < 4), junk: [B("", 4), B(null, 4), B("t1", 0)], spread: new Set(Array.from({ length: 64 }, (_, i) => B("t" + i.toString(36) + "q", 4))).size }; });
  assert.deepEqual(b.same, [true, true, true, true], "same id, same bucket");
  assert.ok(b.range && b.spread === 4, "all four buckets in use: " + JSON.stringify(b));
  assert.deepEqual(b.junk, [0, 0, 0], "no id: bucket 0, never throws");
  assert.equal(await page.evaluate(() => !/hk|bucket/i.test(document.cookie) && !Object.keys(localStorage).some(k => /hk|bucket/i.test(k))), true, "no new cookie, no new storage");
  await page.click("#cluck .cl-bar .cl-x");
  assert.equal((await state(page)).line, KINDS.duck, "stemHk -> 2 = duck");
  await page.context().close();
  const p2 = await cluck(DESK, { hash: "&hk=nerd", hk: 0 });
  await p2.click("#cluck .cl-bar .cl-x");
  assert.equal((await state(p2)).line, KINDS.nerd, "#hk=nerd beats the hash");
  assert.deepEqual(await ev(p2, "cluck_back_seen"), [{ hk: "nerd" }]);
  assert.deepEqual(p2.errs, [], "no page errors");
  await p2.context().close();
});

await step("duck kind: its 2nd line is a random pick from Cluck's idle pool (Tony #36), no more \"folded, not offended\"", async () => {
  const page = await cluck(DESK, { hk: 2 });
  await page.evaluate(() => { Math.random = () => 0.99; });                    // deterministic: the pool's last line
  await page.click("#cluck .cl-bar .cl-x");
  assert.equal((await state(page)).line, KINDS.duck);
  await page.waitForFunction(l => document.querySelector("#clBack .hk-t").textContent !== l, KINDS.duck, { timeout: 6000 });
  assert.equal((await state(page)).line, "Cluck's getting his ducks in a row", "Math.random 0.99: the pool's last line");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("phone: unchanged; the X closes the sheet, nothing folds, no row", async () => {
  const page = await cluck(PHONE);
  await page.click("#cluck .cl-bar .cl-x");
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({ gone: document.documentElement.classList.contains("cl-gone"), side: document.documentElement.classList.contains("side"), row: !!document.querySelector("#clBack:not([hidden])"), open: window.stemCluckOpen() }));
  assert.deepEqual(s, { gone: false, side: false, row: false, open: false });
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("1920x1080 + 393x852: greyscale shots (STYLE.md §7.16); 1920 dismissed is centred with no sideways scroll", async () => {
  const grey = page => page.addStyleTag({ content: "html { filter: grayscale(1); }" });
  const d = await cluck({ width: 1920, height: 1080 });
  await d.click("#cluck .cl-bar .cl-x");
  const s = await state(d);
  assert.ok(s.gone && s.back && !s.hscroll && Math.abs(s.gapL - s.gapR) <= 2, JSON.stringify(s));
  await d.screenshot({ path: join(SHOTS, "dismiss-1920.png") });
  await grey(d); await d.screenshot({ path: join(SHOTS, "dismiss-1920-grey.png") });
  await d.context().close();
  const p = await cluck(PHONE);
  await p.screenshot({ path: join(SHOTS, "phone-393.png") });
  await grey(p); await p.screenshot({ path: join(SHOTS, "phone-393-grey.png") });
  await p.context().close();
});

/* E (Tony, Oct 21): "Show him" is never on screen with "okay, but how?" or "See Cluck's steps" */
const ctas = page => page.evaluate(() => {
  const vis = e => !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  return { how: [...document.querySelectorAll(".cl-peek .cl-cta")].some(vis), back: vis(document.querySelector("#clBack")) };
});
const one = async (page, what) => { const c = await ctas(page); assert.ok(!(c.how && c.back), `${what}: both Cluck CTAs up ${JSON.stringify(c)}`); return c; };
await step("E desktop 1280: with the 'okay, but how?' peek up, no 'Show him' row; open / dismiss / Escape / reopen never show both", async () => {
  const page = await cluck(DESK, { close: false });
  await one(page, "open");
  await page.click("#cluck .cl-bar .cl-x");
  let c = await one(page, "dismissed (X)");
  assert.ok(c.how && !c.back, "dismissed with the peek: only 'okay, but how?' " + JSON.stringify(c));
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("cl-gone")), true, "the column folded");
  await page.click(".cl-peek .cl-cta");
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await one(page, "reopened from the peek");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  c = await one(page, "dismissed (Escape)");
  assert.ok(c.how && !c.back, "Escape: only 'okay, but how?' " + JSON.stringify(c));
  await page.click('.opt[data-id="a"]'); await page.click('.ch[data-id="a"] .send');
  await page.waitForFunction(() => window.__drill.state.finished, null, { timeout: 5000 });
  c = await one(page, "question closed");
  const cmp = await page.evaluate(() => [...document.querySelectorAll("#wish .cue-ok")].some(e => e.getClientRects().length > 0));
  assert.ok(!c.how && !c.back && cmp, "solved: 'See Cluck's steps' is the one CTA, no 'Show him' row " + JSON.stringify({ ...c, cmp }));
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});
await step("E phone 360: open / close never show both", async () => {
  const page = await cluck({ width: 360, height: 740 }, { close: false });
  await one(page, "open");
  await page.click("#cluck .cl-bar .cl-x"); await page.waitForTimeout(300);
  await one(page, "closed");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

/* G (Tony, Oct 21): the ask box is a textarea that wraps and grows to min(6 lines, 40vh), then scrolls inside; Enter sends, Shift+Enter is a
   new line, never mid-IME; back to one line after a send; never a sideways scroll */
for (const vp of [{ width: 360, height: 740 }, DESK]) await step(`G ${vp.width}: the ask box wraps, grows, stops at its cap, scrolls; Enter sends, Shift+Enter a new line`, async () => {
  const page = await cluck(vp, { close: false });
  const T = "#cluck .ask textarea";
  await page.waitForSelector(T + ":not([disabled])", { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector("#cluck .ask .send").disabled, null, { timeout: 8000 });
  const g = () => page.$eval(T, t => { const cs = getComputedStyle(t), d = document.documentElement;
    return { h: t.getBoundingClientRect().height, sh: t.scrollHeight, ch: t.clientHeight, sw: t.scrollWidth, cw: t.clientWidth, oy: cs.overflowY, lh: parseFloat(cs.lineHeight),
      max: parseFloat(cs.maxHeight), v: t.value, ml: t.maxLength, tag: t.tagName, dsw: d.scrollWidth, dcw: d.clientWidth, ih: innerHeight }; });
  const a = await g();
  assert.equal(a.tag, "TEXTAREA"); assert.equal(a.ml, 500, "maxlength kept");
  assert.ok(Math.abs(a.max - Math.min(6 * a.lh + (a.h - a.lh), 0.4 * a.ih)) <= 2, `cap = min(6 lines, 40vh): ${JSON.stringify(a)}`);
  const msg = Array.from({ length: 60 }, (_, i) => "word" + (i % 10)).join(" ").slice(0, 300);
  assert.equal(msg.length, 300);
  await page.click(T); await page.fill(T, msg);
  const b = await g();
  assert.ok(b.h > a.h + a.lh / 2, `300 chars wrap and the box grows: ${a.h} -> ${b.h}`);
  assert.ok(b.sw <= b.cw && b.dsw <= b.dcw, "no sideways scroll: " + JSON.stringify(b));
  await page.press(T, "End");
  for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+Enter");
  const c = await g();
  assert.equal(c.v, msg + "\n".repeat(10), "Shift+Enter adds new lines, sends nothing");
  assert.ok(Math.abs(c.h - c.max) <= 1, `stops at the cap: ${JSON.stringify(c)}`);
  assert.ok(c.sh > c.ch + 1 && c.oy === "auto", "past the cap it scrolls inside: " + JSON.stringify(c));
  assert.ok(c.sw <= c.cw && c.dsw <= c.dcw, "no sideways scroll at the cap: " + JSON.stringify(c));
  const sent0 = await page.$$eval("#cluck .cl-thread .msg.me", m => m.length);
  await page.$eval(T, t => t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
  assert.equal(await page.$$eval("#cluck .cl-thread .msg.me", m => m.length), sent0, "Enter mid-IME composition does not send");
  await page.keyboard.press("Enter");
  await page.waitForFunction(n => document.querySelectorAll("#cluck .cl-thread .msg.me").length > n, sent0, { timeout: 4000 });
  assert.equal(await page.$$eval("#cluck .cl-thread .msg.me p", p => p.at(-1).textContent), msg.trim(), "Enter sent the message (trimmed)");
  const d = await g();
  assert.equal(d.v, "", "the box empties");
  assert.ok(Math.abs(d.h - a.h) <= 1, `back to one line after the send: ${a.h} vs ${d.h}`);
  assert.ok(d.dsw <= d.dcw, "no sideways scroll after the send");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

/* D (Tony, Oct 21): the top bar's lower edge fades at every width once the page scrolls; a fade only, it never catches a click */
await step("D 1280: the top bar's fade is there once scrolled, pointer-events none, no backdrop blur", async () => {
  const page = await cluck(DESK);
  await page.evaluate(() => { const s = document.createElement("div"); s.style.height = "2000px"; document.querySelector("#main").append(s); scrollTo(0, 300); });
  await page.waitForFunction(() => document.documentElement.classList.contains("scrolled"), null, { timeout: 2000 });
  const f = await page.evaluate(() => { const t = document.querySelector(".top"), cs = getComputedStyle(t, "::before"), r = t.getBoundingClientRect();
    const under = document.elementFromPoint(innerWidth / 2, r.bottom + 4);
    return { content: cs.content, pe: cs.pointerEvents, bg: cs.backgroundImage, h: parseFloat(cs.height), bf: getComputedStyle(t).backdropFilter, underTop: !!under && !!under.closest(".top") }; });
  assert.ok(f.content !== "none" && /gradient/.test(f.bg) && f.h > 0, "the fade is there: " + JSON.stringify(f));
  assert.equal(f.pe, "none", "the fade never catches a click");
  assert.equal(f.underTop, false, "a tap just under the bar reaches the page");
  assert.ok(!f.bf || f.bf === "none", "no backdrop-filter");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
