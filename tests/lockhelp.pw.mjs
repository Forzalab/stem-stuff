// "Let me help you with that!" (Tony Nov 5): Jev's help_modal action (intent.js J5 decider; triggers lock / s5 / s6 / s2 / q, liberal probabilities, one roll
// per item, caps gap / typing / hidden / sugar). Look: a dimmed screen, and ON it only Cluck's say-line, the art and two buttons (no box). No backdrop tap, no
// Escape; it survives a reload until a button is pressed. The help roll is pinned through window.__stemHelpRand (sessionStorage __rng); the clock through
// performance.now + sessionStorage __skew (seconds).
// W2 v2 (Tony: "define a threshold/scenario ... help avoidance + nag dismiss -> applies that, instead of blind .9"): a trigger rolls only while HA (>= 2 wrong submits
// over the last 3 items, no hand Cluck) or ND (2 swatted nudges) is live, else held reason=scn. The fixtures first establish HA: `primed` = a wrong on the 1-try
// item CALC1_LHP3 (the modal holds on mode there, the wrong still counts), then the item under test. ND is unit-tested (tests/intent.test.mjs: it needs two 90 s nudge cycles).
//   STEM_TODAY=2026-10-23 node tests/lockhelp.pw.mjs <port> [shots dir]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8881", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "lockhelp-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || join(ROOT, "tests", "out");
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const mk = (code, n) => ({ code, title: code, type: "mc", shuffle: false,
  body: txt(`A 2.0 kg block starts from rest and slides 3.0 m down a frictionless ramp tilted at 30 degrees (${code}). How fast is it moving at the bottom?`), correct: "a",
  choices: ["5.4 m/s", "2.7 m/s", "7.7 m/s", "9.8 m/s"].slice(0, n).map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: code, key: "Tick: a", slip: { b: "Half of it." } } });
