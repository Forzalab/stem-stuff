// FIG-DRAW-IN smoke (Nov 25): a fresh Cluck reply figure draws in like a construction site (pen trace), and nothing else ever does.
// (a) mid-animation some stroke is part-drawn (a live dashoffset), (b) after total + 100 ms no inline dash is left and every
// stroke is final, (c) prefers-reduced-motion: reduce -> zero running animations, (d) a cached / history draw -> zero animations.
// Also the pure timeline: order (longest first, then nearest start) + the 120-400 ms clamp + the 40 ms label stagger.
// The Geometry is the real views.js renderer in the app page's own cascade (the same DOM a reply's ```openui slot gets).
//   node tests/fig-drawin.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { orderTier, timelineOf } from "../client/cluck/figures/drawin.js";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..");
const PORT = +(process.argv[2] || 8877), BASE = `http://127.0.0.1:${PORT}`;
const SRC = 'root = View([g])\ng = Geometry("A 0,0; B 3,0; C 3,4; O 1.5,2", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "dim(A,B,3 m)", "angle(A,B,C,$\\\\theta$)", "arrow(A,C,$F$)", "circle(O,0.5)", "label(C,$t.top)"], "A right triangle with legs 3 and 4.")';
const GRAPH_SRC = 'root = View([g])\ng = Graph("A 48 100, B 160 48, C 160 150", "A-B, A-C")';
const DOODLE_SRC = 'root = View([d])\nd = Doodle("duck")';
const GRAPH_BLOCK = { type: "graph", kind: "cartesian", alt: "a rising line", x: { min: 0, max: 8, step: 2, label: "$t$" }, y: { min: 0, max: 10, step: 2, label: "$x$" },
  grid: true, axes: true, marks: [{ mark: "seg", from: [0, 2], to: [8, 6], color: "c1" }, { mark: "point", at: [2, 3], color: "c2" }] };

/* ---- pure timeline (no DOM): the order and the clamp the locked look names ---- */
const U = (len, x, y) => ({ kind: "stroke", tier: 1, len, pt0: { x, y }, pt1: { x: x + 1, y }, dur: 0, selfFill: false });
{
  const far = U(100, 0, 0), long = U(300, 50, 50), near = U(200, 51, 50);
  const ord = orderTier([far, long, near]);
  assert.equal(ord[0], long, "longest stroke first");
  assert.equal(ord[1], near, "then the start nearest the previous end");
  assert.equal(ord[2], far);

  const tiny = U(10, 0, 0), huge = U(1e9, 0, 0);
  timelineOf([tiny], [], 400);
  timelineOf([huge], [], 400);
  assert.equal(tiny.dur, 120, "a tiny stroke keeps the 120 ms floor");
  assert.equal(huge.dur, 400, "a huge stroke keeps the 400 ms cap");

  const a = U(400, 0, 0), b = U(400, 5, 0);
  const tl = timelineOf([a, b], [], 400);
  assert.equal(b.start, a.start + 0.5 * a.dur, "a stroke starts when the previous is half done");

  const t0 = U(400, 0, 0); t0.tier = 0;
  const t1 = U(400, 0, 0); t1.tier = 1;
  timelineOf([t0, t1], [], 400);
  assert.equal(t1.start, t0.end + 90, "a tier starts 90 ms after the last one ends");

  const l1 = { el: "b", x: 50, y: 5 }, l2 = { el: "a", x: 0, y: 5 };
  const lab = timelineOf([t0], [l1, l2], 400).labels;
  assert.equal(lab[0].el, "a", "labels sort y then x");
  assert.equal(lab[1].start - lab[0].start, 40, "labels stagger 40 ms");
  console.log("ok   pure timeline: longest first, nearest next, 120-400 clamp, 90 gap, 40 stagger");
}

const TMP = mkdtempSync(join(tmpdir(), "drawin-"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
process.on("exit", () => srv.kill());
await serverUp(BASE);
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }

let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }

/** Render one Geometry reply into a reply-shaped .wtext host and run drawIn exactly as cluck.js wishFigs does. */
const mount = (page, src, fresh) => page.evaluate(async ({ src, fresh }) => {
  const V = await import("/client/cluck/openui_views/views.js");
  const D = await import("/client/cluck/figures/drawin.js");
  const host = document.createElement("div");
  host.className = "wtext";
  host.style.cssText = "position:fixed;left:8px;top:8px;width:336px;z-index:9999;background:var(--sheet)";
  const ph = document.createElement("div");
  ph.className = "fig wfig wview";
  host.append(ph); document.body.append(host);
  V.render(src, ph, {});
  const r = D.drawIn(ph, { fresh });
  const i = (window.__dw = window.__dw || []).push({ host, ph }) - 1;
  window.__dw[i].total = r.total;
  return { i, total: r.total, svg: !!ph.querySelector("svg"), strokes: ph.querySelectorAll("svg path, svg line, svg polyline, svg polygon").length };
}, { src, fresh });

