// Geometry marks (graph.js: right, dim, angle, circle; SCHEMA.md cartesian + scene tables): each fixture in tests/fixtures/livefig.json
// "geom" draws its own SVG element (data-mark) with finite coordinates at 360 and 1280 wide, in light and dark. No server needed:
// the page is graph.js + math.js + app.css inline.   node tests/geomarks.pw.mjs [ignored base url]
// Contact (fable audit 2026-10-29 U1, I-INC-1): the physics-b figure (livefig.json valid[0]) and the planted sunk / floating ramps at
// 1440 and 390 on chromium, firefox and webkit: the drawn block never cuts into the drawn ramp and touches it (SAT on getScreenCTM
// points, <= 1 px). Chromium is required; a missing firefox / webkit prints NOT COVERED (run-all lists it).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/livefig.json"), "utf8"));
const read = p => readFileSync(join(ROOT, p), "utf8");
const MARKS = ["right", "dim", "angle", "circle"];

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}

const browser = await pw.chromium.launch();
for (const width of [360, 1280]) for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => m.type() === "warning" && errs.push(m.text()));
  await page.setContent(`<!doctype html><html><head><style>${read("app.css")}</style></head><body><div id="f0" class="fig"></div><div id="f1" class="fig"></div></body></html>`);
  await page.addScriptTag({ content: read("vendor/math.min.js") });
  await page.addScriptTag({ content: read("graph.js") });
  for (const [i, g] of FIX.geom.valid.entries()) {
    await step(`${g.kind} geometry marks at ${width} ${scheme}`, async () => {
      const r = await page.evaluate(([i, g, marks]) => {
        const el = document.getElementById("f" + i);
        Graph.render(el, g);
        const svg = el.querySelector("svg"), out = {};
        for (const m of marks) {
          const e = svg && svg.querySelector(`[data-mark="${m}"]`);
          const b = e && e.getBBox();
          out[m] = e ? { tag: e.tagName, w: b.width, h: b.height, html: e.outerHTML.slice(0, 200), stroke: getComputedStyle(e.tagName === "g" ? e.firstElementChild : e).stroke } : null;
        }
        return { out, svgW: svg && +svg.getAttribute("width"), labels: el.querySelectorAll(".lbl").length };
      }, [i, g, MARKS]);
      assert.ok(r.svgW > 0 && r.svgW <= width, `svg width ${r.svgW}`);
      for (const m of MARKS) {
        const x = r.out[m];
        assert.ok(x, `${m}: no SVG element`);
        assert.ok(!/NaN|Infinity/.test(x.html), `${m}: non-finite coords ${x.html}`);
        assert.ok(x.w > 0 || x.h > 0, `${m}: empty box`);
        assert.ok(x.stroke && x.stroke !== "none", `${m}: no stroke color (${x.stroke})`);
      }
      assert.equal(r.labels, g.marks.filter(m => m.label).length, "every label drawn");
      assert.deepEqual(errs, []);
    });
  }
  await page.close();
}
await browser.close();

/* SAT on two convex polygons in screen px: > 0 = the gap between them, < 0 = how deep they cut into each other */
function separation(A, B) {
  let best = -Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L > 1e-9)) continue;
    const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], pr = Q => Q.map(p => p[0] * n[0] + p[1] * n[1]);
    const pa = pr(A), pb = pr(B);
    best = Math.max(best, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
  }
  return best;
}
const RAMPS = [{ name: "physics-b (valid[0])", fig: FIX.valid[0] },
  ...FIX.contact.cases.filter(c => c.fig.marks.some(m => m.mark === "incline") && c.fig.marks.some(m => m.shape === "box") && c.codes.includes("contact"))];
