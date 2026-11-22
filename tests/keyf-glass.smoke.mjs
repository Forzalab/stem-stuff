// KEYF-GLASS smoke (keyf-v16, smoked-lens glass on the Key formulas card): under html.ui-v7 the card #fcard gets class kg-on and ONE
// aria-hidden .kg layer (scene + a <filter> with feDisplacementMap); the formulas (.fm) are NOT inside .kg and carry no filter; the .kg clips
// its scene (overflow hidden); symbol transforms stay still for 1 s under prefers-reduced-motion: reduce and change under no-preference;
// no page errors; the "?" still opens its popover. Own serve.py + a throwaway bank and formula sheet (as fcard-clip.pw.mjs).
//   node tests/keyf-glass.smoke.mjs [port]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8873", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "keyfglass-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const ROWS = [
  { id: "KE", tex: "K = \\frac{1}{2}mv^2", doc: { purpose: "Kinetic energy.", sym: [{ s: "m", m: "mass", u: "kg" }, { s: "v", m: "speed", u: "m/s" }] } },
  { id: "DY", tex: "\\Delta y = v_{y,0}t - \\tfrac12 gt^2", doc: { purpose: "Height in free fall." } }];
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Glass", rows: ROWS }] }));
writeFileSync(join(BANKS, "BANK_KGS.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_KG1", title: "CALC1_KG1", type: "expr", var: "x",
  points: [1, 2, 3], body: [{ type: "text", md: "Type $x$." }], answer: "x", saccharine: { title: "CALC1_KG1", part: ["KE", "DY"] } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
async function open(reducedMotion, ui = "?ui=v7") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(`${BASE}/${ui}#BANK_KGS`);
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_KG1" && document.querySelector("#fcard li.f .katex"), null, { timeout: 15000 });
  await page.evaluate(() => { while (window.stemLadder?.step()); document.fonts.ready; });
  return { ctx, page, errs };
}
const poses = page => page.evaluate(() => [...document.querySelectorAll("#fcard .kg svg [transform]")].map(e => e.getAttribute("transform")).join("|"));
try {
  const reduce = await open("reduce");
  await step("a: #fcard.kg-on has exactly one .kg child, aria-hidden, first child", async () => {
    const r = await reduce.page.evaluate(() => { const c = document.querySelector("#fcard");
      return { on: c.classList.contains("kg-on"), n: c.querySelectorAll(":scope > .kg").length, first: c.firstElementChild?.classList.contains("kg"), hid: c.querySelector(".kg")?.getAttribute("aria-hidden") }; });
    assert.deepEqual(r, { on: true, n: 1, first: true, hid: "true" });
  });
  await step("b: a <filter> with feDisplacementMap lives in the glass", async () => {
    assert.ok(await reduce.page.evaluate(() => !!document.querySelector("#fcard .kg filter feDisplacementMap")), "no feDisplacementMap in .kg");
  });
  await step("c: formulas are outside .kg and unfiltered; the scene is clipped", async () => {
    const r = await reduce.page.evaluate(() => { const fms = [...document.querySelectorAll("#fcard .fm")], kg = document.querySelector("#fcard .kg");
      return { n: fms.length, inside: fms.filter(f => kg.contains(f)).length, filt: fms.filter(f => { for (let e = f; e && e.id !== "fcard"; e = e.parentElement) if (getComputedStyle(e).filter !== "none") return true; return false; }).length,
        card: getComputedStyle(document.querySelector("#fcard")).filter, clip: getComputedStyle(kg).overflow }; });
    assert.equal(r.n, 2); assert.equal(r.inside, 0, "a .fm is inside .kg"); assert.equal(r.filt, 0, "a formula or ancestor has a CSS filter"); assert.equal(r.card, "none");
    assert.equal(r.clip, "hidden", "the .kg does not clip its scene");
  });
  await step("d: reduced motion: symbol transforms do not change over 1 s", async () => {
    await reduce.page.waitForTimeout(700);                                       // the reveal above resizes the card once: let the static pose re-fit
    const a = await poses(reduce.page); assert.ok(a.length > 0, "no symbol transforms found");
    await reduce.page.waitForTimeout(1000);
    assert.equal(await poses(reduce.page), a);
  });
  await step("f: the \"?\" still opens its popover", async () => {
    await reduce.page.locator("#fcard .fq").first().click();
    await reduce.page.waitForSelector(".pop", { state: "visible", timeout: 3000 });
  });
  await step("g: no page errors (reduced)", async () => assert.deepEqual(reduce.errs, []));
  await reduce.ctx.close();

  const live = await open("no-preference");
  await step("e: normal motion: symbol transforms change over 1 s", async () => {
    const a = await poses(live.page); assert.ok(a.length > 0, "no symbol transforms found");
    await live.page.waitForTimeout(1000);
    assert.notEqual(await poses(live.page), a, "the symbols stand still");
  });
  await step("g: no page errors (live)", async () => assert.deepEqual(live.errs, []));
  await live.ctx.close();

  const plain = await open("no-preference", "");
  await step("h: without ui-v7 there is no glass", async () => {
    assert.equal(await plain.page.evaluate(() => document.querySelectorAll("#fcard .kg, #fcard.kg-on").length), 0);
  });
  await plain.ctx.close();
} finally { await browser.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