const PROBS = [mk("CALC1_LHP1", 4), mk("CALC1_LHP2", 4), mk("CALC1_LHP3", 2), mk("CALC1_LHP4", 4)];   // LH3: a 2-choice mc = ONE try
writeFileSync(join(banks, "BANK_LHP.json"), JSON.stringify({ v: 1, problems: PROBS }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Only the part along the ramp speeds it up.\nTick: a. Egg-cellent." } }] })}\n\n`); res.end("data: [DONE]\n\n");
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
const VPS = { phone: { width: 390, height: 844 }, desk: { width: 1024, height: 768 } };
const DLG = '[role="dialog"].lockhelp';


async function open(vp, code, { diet = false, search = "", rng = 0.1 } = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(rng => {
    window.__ev = []; let f, d = 0; Object.defineProperty(window, "stemT", { configurable: true, get: () => f, set: v => { f = (n, p) => { if (!d++) try { window.__ev.push([n, JSON.parse(JSON.stringify(p || {}))]); } catch { /* */ } try { return v(n, p); } finally { d--; } }; } });   // telemetry from boot
    try { if (sessionStorage.getItem("__rng") == null) sessionStorage.setItem("__rng", String(rng)); } catch { /* */ }
    window.__stemHelpRand = () => +sessionStorage.getItem("__rng");
    const pn = performance.now.bind(performance); performance.now = () => pn() + 1000 * (+sessionStorage.getItem("__skew") || 0);
    try { if (!sessionStorage.getItem("__lh_init")) { sessionStorage.setItem("__lh_init", "1"); localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } } catch { /* */ }
  }, rng);
  if (diet) await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/" + search + "#" + code);
  await ready(page, code);
  return page;
}
async function ready(page, code) {
  await page.waitForFunction(c => !document.getElementById("splash") && !!window.__drill && window.__drill.state && window.__drill.state.code === c && !document.getElementById("freeze").hidden, code, { timeout: 10000 });
}
const rng = (page, v) => page.evaluate(v => sessionStorage.setItem("__rng", String(v)), v);
const skew = (page, s) => page.evaluate(s => sessionStorage.setItem("__skew", String((+sessionStorage.getItem("__skew") || 0) + s)), s);
const go = async (page, code) => { await page.evaluate(c => { location.hash = "#" + c; }, code); await ready(page, code); };
async function wrong(page, id) {
  const k = await page.evaluate(() => window.__drill.state.tries.length);
  if (await page.locator(".vdrawer:not([hidden]) .vd-x").first().isVisible()) await page.click(".vdrawer:not([hidden]) .vd-x", { timeout: 2000 }).catch(() => {});
  if (await page.locator("#toast.on").first().isVisible()) await page.click("#toast.on", { timeout: 2000 }).catch(() => {});
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, k, { timeout: 5000 });
}
const helped = page => page.evaluate(() => window.stemT("cluck_open", { tab: "explain" }));   // Jev only: q.help = true, so S6 stays quiet and the lock is the trigger
const shown = page => page.evaluate(d => { const e = document.querySelector(d); return !!e && e.getClientRects().length > 0; }, DLG);
const up = (page, t = 4000) => page.waitForSelector(DLG, { state: "visible", timeout: t });
const gone = async page => { await page.waitForTimeout(1800); return !(await shown(page)); };
const key = page => page.evaluate(() => localStorage.getItem("stem-lockhelp"));
const lhev = page => page.evaluate(() => window.__ev.filter(e => e[0] === "lockhelp").map(e => e[1]));
const lines = page => page.evaluate(() => window.stemJev().lines.filter(l => /jev {2}help /.test(l)));
/* HA established: one wrong submit on CALC1_LHP3 (1 try: held reason=mode, no modal), then the item under test is opened (its first wrong makes 2 in the last 3 items) */
async function primed(vp, code, o = {}) {
  const page = await open(vp, "CALC1_LHP3", o);
  await wrong(page, "b"); await go(page, code);
  return page;
}
const noThanks = async page => { await page.click(`${DLG} button:has-text("No thanks")`); await page.waitForTimeout(200); };

for (const [vn, vp] of Object.entries(VPS)) {
  await step(`(a) ${vn}: lock -> say-line, art, exactly 2 buttons, focus on Open help panel, the strip chip drawn, NO box`, async () => {
    const page = await open(vp, "CALC1_LHP1");
    await wrong(page, "b"); await wrong(page, "c");                      // 2 wrong submits, no help taken = HA by itself; the 1st (a fresh student's S6) held reason=scn
    await up(page);
    const s = await page.evaluate(d => { const e = document.querySelector(d), a = document.activeElement, col = e.firstElementChild;
      const flat = [col, ...col.children];   // everything between the backdrop and the art / buttons (the buttons themselves are exempt)
      const boxed = flat.filter(x => { const c = getComputedStyle(x); return (c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent") ||
        ["Top", "Right", "Bottom", "Left"].some(k => parseFloat(c["border" + k + "Width"]) > 0 && c["border" + k + "Style"] !== "none") || c.boxShadow !== "none"; }).map(x => x.className);
      return { say: document.getElementById("lhSay").textContent, lab: document.getElementById(e.getAttribute("aria-labelledby"))?.textContent, modal: e.getAttribute("aria-modal"),
        btns: [...e.querySelectorAll("button")].map(b => b.textContent.trim()),
        geo: (() => { const r = x => x.getBoundingClientRect(), im = r(e.querySelector("img")), bs = [...e.querySelectorAll("button")].map(r), colw = r(col).width;
          const sr = document.createRange(); sr.selectNodeContents(document.getElementById("lhSay")); const tx = sr.getBoundingClientRect();
          return { sayText: tx.left + tx.width / 2, art: im.left + im.width / 2, ys: bs.map(b => Math.round(b.top)), ws: bs.map(b => Math.round(b.width)), colw: Math.round(colw), lefts: bs.map(b => Math.round(b.left)) }; })(), kids: [...col.children].map(c => c.tagName), focus: a && a.textContent.trim(),
        chip: !!document.querySelector(":is(#wish, .rbox) .wchip"), img: !!e.querySelector("img[src*='duck-calm-nod-128']"), imgW: e.querySelector("img").getBoundingClientRect().width,
        scroll: getComputedStyle(document.body).overflow, boxed, bd: getComputedStyle(e).backgroundColor, bdA: (m => m ? +m[1] : 1)(getComputedStyle(e).backgroundColor.match(/\/\s*([\d.]+)\s*\)/)) }; }, DLG);
    assert.equal(s.say, "Let me help you with that!"); assert.equal(s.lab, s.say); assert.equal(s.modal, "true");
    assert.deepEqual(s.btns, ["Open help panel", "No thanks"]); assert.deepEqual(s.kids, ["P", "IMG", "DIV"]);
    assert.ok(Math.abs(s.geo.sayText - s.geo.art) <= 2, "the say-line text is centred over the art " + JSON.stringify(s.geo));
    assert.ok(s.geo.ys[0] < s.geo.ys[1], "stacked: the primary on top"); assert.ok(s.geo.ws.every(w => Math.abs(w - s.geo.colw) <= 2), "full width " + JSON.stringify(s.geo)); assert.equal(s.geo.lefts[0], s.geo.lefts[1]);
    assert.equal(s.focus, "Open help panel"); assert.ok(s.chip, "the strip chip is drawn before the modal"); assert.ok(s.img); assert.ok(s.imgW <= 128);
    assert.equal(s.scroll, "hidden"); assert.deepEqual(s.boxed, [], "no box / border / background between the backdrop and the art + buttons"); assert.notEqual(s.bd, "rgba(0, 0, 0, 0)");
    assert.ok(s.bdA >= 0.88, "Tony Nov 5 'darker': the backdrop is the page at 88%, so nothing behind reads through (alpha " + s.bdA + ")");
    if (vn === "phone") await page.screenshot({ path: join(SHOTS, "lockhelp-390-dpr2.png") });
    const e = await lhev(page); assert.deepEqual(e.map(x => [x.phase, x.reason]), [["held", "scn"], ["shown", undefined]]); assert.equal(e[1].via, "lock");
    assert.ok((await lines(page)).some(l => /help p=0\.95 via=lock scn=ha fired/.test(l)));
    assert.deepEqual([e[0].scn, e[1].scn], ["none", "ha"]);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
}
await step("(m) a fresh student's first wrong (S6 live, no HA / ND) -> held reason=scn, no modal, no key; the jev line + telemetry carry scn=none (q)", async () => {
  const page = await open(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b");
  assert.ok(await gone(page)); assert.equal(await key(page), null);
  assert.ok((await lines(page)).some(l => /help p=0 via=s6 scn=none held reason=scn/.test(l)), (await lines(page)).join("|"));
  const e = (await lhev(page)); assert.deepEqual([e.length, e[0].phase, e[0].reason, e[0].scn, e[0].via], [1, "held", "scn", "none", "s6"]);
  await page.context().close();
});
await step("(n)(c) HA across items: a wrong on the item before + the first wrong here -> shown (S6, p .8, scn=ha); max 1 per item, so the lock then adds nothing (held reason=item)", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await up(page);
  const sh = (await lhev(page)).find(x => x.phase === "shown"); assert.deepEqual([sh.via, sh.scn, sh.p], ["s6", "ha", 0.8]);
  assert.ok((await lines(page)).some(l => /help p=0\.8 via=s6 scn=ha fired/.test(l)));
  await noThanks(page); await wrong(page, "c");
  assert.ok(await gone(page)); assert.ok((await lines(page)).some(l => /held reason=item/.test(l)));
  assert.equal((await lhev(page)).filter(e => e.phase === "shown").length, 1);
  await page.context().close();
});
await step("(p) HA blocked by a hand Cluck open: on an earlier item of the last 3, or on this one -> held reason=scn, no modal", async () => {
  const page = await open(VPS.phone, "CALC1_LHP3");
  await helped(page); await wrong(page, "b"); await go(page, "CALC1_LHP1");            // the hand open is on the item before
  await wrong(page, "b"); await wrong(page, "c");
  assert.ok(await gone(page)); assert.equal(await key(page), null);
  assert.ok((await lines(page)).some(l => /via=lock scn=none held reason=scn/.test(l)), (await lines(page)).join("|"));
  const pg2 = await open(VPS.phone, "CALC1_LHP1");
  await helped(pg2); await wrong(pg2, "b"); await wrong(pg2, "c");                   // ... or on this item
  assert.ok(await gone(pg2)); assert.ok((await lines(pg2)).some(l => /via=lock scn=none held reason=scn/.test(l)));
  await page.context().close(); await pg2.context().close();
});
await step("(b) the roll >= p -> held reason=rng, nothing shown, no key", async () => {
  const page = await open(VPS.phone, "CALC1_LHP1", { rng: 0.99 });
  await wrong(page, "b"); await wrong(page, "c");
  assert.ok(await gone(page)); assert.equal(await key(page), null);
  assert.ok((await lines(page)).some(l => /help p=0\.95 via=lock scn=ha held reason=rng/.test(l)), (await lines(page)).join("|"));
  const e = (await lhev(page)).find(x => x.reason === "rng"); assert.equal(e.phase, "held"); assert.equal(e.roll, 0.99); assert.equal(e.scn, "ha");
  await page.context().close();
});
await step("(d)(d2) the next item within 60 s -> held reason=gap; the same item, a later trigger after the gap -> shown", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await up(page); await noThanks(page);                // item 1: shown (S6, HA), No thanks (gap 120 s)
  await go(page, "CALC1_LHP2"); await wrong(page, "b");
  assert.ok(await gone(page)); assert.ok((await lines(page)).some(l => /held reason=gap/.test(l)), (await lines(page)).join("|"));
  await skew(page, 130); await wrong(page, "c");                                // item 2 again, the lock after the gap: the roll was not spent
  await up(page); assert.equal((await lhev(page)).filter(e => e.phase === "shown").pop().via, "lock");
  await page.context().close();
});
await step("(e) after No thanks the next fire needs >= 120 s", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await up(page); await noThanks(page);
  await skew(page, 70); await go(page, "CALC1_LHP2"); await wrong(page, "b"); await wrong(page, "c");   // 70 s: past 60, short of 120
  assert.ok(await gone(page));
  await skew(page, 60); await go(page, "CALC1_LHP4"); await wrong(page, "b");                          // 130 s since the show
  await up(page);
  await page.context().close();
});
await step("(f) S5 double wrong within 3 s -> shown", async () => {
  const page = await open(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await wrong(page, "c");
  await up(page);
  assert.ok((await page.evaluate(() => window.stemJev().lines)).some(l => /jev {2}S5 fast x2/.test(l)));
  await page.context().close();
});
await step("(g) reload -> re-shown (reshown); leaving the item keeps the key, coming back re-shows it", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await up(page);
  assert.equal(JSON.parse(await key(page)).via, "s6");
  await page.reload(); await ready(page, "CALC1_LHP1"); await up(page);
  assert.equal((await lhev(page))[0].phase, "reshown");
  await go(page, "CALC1_LHP2"); await page.waitForTimeout(400);
  assert.ok(!(await shown(page)), "not on another item"); assert.ok(await key(page), "the key stays");
  assert.ok((await lhev(page)).some(e => e.phase === "left"));
  await go(page, "CALC1_LHP1"); await up(page);
  await page.context().close();
});
await step("(h) backdrop tap + Escape + Tab keep it; Tab stays between the 2 buttons", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1");
  await wrong(page, "b"); await up(page);
  await page.mouse.click(5, 5); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  assert.ok(await shown(page), "still up");
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Tab"); assert.ok(await page.evaluate(d => document.querySelector(d).contains(document.activeElement), DLG), "focus trapped"); }
  assert.ok(await key(page));
  await page.context().close();
});
await step("(i) diet -> never (held reason=mode)", async () => {
  const page = await open(VPS.phone, "CALC1_LHP1", { diet: true });
  assert.equal(await page.evaluate(() => document.cookie.includes("stem-mode=diet")), true);
  await wrong(page, "b"); await wrong(page, "c");
  assert.ok(await gone(page)); assert.equal(await key(page), null);
  assert.ok((await lines(page)).some(l => /held reason=mode/.test(l)));
  await page.context().close();
});
await step("(j) ?jev=0 -> never", async () => {
  const page = await open(VPS.phone, "CALC1_LHP1", { search: "?jev=0" });
  assert.equal(await page.evaluate(() => typeof window.stemJev), "undefined");
  await wrong(page, "b"); await wrong(page, "c");
  assert.ok(await gone(page)); assert.equal(await key(page), null);
  await page.context().close();
});
for (const [vn, vp] of Object.entries(VPS)) {
  await step(`(k) ${vn}: Open help panel -> closes, key cleared, the Cluck sheet opens on explain`, async () => {
    const page = await primed(vp, "CALC1_LHP2");
    await wrong(page, "b"); await up(page);
    await page.click(`${DLG} button:has-text("Open help panel")`);
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    assert.ok(!(await shown(page))); assert.equal(await key(page), null);
    const ev = await page.evaluate(() => window.__ev.filter(e => e[0] === "cluck_open").map(e => e[1]));
    assert.ok(ev.some(e => e.tab === "explain" && !e.auto), "clOpen explain, not auto");
    assert.equal((await lhev(page)).at(-1).phase, "open_help");
    await page.context().close();
  });
}
await step("(l) telemetry: held -> shown -> no_thanks, each exactly one event with the props", async () => {
  const page = await primed(VPS.phone, "CALC1_LHP1", { rng: 0.99 });
  await wrong(page, "b");                                                      // item 1: S6 (HA) rolls 0.99 -> held (rng)
  await rng(page, 0.12); await skew(page, 70); await go(page, "CALC1_LHP2"); await wrong(page, "b");   // item 2: shown
  await up(page); await noThanks(page);
  const e = (await lhev(page)).filter(x => x.reason !== "mode");               // (the priming wrong on the 1-try item held reason=mode)
  assert.deepEqual(e.map(x => x.phase), ["held", "shown", "no_thanks"]);
  assert.deepEqual([e[0].via, e[0].reason, e[0].roll, e[0].p], ["s6", "rng", 0.99, 0.8]); assert.equal(e[0].scn, "ha");
  const sh = e[1]; assert.deepEqual([sh.code, sh.item, sh.via, sh.p, sh.roll, sh.gap_s, sh.shown_count, sh.tries_used, sh.after_wrong], ["CALC1_LHP2", "CALC1_LHP2", "s6", 0.8, 0.12, 60, 1, 1, 1]); assert.equal(sh.scn, "ha");
  assert.equal(sh.decide_ms, undefined); assert.ok(e[2].decide_ms >= 0); assert.equal(e[2].via, "s6");
  assert.ok(!JSON.stringify(e).includes("5.4 m/s"), "no typed text");
  await page.context().close();
});
await step("a 2-choice mc (one try) -> held reason=mode, never shown", async () => {
  const page = await open(VPS.phone, "CALC1_LHP3");
  await wrong(page, "b");
  assert.ok(await gone(page)); assert.ok((await lines(page)).some(l => /held reason=mode/.test(l)));
  await page.context().close();
});
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
