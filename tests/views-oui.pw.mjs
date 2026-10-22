// Cluck views (P4.1, views_gate.py): the real serve.py streams from a fake Claude (CLAUDE_BASE) whose reply holds an ```openui Geometry
// fence; the gate passes it, wishHTML puts a placeholder and views.js draws the SVG inside .wtext, at 360 and 1280, with no horizontal
// scroll and no raw program on the page. Shots into LIVEFIG_SHOTS (if set).
// Starts its own serve.py and fake Claude:   node tests/views-oui.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8871), BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.LIVEFIG_SHOTS || "";
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "views-oui-")), BANKS = join(TMP, "banks");
const note = { field: "physics", concept: "work-energy", asked: "a", need: "friction sign", assumed: "friction adds", real: "friction takes energy",
  reproduces: true, gap: "misconception", evidence: "pick a", confidence: "high" };
const P = { ...FIX.problem, code: "CALC1_LF1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp", note: { a: note } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_LF1.json"), JSON.stringify({ v: 1, problems: [P] }));

const PROG = 'root = View([ramp])\nramp = Geometry("A 0,0; B 4,0; C 4,2.3; P 2,1.15", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "angle(A,B,C,30°)", "dim(A,C,1.2 m)", "arrow(P,C,push)"], "The ramp at 30 degrees, the push up it.")';
const OUI = "```openui\n" + PROG + "\n```";
const REPLY = ["POOF! A wish is a wish.\n", "The push pays for three things at once: heat, height and the spring.\n\n", "Here is the ramp:\n",
  OUI.slice(0, 50), "HOLD", OUI.slice(50) + "\n", "\n\n1. The push — work in\n- $W = 48$ J\n", "---\n", "$$W = 48\\ \\text{J}$$\n", "So the answer is close, **try once more**."];
let gate = null;
const fake = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  ev({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } });
  for (const p of REPLY) {
    if (p === "HOLD") { await new Promise(r => { gate = r; setTimeout(r, 4000); }); continue; }   // the fence is open here
    ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } });
    await new Promise(r => setTimeout(r, 60));
  }
  ev({ type: "message_delta", usage: { output_tokens: 50 } }); ev({ type: "message_stop" }); res.end();
});
await new Promise(r => fake.listen(0, "127.0.0.1", r));   // the OS picks a free port (PORT + 1 was not checked: EADDRINUSE on CI)
const FAKE = fake.address().port;
/* CLUCK_REWRITE=0: the streamed path (the editor pass holds a wish whole, so no fence is ever open on the page; test_claude_pipe.py covers it) */
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "unused", CLAUDE_API: "fake", CLAUDE_BASE: `http://127.0.0.1:${FAKE}`, CLUCK_LIVE_FIGS: "1", CLUCK_VIEWS: "1",
  CLUCK_REWRITE: "0" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
const opened = (page, code) => page.waitForFunction(c => location.hash === "#" + c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const pick = async (page, id) => { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`); };
const wtext = page => page.evaluate(() => document.querySelector("#cluck .wtext")?.textContent || "");
async function wish(page) {
  await page.goto(BASE + "/#CALC1_LF1"); await opened(page, "CALC1_LF1");
  await pick(page, "a");
  await page.waitForSelector("#wish:not([hidden]) .wchip, .cl-peek .cl-cta, #cluck .wtext", { timeout: 6000 });
  if (!(await page.locator("#cluck .wtext").count())) await page.click("#wish:not([hidden]) .wchip, .cl-peek .cl-cta");   // desktop opens by itself
}
const done = page => page.waitForFunction(() => /answer is/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 15000 });

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const init = () => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } };
try {
  for (const [w, h, tag] of [[360, 780, "360"], [1280, 900, "1280"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(init);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    await step(`${tag}: the open fence is held, then the Geometry view draws an svg in Cluck's message, no horizontal scroll`, async () => {
      await wish(page);
      await page.waitForFunction(() => /Here is the ramp/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      assert.doesNotMatch(await wtext(page), /```|Geometry\(|root =/, "no raw program while the fence is open");
      gate?.();
      await done(page);
      assert.doesNotMatch(await wtext(page), /```|Geometry\(|root =/);
      const fig = page.locator("#cluck .wtext .wfig.wview");
      assert.equal(await fig.count(), 1);
      await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
      assert.equal(await page.locator("#cluck .wtext .wview svg .gm-seg").count(), 3);
      for (const c of ["gm-right", "gm-angle", "gm-dim", "gm-arrow"]) assert.equal(await page.locator(`#cluck .wtext .wview svg .${c}`).count(), 1, c);
      assert.equal(await fig.getAttribute("aria-label"), "The ramp at 30 degrees, the push up it.");
      const box = await page.locator("#cluck .wtext .wview svg").boundingBox();
      assert.ok(box.width > 40 && box.height > 40, `drawn: ${box.width}x${box.height}`);
      assert.ok(box.height <= Math.min(0.28 * h, box.width) + 1, `fits the figure slot: ${box.height} vs ${h}`);
      const sc = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(sc[0] <= sc[1], `no horizontal scroll: ${sc}`);
      assert.deepEqual(errs, []);
      if (SHOTS) await page.locator("#cluck .wtext").screenshot({ path: join(SHOTS, `views-oui-${tag}.png`) });
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill(); fake.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
