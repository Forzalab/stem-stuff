// VERDICT-MORPH smoke (SUBMIT-VERDICT-MORPH, Tony Nov 17): under html.ui-v7 the pick-all Check (#mcGo) hands its slot to a Next that
// flashes the verdict: key face floods green/red + a tick/cross draws on, then morphs into today's Next (plain Next = g-next; no vmorph).
// Phone 390x844, diet cookies, own serve.py with a throwaway tries.json:  node tests/verdict-morph.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8837), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "verdict-morph-")), "tries.json");
/* two pick-all problems (a jump list needs a queue, or cueNext never lands a Next): whichever opens, a, c are right and b, d wrong */
const FILE = { v: 1, problems: ["CSCI26_U01", "CSCI26_U02"].map(code => ({ code, type: "mc", pick: "all", shuffle: false,
  body: [{ type: "text", md: "Even numbers?" }], choices: ["2", "3", "4", "5"].map((md, i) => ({ id: "abcd"[i], md })),
  correct: ["a", "c"], miss: "QUACK. miss", wrong: [{ choice: "b", error: "misread", hint: "QUACK. b" }, { choice: "d", error: "misread", hint: "QUACK. d" }] })) };

const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = page => page.waitForFunction(() => /^CSCI26_U/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
const row = (page, id) => page.locator(`#q .opt[data-id="${id}"]`);
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
/* wait for the morphing Next; snap it the moment it lands, so the 300 ms window is measured from the click (not from a poll) */
const watch = (page, v) => page.evaluate(v => new Promise(res => {
  const t0 = performance.now();
  const snap = n => ({ ms: Math.round(performance.now() - t0), v: n.dataset.v, icon: !!n.querySelector("svg.vm-ico"),
    aria: n.querySelector("svg.vm-ico")?.getAttribute("aria-hidden"),
    paths: [...n.querySelectorAll("svg.vm-ico path")].map(p => [p.getAttribute("d"), p.getAttribute("pathLength")]),
    nf: !!n.querySelector(".nf"), gnext: n.classList.contains("g-next"), label: n.getAttribute("aria-label"), off: !!n.disabled });
  const mo = new MutationObserver(() => { const n = document.querySelector(`#q .nx.vmorph[data-v="${v}"]`); if (n) { mo.disconnect(); res(snap(n)); } });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  const n = document.querySelector(`#q .nx.vmorph[data-v="${v}"]`); if (n) { mo.disconnect(); res(snap(n)); }
  setTimeout(() => { mo.disconnect(); res(null); }, 2500);
}), v);
/* the flag-off case: did a .vmorph ever exist during the whole 1150 ms timeline? */
const watchNone = page => page.evaluate(() => new Promise(res => {
  let seen = false;
  const hit = () => { if (document.querySelector("#q .nx.vmorph")) seen = true; };
  const mo = new MutationObserver(hit);
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  hit();
  setTimeout(() => { mo.disconnect(); hit(); res(seen); }, 1400);
}));
async function fresh(ui) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "morph.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await opened(page);
  return { ctx, page };
}
/* one wrong try, then a second wrong try: A7K gives two in diet, and the second Check closes the question (out of tries) */
async function twoWrong(page) {
  await row(page, "b").click();
  const n0 = await tries(page);
  await page.click("#mcGo");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n0, { timeout: 4000 });
  await row(page, "d").click();
}
const endState = page => page.evaluate(() => { const n = document.querySelector("#q .nx");
  return n && { vm: n.classList.contains("vmorph"), nf: !!n.querySelector(".nf"), label: n.getAttribute("aria-label"), gnext: n.classList.contains("g-next") }; });

let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }   // only if the default launch has no browser
try {
  await step("A: ui-v7 pick-all, wrong last try: .nx.vmorph[data-v=bad] + a cross, gone after 1150 ms", async () => {
    const { ctx, page } = await fresh(true);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), true, "the ui-v7 flag is on");
    await twoWrong(page);
    const pending = watch(page, "bad");
    await page.click("#mcGo");
    const m = await pending;
    assert.ok(m, "no #q .nx.vmorph[data-v=bad] appeared: the Next is still plain");
    assert.ok(m.ms <= 300, `the morph landed after ${m.ms} ms (spec: within 300 ms)`);
    assert.equal(m.icon, true, "an svg.vm-ico rides the .nx");
    assert.equal(m.aria, "true", "the icon is aria-hidden");
    assert.deepEqual(m.paths.map(p => p[1]), ["100", "100"], "the cross: two paths, each pathLength 100");
    assert.deepEqual(m.paths.map(p => p[0]), ["M7 7 L17 17", "M17 7 L7 17"], "the cross's two strokes");
    assert.equal(m.nf, true, "the .nf label stays inside");
    assert.equal(m.gnext, false, "a vmorph .nx never carries g-next");
    assert.equal(m.label, "Next question", "aria-label unchanged");
    assert.equal(m.off, false, "the Next is still clickable during the morph");
    await page.waitForTimeout(1400);
    const e = await endState(page);
    assert.ok(e, "the Next is still there after the morph");
    assert.equal(e.vm, false, ".vmorph is removed after 1150 ms");
    assert.equal(e.nf, true, "the plain Next keeps its label");
    await ctx.close();
  });

  await step("B: ui-v7 pick-all, right last try: .nx.vmorph[data-v=ok] + a single tick", async () => {
    const { ctx, page } = await fresh(true);
    await row(page, "a").click(); await row(page, "c").click();
    const pending = watch(page, "ok");
    await page.click("#mcGo");
    const m = await pending;
    assert.ok(m, "no #q .nx.vmorph[data-v=ok] appeared: the Next is still plain");
    assert.ok(m.ms <= 300, `the morph landed after ${m.ms} ms (spec: within 300 ms)`);
    assert.equal(m.icon, true); assert.equal(m.aria, "true");
    assert.deepEqual(m.paths.map(p => [p[0], p[1]]), [["M5 12.5 L10 17.5 L19 7", "100"]], "the tick: one path, pathLength 100");
    assert.equal(m.nf, true); assert.equal(m.gnext, false); assert.equal(m.label, "Next question"); assert.equal(m.off, false);
    await page.waitForTimeout(1400);
    const e = await endState(page);
    assert.ok(e); assert.equal(e.vm, false); assert.equal(e.nf, true);
    await ctx.close();
  });

  await step("C: no ui-v7: the Next never wears .vmorph (today's g-next Next)", async () => {
    const { ctx, page } = await fresh(false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), false, "the flag is off");
    await twoWrong(page);
    const pending = watchNone(page);
    await page.click("#mcGo");
    await page.waitForFunction(() => window.__drill.state.finished, null, { timeout: 4000 });
    assert.equal(await pending, false, ".nx.vmorph appeared without ui-v7");
    const e = await endState(page);
    assert.ok(e, "the Next is there"); assert.equal(e.vm, false); assert.equal(e.gnext, true, "today's Next (g-next)");
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
