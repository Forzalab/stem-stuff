// Typed text uses Atkinson Hyperlegible Mono: every column character must have the same advance width.
// Also lists which common phone-typed math symbols fall back to another font.
// usage: node tests/font.pw.mjs http://localhost:8812
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";

const GRID = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-*/ ";
const MATH = "=<>()[]{}^_|&!~.,:;'\"%$#@?\\→←↔⇒⇔∧∨¬⊕≠≤≥±×÷·√∞πθλμσΔΣ∫∂°²³½∈∉⊂∪∩∀∃ℝ";

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
const page = await b.newPage();
await page.goto(`${BASE}/#CALC1_T6B`, { waitUntil: "networkidle" });
await page.waitForSelector("#scratch");
const r = await page.evaluate(async ({ GRID, MATH }) => {
  const els = ["#scratch", "#code", ".ff input"].map(s => document.querySelector(s)).filter(Boolean);
  const fams = els.map(e => getComputedStyle(e).fontFamily);
  await document.fonts.load('400 18px "Atkinson Hyperlegible Mono"');
  const loaded = document.fonts.check('400 18px "Atkinson Hyperlegible Mono"');
  const c = document.createElement("canvas").getContext("2d");
  const w = (ch, fam) => { c.font = `400 40px ${fam}`; return c.measureText(ch).width; };
  const mono = '"Atkinson Hyperlegible Mono"';
  const widths = [...GRID].map(ch => [ch, w(ch, mono + ", monospace")]);
  // a glyph missing from the mono font falls back: its width then depends on the fallback stack
  const fallback = [...MATH].filter(ch => w(ch, mono + ", serif") !== w(ch, mono + ", monospace"));
  return { fams, loaded, widths, fallback };
}, { GRID, MATH });
await b.close();

assert.ok(r.loaded, "Atkinson Hyperlegible Mono did not load");
for (const f of r.fams) assert.match(f, /Atkinson Hyperlegible Mono/, f);
const ws = new Set(r.widths.map(([, v]) => v.toFixed(3)));
assert.equal(ws.size, 1, "unequal advance widths: " + JSON.stringify(r.widths.filter(([, v]) => v.toFixed(3) !== r.widths[0][1].toFixed(3))));
console.log(`ok: ${r.widths.length} chars, one advance width (${r.widths[0][1].toFixed(2)}px at 40px)`);
console.log(`fallback (not in the mono font): ${r.fallback.join(" ") || "none"}`);
