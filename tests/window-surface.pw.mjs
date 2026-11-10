// W152 (app.js split into app.js + cluck.js + shell.js by tools/client_generators/split-app.mjs): the page's window names after load must stay
// EXACTLY the set the one-file app.js left (tests/window-surface.json, written on main 7397fd3+ before the split). Classic scripts
// (nav.js, offline.js, brainrot.js, peek.js, toast.js ...) and the specs reach app code only through these names, so one lost
// or one new name fails here. Name + typeof, at 2 sizes, sugar and diet, after the first question (stemFirst) has opened.
// usage: node tests/window-surface.pw.mjs http://localhost:8812        UPDATE=1 rewrites the snapshot (only on purpose: say why in the PR)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";
const SNAP = new URL("./window-surface.json", import.meta.url);

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
const own = async page => page.evaluate(() => Object.getOwnPropertyNames(window).map(k => { let t; try { t = typeof window[k]; } catch { t = "throws"; } return [k, t]; }));
const blank = await (await b.newContext()).newPage();
await blank.goto(`${BASE}/window-surface-blank-404`);         // same origin, no script: what Chromium itself puts on window (secure-context APIs too)
const native = new Set((await own(blank)).map(([k]) => k));
const got = {};
for (const [vname, viewport] of [["phone", { width: 390, height: 844 }], ["desk", { width: 1440, height: 900 }]]) {
  for (const mode of ["sugar", "diet"]) {
    const ctx = await b.newContext({ viewport, serviceWorkers: "block" });
    await ctx.addCookies([{ name: "stem-mode", value: mode, url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(`${BASE}/#CALC1_T6B`, { waitUntil: "load" });
    await page.waitForFunction(() => window.stemFirst, null, { timeout: 15000 });
    await page.evaluate(() => window.stemFirst);
    await page.waitForSelector("#pcode", { state: "attached" });
    await page.waitForTimeout(300);
    got[`${vname}-${mode}`] = Object.fromEntries((await own(page)).filter(([k]) => !native.has(k)).sort(([a], [c]) => a < c ? -1 : 1));
    assert.deepEqual(errs, [], `${vname} ${mode}: page errors`);
    await ctx.close();
  }
}
await b.close();

if (process.env.UPDATE) { writeFileSync(SNAP, JSON.stringify(got, null, 1) + "\n"); console.log("window-surface.json rewritten"); process.exit(0); }
const want = JSON.parse(readFileSync(SNAP, "utf8"));
let failures = 0;
for (const k of Object.keys(want)) {
  const w = want[k], g = got[k] || {};
  const lost = Object.keys(w).filter(n => !(n in g)), added = Object.keys(g).filter(n => !(n in w)), retyped = Object.keys(w).filter(n => n in g && g[n] !== w[n]);
  if (lost.length || added.length || retyped.length) { failures++; console.log(`FAIL ${k}: lost [${lost}] new [${added}] type changed [${retyped.map(n => `${n} ${w[n]}->${g[n]}`)}]`); }
  else console.log(`ok   ${k}: ${Object.keys(w).length} window names, same as the snapshot`);
}
process.exit(failures ? 1 : 0);
