// Live figures (livefig.py): the server's own JSON Schema reader must agree with Ajv on SCHEMA.md's graph block.
// Every fixture livefig.py accepts is a valid SCHEMA graph block; every one it rejects as "schema" fails Ajv too.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { schema, root } from "./schemas.mjs";

const FIX = JSON.parse(readFileSync(new URL("tests/fixtures/livefig.json", root), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
ajv.addSchema(schema("problems"), "problems");
const graph = ajv.getSchema("problems#/$defs/graph");

test("live figure fixtures: the valid ones are SCHEMA graph blocks", () => {
  for (const g of [...FIX.valid, FIX.network.valid]) assert.ok(graph(g), `${g.kind}: ${ajv.errorsText(graph.errors)}`);
});

test("live figure fixtures: the schema rejects fail Ajv too", () => {
  for (const c of FIX.invalid.filter(c => c.why === "schema")) assert.equal(graph(c.fig), false, c.name);
});

test("geometry marks (right, dim, angle, circle): the valid fixtures are SCHEMA graph blocks, the schema rejects fail Ajv", () => {
  for (const g of FIX.geom.valid) assert.ok(graph(g), `${g.kind}: ${ajv.errorsText(graph.errors)}`);
  const bad = FIX.geom.invalid.filter(c => c.why === "schema");
  assert.equal(bad.length, 4);
  for (const c of bad) assert.equal(graph(c.fig), false, c.name);
});

// I-INC-1/2, I-FORCE-1/2/3 (fable audit 2026-10-29, U1): graph.js fixes a scene's model before it draws (Graph.fix, no DOM).
// A body near a ramp/surface is drawn resting on it, forces start on their body, weight points down, normal and friction sit on the
// surface axes. tests/fixtures/livefig.json "contact": planted cases with the codes the pre-pass (and livefig.check) report.
import vm from "node:vm";
const W = {}; W.window = W;
vm.runInNewContext(readFileSync(new URL("graph.js", root), "utf8"), W);
const D = Math.PI / 180, G = { fix: m => JSON.parse(JSON.stringify(W.Graph.fix(m))) };   // out of the vm realm: plain arrays for deepEqual
const surfaces = marks => marks.flatMap(m => {
  if (m.mark === "incline") { const sx = m.flip ? -1 : 1, top = [m.at[0] + sx * m.base, m.at[1] + m.base * Math.tan(m.angle * D)]; return [[m.at, top]]; }
  return m.mark === "surface" || (m.mark === "seg" && !m.dash) ? [[m.from, m.to]] : [];
});
const lineDist = (p, [a, b]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L; };
const slope = ([a, b]) => { let t = Math.atan2(b[1] - a[1], b[0] - a[0]) / D; if (t > 90) t -= 180; if (t <= -90) t += 180; return t; };
const corners = b => { const a = (b.angle || 0) * D, c = Math.cos(a), s = Math.sin(a);
  return [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2]].map(([x, y]) => [b.at[0] + x * c - y * s, b.at[1] + x * s + y * c]); };
const dirOf = f => (((f.angle + (f.frame || 0)) % 360) + 360) % 360;
const C = FIX.contact.cases;

test("contact pre-pass: a sunk or floating block is drawn with its bottom edge on the ramp, at the ramp's angle", () => {
  for (const c of C.filter(c => c.codes.includes("contact"))) {
    const { marks } = G.fix(structuredClone(c.fig.marks));
    const body = marks.find(m => m.mark === "body"), surf = surfaces(marks).sort((p, q) => lineDist(body.at, p) - lineDist(body.at, q))[0];
    const h = body.shape === "box" ? body.h : 2 * body.r;
    assert.ok(Math.abs(lineDist(body.at, surf) - h / 2) <= 0.02 * h, `${c.name}: centre ${lineDist(body.at, surf)} off the surface, want ${h / 2}`);
    if (body.shape === "box") {
      assert.ok(Math.abs(body.angle - slope(surf)) < 1e-9, `${c.name}: angle ${body.angle} on a ${slope(surf)} surface`);
      for (const p of corners(body)) assert.ok(lineDist(p, surf) <= 0.02 * h, `${c.name}: bottom corner ${p} is ${lineDist(p, surf)} off`);
    }
    for (const f of marks.filter(m => m.mark === "force")) assert.deepEqual(f.at, body.at, `${c.name}: ${f.label} left behind`);
  }
});

test("contact pre-pass: the codes per planted case; a body far from any surface and the resting fixtures never move", () => {
  for (const c of C) assert.deepEqual(G.fix(structuredClone(c.fig.marks)).codes, c.codes, c.name);
  const far = C.find(c => !c.codes.length).fig.marks;
  assert.deepEqual(G.fix(structuredClone(far)).marks, far);
  for (const g of [FIX.valid[0], FIX.geom.valid[1]]) {
    const r = G.fix(structuredClone(g.marks));
    assert.deepEqual(r.codes, [], g.alt);
    r.marks.forEach((m, i) => { if (m.at) assert.ok(Math.hypot(m.at[0] - g.marks[i].at[0], m.at[1] - g.marks[i].at[1]) < 2e-3, `${g.alt}: ${m.mark} moved`); });
  }
});

test("anchor + direction: weight re-anchored to its block and straight down; normal and friction on the ramp axes; an unnamed push untouched", () => {
  const c = C.find(c => c.codes.includes("anchor")), { marks } = G.fix(structuredClone(c.fig.marks));
  const body = marks.find(m => m.mark === "body"), f = l => marks.find(m => m.label === l);
  assert.deepEqual(f("$mg$").at, body.at);
  assert.ok(Math.abs(dirOf(f("$mg$")) - 270) < 1e-9);
  assert.ok(Math.abs(dirOf(f("$F_N$")) - 120) < 1e-9, `normal ${dirOf(f("$F_N$"))}`);
  assert.ok(Math.abs(dirOf(f("$f_k$")) - 210) < 1e-9, `friction ${dirOf(f("$f_k$"))}`);
  assert.equal(dirOf(f("$F$")), 45);
  const disk = G.fix(structuredClone(C.find(c => c.fig.marks.some(m => m.shape === "disk")).fig.marks)).marks;
  assert.ok(Math.abs(dirOf(disk.find(m => m.label === "$N$")) - 90) < 1e-9);
});

test("contact pre-pass: the bank's hand-drawn ramps (PHYS_F3N, PHYS_S2K) come out with no finding and no visible change", () => {
  const bank = JSON.parse(readFileSync(new URL("problems.json", root), "utf8")).problems;
  const scenes = [];
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (v.type === "graph" && v.kind === "scene") scenes.push(v); Object.values(v).forEach(walk); } };
  walk(bank);
  assert.ok(scenes.length >= 2);
  for (const g of scenes) {
    const r = G.fix(structuredClone(g.marks));
    assert.deepEqual(r.codes, [], g.alt);
    r.marks.forEach((m, i) => { for (const k of ["at", "from", "to"]) if (m[k]) assert.ok(Math.hypot(m[k][0] - g.marks[i][k][0], m[k][1] - g.marks[i][k][1]) < 2e-3, `${g.alt}: ${m.mark}.${k} moved`); });
  }
});

test("contact pre-pass: Python (livefig.fix) and JS give the same marks, to 1e-6 (conformance vectors in the fixture)", () => {
  const close = (a, b, at) => {
    if (typeof b === "number") return assert.ok(Math.abs(a - b) <= 1e-6, `${at}: ${a} vs ${b}`);
    if (b && typeof b === "object") { assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at); for (const k in b) close(a[k], b[k], at + "." + k); return; }
    assert.equal(a, b, at);
  };
  for (const c of C) { assert.ok(c.want, `${c.name}: no conformance vector`); close(G.fix(structuredClone(c.fig.marks)).marks, c.want, c.name); }
});
