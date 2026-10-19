// views.css + views-lib.js as code rules (refine F2/F3/F17/F18/F19; design/STYLE.md), in the shape of tests/style.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIB } from "../views-lib.js";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
/** Declarations with their selector, comments stripped; keyframe steps count as selectors. */
function decls(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [], stack = [];
  let buf = "";
  const flush = () => {
    const d = buf.trim(), i = d.indexOf(":");
    if (i > 0 && stack.length) out.push({ sel: stack.at(-1), prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() });
  };
  for (const ch of src) {
    if (ch === "{") { stack.push(buf.trim()); buf = ""; }
    else if (ch === "}") { flush(); stack.pop(); buf = ""; }
    else if (ch === ";") { flush(); buf = ""; }
    else buf += ch;
  }
  return out;
}
const CSS = decls("views.css");
const fmt = d => `"${d.sel}" { ${d.prop}: ${d.value} }`;

test("views.css: parsed", () => assert.ok(CSS.length > 80));

test("views.css: colours are tokens only (no hex, rgb, hsl, named colours)", () => {
  const raw = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(|\b(white|black|red|green|blue|orange|yellow|gray|grey)\b/i;
  assert.deepEqual(CSS.filter(d => raw.test(d.value)).map(fmt), [], "use an app.css token (STYLE.md §2.1)");
});

test("views.css: no px literals, except the STYLE radius list and the chrome-free 1px none (borders use --bw tokens)", () => {
  const RADII = new Set(["2px", "3px", "4px", "6px", "8px", "10px", "12px", "16px"]);
  const bad = CSS.filter(d => (d.value.match(/\d*\.?\d+px\b/g) || []).some(px => !(d.prop === "border-radius" && RADII.has(px))));
  assert.deepEqual(bad.map(fmt), [], "sizes come from tokens (--s*, --btn, --ico, --bw*, --t-*) or rem");
});

test("views.css: no shadow, no gradient, no new surface fill on a view section (NO NESTED BOX)", () => {
  assert.deepEqual(CSS.filter(d => d.prop === "box-shadow" || /gradient\(/.test(d.value)).map(fmt), []);
  const surface = CSS.filter(d => /^background(-color)?$/.test(d.prop) && /vw-(callout|steps|reveal|body|lock|head|col|slot)\b/.test(d.sel));
  assert.deepEqual(surface.map(fmt), [], "a view sits on its card / sheet; sections are a rule + a tag");
});

test("views.css: two weights only; motion only through the --d-* tokens (F18: 120 / 200 / 300 ms)", () => {
  const w = v => (v.match(/^(\d{3})\b/) || [])[1];
  assert.deepEqual(CSS.filter(d => (d.prop === "font-weight" && !["400", "600", "var(--w-em)"].includes(d.value)) || (d.prop === "font" && w(d.value) && !["400", "600"].includes(w(d.value)))).map(fmt), []);
  const timed = CSS.filter(d => /^(transition|animation)/.test(d.prop) && d.value !== "none");
  assert.ok(timed.length >= 3);
  assert.deepEqual(timed.filter(d => /\d+m?s\b/.test(d.value) || !/var\(--d-(fast|move|dim)\)/.test(d.value)).map(fmt), []);
  const root = CSS.filter(d => d.sel === ".vw" && /^--d-/.test(d.prop)).map(d => `${d.prop}:${d.value}`);
  assert.deepEqual(root, ["--d-fast:120ms", "--d-move:200ms", "--d-dim:300ms"]);
});

test("views.css: every animation is opt-in under prefers-reduced-motion: no-preference", () => {
  const src = read("views.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const anim = [...src.matchAll(/animation\s*:/g)].map(m => m.index);
  const block = src.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(block > 0);
  const end = src.indexOf("@keyframes", block);
  assert.ok(anim.every(i => i > block && i < end), "an animation outside the no-preference block");
});

test("views.css: scoped to views (every selector names a .vw node), the .ai-box remap by cascade only", () => {
  const sels = [...new Set(CSS.map(d => d.sel))].filter(s => !/^(from|to|\d+%)$/.test(s));
  assert.deepEqual(sels.flatMap(s => s.split(/,(?![^(]*\))/).map(x => x.trim())).filter(x => !/\.vw\b|\.vw-/.test(x)), []);
});

const LOOK = /^(colou?r|bg|background|fill|stroke|size|width|height|icon|style|class|variant|theme|tone|look|font|weight|emphasis|accent|shadow|border|radius|align)$/i;
test("views-lib.js: no look props on any component (F3: look is CSS by cascade, never model-decided)", () => {
  const bad = Object.entries(LIB.components).flatMap(([n, c]) => Object.keys(c.props).filter(k => LOOK.test(k)).map(k => `${n}.${k}`));
  assert.deepEqual(bad, []);
});

test("views-lib.js: every string prop has a maxLength or an enum, every list a maxItems (F2/F7)", () => {
  const bad = [];
  const walk = (s, path) => {
    if (!s || s.$ref || s.anyOf) return;
    if (s.type === "string" && !s.maxLength && !s.enum) bad.push(path);
    if (s.type === "array") { if (!s.maxItems) bad.push(path); walk(s.items, `${path}[]`); }
  };
  for (const [n, c] of Object.entries(LIB.components)) for (const [k, s] of Object.entries(c.props)) walk(s, `${n}.${k}`);
  assert.deepEqual(bad, []);
});

test("views-lib.js: Predict carries no answer; the answer reaches the page only as a Reveal patch (F4/F5)", () => {
  assert.deepEqual(Object.keys(LIB.components.Predict.props).filter(k => /answer|key|correct|solution|tol/i.test(k)), []);
  assert.deepEqual(Object.keys(LIB.components.Reveal.props), ["lock", "body"]);
});
