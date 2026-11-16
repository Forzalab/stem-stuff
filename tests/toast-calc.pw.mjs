// BUG-TOAST-CALC smoke: the stage toast ("Ready when you are.") never lies on a card in the question column (the Calc Coach card on
// the welcome Q1, the hint card, the Calc row). 1280x800 (side layout) and 390x844. Own serve.py + a throwaway bank.
// With no room it waits (the start line is dropped after 15 s): "never on a card" beats "always shown".
//   node tests/toast-calc.pw.mjs [port] [shots dir]     (env STEM_TODAY=2026-10-23, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8889, BASE = `http://127.0.0.1:${PORT}`, SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "toast-calc-")), BANKS = join(TMP, "banks");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_TC1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Piston", key: "Use: P = F/A\nAnswer: 4", slip: {} },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" }, { id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_TCT.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_TC2", 1), num("PHYS_TC3", 2)] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_TCT", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: process.env.STEM_TODAY || "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);
let failures = 0;
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
try {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const name = `${w}: the stage toast lies on no card of the question column`;
    try {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
      await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
        const t0 = Date.now(); window.__tc = []; setInterval(() => {
          const cw = document.querySelector("#q .cc-welcome");                // a tall stem (live: PHYS_MC4): the card's top at the foot's edge, 90px above the viewport foot
          if (cw && !cw.dataset.pushed) { cw.dataset.pushed = "1"; cw.style.marginTop = Math.max(0, innerHeight - 90 - cw.getBoundingClientRect().top) + "px"; }
          const e = document.querySelector(".stoast.on"); if (!e) return;
          const cards = [...document.querySelectorAll("#q .cc-welcome, #q .cc-row, #q #fb, #q .vdrawer:not([hidden])")].filter(c => c.getClientRects().length && c.textContent.trim()).map(c => ({ c: c.className || c.id, r: c.getBoundingClientRect().toJSON() }));
          window.__tc.push({ t: Date.now() - t0, r: e.getBoundingClientRect().toJSON(), cards }); }, 50); } catch { /* */ } });
      const page = await ctx.newPage(); page.on("pageerror", e => console.log("ERR", e.message));
      await page.goto(BASE + "/#BANK_TCT");
      await page.waitForSelector("#q .cc-welcome", { timeout: 12000 });
      await page.waitForTimeout(w > 500 ? 2500 : 1500);   // the start line shows now-ish or never (15 s); a phone may find no room and wait: that covers nothing
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `toast-calc-${w}.png`) });
      const bad = await page.evaluate(() => window.__tc.flatMap(s => s.cards.filter(c => !(s.r.right <= c.r.left || s.r.left >= c.r.right || s.r.bottom <= c.r.top || s.r.top >= c.r.bottom)).map(c => ({ card: c.c, toast: s.r, rect: c.r }))));
      const seen = await page.evaluate(() => window.__tc.length);
      console.log(`     ${w}: ${seen} toast samples`);
      assert.deepEqual(bad.slice(0, 1), [], `the toast lay on a card in ${bad.length} of ${seen} samples`);
      console.log("ok  ", name); await ctx.close();
    } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
  }
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `\n${failures} failing` : "\nall ok"); process.exit(failures ? 1 : 0);
