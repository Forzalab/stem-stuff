// DUCKTAB smoke (ICK-R2 E3, Tony Nov 17): under html.ui-v7 the Ask Cluck button leaves the card's top row and becomes a tangerine
// tab fixed on the LEFT screen edge, stacked 8px above the brainrot handle (#rot .rtab); the code kicker is gone. Phone 390x844,
// own serve.py, upload a sugar bank with a wish layer (so brainrot mounts its stashed handle).
//   node tests/ducktab.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8841), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "ducktab-")), "tries.json");
/* one sugar problem with a wish layer: stemBrainrotWanted() is sugar + wish, so brainrot builds its 44x96 stashed handle */
const FILE = { v: 1, problems: [{ code: "CSCI26_U01", title: "Practice, Question 1", type: "mc", how: "Pick one", wish: true, shuffle: false,
  body: [{ type: "text", md: "Which number is even?" }],
  choices: ["2", "3", "4", "5"].map((md, i) => ({ id: "abcd"[i], md })), correct: ["a"] }] };

const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const opened = page => page.waitForFunction(() => /^CSCI26_U/.test(document.querySelector("#pcode")?.textContent || "")
  && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
async function fresh(ui) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);   // flag only: no stem-mode=diet, so modeOf() = sugar
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ducktab.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await opened(page);
  return { ctx, page };
}
const tabSel = "#problem.qc7.qbr > button.cluckbtn";
const geom = page => page.evaluate(sel => {
  const b = document.querySelector(sel); if (!b) return null;
  const probe = document.createElement("div"); probe.style.background = "var(--help)"; document.body.appendChild(probe);
  const want = getComputedStyle(probe).backgroundColor; probe.remove();
  const cs = getComputedStyle(b);
  return { pos: cs.position, left: cs.left, w: cs.width, h: cs.height, bg: cs.backgroundColor, want, bottom: cs.bottom };
}, tabSel);

let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
try {
  await step("A: ui-v7: the Ask Cluck tab is fixed, left 0, 44x60, tangerine (--help)", async () => {
    const { ctx, page } = await fresh(true);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), true, "the ui-v7 flag is on");
    await page.waitForSelector(tabSel, { timeout: 6000 });
    const g = await geom(page);
    assert.equal(g.pos, "fixed", "position: fixed (left edge tab)");
    assert.equal(g.left, "0px", "flush with the left edge");
    assert.equal(g.w, "44px", "the handle's 44px width");
    assert.equal(g.h, "60px", "a tab, not a panel");
    assert.equal(g.bg, g.want, `background is --help (${g.want}), got ${g.bg}`);
    await ctx.close();
  });

  await step("B: ui-v7: the code kicker (span.qkicker) is not displayed", async () => {
    const { ctx, page } = await fresh(true);
    await page.waitForSelector(tabSel, { timeout: 6000 });
    const d = await page.evaluate(() => { const k = document.querySelector("#problem > .qkicker"); return k ? getComputedStyle(k).display : null; });
    assert.ok(d === null || d === "none", `span.qkicker is displayed (${d})`);
    await ctx.close();
  });

  await step("C: ui-v7: the accessible name is still Ask Cluck", async () => {
    const { ctx, page } = await fresh(true);
    await page.waitForSelector(tabSel, { timeout: 6000 });
    assert.equal(await page.locator("#problem").getByRole("button", { name: /ask cluck/i }).count(), 1, "no Ask Cluck button by name");
    const txt = await page.locator(`${tabSel} .cb-t`).evaluate(e => e.textContent.trim());
    assert.match(txt, /ask cluck/i, "the hidden label text is the name");
    await ctx.close();
  });

  await step("D: ui-v7: tab bottom edge = 8px above #rot .rtab (fallback: rest spot 164px)", async () => {
    const { ctx, page } = await fresh(true);
    await page.waitForSelector(tabSel, { timeout: 6000 });
    let live = true;
    try {
      await page.waitForFunction(() => {
        const h = document.querySelector("#rot .rtab");
        return !!h && getComputedStyle(h).display !== "none" && h.getBoundingClientRect().height > 0;
      }, null, { timeout: 3000 });
    } catch { live = false; }
    if (!live) {
      const g = await geom(page);
      assert.equal(await page.locator(tabSel).evaluate(b => b.style.getPropertyValue("--ick7-b")), "", "--ick7-b set with no live handle");
      assert.equal(g.bottom, "164px", `no handle: the sheet's rest spot (bottom ${g.bottom})`);
      console.log("     (brainrot handle never mounted in this run: asserted the 164px rest spot instead)");
    } else {
      await page.waitForFunction(sel => document.querySelector(sel).style.getPropertyValue("--ick7-b") !== "", tabSel, { timeout: 3000 });
      const d = await page.evaluate(sel => {
        const b = document.querySelector(sel), h = document.querySelector("#rot .rtab");
        return { gap: h.getBoundingClientRect().top - b.getBoundingClientRect().bottom, prop: b.style.getPropertyValue("--ick7-b") };
      }, tabSel);
      assert.ok(Math.abs(d.gap - 8) <= 1, `the tab sits ${d.gap}px above the handle (spec: 8), --ick7-b=${d.prop || "unset"}`);
      assert.notEqual(d.prop, "", "--ick7-b is set from the live handle");
    }
    await ctx.close();
  });

  await step("E: no ui-v7: the button is NOT fixed", async () => {
    const { ctx, page } = await fresh(false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), false, "the flag is off");
    await page.waitForTimeout(600);
    const fixed = await page.evaluate(() => [...document.querySelectorAll(".cluckbtn")].some(b => getComputedStyle(b).position === "fixed"));
    assert.equal(fixed, false, "a .cluckbtn is fixed without the flag");
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
