// popover.js (design/POPOVER.md): the one rich-context popup, driven through its lab page (design/popover-lab.html, opened from disk, no server).
// Lazy (no .pop until a tap, removed on close), one at a time, a second tap / Esc / an outside tap close it, focus goes back on Esc, aria wiring,
// every variant inside a 360 viewport (16px edges, no sideways scroll), media = a graph.js figure with an accessible name, reduced motion = no animation.
//   node tests/popover.pw.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const LAB = "file://" + join(dirname(fileURLToPath(import.meta.url)), "..", "design", "popover-lab.html");

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(LAB);
  const live = () => page.$$eval(".pop:not(.is-static)", ps => ps.map(p => [p.dataset.variant, p.id]));
  const exp = id => page.getAttribute("#" + id, "aria-expanded");

  await step("lazy: nothing in the page until a tap; a tap builds one, wired to its trigger", async () => {
    assert.deepEqual(await live(), []);
    await page.click("#tDoc");
    const [[v, id]] = await live();
    assert.equal(v, "doc");
    assert.deepEqual([await exp("tDoc"), await page.getAttribute("#tDoc", "aria-controls"), await page.getAttribute("#" + id, "role")], ["true", id, "dialog"]);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("pop")), true, "focus moves into it");
  });
  await step("one at a time; a second tap closes and removes it", async () => {
    await page.click("#tTerm");
    assert.deepEqual((await live()).map(x => x[0]), ["term"]);
    assert.equal(await exp("tDoc"), "false");
    assert.equal(await page.getAttribute("#tDoc", "aria-controls"), null);
    await page.click("#tTerm");
    assert.deepEqual(await live(), []);
    assert.equal(await exp("tTerm"), "false");
  });
  await step("Esc closes it and gives focus back to its trigger; an outside tap closes it", async () => {
    await page.click("#tNote"); await page.keyboard.press("Escape");
    assert.deepEqual(await live(), []);
    assert.equal(await page.evaluate(() => document.activeElement.id), "tNote");
    await page.click("#tNote"); await page.mouse.click(5, 5);
    assert.deepEqual(await live(), []);
  });
  await step("keyboard: Enter on a trigger opens it", async () => {
    await page.focus("#tAction"); await page.keyboard.press("Enter");
    assert.deepEqual((await live()).map(x => x[0]), ["action"]);
    assert.equal(await page.$$eval(".pop:not(.is-static) button", b => b.length), 1, "action: one button, never two");
    await page.keyboard.press("Escape");
  });
  await step("every variant stays inside a 360 viewport (16px edges), no sideways scroll", async () => {
    for (const t of ["tDoc", "tNote", "tTerm", "tAction", "tMedia"]) {
      await page.click("#" + t);
      const r = await page.$eval(".pop:not(.is-static)", p => { const b = p.getBoundingClientRect(); return [Math.round(b.left) >= 16, Math.round(b.right) <= innerWidth - 16, document.documentElement.scrollWidth <= innerWidth]; });
      assert.deepEqual(r, [true, true, true], t);
      await page.keyboard.press("Escape");
    }
  });
  await step("media: a graph.js figure at the popover's width, with an accessible name", async () => {
    await page.click("#tMedia");
    const m = await page.$eval(".pop:not(.is-static)", p => { const f = p.querySelector(".pop-fig"); return [f.getAttribute("role"), (f.getAttribute("aria-label") || "").length > 10, !!f.querySelector("svg"), f.querySelector("svg").getAttribute("width") <= p.clientWidth]; });
    assert.deepEqual(m, ["img", true, true, true]);
    await page.keyboard.press("Escape");
  });
  await step("reduced motion: it appears without animation", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.click("#tDoc");
    assert.equal(await page.$eval(".pop:not(.is-static)", p => getComputedStyle(p).animationName), "none");
    await page.keyboard.press("Escape");
  });
  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally { await browser.close(); }
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
