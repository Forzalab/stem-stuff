// W113 (todo 113, Tony Oct 28): Cluck's visuals are generous. The real serve.py streams from a fake Claude (CLAUDE_BASE) and the gate
// lets through what the new rules allow; the page draws it:
//   - two visuals in one reply (a ```fig and an ```openui view: "may mix 2") both draw;
//   - a Table-only view draws its table (the old "drawn?" check looked for svg / p only and blanked it);
//   - a stepper (Steps) in a chat view clicks through Back / Next;
//   - a tiny phone (slot under 300 px) gets a STATIC IMAGE of the same view, never an error box, no horizontal scroll;
//   - a figure graph.js can't fix (fable audit 2026-10-29 U7: two boxes in each other after Graph.fix) never draws: its alt text in a
//     plain box, no svg; one fig_check telemetry event with the finding codes and counts only (never a label, the alt, any text).
// Starts its own serve.py and fake Claude:   node tests/views-static.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8874), BASE = `http://localhost:${PORT}`;
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "views-static-")), BANKS = join(TMP, "banks");
const P = { ...FIX.problem, code: "CALC1_VS1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_VS1.json"), JSON.stringify({ v: 1, problems: [P] }));

const GEO = 'root = View([ramp])\nramp = Geometry("A 0,0; B 4,0; C 4,2.3; P 2,1.15", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "angle(A,B,C,30°)", "dim(A,C,1.2 m)", "arrow(P,C,push)"], "The ramp at 30 degrees, the push up it.")';
const TABLE = 'root = View([t])\nt = Table(["step", "you", "the fix"], [["friction", "added", "taken away"], ["spring", "x", "x squared"]])';
const STEPS = 'root = View([s])\ns = Steps(null, [s1, s2, s3])\ns1 = Step("Push in: **48 J**.")\ns2 = Step("Friction takes some away.")\ns3 = Step("The spring gets what is left.")';
/* physics-b plus a second block in the first one: the server passes it (livefig.check has no overlap rule), Graph.fix rests both on the
   ramp, figcheck still finds I-BODY-1 (no auto-fix): the student gets the alt text, never the interpenetrating drawing */
const CLASH = { ...FIX.valid[0], alt: "Two blocks on the ramp, drawn inside each other.", marks: [...FIX.valid[0].marks, { mark: "body", at: [0.25, 1.3], shape: "box", w: 0.8, h: 0.5, angle: 30 }] };
const LABELS = FIX.valid[0].marks.filter(m => m.label).map(m => m.label);     // "$mg$", "$F_N$", ...: none may ride in telemetry
const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const REPLIES = {
  two: ["Not quite.\n\nForces on the block:\n", fence("fig", JSON.stringify(FIX.valid[0])) + "\n", "\nAnd the ramp:\n", fence("openui", GEO) + "\n", "\nTry once more."],
  table: ["Not quite.\n\nYour move next to the fix:\n", fence("openui", TABLE) + "\n", "\nTry once more."],
  steps: ["Not quite.\n\nClick through it:\n", fence("openui", STEPS) + "\n", "\nTry once more."],
  geo: ["Not quite.\n\nThe ramp:\n", fence("openui", GEO) + "\n", "\nTry once more."],
  // W113 vet: mc-a's own triangle (the AFTER run), whose labels drew at ~12 px on a 1440 desktop
  tri: ["Not quite.\n\nThe slope:\n", fence("openui", 'root = View([fig])\nfig = Geometry("A 0,0; B 4,0; C 4,3", ["seg(A,B)", "seg(B,C)", "seg(A,C)", "right(B,A,C)", "angle(B,A,C,θ)", "dim(A,C,d + x)", "dim(B,C,h = ?)"], "The slope and the height.")') + "\n", "\nTry once more."],
  code: ["Not quite.\n\nSo `lo = mid` does not move **lo**.\n\n", "$$\n\\begin{aligned}\nW_{push} &= 40(1.2) \\\\\nW_{push} &= 48\n\\end{aligned}\n$$\n", "\nTry once more."],
  // W340 vf-proof-b: the row format V4_MATH teaches (3-5 words that justify the line below, then ONE centred display line, per step)
  rows: ["Not quite.\n\nTake the case that **breaks**:\n", "$$hi = lo + 1$$\n", "Because $mid$ rounds down, this becomes:\n", "$$mid = lo$$\n",
    "So `lo = mid` never moves **lo**.\n", "\nTry once more."],
  clash: ["Not quite.\n\nThe two blocks:\n", fence("fig", JSON.stringify(CLASH)) + "\n", "\nTry once more."],
};
let reply = "two";
const fake = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  ev({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } });
  for (const p of REPLIES[reply]) { ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } }); await new Promise(r => setTimeout(r, 30)); }
  ev({ type: "message_delta", usage: { output_tokens: 50 } }); ev({ type: "message_stop" }); res.end();
});
await new Promise(r => fake.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "unused", CLAUDE_API: "fake", CLAUDE_BASE: `http://127.0.0.1:${fake.address().port}`, CLUCK_ARM: "claude",
  CLUCK_LIVE_FIGS: "1", CLUCK_VIEWS: "1", CLUCK_REWRITE: "0" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const has = async (page, sel) => !!(await page.$(sel));
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
/* fig_check spy: once every script has set window.stemT (telemetry.js, intent.js and flight.js wrap it while loading; no key here, so
   nothing leaves the page), wrap it once more and log what the app hands the sender */
const init = () => { window.__figT = [];
  addEventListener("load", () => setTimeout(() => { const f = window.stemT; window.stemT = (n, p) => { if (n === "fig_check") window.__figT.push(JSON.parse(JSON.stringify(p))); return f && f(n, p); }; }));
  try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } };
