// 160 PR-B "tool call theater" (client half): while Cluck works the wait shows its real steps (stages.js; serve.py sends "\x1e"+JSON event lines).
// Two places: Cluck's /explain reply (stage rows in the open sheet, seconds only) and the proof Check (rows + "4s / 25s" chip). A tick and
// "Thought for Ns" only once the reply / the verdict really arrived; a stall or an in-band error = no tick, "Cluck is slow, try again".
// A front server in front of serve.py plays /explain and /check(proof) by hand, so the test writes each event itself while the PAGE clock
// is paused and moved with clock.runFor (no sleeps). WIDTHS=393 or 1280 (run-all.sh parts stages@phone / stages@desk).
//   WIDTHS=393 node tests/stages.pw.mjs [port]
import { createRequire } from "node:module";
import { createServer, request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { freeze } from "./lib/clock.mjs";   // playwright-clock-race: pause the page clock around a jump
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8881, REAL = PORT + 1000, BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = (process.env.WIDTHS || "393,1280").split(",").map(Number);
const tmp = mkdtempSync(join(tmpdir(), "stages-")), banks = join(tmp, "banks");
mkdirSync(banks);
copyFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), join(banks, "BANK_PRF.json"));
const PROOF = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), "utf8")).problems[0].code;
writeFileSync(join(banks, "BANK_STG.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_STG1", title: "Stages", type: "mc", shuffle: false,
  body: [{ type: "text", md: "A car rounds a flat curve. Pick one." }], correct: "a", choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })),
  saccharine: { title: "Stages", key: "Tick: a", slip: { b: "Two is not one." } } }] }));

