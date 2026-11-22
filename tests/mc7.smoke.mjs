// MC7 smoke (Tony, Nov 21): up to 7 choices on screen (A-G, keys 1-7), one global cap (serve.py MAX_SHOWN, app.js MAX_SHOWN).
// Server: 7 -> 7; a pool of 8 -> 7 (right kept); a pool of 8 with a locked first choice: lock + right kept (the lock is the none-of-these row the server takes off the list, so 6 rows + pick all).
// Phone 390x844 + desktop 1280x800, flag ui-v7: every tile visible, no overlap, >= 44px tall; key "g" and "7" pick the 7th.
//   node tests/mc7.smoke.mjs [port]      (SHOTS=<dir> saves 7-390 / 7-1280 / 6-390)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8847), BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "mc7-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
copyFileSync(join(ROOT, "tests", "fixtures", "BANK_MC7.json"), join(BANKS, "BANK_MC7.json"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 600)); } }
const ids = async c => (await (await fetch(`${BASE}/p/${c}.json`)).json()).choices.map(x => x.id).join("");
await step("server: 6 -> 6, 7 -> 7, pool of 8 -> 7 (right h kept); pool of 8 + lock -> lock + right kept", async () => {
  assert.equal(await ids("CALC1_S601"), "abcdef");
  assert.equal(await ids("CALC1_S701"), "abcdefg");
  assert.equal(await ids("CALC1_S801"), "abcdefh");
  const lk = await (await fetch(`${BASE}/p/CALC1_S901.json`)).json();      // shown = a(lock) b c d e f h; the lock row is not listed, pick all
  assert.equal(lk.choices.map(x => x.id).join(""), "bcdefh");
  assert.equal(lk.pick, "all");
});
const browser = await launchBrowser(pw);
async function open(code, w, h) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-ui", "v7"); } catch { /* */ } });
  const p = await c.newPage();
  await p.goto(BASE + "/#BANK_MC7");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 10000 });
  await p.evaluate(h => { location.hash = h; }, code);
  await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, code, { timeout: 8000 });
  await p.waitForSelector("#qnav:not([hidden])", { timeout: 10000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => !!document.querySelector("#q .choices")?.dataset.bento, null, { timeout: 5000 });
  await p.waitForTimeout(600);
  return p;
}
const shot = async (p, n) => { if (!process.env.SHOTS) return; mkdirSync(process.env.SHOTS, { recursive: true });
  await p.evaluate(() => { for (const e of document.querySelectorAll("body *")) if (e.children.length === 0 && /Ready when you are/.test(e.textContent)) { let b = e; while (b && getComputedStyle(b).position !== "fixed") b = b.parentElement; if (b) b.style.visibility = "hidden"; } });   // the rewards banner floats over the last row in a shot
  await p.screenshot({ path: join(process.env.SHOTS, n + ".png") }); await p.screenshot({ path: join(process.env.SHOTS, n + "-full.png"), fullPage: true }); };
const geo = p => p.evaluate(() => [...document.querySelectorAll("#q .opt")].map(e => { const r = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(e.querySelector(".txt")).fontSize);
  return { l: e.dataset.l, x: r.x, y: r.y, w: r.width, h: r.height, fs, vis: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= document.documentElement.scrollHeight }; }));
const apart = (a, b) => a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
for (const [w, h, code, n, name] of [[390, 844, "CALC1_S701", 7, "7-390"], [1280, 800, "CALC1_S701", 7, "7-1280"], [390, 844, "CALC1_S601", 6, "6-390"], [1280, 800, "CALC1_S601", 6, "6-1280"]])
  await step(`${w}x${h}: ${n} tiles visible, no overlap, >= 44px tall, font >= 10`, async () => {
    const p = await open(code, w, h), g = await geo(p);
    assert.deepEqual(g.map(x => x.l), "ABCDEFG".slice(0, n).split(""));
    assert.ok(g.every(x => x.vis), "visible " + JSON.stringify(g));
    assert.ok(g.every((a, i) => g.every((b, j) => j <= i || apart(a, b))), "overlap " + JSON.stringify(g));
    assert.ok(g.every(x => x.h >= 44), "tap target " + JSON.stringify(g.map(x => x.h)));
    assert.ok(g.every(x => x.fs >= 10), "font " + JSON.stringify(g.map(x => x.fs)));
    await p.locator("#q .opt").last().click(); await p.waitForTimeout(400);                       // select the last tile: the Check key shows
    await p.evaluate(() => document.querySelector("#q .opt:last-child")?.scrollIntoView({ block: "end" })); await p.waitForTimeout(300);
    const key = await p.evaluate(() => { const k = document.querySelector("#mcGo"); if (!k || !k.offsetParent) return null; const r = k.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const gg = await geo(p);
    if (key) assert.ok(gg.every(t => apart(t, key)), "Check key covers a tile " + JSON.stringify({ key, gg }));
    await shot(p, name); await p.context().close();
  });
await step("390: key g selects the 7th, then 7 again after a", async () => {
  const p = await open("CALC1_S701", 390, 844), on = () => p.evaluate(() => document.querySelector('#q .opt[data-l="G"]').getAttribute("aria-checked"));
  await p.locator("#q .opt").first().focus(); await p.keyboard.press("g");
  assert.equal(await on(), "true");
  await p.keyboard.press("a"); assert.equal(await on(), "false");
  await p.keyboard.press("7"); assert.equal(await on(), "true");
  await p.context().close();
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "mc7 smoke ok"); process.exit(fails ? 1 : 0);
