// CLUCK-BTN smoke (Tony Nov 14): under html.ui-v7 there is ONE Ask Cluck button, top right of the question card (typed, MC, multi-part) and no other entry (no chip, no tray, no duck slot).
// Disabled = aria-disabled (not the attribute, no pointer-events:none) before the first try and with no Cluck key; hover (desktop) / tap (phone) shows a note; a wrong try unlocks it (the fill sweeps in) and a sheen plays.
// Own serve.py, throwaway bank, a stub OpenRouter.   node tests/cluck-btn.pw.mjs [port]   (SHOTS=<dir> saves screenshots)
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8899, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cluckbtn-")), BANKS = join(TMP, "banks"), SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const roll = { code: "PHYS_FP2", title: "Roll", type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.",
  body: [{ type: "text", md: "A solid sphere rolls without slipping down a 1.0 m ramp. How fast is it moving at the bottom?" }],
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. A rolling ball also spins." }, { value: "0.650", error: "trig", hint: "QUACK. Which trig function?" }],
  saccharine: { title: "Roll", key: "Use: energy with spin\nAnswer: 1.38", slip: { "1.636": "Left out the spin." } } };
const mcq = { code: "PHYS_FP3", title: "Pick", type: "mc", shuffle: false, body: [{ type: "text", md: "Which one is the vector quantity?" }],
  choices: [{ id: "a", md: "speed" }, { id: "b", md: "velocity" }, { id: "c", md: "mass" }], correct: "b", wrong: [{ choice: "a", hint: "QUACK. Speed has no direction." }],
  saccharine: { title: "Pick", key: "Use: a vector has a direction\nAnswer: b" } };
