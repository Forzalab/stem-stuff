// TOAST GUARD + TOP SLOT (Tony, Nov 3 19:21): EVERY toast keeps off the question, the answer area, the repair ladder and Cluck's tray
// (#problem, #q, .rp, .vdrawer, .strip, .ff), and the status toasts (stage lines, the twist toast, the Next note) live in ONE top slot,
// above the question card. Loops each trigger x 393/1280 x (fresh launch, a wrong try, the tray open): rect on protected = none;
// a status toast's top is above the question card's top. A note with no legal place may be dropped, never laid on the question.
//   node tests/toast-guard.pw.mjs [port]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8893, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "toast-guard-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `PHYS_RT${n}`, title: `Roll ${n}`, type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.",
  body: txt(`A solid sphere rolls without slipping down a ${n}.0 m ramp. How fast is it moving at the bottom?` + "\n\nThe ramp is tilted at 25.0 degrees and the sphere starts from rest at the top. ".repeat(6)),   // a long stem: the hint card lands near the viewport foot (the toast's desktop spot)
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. A rolling ball also spins. Where is the rotational kinetic energy?" }, { value: "0.650", error: "trig", hint: "QUACK. Height along a slope uses which trig function?" }],
  saccharine: { title: `Roll ${n}`, key: "Use: energy with spin\nAnswer: 1.38", slip: { "1.636": "Left out the spin." } }, ...(n === 2 ? { twist: true } : {}) }));
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_TGD.json"), JSON.stringify({ v: 1, problems: PROBS }));
const stub = createServer(async (req, res) => {                              // a stub OpenRouter (the tray needs a live Cluck), as cluck-v2
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "The ball also spins. Egg-cellent." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

const SELS = "#problem, #q, .rp, .vdrawer, .strip, .ff";
let failures = 0;
async function step(name, fn) { if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return; try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 1200)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_TGD");
  await page.waitForFunction(() => !document.getElementById("splash") && /^#PHYS_RT/.test(location.hash) && !!document.querySelector("#ff input, #ff textarea"), null, { timeout: 10000 });
  return page;
}
const typeAnswer = async (page, v) => { const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
/* sample the toast element(s) on screen for ~1.4 s: every sample's rect against the protected boxes, and (status) its top against the question card */
const watch = (page, status) => page.evaluate(async ([SELS, status]) => {
  const bad = [], seen = new Set();
  for (let i = 0; i < 14; i++) {
    for (const e of document.querySelectorAll(".stoast.on, #toast.on")) {
      const r = e.getBoundingClientRect(); if (r.width < 2) continue;
      seen.add(e.id || "stoast");
      for (const p of document.querySelectorAll(SELS)) {
        const b = p.getBoundingClientRect();
        if (b.width < 1 || b.height < 1 || !p.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        if (r.right > b.left + 0.5 && r.left < b.right - 0.5 && r.bottom > b.top + 0.5 && r.top < b.bottom - 0.5) bad.push((e.id || "stoast") + " on " + (p.id || p.className) + " " + JSON.stringify([r.top, r.bottom, b.top, b.bottom]));
      }
      const card = document.querySelector("#problem").getBoundingClientRect();
      if (status && e.classList.contains("stoast") || e.id === "toast" && e.classList.contains("slot")) if (!(r.top < card.top)) bad.push("status toast top " + r.top + " is not above the question card " + card.top);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return { bad: [...new Set(bad)].slice(0, 3), seen: [...seen] };
}, [SELS, status]);
const fire = {
  "stage line": p => p.evaluate(() => window.stemToast.show({ text: "Halfway there!", from: 0.25, to: 0.5, at: () => document.querySelector("#q") })),
  "start line": p => p.evaluate(() => window.stemToast.show({ text: "Ready when you are.", from: 0, to: 0, at: () => document.querySelector("#q") })),
  "twist toast": p => p.evaluate(() => window.stemToast.show({ text: "Tip: a twist.", bar: false, ms: 6000, at: () => document.querySelector("#q"), action: { label: "What is a twist?", run() {} } })),
  "Next note": p => p.evaluate(() => dispatchEvent(new CustomEvent("drill:note", { detail: { text: "No more questions in this set." } }))),
  "HUD tip": p => p.evaluate(() => window.stemToast.note({ text: "Points always go up and never let you down.", at: document.querySelector(".rw-hud"), x: true })),
  "Copied (on the answer box)": p => p.evaluate(() => window.stemToast.note({ text: "Copied", at: document.querySelector("#ff .ans") || document.querySelector("#ff"), slotFallback: true })),
  "tray tip": p => p.evaluate(() => window.stemToast.note({ text: "Tap the badge to bring Cluck back.", at: document.querySelector(".vdrawer .wchip, #ff") , slotFallback: true, ms: 5000 })),
};
const STATUS = new Set(["stage line", "start line", "twist toast", "Next note"]);
const states = {
  "fresh launch": async () => {},
  "wrong try + ladder": async p => { await typeAnswer(p, "1.636"); await p.waitForFunction(() => !!document.querySelector("#fb")?.textContent.trim(), null, { timeout: 6000 }); await p.waitForTimeout(600); },
  "tray open": async p => {
    await typeAnswer(p, "1.636"); await p.waitForTimeout(2300); await typeAnswer(p, "0.650");
    await p.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 }); await p.waitForTimeout(600);
  },
};
try {
  for (const w of [393, 1280]) for (const [sn, setup] of Object.entries(states)) for (const [tn, go] of Object.entries(fire)) {
    await step(`${w} ${sn}: ${tn} touches nothing protected${STATUS.has(tn) ? ", sits above the question card" : ""}`, async () => {
      const page = await open(w);
      try {
        await setup(page);
        await go(page);
        const r = await watch(page, STATUS.has(tn));
        assert.deepEqual(r.bad, [], tn + " lay on a protected box / below the card");
        if (STATUS.has(tn) && sn === "fresh launch") assert.ok(r.seen.length, tn + " never showed on a fresh launch (the slot is free there) " + JSON.stringify(await page.evaluate(() => ({ y: pageYOffset, fz: document.querySelector("#freeze").getBoundingClientRect().top, top: document.querySelector(".top").getBoundingClientRect().bottom, room: document.documentElement.style.getPropertyValue("--toast-room"), st: !!document.querySelector(".stoast") }))));
        assert.deepEqual(page.errs, []);
      } finally { await page.context().close(); }
    });
  }
  await step("the app's own start line: first thing on a fresh launch, in the slot above the card", async () => {
    for (const w of [393, 1280]) {
      const page = await open(w);
      try {
        const r = await watch(page, true);
        assert.ok(r.seen.includes("stoast"), w + ": no start line");
        assert.deepEqual(r.bad, [], w + ": " + r.bad);
      } finally { await page.context().close(); }
    }
  });
} finally { await browser.close(); srv.kill(); stub.close(); }
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
