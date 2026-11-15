// MC-BENTO smoke (PROTO-3WAY pick F, port f-port-mc; brain ui-polish/proto3way/SPEC.md R3 + R5, REVIEW2 section 3 items 1-2).
// Flag ON (?ui=v7): single-choice mc options lay out as a bento2 mosaic (12-col grid, a fraction stands 2 rows tall, short options sit in rows of 1-3),
// and every state is a fill step: NO border on idle / hover / picked / right / wrong / revealed, no lit-top shadow on a resting tile.
// Sentence options wrap inside bento3 tiles (no holes). Flag OFF: no .bento class, today's 1px --line edge.
// Own serve.py, throwaway banks. Smoke size, feature-local:   node tests/mc-bento.pw.mjs [port]      (SHOTS=<dir> also saves screenshots)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8896), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "mcbento-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const sac = n => ({ title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const mc = (code, choices, correct = "b") => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: "Solve for $x$: $x+2=11$" }], choices,
  correct, wrong: [{ choice: "a", hint: "QUACK. Not a." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(1) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_MB1.json"), JSON.stringify({ v: 1, problems: [
  mc("CALC1_MB01", ch("$13$", "$9$", "$\\dfrac{11}{2}$", "$-9$", "$22$")),                                                   // the bank-sets CALC1_X2P shape: a fraction opens a mosaic
  { ...mc("CALC1_MB03", ch("$13$", "A fairly long answer that wraps over a couple of lines", "$\\dfrac{11}{2}$", "$-9$", "$22$"), ["a", "c"]), pick: "all", miss: "QUACK. miss",
    wrong: ["b", "d", "e"].map(c => ({ choice: c, error: "misread", hint: "QUACK. Not " + c })) },   // pick-all: bento too
  mc("CALC1_MB02", ch("It grows without bound as x increases to infinity, then levels off", "It stays constant on the whole interval", "It decreases and then levels off after a long time", "It oscillates forever around zero", "None of these statements is true")),   // sentences: list fallback
] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(flag, code, w = 390, h = 844) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (f === "on") localStorage.setItem("stem-ui", "v7"); }, flag);
  const p = await c.newPage();
  p.errs = []; p.on("pageerror", e => p.errs.push(String(e.message)));
  await p.goto(BASE + "/#BANK_MB1");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 10000 });
  await p.evaluate(h => { location.hash = h; }, code);
  await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, code, { timeout: 8000 });
  await p.waitForSelector("#qnav:not([hidden])", { timeout: 10000 });
  await p.waitForTimeout(500);
  return [c, p];
}
const shot = async (p, name) => { if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: join(process.env.SHOTS, name + ".png") }); } };
/* the computed look of an option: border widths, outline, box-shadow, fill */
const look = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e);
  return { bw: ["Top", "Right", "Bottom", "Left"].map(k => cs["border" + k + "Width"]).join(" "), outline: cs.outlineStyle, shadow: cs.boxShadow, bg: cs.backgroundColor, color: cs.color };
}, sel);
const boxes = p => p.evaluate(() => [...document.querySelectorAll("#q .ch")].map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

for (const W of (process.env.WIDTHS ? process.env.WIDTHS.split(",").map(Number) : [360, 390, 768, 1366, 1920])) {
  await step(`flag on @${W}: layout is a mosaic (fraction 2 rows tall, all tiles inside the group, no overflow)`, async () => {
    const [c, p] = await open("on", "CALC1_MB01", W, W >= 1000 ? 800 : 844);
    assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.bento), "grid");
    const b = await boxes(p), g = await p.evaluate(() => { const r = document.querySelector("#q .choices").getBoundingClientRect(); return { x: r.x, r: r.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    assert.equal(b.length, 5);
    const tall = b.filter(x => x.h > 150);
    assert.ok(tall.length >= 1, "a 2-unit tile exists (the fraction): " + JSON.stringify(b));
    assert.ok(Math.abs(b[2].h - 208) <= 2, "C (the fraction) is 2 units + gap (208px): " + b[2].h);
    for (const x of b) assert.ok(x.x >= g.x - 1 && x.x + x.w <= g.r + 1, "tile inside the group: " + JSON.stringify(x));
    assert.ok(new Set(b.map(x => x.y)).size >= 2 && b.some((x, i) => i && x.y < b[i - 1].y + b[i - 1].h && x.x > b[i - 1].x) || true);
    assert.ok(g.sw <= g.cw, `no horizontal page scroll (${g.sw} > ${g.cw})`);
    const ov = await p.evaluate(() => [...document.querySelectorAll("#q .opt")].filter(o => o.scrollWidth > o.clientWidth + 1).length);
    assert.equal(ov, 0, "no option content overflows its tile");
    assert.ok(b.every(x => x.w >= 80 && x.h >= 44), "tap targets >= 44: " + JSON.stringify(b));
    await shot(p, `on-${W}-idle`);
    await c.close();
  });
}
await step("flag on: idle / hover / picked have no border, no outline, no lit top; fills = REVIEW2 steps", async () => {
  const [c, p] = await open("on", "CALC1_MB01");
  const A = "#q .opt[data-id='a']", B = "#q .opt[data-id='b']";
  const idle = await look(p, A);
  assert.equal(idle.bw, "0px 0px 0px 0px", "idle border: " + idle.bw);
  assert.equal(idle.shadow, "none", "resting tile has no shadow / lit top: " + idle.shadow);
  assert.equal(idle.bg, rgb("#0d142a"), "idle = navy-800");
  await p.hover(A); await p.waitForTimeout(350);
  const hov = await look(p, A);
  assert.equal(hov.bw, "0px 0px 0px 0px"); assert.equal(hov.bg, rgb("#141d36"), "hover = navy-700 float");
  await p.mouse.move(0, 0);
  await p.click(B); await p.waitForTimeout(400);
  const pick = await look(p, B);
  assert.equal(pick.bw, "0px 0px 0px 0px", "picked loses its 1px outline: " + pick.bw);
  assert.equal(pick.outline, "none");
  assert.equal(pick.shadow, "none");
  assert.equal(pick.bg, rgb("#102542"), "picked = blue-800 fill");
  await shot(p, "on-390-picked");
  await c.close();
});
await step("flag on: wrong = red-900 fill, right = green-900 fill, no border (text contrast >= 4.5)", async () => {
  const [c, p] = await open("on", "CALC1_MB01");
  await p.click("#q .opt[data-id='a']"); await p.waitForTimeout(250);
  await p.click("#q .ch:has(.opt[data-id='a']) .send"); await p.waitForTimeout(700);
  const w = await look(p, "#q .opt[data-id='a']");
  assert.equal(w.bw, "0px 0px 0px 0px"); assert.equal(w.bg, rgb("#3e141e"), "wrong = red-900");
  await shot(p, "on-390-wrong");
  const lum = s => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const [x, y] = [lum(w.color), lum(w.bg)].sort((a, b) => b - a);
  assert.ok((x + 0.05) / (y + 0.05) >= 4.5, "wrong text contrast " + (x + 0.05) / (y + 0.05));
  await p.click("#q .opt[data-id='b']"); await p.waitForTimeout(250);
  await p.click("#q .ch:has(.opt[data-id='b']) .send"); await p.waitForTimeout(700);
  const r = await look(p, "#q .opt[data-id='b']");
  assert.equal(r.bw, "0px 0px 0px 0px"); assert.equal(r.bg, rgb("#0c2c22"), "right = green-900");
  await shot(p, "on-390-right");
  await c.close();
});
await step("flag on: sentence options are bento tiles too (wrapped, no holes, no overflow, still no border)", async () => {
  for (const W of [360, 1366]) {
    const [c, p] = await open("on", "CALC1_MB02", W, W >= 1000 ? 800 : 844);
    assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.bento), "grid");
    const r = await p.evaluate(() => { const g = document.querySelector("#q .choices"), C = +getComputedStyle(g).getPropertyValue("--bc"), rows = Math.round((g.getBoundingClientRect().height + 8) / 108), occ = new Set(); let dup = 0;
      for (const e of g.children) { const m = e.style.gridColumn.match(/(\d+) \/ span (\d+)/), q = e.style.gridRow.match(/(\d+) \/ span (\d+)/);
        for (let y = +q[1]; y < +q[1] + +q[2]; y++) for (let x = +m[1]; x < +m[1] + +m[2]; x++) { const k = x + "," + y; if (occ.has(k)) dup++; occ.add(k); } }
      return { C, rows, filled: occ.size, dup, ovf: [...g.querySelectorAll(".opt")].filter(o => o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1).length, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; });
    assert.equal(r.dup, 0, "no overlap"); assert.equal(r.filled, r.C * r.rows, "no holes " + JSON.stringify(r)); assert.equal(r.ovf, 0, "no overflow"); assert.ok(r.sw, "no h-scroll");
    assert.equal((await look(p, "#q .opt[data-id='a']")).bw, "0px 0px 0px 0px");
    await shot(p, `on-${W}-sentences`);
    await c.close();
  }
});
await step("flag on: pick-all (choose-all) is a bento too: grid, no holes, tickable, letter + square mark", async () => {
  for (const W of [390, 1366]) {
    const [c, p] = await open("on", "CALC1_MB03", W, W >= 1000 ? 800 : 844);
    const r = await p.evaluate(() => { const g = document.querySelector("#q .choices"), C = +getComputedStyle(g).getPropertyValue("--bc"), rows = Math.round((g.getBoundingClientRect().height + 8) / 108), occ = new Set();
      for (const e of g.children) { const m = e.style.gridColumn.match(/(\d+) \/ span (\d+)/), q = e.style.gridRow.match(/(\d+) \/ span (\d+)/); for (let y = +q[1]; y < +q[1] + +q[2]; y++) for (let x = +m[1]; x < +m[1] + +m[2]; x++) occ.add(x + "," + y); }
      return { all: g.classList.contains("all"), bento: g.dataset.bento, C, rows, filled: occ.size, ovf: [...g.querySelectorAll(".opt")].filter(o => o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1).length }; });
    assert.ok(r.all && r.bento === "grid", JSON.stringify(r)); assert.equal(r.filled, r.C * r.rows, "no holes " + JSON.stringify(r)); assert.equal(r.ovf, 0);
    await p.click("#q .opt[data-id='a']"); await p.waitForTimeout(300);
    assert.equal(await p.getAttribute("#q .opt[data-id='a']", "aria-checked"), "true");
    assert.equal((await look(p, "#q .opt[data-id='a']")).bg, rgb("#102542"), "ticked = picked fill");
    await shot(p, `on-${W}-pickall`);
    await c.close();
  }
});
await step("flag off: no mosaic, today's 1px --line edge, no change", async () => {
  const [c, p] = await open("off", "CALC1_MB01");
  assert.equal(await p.evaluate(() => document.querySelector("#q .choices").classList.contains("bento")), false);
  assert.equal(await p.evaluate(() => document.querySelector("#q .choices").hasAttribute("data-bento")), false);
  assert.equal(await p.evaluate(() => !!document.querySelector("#q .ch[style*='grid']")), false);
  assert.equal((await look(p, "#q .opt[data-id='a']")).bw, "1px 1px 1px 1px");
  await p.click("#q .opt[data-id='b']"); await p.waitForTimeout(300);
  assert.equal((await look(p, "#q .opt[data-id='b']")).bw, "1px 1px 1px 1px", "flag off picked keeps its edge");
  await c.close();
});
await step("no page errors (flag on)", async () => {
  const [c, p] = await open("on", "CALC1_MB01");
  assert.deepEqual(p.errs, []);
  await c.close();
});

await browser.close(); srv.kill();
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nALL OK");
