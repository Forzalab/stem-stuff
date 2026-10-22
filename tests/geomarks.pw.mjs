// Geometry marks (graph.js: right, dim, angle, circle; SCHEMA.md cartesian + scene tables): each fixture in tests/fixtures/livefig.json
// "geom" draws its own SVG element (data-mark) with finite coordinates at 360 and 1280 wide, in light and dark. No server needed:
// the page is graph.js + math.js + app.css inline.   node tests/geomarks.pw.mjs [ignored base url]
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
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);