async function wish(which, w, h) {
  reply = which;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "reduce" });
  await ctx.addInitScript(init);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(e.message));
  await page.goto(BASE + "/#CALC1_VS1");
  await page.waitForFunction(() => location.hash === "#CALC1_VS1" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
  await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
  await page.waitForSelector("#wish:not([hidden]) .wchip, .cl-peek .cl-cta, #cluck .wtext", { timeout: 8000 });
  if (!(await page.locator("#cluck .wtext").count())) await page.click("#wish:not([hidden]) .wchip, .cl-peek .cl-cta");
  await page.waitForFunction(() => /once more/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 15000 });
  await page.waitForTimeout(400);                                      // views.js is imported lazily
  return page;
}
const noRaw = async page => assert.doesNotMatch(await page.evaluate(() => document.querySelector("#cluck .wtext").textContent), /```|Geometry\(|Table\(|root =/);

try {
  await step("two visuals in one reply (a fig and a view): both draw", async () => {
    const page = await wish("two", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
    assert.equal(await page.locator("#cluck .wtext .wfig").count(), 2, "two figure slots");
    assert.ok(await has(page, "#cluck .wtext .wfig:not(.wview) svg"), "the fig drew");
    assert.equal(await page.getAttribute("#cluck .wtext .wfig:not(.wview)", "data-fig-findings"), "", "physics-b is finding-free");
    assert.equal(await has(page, "#cluck .wtext .wfig.fig-alt"), false, "a finding-free figure is never degraded");
    assert.deepEqual(await page.evaluate(() => window.__figT), [], "no fig_check for a clean figure");
    await noRaw(page);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a Table-only view draws its table (not blanked to the alt text)", async () => {
    const page = await wish("table", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview table.vw-tb", { timeout: 5000 });
    assert.equal(await page.locator("#cluck .wtext .wview table.vw-tb tbody tr").count(), 2);
    assert.equal(await has(page, "#cluck .wtext .wview.fig-off"), false, "never the off state");
    await noRaw(page);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a stepper in a chat view clicks through Back / Next", async () => {
    const page = await wish("steps", 1280, 900);
    await page.waitForSelector("#cluck .wtext .wview .vw-steps .vw-cap", { timeout: 5000 });
    assert.match(await page.textContent("#cluck .wview .vw-n"), /Step 1 of 3/);
    await page.click("#cluck .wview .vw-foot button:nth-child(2)");
    assert.match(await page.textContent("#cluck .wview .vw-cap"), /Friction/);
    await page.mouse.move(0, 0);                                         // not hovered: the resting look
    const look = await page.$eval("#cluck .wview .vw-foot button:nth-child(2)", b => { const c = getComputedStyle(b), r = getComputedStyle(document.querySelector("#cluck"));
      const hex = v => v.trim().replace(/^#(..)(..)(..)$/, (m, x, y, z) => `rgb(${[x, y, z].map(h => parseInt(h, 16)).join(", ")})`);
      return [c.color === hex(r.getPropertyValue("--help")), c.borderTopColor === hex(r.getPropertyValue("--help-line")), c.backgroundColor]; });
    assert.deepEqual(look, [true, true, "rgba(0, 0, 0, 0)"], "W113 vet: Back / Next in the chat's --help family, no navy fill");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("`code` in a reply is a code span (no backticks); an aligned $$ derivation is one display, one row per step", async () => {
    const page = await wish("code", 1280, 900);
    assert.equal(await page.textContent("#cluck .wtext code.wcode"), "lo = mid");
    assert.doesNotMatch(await page.textContent("#cluck .wtext"), /`/);
    assert.equal(await page.locator("#cluck .wtext .katex-display").count(), 1, "one display block");
    assert.equal(await page.locator("#cluck .wtext .katex-display .mtable").count(), 1, "the aligned block renders as one table");
    assert.match(await page.textContent("#cluck .wtext .katex-display annotation"), /\\begin\{aligned\}[\s\S]*40\(1\.2\)[\s\S]*\\\\[\s\S]*48/, "both steps, in order");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  for (const [w, h] of [[1440, 900], [390, 844]]) await step(`proof rows (W340 vf-proof-b): prose row / one centred display line, alternating, ${w}`, async () => {
    const page = await wish("rows", w, h);
    const rows = await page.$$eval("#cluck .wtext > .wl:not(.wgap)", els => els.map(e => ({ math: e.classList.contains("wmath"), n: e.querySelectorAll(".katex-display").length,
      align: getComputedStyle(e).textAlign, text: e.textContent.trim().slice(0, 40) })));
    const at = rows.findIndex(r => /Take the case/.test(r.text));
    assert.ok(at >= 0, JSON.stringify(rows));
    assert.deepEqual(rows.slice(at, at + 5).map(r => r.math), [false, true, false, true, false], JSON.stringify(rows));
    for (const r of rows.slice(at, at + 5).filter(r => r.math)) { assert.equal(r.n, 1, "ONE display line per row"); assert.equal(r.align, "center"); }
    assert.equal(await page.textContent("#cluck .wtext b"), "breaks", "markdown bold in a prose row");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  await step("a tiny phone (280 px) gets a static image of the same view: an img with the alt, no error box, no horizontal scroll", async () => {
    const page = await wish("geo", 280, 640);
    await page.waitForSelector("#cluck .wtext .wview img.vw-static", { timeout: 6000 });
    const im = await page.$eval("#cluck .wtext .wview img.vw-static", i => ({ alt: i.alt, src: i.src.slice(0, 24), ok: i.complete && i.naturalWidth > 0, w: i.getBoundingClientRect().width }));
    assert.equal(im.alt, "The ramp at 30 degrees, the push up it.");
    assert.equal(im.src, "data:image/svg+xml;chars");
    assert.ok(im.ok, "the image decodes");
    assert.ok(im.w > 100, `drawn wide enough: ${im.w}`);
    assert.equal(await has(page, "#cluck .wtext .wview.fig-off"), false);
    const sc = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sc[0] <= sc[1], `no horizontal scroll: ${sc}`);
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
  for (const [w, h] of [[1440, 900], [390, 844]]) await step(`${w} px keeps the live view (no static image); its labels draw at 0.8x the reply's text or more (W113 vet: mc-a's labels were tiny)`, async () => {
    const page = await wish("tri", w, h);
    await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
    assert.equal(await has(page, "#cluck .wtext img.vw-static"), false);
    // the drawn size: the label's font in user units x the svg's scale (meet: the smaller of width and height ratios)
    const [label, body] = await page.$eval("#cluck .wview .vw-geo svg", s => { const t = s.querySelector(".gm-t:not(.gm-name)"), r = s.getBoundingClientRect(), v = s.viewBox.baseVal;
      return [parseFloat(getComputedStyle(t).fontSize) * Math.min(r.width / v.width, r.height / v.height), parseFloat(getComputedStyle(document.querySelector("#cluck .wtext")).fontSize)]; });
    assert.ok(label >= 0.8 * body, `label ${label.toFixed(1)} px vs reply text ${body} px`);
    await page.context().close();
  });
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await step(`a figure figcheck can't fix (two blocks in each other) never draws: the alt text in a plain box, no svg; fig_check has codes only, ${w}`, async () => {
      const page = await wish("clash", w, h);
      const sel = "#cluck .wtext .wfig:not(.wview)";
      await page.waitForSelector(sel, { timeout: 5000 });
      const f = await page.$eval(sel, e => ({ svg: !!e.querySelector("svg"), lbl: e.querySelectorAll(".lbl").length, text: e.textContent.trim(), cls: e.className, find: e.dataset.figFindings }));
      assert.equal(f.svg, false, "no svg: the interpenetrating drawing never reaches the student");
      assert.equal(f.lbl, 0, "no labels left over");
      assert.equal(f.text, CLASH.alt, "the figure's alt text");
      assert.match(f.cls, /\bfig-alt\b/, "in the plain alt box");
      assert.ok(f.find.split(" ").includes("I-BODY-1"), f.find);
      const T = await page.evaluate(() => window.__figT);
      assert.equal(T.length, 1, `one fig_check per figure render: ${JSON.stringify(T)}`);
      assert.deepEqual(Object.keys(T[0]).sort(), ["degraded", "fixed", "path", "rules", "step"], "codes and counts only");
      assert.equal(T[0].path, "graph"); assert.equal(T[0].degraded, true); assert.equal(typeof T[0].fixed, "number");
      assert.ok(T[0].rules.includes("I-BODY-1") && T[0].rules.every(r => /^I-[A-Z]+-\d+$/.test(r)), JSON.stringify(T[0].rules));
      const raw = JSON.stringify(T);
      for (const l of [...LABELS, CLASH.alt, "mg", "F_N", "f_k", "ramp"]) assert.ok(!raw.includes(l), `telemetry carries ${l}: ${raw}`);
      await noRaw(page);
      assert.deepEqual(page.errs, []);
      await page.context().close();
    });
  }
} finally {
  await browser.close();
  srv.kill(); fake.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
