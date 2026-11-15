// Smoke: the row reward toast under html.ui-v7 (DUCK-V8-TOAST, TOAST-GAP, tray9 C2). Every beat at 390 + 1366: the duck sits in a square box (TOAST-DYN: 44 + gap 12 for 1 line,
// 64 + gap 16 for 2-3 lines), the words start at box right + gap (+-1), the duck is the beat's mood webp, the title is one line at 390, the close never sits on a word.
// Flag off: the plain toast, unchanged. Own serve.py with a fixture bank:  node tests/toast-gap.pw.mjs [port] [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8893), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || join(ROOT, "tests", "out");
const TMP = mkdtempSync(join(tmpdir(), "toast-gap-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
mkdirSync(BANKS, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
writeFileSync(join(BANKS, "BANK_TG01.json"), JSON.stringify({ v: 20261022, problems: [real("CALC1_R01", 1), real("CALC1_R02", 2), real("CALC1_R03", 3), real("CALC1_R04", 4)] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
/* a page on the fixture bank; ui = true turns the row on (localStorage stem-ui, read by fx.js before first paint) */
async function fresh(w, ui) {
  const h = 800, mobile = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : h }, serviceWorkers: "block", isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  await ctx.addInitScript((ui) => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    if (ui) localStorage.setItem("stem-ui", "v7"); else localStorage.removeItem("stem-ui"); } catch { /* blocked */ } }, ui);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/");
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await p.isVisible("#code")) break; if (await p.isVisible(s)) await p.click(s); }
  await p.fill("#code", "BANK_TG01"); await p.press("#code", "Enter");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 }).catch(async e => { throw new Error(e.message + " | " + JSON.stringify(await p.evaluate(() => [document.querySelector("#pcode")?.textContent, document.querySelector("#code")?.value, document.body.innerText.slice(0, 300)]))); });
  return { ctx, p, errs };
}
/* the words, the box and the close, measured on the shown toast (after its slide, so the rects are at rest) */
const geo = p => p.evaluate(() => {
  const t = document.querySelector(".stoast.on"); if (!t) return null;
  const r = s => { const e = t.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null; };
  const img = t.querySelector(".stoast-duck img");
  return { card: t.getBoundingClientRect().toJSON(), box: r(".stoast-duck"), words: r(".stoast-b"), title: r(".stoast-t"), x: r(".stoast-x"), src: img ? img.getAttribute("src") : null,
    titleH: t.querySelector(".stoast-t").getBoundingClientRect().height, row: t.classList.contains("stoast-v7"), one: t.classList.contains("stoast-1l"), text: t.querySelector(".stoast-t").textContent };
});
const shown = p => p.waitForFunction(() => { const t = document.querySelector(".stoast.on"); return t && !t.getAnimations({ subtree: true }).length && t.dataset.done === "1"; }, null, { timeout: 9000 });
/* one beat: show it through the one toast API (the same call the engine makes), wait for it to land, check the geometry */
async function beat(p, o, w, mood, opts = {}) {
  await p.evaluate(() => window.stemToast && window.stemToast.clear());
  await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
  await p.evaluate(o => window.stemToast.show(Object.assign({ at: () => document.querySelector("#q"), ms: 60000, from: 0, to: 0.6 }, o)), { ...o, duck: mood, row: true, segs: 5 });
  await shown(p);
  const g = await geo(p);
  assert.ok(g && g.row, `${w} ${mood}: the row toast is on`);
  assert.equal(g.src, `client/rewards/icons/duck8-${mood}.webp`, `${w} ${mood}: duck img`);
  geom(g, `${w} ${mood}`);
  assert.ok(g.words.right <= g.card.right - 40 + 1, `${w} ${mood}: no word under the close`);
  if (w < 600) assert.ok(g.titleH <= 25, `${w} ${mood}: title is one line at 390, got ${g.titleH}px`);
  return g;
}
/* TOAST-DYN rule (approved design change, replaces the fixed 80 box / gap 32): box square, 44 + gap 12 for 1 line, 64 + gap 16 for 2-3 lines */
function geom(g, tag) {
  const one = g.one, want = one ? 44 : 64, gap = one ? 12 : 16;
  assert.ok(Math.abs(g.box.width - g.box.height) < 0.5 && Math.abs(g.box.width - want) < 0.5, `${tag}: duck box ${want} square (${one ? "1 line" : "multi"}), got ${g.box.width}x${g.box.height}`);
  assert.ok(Math.abs(g.words.left - (g.box.right + gap)) <= 1, `${tag}: words start at box right + ${gap} (box ${g.box.right}, words ${g.words.left})`);
  assert.ok(g.x.width >= 44 && g.x.height >= 44, `${tag}: close hit area >= 44`);
}
const SH = (p, name) => p.screenshot({ path: join(SHOTS, name) });

