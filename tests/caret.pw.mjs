// Nov 4 (Tony): the Cluck reply caret follows the WORDS: inline right after the last streamed word on its line box; no status slug ("Thinking…", "Drawing…", wait lines)
// ever; nothing (no caret) before the first word; caret gone when the reply ends. Real serve.py + a fake Claude, at 393 and 1280.   node tests/caret.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8864), BASE = `http://localhost:${PORT}`, REASK_MS = 2500;
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "caret-")), BANKS = join(TMP, "banks");
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
const srv = spawn("python3", [join(ROOT, "server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
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
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
// every frame: slugs, a caret with no words, the caret's place against the end of the last word
const init = () => {
  try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
  window.__bad = []; window.__s = { frames: 0, withCaret: 0, empty: 0 };
  const SLUG = /^\s*(Thinking|Drawing|Whipping|Splashing|Fluffing|Counting|Quacking|Shining)[^\n]{0,40}…\s*$/;
  const tick = () => {
    const x = document.querySelector("#cluck .wtext"), S = window.__s;
    if (x) {
      S.frames++;
      const bad = m => { if (window.__bad.length < 8) window.__bad.push(m); };
      if (x.querySelector(".wtag,.wdraw,.wload")) bad("slug element");
      for (const e of x.querySelectorAll("*")) if (e.children.length === 0 && SLUG.test(e.textContent)) bad("slug text: " + e.textContent);
      const car = x.querySelectorAll(".wcaret"), words = x.textContent.trim();
      if (!words) S.empty++;
      if (car.length) {
        S.withCaret++;
        if (!words) bad("caret before the first word");
        if (car.length > 1) bad("two carets");
        const cr = car[0].getBoundingClientRect();
        if (words && cr.width) {
          const tw = document.createTreeWalker(x, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() && !n.parentElement.closest(".wcaret") ? 1 : 3 });
          let last = null; while (tw.nextNode()) last = tw.currentNode;
          const r = document.createRange(); r.selectNodeContents(last);
          const l = [...r.getClientRects()].filter(q => q.width).at(-1);
          if (!l) bad("no rect for the last word");
          else if (Math.abs(cr.left - l.right) > 6) bad(`caret x ${cr.left.toFixed(1)} vs word end ${l.right.toFixed(1)} ("${last.textContent.trim().slice(-12)}")`);
          else if (Math.abs(cr.top - l.top) > 2) bad(`caret top ${cr.top.toFixed(1)} vs word top ${l.top.toFixed(1)}`);
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const final = page => page.waitForFunction(() => /try once more/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 20000 });
try {
  for (const [w, h] of [[393, 800], [1280, 800]]) {
    await step(`${w}: the caret follows the words inline; no slugs; no caret before the first word; gone at the end`, async () => {
      reaskMode = "good";
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 700, isMobile: w < 700, serviceWorkers: "block" });
      await ctx.addInitScript(init);
      const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
      await wish(page);
      await page.waitForFunction(() => /heat, height/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      if (process.env.SHOT) {
        await page.waitForFunction(() => /Friction turns/.test(document.querySelector("#cluck .wtext")?.textContent || "") && document.querySelector("#cluck .wcaret"), null, { timeout: 5000 });
        await (await page.$("#cluck")).screenshot({ path: join(process.env.SHOT, `caret-${w}.png`) });
      }
      await page.waitForFunction(() => /stored energy/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 10000 });
      assert.equal(await page.locator("#cluck .wtext .wcaret").count(), 1, "one caret while the figure is pending");
      const gap = await page.evaluate(() => { const rows = [...document.querySelectorAll("#cluck .stg .stg-r, #cluck .stg .stg-sum")], q = document.querySelector("#cluck .cl-quack");
        return rows.length && q ? q.getBoundingClientRect().top - rows.at(-1).getBoundingClientRect().bottom : null; });
      assert.ok(gap === null || gap >= 11.5, "a gap (>= --s3, 12px) between the last stage row and the reply opener (Tony, Nov 4): " + gap);
      await final(page);
      const S = await page.evaluate(() => ({ ...window.__s, bad: window.__bad }));
      assert.deepEqual(S.bad, [], "violations");
      assert.ok(S.empty > 5, "frames before the first word were seen empty: " + S.empty);
      assert.ok(S.withCaret > 20, "the caret was checked on many frames: " + S.withCaret);
      assert.equal(await page.locator("#cluck .wtext .wcaret").count(), 0, "caret gone after the reply ends");
      assert.deepEqual(errs, []);
      await ctx.close();
    });
  }
} finally { await browser.close(); srv.kill(); fake.close(); }
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
