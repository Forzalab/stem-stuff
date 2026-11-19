// ICK5-NOROT smoke (Tony Nov 18: "disable brainrot on mobile phone. this includes the sidebar expand button."):
// html.ui-v7, a sugar question with a wish layer open (so brainrot wants to mount). Phone = viewport width < 900px:
// no visible .rot, no visible .rot .rtab, no youtube iframe in the DOM and no youtube/ytimg request (a CSS-only
// display:none on .rot still builds the iframes, so AC2 catches it). Desktop 900x800 and 1280x900 keep the dock
// (a .rot with a live youtube player). A live dock at 1280x900 resized to 800x900 hides within 1 s and a visible .rot
// comes back within 1.5 s at 1280x900. Boot copied from ducktab.smoke.mjs: own serve.py on a free port, upload a
// one-problem sugar bank with a wish layer, ?ui=v7 turns the flag on.
//   STEM_TODAY=2026-10-23 node tests/ick5-norot.smoke.mjs [port]
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
const PORT = +(process.argv[2] || 8867), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "ick5-norot-")), "tries.json");
/* one sugar problem with a wish layer: stemBrainrotWanted() is sugar + wish, so brainrot wants to mount (desktop: the dock;
   phone before ICK5: the 44x96 stashed handle) */
const FILE = { v: 1, problems: [{ code: "CSCI26_U01", title: "Practice, Question 1", type: "mc", how: "Pick one", wish: true, shuffle: false,
  body: [{ type: "text", md: "Which number is even?" }],
  choices: ["2", "3", "4", "5"].map((md, i) => ({ id: "abcd"[i], md })), correct: ["a"] }] };

const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)],
  { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_TRIES: TRIES }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const opened = page => page.waitForFunction(() => /^CSCI26_U/.test(document.querySelector("#pcode")?.textContent || "")
  && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });

/* VISIBLE (in-page, shared by the helpers below): an element counts as visible when it has a box and none of the standard
   hides (display:none, visibility:hidden, opacity:0) is on it. The AC says "absent or a 0x0 / display:none box"; the extra
   two hides are accepted too, so any standard way of hiding passes and only a brainrot the student can actually see fails. */
const SHOWN = `(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && r.width > 0 && r.height > 0; })`;
const shown = (page, sel = ".rot, .rot .rtab") => page.evaluate(([s, src]) => {
  const seen = eval(src);
  return [...document.querySelectorAll(s)].filter(seen)
    .map(e => (e.id ? "#" + e.id : "") + (e.classList?.length ? "." + [...e.classList].join(".") : "") || e.tagName.toLowerCase());
}, [sel, SHOWN]);
const waitGone = (page, ms) => page.waitForFunction(src => {
  const seen = eval(src);
  return ![...document.querySelectorAll(".rot, .rot .rtab")].some(seen);
}, SHOWN, { timeout: ms });
const waitShown = (page, ms) => page.waitForFunction(src => {
  const seen = eval(src);
  return [...document.querySelectorAll(".rot")].some(seen);
}, SHOWN, { timeout: ms });
const ytIframes = page => page.$$eval("iframe", es => es.map(e => e.src || "").filter(s => /youtube/i.test(s)));

async function fresh(vp, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);   // flag only: no stem-mode=diet, so modeOf() = sugar
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", r => reqs.push(r.url()));                              // armed before goto: the iframes build on load
  await page.goto(`${BASE}/?ui=v7`);                                        // ui-v7 the way ducktab does it
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ick5-norot.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await opened(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), true, "the ui-v7 flag is on");
  return { ctx, page, reqs };
}

