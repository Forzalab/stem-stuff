// shotqa (W340 §0, Tony Oct 29: "pls playwright screenshot everything b4 letting me vet"): the shot gate before anything reaches the
// vet page or prod. Every vet card state (function-b, physics-b, proof-b, stepper, mc-a) and every stepper step renders in the real app
// (real serve.py, a fake Claude) at 1440x900 and 390x844; a shot of each goes to SHOTQA_SHOTS (or argv[3]) for the orc to open. FAIL when:
//   - a figure (or a stepper step) has no drawn marks, or its svg is under 40% of its slot's width;
//   - an element carries a non-empty data-fig-findings (figcheck codes);
//   - an angle label (Geometry text[data-at]) is not at its own vertex (I-ANG-1a: nearer that point than any other);
//   - card specifics: physics-b's figure is the element right under "Forces on the block:" (the re-ask fills the dropped fence's place);
//     proof-b's rows alternate prose / one centred display line; mc-a's θ sits at A and every label keeps 8 px (390) / 10 px (1440) off
//     every stroke; the stepper's figure changes with the step.
// Starts its own serve.py and fake Claude:   node tests/shotqa.pw.mjs [port] [shots dir]
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
const PORT = +(process.argv[2] || 8886), BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTQA_SHOTS || process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "shotqa-")), BANKS = join(TMP, "banks");
const P = { ...FIX.problem, code: "CALC1_VS1", shuffle: false, saccharine: { ...FIX.problem.saccharine, title: "Rough ramp" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_SQ1.json"), JSON.stringify({ v: 1, problems: [P] }));

const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const NOFORCE = { type: "graph", kind: "scene", alt: "A block.", marks: [{ mark: "body", at: [0, 0], shape: "box", w: 1, h: 0.5 }] };   // the gate drops it
const STEPS = 'root = View([s])\ns = Steps(g, [s1, s2, s3])\ng = Graph("W 40 60, F 160 30, U 160 90, S 280 60", "W>F, W>U, W>S")\n' +
  's1 = Step("The push puts work in.", "W:cur")\ns2 = Step("Friction and gravity take their share on the way up.", "W:done F:cur U:cur", "W-F:tree W-U:tree")\n' +
  's3 = Step("The spring gets what is left.", "W:done F:done U:done S:cur", "W-F:tree W-U:tree W-S:tree")';
/* the vet's own stepper (fix2-vet stepper-1440x900.png): captions only, Steps(null, ...) as the prompt's example writes it; it drew the
   buttons and a sentence, no figure ("empty UI apart from the buttons") */
const BARE = 'root = View([s])\ns = Steps(null, [s1, s2, s3])\ns1 = Step("Push in: the work along the ramp.")\ns2 = Step("Friction and gravity take their share on the way up.")\ns3 = Step("The spring gets what is left.")';
const TRI = 'root = View([fig])\nfig = Geometry("A 0,0; B 4,0; C 4,3", ["seg(A,B)", "seg(B,C)", "seg(A,C)", "right(B,A,C)", "angle(B,A,C,θ)", "dim(A,C,d + x)", "dim(B,C,h = ?)"], "The slope and the height.")';
/* the vet cards (brain _files/w113/fix2-vet): replies from a fake Claude, deterministic */
const CARDS = {
  "function-b": ["Here is why, one step per line.\n\n", "$$\n\\begin{aligned}\nW_{push} &= F d \\\\\nW_{push} &= 40(1.2) \\\\\nW_{push} &= 48\\ \\text{J}\n\\end{aligned}\n$$\n", "\nTry once more."],
  "physics-b": ["Not quite.\n\nForces on the block:\n", fence("fig", JSON.stringify(NOFORCE)) + "\n", "\nFriction points down the ramp.\n", "\nTry once more."],
  "proof-b": ["Not quite.\n\nTake the case that **breaks**:\n", "$$hi = lo + 1$$\n", "Because $mid$ rounds down, this becomes:\n", "$$mid = lo$$\n",
    "So `lo = mid` never moves **lo**.\n", "\nTry once more."],
  "stepper": ["Not quite.\n\nClick through where the 48 J goes:\n", fence("openui", BARE) + "\n", "\nTry once more."],
  "stepper-graph": ["Not quite.\n\nClick through where the work goes:\n", fence("openui", STEPS) + "\n", "\nTry once more."],
  "mc-a": ["Not quite.\n\nThe slope:\n", fence("openui", TRI) + "\n", "\nTry once more."],
};
const REASK = fence("fig", JSON.stringify(FIX.valid[0]));                    // the figure-only re-ask (serve.fig_reask) answers this
let card = "function-b";
const fake = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  ev({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } });
  for (const p of /was dropped/.test(body) ? [REASK] : CARDS[card]) { ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } }); await new Promise(r => setTimeout(r, 30)); }
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
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const init = () => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } };
async function open(which, w, h) {
  card = which;
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
  await page.waitForTimeout(500);                                      // views.js is imported lazily
  const rot = page.getByText("Hide curated brainrot");                 // the docked players (blank: youtube is blocked here) fold away, as the vet shots had them
  if (await rot.count()) { await rot.first().click(); await page.waitForTimeout(400); }
  return page;
}
/* in the page: every figure of the reply: drawn marks, svg width vs its slot, findings, angle labels vs their vertex, label clearance */
function audit() {
  const out = [];
  for (const f of document.querySelectorAll("#cluck .wtext .wfig")) {
    const svg = [...f.querySelectorAll("svg")].find(x => !x.closest("button, .btn") && !x.classList.contains("vw-mark")), slot = f.getBoundingClientRect();   // never an icon
    const r = { cls: f.className, svg: !!svg, marks: 0, share: 0, findings: [...f.querySelectorAll("[data-fig-findings]"), f].map(e => e.dataset.figFindings || "").filter(Boolean),
      img: !!f.querySelector("img.vw-static"), alt: f.classList.contains("fig-off") ? f.textContent.trim() : null, angles: [], clear: [] };
    if (svg) {
      const b = svg.getBoundingClientRect();
      r.share = +(b.width / (slot.width || 1)).toFixed(2);
      r.marks = [...svg.querySelectorAll("line, path, circle, polygon, rect, polyline, ellipse")].filter(e => { const q = e.getBoundingClientRect(); return q.width + q.height > 1; }).length;
      const pt = n => { const c = svg.querySelector(`.gm-pt[data-pt="${n}"] circle`)?.getBoundingClientRect(); return c && [c.x + c.width / 2, c.y + c.height / 2]; };
      for (const t of svg.querySelectorAll("text[data-at]")) {
        const q = t.getBoundingClientRect(), c = [q.x + q.width / 2, q.y + q.height / 2], own = pt(t.dataset.at);
        let near = t.dataset.at, best = own ? Math.hypot(c[0] - own[0], c[1] - own[1]) : 1e9;
        for (const g of svg.querySelectorAll(".gm-pt[data-pt]")) { const p = pt(g.dataset.pt), d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < best - 0.01) { best = d; near = g.dataset.pt; } }
        r.angles.push({ t: t.textContent.trim(), at: t.dataset.at, near });
      }
      // label clearance (screen px) from every stroke / dot, leader lines excepted (Geometry only: graph.js labels are html)
      const P = svg.createSVGPoint(), segs = [];
      for (const e of svg.querySelectorAll(".vw-geo line, .vw-geo path, .vw-geo circle, .vw-geo polygon")) {
        if (e.classList.contains("gm-lead")) continue;
        const m = e.getScreenCTM(), T = (x, y) => { P.x = x; P.y = y; const q = P.matrixTransform(m); return [q.x, q.y]; };
        let pts = [];
        if (e.tagName === "line") pts = [T(+e.getAttribute("x1"), +e.getAttribute("y1")), T(+e.getAttribute("x2"), +e.getAttribute("y2"))];
        else if (e.tagName === "polygon") { pts = e.getAttribute("points").trim().split(/\s+/).map(p => T(...p.split(",").map(Number))); pts.push(pts[0]); }
        else { const L = e.getTotalLength(); for (let i = 0; i <= 24; i++) { const q = e.getPointAtLength(L * i / 24); pts.push(T(q.x, q.y)); } }
        for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
      }
      const dPS = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
      for (const t of svg.querySelectorAll(".vw-geo text")) {
        const q = t.getBoundingClientRect(), C = [[q.x, q.y], [q.right, q.y], [q.right, q.bottom], [q.x, q.bottom]];
        let d = 1e9;
        for (const [a, b] of segs) {
          if ([a, b].some(p => p[0] >= q.x && p[0] <= q.right && p[1] >= q.y && p[1] <= q.bottom)) { d = 0; break; }
          d = Math.min(d, ...C.map(c => dPS(c, a, b)), ...[0, 1, 2, 3].flatMap(i => [a, b].map(p => dPS(p, C[i], C[(i + 1) % 4]))));
        }
        r.clear.push({ t: t.textContent.trim(), d: +d.toFixed(1) });
      }
    }
    out.push(r);
  }
  return out;
}
const checkFig = (r, what) => {
  assert.ok(r.svg && !r.alt, `${what}: no drawing (${r.alt ? "alt text: " + r.alt : r.img ? "static image" : "nothing"})`);
  assert.ok(r.marks >= 1, `${what}: no drawn marks`);
  assert.ok(r.share >= 0.4, `${what}: svg ${Math.round(r.share * 100)}% of its slot (< 40%)`);
  assert.deepEqual(r.findings, [], `${what}: data-fig-findings`);
  for (const a of r.angles) assert.equal(a.near, a.at, `${what}: angle label "${a.t}" is at ${a.near}, not its vertex ${a.at} (I-ANG-1a)`);
};
const shot = async (page, name, w, h) => {
  if (!SHOTS) return;
  const f = page.locator("#cluck .wtext .wfig").first();
  if (await f.count()) await f.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, `${name}-${w}x${h}.png`) });
};

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await step(`function-b ${w}x${h}: the derivation is one display, one row per step`, async () => {
      const page = await open("function-b", w, h);
      assert.equal(await page.locator("#cluck .wtext .katex-display").count(), 1);
      assert.equal(await page.locator("#cluck .wtext .katex-display .mtable").count(), 1);
      for (const r of await page.evaluate(audit)) checkFig(r, "function-b");
      await shot(page, "function-b", w, h);
      assert.deepEqual(page.errs, []);
      await page.context().close();
    });
    await step(`physics-b ${w}x${h}: the re-asked figure sits right under "Forces on the block:", drawn and finding-free`, async () => {
      const page = await open("physics-b", w, h);
      await page.waitForSelector("#cluck .wtext .wfig svg", { timeout: 5000 });
      const figs = await page.evaluate(audit);
      assert.equal(figs.length, 1, "one figure");
      checkFig(figs[0], "physics-b");
      const prev = await page.$eval("#cluck .wtext .wfig", f => { let e = f.previousElementSibling; while (e && e.classList.contains("wgap")) e = e.previousElementSibling; return e?.textContent.trim(); });
      assert.equal(prev, "Forces on the block:", "the figure follows its line");
      await shot(page, "physics-b", w, h);
      assert.deepEqual(page.errs, []);
      await page.context().close();
    });
    await step(`proof-b ${w}x${h}: prose row / one centred display line, alternating`, async () => {
      const page = await open("proof-b", w, h);
      const rows = await page.$$eval("#cluck .wtext > .wl:not(.wgap)", els => els.map(e => ({ math: e.classList.contains("wmath"), n: e.querySelectorAll(".katex-display").length, align: getComputedStyle(e).textAlign, text: e.textContent.trim() })));
      const at = rows.findIndex(r => /Take the case/.test(r.text));
      assert.deepEqual(rows.slice(at, at + 5).map(r => r.math), [false, true, false, true, false], JSON.stringify(rows));
      for (const r of rows.slice(at, at + 5).filter(r => r.math)) { assert.equal(r.n, 1); assert.equal(r.align, "center"); }
      await shot(page, "proof-b", w, h);
      assert.deepEqual(page.errs, []);
      await page.context().close();
    });
    for (const sc of ["stepper", "stepper-graph"]) await step(`${sc} ${w}x${h}: every step draws its figure (marks, >= 40% of the slot), the figure follows the step`, async () => {
      const page = await open(sc, w, h);
      await page.waitForSelector("#cluck .wview .vw-steps .vw-cap", { timeout: 5000 });
      const seen = [];
      for (let i = 1; i <= 3; i++) {
        assert.match(await page.textContent("#cluck .wview .vw-n"), new RegExp(`Step ${i} of 3`));
        const figs = await page.evaluate(audit);
        assert.equal(figs.length, 1);
        checkFig(figs[0], `${sc} step ${i}`);
        seen.push(await page.$eval("#cluck .wview .vw-steps svg", s => [...s.querySelectorAll("g")].map(g => g.getAttribute("class")).join(" ")));
        await shot(page, `${sc}-s${i}`, w, h);
        if (i < 3) await page.click("#cluck .wview .vw-foot button:nth-child(2)");
      }
      assert.equal(new Set(seen).size, 3, "the figure changes with the step");
      assert.deepEqual(page.errs, []);
      await page.context().close();
    });
    await step(`mc-a ${w}x${h}: θ at A (not the square corner B), every label ${w < 500 ? 8 : 10} px off every stroke`, async () => {
      const page = await open("mc-a", w, h);
      await page.waitForSelector("#cluck .wtext .wview .vw-geo svg", { timeout: 5000 });
      const [r] = await page.evaluate(audit);
      checkFig(r, "mc-a");
      assert.deepEqual(r.angles.map(a => [a.t, a.at]), [["θ", "A"]]);
      const min = w < 500 ? 8 : 10, tight = r.clear.filter(c => c.d < min);
      assert.deepEqual(tight, [], `labels closer than ${min} px to a stroke`);
      await shot(page, "mc-a", w, h);
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