for (const w of [390, 1366]) {
  await step(`${w}: start beat (0 done): duck8-start, dyn box, words at box right + gap, title one line`, async () => {
    const { ctx, p, errs } = await fresh(w, true);
    await shown(p);
    const g = await geo(p);
    assert.ok(g && g.row && g.src.endsWith("duck8-start.webp"), "start row");
    assert.equal(g.text, "Ready when you are", "start line");
    geom(g, "start"); assert.ok(g.one, "start is 1 line");
    if (w < 600) assert.ok(g.titleH <= 25, "start title one line at 390");
    await SH(p, `toast-start-${w}.png`);
    assert.deepEqual(errs, [], "no page errors");
    await ctx.close();
  });
  await step(`${w}: landmark beat (1 of 4 crossed): duck8-landmark, title + dim subtitle`, async () => {
    const { ctx, p } = await fresh(w, true);
    await shown(p);
    await p.evaluate(() => window.Rewards.config({ goal: 4 }));
    await p.evaluate(() => window.stemToast && window.stemToast.clear());
    await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
    await p.evaluate(() => { const R = window.Rewards; R.mastery({ type: "miss", tpl: "Q1", b: false }); R.mastery({ type: "repair_done", tpl: "Q1" }); R.mastery({ type: "twin_a", tpl: "Q1", ok: true }); });
    await shown(p);
    const g = await geo(p);
    assert.ok(g.src.endsWith("duck8-landmark.webp"), "landmark duck");
    assert.equal(g.text, "1 question done.", "title");
    geom(g, "landmark"); assert.ok(!g.one, "title + subtitle = multi");
    if (w < 600) assert.ok(g.titleH <= 25, "landmark title one line");
    await SH(p, `toast-landmark-${w}.png`);
    await ctx.close();
  });
  await step(`${w}: miss, twist, cram, late beats: mood duck, same box and words geometry`, async () => {
    const { ctx, p } = await fresh(w, true);
    await shown(p);
    await beat(p, { text: "Close call", sub: "Let's retry next turn!" }, w, "miss");
    await SH(p, `toast-miss-${w}.png`);
    await beat(p, { text: "Found a twist.", sub: "" }, w, "twist");
    await beat(p, { text: "Cram day", sub: "Tap Cluck to draw intel, step by step." }, w, "cram");
    await beat(p, { text: "Only 3 to go!", sub: "You got this!" }, w, "late");
    await ctx.close();
  });
  await step(`${w}: flag off: the plain toast, no duck, the old words`, async () => {
    const { ctx, p } = await fresh(w, false);
    await shown(p);
    await p.evaluate(() => window.stemToast.clear());
    await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
    await p.evaluate(() => window.Rewards.config({ goal: 4 }));
    await p.evaluate(() => { const R = window.Rewards; R.mastery({ type: "miss", tpl: "Q1", b: false }); R.mastery({ type: "repair_done", tpl: "Q1" }); R.mastery({ type: "twin_a", tpl: "Q1", ok: true }); });
    await shown(p);
    const g = await geo(p);
    assert.equal(g.row, false, "no row class");
    assert.equal(g.box, null, "no duck box");
    assert.equal(g.text, "1 question done. Quack on!", "the old stage line");
    await ctx.close();
  });
}
if (process.env.TILT_SHOT !== "0") {
  await step("390 + 1366 shot: the start, miss and landmark cards, plus one tilted corner-duck card (demo fixture only)", async () => {
    // DUCK-CORNER-TILT: no production card on main has a duck at its bottom-right, so the tilt is shown on a fixture card only.
    for (const w of [390, 1366]) {
      const { ctx, p } = await fresh(w, true);
      await shown(p);
      await p.evaluate(() => { const s = document.createElement("style"); s.textContent = `
        .tilt-demo{position:fixed;left:16px;bottom:120px;width:min(358px,calc(100vw - 32px));height:112px;border-radius:24px;background:var(--float);box-shadow:var(--shadow-3);overflow:hidden;z-index:40;padding:24px}
        .tilt-demo img{position:absolute;right:-22px;bottom:-30px;width:96px;height:96px;transform:rotate(-20deg);pointer-events:none}
        .tilt-demo b{display:block;font:700 18px/24px var(--font,system-ui,sans-serif)}`; document.head.appendChild(s);
        const c = document.createElement("div"); c.className = "tilt-demo"; c.innerHTML = '<b>Peek corner</b><img alt="" src="client/rewards/icons/duck8-cram.webp">'; document.body.appendChild(c); });
      await p.waitForTimeout(150);
      await SH(p, `toast-tilt-${w}.png`);
      await ctx.close();
    }
  });
}
await browser.close(); srv.kill();
console.log(failures ? `\n${failures} failed` : "\nall toast-gap checks passed");
process.exit(failures ? 1 : 0);
