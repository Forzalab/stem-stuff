// The welcome Q1 in the real app (todo 119; DESIGN-v3 §2, TONY-DECISIONS #5): a fresh device on a bank with a `welcome: true` item
// opens on it first, drawn by welcome.js (repair.js's welcome variant) in place of the answer box, its ladder from GET /repair/<code>
// (served for the welcome item before any try; the answer step still keyless, graded by POST /repair/<code>/check). The sheet step's
// chips show the formulas, not their ids. Finishing it fires welcome_done once and its Next goes on to the normal queue. Once per
// device and bank: a reload, the item opened again, a returner (stem-noob-<bank>) never see it again; a bank without a welcome item is
// unchanged. A fixture bank stands in for BANK_P3X (BQ3's shape: pick, sheet + why, fill + why, keyless num answer). Own serve.py:
//   node tests/welcome-app.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8879), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "welcome-app-")), BANKS = join(TMP, "banks");
const WLC = "PHYS_WQ1";
const num = (code, n, tier) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier } });
const welcome = {
  code: WLC, type: "num", answer: "4", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ spread over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [
    { id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
    { id: "sheet", label: "Which formula line?", kind: "sheet", pool: ["PRESSURE", "DENSITY"], ok: "PRESSURE",
      why: { q: "Why this line?", opts: ["pressure is mass per volume", "pressure is force per area"], ok: 1 } },   // not asked (no fam)
    { id: "split", label: "Force over area", kind: "fill", tex: "P=8\\,▢\\,2", opts: ["÷", "×"], ok: "÷", fam: "op",
      why: { q: "Why divide?", opts: ["the force spreads over the area", "bigger numbers go first"], ok: 0 } },
    { id: "answer", label: "Final answer", kind: "num" }
  ] }
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P2X.json"), JSON.stringify({ v: 1, problems: [num("PHYS_WA1", 1, 1), welcome, num("PHYS_WA2", 2, 1), num("PHYS_WB1", 3, 2)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [1, 2].map(n => num(`CALC1_W0${n}`, n, 1)) }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [
  { id: "PRESSURE", tex: "P=\\frac{F}{A}" }, { id: "DENSITY", tex: "\\rho=\\frac{m}{V}" }] }] }));

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P2X", STEM_FRONT_TITLE: "Exam 2",
  STEM_TODAY: process.env.STEM_TODAY || "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const code = page => page.evaluate(() => document.querySelector("#freeze")?.hidden ? "" : document.querySelector("#pcode")?.textContent || "");
