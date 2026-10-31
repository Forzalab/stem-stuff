// Axis cross on phones (todo 136): a scene's x / y / z cross (two arrows from one tail + a small circle there for z, each with a one-letter
// label; or the `axes` mark) must stay readable at phone widths, where the 28svh cap shrinks the figure (graph.js render()). The renderer
// owns it, not the fixture: at 360 / 390 / 414 the drawn arrows are >= 24 CSS px, each axis label sits beyond its own arrow tip (>= 3 px
// along the arrow), no cross label overlaps another label, the origin marker or a mass, and the z marker (circle + dot) is >= 10 px wide.
// Synthetic fixtures only (public repo). No server: the page is app.css + KaTeX + math.js + figcheck.js + graph.js inline, the figure in
// a card-wide box.   node tests/axis-cross.pw.mjs [ignored base url]      SHOTS=<dir> also saves a png per size (and 1440).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(ROOT, p), "utf8");
const SHOTS = process.env.SHOTS || "";

/* a synthetic centre-of-gravity rectangle: half-edges 4 x 8, masses at the corners, the cross at the centre (arrows 0.45 of the half-width) */
const A = 4, B = 8, L = 1.8;
const CROSS = { type: "graph", kind: "scene", alt: "Four point masses at the corners of a rectangle, an x y z axis cross at its centre.",
  marks: [
    { mark: "seg", from: [-A, B], to: [A, B] }, { mark: "seg", from: [A, B], to: [A, -B] }, { mark: "seg", from: [A, -B], to: [-A, -B] }, { mark: "seg", from: [-A, -B], to: [-A, B] },
    { mark: "arrow", from: [0, 0], to: [L, 0] }, { mark: "arrow", from: [0, 0], to: [0, L] }, { mark: "circle", c: [0, 0], r: 0.22 },
    { mark: "text", at: [1.22 * L, 0], text: "$x$", anchor: "c" }, { mark: "text", at: [0, 1.22 * L], text: "$y$", anchor: "c" }, { mark: "text", at: [-0.3 * L, -0.3 * L], text: "$z$", anchor: "c" },
    { mark: "body", shape: "dot", at: [-A, B], r: 0.36, fill: true, label: "$m_P=1.5$", anchor: "nw" }, { mark: "body", shape: "dot", at: [A, B], r: 0.36, fill: true, label: "$m_Q=2.5$", anchor: "ne" },
    { mark: "body", shape: "dot", at: [-A, -B], r: 0.36, fill: true, label: "$m_R=3.5$", anchor: "sw" }, { mark: "body", shape: "dot", at: [A, -B], r: 0.36, fill: true, label: "$m_S=0.5$", anchor: "se" },
    { mark: "dim", from: [-A, -B], to: [A, -B], label: "$2a$", side: "r" }, { mark: "dim", from: [-A, -B], to: [-A, B], label: "$2b$", side: "l" }
  ] };
/* the other drawing path: the `axes` mark (x / y labels), in a tall scene so it comes out small */
const AXES = { type: "graph", kind: "scene", alt: "A tall bar with a small x y axis mark at its foot.",
  marks: [
    { mark: "body", shape: "box", at: [0, 6], w: 2, h: 12 },
    { mark: "axes", at: [2.5, 0], len: 1, x: "$x$", y: "$y$" }
  ] };

const SIZES = [[360, 800], [390, 844], [414, 896]];
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}

/* in the page: the cross's tail, its arrows (tail -> wedge tip), its labels and the other boxes, in px relative to the svg */
function measure(id) {
  const el = document.getElementById(id), svg = el.querySelector("svg"), o = svg.getBoundingClientRect();
  const rel = r => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });
  const pts = p => p.getAttribute("points").trim().split(/\s+/).map(s => s.split(",").map(Number));
  const wedges = [...svg.querySelectorAll("polygon")].map(pts).filter(p => p.length === 3);
  const labels = [...el.querySelectorAll(".lbl")].map(sp => ({ t: (sp.querySelector("annotation")?.textContent || sp.textContent).trim(), ...rel(sp.getBoundingClientRect()) }));
  const masses = [...svg.querySelectorAll('circle[data-mark="body"]')].map(c => rel(c.getBoundingClientRect()));
  const ring = [...svg.querySelectorAll('[data-mark="circle"], [data-mark="axis-z"]')].map(c => rel(c.getBoundingClientRect())).sort((a, b) => b.w - a.w)[0] || null;
  return { wedges, labels, masses, ring, W: +svg.getAttribute("width"), H: +svg.getAttribute("height") };
}

