#!/usr/bin/env node
// measure_slots.mjs: views plan Oct 20, pipeline step 3 "Measure" (code only, no model).
// Paints one OpenUI Lang view with NO t map, so every "$t.<id>" draws as views.js's outlined empty box
// <span class="vw-tslot" data-slot="<id>"> (labelled by its id), saves a full-page PNG, and writes slots.json:
// one row per slot {id, component, prop, role, wordClass, box:{x,y,w,h}, lines, maxChars}.
//   component + prop: from the parsed program (the element whose prop holds the literal "$t.<id>", deep).
//   role + wordClass: views/registry.json components.<C>.words.<prop>. A slot with no registry role -> exit 1.
//   box: the content box of the element the filled text will sit in (the slot box's nearest non-inline parent). When that
//        element is content-sized (a pill or chip that grows with its label), its width is the width the layout lets it grow
//        to (probed with a long label), not the empty box's, so maxChars does not depend on the slot id's length.
//   lines: body = ceil(prop maxLength / chars per line), else 3; heading = 2 when that parent wraps, else 1;
//          button / label / chip = 1.
//   maxChars: floor(box.w / average char width) * lines, capped by the prop's maxLength. The average char width is
//          canvas measureText of a representative English sentence in the parent's computed font (the font the
//          filled text inherits; the empty box itself is drawn smaller).
// usage: node tools/measure_slots.mjs <view.oui> --out <dir> [--width 390] [--base <url>]
//   measure(program, {css}) also takes extra CSS for the page (tests use it to pin a box to a fixed width).
//   <view.oui> may also be "-" (stdin). No --base: starts python3 serve.py on a free port and stops it after.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "tests", "package.json"));
function loadPlaywright() {
  try { return require("playwright"); } catch { return require("/opt/node22/lib/node_modules/playwright"); }
}
export const SAMPLE = "The quick brown fox jumps over the lazy dog and runs home";
const REG = JSON.parse(readFileSync(join(ROOT, "views", "registry.json"), "utf8"));

/** {id, component, prop, role, wordClass} for each slot id, or an error string when the registry gives it no role. */
export function roleOf(component, prop) {
  const w = REG.components?.[component]?.words?.[prop];
  if (!w || (REG.slot?.not_words || []).includes(`${component}.${prop}`)) return null;
  return { role: w.role, wordClass: w.wordClass };
}

