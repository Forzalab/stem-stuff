// Emphasis layers in graph.js (W157): a ```fig mark with "layer": 3 draws inside <g class="ly3"> and its stroke computes to the step-3 colour
// of its hue (app.css --fig-<hue>-3); "layer" omitted (or 1) draws byte-identical to before. No server: graph.js + math.js + app.css inline.
//   node tests/layers.pw.mjs
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
const fig = layer => ({ type: "graph", kind: "scene", alt: "A block on a table with two forces on it.", marks: [
  { mark: "body", at: [0, 0], shape: "box", w: 2, h: 1 },
  { mark: "force", at: [0, 0], angle: 90, len: 2, label: "$N$" },
  { mark: "force", at: [0, 0], angle: 0, len: 2, label: "$F$", ...(layer == null ? {} : { layer }) }] });
const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;
const css = read("app.css"), HEX = n => new RegExp(`:root \\{[^}]*--fig-c1-${n}: (#[0-9a-f]{6})`).exec(css)[1];
let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); } };
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div id="a" class="fig"></div><div id="b" class="fig"></div><div id="c" class="fig"></div></body></html>`);
await page.addScriptTag({ content: read("vendor/math.min.js") });
await page.addScriptTag({ content: read("graph.js") });
const draw = (id, g) => page.evaluate(([id, g]) => { const el = document.getElementById(id); Graph.render(el, g); const f = el.querySelector('[data-mark="force"]:last-of-type') || [...el.querySelectorAll('[data-mark="force"]')].pop();
  return { html: el.innerHTML, stroke: getComputedStyle(f.querySelector("line,polyline,path")).stroke, ly: [...el.querySelectorAll("svg .ly2, svg .ly3")].map(e => e.getAttribute("class")), lbl: [...el.querySelectorAll(".lbl")].map(e => e.className) }; }, [id, g]);
await step("layer omitted = layer 1: identical drawing, no layer class, stroke is the token's own colour", async () => {
  const a = await draw("a", fig(null)), b = await draw("b", fig(1));
  assert.equal(a.html, b.html); assert.deepEqual(a.ly, []);
  assert.equal(a.stroke, rgb("#92c0ff"));
});
await step("layer 3: the mark sits in <g class=ly3>, its stroke is --fig-c1-3, its label span takes ly3", async () => {
  const c = await draw("c", fig(3));
  assert.deepEqual(c.ly, ["ly3"]);
  assert.equal(c.stroke, rgb(HEX(3)));
  assert.ok(c.lbl.some(x => /\bly3\b/.test(x)) && c.lbl.some(x => !/\bly/.test(x)), c.lbl.join("|"));
});
await browser.close();
process.exit(failures ? 1 : 0);
