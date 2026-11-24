// CLUCK-BTN smoke (Tony Nov 14; E3 Nov 17; ICK5 Nov 18): under html.ui-v7 there is ONE Ask Cluck button, the tangerine squircle at the question card's top right (typed, MC, multi-part) and no other entry (no chip, no tray, no duck slot).
// Disabled = aria-disabled (not the attribute, no pointer-events:none) only with no Cluck key (off). Nov 22: before the first try it is READY (no "first" state, no note): a press opens Cluck on the starter chip + the locked strip; a wrong try plays the sheen.
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
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: wait on state, not on time
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
  const br = r(b), pr = r(p), cs = getComputedStyle(b), pcs = getComputedStyle(p), px = v => parseFloat(v) || 0, txt = []; for (const e of document.querySelectorAll("#problem .blocks")) { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); txt.push(...[...g.getClientRects()].filter(x => x.width > 2)); } }
  return { n: document.querySelectorAll("#cluckBtn").length, br: { l: br.left, r: br.right, t: br.top, b: br.bottom, w: br.width, h: br.height }, pr: { l: pr.left, r: pr.right, t: pr.top }, aria: b.getAttribute("aria-disabled"), dis: b.hasAttribute("disabled"),
    pe: cs.pointerEvents, bg: cs.backgroundColor, color: cs.color, bw: cs.borderTopWidth, shadow: cs.boxShadow, label: b.textContent.replace(/\s+/g, " ").trim(), st: b.dataset.st, pos: cs.position, flt: cs.cssFloat || cs.float, parent: b.parentElement.id,
    cb: { r: pr.right - px(pcs.paddingRight) - px(pcs.borderRightWidth), t: pr.top + px(pcs.paddingTop) + px(pcs.borderTopWidth) },
    overlap: txt.some(x => !(x.right <= br.left || x.left >= br.right || x.bottom <= br.top || x.top >= br.bottom)), vw: innerWidth, sw: document.documentElement.scrollWidth,
    ladder: [...document.querySelectorAll(".wchip, .vdrawer, .cl-cta, .vk[role=button], .vkb, .vk-duck")].length,
    padR: parseFloat(getComputedStyle(p).paddingRight) || 0, padT: parseFloat(getComputedStyle(p).paddingTop) || 0,
    tb: (() => { const t = document.querySelector("#problem > .blocks > :is(.ptitle, .qhead):first-child"); if (!t) return null; const g = document.createRange(); g.selectNodeContents(t); const rs = [...g.getClientRects()]; return rs.length ? t.getBoundingClientRect().bottom : null; })() };
});
const open2 = async (w, code, flag = "v7") => { const p = await open(w, flag, "#" + code); await p.waitForSelector("#q", { timeout: 10000 }); await settled(p); return p; };
const typeAnswer = async (page, v) => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
const toastText = page => page.evaluate(() => { const t = document.getElementById("toast"); return t && t.classList.contains("on") ? t.textContent.trim() : ""; });
const W = [390, 1366];
try {
  for (const [code, kind] of [["PHYS_FP2", "typed"], ["PHYS_FP3", "mc"], ["PHYS_FP4", "multi"]]) for (const w of W) await step(`${w}: ${kind}: one ready Ask Cluck button (no first state), the tangerine squircle at the card's top right (ICK5), >= 44px`, async () => {
    const page = await open2(w, code);
    try {
      const g = await geo(page);
      assert.ok(g, "the button exists"); assert.equal(g.n, 1); assert.equal(g.label, "Ask Cluck", "Nov 22: no 'first' note any more");
      assert.equal(g.aria, null, "ready before a try: no aria-disabled"); assert.notEqual(g.st, "first", "no first state"); assert.equal(g.dis, false, "no disabled attribute"); assert.notEqual(g.pe, "none", "no pointer-events:none");
      assert.ok(g.br.h >= 44 && g.br.w >= 44, "tap target: " + JSON.stringify(g.br));
      // ICK5-CLUCK-TR (Tony Nov 18, supersedes the ICK E3 left-edge tab): AC1 + AC2 + AC3 for this viewport
      assert.equal(g.parent, "problem", "AC1: not a child of #problem: " + g.parent);
      assert.notEqual(g.pos, "fixed", "AC1: still the fixed edge tab: " + g.pos);
      assert.equal(g.flt, "right", "AC1: computed float is " + g.flt);
      assert.ok(Math.abs(g.br.w - 44) <= .5 && Math.abs(g.br.h - 44) <= .5, "AC2: box is not 44x44: " + JSON.stringify(g.br));
      assert.ok(Math.abs(g.br.r - g.cb.r) <= 1.5, "AC3: right edge " + g.br.r + " vs content right " + g.cb.r);
      assert.ok(Math.abs(g.br.t - g.cb.t) <= 3, "AC3: top " + g.br.t + " vs content top " + g.cb.t);
      assert.equal(g.bg, "rgb(255, 166, 62)", "ICK5 AC4: tangerine = --help"); assert.equal(g.shadow, "none", "ICK5 AC4: no shadow");
      assert.equal(g.ladder, 0, "no other entry on the page: " + g.ladder); assert.ok(g.sw <= g.vw, "no sideways scroll");
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `cluckbtn-${kind}-${w}.png`) });
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  await step("390 + 1280: CLUCK-BTN-DISABLED: off = the --chip slate with the #7a8aae duck (not tangerine), ready = tangerine again, 240 ms ease-out, reduced motion off", async () => {
    for (const w of [390, 1280]) {
      const page = await open2(w, "PHYS_FP2");
      try {
        const read = () => page.evaluate(() => {
          const b = document.getElementById("cluckBtn"), d = b.querySelector(".cb-duck"), cs = getComputedStyle(b), ds = getComputedStyle(d);
          const p = document.createElement("i"); p.style.background = "var(--chip)"; document.body.append(p);
          const chip = getComputedStyle(p).backgroundColor; p.remove();
          const at = (props, vals, prop) => { const i = props.split(",").map(s => s.trim()).indexOf(prop), v = vals.split(",").map(s => s.trim()); return i < 0 ? null : v[i] ?? null; };
          return { st: b.dataset.st, aria: b.getAttribute("aria-disabled"), chip, bg: cs.backgroundColor, duck: ds.color, shadow: cs.boxShadow,
            btn: { dur: at(cs.transitionProperty, cs.transitionDuration, "background-color"), ease: at(cs.transitionProperty, cs.transitionTimingFunction, "background-color") },
            duckT: { dur: at(ds.transitionProperty, ds.transitionDuration, "color"), ease: at(ds.transitionProperty, ds.transitionTimingFunction, "color") },
            raw: { btnProp: cs.transitionProperty, btnDur: cs.transitionDuration, duckProp: ds.transitionProperty, duckDur: ds.transitionDuration } };
        });
        let s = await read();
        assert.equal(s.aria, null, w + ": a fresh problem is ready"); assert.equal(s.st, "ready");
        assert.equal(s.bg, "rgb(255, 166, 62)", w + ": ready fill is tangerine (byte-identical)"); assert.equal(s.duck, "rgb(2, 4, 13)", w + ": ready duck is --page");
        const was = await page.evaluate(() => { const b = document.getElementById("cluckBtn"); return { st: b.dataset.st, ad: b.getAttribute("aria-disabled") }; });
        await page.evaluate(() => { const b = document.getElementById("cluckBtn"); b.dataset.st = "off"; b.setAttribute("aria-disabled", "true"); });
        await settled(page, "#cluckBtn");
        s = await read();
        assert.equal(s.st, "off"); assert.equal(s.aria, "true");
        assert.notEqual(s.bg, "rgb(255, 166, 62)", w + ": off is still tangerine (the bug)"); assert.equal(s.bg, s.chip, w + ": off fill " + s.bg + " != --chip " + s.chip);
        assert.equal(s.duck, "rgb(122, 138, 174)", w + ": off duck is #7a8aae"); assert.equal(s.shadow, "none", w + ": off keeps no raise");
        assert.equal(s.btn.dur, "0.24s", w + ": unlock background-color 240 ms (btn " + JSON.stringify(s.btn) + ", " + JSON.stringify(s.raw) + ")"); assert.equal(s.btn.ease, "ease-out");
        assert.equal(s.duckT.dur, "0.24s", w + ": unlock duck colour 240 ms (duck " + JSON.stringify(s.duckT) + ", " + JSON.stringify(s.raw) + ")"); assert.equal(s.duckT.ease, "ease-out");
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `cluckbtn-off-${w}.png`) });
        await page.evaluate(o => { const b = document.getElementById("cluckBtn"); if (o.st === undefined) delete b.dataset.st; else b.dataset.st = o.st;
          if (o.ad === null) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", o.ad); }, was);
        await settled(page, "#cluckBtn");
        s = await read();
        assert.equal(s.aria, null, w + ": ready again"); assert.equal(s.bg, "rgb(255, 166, 62)", w + ": ready again is tangerine"); assert.equal(s.duck, "rgb(2, 4, 13)", w + ": ready duck is --page again");
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `cluckbtn-ready-${w}.png`) });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForFunction(() => matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 3000 });
        s = await read();
        assert.equal(s.raw.btnDur.split(",").every(v => v.trim() === "0s"), true, w + ": reduced motion switches the fill off: " + s.raw.btnDur);
        assert.equal(s.raw.duckDur.split(",").every(v => v.trim() === "0s"), true, w + ": reduced motion switches the duck colour off: " + s.raw.duckDur);
      } finally { await page.context().close(); }
    }
  });
  await step("1366: before a try: hover shows no note; a press focuses the open box (the starter chip + the locked strip), no /explain", async () => {
    const page = await open2(1366, "PHYS_FP2");
    try {
      await page.hover("#cluckBtn"); await page.waitForTimeout(300); // keep: observation window, no note may appear
      assert.equal(await toastText(page), "", "no 'first try' note");
      await page.click("#cluckBtn");
      await page.waitForSelector("#cluck .cl-ft .ask.locked", { state: "visible", timeout: 8000 });
      assert.equal(await page.evaluate(() => document.querySelector("#cluck .ask .g-lock .txt")?.textContent), "Available after your first try.");
      assert.equal(await page.evaluate(() => document.querySelector("#cluck .ask textarea").disabled), true, "the locked field is disabled");
    } finally { await page.context().close(); }
  });
  await step("390: before a try: a tap opens the sheet on the locked strip (phone)", async () => {
    const page = await open2(390, "PHYS_FP2");
    try { await page.locator("#cluckBtn").tap(); await page.waitForSelector("#cluck .cl-ft .ask.locked", { state: "visible", timeout: 8000 }); assert.equal(await toastText(page), "", "no note"); } finally { await page.context().close(); }
  });
  await step("390: (old) first-state note is gone", async () => {
    const page = await open2(390, "PHYS_FP2");
    try { assert.equal(await page.evaluate(() => document.querySelector("#cluckWhy")?.textContent || ""), ""); assert.equal(await toastText(page), ""); } finally { await page.context().close(); }
  });
  await step("390: flag on: a wrong try unlocks it (fill sweeps in, 150-300 ms), the sheen plays, no chip / tray / slot duck anywhere; a press opens Cluck", async () => {
    const page = await open2(390, "PHYS_FP2");
    try {
      await typeAnswer(page, "1.636");
      await page.waitForFunction(() => document.querySelector("#cluckBtn") && !document.querySelector("#cluckBtn").hasAttribute("aria-disabled"), null, { timeout: 8000 });
      const sw = await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn"), "::before").display);
      assert.equal(sw, "none", "E3: no fill / sweep layer on the tab");
      await page.waitForSelector("#cluckBtn.cb-sheen, #cluckBtn.cb-shake", { state: "attached", timeout: 4000 });   // wrong try = the sheen; the stub reply that lands next = the duck head shake (the later event wins)
      const g = await geo(page);
      assert.equal(g.ladder, 0, "no old entry"); assert.equal(g.aria, null); assert.equal(g.bg, "rgb(255, 166, 62)", "E3: tangerine tab when ready");
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
      await page.waitForTimeout(1300); // keep: app timer removes the class (~1.1 s); the assert checks it ends
      assert.equal(await page.evaluate(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen")), false, "ends by itself");
      await page.evaluate(() => window.stemCluckBtn.sheen("jev-s6"));
      await page.waitForFunction(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen"), null, { timeout: 8000 });
      assert.equal(await page.evaluate(() => document.querySelector("#cluckBtn").classList.contains("cb-sheen")), true, "Jev S6 sheen");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn .cb-t")).animationName), "cb-sweep", "CLUCK-SWEEP: the underline sweep, not a band");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn .cb-t")).backgroundImage.includes("255, 166, 62")), true, "CLUCK-SWEEP: the line is the link's orange tone");
      await page.waitForTimeout(1200); // keep: app timer removes the class (~1.1 s); the assert checks it ends
      await page.evaluate(() => window.stemCluckBtn.sheen("reply"));
      await page.waitForFunction(() => document.querySelector("#cluckBtn").classList.contains("cb-shake"), null, { timeout: 8000 });
      assert.equal(await page.evaluate(() => { const b = document.querySelector("#cluckBtn"); return b.classList.contains("cb-shake") && !b.classList.contains("cb-sheen") && getComputedStyle(b.querySelector(".cb-t")).animationName; }), "cb-sweep", "reply = the underline sweep (CLUCK-SWEEP), duck still");
      await page.waitForTimeout(1200); // keep: app timer removes the class (~1.1 s); the assert checks it ends
      await page.evaluate(() => window.stemCluckBtn.sheen("right"));
      await page.waitForFunction(() => getComputedStyle(document.querySelector("#cluckBtn .cb-t")).animationName === "cb-sweep", null, { timeout: 8000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#cluckBtn .cb-t")).animationName), "cb-sweep", "right = the underline sweep (CLUCK-SWEEP)");
      await page.waitForTimeout(1200); // keep: app timer removes the class (~1.1 s); the assert checks it ends
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 3000 });
      await page.evaluate(() => window.stemCluckBtn.sheen("jev-s6")); await settled(page, "#cluckBtn");
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
