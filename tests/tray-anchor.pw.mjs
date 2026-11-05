// TRAY ANCHOR + ANSWER-VALUE MARGINS (Tony, Nov 4, live #415 shots 1-3): the "See steps" tray (.vdrawer, Ask Cluck + ^) SLIPS FROM UNDER the answer box,
// anchored to its BOTTOM-LEFT, never on top of it and never below Next:
//   typed   the box = the answer bar #ff plus its verdict line (.ansl "That's it! The answer is <value>"); the tray's top is tucked behind that bottom edge,
//           its left edge = the box's left edge (+-1px), it never paints over the verdict text, and Next sits below it (tray bottom <= Next top)
//   choose-all  the box = the choices list; same anchor; the Next row moves down below the tray
//   room    the tray reserves flow room only while it is shown: after the dismiss the gap under the box = the gap before the tray (+-1px)
//   margin  the inline answer value in the .ansl line: gap before the value = gap after it (+-1px)
// 390 phone (touch, dpr 2). Own serve.py + a throwaway bank + a stub OpenRouter.   node tests/tray-anchor.pw.mjs <port> [shots dir]
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
  { code: "PHYS_TA1", title: "Stamps", type: "num", answer: "18", tol: 0.01, unit: "cents", how: "A whole number.", body: txt("What is the smallest N cents so that every amount of N cents or more can be made? " + STEM),
    wrong: [{ value: "17", error: "off", hint: "QUACK. Check the amount just below." }], saccharine: { title: "Stamps", key: "Answer: 18", slip: { "17": "One short." } } },
  { code: "PHYS_TA2", title: "Cups", type: "mc", pick: "all", shuffle: false, body: txt(STEM + " Tick all correct options."),
    choices: [{ id: "a", md: "Good base case" }, { id: "b", md: "Good inductive step" }, { id: "c", md: "Good claim" }], correct: ["b"],
    wrong: [{ choice: "a", error: "misread", hint: "QUACK. Look at the base." }], saccharine: { title: "Cups", key: "Tick: b", slip: { a: "The base." } } },
];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_TAA.json"), JSON.stringify({ v: 1, problems: [PROBS[0]] }));
writeFileSync(join(BANKS, "BANK_TAB.json"), JSON.stringify({ v: 1, problems: [PROBS[1]] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Steps. Egg-cellent." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 600;   // > the drawer's 380 ms slide
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#" + (code === "PHYS_TA1" ? "BANK_TAA" : "BANK_TAB"));
  try { await page.waitForFunction(() => !document.getElementById("splash") && /^#PHYS_TA/.test(location.hash) && !!document.querySelector("#q .opt, #ff input, #ff textarea"), null, { timeout: 10000 }); } catch (e) { console.log(await page.evaluate(() => location.hash + " " + !!document.getElementById("splash") + " " + document.body.innerText.slice(0, 200))); throw e; }
  return page;
}
/* rects of: the box (typed: #ff, grown to the verdict line's bottom; choose-all: .choices), the tray, Next, the verdict line + its pieces */
const geo = page => page.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
  const q = document.querySelector("#q"), ff = q.querySelector("#ff"), g = q.querySelector(".choices"), ansl = q.querySelector(".ansl");
  const box = ff ? R(ff) : R(g), d = q.querySelector(".vdrawer:not([hidden])"), nx = q.querySelector(".nx");
  const vis = e => e && e.getClientRects().length ? e : null;
  const b = ansl && ansl.querySelector("b, .ansv"), sp = ansl && ansl.querySelector(":scope > span");
  const span = (a, z) => { if (!a || !z) return null; return { b: R(z), sp: R(a) }; };
  const rr = e => R(vis(e));
  return { ff: R(ff), g: R(g), ansl: rr(ansl), b: rr(b), sp: rr(sp), box, d: rr(d), nx: rr(nx), chk: rr(q.querySelector(".chk")), y: scrollY, span: span };
});
const boxBottom = m => Math.max(m.box.bottom, m.ansl ? m.ansl.bottom : 0);
const typeAnswer = async (page, v) => { const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
const trayOpen = page => page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 8000 }).then(() => page.waitForTimeout(SETTLE));
const shot = (page, n) => SHOTS ? page.screenshot({ path: join(SHOTS, n) }) : null;
const near = (a, b, t, what) => assert.ok(Math.abs(a - b) <= t, `${what}: ${a.toFixed(1)} vs ${b.toFixed(1)} (tol ${t})`);

try {
  await step("390 typed right: the tray's top is at the box bottom (box = bar + verdict line), its left = the box left, it never paints over the verdict line, no overlap with Next", async () => {
    const page = await open("PHYS_TA1");
    try {
      await typeAnswer(page, "18");
      await page.waitForSelector("#q .ansl b", { timeout: 6000 });
      await trayOpen(page);
      const m = await geo(page);
      await shot(page, "ta-typed.png");
      assert.ok(m.d && m.ansl, "an open tray and the verdict line: " + JSON.stringify(m));
      near(m.d.left, m.box.left, 1, "tray left vs box left");
      const bb = boxBottom(m);
      assert.ok(m.d.top >= bb - 2 && m.d.top <= bb + 2, `tray top ${m.d.top.toFixed(1)} is not at the box bottom ${bb.toFixed(1)} (+-2; the box includes the verdict line)`);
      const hit = await page.evaluate(() => { const b = document.querySelector("#q .ansl"); const r = b.getBoundingClientRect(); return [0.1, 0.5, 0.9].every(f => { const e = document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2); return !!e && !!e.closest(".ansl"); }); });
      assert.ok(hit, "the tray paints over the verdict line");
      if (m.nx) {                                                          // Next in the bar's row (beside the box): the tray may not lie on it; when they share a column the tray ends above Next
        const sameCol = !(m.d.right <= m.nx.left || m.d.left >= m.nx.right);
        if (sameCol) assert.ok(m.d.bottom <= m.nx.top + 0.5, `tray bottom ${m.d.bottom.toFixed(1)} is not above Next top ${m.nx.top.toFixed(1)}`);
        else assert.ok(m.d.top >= m.nx.bottom - 0.5 || m.d.right <= m.nx.left, "tray lies on Next");
      }
      assert.deepEqual(page.errs, []);
    } finally { await page.context().close(); }
  });
  await step("390 typed right: the tray takes flow room only while shown (dismissed = the layout with no tray at all, +-1px; reopen/close repeats)", async () => {
    const page = await open("PHYS_TA1");
    try {
      await typeAnswer(page, "18");
      await page.waitForSelector("#q .ansl b", { timeout: 6000 });
      await trayOpen(page);
      const bottom = () => page.evaluate(() => { const r = document.querySelector("#q").getBoundingClientRect(); const f = document.querySelector("#fb"), n = document.querySelector("#blocks, #card, #main"); return { q: r.bottom + scrollY, below: (document.querySelector("#q").parentElement.getBoundingClientRect().bottom + scrollY), rooms: document.querySelectorAll("#q .vd-room").length }; });
      const open1 = await bottom();
      assert.equal(open1.rooms, 1, "one room spacer while the tray is shown");
      await page.click("#q .vdrawer .vd-x"); await page.waitForTimeout(SETTLE);
      const shut = await bottom();
      assert.equal(shut.rooms, 0, "the room spacer outlives the tray");
      await page.addStyleTag({ content: ".vdrawer, .vd-room { display: none !important; }" });   // baseline: the layout with no tray at all
      const none = await bottom();
      near(shut.q, none.q, 1, "the box column's bottom after the dismiss vs no tray");
      near(shut.below, none.below, 1, "the card's bottom after the dismiss vs no tray");
      assert.ok(open1.q > shut.q + 20, `while shown the tray has its room (${open1.q.toFixed(1)} vs ${shut.q.toFixed(1)})`);
    } finally { await page.context().close(); }
  });
  await step("390 choose-all right: the tray's top is tucked under the choices box bottom, its left = the box left, the Next row is below the tray (no vertical overlap)", async () => {
    const page = await open("PHYS_TA2");
    try {
      await page.click('#q .opt[data-id="b"]');
      await page.click("#q .chk .go, #q #mcGo, #q .chk button");
      await page.waitForSelector("#q .nx", { timeout: 6000 });
      await trayOpen(page);
      const m = await geo(page);
      if (process.env.TA_PROBE) console.log(JSON.stringify(m));
      await shot(page, "ta-pickall.png");
      assert.ok(m.d && m.nx, "an open tray and Next: " + JSON.stringify(m));
      near(m.d.left, m.box.left, 1, "tray left vs the choices box left");
      assert.ok(m.d.top >= m.box.bottom - 2 && m.d.top <= m.box.bottom + 2, `tray top ${m.d.top.toFixed(1)} is not tucked at the choices box bottom ${m.box.bottom.toFixed(1)}`);
      assert.ok(m.d.bottom <= m.nx.top + 0.5, `tray bottom ${m.d.bottom.toFixed(1)} is not above Next top ${m.nx.top.toFixed(1)}`);
      assert.deepEqual(page.errs, []);
    } finally { await page.context().close(); }
  });
  await step("390 typed right: the gap before the answer value = the gap after it (+-1px)", async () => {
    const page = await open("PHYS_TA1");
    try {
      await typeAnswer(page, "18");
      await page.waitForSelector("#q .ansl b", { timeout: 6000 });
      await page.waitForTimeout(SETTLE);
      await shot(page, "ta-ansl.png");
      const g = await page.evaluate(() => {
        const l = document.querySelector("#q .ansl"), v = l.querySelector(".ansv, :scope > b"), b = v.querySelector("b") || v, u = l.querySelector(".ansu");
        const ink = (el, last) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, out = null; while ((n = w.nextNode())) { if (!n.data.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); const rs = [...r.getClientRects()]; const k = last ? rs[rs.length - 1] : rs[0]; if (last || !out) out = k; } return out; };
        const sent = [...l.children].find(c => c.tagName === "SPAN" && /answer is/i.test(c.textContent));
        const w = document.createRange(), wt = ink(sent, true);
        // trim the spaces off each side of the value's ink: the value's own glyphs (the green <b>, its nbsp stripped)
        const rb = document.createRange(); rb.selectNodeContents(b);
        const bt = [...rb.getClientRects()]; const val = { left: Math.min(...bt.map(x => x.left)), right: Math.max(...bt.map(x => x.right)) };
        return { wordsRight: wt.right, vLeft: val.left, vRight: val.right, unitLeft: u ? ink(u, false).left : null, text: l.textContent };
      });
      if (process.env.TA_PROBE) console.log(await page.evaluate(() => { const v = document.querySelector("#q .ansv"); return [...v.childNodes].map(n => n.nodeType + JSON.stringify(n.data || n.className) + JSON.stringify((() => { const r = document.createRange(); r.selectNode(n); return [...r.getClientRects()].map(x => [x.left, x.width]); })())).join("|") + " ws=" + getComputedStyle(v).whiteSpace + " wsp=" + getComputedStyle(v).wordSpacing; }));
      if (process.env.TA_PROBE) console.log("PSEUDO", await page.evaluate(() => { const v = document.querySelector("#q .ansv"), c = getComputedStyle(v, "::before"), a = getComputedStyle(v.parentElement); return JSON.stringify([c.content, c.fontSize, c.fontFamily, c.fontWeight, c.letterSpacing, c.whiteSpace, c.display, c.width, a.gap, getComputedStyle(v).marginLeft, a.fontSize]); }));
      if (false) console.log(JSON.stringify(g), await page.evaluate(() => [...document.querySelectorAll("#q .ansl *")].map(e => e.tagName + "." + e.className + " " + JSON.stringify(e.getBoundingClientRect().toJSON()) + getComputedStyle(e).fontFamily.slice(0,20) + getComputedStyle(e).fontWeight + getComputedStyle(e).letterSpacing).join("\n")));
      assert.equal(g.unitLeft != null, true, "the unit follows the value: " + g.text);
      const before = g.vLeft - g.wordsRight, after = g.unitLeft - g.vRight;
      assert.ok(Math.abs(before - after) <= 1, `gap before the value ${before.toFixed(1)}px vs after ${after.toFixed(1)}px (${g.text})`);
    } finally { await page.context().close(); }
  });
} finally { await browser.close(); srv.kill(); stub.close(); }
console.log(failures ? `${failures} failing` : "all ok");
process.exit(failures ? 1 : 0);
