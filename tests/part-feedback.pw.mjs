// partFeedback (app.js): a multi item's per-part feedback row. CSCI26_M5V from problems.json (two num parts, 2 tries each).
// Can't read -> the line with the typed text; wrong -> the box goes bad and the part's own Cluck line shows the author hint; SLIP_TIE spot
// (PR #260, hintOf): /check routed to carry `spot` -> the part shows the spot only when Jev's gate says ok, else the plain hint; right -> shut, no line.
// Starts its own serve.py with a throwaway tries.json:
//   node tests/part-feedback.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8823), BASE = `http://localhost:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "partfb-")), "tries.json");
const CODE = "CSCI26_M5V", SPOT = "QUACK. Redo the bottom of the fraction.";

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 8000 });
/* type into part i, Enter, wait for this try to be graded (a can't-read is not recorded: wait for the row's line instead) */
async function send(page, i, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill(`#q .part[data-i="${i}"] .ans`, v);
  await page.press(`#q .part[data-i="${i}"] .ans`, "Enter");
  await page.waitForFunction(([k, i]) => window.__drill.state.tries.length > k || document.querySelector(`#q .part[data-i="${i}"] .phint`).textContent.trim(), [n, i], { timeout: 4000 });
  await page.waitForTimeout(150);
}
const part = (page, i) => page.evaluate(i => {
  const r = document.querySelector(`#q .part[data-i="${i}"]`), box = r.querySelector(".ff");
  return { line: r.querySelector(".phint").textContent.replace(/\s+/g, " ").trim(), cluck: r.querySelector(".phint .cluck .md")?.textContent || "",
    hinted: r.classList.contains("hinted"), bad: box.classList.contains("bad"), shut: box.classList.contains("shut"), ok: box.classList.contains("ok"),
    kind: window.__drill.state.hints.filter(h => h.part === i).at(-1)?.kind };
}, i);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(`${BASE}/#${CODE}`); await opened(page, CODE);

  await step("can't read: the part's line names the typed text, no try spent, box not bad", async () => {
    await send(page, 0, "abc");
    const p = await part(page, 0);
    assert.ok(p.line.includes("Can't read abc. Type it again."), p.line);
    assert.deepEqual([p.hinted, p.bad, p.cluck], [true, false, ""]);
  });

  /* every wrong /check reply carries a spot from here on; Jev's gate (record -> stemJev.spot) is pinned per step */
  await page.route("**/check", async r => {
    const res = await r.fetch(), j = await res.json();
    if (j.verdict === "wrong") Object.assign(j, { spot: SPOT, collide: ["sign", "drop"] });
    await r.fulfill({ response: res, json: j });
  });
  const gate = ok => page.evaluate(ok => { window.stemJev.spot = () => ({ ok }); }, ok);

  await step("wrong, Jev holds: the box goes bad and the part shows the author hint, not the spot", async () => {
    await gate(false); await send(page, 0, "17");
    const p = await part(page, 0);
    assert.ok(p.cluck.includes("You counted the overlap twice."), p.cluck);
    assert.ok(!p.cluck.includes("bottom of the fraction"), p.cluck);
    assert.deepEqual([p.hinted, p.bad, p.shut, p.kind], [true, true, false, "counting"]);
  });

  await step("wrong, Jev says ok: part 1 shows the spot, S.hints kind spot; part 0 keeps its own line", async () => {
    await gate(true); await send(page, 1, "14");
    const p = await part(page, 1);
    assert.ok(p.cluck.includes("Redo the bottom of the fraction.") && !p.cluck.includes("Exactly one"), p.cluck);
    assert.deepEqual([p.hinted, p.bad, p.kind], [true, true, "spot"]);
    assert.ok((await part(page, 0)).cluck.includes("You counted the overlap twice."));
  });

  await step("right: the part shuts green and its line is cleared", async () => {
    await send(page, 0, "14");
    const p = await part(page, 0);
    assert.deepEqual([p.line, p.hinted, p.bad, p.shut, p.ok], ["", false, false, true, true]);
  });

  await step("no page errors", async () => assert.deepEqual(errs, []));
  await ctx.close();
} finally {
  await browser.close();
  srv.kill();
}
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
