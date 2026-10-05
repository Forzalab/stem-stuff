// design/STYLE.md as code: the rules a grep can check. Each failure names its STYLE.md section.
// Open items from STYLE.md §9 are `todo` tests: they report, they do not fail. Remove `todo` in the commit that fixes one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const CSS = ["app.css", "nav.css", "design/explain-box.css"];
const JS = ["app.js", "nav.js"];

/* CSS declarations outside :root blocks (token definitions), comments stripped: [{ file, sel, prop, value }] */
function decls(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [], stack = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") { stack.push(buf.trim()); buf = ""; }
    else if (ch === "}") { flush(); stack.pop(); buf = ""; }
    else if (ch === ";") { flush(); buf = ""; }
    else buf += ch;
  }
  function flush() {
    const d = buf.trim(), i = d.indexOf(":");
    if (i < 1 || !stack.length) return;
    const sel = stack[stack.length - 1];
    if (stack.some(s => /(^|,)\s*:root\b/.test(s))) return;                    // token definitions live here
    out.push({ file, sel, prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() });
  }
  return out;
}
const ALL = CSS.flatMap(decls);
const fmt = d => `${d.file} "${d.sel}" { ${d.prop}: ${d.value} }`;

test("§2.1 colours: tokens only (raw hex / rgb only in masks)", () => {
  const raw = /#[0-9a-f]{3,8}\b|rgba?\(/i;
  const bad = ALL.filter(d => !d.prop.startsWith("--") && raw.test(d.value) && !/mask/.test(d.prop) && !(d.prop === "box-shadow" && DOCK.test(d.value)));
  assert.deepEqual(bad.map(fmt), [], "use a token from app.css :root (STYLE.md §2.1)");
});

const DOCK = /^0 -10px 24px -8px rgb\(0 0 0 \/ 0\.55\)$/;                      // STYLE.md §9 #7: becomes --shadow-up
test("§2.7 shadows: tokens only, on the named layers", () => {
  const ok = v => v === "none" || v.split(/,(?![^(]*\))/).map(s => s.trim()).every(p => /^var\(--(shadow-[134]|ai-nm-(up|in|btn))\)$/.test(p) || /^inset 0 0 0 \d+px var\(--[a-z0-9-]+\)$/.test(p));
  const bad = ALL.filter(d => d.prop === "box-shadow" && !ok(d.value) && !DOCK.test(d.value));
  assert.deepEqual(bad.map(fmt), [], "shadows come from --shadow-1/3/4 (STYLE.md §2.7)");
});
test("§2.7 the raw dock shadow is a token", { todo: "STYLE.md §9 #7" }, () => {
  assert.equal(ALL.filter(d => d.prop === "box-shadow" && DOCK.test(d.value)).length, 0);
});

test("§2.5 radius: only the listed radii", () => {
  const OK = new Set(["0", "2px", "3px", "4px", "6px", "8px", "10px", "16px", "50%"]);
  const bad = ALL.filter(d => d.prop === "border-radius" && !d.value.startsWith("calc(") && !d.value.split(/\s+/).every(v => OK.has(v)));
  assert.deepEqual(bad.map(fmt), [], "radius follows size (STYLE.md §2.5)");
});

test("§2.6 borders: one weight (--bw), only a wrong answer is heavier (--bw-alarm)", () => {
  const ok = d => {
    const v = d.value.replace(/var\(--bw(-alarm)?(, *1px)?\)/g, "");                           // the tokens (explain-box.css has a 1px fallback)
    const px = v.match(/\d*\.?\d+px/g) || [];
    return px.every(p => p === "1px" || (p === "1.5px" && ["#toast", ".ask"].includes(d.sel)));   // 1px dividers; the toast and Cluck's ask rim (Tony's image 3) are the listed exceptions
  };
  const bad = ALL.filter(d => /^border(-(top|right|bottom|left))?(-width)?$/.test(d.prop) && !ok(d));
  assert.deepEqual(bad.map(fmt), [], "border widths: var(--bw), var(--bw-alarm), 1px dividers, the toast's 1.5px (STYLE.md §2.6)");
});
test("§2.6 field focus: the 2px edge, never an outline too", () => {
  const field = s => /:focus-within|textarea:focus/.test(s) && !/\.btn\b/.test(s);
  const bad = ALL.filter(d => field(d.sel) && d.prop === "outline" && d.value !== "none");
  assert.deepEqual(bad.map(fmt), [], "a focused field turns its border --focus + 1px inset; no outline (STYLE.md §2.6)");
});
test("§2.6 keyboard ring: one width (--ring)", () => {
  const bad = ALL.filter(d => (d.prop === "outline" && d.value !== "none" && !d.value.startsWith("var(--ring)")) || d.prop === "outline-width");
  assert.deepEqual(bad.map(fmt), [], "outline: var(--ring) solid var(--focus) (STYLE.md §2.6)");
});

