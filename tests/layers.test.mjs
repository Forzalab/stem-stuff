// Emphasis layers (W157): figure shade steps --fig-<hue>-1|2|3 (app.css) meet the contrast + distinctness rules for every hue x step x theme,
// and the OpenUI renderer (views.js) draws `layer=` / `tone=` as classes (a mark without them is unchanged).
// WCAG 2.1 1.4.11 (strokes >= 3:1), 1.4.3 (label text >= 4.5:1), CIELAB dL* >= 12 between adjacent steps where the 4.5:1 floor leaves room.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hex, contrast, Lstar, HUES, THEMES, FLOOR, STEP, steps, mix, toHex } from "../tools/layer_steps.mjs";
import { render } from "../views.js";
import { mount, byClass, all } from "./views-dom.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const APP = read("app.css"), VIEWS = read("views.css");
/** the --fig-<hue>-2|3 hexes declared in the rule that starts with `sel` */
function declared(css, sel) {
  const i = css.indexOf(sel + " { --fig-"); assert.ok(i >= 0, sel);
  const body = css.slice(i, css.indexOf("}", i)), out = {};
  for (const m of body.matchAll(/--fig-(\w+)-([23]): (#[0-9a-f]{6});/g)) out[`${m[1]}-${m[2]}`] = m[3];
  return out;
}
const SETS = { page: declared(APP, ":root"), cluck: declared(APP, ".ai-box .fig, .cluck .fig, .ai-box .vw") };

const rows = [];
for (const [theme, t] of Object.entries(THEMES)) for (const hue of HUES) {
  const bg = hex(t.bg), s1 = hex(t[hue]), s2 = hex(SETS[theme][`${hue}-2`]), s3 = hex(SETS[theme][`${hue}-3`]);
  const L = [s1, s2, s3].map(Lstar), C = [s1, s2, s3].map(c => contrast(c, bg));
  const room = L[0] - Lstar(mix(s1, bg, 0)) , floorL = (() => { let p = 100; while (p > 0 && contrast(mix(s1, bg, p), bg) >= FLOOR) p--; return Lstar(mix(s1, bg, p + 1)); })();
  rows.push({ theme, hue, C, dL: [L[0] - L[1], L[1] - L[2]], headroom: L[0] - floorL });
}

test("layers: every hue declares step 2 and 3 in both themes (page, Cluck: figures and views alike); views.css holds no hex", () => {
  for (const theme of Object.keys(THEMES)) for (const h of HUES) for (const n of [2, 3]) assert.match(SETS[theme][`${h}-${n}`] || "", /^#[0-9a-f]{6}$/, `${theme} ${h}-${n}`);
  assert.doesNotMatch(VIEWS, /--fig-\w+-[23]: #/);
});

test("layers: every step of every hue in every theme holds label text >= 4.5:1 (1.4.3), so strokes pass 1.4.11's 3:1", () => {
  for (const r of rows) r.C.forEach((c, i) => assert.ok(c >= FLOOR - 0.005, `${r.theme} ${r.hue} step ${i + 1}: ${c.toFixed(2)}:1`));
});

test("layers: adjacent steps differ by dL* >= 12, or by the best split where the 4.5:1 floor leaves less than 2 x 12", () => {
  for (const r of rows) {
    const need = Math.min(STEP, r.headroom / 2 - 1.5);          // 1.5 dL* of integer-hex rounding slack
    r.dL.forEach((d, i) => assert.ok(d >= need, `${r.theme} ${r.hue} step ${i + 1}->${i + 2}: dL* ${d.toFixed(1)} < ${need.toFixed(1)}`));
    if (r.headroom >= 2 * STEP + 2) r.dL.forEach((d, i) => assert.ok(d >= STEP - 0.6, `${r.theme} ${r.hue} ${i + 1}->${i + 2} has room for 12: ${d.toFixed(1)}`));
  }
});

test("layers: the declared steps are the least-dim ones tools/layer_steps.mjs computes (no hand-tuned drift)", () => {
  for (const [theme, t] of Object.entries(THEMES)) for (const h of HUES) {
    const s = steps(hex(t[h]), hex(t.bg));
    assert.equal(SETS[theme][`${h}-2`], toHex(s[1]), `${theme} ${h}-2`);
    assert.equal(SETS[theme][`${h}-3`], toHex(s[2]), `${theme} ${h}-3`);
  }
});

test("layers: step 1 is the hue's own token, so a mark with no layer is unchanged", () => {
  for (const h of HUES) assert.match(APP, new RegExp(`--fig-${h}-1: var\\(--(${h}|correct|wrong|reward)\\);`));
  assert.match(APP, /\.ly2 \{ --ink: var\(--fig-ink-2\)/);
});

const geo = (marks, extra = "") => `root = View([g])\ng = Geometry("A 0,0; B 3,0; C 3,4", [${marks}]${extra})`;
const cls = el => (el.getAttribute("class") || "").split(/\s+/);
test("openui Geometry: layer=3 and tone=c2 become classes on the mark; none = no layer class", () => {
  const m = mount();
  const v = render(geo(`"seg(A,B)", "arrow(A,C,$F$,tone=c2,layer=3)", "seg(B,C,layer=2)"`), m);
  assert.deepEqual(v.errors, []);
  const segs = all(m, n => cls(n).includes("gm-seg"));
  assert.ok(!cls(segs[0]).some(c => /^ly|^tn-/.test(c)), "layer omitted = layer 1, no class");
  assert.ok(cls(segs[1]).includes("ly2"));
  const arrow = all(m, n => cls(n).includes("gm-arrow"))[0];
  assert.ok(cls(arrow).includes("ly3") && cls(arrow).includes("tn-c2"));
  assert.ok(all(m, n => n.tagName === "TEXT" && cls(n).includes("ly3")).length >= 1, "the arrow's label takes its layer");
});

test("openui Geometry: a tone outside the palette is rejected", () => {
  const m = mount();
  const v = render(geo(`"seg(A,B,tone=hotpink)"`), m);
  assert.ok(v.errors.length >= 1);
});

test("openui Graph: layer / tone props mark nodes and edges; omitted = unchanged", () => {
  const m = mount();
  const v = render(`root = View([g])\ng = Graph("A 48 100, B 160 48, C 160 150", "A-B, A-C", "", "", "A:2 A-C:3", "B:c2")`, m);
  assert.deepEqual(v.errors, []);
  const nd = all(m, n => cls(n).includes("nd"));
  assert.ok(cls(nd[0]).includes("ly2") && cls(nd[1]).includes("tn-c2") && !cls(nd[2]).some(c => /^ly/.test(c)));
  const ed = all(m, n => cls(n).includes("ed"));
  assert.ok(cls(ed[1]).includes("ly3") && !cls(ed[0]).some(c => /^ly/.test(c)));
});
