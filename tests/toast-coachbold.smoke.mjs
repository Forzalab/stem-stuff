// BUG-COACHBOLD smoke: a "Bold head\nrest" toast keeps its <b.stoast-h> head through the count() tween (bar:false offer / coach toast).
//   node tests/toast-coachbold.smoke.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(join(ROOT, "client/shell/toast/toast.js"), "utf8");
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent('<body><div id="problem" style="margin:60px 20px;height:120px">Q</div></body>');
await page.addScriptTag({ content: js });
await page.evaluate(() => window.stemToast.show({ text: "Head line\nsecond line", bar: false, at: () => document.getElementById("problem") }));
let bad = null, seen = 0;
for (let i = 0; i < 12; i++) {                       // sample across the 200 ms slide + 600 ms count window
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => { const t = document.querySelector(".stoast-t"); return t && { h: !!t.querySelector("b.stoast-h"), txt: t.textContent }; });
  if (r) seen++;
  if (r && !r.h) { bad = r; break; }
}
await browser.close();
assert.ok(seen > 0, "toast never showed");
assert.equal(bad, null, "bold head lost after count(): " + JSON.stringify(bad));
console.log("ok   toast keeps its bold head through count()");
