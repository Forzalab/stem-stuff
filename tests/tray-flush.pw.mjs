// TRAY FLUSH (Tony, Nov 6 screenshot): after a right single-mc pick the last option card and the "See steps" tray (.vdrawer) must meet as one unit:
//   no seam / gap / overlap at the card's bottom edge, and nothing from the content behind the tray peeks out under the tray's bottom edge.
// 390 phone (touch, dpr 1). Own serve.py + a throwaway bank + a stub OpenRouter.   node tests/tray-flush.pw.mjs <port>
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8889, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "tray-anchor-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const STEM = "Pat makes stacks of cups. The first stack has 5 cups. Each new stack has 2 more cups than the one before it.";
const PROBS = [
  { code: "PHYS_TF1", title: "Pick", type: "mc", pick: "one", shuffle: false, body: txt(STEM + " Which is right?"),
    choices: ["A", "B", "C", "D", "E"].map((L, i) => ({ id: "abcde"[i], md: "Option " + L + " with \\(\\frac{1}{2}\\) a few words" })), correct: "b",
    wrong: [{ choice: "a", error: "misread", hint: "QUACK. Look at the base." }], saccharine: { title: "Pick", key: "Pick: b", slip: { a: "The base." } } },
];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_TFA.json"), JSON.stringify({ v: 1, problems: [PROBS[0]] }));
writeFileSync(join(BANKS, "BANK_TAA.json"), JSON.stringify({ v: 1, problems: [PROBS[0]] }));
writeFileSync(join(BANKS, "BANK_TAB.json"), JSON.stringify({ v: 1, problems: [PROBS[1]] }));
writeFileSync(join(BANKS, "BANK_TAC.json"), JSON.stringify({ v: 1, problems: [PROBS[2]] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Steps. Egg-cellent." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_TODAY: "2026-11-01", STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("390 single mc right: the tray meets the last option card flush and covers what is behind it", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +(process.env.DPR || 1), hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + "/#BANK_TFA");
      await page.waitForFunction(() => /^#PHYS_TF/.test(location.hash) && !!document.querySelector("#q .opt"), null, { timeout: 10000 });
      await page.click('#q .opt[data-id="b"]');
      await page.click('#q .ch:has(.opt[data-id="b"]) .send');
      await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 8000 });
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const q = document.querySelector("#q"), cs = [...q.querySelectorAll(".choices > .ch")], last = cs[cs.length - 1], d = q.querySelector(".vdrawer:not([hidden])");
        const lr = last.getBoundingClientRect(), dr = d.getBoundingClientRect(), g = q.querySelector(".choices").getBoundingClientRect();
        // what paints in the tray's own box, across its width and just under its bottom edge
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest(".vdrawer"); };
        const under = [.1, .3, .5, .7, .9].map(f => hit(dr.left + dr.width * f, dr.bottom - 1));
        const cd = getComputedStyle(d), ob = getComputedStyle(last.querySelector(".opt"));
        return { lastBottom: lr.bottom, lastLeft: lr.left, lastRight: lr.right, top: dr.top, bottom: dr.bottom, left: dr.left, right: dr.right, gBottom: g.bottom, under, n: cs.length, rad: [ob.borderBottomLeftRadius, ob.borderBottomRightRadius], bg: cd.backgroundColor, bt: cd.borderTopWidth };
      });
      console.log(JSON.stringify(m)); if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
      assert.ok(m.top <= m.lastBottom + 0.5 && m.top >= m.lastBottom - 2.5, `tray top ${m.top} vs last card bottom ${m.lastBottom}: a gap or too deep an overlap`);
      assert.equal(m.left, m.lastLeft); assert.equal(m.right, m.lastRight);
      assert.deepEqual(m.rad, ["0px", "0px"], "the last card keeps rounded bottom corners over the tray: its corners notch the seam");
      assert.deepEqual(m.under, [true, true, true, true, true], "something other than the tray paints at the tray's bottom edge");
      await page.click("#q .vdrawer .vd-x"); await page.waitForTimeout(700);
      const back = await page.evaluate(() => { const o = [...document.querySelectorAll("#q .choices > .ch")].pop().querySelector(".opt"), c = getComputedStyle(o); return [c.borderBottomLeftRadius, c.borderBottomRightRadius]; });
      assert.ok(back.every(r => r !== "0px"), "the card's corners come back when the tray shuts: " + back);
    } catch (e) { console.log(await page.evaluate(() => location.hash + " " + document.body.innerText.slice(0, 200))); throw e; } finally { await ctx.close(); }
  });
} finally { await browser.close(); srv.kill(); stub.close(); }
console.log(failures ? `${failures} failing` : "all ok");
process.exit(failures ? 1 : 0);
