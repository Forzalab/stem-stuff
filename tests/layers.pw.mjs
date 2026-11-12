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
const css = read("client/answer/drill_core/app.css"), HEX = (n, hue = "sky") => new RegExp(`(?::root|:root, \\.fig, \\.vw) \\{[^}]*--fig-${hue}-${n}: (#[0-9a-f]{6})`).exec(css)[1];   // W163: a force with no colour gets a palette hue; F sorts before N, so F is sky, N amber
let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); } };
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div id="a" class="fig"></div><div id="b" class="fig"></div><div id="c" class="fig"></div></body></html>`);
await page.addScriptTag({ content: read("client/vendor/math.min.js") });
await page.addScriptTag({ content: read("client/cluck/figures/figcheck.js"), type: "module" });   // window.FigCheck (autoHues) before graph.js, as index.html orders them
await page.waitForFunction(() => window.FigCheck);
await page.addScriptTag({ content: read("client/cluck/figures/graph.js") });
const draw = (id, g) => page.evaluate(([id, g]) => { const el = document.getElementById(id); Graph.render(el, g); const f = el.querySelector('[data-mark="force"]:last-of-type') || [...el.querySelectorAll('[data-mark="force"]')].pop();
  return { html: el.innerHTML, stroke: getComputedStyle(f.querySelector("line,polyline,path")).stroke, ly: [...el.querySelectorAll("svg .ly2, svg .ly3")].map(e => e.getAttribute("class")), lbl: [...el.querySelectorAll(".lbl")].map(e => e.className) }; }, [id, g]);
await step("layer omitted = layer 1: identical drawing, no layer class, stroke is the token's own colour", async () => {
  const a = await draw("a", fig(null)), b = await draw("b", fig(1));
  assert.equal(a.html, b.html); assert.deepEqual(a.ly, []);
  assert.equal(a.stroke, rgb("#5eb8ff"));
});
await step("layer 3: the mark sits in <g class=ly3>, its stroke is --fig-c1-3, its label span takes ly3", async () => {
  const c = await draw("c", fig(3));
  assert.deepEqual(c.ly, ["ly3"]);
  assert.equal(c.stroke, rgb(HEX(3)));
  assert.ok(c.lbl.some(x => /\bly3\b/.test(x)) && c.lbl.some(x => !/\bly/.test(x)), c.lbl.join("|"));
});

// ── W163 auto-hue in graph.js ───────────────────────────────────────────────────────────────────────────────────────────────────────
const FBD = (order, extra = {}) => ({ type: "graph", kind: "scene", alt: "Free-body diagram of a block on a table.", marks: [
  { mark: "body", at: [0, 0], shape: "box", w: 2, h: 1 },
  ...order.map(l => ({ mark: "force", at: [0, 0], angle: { A: 270, B: 90, C: 180, D: 0 }[l], len: 1.6, label: `$F_${l}$`, ...(extra[l] || {}) }))] });
const probe = async (id, g) => { const r = await page.evaluate(([id, g]) => { const el = document.createElement("div"); el.className = "fig"; document.body.append(el); Graph.render(el, g);   // a fresh node per probe
  return { f: [...el.querySelectorAll('[data-mark="force"]')].map(f => ({ hue: f.dataset.hue || null, kind: f.dataset.kind, stroke: getComputedStyle(f.querySelector("line,polyline,path")).stroke })),
    lab: [...el.querySelectorAll(".lbl")].map(l => l.style.color) }; }, [id, g]);
  const names = g.marks.filter(m => m.mark === "force").map(m => m.label);   // DOM order = spec order (one layer)
  return { out: Object.fromEntries(r.f.filter(x => x.hue).map(x => [x.hue, x.stroke])), byLabel: Object.fromEntries(r.f.map((x, i) => [names[i], x.hue])), kinds: r.f.map(x => x.kind + ":" + x.hue), lab: r.lab }; };
await step("auto-hue: four forces with no colour draw four different palette hues (no orange-only), labels match their arrows", async () => {
  const r = await probe("a", FBD(["A", "B", "C", "D"]));
  assert.equal(Object.keys(r.out).length, 4, JSON.stringify(r.kinds));
  assert.equal(new Set(Object.values(r.out)).size, 4);
  for (const [h, st] of Object.entries(r.out)) assert.equal(st, rgb(HEX(1, h)), h);
  assert.equal(new Set(r.lab).size, 4, r.lab.join("|"));
});
await step("auto-hue is deterministic: the same spec twice, and the marks in another order, give the same hue per label", async () => {
  const a = await probe("a", FBD(["A", "B", "C", "D"])), b = await probe("b", FBD(["A", "B", "C", "D"])), c = await probe("c", FBD(["D", "C", "B", "A"]));
  assert.deepEqual(a.byLabel, b.byLabel); assert.equal(new Set(Object.values(a.byLabel)).size, 4);
  assert.deepEqual(a.byLabel, c.byLabel, "same label, same hue, whatever the draw order");
});
await step("auto-hue: a frame that adds a mark keeps the others' hues when the figure's key set is the same (Steps: same spec, other layer / dash state)", async () => {
  const a = await probe("a", FBD(["A", "B", "C"])), b = await probe("b", FBD(["A", "B", "C"], { C: { layer: 3 }, B: { layer: 2 } }));
  assert.deepEqual(a.byLabel, b.byLabel);
});
await step("explicit colour still wins: a palette hue, bad (red, layer 1) and a kinematic \\vec v keep what the author set", async () => {
  const r = await probe("a", FBD(["A", "B", "C"], { B: { color: "violet" }, C: { color: "bad" } }));
  assert.equal(r.out.violet, rgb(HEX(1, "violet")));
  assert.equal(r.out.bad, rgb("#eb596e"));
  assert.ok(r.kinds.some(k => /force:(sky|amber)/.test(k)), "the untouched force A still gets an auto-hue: " + r.kinds.join());
});
await step("back-compat: c1 / c2 / c3 on a force were always ignored (one colour); now they mean no opinion and join the auto-hues; c2 / c3 on a \\vec v / \\vec a keep their own look", async () => {
  const a = await probe("a", FBD(["A", "B"], { B: { color: "c2" } }));
  assert.equal(Object.keys(a.out).length, 2);
  const g = FBD(["A"]); g.marks.push({ mark: "force", at: [0, 0], angle: 0, len: 1.6, label: "$\\vec v$", color: "c2" });
  const b = await probe("b", g); assert.ok(b.kinds.some(k => /^kin:/.test(k)), b.kinds.join());
});
await browser.close();
process.exit(failures ? 1 : 0);