const anyOpen = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
const opened = (page, c) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, c, { timeout: 8000 });
/* a normal item: the answer box is up and no welcome surface anywhere */
async function plain(page) {
  await page.waitForSelector("#q #ans, #q .choices", { timeout: 4000 });
  assert.equal(await page.$("#q .wl"), null, "a welcome surface on a normal item");
}
const act = (page, sel) => page.click(`#q .rp-step[data-state="active"] ${sel}`);
/* a token's colour as computed (rgb(..)); fcardBg = the Key formulas card's surface (app.css .fcard), read off a throwaway card */
const tok = (page, name) => page.evaluate(n => {
  const t = document.createElement("i"); t.style.color = `var(${n})`; document.body.append(t); const c = getComputedStyle(t).color; t.remove(); return c;
}, name);
const fcardBg = page => page.evaluate(() => {
  const t = document.createElement("div"); t.className = "fcard"; document.body.append(t); const c = getComputedStyle(t).backgroundColor; t.remove(); return c;
});
const face = (page, sel) => page.$eval(sel, el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, line: cs.borderTopColor, ink: cs.color }; });
/* the welcome's commit buttons (Check, Next) sit on the warm sheet in the warm family, never the blue --action face (Tony, vet w-1) */
async function warmFace(page, sel) {
  const [f, help, ink, action, raised] = [await face(page, sel), await tok(page, "--help"), await tok(page, "--help-ink"), await tok(page, "--action"), await tok(page, "--raised")];
  assert.notEqual(f.bg, action, `${sel}: the blue --action face`);
  assert.notEqual(f.bg, raised, `${sel}: the navy --raised face`);
  assert.deepEqual([f.bg, f.line, f.ink], [help, help, ink], `${sel}: not the warm face`);
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function fresh(init = {}, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(init => { try {
    localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    if (!sessionStorage.getItem("wl-init")) { sessionStorage.setItem("wl-init", "1"); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); }
  } catch { /* blocked */ } }, init);
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(e.message));
  return { ctx, page, errs };
}
try {
  const { ctx, page, errs } = await fresh();
  await step("fresh '/': the bank's welcome item opens first, drawn by welcome.js in place of the answer box (warm, every step shown)", async () => {
    await page.goto(BASE + "/"); await anyOpen(page);
    assert.equal(await code(page), WLC, "not the welcome item first");
    await page.waitForSelector("#q .wl .rp-step", { timeout: 4000 });
    assert.equal(await page.$("#q #ans"), null, "the normal answer box is still up");
    assert.match(await page.textContent("#blocks"), /piston carries/, "the question's own text is gone");
    assert.deepEqual(await page.$$eval("#q .rp-step", s => s.map(x => x.dataset.id + ":" + x.dataset.state)),
      ["who:active", "sheet:future", "split:future", "answer:future"]);
    const bg = await page.evaluate(() => {
      const t = document.createElement("i"); t.style.color = "var(--help-fill)"; document.body.append(t);
      const warm = getComputedStyle(t).color; t.remove();
      return { wl: getComputedStyle(document.querySelector("#q .wl")).backgroundColor, warm };
    });
    assert.equal(bg.wl, bg.warm, "not on the warm token");
    const line = await page.evaluate(() => {                                   // Cluck's reply lines are div.wl too: welcome.css must not dress them
      const t = document.createElement("div"); t.className = "wtext"; t.innerHTML = '<div class="wl">a line</div>'; document.body.append(t);
      const cs = getComputedStyle(t.firstChild), out = { bg: cs.backgroundColor, pad: cs.paddingTop, border: cs.borderTopWidth }; t.remove(); return out;
    });
    assert.notEqual(line.bg, bg.warm, "a Cluck line got the welcome's warm surface");
    assert.deepEqual([line.pad, line.border], ["0px", "0px"], "a Cluck line got the welcome's padding / border");
    assert.equal(await page.$("#fcard"), null, "the Key formulas card gives the sheet step away");
  });

  await step("the intro line is topic-neutral (Tony, vet w-4: it shows on any item, a pressure one too)", async () => {
    const intro = await page.textContent("#q .wl .rp-line");
    assert.ok(intro && intro.length > 5, "no intro line");
    assert.doesNotMatch(intro, /force|pressure|energy|momentum|motion|speed|veloc|accel|gravit|weight|mass|wave|circuit|current|heat|fluid|torque|rotat|spin|orbit|charge|field|light|piston/i,
      `a topic word in the intro line: ${intro}`);
  });

  await step("the choices stand out from the warm sheet (Tony, vet w-1): chips and the shown previews on the Key formulas card's surface", async () => {
    const [fc, c1, warm] = [await fcardBg(page), await tok(page, "--c1"), await tok(page, "--help-fill")];
    assert.notEqual(fc, warm);
    for (const sel of ['#q .rp-step[data-state="active"] .rp-chip', "#q .wl-field"]) {
      const all = await page.$$eval(sel, els => els.map(el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, line: cs.borderTopColor, w: cs.borderTopWidth }; }));
      assert.ok(all.length >= 2, `${sel}: ${all.length}`);
      for (const f of all) assert.deepEqual([f.bg, f.line, f.w], [fc, c1, "1px"], `${sel}: not the formula-box surface + its edge`);
    }
    assert.equal(await page.$eval("#q .wl-field", el => getComputedStyle(el).color), await tok(page, "--ink"), "a preview in the washed-out muted ink");
    await page.evaluate(() => { window.__t = []; const o = window.stemT; window.stemT = (n, p) => { window.__t.push([n, p]); return o && o(n, p); }; });
  });

  await step("walk it: the sheet step shows formulas (not ids), the keyless answer grades on the server, welcome_done fires once", async () => {
    await act(page, '.rp-val-opts .rp-chip[data-v="a"]');
    await page.waitForSelector('#q .rp-step[data-id="sheet"][data-state="active"]', { timeout: 4000 });
    const chips = await page.$$eval('#q .rp-step[data-state="active"] .rp-val-opts .rp-chip', c => c.map(x => x.textContent));
    assert.equal(chips.length, 2);
    assert.ok(chips.every(t => !/PRESSURE|DENSITY/.test(t)), `ids on the chips: ${chips}`);
    assert.ok(await page.$('#q .rp-step[data-state="active"] .rp-val-opts .rp-chip .katex'), "the formula is not typeset");
    await act(page, '.rp-val-opts .rp-chip[data-v="PRESSURE"]');                  // its why is not asked: the welcome asks it on the fam step only
    await page.waitForSelector('#q .rp-step[data-id="split"][data-state="active"]', { timeout: 4000 });
    await act(page, '.rp-val-opts .rp-chip[data-v="÷"]');
    await act(page, '.rp-why .rp-chip[data-why="0"]');
    await page.waitForSelector('#q .rp-step[data-id="answer"][data-state="active"] .rp-in', { timeout: 4000 });
    await warmFace(page, '#q .rp-step[data-state="active"] .rp-check');
    await page.fill('#q .rp-step[data-state="active"] .rp-in', "7");      // wrong: a hint, not a red state
    await page.click('#q .rp-step[data-state="active"] .rp-check');
    await page.waitForSelector('#q .rp-step[data-id="answer"] .rp-miss', { timeout: 4000 });
    await page.fill('#q .rp-step[data-state="active"] .rp-in', "4");
    await page.click('#q .rp-step[data-state="active"] .rp-check');
    await page.waitForSelector('#q .rp-step[data-id="answer"][data-state="done"]', { timeout: 4000 });
    assert.equal(await page.$$eval("#q .wl *", x => x.filter(e => /wrong|red|err/i.test(typeof e.className === "string" ? e.className : "")).length), 0, "a red state");
    const done = await page.evaluate(() => window.__t.filter(([n]) => n === "welcome_done"));
    assert.equal(done.length, 1, "welcome_done fired " + done.length + " times");
    assert.equal(done[0][1].code, WLC);
    assert.equal(done[0][1].bank, "BANK_P2X");
  });

  await step("its Next goes on to the normal queue: a plain item, the answer box back", async () => {
    const nx = await page.waitForSelector("#q .wl .nx", { timeout: 2000 });
    await warmFace(page, "#q .wl .nx .nf");
    const hit = await page.$eval("#q .wl .nx", el => el.getBoundingClientRect().height);
    assert.ok(hit >= 44, `Next's tap height ${hit}`);
    await nx.click();
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, WLC, { timeout: 4000 });
    await plain(page);
    assert.notEqual(await code(page), WLC);
  });

  await step("once: a reload never opens it first, and opening the welcome item again shows it as a normal item", async () => {
    await page.reload(); await anyOpen(page);
    assert.notEqual(await code(page), WLC);
    await page.evaluate(c => { location.hash = c; }, WLC); await opened(page, WLC);
    await plain(page);
    assert.equal(errs.length, 0, "page errors: " + errs.join(" | "));
  });
  await ctx.close();

  await step("a reload halfway through: still the welcome (it was never finished)", async () => {
    const r = await fresh();
    await r.page.goto(BASE + "/"); await anyOpen(r.page);
    await r.page.waitForSelector("#q .wl .rp-step", { timeout: 4000 });
    await r.page.click('#q .rp-step[data-state="active"] .rp-val-opts .rp-chip[data-v="a"]');
    await r.page.reload(); await anyOpen(r.page);
    assert.equal(await code(r.page), WLC);
    await r.page.waitForSelector("#q .wl .rp-step", { timeout: 4000 });
    await r.ctx.close();
  });

  await step("a returner (stem-noob-BANK_P2X, from before the welcome shipped) never sees it", async () => {
    const r = await fresh({ "stem-noob-BANK_P2X": "1" });
    await r.page.goto(BASE + "/"); await anyOpen(r.page);
    await plain(r.page);                                                       // whatever the queue picks (the welcome item too) is a normal question
    await r.page.evaluate(c => { location.hash = c; }, WLC); await opened(r.page, WLC);
    await plain(r.page);
    await r.ctx.close();
  });

  await step("a bank without a welcome item is unchanged: its first item, the answer box, no welcome surface", async () => {
    const r = await fresh();
    await r.page.goto(BASE + "/?bank=OTH1"); await anyOpen(r.page);
    assert.match(await code(r.page), /^CALC1_W0/);
    await plain(r.page);
    await r.ctx.close();
  });

  for (const [w, h] of [[390, 844], [360, 740], [844, 390], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
    await step(`${w}x${h}: the welcome fits (no sideways scroll), its first step's chips are in view and tappable`, async () => {
      const r = await fresh({}, { width: w, height: h });
      await r.page.goto(BASE + "/"); await anyOpen(r.page);
      await r.page.waitForSelector("#q .wl .rp-step", { timeout: 4000 });
      assert.equal(await r.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sideways scroll");
      const box = await r.page.$eval("#q .wl", el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right }; });
      assert.ok(box.l >= 0 && box.r <= w, `the welcome spills: ${JSON.stringify(box)}`);
      await r.page.click('#q .rp-step[data-state="active"] .rp-val-opts .rp-chip[data-v="a"]');
      await r.page.waitForSelector('#q .rp-step[data-id="sheet"][data-state="active"]', { timeout: 3000 });
      await r.ctx.close();
    });
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