const probe = (page, i) => page.evaluate(i => {
  const { ph } = window.__dw[i];
  const all = [...ph.querySelectorAll("svg *")];
  const running = ph.getAnimations ? ph.getAnimations({ subtree: true }).length : -1;
  const offsets = all.map(e => getComputedStyle(e).strokeDashoffset).filter(v => v && v !== "0px" && v !== "none");
  const inline = all.filter(e => e.style.strokeDashoffset || e.style.strokeDasharray).length;
  const drawn = ph.querySelectorAll("[data-drawn]").length;
  return { running, offsets: offsets.length, sample: offsets[0] || "", inline, drawn };
}, i);

const drop = (page, i) => page.evaluate(i => {
  const h = window.__dw[i];
  if (h.ph.getAnimations) h.ph.getAnimations({ subtree: true }).forEach(a => a.cancel());
  h.host.remove(); window.__dw[i] = null;
}, i);

try {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "no-preference" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* none */ } });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
    await page.goto(BASE + "/"); await page.waitForFunction(() => document.readyState === "complete", null, { timeout: 15000 });
    let m = null;
    await step(`${w}: a fresh reply's Geometry draws in (mid-animation a stroke is part-drawn)`, async () => {
      m = await mount(page, SRC, true);
      assert.ok(m.svg && m.strokes > 6, `the Geometry drew (${m.strokes} stroke marks)`);
      assert.ok(m.total > 400, `a real timeline (${m.total} ms)`);
      const again = await page.evaluate(async i => (await import("/client/cluck/figures/drawin.js")).drawIn(window.__dw[i].ph, { fresh: true }).total, m.i);
      assert.equal(again, 0, "a second drawIn on the same node never animates it again (data-drawn)");
      const mid = await probe(page, m.i);
      assert.ok(mid.running > 0, "animations are running mid-draw");
      assert.ok(mid.offsets > 0, "no stroke is part-drawn (dashoffset never left 0)");
      assert.equal(errs.length, 0, errs.join(" | "));
    });
    await step(`${w}: after total + 100 ms the figure is final, no inline dash left`, async () => {
      await page.waitForTimeout(m.total + 120);
      const end = await probe(page, m.i);
      assert.equal(end.running, 0, "no animation still runs");
      assert.equal(end.offsets, 0, "a stroke still shows a live dashoffset");
      assert.equal(end.inline, 0, "an inline dash style was left behind");
      await drop(page, m.i);
    });
    await step(`${w}: a cached / history draw is static`, async () => {
      const c = await mount(page, SRC, false);
      assert.ok(c.svg && c.strokes > 6, "the cached figure still draws");
      const r = await probe(page, c.i);
      assert.equal(r.running, 0, "a cached reply must not animate");
      assert.equal(r.offsets, 0, "a cached reply must not hide a stroke");
      assert.equal(r.inline, 0, "a cached reply must not set a dash style");
      await page.waitForTimeout(60);
      assert.equal((await probe(page, c.i)).running, 0, "no animation starts later");
      await drop(page, c.i);
    });
    if (w === 390) {
      await step("390: a Steps anchor figure is OUT (static)", async () => {
        const r = await page.evaluate(async src => {
          const V = await import("/client/cluck/openui_views/views.js");
          const D = await import("/client/cluck/figures/drawin.js");
          const host = document.createElement("div"); host.className = "wtext"; host.style.cssText = "position:fixed;left:8px;top:8px;width:336px;z-index:9999";
          const steps = document.createElement("div"); steps.className = "vw-steps";
          const ph = document.createElement("div"); ph.className = "fig wfig wview";
          steps.append(ph); host.append(steps); document.body.append(host);
          V.render(src, ph, {});
          const out = D.drawIn(ph, { fresh: true });
          const res = { total: out.total, anims: steps.getAnimations({ subtree: true }).length, svg: !!ph.querySelector("svg"),
            inline: [...ph.querySelectorAll("svg *")].filter(e => e.style.strokeDashoffset || e.style.strokeDasharray).length };
          host.remove();
          return res;
        }, SRC);
        assert.ok(r.svg, "the anchor figure still draws");
        assert.equal(r.total, 0, "no timeline inside a Steps anchor");
        assert.equal(r.anims, 0, "no animation inside a Steps anchor");
        assert.equal(r.inline, 0, "no dash style inside a Steps anchor");
      });
      await step("390: the static <img> fallback never animates", async () => {
        const r = await page.evaluate(async () => {
          const D = await import("/client/cluck/figures/drawin.js");
          const ph = document.createElement("div"); ph.className = "fig wfig wview wstatic";
          const img = new Image(); img.className = "vw-static"; img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
          ph.append(img); document.body.append(ph);
          const out = D.drawIn(ph, { fresh: true });
          const res = { total: out.total, anims: ph.getAnimations({ subtree: true }).length };
          ph.remove();
          return res;
        });
        assert.equal(r.total, 0, "a static image has no timeline");
        assert.equal(r.anims, 0, "a static image never animates");
      });
      await step("390: more than 60 marks: one 150 ms fade of the whole figure", async () => {
        const r = await page.evaluate(async () => {
          const D = await import("/client/cluck/figures/drawin.js");
          const NS = "http://www.w3.org/2000/svg";
          const host = document.createElement("div"); host.className = "wtext";
          const ph = document.createElement("div"); ph.className = "fig wfig";
          const svg = document.createElementNS(NS, "svg");
          svg.setAttribute("viewBox", "0 0 200 200"); svg.setAttribute("width", "200"); svg.setAttribute("height", "200");
          for (let i = 0; i < 70; i++) {
            const c = document.createElementNS(NS, "circle");
            c.setAttribute("cx", String(10 + (i % 10) * 18)); c.setAttribute("cy", String(10 + Math.floor(i / 10) * 18)); c.setAttribute("r", "3"); c.setAttribute("fill", "#334455");
            svg.append(c);
          }
          ph.append(svg); host.append(ph); document.body.append(host);
          const out = D.drawIn(ph, { fresh: true });
          const anims = ph.getAnimations({ subtree: true });
          const res = { total: out.total, n: anims.length, targets: anims.map(a => a.effect.target.tagName) };
          host.remove();
          return res;
        });
        assert.equal(r.total, 150, "the perf fallback is one 150 ms fade");
        assert.deepEqual(r.targets, ["svg"], "the fade is on the whole figure, not each mark");
      });
      await step("390: a fresh OpenUI Graph view draws in", async () => {
        const g = await mount(page, GRAPH_SRC, true);
        assert.ok(g.svg && g.strokes > 0, "the Graph view drew");
        assert.ok(g.total > 0, `a real graph timeline (${g.total} ms)`);
        assert.ok((await probe(page, g.i)).running > 0, "animations are running mid-draw");
        await drop(page, g.i);
      });
      await step("390: a fresh Doodle draws in", async () => {
        const d = await mount(page, DOODLE_SRC, true);
        assert.ok(d.svg && d.strokes > 0, "the Doodle drew");
        assert.ok(d.total > 0, `a real doodle timeline (${d.total} ms)`);
        assert.ok((await probe(page, d.i)).running > 0, "animations are running mid-draw");
        await drop(page, d.i);
      });
      await step("390: a fresh ```fig graph block (graph.js data-tier) draws in", async () => {
        await page.waitForFunction(() => !!window.Graph, null, { timeout: 8000 });
        const g = await page.evaluate(async block => {
          const D = await import("/client/cluck/figures/drawin.js");
          const host = document.createElement("div"); host.className = "wtext"; host.style.cssText = "position:fixed;left:8px;top:8px;width:336px;z-index:9999;background:var(--sheet)";
          const ph = document.createElement("div"); ph.className = "fig wfig";
          host.append(ph); document.body.append(host);
          window.Graph.render(ph, block);
          const r = D.drawIn(ph, { fresh: true });
          const i = (window.__dw = window.__dw || []).push({ host, ph }) - 1;
          return { i, total: r.total, svg: !!ph.querySelector("svg"), labels: ph.querySelectorAll(".lbl").length, tiers: [...ph.querySelectorAll("svg [data-tier]")].map(e => e.getAttribute("data-tier")) };
        }, GRAPH_BLOCK);
        assert.ok(g.svg && g.labels > 0, "the block drew its axes, marks and labels");
        assert.ok(g.total > 0, `a real block timeline (${g.total} ms)`);
        for (const t of ["0", "1", "2"]) assert.ok(g.tiers.includes(t), `graph.js emitted tier ${t} (got ${[...new Set(g.tiers)].join(",")})`);
        assert.ok((await probe(page, g.i)).running > 0, "animations are running mid-draw");
        await page.waitForTimeout(g.total + 120);
        const end = await probe(page, g.i);
        assert.equal(end.inline, 0, "the block left no inline dash behind");
        assert.equal(end.running, 0, "the block's animations ended");
        await drop(page, g.i);
      });
    }
    await ctx.close();
  }
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* none */ } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/"); await page.waitForFunction(() => document.readyState === "complete", null, { timeout: 15000 });
    await step(`${w}: prefers-reduced-motion -> zero animations, the finished figure`, async () => {
      const r0 = await mount(page, SRC, true);
      assert.ok(r0.svg && r0.strokes > 6, "the figure is drawn");
      const r = await probe(page, r0.i);
      assert.equal(r.running, 0, "reduced motion runs no animation");
      assert.equal(r.offsets, 0, "reduced motion hides no stroke");
      const visible = await page.evaluate(i => { const { ph } = window.__dw[i]; const s = ph.querySelector(".vw-fig svg"); const c = ph.querySelector(".vw-fig svg circle, .vw-fig svg path"); return { svg: +getComputedStyle(s).opacity, mark: c ? +getComputedStyle(c).opacity : 1 }; }, r0.i);
      assert.equal(visible.svg, 1, "the figure is at full opacity");
      assert.equal(visible.mark, 1, "a mark is at full opacity");
      await drop(page, r0.i);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(fails ? `${fails} FAILED` : "fig-drawin smoke: all ok");
process.exit(fails ? 1 : 0);