for (const [label, type] of [["chromium", pw.chromium], ["firefox", pw.firefox], ["webkit", pw.webkit]]) {
  let b;
  try { b = await type.launch(); }
  catch (e) {
    if (label === "chromium") { failures++; console.log("FAIL chromium: no browser", e.message.split("\n")[0]); continue; }
    console.log(`NOT COVERED ${label}: no browser (${e.message.split("\n")[0]})`); continue;
  }
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await b.newPage({ viewport: { width, height }, colorScheme: "dark" });
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    await page.setContent(`<!doctype html><html><head><style>${read("app.css")}</style></head><body><div id="f" class="fig"></div></body></html>`);
    await page.addScriptTag({ content: read("vendor/math.min.js") });
    await page.addScriptTag({ content: read("graph.js") });
    for (const c of RAMPS) {
      await step(`block rests on the ramp, ${c.name}, ${label} ${width}`, async () => {
        const r = await page.evaluate(g => {
          const el = document.getElementById("f"); el._g = null; el.innerHTML = "";
          Graph.render(el, g);
          const svg = el.querySelector("svg"), pt = svg.createSVGPoint();
          const scr = (e, xs) => { const m = e.getScreenCTM(); return xs.map(([x, y]) => { pt.x = x; pt.y = y; const q = pt.matrixTransform(m); return [q.x, q.y]; }); };
          const ramp = svg.querySelector('[data-mark="incline"]'), box = svg.querySelector('rect[data-mark="body"]');
          if (!ramp || !box) return null;
          const v = ramp.getAttribute("points").trim().split(/\s+/).map(p => p.split(",").map(Number));
          const x = +box.getAttribute("x"), y = +box.getAttribute("y"), w = +box.getAttribute("width"), h = +box.getAttribute("height");
          return { ramp: scr(ramp, v), box: scr(box, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) };
        }, c.fig);
        assert.ok(r, "no incline polygon / body rect drawn");
        const sep = separation(r.ramp, r.box);
        assert.ok(sep >= -0.5, `the block cuts ${(-sep).toFixed(2)} px into the ramp`);
        assert.ok(sep <= 1, `the block floats ${sep.toFixed(2)} px over the ramp`);
        assert.deepEqual(errs, []);
      });
    }
    await page.close();
  }
  await b.close();
}
/* Labels (fable audit 2026-10-29 U3, I-LBL-1/2): graph.js mount() and views.js Geometry place every label with figcheck.js place():
   no two labels overlap, none crosses a stroke unless the placer knocked it out (class knock), all inside the svg; physics-b's labels
   cross no stroke at all (mg vs the ramp hatching). graph.js render() leaves figcheck's finding codes on the figure (data-fig-findings).
   Real page assets (KaTeX, math.js, figcheck.js as a module, graph.js, views.js) served from the repo by a route. */
const TIP = { type: "graph", kind: "scene", alt: "two forces at one tip", marks: [
  { mark: "body", at: [0, 0], shape: "box", w: 1, h: 0.6 },
  { mark: "force", at: [0, 0], angle: 90, len: 1.2, label: "$T_1$" },
  { mark: "force", at: [0, 0], angle: 90, len: 1.2, label: "$T_2$", color: "c2" },
  { mark: "force", at: [0, 0], angle: 0, len: 1.2, label: "$F$" }] };
const CLASH = { type: "graph", kind: "scene", alt: "two boxes in each other", marks: [
  { mark: "body", at: [0, 3], shape: "box", w: 1, h: 1 }, { mark: "body", at: [0.5, 3.2], shape: "box", w: 1, h: 1 }] };