const RS = "\x1e", ev = (stage, at) => RS + JSON.stringify({ stage, at }) + "\n";
/* the front: POST /explain and POST /check on the proof item are played by the test (a held response it writes to); everything else is serve.py's */
const held = { explain: [], check: [] };
const front = createServer((req, res) => {
  const chunks = []; req.on("data", c => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks), path = req.url.split("?")[0];
    let b = {}; try { b = JSON.parse(body); } catch { /* not JSON */ }
    const play = path === "/explain" ? "explain" : path === "/check" && b.code === PROOF ? "check" : "";
    if (req.method === "POST" && play) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); res.flushHeaders();
      held[play].push({ body: b, write: s => res.write(s), end: () => res.end(), res });
      return;
    }
    const up = httpRequest({ host: "127.0.0.1", port: REAL, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", () => res.destroy()); up.end(body);
  });
});
await new Promise(r => front.listen(PORT, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(REAL)], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const until = async (get, what) => { for (let i = 0; i < 100; i++) { const v = get(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error("never came: " + what); };
const mk = async (w, reduced) => {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.clock.install({ time: new Date("2026-11-03T12:00:00Z") });
  return page;
};
const ready = (page, hash, sel) => page.waitForFunction(([h, s]) => !document.getElementById("splash") && location.hash === h && !document.getElementById("freeze").hidden && !!document.querySelector(s), [hash, sel], { timeout: 10000 });
const noScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "horizontal scroll");

/* a wrong pick on the MC item starts the /explain prefetch (held); the idle duck's tap opens the sheet while it runs */
async function explain(w, reduced) {
  const page = await mk(w, reduced), before = held.explain.length;
  await page.goto(BASE + "/#BANK_STG");
  await ready(page, "#CALC1_STG1", '.opt[data-id="b"]');
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  const req = await until(() => held.explain[before], "the /explain request");
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await freeze(page);
  return { page, req };
}
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent || "", sel);
const waitSel = (page, sel) => page.waitForSelector(sel, { timeout: 5000 });

for (const w of WIDTHS) {
  const tag = w < 500 ? "phone" : "desk";
  await step(`${tag}: /explain with the sheet open: the flag is sent, rows follow the events, seconds count, the tick and "Thought for" wait for the reply`, async () => {
    const { page, req } = await explain(w);
    assert.equal(req.body.stages, true, "the request asks for stages");
    req.write(ev("note", "start"));
    await waitSel(page, "#cluck .stg .stg-r.run");
    assert.match(await text(page, "#cluck .stg .stg-r.run .stg-tx"), /Fluffing feathers/);
    await page.clock.runFor(1300);
    assert.equal(await text(page, "#cluck .stg .stg-r.run .stg-s"), "1s", "the row counts its own seconds");
    assert.equal(await text(page, "#cluck .stg .stg-tmr"), "", "explain has no cap chip");
    req.write(ev("note", "end") + ev("write", "start"));
    await page.waitForFunction(() => /Drafting the wish/.test(document.querySelector("#cluck .stg .stg-r.run .stg-tx")?.textContent || ""), null, { timeout: 5000 });
    assert.match(await text(page, "#cluck .stg .stg-r.done .stg-tx"), /Fluffed feathers/, "the done row is past tense");
    assert.equal(await page.locator("#cluck .stg .stg-ok").count(), 0, "no tick before the reply");
    req.write("QUACK. Base case: clean.\nLine 3 teleports.\n");   // sent before the 2 s tick so the first words (after the 900 ms wait) are on the page without moving the clock: no caret stands in for "started" any more (Tony, Nov 4)
    await page.clock.runFor(2000);
    assert.equal(await text(page, "#cluck .stg .stg-r.run .stg-s"), "2s");
    await page.waitForFunction(() => /Base case: clean/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 5000 });
    assert.equal(await page.locator("#cluck .stg .stg-ok").count(), 0, "text is flowing, the reply is not whole yet: no tick");
    req.write(ev("write", "end")); req.end();
    await waitSel(page, "#cluck .stg .stg-sum");
    await page.click("#cluck .wtext").catch(() => {});
    await page.clock.runFor(1500);
    assert.match(await text(page, "#cluck .stg .stg-sum"), /Thought for 3s/);
    assert.equal(await page.locator("#cluck .stg .stg-ok").count(), 1, "one tick");
    const t = await text(page, "#cluck .wtext");
    assert.match(t, /Base case: clean/); assert.doesNotMatch(t + (await text(page, "#cluck")), /\x1e|"stage"|"at"/, "no event line in the reply");
    await noScroll(page);
    const h = await page.$eval("#cluck .stg-sum", b => b.getBoundingClientRect().height);
    assert.ok(h >= (w < 500 ? 44 : 28), "the summary is a tap target (44px on a phone): " + h);
    await page.click("#cluck .stg-sum");
    assert.equal(await page.locator("#cluck .stg .stg-r").count(), 2, "a tap opens the rows");
    assert.match(await text(page, "#cluck .stg"), /Fluffed feathers/); assert.match(await text(page, "#cluck .stg"), /Drafted the wish/);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step(`${tag}: /explain with no stage events (an old server, a flag ignored): no stage UI, the reply is what was sent`, async () => {
    const { page, req } = await explain(w);
    req.write("QUACK. Plain reply.\n"); req.end();
    await page.click("#cluck .wtext").catch(() => {});
    await page.clock.runFor(2000);
    await page.waitForFunction(() => /Plain reply/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 5000 });
    assert.equal(await page.locator("#cluck .stg-r, #cluck .stg-sum").count(), 0, "no stage rows");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step(`${tag}: /explain with the sheet CLOSED while it runs: the finished state is carried in when it opens`, async () => {
    if (w >= 720) return;   // BIG PLAN V1 (Tony Nov 2): desktop sugar has no closed sheet (the box is open from load; its stage UI is the always-visible case: V4)
    const page = await mk(w), before = held.explain.length;
    await page.goto(BASE + "/#BANK_STG");
    await ready(page, "#CALC1_STG1", '.opt[data-id="b"]');
    await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
    const req = await until(() => held.explain[before], "the /explain request");
    req.write(ev("note", "start") + ev("note", "end") + ev("write", "start") + "QUACK. Done early.\n" + ev("write", "end")); req.end();
    await new Promise(r => setTimeout(r, 400));
    assert.equal(await page.locator(".stg-r, .stg-sum").count(), 0, "a closed sheet shows no stage UI");
    await page.evaluate(() => window.stemIdleTap());
    await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
    await waitSel(page, "#cluck .stg .stg-sum");
    assert.match(await text(page, "#cluck .stg .stg-sum"), /Thought for/);
    await page.context().close();
  });
  await step(`${tag}: /explain error line mid-stream: no tick, "Cluck is slow, try again", the failure copy`, async () => {
    const { page, req } = await explain(w);
    req.write(ev("note", "start") + RS + JSON.stringify({ error: "S-ABCDE", why: "upstream" }) + "\n"); req.end();
    await page.waitForFunction(() => /Couldn't load Cluck/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 5000 });
    assert.equal(await page.locator("#cluck .stg-ok").count(), 0, "no tick");
    assert.match(await text(page, "#cluck .stg .stg-r.bad"), /Cluck is slow, try again/);
    assert.match(await text(page, "#cluck .wtext"), /S-ABCDE/, "the server's code is shown");
    await page.context().close();
  });

  /* the proof Check */
  const proofOpen = async reduced => {
    const page = await mk(w, reduced), before = held.check.length;
    await page.goto(BASE + "/#" + PROOF);
    await ready(page, "#" + PROOF, "#ans");
    await page.fill("#ans", "Base case: n = 1.\nAssume it for k.\nAdd 3k+2 and factor.");
    await freeze(page);
    await page.click("#ansGo");
    const req = await until(() => held.check[before], "the proof /check request");
    return { page, req };
  };
  await step(`${tag}: proof Check: the flag is sent, the chip counts to 25, grade x2 = 2 rows, the verdict is today's, the tick comes with it`, async () => {
    const { page, req } = await proofOpen();
    assert.equal(req.body.stages, true);
    req.write(ev("read", "start"));
    await waitSel(page, "#q .stg .stg-r.run");
    await page.clock.runFor(1000);
    assert.equal(await text(page, "#q .stg .stg-tmr"), "1s / 25s");
    assert.match(await text(page, "#q .stg .stg-r.run .stg-tx"), /Reading your proof/);
    req.write(ev("read", "end") + ev("grade", "start") + ev("grade", "end") + ev("grade", "start"));
    await page.waitForFunction(() => /Double-checking/.test(document.querySelector("#q .stg .stg-r.run .stg-tx")?.textContent || ""), null, { timeout: 5000 });
    assert.equal(await page.locator("#q .stg .stg-r").count(), 3, "read + 2 grade rows");
    assert.equal(await page.locator("#q .stg .stg-ok").count(), 0, "no tick yet");
    await noScroll(page);
    await page.clock.runFor(2000);
    assert.equal(await text(page, "#q .stg .stg-tmr"), "3s / 25s");
    req.write(ev("grade", "end") + ev("record", "start") + ev("record", "end") + JSON.stringify({ verdict: "wrong", triesLeft: 2, rubric: { base: "missing", assume: "ok", prove: "ok" }, hint: "QUACK. Where do you check n = 1?" }) + "\n"); req.end();
    await waitSel(page, "#rubric .rb");
    assert.match(await text(page, "#fb .cluck"), /Where do you check n = 1\?/, "the verdict card is today's");
    await waitSel(page, "#q .stg .stg-sum");
    assert.match(await text(page, "#q .stg .stg-sum"), /Thought for 3s/);
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), 1);
    const h = await page.$eval("#q .stg-sum", b => b.getBoundingClientRect().height);
    assert.ok(h >= (w < 500 ? 44 : 28), "the summary is a tap target (44px on a phone): " + h);
    await noScroll(page);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step(`${tag}: proof Check that stalls: at 25 s no tick, "Cluck is slow, try again", the timeout line as before, no try spent`, async () => {
    const { page, req } = await proofOpen();
    req.write(ev("read", "start"));
    await waitSel(page, "#q .stg .stg-r.run");
    await page.clock.runFor(24000);
    assert.equal(await page.locator("#fb .verdict.wait").count(), 0, "gave up before 25 s");
    await page.clock.runFor(1500);
    await waitSel(page, "#fb .verdict.wait #retry");
    assert.match(await text(page, "#fb"), /taking too long/i);
    assert.equal(await page.locator("#q .stg-ok, #q .stg-sum").count(), 0, "no tick");
    assert.match(await text(page, "#q .stg .stg-r.bad"), /Cluck is slow, try again/);
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), 0, "a try was spent");
    await page.context().close();
  });
  await step(`${tag}: proof Check with no events (the flag ignored): one JSON body = today's verdict, no stage UI`, async () => {
    const { page, req } = await proofOpen();
    req.write(JSON.stringify({ verdict: "wrong", triesLeft: 2, rubric: { base: "ok", assume: "ok", prove: "wrong" }, hint: "QUACK. Use k." }) + "\n"); req.end();
    await waitSel(page, "#rubric .rb");
    assert.equal(await page.locator("#q .stg-r, #q .stg-sum").count(), 0);
    assert.match(await text(page, "#fb .cluck"), /Use k\./);
    await page.context().close();
  });
  await step(`${tag}: reduced motion: the spinner does not turn, the seconds still count`, async () => {
    const { page, req } = await proofOpen(true);
    req.write(ev("read", "start"));
    await waitSel(page, "#q .stg .stg-r.run");
    assert.equal(await page.$eval("#q .stg-r.run .stg-ic", e => getComputedStyle(e).animationName), "none");
    await page.clock.runFor(2000);
    assert.equal(await text(page, "#q .stg .stg-r.run .stg-s"), "2s");
    await page.context().close();
  });
}
await browser.close(); srv.kill(); front.close();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
