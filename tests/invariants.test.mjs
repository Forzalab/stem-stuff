// Whole-repo invariant checks (tests/INVARIANTS.md). Plain node:test loops, no new deps.
// KNOWN_GAPS: violations that already exist on main. The test is green on them and red on any NEW gap.
// Fix a gap = delete it from the list (a stale entry also fails, so the list cannot rot).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN = path.join(ROOT, "tests/run-all.sh");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const runAll = (args, env = {}) =>
  execFileSync("bash", [RUN, ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

const norm = (p) => p.replace(/^\.\/+/, "").replace(/^\/+/, "").split(/[?#]/)[0];
const isLocal = (u) => u && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

// Compare sorted lists; unexpected = new gap, stale = gap that was fixed but is still listed.
function checkGaps(found, known, what) {
  const f = new Set(found), k = new Set(known);
  const fresh = [...f].filter((x) => !k.has(x)).sort();
  const stale = [...k].filter((x) => !f.has(x)).sort();
  assert.deepEqual(fresh, [], `${what}: NEW gap(s), fix them (do not add to KNOWN_GAPS)`);
  assert.deepEqual(stale, [], `${what}: fixed already, delete from KNOWN_GAPS`);
}

// ---- I5 sw-precache ----
// Gaps on main today: none. The research note's mycluck.mjs miss is not reachable from index.html (only login.js imports it,
// and login.js is not loaded by index.html), so it is outside this rule's scope and not listed.
const KNOWN_GAPS_I5 = [];

function swBase() {
  const m = read("sw.js").match(/const\s+BASE\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(m, "sw.js: BASE array not found");
  const set = new Set();
  for (const q of m[1].matchAll(/"([^"]+)"/g)) set.add(norm(q[1]));
  return set;
}

function indexAssets() {
  const html = read("index.html");
  const scripts = [], links = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) scripts.push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const h = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (h) links.push({ href: h[1], preload: /\brel\s*=\s*["'][^"']*\bmodulepreload\b/i.test(m[0]) });
  }
  return { scripts: scripts.filter(isLocal).map(norm), links: links.filter((l) => isLocal(l.href)).map((l) => ({ ...l, href: norm(l.href) })) };
}

function importsOf(cur, body) {
  const specs = [];
  for (const m of body.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) specs.push(m[1]);
  for (const m of body.matchAll(/\bimport\s+(?:[^"'();]*?\bfrom\s+)?["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of body.matchAll(/\bexport\s+[^"';]*?\bfrom\s+["']([^"']+)["']/g)) specs.push(m[1]);
  const dir = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/") + 1) : "";
  return specs
    .filter((s) => isLocal(s) && /\.m?js$/.test(s))
    .map((s) => (s.startsWith("/") ? norm(s) : path.posix.normalize(dir + s)))
    .filter((p) => existsSync(path.join(ROOT, p)));
}

test("I5 sw-precache (ALL): every client js/mjs index.html loads or imports is in sw.js BASE", () => {
  const { scripts, links } = indexAssets();
  const roots = [...scripts, ...links.filter((l) => l.preload).map((l) => l.href)].filter((p) => /\.m?js$/.test(p));
  assert.ok(roots.length > 20, "index.html should load many scripts");
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !existsSync(path.join(ROOT, f))) continue;
    seen.add(f);
    for (const p of importsOf(f, read(f))) stack.push(p);
  }
  const base = swBase();
  const missing = [...seen].filter((f) => !base.has(f));
  checkGaps(missing, KNOWN_GAPS_I5, "I5 (client js/mjs missing from sw.js BASE)");
});

// ---- I6 run-all flags ----
test("I6 run-all flags (ALL): --list and --plan (as CI calls them) keep their output shape", () => {
  const list = runAll(["--list"]).trim().split("\n");
  assert.equal(list[0], "unittest");
  assert.equal(list[1], "npm");
  assert.ok(list.length > 50, "--list names every unit");
  for (const l of list) assert.match(l, /^[A-Za-z0-9_-]+(@[A-Za-z0-9_-]+)?$/, `bad --list line: ${l}`);
  assert.ok(list.includes("ux-flows@phone") && list.includes("desk-layout@3"));

  // CI: tests.yml `tests/run-all.sh --plan "$BLOCKS" "$LANES"` with BLOCKS=4 LANES=3
  const yml = readFileSync(path.join(ROOT, ".github/workflows/tests.yml"), "utf8");
  const B = +yml.match(/^\s*BLOCKS:\s*(\d+)/m)[1], L = +yml.match(/^\s*LANES:\s*(\d+)/m)[1];
  const planOut = runAll(["--plan", String(B), String(L)]).trim();
  assert.equal(planOut.split("\n").length, 1, "--plan prints ONE json line");
  const plan = JSON.parse(planOut);
  assert.equal(plan.include.length, B);
  const dealt = [];
  plan.include.forEach((row, i) => {
    assert.equal(row.block, i + 1);
    assert.equal(row.of, B);
    const lanes = row.lanes.split("|");
    assert.equal(lanes.length, L, "lanes joined by |");
    for (const lane of lanes) dealt.push(...lane.split(" ").filter(Boolean));
  });
  const specs = list.slice(2); // unittest + npm are not in the plan
  assert.deepEqual([...dealt].sort(), [...specs].sort(), "--plan deals every unit exactly once");

  // SHARD env: shard 1 has unittest + npm, shard 2 does not; together = --list
  const s1 = runAll(["--list"], { SHARD: "1/2" }).trim().split("\n");
  const s2 = runAll(["--list"], { SHARD: "2/2" }).trim().split("\n");
  assert.deepEqual(s1.slice(0, 2), ["unittest", "npm"]);
  assert.ok(!s2.includes("unittest") && !s2.includes("npm"));
  assert.deepEqual([...s1, ...s2].sort(), [...list].sort());
});

// ---- index.html asset -> affected ----
// Gaps on main today: none (every index.html asset selects >=1 .pw unit; the fx.js class is fixed on main).
const KNOWN_GAPS_AFFECTED = [];

test("index.html asset -> affected (ALL): every local script/link file selects at least one .pw layout unit", () => {
  const { scripts, links } = indexAssets();
  const files = [...new Set([...scripts, ...links.map((l) => l.href)])].filter((f) => existsSync(path.join(ROOT, f)));
  assert.ok(files.length > 30);
  const layoutUnits = new Set(runAll(["--list"]).trim().split("\n").slice(2)); // every .pw unit name
  const bad = [];
  for (const f of files) {
    const out = runAll(["--affected", f]).trim().split("\n");
    if (!out.some((l) => layoutUnits.has(l))) bad.push(f);
  }
  checkGaps(bad, KNOWN_GAPS_AFFECTED, "asset -> affected (index.html asset selecting no .pw unit)");
});

// ---- INVARIANTS.md lint ----
test("INVARIANTS.md lint: every Test: path exists, I1..I12 all listed", () => {
  const md = read("tests/INVARIANTS.md");
  for (let i = 1; i <= 12; i++) assert.match(md, new RegExp(`^I${i} `, "m"), `I${i} missing`);
  const paths = new Set();
  for (const line of md.split("\n").filter((l) => l.startsWith("Test:")))
    for (const m of line.matchAll(/\b(tests\/[\w./@-]+\.(?:mjs|py|sh|cjs|js|tsv|md))\b/g)) paths.add(m[1]);
  assert.ok(paths.size >= 8);
  for (const p of paths) assert.ok(existsSync(path.join(ROOT, p)), `INVARIANTS.md names ${p}, which does not exist`);
  assert.ok(md.split("\n").length < 70, "INVARIANTS.md must stay under 70 lines");
});
