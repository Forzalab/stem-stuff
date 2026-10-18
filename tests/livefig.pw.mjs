// Live figures in Cluck's message (livefig.py, Claude path only): the real serve.py streams from a fake Claude (CLAUDE_BASE) that
// sends the reply in slow pieces with a ```fig fence in the middle. Checks: the fence is held (no raw JSON, no backticks on the page
// while it is open), the one good figure is drawn by Graph.render inside .wtext, a leaking figure before it is dropped, a render
// error falls back to the alt text (fig-off), reduced motion shows it too. Shots at 390 and 1280 into LIVEFIG_SHOTS (if set).
// Starts its own serve.py and fake Claude:   node tests/livefig.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8861), BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.LIVEFIG_SHOTS || "";
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "livefig-")), BANKS = join(TMP, "banks");
const note = { field: "physics", concept: "work-energy", asked: "a", need: "friction sign", assumed: "friction adds", real: "friction takes energy",
  reproduces: true, gap: "misconception", evidence: "pick a", confidence: "high" };
const P = { ...FIX.problem, code: "CALC1_LF1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp", note: { a: note } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_LF1.json"), JSON.stringify({ v: 1, problems: [P] }));

const fence = g => "```fig\n" + JSON.stringify(g) + "\n```";
const leak = FIX.invalid.find(c => c.why === "leak").fig;
const REPLY = ["POOF! A wish is a wish.\n", "The push pays for three things at once: heat, height and the spring.\n\n",
  fence(leak).slice(0, 30), fence(leak).slice(30) + "\n", "Here are the forces:\n", fence(FIX.valid[0]).slice(0, 40), "HOLD", fence(FIX.valid[0]).slice(40),
  "\n\n1. The push — work in\n- $W = 48$ J\n", "---\n", "$$\\boxed{375\\ \\text{N/m}}$$\n", "So the answer is **B, 375 N/m**."];
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
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "unused", CLAUDE_API: "fake", CLAUDE_BASE: `http://127.0.0.1:${FAKE}`, CLUCK_LIVE_FIGS: "1" }, stdio: "ignore" });
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
const init = () => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } };
try {
  for (const [w, h, tag] of [[390, 844, "390"], [1280, 900, "1280"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(init);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    await step(`${tag}: the open fence is held, then one figure is drawn in Cluck's message`, async () => {
      await wish(page);
      await page.waitForFunction(() => /Here are the forces/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      const mid = await wtext(page);
      assert.doesNotMatch(mid, /```|\{"type"|"kind"/, "no raw fence while it is open");
      assert.equal(await page.locator("#cluck .wtext .wfig").count(), 0);
      gate?.();
      await done(page);
      const t = await wtext(page);
      assert.doesNotMatch(t, /```|\{"type"|"marks"/);
      assert.equal(await page.locator("#cluck .wtext .wfig").count(), 1, "the leaking figure is dropped, the good one drawn");
      assert.ok(await page.locator("#cluck .wtext .wfig svg").count() === 1, "Graph.render drew it");
      assert.doesNotMatch(await page.locator("#cluck .wtext .wfig").textContent(), /375/);
      assert.equal(await page.locator("#cluck .wtext .wfig").getAttribute("aria-label"), FIX.valid[0].alt);
      assert.deepEqual(errs, []);
      if (SHOTS) {
        await page.locator("#cluck .wtext .wfig").scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(SHOTS, `livefig-${tag}.png`) });
        await page.locator("#cluck .wtext").screenshot({ path: join(SHOTS, `livefig-${tag}-msg.png`) });
      }
    });
    await ctx.close();
  }
  await step("a render error falls back to the alt text (fig-off)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(init);
    await ctx.addInitScript(() => { addEventListener("DOMContentLoaded", () => { const r = window.Graph?.render; if (window.Graph) window.Graph.render = (el, b) => el.closest(".wtext") ? (() => { throw new Error("boom"); })() : r(el, b); }); });
    const page = await ctx.newPage();
    await wish(page); setTimeout(() => gate?.(), 300);
    await done(page);
    const f = page.locator("#cluck .wtext .wfig");
    assert.equal(await f.count(), 1);
    assert.match(await f.getAttribute("class"), /fig-off/);
    assert.equal((await f.textContent()).trim(), FIX.valid[0].alt);
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill(); fake.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
