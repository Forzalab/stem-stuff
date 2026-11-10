// Nov 3 23:51 prod (/chat, "Which formula fits?"): "Forces on the rod:", then an EMPTY block, then "The rod does not spin": a figure the page
// cannot draw (unparsable JSON, or JSON that is not a graph) was removed with a bare ph.remove() in wishFigs, so its ":" lead-in and the
// blank lines around it stayed (#410 moved the other three drops to figDrop and missed this one). /chat and the steps render with the same
// wishHTML + wishFigs, so this runs that pair on a /chat-shaped reply at 393 and 1280: the lead-in is gone, no figure box is left, and
// the space between the last line and "The rod does not spin" is exactly what the same reply WITHOUT the figure has.
// Starts its own serve.py:   node tests/figgap.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8866), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "figgap-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS); writeFileSync(join(BANKS, "BANK_FG1.json"), JSON.stringify({ v: 1, problems: [] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "unused" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

const head = "There are two rules here: forces balance and torques balance.\n\n", tail = "The rod does not spin and does not move.\n- No spin means **torque** balance.";
const withFig = body => head + "Forces on the rod:\n\n```fig\n" + body + "\n```\n\n" + tail, plain = head + tail;
const CASES = { "unparsable json": withFig("{not json"), "json that is not a graph": withFig('{"type":"nope"}') };
let failures = 0;
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [393, 1280]) for (const [name, text] of Object.entries(CASES)) {
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block" });
      await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
      const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
      await page.route("**/cluck.js", async route => {   // app.js is a module: expose the two renderers to the test, nothing else changes
        const res = await route.fetch(); await route.fulfill({ response: res, body: (await res.text()) + "\nwindow.__w = { wishHTML, wishFigs };\n" });
      });
      await page.goto(BASE + "/"); await page.waitForFunction(() => !!window.__w, null, { timeout: 8000 });
      const r = await page.evaluate(([a, b]) => {
        const host = document.createElement("div"); host.className = "wtext"; host.style.cssText = "position:absolute;left:0;top:0;width:" + Math.min(innerWidth - 32, 560) + "px";
        document.body.append(host);
        const show = t => { host.innerHTML = __w.wishHTML(t, true); __w.wishFigs(host); };
        const gap = () => { const p = [...host.querySelectorAll(".wl")]; const u = p.find(e => /two rules/.test(e.textContent)), v = p.find(e => /does not spin and/.test(e.textContent)); return v.getBoundingClientRect().top - u.getBoundingClientRect().bottom; };
        show(b); const want = gap(); show(a);
        const out = { gap: gap(), want, boxes: host.querySelectorAll(".wfig, .fig").length, lead: [...host.querySelectorAll(".wl")].filter(e => /:\s*$/.test(e.textContent)).length,
          empty: [...host.children].filter(c => !c.textContent.trim() && !c.classList.contains("wgap") && !c.querySelector("svg,img,table")).length, gaps: host.querySelectorAll(".wgap").length };
        host.remove(); return out;
      }, [text, plain]);
      assert.equal(r.boxes, 0, "no figure box"); assert.equal(r.lead, 0, "the ':' lead-in goes with its figure"); assert.equal(r.empty, 0, "no empty block");
      assert.equal(r.gaps, 1, "one blank line, as in the reply without the figure");
      assert.ok(Math.abs(r.gap - r.want) < 1, `space before "The rod does not spin" ${r.gap}px, the same reply without the figure has ${r.want}px`);
      assert.deepEqual(errs, []);
      await ctx.close(); console.log("ok  ", name, width);
    } catch (e) { failures++; console.log("FAIL", name, width, "\n     ", e.message.slice(0, 600)); }
  }
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
