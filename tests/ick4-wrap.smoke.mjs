// ICK4-WRAP smoke (Tony Nov 18, 3a): under ui-v7 the proof field is a contenteditable div whose text flows around the keys
// (Check, + the in-box duck while typing on a phone). Own serve.py, uploaded bank.
//   node tests/ick4-wrap.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8853), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "ick4wrap-")), "tries.json");
const LONG = "A cart rolls down a straight ramp with a steady acceleration. The ramp is 3.5 meters long and the cart starts from rest at the top. A student times the cart with a phone and writes the time on a sticky note. Another student measures the length of the ramp with a metal tape and records it twice. The two students then compare their numbers and argue about which measurement is more trustworthy. Before they answer, decide which quantity is the dependent one and which is the independent one, then explain how repeating each measurement would change the uncertainty in the final result.";
if (LONG.length < 400) throw new Error("ICK5 AC6 body is under 400 chars");
const FILE = { v: 1, problems: [
  { code: "PSY_T51", type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md: LONG }] },
  { code: "PSY_T52", type: "proof", how: "Say it in your own words.", body: [{ type: "text", md: "Maya must pick a phone this week and has time to read about each one. Leo does not care and is tired. Both see the same ad. Predict who is moved more by strong facts and who by a famous star. Explain why." }],
    proof: { reference: "Maya is motivated and able, so she uses the central route. Leo is low in motivation and ability, so he uses the peripheral route.", must: ["central route for Maya", "peripheral route for Leo"], hint: "QUACK. Who is ready to think hard?" } },
  { code: "PSY_T53", type: "text", answer: "yes", accept: ["true"], how: "Type yes or no.", body: [{ type: "text", md: "Is the number 4 even?" }] },
] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
async function fresh(ui, vp) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);   // flag only: no diet cookie, so sugar
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ick5.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_T51" && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
  return { ctx, page };
}
const go = async (page, code) => { await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => (document.querySelector("#pcode")?.textContent || "") === c && (document.querySelector("#q")?.textContent || "").length > 20, code, { timeout: 8000 }); await settled(page); };
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
const FILLER = Array.from({ length: 14 }, (_, k) => `Line ${k + 1}: Maya reads each claim with care, so strong facts move her more than a famous face does.`).join(" ");
/* every visual line of the typed text (client rects of the text nodes), the keys, the box */
const LINES = () => {
  const ans = document.getElementById("ans"), go = document.getElementById("ansGo"), duck = document.querySelector("#q .ff.proof > .cb-inbox");
  const w = document.createTreeWalker(ans, NodeFilter.SHOW_TEXT), rg = document.createRange(), raw = []; let n;
  while ((n = w.nextNode())) { rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width >= 1) raw.push({ t: r.top, b: r.bottom, l: r.left, r: r.right }); }
  const rows = [];
  for (const r of raw.sort((a, b) => a.t - b.t)) { const q = rows.find(x => Math.abs(x.t - r.t) <= 2); if (q) { q.l = Math.min(q.l, r.l); q.r = Math.max(q.r, r.r); q.b = Math.max(q.b, r.b); } else rows.push({ ...r }); }
  const box = r => r && (({ top, bottom, left, right }) => ({ t: top, b: bottom, l: left, r: right }))(r.getBoundingClientRect());
  return { rows, go: box(go), duck: box(duck), tag: ans.tagName, ce: ans.contentEditable };
};
const hit = (a, k) => k && a.l < k.r - 0.5 && a.r > k.l + 0.5 && a.t < k.b - 0.5 && a.b > k.t + 0.5;
async function wrap(vp, name, withDuck) {
  const { ctx, page } = await fresh(true, vp);
  await go(page, "PSY_T52");
  await step(`${name}: the v7 proof field is a contenteditable div with a textarea's .value / .disabled`, async () => {
    const a = await page.evaluate(() => { const e = document.getElementById("ans"); return { tag: e.tagName, ce: e.isContentEditable, v: e.value, dis: e.disabled, empty: e.classList.contains("empty"), go: document.getElementById("ansGo").disabled }; });
    assert.deepEqual(a, { tag: "DIV", ce: true, v: "", dis: false, empty: true, go: true });
  });
  await step(`${name}: typing enables Check; Enter is a new line in .value`, async () => {
    await page.locator("#ans").click(); await page.keyboard.type("one"); await page.keyboard.press("Enter"); await page.keyboard.type("two");
    const a = await page.evaluate(() => ({ v: document.getElementById("ans").value, go: document.getElementById("ansGo").disabled, empty: document.getElementById("ans").classList.contains("empty") }));
    assert.deepEqual(a, { v: "one\ntwo", go: false, empty: false });
  });
  await step(`${name}: long text wraps AROUND the key${withDuck ? "s (duck + Check)" : ""}: no line under a key, the lines beside it are short`, async () => {
    await page.locator("#ans").fill(FILLER); await page.locator("#ans").press("End"); await settled(page);
    await page.evaluate(() => { const s = document.querySelector("#q .ff.proof > .pwrap"); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(350);
    const m = await page.evaluate(LINES);
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/wrap-${vp.width}.png` });
    if (withDuck) assert.ok(m.duck, "the duck sits in the box while typing");
    const keys = [m.go, m.duck].filter(Boolean), left = Math.min(...keys.map(k => k.l)), top = Math.min(...keys.map(k => k.t));
    assert.ok(m.rows.length >= 6, "enough lines: " + m.rows.length);
    const under = m.rows.filter(r => keys.some(k => hit(r, k)));
    assert.equal(under.length, 0, "lines under a key: " + JSON.stringify(under.slice(0, 2)) + " keys " + JSON.stringify(keys));
    const beside = m.rows.filter(r => r.b > top + 1), above = m.rows.filter(r => r.b <= top + 1);
    assert.ok(beside.length >= 1, "the last lines sit level with the keys (the text runs to the box foot): last row " + JSON.stringify(m.rows.at(-1)) + " key top " + top);
    assert.ok(beside.every(r => r.r <= left + 2), "beside rows end left of the keys (+2: a hanging space at the line end counts in the rect): " + JSON.stringify(beside) + " left " + left);
    const wide = Math.max(...above.map(r => r.r));
    assert.ok(wide > left + 20, `a line above uses the full width (${wide} vs key left ${left})`);
  });
  await step(`${name}: .value = "" brings the placeholder state back; .disabled closes the box`, async () => {
    const a = await page.evaluate(() => { const e = document.getElementById("ans"); e.value = ""; const empty = e.classList.contains("empty"); e.value = "kept"; e.disabled = true;
      return { empty, v: e.value, ce: e.isContentEditable, dis: e.disabled, aria: e.getAttribute("aria-disabled") }; });
    assert.deepEqual(a, { empty: true, v: "kept", ce: false, dis: true, aria: "true" });
  });
  await ctx.close();
}
await wrap({ width: 390, height: 844 }, "phone 390", true);
await wrap({ width: 1280, height: 800 }, "desk 1280", false);
{
  const { ctx, page } = await fresh(false, { width: 390, height: 844 });
  await go(page, "PSY_T52");
  await step("flag off: the proof field is still a <textarea>", async () => { assert.equal(await page.$eval("#ans", e => e.tagName), "TEXTAREA"); });
  await ctx.close();
}
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