const multi = { code: "PHYS_FP4", title: "Two counts", type: "multi", how: "Two whole numbers, in order.", body: [{ type: "text", md: "$|A| = 10$, $|B| = 7$, $|A \\cap B| = 3$." }],
  parts: [{ prompt: "How many are in $A \\cup B$?", type: "num", answer: "14", unit: "", tol: 0.0001 }, { prompt: "How many are in exactly one set?", type: "num", answer: "11", unit: "", tol: 0.0001 }],
  saccharine: { title: "Two counts", key: "Use: inclusion-exclusion\nAnswer: 14, 11" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_CBT.json"), JSON.stringify({ v: 1, problems: [roll, mcq, multi] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "The ball also spins." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_CBT", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { motion: true, args: ["--no-sandbox"] });
async function open(w, flag, hash = "") {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(`${BASE}/?ui=${flag}${hash}`);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return page;
}


const geo = page => page.evaluate(() => {
  const b = document.querySelector("#cluckBtn"), p = document.querySelector("#problem"), r = e => e.getBoundingClientRect();
  if (!b) return null;
  const br = r(b), pr = r(p), cs = getComputedStyle(b), txt = []; for (const e of document.querySelectorAll("#problem .blocks")) { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); txt.push(...[...g.getClientRects()].filter(x => x.width > 2)); } }
  return { n: document.querySelectorAll("#cluckBtn").length, br: { l: br.left, r: br.right, t: br.top, b: br.bottom, w: br.width, h: br.height }, pr: { l: pr.left, r: pr.right, t: pr.top }, aria: b.getAttribute("aria-disabled"), dis: b.hasAttribute("disabled"),
    pe: cs.pointerEvents, bg: cs.backgroundColor, color: cs.color, bw: cs.borderTopWidth, shadow: cs.boxShadow, label: b.textContent.replace(/\s+/g, " ").trim(), st: b.dataset.st,
    overlap: txt.some(x => !(x.right <= br.left || x.left >= br.right || x.bottom <= br.top || x.top >= br.bottom)), vw: innerWidth, sw: document.documentElement.scrollWidth,
    ladder: [...document.querySelectorAll(".wchip, .vdrawer, .cl-cta, .vk[role=button], .vkb, .vk-duck")].length,
    padR: parseFloat(getComputedStyle(p).paddingRight) || 0, padT: parseFloat(getComputedStyle(p).paddingTop) || 0,
    tb: (() => { const t = document.querySelector("#problem > .blocks > :is(.ptitle, .qhead):first-child"); if (!t) return null; const g = document.createRange(); g.selectNodeContents(t); const rs = [...g.getClientRects()]; return rs.length ? t.getBoundingClientRect().bottom : null; })() };
});
const open2 = async (w, code, flag = "v7") => { const p = await open(w, flag, "#" + code); await p.waitForSelector("#q", { timeout: 10000 }); await p.waitForTimeout(500); return p; };
const typeAnswer = async (page, v) => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
const toastText = page => page.evaluate(() => { const t = document.getElementById("toast"); return t && t.classList.contains("on") ? t.textContent.trim() : ""; });
const W = [390, 1366];
try {
  for (const [code, kind] of [["PHYS_FP2", "typed"], ["PHYS_FP3", "mc"], ["PHYS_FP4", "multi"]]) for (const w of W) await step(`${w}: ${kind}: one disabled Ask Cluck button, top right of the card, no overlap with the question, >= 44px`, async () => {
    const page = await open2(w, code);
    try {
      const g = await geo(page);
      assert.ok(g, "the button exists"); assert.equal(g.n, 1); assert.equal(g.label, "Ask Cluck" + "Cluck unlocks after your first try.");
      assert.equal(g.aria, "true", "aria-disabled"); assert.equal(g.dis, false, "no disabled attribute"); assert.notEqual(g.pe, "none", "no pointer-events:none");
      assert.ok(g.br.h >= 44 && g.br.w >= 44, "tap target: " + JSON.stringify(g.br));
      // ROW-ALIGN B (Tony Nov 16): the button sits at the card's right; its top is near the card top OR (a taller title beside it) its bottom meets the title's last line
      // KICKER-C (Tony Nov 16): the button sits in the kicker row, flush with the card's CONTENT box (top-right corner of the padding box)
      assert.ok(Math.abs(g.br.r - (g.pr.r - g.padR)) < 2 && Math.abs(g.br.t - (g.pr.t + g.padT)) < 2, "top right of the card's content box: " + JSON.stringify({ b: g.br, p: g.pr, padR: g.padR, padT: g.padT }));
      assert.equal(g.overlap, false, "the question text does not run under the button"); assert.equal(g.bw, "0px", "no border");
      assert.equal(g.bg, "rgb(20, 29, 54)", "option A fill #141d36"); assert.equal(g.color, "rgb(122, 138, 174)", "option A label #7a8aae"); assert.ok(g.shadow === "none" || /0px 1px 2px/.test(g.shadow), "no raise while disabled (QCARD v3 lifts the chip with a lit edge + soft shadows: qcard.css)");
      assert.equal(g.ladder, 0, "no other entry on the page: " + g.ladder); assert.ok(g.sw <= g.vw, "no sideways scroll");
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `cluckbtn-${kind}-${w}.png`) });
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  await step("1366: disabled: hover shows 'Cluck unlocks after your first try.'; a click does not open Cluck", async () => {
    const page = await open2(1366, "PHYS_FP2");
    try {
      await page.hover("#cluckBtn"); await page.waitForTimeout(400);
      assert.equal(await toastText(page), "Cluck unlocks after your first try.");
      await page.click("#cluckBtn", { force: true }); await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => { const c = document.querySelector("#cluck"); return !!c && !c.hidden && c.getClientRects().length > 0 && !c.closest("[hidden]") && document.body.classList.contains("x") ; }), false);
    } finally { await page.context().close(); }
  });
  await step("390: disabled: a tap shows the note (phone)", async () => {
    const page = await open2(390, "PHYS_FP2");
    try { await page.locator("#cluckBtn").tap({ force: true }); await page.waitForTimeout(400); assert.equal(await toastText(page), "Cluck unlocks after your first try."); } finally { await page.context().close(); }
  });
  await step("390: flag on: a wrong try unlocks it (fill sweeps in, 150-300 ms), the sheen plays, no chip / tray / slot duck anywhere; a press opens Cluck", async () => {
    const page = await open2(390, "PHYS_FP2");
    try {
      await typeAnswer(page, "1.636");
      await page.waitForFunction(() => document.querySelector("#cluckBtn") && !document.querySelector("#cluckBtn").hasAttribute("aria-disabled"), null, { timeout: 8000 });
      const sw = await page.evaluate(() => { const b = document.querySelector("#cluckBtn"), cs = getComputedStyle(b, "::before"); return { dur: cs.transitionDuration, ease: cs.transitionTimingFunction, origin: cs.transformOrigin.split(" ")[0] }; });
      assert.equal(sw.dur.split(",")[0], "0.24s"); assert.equal(sw.ease.split(",")[0], "ease-out"); assert.equal(sw.origin, "0px", "sweeps in from the left");
      await page.waitForSelector("#cluckBtn.cb-sheen, #cluckBtn.cb-shake", { state: "attached", timeout: 4000 });   // wrong try = the sheen; the stub reply that lands next = the duck head shake (the later event wins)
      const g = await geo(page);
      assert.equal(g.ladder, 0, "no old entry"); assert.equal(g.aria, null); assert.equal(g.bg, "rgb(20, 29, 54)", "base stays; the fill layer sweeps"); assert.equal(g.shadow !== "none", true, "the slight raise");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#q .ff .vk[role=button], #q .vdrawer, #wish .wchip, .wchip").length), 0);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "cluckbtn-unlocked-390.png") });
      await page.locator("#cluckBtn").tap();
      await page.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden && c.getClientRects().length > 0; }, null, { timeout: 8000 });
    } finally { await page.context().close(); }
  });
  await step("1366: flag on: a right answer unlocks it and sheens; no See steps entry; a press opens Cluck", async () => {
    const page = await open2(1366, "PHYS_FP2");
    try {
      await typeAnswer(page, "1.38");
      await page.waitForSelector("#q .ff.rbox.ok .vk", { timeout: 8000 });
      await page.waitForFunction(() => document.querySelector("#cluckBtn") && !document.querySelector("#cluckBtn").hasAttribute("aria-disabled"), null, { timeout: 8000 });
      assert.equal((await geo(page)).ladder, 0);
      assert.equal(await page.evaluate(() => /See steps|Explain my mistake/.test(document.querySelector("#q").textContent + document.querySelector("#wish").textContent)), false);
      await page.locator("#cluckBtn").click();
      await page.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden && c.getClientRects().length > 0; }, null, { timeout: 8000 });
    } finally { await page.context().close(); }
  });
  await step("sheen: a direct call plays on a ready button; reduced motion plays none", async () => {
    const page = await open2(390, "PHYS_FP2");
    try {
      await typeAnswer(page, "1.636");
      await page.waitForFunction(() => document.querySelector("#cluckBtn") && !document.querySelector("#cluckBtn").hasAttribute("aria-disabled"), null, { timeout: 8000 });
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen")), false, "ends by itself");
      await page.evaluate(() => window.stemCluckBtn.sheen("jev-s6")); await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen")), true, "Jev S6 sheen");
      assert.match(await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn"), "::after").backgroundImage), /gradient/, "a band");
      assert.equal(await page.evaluate(() => /(?:90, 169, 255|0\.35|#5aa9ff)/i.test(getComputedStyle(document.querySelector("#cluckBtn"), "::after").backgroundImage)), true, "tinted site blue --action, not white");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.stemCluckBtn.sheen("reply")); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => { const b = document.querySelector("#cluckBtn"); return b.classList.contains("cb-shake") && !b.classList.contains("cb-sheen") && getComputedStyle(b.querySelector(".cb-duck")).animationName; }), "cb-shake", "reply = duck head shake, chip still");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.stemCluckBtn.sheen("right")); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn .cb-duck")).animationName), "cb-nod", "right = duck nod");
      await page.waitForTimeout(1200);
      await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(1200);
      await page.evaluate(() => window.stemCluckBtn.sheen("jev-s6")); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen")), false, "reduced motion: none");
      const d = await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn"), "::before").transitionDuration);
      assert.equal(d.split(",")[0], "0s", "reduced motion: instant");
    } finally { await page.context().close(); }
  });
  await step("flag off: no Ask Cluck button; the old chip / tray is back", async () => {
    const page = await open2(1366, "PHYS_FP2", "off");
    try {
      assert.equal(await page.evaluate(() => !!document.querySelector("#cluckBtn")), false);
      await typeAnswer(page, "1.636");
      await page.waitForSelector("#q .vdrawer .wchip", { state: "attached", timeout: 8000 });
    } finally { await page.context().close(); }
  });
} finally {
  await browser.close(); srv.kill(); stub.close();
}
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
