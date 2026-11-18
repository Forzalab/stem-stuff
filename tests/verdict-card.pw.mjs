// VERDICT-CARD smoke (Tony Nov 14, #563; CLUCK-BTN): under html.ui-v7 there is NO verdict tray and NO Cluck entry in the verdict: the slot (tick / X square) is a plain status icon (no duck, no button role),
// the judged row + Next are one borderless pill (zero gap, same top / bottom, outer radius 16), and the "That's it!" / "Not it." line stays in the DOM, visually hidden (live region).
// Flag off: the loose line, the tray and the gap before Next as before.
// Own serve.py, throwaway bank, a stub OpenRouter.   node tests/verdict-card.pw.mjs [port]   (SHOTS=<dir> saves screenshots)
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
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: wait on state (animations ended + 2 frames), not a fixed sleep
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8897, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "fport-lv-")), BANKS = join(TMP, "banks"), SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const welcome = {
  code: "PHYS_FP1", type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Lift", tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 3.74" },
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant on the big piston, of diameter $2.0\\ \\text{m}$. Find the pressure." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
    { id: "answer", label: "Final answer", kind: "num", unit: "m/s" }
  ] }
};
const roll = { code: "PHYS_FP2", title: "Roll", type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.",
  body: [{ type: "text", md: "A solid sphere rolls without slipping down a 1.0 m ramp. How fast is it moving at the bottom?" }],
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. A rolling ball also spins." }, { value: "0.650", error: "trig", hint: "QUACK. Which trig function?" }],
  saccharine: { title: "Roll", key: "Use: energy with spin\nAnswer: 1.38", slip: { "1.636": "Left out the spin." } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_FPV.json"), JSON.stringify({ v: 1, problems: [welcome, roll] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "The ball also spins." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_FPV", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
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

async function judge(w, flag, right, tries = 1) {
  const page = await open(w, flag, "#PHYS_FP2");
  await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
  const typeAnswer = async v => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
  if (right) { await typeAnswer("1.38"); await page.waitForSelector("#q .ff.rbox.ok .vk", { timeout: 8000 }); }
  else {
    await typeAnswer("1.636");
    await page.waitForSelector("#q .ff.bad .vk, #q .ff.rbox.cue .vk", { state: "attached", timeout: 8000 });
    for (let i = 1; i < tries; i++) { await page.waitForFunction(k => (window.__drill?.state?.tries?.length ?? 0) >= k, i, { timeout: 8000 }); await typeAnswer(["0.650", "2.2", "3.3"][i - 1]); }
  }
  if (flag === "v7") await page.waitForFunction(() => { const b = document.querySelector("#cluckBtn"); return !!b && !b.hasAttribute("aria-disabled"); }, null, { timeout: 8000 });
  else await page.waitForSelector("#q .vdrawer .wchip", { state: "attached", timeout: 8000 });
  await settled(page);   // the verdict card is at rest (animations + transitions ended) before the geometry reads
  return page;
}
/* the geometry: the row (.ff) + Next (.nx) = the pill, the slot (.vk), the (never shown) tray, the verdict line */
const geo = page => page.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const B = e => e && ["Top", "Right", "Bottom", "Left"].map(x => getComputedStyle(e)["border" + x + "Width"]).join(" ");
  const d = document.querySelector("#q .vdrawer, #q .vk[role=button], #q .vkb, #wish .wchip"), ff = document.querySelector("#q .ff.rbox.ok, #q .ff.bad, #q #ff"), nx = document.querySelector("#q .nx"), q = document.querySelector("#q"), vk = ff.querySelector(".vk");
  const lines = [...document.querySelectorAll("#q .ansl")].map(l => ({ inDrawer: !!l.closest(".vdrawer"), shown: l.getBoundingClientRect().width > 2 && l.getBoundingClientRect().height > 2, text: l.textContent.replace(/\s+/g, " ").trim() }));
  const cs = getComputedStyle(ff);
  return { d: R(d), dShown: !!d && d.getClientRects().length > 0, ff: R(ff), nx: R(nx), nf: R(nx && nx.querySelector(".nf")), q: R(q), vk: R(vk), lines, bg: cs.backgroundColor, radius: cs.borderRadius, ffBw: B(ff), nxBw: B(nx), nfBw: nx && B(nx.querySelector(".nf")),
    nfBg: nx && getComputedStyle(nx.querySelector(".nf")).backgroundColor, vkBg: vk && getComputedStyle(vk).backgroundColor, vkLabel: vk && vk.getAttribute("aria-label"), vkDuck: !!(vk && vk.querySelector(".vk-duck")), vw: innerWidth, sw: document.documentElement.scrollWidth };
});
const W = [360, 390, 768, 1366];
const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1, `${m}: ${a} vs ${b}`);
try {
  if (process.env.GEO) for (const w of W) for (const right of [true, false]) { const p = await judge(w, "v7", right); console.log(w, right ? "right" : "wrong", JSON.stringify(await geo(p))); await p.context().close(); }
  for (const w of W) for (const right of [true, false]) await step(`${w}: flag on: ${right ? "right" : "wrong"} = no tray, the slot is the Cluck button${right ? ", row + Next one pill" : ""}`, async () => {
    const page = await judge(w, "v7", right);
    try {
      const g = await geo(page);
      assert.ok(!g.d, "no tray, no chip, no slot button exists under the row: " + JSON.stringify(g.d));
      if (right) {
        assert.equal(g.lines.length, 1, JSON.stringify(g.lines)); assert.ok(!g.lines[0].inDrawer && !g.lines[0].shown && /That's it! The answer is 1\.38/.test(g.lines[0].text), "the verdict line stays in the DOM (live region), visually hidden: " + JSON.stringify(g.lines));
        // one pill: row + Next touch, same top / bottom, no borders, the group's right edge is Next's
        near(g.nx.l, g.ff.r, "zero gap between the row and Next"); near(g.nx.t, g.ff.t, "same top"); near(g.nx.b, g.ff.b, "same bottom"); near(g.nx.r, g.q.r, "the pill ends at the group's right edge");
        near(g.ff.l, g.q.l, "the pill starts at the row's left edge");
        assert.equal(g.ffBw, "0px 0px 0px 0px"); assert.equal(g.nxBw, "0px 0px 0px 0px"); assert.equal(g.nfBw, "0px 0px 0px 0px", "no seam line");
        const t = await page.evaluate(() => CSS.supports("corner-shape", "superellipse(2)") ? "20px" : "16px");   // ICK4-SQUIRCLE-C: --r-tile x 1.25 under corner-shape
        assert.equal(g.radius, `${t} 0px 0px ${t}`, "the row's outer corners = the tile radius, the join flat");
        assert.equal(g.bg, "rgb(12, 44, 34)", "the row = the verdict fill"); assert.equal(g.vkBg, "rgba(0, 0, 0, 0)", "the mark is a plain glyph, no slot tile (VERDICT-MARK-INERT, Tony Nov 15)");
        assert.ok(g.nf.w > 0 && g.nfBg === "rgb(78, 230, 175)", "Next keeps its own fill: " + g.nfBg);
      } else {
        assert.equal(g.bg, "rgb(62, 20, 30)"); assert.equal(g.ffBw, "0px 0px 0px 0px");
        near(g.vk.r, g.ff.r - 14, "the mark sits 14px in from the row end (round 3 centred mark, Tony Nov 15)");
      }
      assert.ok(!g.vkDuck && g.vkLabel === null && g.vk.w > 0 && g.vk.h > 0, "the slot is a plain tick / X, no duck, no button label (inert glyph, no 44px target: VERDICT-MARK-INERT, Tony Nov 15): " + JSON.stringify(g.vk));
      assert.ok(g.ff.r <= g.vw - 8 || right, "right gutter kept"); assert.ok(g.nx ? g.nx.r <= g.vw - 8 : true, "right gutter kept"); assert.ok(g.sw <= g.vw, "no sideways scroll");
      if (SHOTS && (w === 390 || (w === 1366 && right))) { await page.locator("#q").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, `vcard-${right ? "right" : "wrong"}-${w}.png`) }); }
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  for (const right of [true, false]) await step(`1366: flag on: ${right ? "right" : "wrong"}: the one Ask Cluck button on the card opens Cluck`, async () => {
    const page = await judge(1366, "v7", right);
    try {
      await page.locator("#cluckBtn").click();
      await page.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden && c.getClientRects().length > 0; }, null, { timeout: 8000 });
    } finally { await page.context().close(); }
  });
  await step("390: flag on: out of tries = 'Not it. The answer is ...' kept hidden for screen readers, red row, no tray", async () => {
    const page = await open(390, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      for (let i = 0; i < 5 && !await page.evaluate(() => !!document.querySelector("#q .ansl")); i++) {
        await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); const n0 = await page.evaluate(() => window.__drill.state.tries.length); await f.fill(["1.636", "0.650", "2.2", "3.3", "4.4"][i]); await f.press("Enter"); await page.waitForFunction(k => (window.__drill?.state?.tries?.length ?? 0) > k, n0, { timeout: 8000 });
      }
      await page.waitForSelector("#q .ansl", { state: "attached", timeout: 8000 }); await settled(page);
      const g = await geo(page);
      assert.ok(g.lines.length === 1 && !g.lines[0].shown && /^Not it\. The answer is/.test(g.lines[0].text), JSON.stringify(g.lines));
      assert.equal(g.bg, "rgb(62, 20, 30)"); assert.ok(!g.d);
      if (SHOTS) { await page.locator("#q").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, "vcard-notit-390.png") }); }
    } finally { await page.context().close(); }
  });
  await step("flag off: the verdict line stays a loose line under the row, the tray is shown, row and Next stay apart", async () => {
    const page = await open(390, "off", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill("1.38"); await f.press("Enter");
      await page.waitForSelector("#q .vdrawer:not([hidden])", { state: "visible", timeout: 8000 }); await settled(page);
      const g = await geo(page);
      assert.ok(g.lines.length === 1 && !g.lines[0].inDrawer && g.lines[0].shown, JSON.stringify(g.lines));
      assert.ok(g.dShown && g.nx.l - g.ff.r > 4, "the old tray and the gap before Next: " + JSON.stringify({ d: g.d, ff: g.ff, nx: g.nx }));
    } finally { await page.context().close(); }
  });
} finally {
  await browser.close(); srv.kill(); stub.close();
}
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