let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
try {
  await step("AC1 390x844 (touch): +1500 ms after the question opens, no visible .rot and no visible .rot .rtab (want 0)", async () => {
    const { ctx, page } = await fresh({ width: 390, height: 844 }, { touch: true });
    await page.waitForTimeout(1500);
    const vis = await shown(page);
    assert.deepEqual(vis, [], `visible brainrot on a phone (want none): ${vis.join(", ") || "-"}`);
    await ctx.close();
  });

  await step("AC2 390x844: no youtube iframe in the DOM and no youtube/ytimg request (a CSS-only display:none on .rot still builds them: this fails it)", async () => {
    const { ctx, page, reqs } = await fresh({ width: 390, height: 844 }, { touch: true });
    await page.waitForTimeout(1500);
    const probs = [
      ...(await ytIframes(page)).map(u => "iframe: " + u),
      ...reqs.filter(u => /youtube|ytimg/i.test(u)).map(u => "request: " + u)
    ];
    assert.deepEqual(probs, [], `youtube on a phone (want none) - ${probs.length}:\n       ${probs.join("\n       ") || "-"}`);
    await ctx.close();
  });

  await step("AC3 899x800 (no touch): AC1+AC2 again (899 is a phone): no visible .rot/.rtab, no youtube iframe, no youtube/ytimg request", async () => {
    const { ctx, page, reqs } = await fresh({ width: 899, height: 800 });
    await page.waitForTimeout(1500);
    const probs = [
      ...(await shown(page)).map(e => "visible: " + e),
      ...(await ytIframes(page)).map(u => "iframe: " + u),
      ...reqs.filter(u => /youtube|ytimg/i.test(u)).map(u => "request: " + u)
    ];
    assert.deepEqual(probs, [], `brainrot at 899 (want none) - ${probs.length}:\n       ${probs.join("\n       ") || "-"}`);
    await ctx.close();
  });

  for (const [W, H] of [[900, 800], [1280, 900]]) await step(`AC4 ${W}x${H}: brainrot DOES mount (a visible .rot with at least one youtube player)`, async () => {
    const { ctx, page } = await fresh({ width: W, height: H });
    await page.waitForFunction(() => { const f = document.querySelector(".rot iframe"); return !!f && /youtube/i.test(f.src); }, null, { timeout: 10000 })
      .catch(() => { /* asserted below, with the count */ });
    assert.ok((await page.$$eval(".rot", es => es.length)) >= 1, "no .rot at desktop width");
    const frames = await page.$$eval(".rot iframe", es => es.map(e => e.src || "").filter(s => /youtube/i.test(s)));
    assert.ok(frames.length >= 1, `no youtube player inside .rot (${frames.length})`);
    const vis = await shown(page, ".rot");
    assert.ok(vis.length >= 1, "the .rot is there but not visible");
    await ctx.close();
  });

  await step("AC5 dock live at 1280x900 -> 800x900: no visible .rot/.rtab within 1000 ms -> 1280x900: a visible .rot returns within 1500 ms", async () => {
    const { ctx, page } = await fresh({ width: 1280, height: 900 });
    await page.waitForFunction(() => { const f = document.querySelector(".rot iframe"); return !!f && /youtube/i.test(f.src); }, null, { timeout: 10000 });
    await page.setViewportSize({ width: 800, height: 900 });
    await waitGone(page, 1000).catch(e => { throw new Error(`at 800x900 brainrot is still visible 1000 ms after the resize (${e.message.split("\n")[0]})`); });
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitShown(page, 1500).catch(() => { throw new Error("back at 1280x900: no visible .rot 1500 ms after the resize"); });
    await page.waitForFunction(() => [...document.querySelectorAll(".rot iframe")].some(f => /youtube/i.test(f.src || "")), null, { timeout: 3000 })
      .catch(() => { /* asserted below */ });
    const frames = await page.$$eval(".rot iframe", es => es.map(e => e.src || "").filter(s => /youtube/i.test(s)));
    assert.ok(frames.length >= 1, `the .rot came back but has no player (${frames.length})`);
    await ctx.close();
  });

  await step("AC6 390x844: no other visible control whose aria-label or text matches /video|brainrot/i (the expand button is gone)", async () => {
    const { ctx, page } = await fresh({ width: 390, height: 844 }, { touch: true });
    await page.waitForTimeout(1500);
    const hits = await page.evaluate(src => {
      const seen = eval(src);
      return [...document.querySelectorAll("button, a, input, select, textarea, summary, [role=button], [role=tab], [role=switch], [aria-label]")]
        .filter(e => !e.closest("iframe"))
        .filter(seen)
        .map(e => ({ e, t: [e.getAttribute("aria-label"), e.getAttribute("title"), e.innerText].filter(Boolean).join(" ") }))
        .filter(x => /video|brainrot/i.test(x.t))
        .map(x => `${x.e.tagName.toLowerCase()}${x.e.id ? "#" + x.e.id : ""} [${x.t.replace(/\s+/g, " ").trim().slice(0, 90)}]`);
    }, SHOWN);
    assert.deepEqual(hits, [], `visible video/brainrot controls on a phone (want none): ${hits.join(" | ") || "-"}`);
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