function analyse(m, origin, names) {
  /* the two arrows whose wedge tips are nearest the tail are the cross's; tip = the wedge point farthest from the tail */
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const arrows = m.wedges.map(w => { const tip = w.reduce((a, p) => d(p, origin) > d(a, origin) ? p : a); return { tip, len: d(tip, origin) }; })
    .sort((a, b) => a.len - b.len).slice(0, 2)
    .map(a => ({ ...a, u: [(a.tip[0] - origin[0]) / a.len, (a.tip[1] - origin[1]) / a.len] }));
  const lab = t => m.labels.find(l => l.t === t);
  const out = { arrows: arrows.map(a => +a.len.toFixed(1)), gaps: {}, labels: {} };
  for (const [i, t] of names.entries()) {
    const l = lab(t); if (!l) { out.gaps[t] = null; continue; }
    out.labels[t] = l;
    /* the arrow this label names: x = the more horizontal one, y = the more vertical */
    const a = arrows.slice().sort((p, q) => i === 0 ? Math.abs(q.u[0]) - Math.abs(p.u[0]) : Math.abs(q.u[1]) - Math.abs(p.u[1]))[0];
    const corners = [[l.x, l.y], [l.x + l.w, l.y], [l.x, l.y + l.h], [l.x + l.w, l.y + l.h]];
    const tipP = a.tip[0] * a.u[0] + a.tip[1] * a.u[1];
    out.gaps[t] = +(Math.min(...corners.map(c => c[0] * a.u[0] + c[1] * a.u[1])) - tipP).toFixed(1);
  }
  return out;
}
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const browser = await pw.chromium.launch();
const report = [];
for (const [w, h] of [...SIZES, [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  /* the question card: ~24 px each side on a phone, a 720 px column on desktop */
  await page.setContent(`<!doctype html><html><head><style>${read("app.css")}${read("vendor/katex/katex.min.css").replace(/url\([^)]*\)/g, "none")}</style>
    <style>body{margin:0;background:#fff}.card{box-sizing:border-box;width:min(720px,100%);margin:0 auto;padding:12px 24px}</style></head>
    <body><div class="card"><div id="c" class="fig"></div><div id="a" class="fig"></div></div></body></html>`);
  await page.addScriptTag({ content: read("vendor/katex/katex.min.js") });
  await page.addScriptTag({ content: read("vendor/math.min.js") });
  await page.addScriptTag({ type: "module", content: read("figcheck.js") });
  await page.waitForFunction(() => !!window.FigCheck);
  await page.addScriptTag({ content: read("graph.js") });
  const thrown = await page.evaluate(([c, a]) => [["c", c], ["a", a]].map(([id, g]) => { try { Graph.render(document.getElementById(id), g); return ""; } catch (e) { return id + ": " + e.message; } }).filter(Boolean), [CROSS, AXES]);
  errs.push(...thrown);
  const safe = id => page.evaluate(measure, id).catch(() => ({ wedges: [], labels: [], masses: [], ring: null, W: 0, H: 0 }));
  const mc = await safe("c"), ma = await safe("a");
  if (SHOTS) await page.locator(".card").screenshot({ path: join(SHOTS, `cross-${w}.png`) });
  const origin = mc.ring ? [mc.ring.x + mc.ring.w / 2, mc.ring.y + mc.ring.h / 2] : [mc.W / 2, mc.H / 2];
  const rc = analyse(mc, origin, ["x", "y"]);
  /* the axes mark's tail: the corner where its two arrows' tails meet = the point both wedge axes pass nearest; use the tips' x / y */
  const tw = ma.wedges.map(p => p.reduce((s, q) => [s[0] + q[0] / 3, s[1] + q[1] / 3], [0, 0]));
  const aOrigin = tw.length >= 2 ? [Math.min(...tw.map(p => p[0])), Math.max(...tw.map(p => p[1]))] : [0, 0];
  const ra = analyse(ma, [Math.round(aOrigin[0]), Math.round(aOrigin[1])], ["x", "y"]);
  const z = mc.labels.find(l => l.t === "z");
  report.push({ w, cross: { arrows: rc.arrows, gaps: rc.gaps, ring: mc.ring && +mc.ring.w.toFixed(1), z: z && { x: +z.x.toFixed(1), y: +z.y.toFixed(1) } }, axes: { arrows: ra.arrows, gaps: ra.gaps } });
  if (w > 600) { await page.close(); continue; }
  await step(`cross at ${w}: arrows >= 24 px, labels beyond the tips, z marker >= 10 px, nothing overlaps`, async () => {
    for (const len of rc.arrows) assert.ok(len >= 24, `arrow ${len} px < 24 (${JSON.stringify(rc.arrows)})`);
    for (const t of ["x", "y"]) assert.ok(rc.gaps[t] !== null && rc.gaps[t] >= 3, `label ${t} gap past its tip ${rc.gaps[t]} px < 3`);
    assert.ok(mc.ring && mc.ring.w >= 10, `z marker ${mc.ring && mc.ring.w} px < 10`);
    assert.ok(z, "z label drawn");
    const mine = ["x", "y", "z"].map(t => mc.labels.find(l => l.t === t));
    for (const l of mine) {
      for (const o of mc.labels) if (o !== l) assert.ok(!hit(l, o), `label ${l.t} overlaps label ${o.t}`);
      assert.ok(!hit(l, mc.ring), `label ${l.t} overlaps the origin marker`);
      for (const ms of mc.masses) assert.ok(!hit(l, ms), `label ${l.t} overlaps a mass`);
    }
    assert.deepEqual(errs.filter(e => e.startsWith("c")), []);
  });
  await step(`axes mark at ${w}: draws with its x / y labels, arrows >= 24 px, labels beyond the tips`, async () => {
    assert.deepEqual(errs.filter(e => e.startsWith("a")), [], "the axes mark threw");
    for (const len of ra.arrows) assert.ok(len >= 24, `arrow ${len} px < 24 (${JSON.stringify(ra.arrows)})`);
    for (const t of ["x", "y"]) assert.ok(ra.gaps[t] !== null && ra.gaps[t] >= 3, `label ${t} gap past its tip ${ra.gaps[t]} px < 3`);
    const [lx, ly] = ["x", "y"].map(t => ma.labels.find(l => l.t === t));
    assert.ok(!hit(lx, ly), "x and y labels overlap");
  });
  await page.close();
}
await browser.close();
console.log("measured", JSON.stringify(report));
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("axis-cross: all ok");
