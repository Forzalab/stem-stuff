// VERDICT-MORPH smoke (SHIPPED KEY, Tony Nov 26): under html.ui-v7 every family's Check / Next is ONE key. Its one
// <svg><path> morphs arrow -> spin (grading, spinning) -> cross / tick (120ms, spin frozen on the next 180deg) ->
// HOLD 600ms -> EXIT 200ms back to the arrow: right ends --chip / --ink (Next), wrong ends .35 (retry Check inert,
// Next still clickable). No .vm-ico, no 1150ms flood timeline. Flag off is untouched.
// Phone 390x844, diet cookies, own serve.py:  node tests/verdict-morph.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8837), BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "verdict-morph-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const txt = md => [{ type: "text", md }];
const FILE = { v: 1, problems: [
  { code: "PROBE_TY1", type: "num", answer: "4", tol: 0.01, body: txt("What is $2+2$?") },
  { code: "PROBE_MC1", type: "mc", body: txt("Pick the even one."), choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }, { id: "c", md: "5" }], correct: "a" },
  { code: "PROBE_MU1", type: "multi", body: txt("Add them."), parts: [
    { label: "a", prompt: "first", type: "num", answer: "2", tol: 0.01 },
    { label: "b", prompt: "second", type: "num", answer: "3", tol: 0.01 }] },
  { code: "PROBE_PF1", type: "proof", body: txt("Say what a schema is."), how: "In your own words.", proof: { reference: "A mental frame." } },
  { code: "PROBE_ALL", type: "mc", pick: "all", shuffle: false, body: txt("Even numbers?"), how: "Tick all that are true.",
    choices: ["2", "3", "4", "5"].map((md, i) => ({ id: "abcd"[i], md })), correct: ["a", "c"], miss: "QUACK. miss" },
] };
writeFileSync(join(BANKS, "BANK_MORPH.json"), JSON.stringify(FILE));

const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_MORPH", STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const ARROW = "M5 12";
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }

const look = (page, sel) => page.evaluate(sel => {
  const k = document.querySelector(sel); if (!k) return null;
  const s = k.querySelector("svg.ib1-go"), p = s && s.querySelector("path"), cs = getComputedStyle(k);
  const d = p && (getComputedStyle(p).d || p.getAttribute("d"));
  const m = String(d || "").replace(/([ML])\s+/g, "$1").match(/M[\d.]+ [\d.]+/);
  return { id: k.id, cls: k.className, op: +cs.opacity, bg: cs.backgroundColor, color: cs.color, w: k.getBoundingClientRect().width,
    anim: s && getComputedStyle(s).animationName, start: m && m[0], off: !!k.disabled };
}, sel);
// wait until the key has landed on `want` AND every CSS transition on it is done: the 120ms `d` morph / colour / opacity
// runs on the path / button, so a bare computed-d match can fire before the first frame and read a mid-morph value.
const settled = (page, sel, want) => page.waitForFunction(([sel, want]) => {
  const k = document.querySelector(sel); if (!k) return false;
  const p = k.querySelector("svg.ib1-go path"); if (!p) return false;
  const m = String(getComputedStyle(p).d || p.getAttribute("d") || "").replace(/([ML])\s+/g, "$1").match(/M[\d.]+ [\d.]+/);
  if (!m || m[0] !== want) return false;
  return p.getAnimations().every(a => a.playState === "finished") && k.getAnimations().every(a => a.playState === "finished");
}, [sel, want], { timeout: 2000 });
// BUSY: the spinner glyph has landed and the svg turns (its own key-spin), the button's colour / opacity settled
const busyKey = (page, sel) => page.waitForFunction(sel => {
  const k = document.querySelector(sel); if (!k) return false;
  const s = k.querySelector("svg.ib1-go"), p = s && s.querySelector("path"); if (!p) return false;
  const m = String(getComputedStyle(p).d || p.getAttribute("d") || "").replace(/([ML])\s+/g, "$1").match(/M[\d.]+ [\d.]+/);
  return !!m && m[0] === "M12 4.5" && getComputedStyle(s).animationName !== "none"
    && p.getAnimations().every(a => a.playState === "finished") && k.getAnimations().length === 0;
}, sel, { timeout: 4000 });