const freePort = () => new Promise((ok, no) => {
  const s = createServer(); s.unref(); s.on("error", no);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); });
});
async function startServer() {
  const port = await freePort();
  const proc = spawn("python3", ["serve.py", String(port)], { cwd: ROOT, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/views.js`); if (r.ok) return { base, proc }; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  proc.kill(); throw new Error("serve.py did not start");
}

/** Measure one program. Returns {rows, errors, png}; errors = slot ids with no registry role + render errors. */
export async function measure(program, { out, width = 390, base, browser, css = "" } = {}) {
  let srv = null, own = null;
  if (!base) { srv = await startServer(); base = srv.base; }
  try {
    const b = browser || (own = await loadPlaywright().chromium.launch({ args: ["--no-sandbox"] }));
    const phone = width < 700;
    const ctx = await b.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
    const page = await ctx.newPage();
    // the lab page (its tokens, fonts and CSS); its demo views are swapped for one mount once it is ready
    await page.goto(`${base}/try/views-demo.html?fast=1`);
    await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "1", null, { timeout: 15000 });
    const res = await page.evaluate(async ({ program, SAMPLE, css }) => {
      const { render } = await import("/views.js");
      const { createParser } = await import("/vendor/openui-lang.mjs");
      const { LIB, toSchema } = await import("/views-lib.js");
      document.querySelector("main").innerHTML = '<section class="dq" aria-label="measure"><div id="vm" class="dmount"></div></section>';
      if (css) document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));
      const errs = [];
      render(program, document.getElementById("vm"), { onError: e => errs.push(`${e.code} ${e.statementId || ""} ${e.message}`) });
      await document.fonts.ready;
      // slot id -> the component + prop that holds it (deep: inline elements and arrays keep their owner's prop)
      const where = {}, seen = new Set();
      const SLOT = /^\$t\.([a-z][a-z0-9_]{0,31})$/;
      const walk = (v, comp, prop) => {
        if (typeof v === "string") { const m = SLOT.exec(v); if (m && !where[m[1]]) where[m[1]] = { component: comp, prop }; return; }
        if (Array.isArray(v)) { v.forEach(x => walk(x, comp, prop)); return; }
        if (v && v.type === "element") {
          if (seen.has(v)) return; seen.add(v);
          for (const [k, x] of Object.entries(v.props || {})) walk(x, v.typeName, k);
        }
      };
      walk(createParser(toSchema(LIB), LIB.root).parse(program).root);
      const cv = document.createElement("canvas").getContext("2d");
      const PROBE = Array(12).fill(SAMPLE).join(" ");
      const rows = [...document.querySelectorAll(".vw-tslot[data-slot]")].map(el => {
        const id = el.getAttribute("data-slot");
        let fr = el.parentElement;
        while (fr && getComputedStyle(fr).display === "inline") fr = fr.parentElement;
        const cs = getComputedStyle(fr), r = fr.getBoundingClientRect();
        const pad = k => parseFloat(cs[`padding${k}`]) || 0, bw = k => parseFloat(cs[`border${k}Width`]) || 0;
        // Content-sized boxes (pills, chips): probe with a long wrapping label and read the width the layout clamps it to;
        // the browser applies every constraint (container width, siblings, gaps, max-width) and a fixed box does not move.
        el.textContent = PROBE;
        const pw = fr.getBoundingClientRect().width;
        el.textContent = id;
        const ow = pw > r.width + 0.5 ? pw : r.width;
        const box = { x: r.left + pad("Left") + bw("Left") + scrollX, y: r.top + pad("Top") + bw("Top") + scrollY,
          w: ow - pad("Left") - pad("Right") - bw("Left") - bw("Right"), h: r.height - pad("Top") - pad("Bottom") - bw("Top") - bw("Bottom") };
        for (const k in box) box[k] = Math.round(box[k] * 10) / 10;
        cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const avg = cv.measureText(SAMPLE).width / SAMPLE.length;
        const w = where[id] || {};
        const spec = LIB.components[w.component]?.props?.[w.prop];
        const maxLength = spec?.maxLength ?? spec?.items?.maxLength ?? null;
        const wraps = !/nowrap|pre$/.test(cs.whiteSpace) && fr.tagName !== "BUTTON";
        return { id, ...w, box, perLine: Math.max(0, Math.floor(box.w / avg)), maxLength, wraps, font: cv.font };
      });
      return { rows, errs };
    }, { program, SAMPLE, css });

    const errors = [...res.errs];
    const rows = res.rows.map(r => {
      const rl = r.component ? roleOf(r.component, r.prop) : null;
      if (!rl) errors.push(`slot ${r.id}: no registry role for ${r.component || "?"}.${r.prop || "?"}`);
      const role = rl?.role ?? null;
      const lines = role === "body" ? (r.maxLength && r.perLine ? Math.ceil(r.maxLength / r.perLine) : 3)
        : role === "heading" && r.wraps ? 2 : 1;
      const fit = r.perLine * lines;
      return { id: r.id, component: r.component ?? null, prop: r.prop ?? null, role, wordClass: rl?.wordClass ?? null, box: r.box, lines,
        maxChars: r.maxLength ? Math.min(fit, r.maxLength) : fit };
    });
    let png = null;
    if (out) {
      mkdirSync(out, { recursive: true });
      png = join(out, "slots.png");
      await page.screenshot({ path: png, fullPage: true });
      writeFileSync(join(out, "slots.json"), JSON.stringify({ width, rows }, null, 1) + "\n");
    }
    await ctx.close();
    return { rows, errors, png };
  } finally {
    if (own) await own.close();
    if (srv) srv.proc.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = { width: 390 };
  let src = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") opt.out = a[++i];
    else if (a[i] === "--width") opt.width = +a[++i];
    else if (a[i] === "--base") opt.base = a[++i];
    else if (src == null) src = a[i];
    else { console.error(`unknown argument: ${a[i]}`); process.exit(2); }
  }
  if (!src || !opt.out || !(opt.width > 0)) {
    console.error("usage: node tools/measure_slots.mjs <view.oui|-> --out <dir> [--width 390] [--base <url>]");
    process.exit(2);
  }
  const program = readFileSync(src === "-" ? 0 : src, "utf8");
  const { rows, errors, png } = await measure(program, opt);
  console.log(`${rows.length} slots at ${opt.width}px -> ${join(opt.out, "slots.json")}, ${png}`);
  for (const e of errors) console.error("ERROR", e);
  process.exit(errors.some(e => e.startsWith("slot ")) ? 1 : 0);
}
