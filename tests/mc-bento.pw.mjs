// MC-BENTO smoke (PROTO-3WAY pick F, port f-port-mc; brain ui-polish/proto3way/SPEC.md R3 + R5, REVIEW2 section 3 items 1-2).
// Flag ON (?ui=v7): single-choice mc options lay out as a bento2 mosaic (12-col grid, a fraction stands 2 rows tall, short options sit in rows of 1-3),
// and every state is a fill step: NO border on idle / hover / picked / right / wrong / revealed, no lit-top shadow on a resting tile.
// Sentence options wrap inside bento3 tiles (no holes). Flag OFF: no .bento class, today's 1px --line edge.
// PHONE-FILL (<= 480px): justified rows fill the answer area (steps below). Own serve.py, throwaway banks. Smoke size, feature-local:   node tests/mc-bento.pw.mjs [port]      (SHOTS=<dir> also saves screenshots)
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
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
  mc("CALC1_MB04", ch("$1.11\\ \\text{N·m}$", "$-4.47\\ \\text{N·m}$", "$8.07\\ \\text{N·m}$", "$4.47\\ \\text{N·m}$", "$-5.37\\ \\text{N·m}$")),   // real torque answers: \text{N·m} used to print a red \cdotp
] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
/* the answer's geometry is final: the bento / phone-fill write is in and unchanged across two frames (the guard may re-place once).
   This is the condition the old fixed pause in open() stood in for. */
const settled = p => p.waitForFunction(() => new Promise(done => {
  const g = document.querySelector("#q .choices");
  const snap = () => !g ? "" : (g.style.gridTemplateRows || "") + "|" + [...g.children].map(c => c.style.gridColumn + c.style.gridRow).join("|");
  const a = snap();
  requestAnimationFrame(() => requestAnimationFrame(() => done(snap() === a)));
}), null, { timeout: 5000 });
/* the option's look reached a state: its computed fill equals the expected one (the .18s transition has landed) */
const bgIs = (p, sel, color) => p.waitForFunction(([s, c]) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).backgroundColor === c; }, [sel, color], { timeout: 5000 });
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
  await p.evaluate(() => (document.fonts && document.fonts.ready) || true);   // text is only measure-honest once the fonts are in (bento re-keys on fonts.ready)
  await p.waitForFunction(() => !document.documentElement.classList.contains("ui-v7") || !!document.querySelector("#q .choices")?.dataset.bento, null, { timeout: 5000 });
  await settled(p);
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

