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
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
