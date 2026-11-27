// VERDICT-DRAW smoke (Tony Nov 26): every ✓ / ✕ verdict mark draws on with #764's .vk animation when the verdict lands LIVE
// (typed single, multi part, proof, MC tile, pick-all, repair ladder chip + step head, welcome ladder chip + step head), and is
// STATIC when the same answered item is restored on reload. One class (.vmark-live, verdict-v7.css §vmark) + #764's one keyframe
// set (strip.css vk-in / vk-draw). prefers-reduced-motion = no animation.
// Own serve.py + a throwaway bank (proof /check stubbed: this spec is about the mark, not the grader).
//   node tests/verdict-draw.smoke.mjs [port]
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
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8941, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "verdict-draw-")), BANKS = join(TMP, "banks");
const txt = md => [{ type: "text", md }];
const LADDER = { steps: [
  { id: "given", label: "Name the sign", kind: "pick", opts: [{ id: "a", md: "plus" }, { id: "b", md: "minus" }], ok: "a" },
  { id: "signs", label: "Which sign?", kind: "pick", opts: [{ id: "a", md: "+" }, { id: "b", md: "−" }], ok: "a", fam: "sign",
    why: { q: "Why that sign?", opts: ["It keeps it", "It drops it", "It flips it"], ok: 2 } },
  { id: "answer", label: "Final answer", kind: "num", ok: "4", tol: 0.01 }
] };
const WELCOME_LADDER = { steps: [
  { id: "one", label: "Which is bigger?", kind: "pick", opts: [{ id: "a", md: "2" }, { id: "b", md: "3" }], ok: "a" },
  { id: "two", label: "Pick the sum", kind: "pick", opts: [{ id: "a", md: "5" }, { id: "b", md: "6" }], ok: "a" },
  { id: "answer", label: "Final answer", kind: "num", ok: "5", tol: 0.01 }
] };
const ITEMS = [
  { code: "CALC1_DV1", type: "num", answer: "4", tol: 0.01, body: txt("What is $2+2$?") },
  { code: "CALC1_DV2", type: "multi", body: txt("Add them."), parts: [
    { label: "a", prompt: "first", type: "num", answer: "2", tol: 0.01 },
    { label: "b", prompt: "second", type: "num", answer: "3", tol: 0.01 }] },
  { code: "CALC1_DV3", type: "mc", body: txt("Pick the even one."), choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }, { id: "c", md: "5" }], correct: "a" },
  { code: "CALC1_DV4", type: "mc", pick: "all", body: txt("Tick every even one."), how: "Tick all that are true.", choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }, { id: "c", md: "4" }], correct: ["a", "c"], miss: "QUACK. miss" },
  { code: "CALC1_DV5", type: "proof", body: txt("Say what a schema is."), how: "In your own words.", proof: { reference: "A mental frame for sorting new facts." } },
  { code: "CALC1_DV6", type: "num", answer: "4", tol: 0.01, body: txt("What is $2+2$?"), wrong: [{ match: "3", error: "sign", hint: "QUACK. sign" }], repair: LADDER },
  { code: "CALC1_DV7", type: "num", answer: "5", tol: 0.01, welcome: true, noob: { tier: 1 }, body: txt("What is $2+3$?"), repair: WELCOME_LADDER }
];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_DRAW.json"), JSON.stringify({ v: 1, problems: ITEMS }));

const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DRAW",
  STEM_FRONT_TITLE: "Draw", STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
async function open(code, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block", reducedMotion: o.reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.route("**/check", r => r.request().postDataJSON()?.code === "CALC1_DV5" ? r.fulfill({ json: { verdict: "correct" } }) : r.continue());
  await page.goto(`${BASE}/?ui=v7${code ? "#" + code : ""}`);
  const opened = await page.waitForFunction(c => !document.querySelector("#freeze").hidden && (!c || document.querySelector("#pcode")?.textContent === c), code || null, { timeout: 10000 }).then(() => true, () => false);
  assert.ok(opened, `the question ${code || "(front)"} did not open`);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { ctx, page };
}
/* the mark's computed animation-name, and its paths' dash state, a task after it lands */
const anim = async (page, sel) => (await page.waitForFunction(sel => {
  const el = document.querySelector(sel);
  return el && getComputedStyle(el).animationName !== "none" ? { name: getComputedStyle(el).animationName, dash: [...el.querySelectorAll("path")].map(p => getComputedStyle(p).animationName) } : null;
}, sel, { timeout: 8000 })).jsonValue();
const still = async (page, sel) => {
  await page.waitForFunction(sel => !!document.querySelector(sel), sel, { timeout: 8000 });
  return (await page.waitForFunction(sel => {
    const el = document.querySelector(sel);
    return el && getComputedStyle(el).animationName === "none" ? { name: "none", dash: [...el.querySelectorAll("path")].map(p => getComputedStyle(p).animationName) } : null;
  }, sel, { timeout: 5000 })).jsonValue();
};

