// Nov 3 prod (PHYS_JJN, PHYS_NYT): a reply whose figure the gate drops was held whole until the re-ask ended (13-19 s of nothing, then a gap or a
// description-only box). Real serve.py + a fake Claude: the first request streams prose, a dropped (leaking) figure fence, more prose; the second
// request (the figure re-ask, "was dropped") answers after REASK_MS with words only (case A), a good figure (case B) or nothing drawable (case C).
// Checks: the prose reaches the page in >=3 updates BEFORE the re-ask returns; while pending and when dropped the page holds no figure box, no
// empty block (no gap), no control char; a good figure lands at its anchor (between the lines around it); no main-thread long task > 100 ms.
// Starts its own serve.py and fake Claude:   node tests/figstream.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8862), BASE = `http://localhost:${PORT}`, REASK_MS = 2500;
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "figstream-")), BANKS = join(TMP, "banks");
const note = { field: "physics", concept: "work-energy", asked: "a", need: "friction sign", assumed: "friction adds", real: "friction takes energy",
  reproduces: true, gap: "misconception", evidence: "pick a", confidence: "high" };
const P = { ...FIX.problem, code: "CALC1_FS1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp", note: { a: note } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_FS1.json"), JSON.stringify({ v: 1, problems: [P] }));

const fence = g => "```fig\n" + JSON.stringify(g) + "\n```";
const leak = FIX.invalid.find(c => c.why === "leak").fig;
const REPLY = ["POOF! A wish is a wish.\n", "The push pays for three things at once: heat, height and the spring.\n\n", "Here are the forces:\n",
  fence(leak).slice(0, 30), fence(leak).slice(30) + "\n", "Friction turns some of the work into heat.\n", "The spring keeps the rest as stored energy.\n",
  "Height takes a share too, so nothing is lost.\n", "So the answer is close, **try once more**."];
let reaskMode = "none";                                     // none | good | alt
const fake = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const reask = /was dropped/.test(body);
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  ev({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } });
  const say = text => ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
  if (reask) {
    await new Promise(r => setTimeout(r, REASK_MS));
    if (reaskMode === "good") say(fence(FIX.valid[0]));
    else say("Sorry, no figure.");
  } else for (const p of [""].concat(REPLY)) {
    if (p === "") { await new Promise(r => setTimeout(r, 1500)); continue; }   // before the first token: the thinking status
    say(p); await new Promise(r => setTimeout(r, 250)); }
  ev({ type: "message_delta", usage: { output_tokens: 50 } }); ev({ type: "message_stop" }); res.end();
});
await new Promise(r => fake.listen(0, "127.0.0.1", r));
const FAKE = fake.address().port;
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "unused", CLAUDE_API: "fake", CLAUDE_BASE: `http://127.0.0.1:${FAKE}`, CLUCK_LIVE_FIGS: "1", CLUCK_REWRITE: "0" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
const opened = (page, code) => page.waitForFunction(c => location.hash === "#" + c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const pick = async (page, id) => { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`); };
async function wish(page) {
  await page.goto(BASE + "/#CALC1_FS1"); await opened(page, "CALC1_FS1");
  await pick(page, "a");
  await page.waitForSelector(":is(#wish:not([hidden]), .rbox) .wchip, .cl-peek .cl-cta, #cluck .wtext", { timeout: 6000 });
  if (!(await page.locator("#cluck .wtext").count())) await page.click(":is(#wish:not([hidden]), .rbox) .wchip, .cl-peek .cl-cta");
}
// what a student could see wrong: a figure box, a description box, an empty block (a gap), a control char
const junk = page => page.evaluate(() => {
  const x = document.querySelector("#cluck .wtext"); if (!x) return { boxes: 0, empty: 0, ctl: false, gaps: 1 };
  return { boxes: x.querySelectorAll(".wfig, .fig, .fig-off, .fig-alt").length,
    empty: [...x.children].filter(c => !c.classList.contains("wcaret") && !c.classList.contains("wgap") && !c.textContent.trim() && !c.querySelector("svg,img,table")).length, ctl: /[\u0003-\u0007]/.test(x.textContent), gaps: x.querySelectorAll(".wgap").length };
});
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const init = () => {
  try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
  window.__long = []; window.__texts = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch { /* no longtask */ }
  const tick = () => { const t = document.querySelector("#cluck .wtext")?.textContent || ""; if (t && window.__texts.at(-1) !== t) window.__texts.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
const final = page => page.waitForFunction(() => /try once more/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 20000 });
try {
  for (const mode of ["none", "good"]) {
    await step(`re-ask answers ${mode === "good" ? "with a figure" : "with words only"}: prose streams meanwhile, nothing stands in for the figure`, async () => {
      reaskMode = mode;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
      await ctx.addInitScript(init);
      const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
      await wish(page);
      await page.waitForFunction(() => !!document.querySelector("#cluck .wtext .wtag"), null, { timeout: 8000 });   // before the first token: a thinking status, not a bare caret
      await page.waitForFunction(() => /heat, height/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      await page.waitForFunction(() => /stored energy/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      // the model is done with the prose; the re-ask (REASK_MS) is still pending: the words are on the page, no figure box, no gap
      const t0 = await page.evaluate(() => performance.now());   // the figure is pending from here (REASK_MS): the main thread stays free
      assert.ok(await page.evaluate(() => window.__texts.length) >= 3, "the prose arrived in >= 3 updates");
      assert.doesNotMatch(await page.evaluate(() => document.querySelector("#cluck .wtext").textContent), /Sorry|```|\{"type"/);
      assert.deepEqual(await junk(page), { boxes: 0, empty: 0, ctl: false, gaps: 1 }, "while the figure is pending");
      assert.equal(await page.locator("#cluck .wtext .wdraw").count(), 1, "a drawing status stands at the anchor while the figure is pending");
      await final(page);
      const j = await junk(page);
      assert.equal(await page.locator("#cluck .wtext .wdraw").count(), 0, "the drawing status goes when it resolves");
      assert.equal(j.ctl, false); assert.equal(j.empty, 0, "no empty block"); if (mode !== "good") assert.equal(j.gaps, 1, "no spacer the dropped figure left behind (the reply has one blank line)");
      if (mode === "good") {
        assert.equal(j.boxes, 1);
        // the figure sits where the dropped fence was: after "Here are the forces:", before "Friction turns"
        const order = await page.evaluate(() => {
          const x = document.querySelector("#cluck .wtext"), f = x.querySelector(".wfig"), pos = (re) => [...x.querySelectorAll("*")].findIndex(e => e.children.length === 0 && re.test(e.textContent));
          const all = [...x.querySelectorAll("*")], fi = all.indexOf(f);
          return { before: pos(/Here are the forces/), fig: fi, after: pos(/Friction turns/) };
        });
        assert.ok(order.before < order.fig && order.fig < order.after, JSON.stringify(order));
      } else {
        assert.equal(j.boxes, 0, "a dropped figure leaves no DOM");
        assert.doesNotMatch(await page.evaluate(() => document.querySelector("#cluck .wtext").textContent), /Here are the forces/, "a dropped figure takes its lead-in (a line ending ':') with it (Nov 3 prod, PHYS X3)");
        assert.equal(await page.evaluate(() => [...document.querySelectorAll("#cluck .wtext .wl")].filter(e => /:\s*$/.test(e.textContent)).length), 0, "no dangling lead-in line");
      }
      assert.doesNotMatch(await page.evaluate(() => document.querySelector("#cluck .wtext").textContent), /Sorry/);
      const long = await page.evaluate(([t, REASK_MS]) => window.__long.filter(([s, d]) => s >= t && s < t + REASK_MS - 600 && d > 100), [t0, REASK_MS]);
      assert.deepEqual(long, [], "no main-thread long task > 100 ms");
      assert.deepEqual(errs, []);
      await ctx.close();
    });
  }
} finally {
  await browser.close();
  srv.kill(); fake.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
