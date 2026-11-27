// Smoke (todo 176, Tony Nov 17): on ui-v7 the old orange fx reward banner (rewards/fx.js toast -> .fx-toast, fixed under the top edge)
// drew over the top bar on a phone. On ui-v7 a reward line now rides the normal row toast (client/shell/toast/toast.js, the stage
// toasts' component): .stoast-v7, no .fx-toast, clear of #qnav. Off ui-v7 the old banner is unchanged.
// The v7 row toast places like the stage toasts (no `dock`): the justified phone bento fills to the foot, so it floats over the
// bottom tile row (toast.js PHONE-TOAST-FLOAT); `dock` would find no free foot spot and the line would be dropped at `until`.
// Own serve.py on a temp bank:   node tests/reward-row-toast.smoke.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8897", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "rwrow-")), banks = join(tmp, "banks");
mkdirSync(banks);
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = n => ({ code: `CALC1_RWT${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Reward row ${n}: pick a.` }], choices: ch("one", "two", "three", "four"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }], saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
writeFileSync(join(banks, "BANK_RWT1.json"), JSON.stringify({ v: 20261022, problems: [real(1), real(2)] }));   // at CUTOFF: loads under the real date
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
/* a fresh phone 390x844 on the fixture bank; ui = "v7" (the flag is set by ?ui=v7, fx.js reads it in <head>) or "off" */
async function open(ui) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: "block" });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  const p = await c.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e.message)));
  await p.goto(`${BASE}/?ui=${ui}#BANK_RWT1`);
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 10000 })
    .catch(async e => { throw new Error(e.message + " | " + JSON.stringify(await p.evaluate(() => [document.querySelector("#pcode")?.textContent, document.querySelector("#entryMsg")?.textContent, location.href]))); });
  await p.waitForSelector("#qnav:not([hidden])", { timeout: 10000 });
  return { c, p, errs };
}
/* one right answer whose reward result is a drop with a line (the exact input rewardShow passes to fx.toast today).
   .fx-toast creations are counted from a MutationObserver, so one that appears and auto-hides is still seen. */
async function dropAnswer(p) {
  await p.evaluate(() => {
    window.__fxToasts = 0;
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.(".fx-toast") || n.querySelector?.(".fx-toast"))) window.__fxToasts++; })
      .observe(document.body, { childList: true, subtree: true });
    window.stemToast.clear();
    window.Rewards.answer = () => ({ xp: 12, drop: "common", line: "BONUS! +50 XP", burst: null, level: 1 });
  });
  await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 }).catch(() => {});
  const n = await p.evaluate(() => window.__drill.state.tries.length);
  await p.click('#q .opt[data-id="a"]');
  const v7 = await p.evaluate(() => document.documentElement.classList.contains("ui-v7"));
  if (v7) { await p.waitForSelector("#q .chk #mcGo", { timeout: 6000 }); await p.click("#q .chk #mcGo"); }
  else { await p.waitForSelector('#q .ch[data-id="a"] .send:not([hidden])', { timeout: 6000 }); await p.click('#q .ch[data-id="a"] .send'); }
  await p.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
const v7Toast = p => p.waitForFunction(() => {
  const t = document.querySelector(".stoast.on");
  if (!t || !t.classList.contains("stoast-v7")) return false;
  const title = t.querySelector(".stoast-t")?.textContent || "";
  return /BONUS!/.test(title) ? { title, rect: t.getBoundingClientRect().toJSON() } : false;
}, null, { timeout: 15000 }).then(h => h.jsonValue())
  .catch(async e => { throw new Error(e.message + " | want a .stoast-v7 with the reward line | saw " + await p.evaluate(() => {
    const t = document.querySelector(".stoast");
    return JSON.stringify({ toast: t && t.className + " " + t.textContent, fxToasts: window.__fxToasts, fxNow: document.querySelectorAll(".fx-toast").length }); })); });

try {
  await step("390 ?ui=v7: the reward line is a .stoast-v7 row toast, no .fx-toast, never over #qnav", async () => {
    const { c, p, errs } = await open("v7");
    try {
      await dropAnswer(p);
      const t = await v7Toast(p);
      assert.equal(t.title, "BONUS! +50 XP", "the reward line is the row toast's title");
      assert.equal(await p.evaluate(() => window.__fxToasts), 0, "no .fx-toast was made (v7 rides the row toast)");
      const nav = await p.evaluate(() => { const n = document.querySelector("#qnav"); return n && !n.hidden ? n.getBoundingClientRect().toJSON() : null; });
      assert.ok(nav, "#qnav is on screen");
      const a = t.rect;
      const overlap = a.left < nav.right && a.right > nav.left && a.top < nav.bottom && a.bottom > nav.top;
      assert.ok(!overlap, "the toast box clears #qnav: " + JSON.stringify({ toast: a, nav }));
      assert.deepEqual(errs, [], "no page errors");
    } finally { await c.close(); }
  });
  await step("390 ?ui=off: unchanged, the old .fx-toast banner carries the reward line", async () => {
    const { c, p, errs } = await open("off");
    try {
      await dropAnswer(p);
      const text = await p.waitForFunction(() => {
        const t = document.querySelector(".fx-toast");
        if (!t) return false;
        const tx = t.querySelector(".fx-toast-t")?.textContent || "";
        return /BONUS!/.test(tx) ? tx : false;
      }, null, { timeout: 12000 }).then(h => h.jsonValue())
        .catch(async e => { throw new Error(e.message + " | want the old .fx-toast with the reward line | saw " + await p.evaluate(() => JSON.stringify({
          fx: [...document.querySelectorAll(".fx-toast-t")].map(t => t.textContent), stoast: document.querySelector(".stoast.on")?.className }))); });
      assert.equal(text, "BONUS! +50 XP", "the old banner's line");
      assert.equal(await p.evaluate(() => !!document.querySelector(".stoast-v7")), false, "flag off: no row toast");
      assert.deepEqual(errs, [], "no page errors");
    } finally { await c.close(); }
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "reward-row-toast: all ok");
process.exit(failures ? 1 : 0);