async function open(code, ui = true, delay = 0) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  if (delay) await page.route("**/check", async r => { await new Promise(x => setTimeout(x, delay)); r.continue(); });
  if (code === "PROBE_PF1") await page.route("**/check", async r => { if (delay) await new Promise(x => setTimeout(x, delay)); r.fulfill({ json: { verdict: "correct" } }); });
  await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}#${code}`);
  const ok = await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 10000 }).then(() => true, () => false);
  assert.ok(ok, `the question ${code} did not open`);
  return { ctx, page };
}

try {
  await step("typed right: busy spins, tick holds, exits to the plain --chip / --ink Next", async () => {
    const { ctx, page } = await open("PROBE_TY1", true, 700);
    await page.fill("#q #ans", "4"); await page.click("#ansGo");
    await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 4000 });
    await busyKey(page, "#ansGo");
    const busy = await look(page, "#ansGo");
    assert.notEqual(busy.anim, "none", "busy: the key's svg spins: " + JSON.stringify(busy));
    assert.equal(busy.start, "M12 4.5", "busy: the glyph is the spinner: " + busy.start);
    assert.equal(busy.op, 1, "busy: the face stays full (no .55 dim): " + busy.op);
    await page.waitForSelector("#q .nx.k-ok", { timeout: 5000 });
    await settled(page, "#q .nx", "M5.5 12.5");
    const tick = await look(page, "#q .nx");
    assert.equal(tick.start, "M5.5 12.5", "the tick: " + JSON.stringify(tick));
    assert.equal(tick.bg, "rgb(16, 38, 31)", "right: --correct-fill face: " + tick.bg);
    await settled(page, "#q .nx", ARROW);
    const done = await look(page, "#q .nx");
    assert.doesNotMatch(done.cls, /k-ok|k-bad/, "the verdict classes leave after the hold: " + done.cls);
    assert.equal(done.start, ARROW, "exit: the arrow is back: " + done.start);
    assert.equal(done.bg, "rgb(40, 51, 82)", "right: the Next face is --chip again: " + done.bg);
    assert.equal(done.op, 1, "right: full opacity");
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("typed wrong (retry open): cross on the Check, then the dim arrow until the next edit", async () => {
    const { ctx, page } = await open("PROBE_TY1", true, 700);
    await page.fill("#q #ans", "5"); await page.click("#ansGo");
    await page.waitForSelector("#ansGo.k-bad", { timeout: 5000 });
    await settled(page, "#ansGo", "M7 7");
    const cross = await look(page, "#ansGo");
    assert.equal(cross.start, "M7 7", "the cross: " + JSON.stringify(cross));
    assert.equal(cross.bg, "rgb(42, 26, 36)", "wrong: --wrong-fill face: " + cross.bg);
    await settled(page, "#ansGo", ARROW);
    const dim = await look(page, "#ansGo");
    assert.equal(dim.start, ARROW, "exit: the arrow is back: " + dim.start);
    assert.equal(dim.op, 0.35, "wrong: the retry key waits at .35: " + dim.op);
    assert.equal(dim.off, true, "wrong: the retry key is inert until the edit");
    await page.fill("#q #ans", "4");
    await page.waitForFunction(() => { const k = document.querySelector("#ansGo"); return !k.disabled && +getComputedStyle(k).opacity >= .999; }, null, { timeout: 3000 });
    await ctx.close();
  });

  await step("MC: the key is the 60px .chk key (never in a tile), busy spins, right exits to the Next arrow", async () => {
    const { ctx, page } = await open("PROBE_MC1", true, 700);
    const before = await page.evaluate(() => ({ chk: !!document.querySelector("#q .chk #mcGo"), tile: !!document.querySelector("#q .ch .send"), w: document.querySelector("#mcGo").getBoundingClientRect().width }));
    assert.deepEqual(before, { chk: true, tile: false, w: 60 }, "MC key place: " + JSON.stringify(before));
    await page.click('#q .opt[data-id="a"]'); await page.click("#mcGo");
    await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 4000 });
    await busyKey(page, "#mcGo");
    assert.notEqual((await look(page, "#mcGo")).anim, "none", "MC busy: svg spins");
    await page.waitForSelector("#q .nx.k-ok", { timeout: 5000 });
    await settled(page, "#q .nx", ARROW);
    const done = await look(page, "#q .nx");
    assert.equal(done.start, ARROW); assert.equal(done.bg, "rgb(40, 51, 82)");
    await ctx.close();
  });

  await step("MC wrong: the .chk key crosses, then waits dim with the arrow for the next pick", async () => {
    const { ctx, page } = await open("PROBE_MC1", true, 700);
    await page.click('#q .opt[data-id="b"]'); await page.click("#mcGo");
    await page.waitForSelector("#mcGo.k-bad", { timeout: 5000 });
    await settled(page, "#mcGo", "M7 7");
    const cross = await look(page, "#mcGo");
    assert.equal(cross.start, "M7 7", "MC wrong: the cross: " + JSON.stringify(cross));
    assert.equal(cross.bg, "rgb(42, 26, 36)", "MC wrong: --wrong-fill: " + cross.bg);
    await settled(page, "#mcGo", ARROW);
    const dim = await look(page, "#mcGo");
    assert.equal(dim.start, ARROW); assert.equal(dim.op, 0.35);
    assert.equal(dim.off, true, "MC wrong: inert until another pick");
    await ctx.close();
  });

  await step("pick-all wrong: the .chk key spins, crosses, then waits dim with the arrow for the edit", async () => {
    const { ctx, page } = await open("PROBE_ALL", true, 700);
    await page.click('#q .opt[data-id="a"]'); await page.click("#mcGo");
    await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 4000 });
    await busyKey(page, "#mcGo");
    const busy = await look(page, "#mcGo");
    assert.notEqual(busy.anim, "none", "pick-all busy: the key's svg spins: " + JSON.stringify(busy));
    assert.equal(busy.start, "M12 4.5", "pick-all busy: the spinner glyph: " + busy.start);
    assert.equal(busy.op, 1, "pick-all busy: face full: " + busy.op);
    await page.waitForSelector("#mcGo.k-bad", { timeout: 5000 });
    await settled(page, "#mcGo", "M7 7");
    const cross = await look(page, "#mcGo");
    assert.equal(cross.start, "M7 7");
    await settled(page, "#mcGo", ARROW);
    const dim = await look(page, "#mcGo");
    assert.equal(dim.start, ARROW); assert.equal(dim.op, 0.35, "wrong pick-all: .35");
    assert.equal(dim.off, true, "wrong pick-all: the retry Check is inert until the edit");
    await page.click('#q .opt[data-id="c"]');
    await page.waitForFunction(() => { const k = document.querySelector("#mcGo"); return !k.disabled && +getComputedStyle(k).opacity >= .999; }, null, { timeout: 3000 });
    await ctx.close();
  });

  await step("pick-all right: the .chk Next ticks, then exits to the plain --chip arrow", async () => {
    const { ctx, page } = await open("PROBE_ALL", true, 700);
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .opt[data-id="c"]'); await page.click("#mcGo");
    await page.waitForSelector("#q .nx.k-ok", { timeout: 5000 });
    await settled(page, "#q .nx", "M5.5 12.5");
    const tick = await look(page, "#q .nx");
    assert.equal(tick.start, "M5.5 12.5", "pick-all right: the tick: " + JSON.stringify(tick));
    assert.equal(tick.bg, "rgb(16, 38, 31)", "pick-all right: --correct-fill: " + tick.bg);
    await settled(page, "#q .nx", ARROW);
    const done = await look(page, "#q .nx");
    assert.equal(done.start, ARROW); assert.equal(done.bg, "rgb(40, 51, 82)"); assert.equal(done.op, 1);
    await ctx.close();
  });

  await step("multi wrong: the part key spins, crosses, then waits dim for the edit", async () => {
    const { ctx, page } = await open("PROBE_MU1", true, 700);
    await page.fill('#q .part[data-i="0"] .ans', "5");
    await page.press('#q .part[data-i="0"] .ans', "Enter");
    await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 4000 });
    await busyKey(page, '#q .part[data-i="0"] .send');
    const busy = await look(page, '#q .part[data-i="0"] .send');
    assert.notEqual(busy.anim, "none", "multi busy: the part key spins: " + JSON.stringify(busy));
    assert.equal(busy.start, "M12 4.5", "multi busy: the spinner glyph: " + busy.start);
    assert.equal(busy.op, 1, "multi busy: face full: " + busy.op);
    await page.waitForSelector('#q .part[data-i="0"] .send.k-bad', { timeout: 5000 });
    await settled(page, '#q .part[data-i="0"] .send', "M7 7");
    const cross = await look(page, '#q .part[data-i="0"] .send');
    assert.equal(cross.start, "M7 7", "multi wrong: the cross: " + JSON.stringify(cross));
    await settled(page, '#q .part[data-i="0"] .send', ARROW);
    const dim = await look(page, '#q .part[data-i="0"] .send');
    assert.equal(dim.start, ARROW); assert.equal(dim.op, 0.35, "multi wrong: the retry key waits at .35");
    assert.equal(dim.off, true, "multi wrong: inert until the edit");
    await ctx.close();
  });

  await step("multi: both parts right -> the last part's Next ticks then returns to the arrow", async () => {
    const { ctx, page } = await open("PROBE_MU1", true, 0);
    for (const [i, v] of [[0, "2"], [1, "3"]]) {
      await page.fill(`#q .part[data-i="${i}"] .ans`, v);
      await page.press(`#q .part[data-i="${i}"] .ans`, "Enter");
      await page.waitForFunction(i => window.__drill.state.parts?.[i]?.shut, i, { timeout: 5000 }).catch(() => {});
    }
    await page.waitForSelector("#q .nx.k-ok", { timeout: 6000 });
    await settled(page, "#q .nx", ARROW);
    const done = await look(page, "#q .nx");
    assert.equal(done.start, ARROW); assert.equal(done.bg, "rgb(40, 51, 82)");
    await ctx.close();
  });

  await step("proof: the 60px key stays in the box, spins, ticks, then returns to the arrow", async () => {
    const { ctx, page } = await open("PROBE_PF1", true, 700);
    const box = await page.evaluate(() => { const k = document.querySelector("#ff.proof #ansGo"), p = document.querySelector("#ff.proof").getBoundingClientRect(); return { w: k.getBoundingClientRect().width, inside: k.getBoundingClientRect().left >= p.left && k.getBoundingClientRect().right <= p.right }; });
    assert.deepEqual(box, { w: 60, inside: true }, "proof key: " + JSON.stringify(box));
    await page.fill("#q #ans", "A mental frame.");
    await page.click("#ansGo");
    await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 4000 });
    await busyKey(page, "#ff.proof #ansGo");
    const busy = await look(page, "#ff.proof #ansGo");
    assert.notEqual(busy.anim, "none", "proof busy: the key's svg spins: " + JSON.stringify(busy));
    assert.equal(busy.start, "M12 4.5", "proof busy: the spinner glyph: " + busy.start);
    assert.equal(busy.op, 1, "proof busy: face full: " + busy.op);
    await page.waitForSelector("#q .nx.k-ok", { timeout: 6000 });
    await settled(page, "#q .nx", ARROW);
    const done = await look(page, "#q .nx");
    assert.equal(done.start, ARROW); assert.equal(done.bg, "rgb(40, 51, 82)");
    await ctx.close();
  });

  await step("flag off: no key stages, today's g-next Next", async () => {
    const { ctx, page } = await open("PROBE_ALL", false, 0);
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .opt[data-id="c"]'); await page.click("#mcGo");
    await page.waitForFunction(() => window.__drill.state.finished, null, { timeout: 5000 });
    const e = await page.evaluate(() => { const n = document.querySelector("#q .nx"); return { k: /k-(ok|bad|wait)/.test(n?.className || ""), g: n?.classList.contains("g-next") }; });
    assert.deepEqual(e, { k: false, g: true }, "flag off Next: " + JSON.stringify(e));
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