const GEO = [
  ["crowded right triangle", 'root = View([g])\ng = Geometry("A 0,0; B 4,0; C 0,3; M 2,0", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(A,B,C)", "angle(B,A,C,90°)", "angle(A,B,C,$\\\\theta$)", "dim(A,B,4 m)", "dim(A,C,3 m)", "arrow(A,M,F)", "label(A,origin)"], "A crowded right triangle.")'],
  ["ramp (views-static)", 'root = View([ramp])\nramp = Geometry("A 0,0; B 4,0; C 4,2.3; P 2,1.15", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "angle(A,B,C,30°)", "dim(A,C,1.2 m)", "arrow(P,C,push)"], "The ramp at 30 degrees, the push up it.")'],
];
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="views.css"><link rel="stylesheet" href="vendor/katex/katex.min.css"><style>body{padding:16px;max-width:720px;margin:auto}</style></head>
<body class="ai-box"><div id="f" class="fig"></div><div id="v" class="vw"></div>
<script src="vendor/katex/katex.min.js"></script><script src="vendor/math.min.js"></script><script type="module" src="figcheck.js"></script><script src="graph.js" defer></script></body></html>`;
/* in the page: every label box (screen px) of a root, every stroke segment of its svg, and what collides */
function audit(root, sel) {
  const svg = root.querySelector("svg"), pt = svg.createSVGPoint(), segs = [];
  for (const e of svg.querySelectorAll("line, polyline, polygon, path, rect, circle")) {
    if (e.closest("defs") || getComputedStyle(e).stroke === "none" && getComputedStyle(e).fill === "none") continue;
    const m = e.getScreenCTM(), T = ([x, y]) => { pt.x = x; pt.y = y; const q = pt.matrixTransform(m); return [q.x, q.y]; };
    let P = [];
    if (e.tagName === "line") P = [[+e.getAttribute("x1"), +e.getAttribute("y1")], [+e.getAttribute("x2"), +e.getAttribute("y2")]];
    else if (e.tagName === "polyline" || e.tagName === "polygon") { P = e.getAttribute("points").trim().split(/\s+/).map(p => p.split(",").map(Number)); if (e.tagName === "polygon") P.push(P[0]); }
    else if (e.tagName === "rect") { const x = +e.getAttribute("x"), y = +e.getAttribute("y"), w = +e.getAttribute("width"), h = +e.getAttribute("height"); P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]; }
    else { const L = e.getTotalLength(); for (let i = 0; i <= 32; i++) { const q = e.getPointAtLength(L * i / 32); P.push([q.x, q.y]); } }
    const what = e.tagName + (e.getAttribute("class") ? "." + e.getAttribute("class").split(" ").join(".") : "") + (e.closest("[data-mark]") ? `[${e.closest("[data-mark]").dataset.mark}]` : "");
    for (let i = 0; i + 1 < P.length; i++) segs.push({ what, a: T(P[i]), b: T(P[i + 1]) });
  }
  const hits = (s, q) => {                                   // Liang-Barsky on the box shrunk 1 px (a stroke grazing the edge is fine)
    const x0 = q.x + 1, y0 = q.y + 1, x1 = q.x + q.w - 1, y1 = q.y + q.h - 1, dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    let t0 = 0, t1 = 1;
    for (const [p, v] of [[-dx, s.a[0] - x0], [dx, x1 - s.a[0]], [-dy, s.a[1] - y0], [dy, y1 - s.a[1]]]) {
      if (p === 0) { if (v < 0) return false; continue; }
      const r = v / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9;
  };
  const L = [...root.querySelectorAll(sel)].map(e => { const q = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 12), knock: e.classList.contains("knock"), x: q.x, y: q.y, w: q.width, h: q.height }; });
  const R = svg.getBoundingClientRect(), out = { n: L.length, pairs: [], strokes: [], unknocked: [], outside: [] };
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      const ow = Math.min(L[i].x + L[i].w, L[j].x + L[j].w) - Math.max(L[i].x, L[j].x), oh = Math.min(L[i].y + L[i].h, L[j].y + L[j].h) - Math.max(L[i].y, L[j].y);
      if (ow > 0.5 && oh > 0.5) out.pairs.push(`${L[i].t} x ${L[j].t} (${ow.toFixed(1)} x ${oh.toFixed(1)} px)`);
    }
    const on = [...new Set(segs.filter(s => hits(s, L[i])).map(s => s.what))];
    if (on.length) { out.strokes.push(`${L[i].t} on ${on.join(", ")}`); if (!L[i].knock) out.unknocked.push(`${L[i].t} on ${on.join(", ")}`); }
    if (L[i].x < R.x - 0.5 || L[i].y < R.y - 0.5 || L[i].x + L[i].w > R.right + 0.5 || L[i].y + L[i].h > R.bottom + 0.5) out.outside.push(L[i].t);
  }
  return out;
}
for (const [label, type] of [["chromium", pw.chromium], ["firefox", pw.firefox], ["webkit", pw.webkit]]) {
  let b;
  try { b = await type.launch(); }
  catch (e) {
    if (label === "chromium") { failures++; console.log("FAIL chromium: no browser", e.message.split("\n")[0]); continue; }
    console.log(`NOT COVERED ${label}: no browser (${e.message.split("\n")[0]})`); continue;
  }
  for (const [width, height] of [[1440, 900], [390, 844], [360, 800]]) {
    const page = await b.newPage({ viewport: { width, height }, colorScheme: "dark" });
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    await page.route("http://geo.test/**", r => {
      const p = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      if (p === "page.html") return r.fulfill({ contentType: "text/html", body: PAGE });
      let body; try { body = readFileSync(join(ROOT, p)); } catch { return r.fulfill({ status: 404 }); }
      return r.fulfill({ body, contentType: TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream" });
    });
    await page.goto("http://geo.test/page.html");
    await page.waitForFunction(() => window.Graph && window.FigCheck && window.katex);
    const fig = (g, sel = ".lbl") => page.evaluate(([g, sel, src]) => {
      const el = document.getElementById("f"); el._g = null; el.innerHTML = ""; delete el.dataset.figFindings;
      Graph.render(el, g);
      return { ...new Function("return " + src)()(el, sel), findings: el.dataset.figFindings ?? null };
    }, [g, sel, audit.toString()]);
    await step(`labels: physics-b, no overlap, no label on a stroke (mg vs the ramp hatching), inside, ${label} ${width}`, async () => {
      const r = await fig(FIX.valid[0]);
      assert.equal(r.n, 4, "four force labels");
      assert.deepEqual(r.pairs, [], "labels overlap"); assert.deepEqual(r.strokes, [], "labels on strokes"); assert.deepEqual(r.outside, [], "labels outside the svg");
      assert.equal(r.findings, "", "figcheck: physics-b after Graph.fix has no findings");
    });
    await step(`labels: two force labels at one tip, apart, ${label} ${width}`, async () => {
      const r = await fig(TIP);
      assert.equal(r.n, 3);
      assert.deepEqual(r.pairs, [], "labels overlap"); assert.deepEqual(r.unknocked, [], "a label on a stroke without a knockout"); assert.deepEqual(r.outside, []);
    });
    await step(`figcheck findings on the figure: codes only (two boxes in each other -> I-BODY-1), ${label} ${width}`, async () => {
      const r = await fig(CLASH);
      assert.match(r.findings || "", /^I-[A-Z]+-\d+( I-[A-Z]+-\d+)*$/, "codes only, space separated");
      assert.ok(r.findings.split(" ").includes("I-BODY-1"), r.findings);
    });
    for (const [name, prog] of GEO) {
      await step(`labels: Geometry ${name}, no overlap, none on a stroke without a knockout, inside, ${label} ${width}`, async () => {
        const r = await page.evaluate(async ([prog, src]) => {
          const V = await import("/views.js"), v = document.getElementById("v"); v.innerHTML = "";
          const h = V.render(prog, v, { document });
          return { errors: h.errors.map(e => String(e.code || e.message || e)), ...new Function("return " + src)()(v, "text") };
        }, [prog, audit.toString()]);
        assert.deepEqual(r.errors, []);
        assert.ok(r.n >= 7, `${r.n} texts`);
        assert.deepEqual(r.pairs, [], "labels overlap"); assert.deepEqual(r.unknocked, [], "a label on a stroke without a knockout"); assert.deepEqual(r.outside, [], "labels outside the svg");
      });
    }
    await step(`no page errors, ${label} ${width}`, async () => assert.deepEqual(errs, []));
    await page.close();
  }
  await b.close();
}

console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
