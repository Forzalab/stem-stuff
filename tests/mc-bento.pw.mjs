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
const mc = (code, choices, correct = "b", choice_style) => ({ code, type: "mc", shuffle: false, ...(choice_style ? { choice_style } : {}), body: [{ type: "text", md: "Solve for $x$: $x+2=11$" }], choices,
  correct, wrong: [{ choice: "a", hint: "QUACK. Not a." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(1) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_MB1.json"), JSON.stringify({ v: 1, problems: [
  mc("CALC1_MB01", ch("$13$", "$9$", "$\\dfrac{11}{2}$", "$-9$", "$22$"), "b", "math"),                                                   // the bank-sets CALC1_X2P shape: a fraction opens a mosaic
  { ...mc("CALC1_MB03", ch("$13$", "A fairly long answer that wraps over a couple of lines", "$\\dfrac{11}{2}$", "$-9$", "$22$"), ["a", "c"]), pick: "all", miss: "QUACK. miss",
    wrong: ["b", "d", "e"].map(c => ({ choice: c, error: "misread", hint: "QUACK. Not " + c })) },   // pick-all: bento too
  mc("CALC1_MB02", ch("It grows without bound as x increases to infinity, then levels off", "It stays constant on the whole interval", "It decreases and then levels off after a long time", "It oscillates forever around zero", "None of these statements is true")),   // sentences: list fallback
  mc("CALC1_MB04", ch("$1.11\\ \\text{N·m}$", "$-4.47\\ \\text{N·m}$", "$8.07\\ \\text{N·m}$", "$4.47\\ \\text{N·m}$", "$-5.37\\ \\text{N·m}$"), "b", "math"),   // real torque answers: \text{N·m} used to print a red \cdotp
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
  const key = await p.evaluate(() => { const k = document.querySelector("#q .chk #mcGo"), c = getComputedStyle(k), g = k.querySelector(".ib1-go"), r = k.getBoundingClientRect();
    return { bg: c.backgroundColor, w: r.width, h: r.height, arrow: !!g && getComputedStyle(g).display !== "none" && g.getBoundingClientRect().width === 24, sprite: getComputedStyle(k.querySelector(".ico")).display, rad: parseFloat(c.borderTopLeftRadius), inChk: !!k.closest(".chk"), tile: !!document.querySelector("#q .ch .send"), shadow: c.boxShadow }; });
  const lt = await p.evaluate(() => { const b = document.querySelector("#q .ch:has(.opt[data-id='b']) .badge"), c = getComputedStyle(b), r = getComputedStyle(document.documentElement); return { z: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16, fs: c.fontSize, fw: c.fontWeight, tt: c.textTransform, root: r.getPropertyValue("--ans-letter-fs").trim() }; });
  assert.ok(Math.abs(parseFloat(lt.fs) - 20 * lt.z) <= .5 && lt.fw === "600" && lt.tt === "uppercase", "answer letter on the MC tile: the shared 20px (the choice text step, MCX-2), 600, uppercase: " + JSON.stringify(lt));
  assert.equal(key.bg, rgb("#283352"), "SHIPPED KEY: the MC key wears the typed key's --chip face: " + JSON.stringify(key));
  assert.ok(key.w === 60 && key.h === 60 && key.arrow && key.sprite === "none" && key.shadow === "none", "SHIPPED KEY: the 60px .chk key, the 24-grid arrow, no shadow: " + JSON.stringify(key));
  assert.ok(key.inChk && !key.tile, "SHIPPED KEY: MC key moved OUT of the tile into .chk: " + JSON.stringify(key));
  const kr = await p.evaluate(() => CSS.supports("corner-shape", "superellipse(2)") ? 25 : 20);   // family A (Nov 28): --key-r-out = --r-card = 20 x --r-k (1.25 under the superellipse)
  assert.ok(Math.abs(key.rad - kr) <= 1, "SHIPPED KEY: the --r-card squircle radius (" + kr + "): " + JSON.stringify(key));
  await p.click("#mcGo");
  await bgIs(p, "#q .opt[data-id='a']", rgb("#3e141e"));
  const w = await look(p, "#q .opt[data-id='a']");
  assert.equal(w.bw, "0px 0px 0px 0px"); assert.equal(w.bg, rgb("#3e141e"), "wrong = red-900");
  await shot(p, "on-390-wrong");
  const lum = s => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const [x, y] = [lum(w.color), lum(w.bg)].sort((a, b) => b - a);
  assert.ok((x + 0.05) / (y + 0.05) >= 4.5, "wrong text contrast " + (x + 0.05) / (y + 0.05));
  const lcr = (a, b) => { const [m, n] = [lum(a), lum(b)].sort((u, v) => v - u); return (m + 0.05) / (n + 0.05); };
  const wl = await p.evaluate(() => getComputedStyle(document.querySelector("#q .opt[data-id='a'] .badge")).color);
  console.log("      wrong letter " + wl + " on " + w.bg + " = " + lcr(wl, w.bg).toFixed(2) + ":1");
  assert.ok(lcr(wl, w.bg) >= 4.5, "MCX-3: the letter on the red-900 fill keeps >= 4.5:1, not the dim --ink-letter: " + wl + " on " + w.bg);
  await p.click("#q .opt[data-id='b']");
  await p.waitForFunction(() => document.querySelector("#q .opt[data-id='b']")?.getAttribute("aria-checked") === "true", null, { timeout: 5000 });
  await p.waitForFunction(() => !document.querySelector("#mcGo").disabled);
  await p.click("#mcGo");
  await bgIs(p, "#q .opt[data-id='b']", rgb("#0c2c22"));
  const r = await look(p, "#q .opt[data-id='b']");
  assert.equal(r.bw, "0px 0px 0px 0px"); assert.equal(r.bg, rgb("#0c2c22"), "right = green-900");
  const rl = await p.evaluate(() => getComputedStyle(document.querySelector("#q .opt[data-id='b'] .badge")).color);
  console.log("      right letter " + rl + " on " + r.bg + " = " + lcr(rl, r.bg).toFixed(2) + ":1");
  assert.ok(lcr(rl, r.bg) >= 4.5, "MCX-3: the letter on the green-900 fill keeps >= 4.5:1: " + rl + " on " + r.bg);
  await shot(p, "on-390-right");
  await c.close();
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
/* FLOW (question #737): answers flow down, one column count per set (1, or 2 / 3 only when every option measures one line at 16px), equal widths, natural heights, never clipped */
const flowMeasure = p => p.evaluate(() => {
  const g = document.querySelector("#q .choices"), os = [...g.querySelectorAll(".opt")], rs = os.map(o => o.getBoundingClientRect()), body = document.querySelector("#problem .blocks");
  const gr = g.getBoundingClientRect(), tops = {}; rs.forEach(r => (tops[Math.round(r.top)] ||= []).push(r));
  const rowList = Object.values(tops), text = g.dataset.cs !== "math" && !g.classList.contains("all"), c0 = Math.max(...rowList.map(a => a.length)), mid = (gr.left + gr.right) / 2;
  const edge = a => Math.abs(a[0].left - gr.left) < 1.5 && Math.abs(a[a.length - 1].right - gr.right) < 1.5;
  // math / pick-all: every row has equal widths and runs edge to edge (no hole). MCX-2 text look: ALL tiles one width and one height; a full row runs edge to edge, a short last row is CENTRED (|its middle - the grid's middle| < 1.5)
  const rowsOk = text ? new Set(rs.map(r => Math.round(r.width))).size === 1 && new Set(rs.map(r => Math.round(r.height))).size === 1 && rowList.every(a => a.length === c0 ? edge(a) : Math.abs((a[0].left + a[a.length - 1].right) / 2 - mid) < 1.5)
    : rowList.every(a => new Set(a.map(r => Math.round(r.width))).size === 1 && edge(a));
  return { z: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16, rowsOk, sizes: rowList.map(a => a.length), cols: Math.max(...rowList.map(a => a.length)), mode: g.dataset.bento, fill: g.dataset.fill || "", ws: [...new Set(rs.map(r => Math.round(r.width)))], xs: [...new Set(rs.map(r => Math.round(r.left)))].length,
    fs: [...new Set(os.map(o => getComputedStyle(o.querySelector(".txt")).fontSize))], bodyFs: body ? getComputedStyle(body).fontSize : "16px", sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    clip: os.filter(o => { const t = o.querySelector(".txt"), tr = t.getBoundingClientRect(), b = o.getBoundingClientRect(); return tr.bottom > b.bottom - 2 || tr.top < b.top || o.scrollHeight > o.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1; }).length,
    inorder: rs.every((r, i) => !i || r.top > rs[i - 1].top - 2), small: rs.filter(r => r.width < 44 || r.height < 44).length };
});
for (const [W, H] of [[390, 844], [360, 740], [768, 844], [1366, 800]]) for (const code of ["CALC1_MB01", "CALC1_MB02", "CALC1_MB03", "CALC1_MB04"]) {
  await step(`flow @${W} ${code}: equal widths, one column count, 20px text (SWISS-RATIO), no clipping, no h-scroll (text look: equal tiles, a short last row centred)`, async () => {
    const [c, p] = await open("on", code, W, H), m = await flowMeasure(p);
    assert.equal(m.mode, "flow"); assert.equal(m.fill, "");
    assert.ok(m.rowsOk, "every row: equal widths, edge to edge, no hole: " + JSON.stringify(m)); assert.ok(m.cols >= 1 && m.cols <= 3);
    assert.ok(m.sizes.every((k, i) => i === 0 || k <= m.sizes[i - 1]), "larger rows first: " + JSON.stringify(m)); assert.ok(m.fs.length === 1 && Math.abs(parseFloat(m.fs[0]) - 20 * m.z) <= .5, "SWISS-RATIO: choice text = type step 1 (20px), one step above the body (" + m.bodyFs + "): " + JSON.stringify(m));
    assert.equal(m.clip, 0, "nothing clipped: " + JSON.stringify(m)); assert.ok(m.sw, "no h-scroll"); assert.equal(m.small, 0, "tap >= 44");
    if (code === "CALC1_MB02") assert.equal(m.cols, W <= 768 ? 1 : m.cols, "MCX-2 TEXT: 1 column where a choice would wrap to 3+ lines in a 2-column tile (phone / tablet), a 2-column grid when they fit (desktop)");
    await shot(p, `flow-${W}-${code}`);
    await c.close();
  });
}
await step("shared answer letter (MCX-2): MC (text look) + pick-all = the choice text size (--fs-1, 20/28), 600, uppercase, dimmer --ink-letter #64729a; the MC letter 1rem inside its tile", async () => {
  for (const [W, H] of [[390, 844], [1280, 800]]) for (const code of ["CALC1_MB02", "CALC1_MB03"]) {
    const [c, p] = await open("on", code, W, H);
    const m = await p.evaluate(() => {
      const card = document.querySelector("#problem"), cs = getComputedStyle(card), cr = card.getBoundingClientRect();
      const g = document.querySelector("#q .choices"), all = g.classList.contains("all"), o = g.querySelector(".opt"), l = o.querySelector(all ? ".lt" : ".badge");
      const ls = getComputedStyle(l), lr = l.getBoundingClientRect(), root = getComputedStyle(document.documentElement);
      return { z: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16, all, gx: g.getBoundingClientRect().x, x: lr.x, w: lr.width, fs: ls.fontSize, fw: ls.fontWeight, tt: ls.textTransform, color: ls.color, edge: cr.x + parseFloat(cs.paddingLeft), mcpl: parseFloat(getComputedStyle(g).getPropertyValue("--mc-pl")),
        root: { fs: root.getPropertyValue("--ans-letter-fs").trim(), lh: root.getPropertyValue("--ans-letter-lh").trim(), fw: root.getPropertyValue("--ans-letter-fw").trim(), tt: root.getPropertyValue("--ans-letter-tt").trim(), color: root.getPropertyValue("--ans-letter-color").trim() } };
    });
    assert.ok(m.root.fs === "1.25rem" && /^(28px|1\.75rem)$/.test(m.root.lh) && m.root.fw === "600" && m.root.tt === "uppercase" && m.root.color === "#64729a", "ONE answer-letter definition in app.css: " + JSON.stringify(m.root));
    assert.ok(Math.abs(parseFloat(m.fs) - 20 * m.z) <= .5, `shared letter size (MCX-2: the choice text step, MC and pick-all 20) @${W} ${code}: ${m.fs}`);
    assert.equal(m.fw, "600", `shared letter weight @${W} ${code}: ${m.fw}`);
    assert.equal(m.tt, "uppercase", `shared letter transform @${W} ${code}: ${m.tt}`);
    assert.equal(m.color, "rgb(100, 114, 154)", `shared letter colour @${W} ${code}: ${m.color} (--ink-letter, dimmer than --ink-qnum)`);
    if (!m.all) assert.ok(Math.abs(m.x - (m.gx + 16 * m.z)) <= 1, `MC letter sits 1rem inside its tile @${W} ${code}: ${m.x} vs grid ${m.gx} + ${16 * m.z}`);
    else assert.equal(m.mcpl, W === 390 ? 20 : 32, `pick-all --mc-pl @${W}: ${m.mcpl}`);
    await c.close();
  }
});
await step("flow: 5 short math choices -> 3+2 at 1366 (wide) and at 390 (MCX-1: no letter column), never a hole; 2..7 fill every row", async () => {
  const exp = { 1366: { CALC1_MB01: [3, 2] }, 390: { CALC1_MB01: [3, 2] } };   // MCX-1 math look: 20 + 20 side padding (no letter column, no key reserve), so 3 columns fit at 390
  for (const W of [390, 1366]) { const [c, p] = await open("on", "CALC1_MB01", W, 844), m = await flowMeasure(p); assert.deepEqual(m.sizes, exp[W].CALC1_MB01, W + " " + JSON.stringify(m)); assert.ok(m.rowsOk, "no hole"); await c.close(); }
});
await step("flow: short answers share columns (2+), sentences stack to 1; a picked tile keeps its text clear of the Check arrow", async () => {
  const [c1, p1] = await open("on", "CALC1_MB01", 390, 844); assert.ok((await flowMeasure(p1)).cols >= 2, "short tokens flow in 2+ equal columns"); await c1.close();
  const [c, p] = await open("on", "CALC1_MB02", 360, 740);
  assert.equal((await flowMeasure(p)).cols, 1);
  await p.click("#q .opt[data-id='c']");
  await p.waitForFunction(() => { const k = document.querySelector("#q .chk #mcGo"); return k && !k.hidden && !k.disabled; }, null, { timeout: 5000 });
  assert.equal(await p.getAttribute("#q .opt[data-id='c']", "aria-checked"), "true");
  const below = await p.evaluate(() => { const g = document.querySelector("#q .choices").getBoundingClientRect(), k = document.querySelector("#q .chk #mcGo").getBoundingClientRect(); return k.top >= g.bottom - 1; });
  assert.ok(below, "SHIPPED KEY: the MC key sits in the .chk row under the choices, not in the tile");
  assert.equal((await flowMeasure(p)).clip, 0, "no clipping with the key shown");
  await c.close();
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
