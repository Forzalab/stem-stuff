// W113 (todo 113, Tony Oct 28): Cluck's visuals are generous. The real serve.py streams from a fake Claude (CLAUDE_BASE) and the gate
// lets through what the new rules allow; the page draws it:
//   - two visuals in one reply (a ```fig and an ```openui view: "may mix 2") both draw;
//   - a Table-only view draws its table (the old "drawn?" check looked for svg / p only and blanked it);
//   - a stepper (Steps) in a chat view clicks through Back / Next;
//   - a tiny phone (slot under 300 px) gets a STATIC IMAGE of the same view, never an error box, no horizontal scroll.
// Starts its own serve.py and fake Claude:   node tests/views-static.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8874), BASE = `http://localhost:${PORT}`;
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "views-static-")), BANKS = join(TMP, "banks");
const P = { ...FIX.problem, code: "CALC1_VS1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_VS1.json"), JSON.stringify({ v: 1, problems: [P] }));

const GEO = 'root = View([ramp])\nramp = Geometry("A 0,0; B 4,0; C 4,2.3; P 2,1.15", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "angle(A,B,C,30°)", "dim(A,C,1.2 m)", "arrow(P,C,push)"], "The ramp at 30 degrees, the push up it.")';
const TABLE = 'root = View([t])\nt = Table(["step", "you", "the fix"], [["friction", "added", "taken away"], ["spring", "x", "x squared"]])';
const STEPS = 'root = View([s])\ns = Steps(null, [s1, s2, s3])\ns1 = Step("Push in: **48 J**.")\ns2 = Step("Friction takes some away.")\ns3 = Step("The spring gets what is left.")';
const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const REPLIES = {
  two: ["Not quite.\n\nForces on the block:\n", fence("fig", JSON.stringify(FIX.valid[0])) + "\n", "\nAnd the ramp:\n", fence("openui", GEO) + "\n", "\nTry once more."],
  table: ["Not quite.\n\nYour move next to the fix:\n", fence("openui", TABLE) + "\n", "\nTry once more."],
  steps: ["Not quite.\n\nClick through it:\n", fence("openui", STEPS) + "\n", "\nTry once more."],
  geo: ["Not quite.\n\nThe ramp:\n", fence("openui", GEO) + "\n", "\nTry once more."],
};
let reply = "two";
const fake = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  ev({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } });
  for (const p of REPLIES[reply]) { ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } }); await new Promise(r => setTimeout(r, 30)); }
  ev({ type: "message_delta", usage: { output_tokens: 50 } }); ev({ type: "message_stop" }); res.end();
});
await new Promise(r => fake.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "unused", CLAUDE_API: "fake", CLAUDE_BASE: `http://127.0.0.1:${fake.address().port}`, CLUCK_ARM: "claude",
  CLUCK_LIVE_FIGS: "1", CLUCK_VIEWS: "1", CLUCK_REWRITE: "0" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const has = async (page, sel) => !!(await page.$(sel));
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const init = () => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } };
async function wish(which, w, h) {
  reply = which;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "reduce" });
  await ctx.addInitScript(init);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(e.message));
  await page.goto(BASE + "/#CALC1_VS1");
  await page.waitForFunction(() => location.hash === "#CALC1_VS1" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
  await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
  await page.waitForSelector("#wish:not([hidden]) .wchip, .cl-peek .cl-cta, #cluck .wtext", { timeout: 8000 });
  if (!(await page.locator("#cluck .wtext").count())) await page.click("#wish:not([hidden]) .wchip, .cl-peek .cl-cta");
  await page.waitForFunction(() => /once more/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 15000 });
  await page.waitForTimeout(400);                                      // views.js is imported lazily
  return page;
}
const noRaw = async page => assert.doesNotMatch(await page.evaluate(() => document.querySelector("#cluck .wtext").textContent), /```|Geometry\(|Table\(|root =/);

try {
  await step("two visuals in one reply (a fig and a view): both draw", async () => {
    const page = await wish("two", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
    assert.equal(await page.locator("#cluck .wtext .wfig").count(), 2, "two figure slots");
    assert.ok(await has(page, "#cluck .wtext .wfig:not(.wview) svg"), "the fig drew");
    await noRaw(page);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a Table-only view draws its table (not blanked to the alt text)", async () => {
    const page = await wish("table", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview table.vw-tb", { timeout: 5000 });
    assert.equal(await page.locator("#cluck .wtext .wview table.vw-tb tbody tr").count(), 2);
    assert.equal(await has(page, "#cluck .wtext .wview.fig-off"), false, "never the off state");
    await noRaw(page);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a stepper in a chat view clicks through Back / Next", async () => {
    const page = await wish("steps", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview .vw-steps .vw-cap", { timeout: 5000 });
    assert.match(await page.textContent("#cluck .wview .vw-n"), /Step 1 of 3/);
    await page.click("#cluck .wview .vw-foot button:nth-child(2)");
    assert.match(await page.textContent("#cluck .wview .vw-cap"), /Friction/);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a tiny phone (280 px) gets a static image of the same view: an img with the alt, no error box, no horizontal scroll", async () => {
    const page = await wish("geo", 280, 640);
    await page.waitForSelector("#cluck .wtext .wview img.vw-static", { timeout: 6000 });
    const im = await page.$eval("#cluck .wtext .wview img.vw-static", i => ({ alt: i.alt, src: i.src.slice(0, 24), ok: i.complete && i.naturalWidth > 0, w: i.getBoundingClientRect().width }));
    assert.equal(im.alt, "The ramp at 30 degrees, the push up it.");
    assert.equal(im.src, "data:image/svg+xml;chars");
    assert.ok(im.ok, "the image decodes");
    assert.ok(im.w > 100, `drawn wide enough: ${im.w}`);
    assert.equal(await has(page, "#cluck .wtext .wview.fig-off"), false);
    const sc = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sc[0] <= sc[1], `no horizontal scroll: ${sc}`);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a desktop keeps the live view (no static image)", async () => {
    const page = await wish("geo", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
    assert.equal(await has(page, "#cluck .wtext img.vw-static"), false);
    await page.context().close();
  });
} finally {
  await browser.close();
  srv.kill(); fake.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
