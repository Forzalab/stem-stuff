// DUCKTAB smoke (ICK-R2 E3, Tony Nov 17; ICK5-CLUCK-TR Nov 18): under html.ui-v7 the one Ask Cluck button is the card's top-right
// tangerine squircle now (tests/ick5-cluck-tr.smoke.mjs pins its place and the wrap). This file keeps the pins that still hold: the code
// kicker is gone, the accessible name is Ask Cluck, and with no ui-v7 no .cluckbtn is fixed. Phone 390x844, own serve.py, upload a sugar
// bank with a wish layer (so brainrot mounts its stashed handle).
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

let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
try {
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