try {
  await step("typed single: live tick draws (vk-in / vk-draw); the reload is still", async () => {
    const { ctx, page } = await open("CALC1_DV1");
    await page.fill("#q #ans", "4"); await page.click("#ansGo");
    const a = await anim(page, "#ff .vk[data-v=i-ok]");
    assert.equal(a.name, "vk-in", "the live tick is not vk-in: " + JSON.stringify(a));
    assert.ok(a.dash.includes("vk-draw"), "the tick's path is not drawing: " + JSON.stringify(a));
    await page.reload();
    const s = await still(page, "#ff .vk[data-v=i-ok]");
    assert.equal(s.name, "none", "the restored tick replayed: " + JSON.stringify(s));
    assert.ok(s.dash.every(x => x === "none"), "a restored path replayed: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("multi part: live tick draws; the reload is still", async () => {
    const { ctx, page } = await open("CALC1_DV2");
    await page.fill('#q .part[data-i="0"] .ans', "2"); await page.press('#q .part[data-i="0"] .ans', "Enter");
    const a = await anim(page, '#q .part[data-i="0"] .vk[data-v=i-ok]');
    assert.equal(a.name, "vk-in", "the live part tick is not vk-in: " + JSON.stringify(a));
    await page.reload();
    const s = await still(page, '#q .part[data-i="0"] .vk[data-v=i-ok]');
    assert.equal(s.name, "none", "the restored part tick replayed: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("MC tile: live tick draws; the reload is still", async () => {
    const { ctx, page } = await open("CALC1_DV3");
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
    const a = await anim(page, '#q .opt[data-id="a"] .vg');
    assert.equal(a.name, "vk-in", "the live MC tick is not vk-in: " + JSON.stringify(a));
    await page.reload();
    const s = await still(page, '#q .opt[data-id="a"] .vg');
    assert.equal(s.name, "none", "the restored MC tick replayed: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("pick-all: live tick draws; the reload is still", async () => {
    const { ctx, page } = await open("CALC1_DV4");
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .opt[data-id="c"]'); await page.click("#mcGo");
    const a = await anim(page, '#q .opt[data-id="a"] .badge[data-v=i-ok]');
    assert.equal(a.name, "vk-in", "the live pick-all tick is not vk-in: " + JSON.stringify(a));
    await page.reload();
    const s = await still(page, '#q .opt[data-id="a"] .badge[data-v=i-ok]');
    assert.equal(s.name, "none", "the restored pick-all tick replayed: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("proof: live tick draws; the reload is still", async () => {
    const { ctx, page } = await open("CALC1_DV5");
    await page.fill("#q #ans", "A mental frame for sorting new facts.");
    await page.click("#ansGo");
    const a = await anim(page, "#ff.proof .vk[data-v=i-ok]");
    assert.equal(a.name, "vk-in", "the live proof tick is not vk-in: " + JSON.stringify(a));
    await page.reload();
    const s = await still(page, "#ff.proof .vk[data-v=i-ok]");
    assert.equal(s.name, "none", "the restored proof tick replayed: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("repair ladder: the live chip cross draws, a redraw is still, the worked step's tick is still, the earned step tick draws", async () => {
    const { ctx, page } = await open("CALC1_DV6");
    await page.fill("#q #ans", "3"); await page.click("#ansGo");
    await page.waitForSelector("section.rp .rp-step[data-state=active]", { timeout: 8000 });
    const worked = await still(page, '.rp-step[data-id="given"] .rp-ok');
    assert.equal(worked.name, "none", "a worked step's tick animated on mount: " + JSON.stringify(worked));
    await page.click('.rp-step[data-state=active] .rp-chip[data-v="b"]');
    const x = await anim(page, '.rp-chip.rp-tried .rp-vg[data-v=i-x]');
    assert.equal(x.name, "vk-in", "the live chip cross is not vk-in: " + JSON.stringify(x));
    await page.click('.rp-step[data-state=active] .rp-why .rp-chip[data-why="0"]');   // a wrong why: the step stays active and redraws its value chips
    const again = await still(page, '.rp-chip.rp-tried .rp-vg[data-v=i-x]');
    assert.equal(again.name, "none", "the chip cross replayed on a redraw: " + JSON.stringify(again));
    await page.click('.rp-step[data-state=active] .rp-chip[data-v="a"]');
    await page.click('.rp-step[data-state=active] .rp-why .rp-chip[data-why="2"]');
    const earned = await anim(page, '.rp-step[data-id="signs"] .rp-ok[data-v=i-ok]');
    assert.equal(earned.name, "vk-in", "the earned step tick is not vk-in: " + JSON.stringify(earned));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("welcome ladder: the live step tick draws, a redraw is still", async () => {
    const { ctx, page } = await open("");
    await page.waitForSelector("section.wl .rp-step[data-state=active]", { timeout: 8000 });
    await page.click('.rp-step[data-state=active] .rp-chip[data-v="a"]');
    const a = await anim(page, '.rp-step[data-id="one"] .rp-ok[data-v=i-ok]');
    assert.equal(a.name, "vk-in", "the live welcome tick is not vk-in: " + JSON.stringify(a));
    const chip = await anim(page, '.rp-step[data-id="one"] .rp-chip.rp-picked .rp-vg[data-v=i-ok]');
    assert.equal(chip.name, "vk-in", "the live welcome chip tick is not vk-in: " + JSON.stringify(chip));
    await page.click('.rp-step[data-state=active] .rp-chip[data-v="b"]');   // welcome: a wrong tap is a hint, the ladder redraws
    const s = await still(page, '.rp-step[data-id="one"] .rp-ok[data-v=i-ok]');
    assert.equal(s.name, "none", "the welcome tick replayed on a redraw: " + JSON.stringify(s));
    const cs = await still(page, '.rp-step[data-id="one"] .rp-chip.rp-picked .rp-vg[data-v=i-ok]');
    assert.equal(cs.name, "none", "the welcome chip tick replayed on a redraw: " + JSON.stringify(cs));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });

  await step("prefers-reduced-motion: a live verdict is static", async () => {
    const { ctx, page } = await open("CALC1_DV1", { reduced: true });
    await page.fill("#q #ans", "4"); await page.click("#ansGo");
    const s = await still(page, "#ff .vk[data-v=i-ok]");
    assert.equal(s.name, "none", "reduced motion still animated: " + JSON.stringify(s));
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all ok");