test("§2.2 type: Atkinson, Atkinson Mono or KaTeX only", () => {
  const first = v => v.split(",")[0].trim().replace(/["']/g, "");
  const OK = v => ["inherit", "var(--mono)", "Atkinson Hyperlegible", "Atkinson Hyperlegible Mono"].includes(first(v)) || /^KaTeX_/.test(first(v));
  const bad = ALL.filter(d => d.prop === "font-family" && !OK(d.value));
  assert.deepEqual(bad.map(fmt), [], "no third family (STYLE.md §2.2)");
});

test("§2.1 --mark is Cluck and figures only, never a warning", () => {
  const bad = ALL.filter(d => /var\(--mark\)/.test(d.value) && !/cluck|duck|fig|graph|specimen|\.chg\b/i.test(d.sel));
  assert.deepEqual(bad.map(fmt), [], "--mark: Cluck's duck and figure highlights (STYLE.md §2.1)");
});

test("§4 no colour emoji in the UI", () => {
  const hits = ["index.html", ...JS].flatMap(f => read(f).split("\n").map((l, i) => [f, i + 1, l]).filter(([, , l]) => /\p{Emoji_Presentation}/u.test(l)));
  assert.deepEqual(hits.map(([f, n, l]) => `${f}:${n}: ${l.trim().slice(0, 80)}`), [], "drawn sprite symbols, not emoji (STYLE.md §4)");
});

test("§3 Toast: one element", () => {
  assert.equal((read("index.html").match(/id="toast"/g) || []).length, 1, "one #toast (STYLE.md §3 Toast)");
});
test("§3 Toast: the caret on every toast, the MC row too", () => {
  const off = ALL.filter(d => d.sel.includes("#toast") && d.sel.includes("::before") && d.prop === "display" && d.value === "none");
  assert.deepEqual(off.map(fmt), []);
});

test("§5 Keyboard: no new shortcuts (keydown only on the listed elements)", () => {
  // window: Escape closes the toast. codeIn: the combobox. q: MC choice keys. inp: Enter submits a box. sash: silent a11y.
  // nav.js btn / panel: the list combobox. ([ and ] prev / next were removed: Tony, Oct 2 ~23:59 PT.)
  const ALLOW = { "app.js": ["window", "codeIn", "q", "inp", "sash"], "nav.js": ["btn", "panel"] };
  const bad = [];
  for (const f of JS) for (const m of read(f).matchAll(/(?:^|[^\w.])(?:(\w+)\.)?addEventListener\(\s*["']key(?:down|up|press)["']/gm)) {
    const who = m[1] || "window";
    if (!ALLOW[f].includes(who)) bad.push(`${f}: ${who}.addEventListener(keydown)`);
  }
  assert.deepEqual(bad, [], "a new key handler is a new shortcut (STYLE.md §5 Keyboard)");
});

/* rewards/rewards.css: the sugar reward skin may look like a game, but only on its own nodes (design/REWARDS-WIRING.md §7) */
test("rewards skin is scoped: every rule styles a .rw-* or .fx-* node, no :root, never the question UI", () => {
  const css = read("rewards/rewards.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = [], stack = [];
  let buf = "";
  for (const ch of css) {
    if (ch === "{") { const pre = buf.trim(); if (!pre.startsWith("@") && !stack.some(x => /^@keyframes/.test(x))) sels.push(pre); stack.push(pre); buf = ""; }
    else if (ch === "}") { stack.pop(); buf = ""; }
    else if (ch === ";") buf = "";
    else buf += ch;
  }
  assert.ok(sels.length > 40, "parsed the rules");
  const bad = sels.flatMap(s => s.split(",").map(x => x.trim())).filter(x => {
    const comp = x.split(/\s+|>|\+|~/).filter(Boolean), at = comp.findIndex(c => /\.(rw|fx)-/.test(c));
    return /:root/.test(x) || /#q\b|\.opt\b|#toast|#fb\b|\.cluck|#wish/.test(x) || at < 0 || comp.slice(at + 1).some(c => /^[.#]/.test(c) && !/\.(rw|fx)-/.test(c));
  });
  assert.deepEqual(bad, [], "rewards.css styles only .rw-* / .fx-* nodes");
  const tokens = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]).filter(t => !/^--(rw|fx)-/.test(t) && !["--p", "--fs", "--c", "--n", "--cell"].includes(t));
  assert.deepEqual(tokens, [], "reward tokens are --rw-* / --fx-*: never an app token name");
});

test("number badges: line-height 1, so the digit sits in the middle (Tony, Oct 5: the formula card's 1 rode ~2.5px high)", () => {
  for (const sel of [".fcard .n", ".wtext .wnum", ".orig-sol li::before"])
    assert.ok(ALL.some(d => d.sel === sel && d.prop === "line-height" && d.value === "1"), sel);
});