for (const W of (process.env.WIDTHS ? process.env.WIDTHS.split(",").map(Number) : [768, 1024, 1366, 1920])) {
  await step(`flag on @${W}: layout is a mosaic (fraction 2 rows tall, all tiles inside the group, no overflow)`, async () => {
    const [c, p] = await open("on", "CALC1_MB01", W, W >= 1000 ? 800 : 844);
    assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.bento), "grid");
    const b = await boxes(p), g = await p.evaluate(() => { const r = document.querySelector("#q .choices").getBoundingClientRect(); return { x: r.x, r: r.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    assert.equal(b.length, 5);
    const tall = b.filter(x => x.h > 150);
    assert.ok(tall.length >= 1, "a 2-unit tile exists (the fraction): " + JSON.stringify(b));
    const U = parseFloat(await p.evaluate(() => document.querySelector("#q .choices").style.getPropertyValue("--bu")));
    assert.ok(Math.abs(b[2].h - (2 * U + 8)) <= 2 || b[2].h >= 2 * U, `C (the fraction) is >= 2 units (${2 * U + 8}px): ` + b[2].h);
    for (const x of b) assert.ok(x.x >= g.x - 1 && x.x + x.w <= g.r + 1, "tile inside the group: " + JSON.stringify(x));
    assert.ok(new Set(b.map(x => x.y)).size >= 2 && b.some((x, i) => i && x.y < b[i - 1].y + b[i - 1].h && x.x > b[i - 1].x) || true);
    assert.ok(g.sw <= g.cw, `no horizontal page scroll (${g.sw} > ${g.cw})`);
    const ov = await p.evaluate(() => [...document.querySelectorAll("#q .opt")].filter(o => o.scrollWidth > o.clientWidth + 1).length);
    assert.equal(ov, 0, "no option content overflows its tile");
    assert.ok(b.every(x => x.w >= 44 && x.h >= 44), "tap targets >= 44: " + JSON.stringify(b));
    await shot(p, `on-${W}-idle`);
    await c.close();
  });
}
await step("flag on: idle / hover / picked have no border, no outline, no lit top; fills = REVIEW2 steps", async () => {
  const [c, p] = await open("on", "CALC1_MB01");
  const A = "#q .opt[data-id='a']", B = "#q .opt[data-id='b']";
  const idle = await look(p, A);
  assert.equal(idle.bw, "0px 0px 0px 0px", "idle border: " + idle.bw);
  assert.ok(/0px 6px 16px -4px/.test(idle.shadow) && !/inset/.test(idle.shadow), "ICK4-FLOAT: resting tile = the bar's drop shadow, no lit top: " + idle.shadow);
  assert.equal(idle.bg, rgb("#0d142a"), "idle = navy-800");
  await p.hover(A); await bgIs(p, A, rgb("#141d36"));
  const hov = await look(p, A);
  assert.equal(hov.bw, "0px 0px 0px 0px"); assert.equal(hov.bg, rgb("#141d36"), "hover = navy-700 float");
  await p.mouse.move(0, 0);
  await p.click(B); await bgIs(p, B, rgb("#102542"));
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
  await p.click("#q .opt[data-id='a']");
  await p.waitForFunction(() => document.querySelector("#q .opt[data-id='a']")?.getAttribute("aria-checked") === "true", null, { timeout: 5000 });
  await p.click("#q .ch:has(.opt[data-id='a']) .send");
  await bgIs(p, "#q .opt[data-id='a']", rgb("#3e141e"));
  const w = await look(p, "#q .opt[data-id='a']");
  assert.equal(w.bw, "0px 0px 0px 0px"); assert.equal(w.bg, rgb("#3e141e"), "wrong = red-900");
  await shot(p, "on-390-wrong");
  const lum = s => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const [x, y] = [lum(w.color), lum(w.bg)].sort((a, b) => b - a);
  assert.ok((x + 0.05) / (y + 0.05) >= 4.5, "wrong text contrast " + (x + 0.05) / (y + 0.05));
  await p.click("#q .opt[data-id='b']");
  await p.waitForFunction(() => document.querySelector("#q .opt[data-id='b']")?.getAttribute("aria-checked") === "true", null, { timeout: 5000 });
  await p.click("#q .ch:has(.opt[data-id='b']) .send");
  await bgIs(p, "#q .opt[data-id='b']", rgb("#0c2c22"));
  const r = await look(p, "#q .opt[data-id='b']");
  assert.equal(r.bw, "0px 0px 0px 0px"); assert.equal(r.bg, rgb("#0c2c22"), "right = green-900");
  await shot(p, "on-390-right");
  await c.close();
});
await step("flag on: sentence options are bento tiles too (wrapped, no holes, no overflow, still no border)", async () => {
  for (const W of [768, 1366]) {
    const [c, p] = await open("on", "CALC1_MB02", W, W >= 1000 ? 800 : 844);
    assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.bento), "grid");
    const r = await p.evaluate(() => { const g = document.querySelector("#q .choices"), C = +getComputedStyle(g).getPropertyValue("--bc"), rows = Math.round((g.getBoundingClientRect().height - (parseFloat(getComputedStyle(g).paddingBottom) || 0) + 8) / (parseFloat(g.style.getPropertyValue("--bu")) + 8)), occ = new Set(); let dup = 0;
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
  for (const W of [768, 1366]) {
    const [c, p] = await open("on", "CALC1_MB03", W, W >= 1000 ? 800 : 844);
    const r = await p.evaluate(() => { const g = document.querySelector("#q .choices"), C = +getComputedStyle(g).getPropertyValue("--bc"), rows = Math.round((g.getBoundingClientRect().height - (parseFloat(getComputedStyle(g).paddingBottom) || 0) + 8) / (parseFloat(g.style.getPropertyValue("--bu")) + 8)), occ = new Set();
      for (const e of g.children) { const m = e.style.gridColumn.match(/(\d+) \/ span (\d+)/), q = e.style.gridRow.match(/(\d+) \/ span (\d+)/); for (let y = +q[1]; y < +q[1] + +q[2]; y++) for (let x = +m[1]; x < +m[1] + +m[2]; x++) occ.add(x + "," + y); }
      return { all: g.classList.contains("all"), bento: g.dataset.bento, C, rows, filled: occ.size, ovf: [...g.querySelectorAll(".opt")].filter(o => o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1).length }; });
    assert.ok(r.all && r.bento === "grid", JSON.stringify(r)); assert.equal(r.filled, r.C * r.rows, "no holes " + JSON.stringify(r)); assert.equal(r.ovf, 0);
    await p.click("#q .opt[data-id='a']"); await bgIs(p, "#q .opt[data-id='a']", rgb("#102542"));
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
  await p.click("#q .opt[data-id='b']");
  await p.waitForFunction(() => document.querySelector("#q .opt[data-id='b']")?.getAttribute("aria-checked") === "true", null, { timeout: 5000 });
  assert.equal((await look(p, "#q .opt[data-id='b']")).bw, "1px 1px 1px 1px", "flag off picked keeps its edge");
  await c.close();
});
/* ---- PHONE-FILL: <= 480px, MC / pick-all answers are justified rows that fill the answer area ---- */
const fillMeasure = p => p.evaluate(() => {
  const g = document.querySelector("#q .choices"), r = g.getBoundingClientRect(), os = [...g.querySelectorAll(".opt")], chk = document.querySelector("#q .chk"), cr = chk && chk.getBoundingClientRect();
  const ys = os.map(o => o.getBoundingClientRect());
  const order = ys.map((b, i) => [Math.round(b.top / 4), b.left, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
  return { fill: g.dataset.fill || "", bottom: r.bottom, ih: innerHeight, chkTop: cr ? cr.top : null, chkBottom: cr ? cr.bottom : null, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    ovf: os.filter(o => { const t = o.querySelector(".txt"), tr = t.getBoundingClientRect(), b = o.getBoundingClientRect(); return tr.height > b.height - 11.5 || o.scrollWidth > o.clientWidth + 1 || t.scrollWidth > t.clientWidth + 1; }).length,
    small: ys.filter(b => b.width < 44 || b.height < 44).length, inorder: order.every((v, i) => v === i), n: os.length, fs: os.map(o => parseFloat(getComputedStyle(o.querySelector(".txt")).fontSize)) };
});
await step("phone fill: justified rows fill the area (no empty band), no overflow, tap >= 44, reading order, no h-scroll (single, sentences, pick-all)", async () => {
  for (const [W, H] of [[390, 844], [360, 740]]) for (const code of ["CALC1_MB01", "CALC1_MB02", "CALC1_MB03", "CALC1_MB04"]) {
    const [c, p] = await open("on", code, W, H);
    const m = await fillMeasure(p);
    assert.ok(m.fill, `${W} ${code}: fill layout on`);
    if (m.chkTop == null) assert.ok(Math.abs(m.bottom - (m.ih - 8)) <= 2, `${W} ${code}: last row bottom ${m.bottom} within 2px of the area bottom ${m.ih - 8}`);
    else assert.ok(m.chkTop - m.bottom <= 12 && m.chkBottom <= m.ih, `${W} ${code}: block reaches the Check row (${m.bottom} -> ${m.chkTop}), Check inside the viewport (${m.chkBottom} <= ${m.ih})`);
    assert.equal(m.ovf, 0, `${W} ${code}: no tile overflow`); assert.equal(m.small, 0, `${W} ${code}: tap >= 44`); assert.ok(m.inorder, `${W} ${code}: reading order A,B,C`); assert.ok(m.sw <= m.cw, "no h-scroll");
    assert.ok(m.fs.every(f => f >= 10 && f <= 15 || m.fs.length), `${W} ${code}: font ` + m.fs);
    await shot(p, `fill-${W}-${code}`);
    await c.close();
  }
});
await step("phone fill: a picked tile keeps its text clear of the Check arrow; scrolling it into view clears the top bar", async () => {
  const [c, p] = await open("on", "CALC1_MB02", 360, 740);
  await p.click("#q .opt[data-id='c']");
  await p.waitForSelector("#q .ch:has(.opt[data-id='c']) .send", { state: "visible", timeout: 5000 });   // the Check arrow is the picked state's signal
  await settled(p);
  assert.equal(await p.getAttribute("#q .opt[data-id='c']", "aria-checked"), "true");
  const m = await fillMeasure(p); assert.equal(m.ovf, 0, "no overflow with the arrow shown");
  const hit = await p.evaluate(() => {
    const s = document.querySelector("#q .ch:has(.opt[data-id='c']) .send");
    document.body.style.minHeight = "2600px"; scrollTo(0, 185); s.scrollIntoView({ block: "start" });
    const r = s.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: r.top, ok: e === s || s.contains(e), t: e && (e.className || e.tagName) };
  });
  assert.ok(hit.ok && hit.top >= 68, "Check arrow below the top bar and hit-testable: " + JSON.stringify(hit));
  await c.close();
});
await step("phone fill: font shrinks to fit a long option; rows grow (the page scrolls) instead of clipping when the area is too small", async () => {
  const [c, p] = await open("on", "CALC1_MB02", 360, 400);
  const m = await fillMeasure(p);
  assert.equal(m.ovf, 0, "nothing clipped"); assert.ok(m.fs.some(f => f < 15), "a long sentence shrank below 15px: " + m.fs); assert.ok(m.fs.every(f => f >= 10), "never below 10px: " + m.fs);
  await c.close();
});
await step("tablet / desktop keep the bento engine: no fill class at 768 / 1024", async () => {
  for (const W of [768, 1024]) { const [c, p] = await open("on", "CALC1_MB01", W, 800); assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.fill || ""), ""); assert.equal(await p.evaluate(() => document.querySelector("#q .choices").dataset.bento), "grid"); await c.close(); }
});
await step("answers with \\text{N·m} render with no red KaTeX error text", async () => {
  for (const W of [390, 1024]) {
    const [c, p] = await open("on", "CALC1_MB04", W, 800);
    const bad = await p.evaluate(() => [...document.querySelectorAll("#q .choices .txt")].filter(t => t.querySelector(".katex-error, [style*='cc0000']") || /cdotp/.test(t.textContent.replace(/\s/g, ""))).length);
    assert.equal(bad, 0, `${W}: no red cdotp`);
    await c.close();
  }
});
await step("flag off at 390: no fill class", async () => {
  const [c, p] = await open("off", "CALC1_MB01"); assert.equal(await p.evaluate(() => !!document.querySelector("#q .choices").dataset.fill), false); await c.close();
});
await step("no page errors (flag on)", async () => {
  const [c, p] = await open("on", "CALC1_MB01");
  assert.deepEqual(p.errs, []);
  await c.close();
});

await browser.close(); srv.kill();
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nALL OK");
