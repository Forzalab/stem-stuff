// W132 answer units (todo 132; Tony Oct 29 "every answer shall show the units", LOCKED "green ok, but put units in white"):
//   the sugar reveal's "Answer" line (and a multi part's hint slot) shows value + U+2009 + unit: the value green + bold as before,
//   the unit in the plain ink (--ink), regular weight, ^n as a superscript. Unitless ("" or no unit) = the value only, no gap,
//   the old markup. Copy = the value only (WebAssign has its own unit box). serve.py lets `unit` through, never the key; `twist: true`
//   goes too since W133 (the Twist chip, tests/twist.pw.mjs).
// Screens: 390x844, 1366x768, 1440x900. Starts its own serve.py with a throwaway banks/ folder:   node tests/units.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8853), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "un-")), BANKS = join(TMP, "banks");
const sac = title => ({ title, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const num = (code, answer, unit, extra = {}) => ({ code, type: "num", body: [{ type: "text", md: `${code}: type ${answer}.` }], answer,
  ...(unit != null ? { unit } : {}), nudge: "QUACK. Try again.", saccharine: sac(code), ...extra });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_UN1.json"), JSON.stringify({ v: 1, problems: [
  num("PHYS_U01", "2.02", "m/s^2", { twist: true }),
  num("PHYS_U02", "3.5", ""),
  num("PHYS_U03", "7", null),
  { code: "PHYS_U04", type: "multi", body: [{ type: "text", md: "PHYS_U04: two boxes." }], saccharine: sac("PHYS_U04"),
    parts: [{ type: "num", answer: "4", unit: "kg·m^2/s" }, { type: "num", answer: "5", unit: "" }] },
  num("PHYS_U05", "1.5", "10^4 kg·m^2/s")] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function showCode(page) { for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); } }
async function openBank(page) {
  await page.goto(BASE + "/");
  await showCode(page);
  await page.fill("#code", "BANK_UN1"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /^PHYS_U/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
}
async function typed(page, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill("#ans", v); await page.click("#ansGo");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function typedPart(page, i, v) {
  const row = `#q .part[data-i="${i}"]`, n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill(`${row} .ans`, v); await page.press(`${row} .ans`, "Enter");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function lockOut(page, code, part) {   // two wrong tries shut a num (or one part) and, in sugar, reveal the answer
  await go(page, code);
  for (const v of ["901", "902"]) await (part == null ? typed(page, v) : typedPart(page, part, v));
  await page.waitForSelector(part == null ? "#q .ansl" : `#q .part[data-i="${part}"] .ansl`, { timeout: 6000 });
}
/* the answer line as the eye sees it: texts, colours, weights, where the unit sits */
const line = (page, sel) => page.evaluate(sel => {
  const l = document.querySelector(sel), b = l.querySelector("b"), u = l.querySelector(".ansu"), cs = e => getComputedStyle(e);
  const probe = document.createElement("i"); probe.style.color = "var(--ink)"; l.appendChild(probe);
  const ink = cs(probe).color; probe.style.color = "var(--correct)"; const green = cs(probe).color; probe.remove();
  const br = b.getBoundingClientRect(), ur = u?.getBoundingClientRect();
  return { h: l.getBoundingClientRect().height, text: l.textContent, b: b.textContent, bColor: cs(b).color, bWeight: +cs(b).fontWeight, ink, green,
    u: u ? { text: u.textContent, html: u.innerHTML, color: cs(u).color, weight: +cs(u).fontWeight, sup: u.querySelector("sup")?.textContent ?? null,
      gap: ur.left - br.right, dy: Math.abs((ur.top + ur.bottom) / 2 - (br.top + br.bottom) / 2), prev: u.previousSibling?.textContent ?? null } : null };
}, sel);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("serve: /p/ carries `unit` (num item, num parts) and `twist: true` (W133), never the key", async () => {
    const a = await (await fetch(`${BASE}/p/PHYS_U01.json`)).json();
    assert.equal(a.unit, "m/s^2"); assert.equal(a.twist, true); assert.ok(!("answer" in a), JSON.stringify(a));
    const m = await (await fetch(`${BASE}/p/PHYS_U04.json`)).json();
    assert.deepEqual(m.parts.map(q => q.unit), ["kg·m^2/s", ""]); assert.ok(!m.parts.some(q => "answer" in q));
    assert.ok(!("unit" in (await (await fetch(`${BASE}/p/PHYS_U03.json`)).json())));
  });
  for (const [w, h] of [[390, 844], [1366, 768], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    const page = await ctx.newPage();
    let hUnit = NaN;
    await openBank(page);
    await step(`${w}: the Answer line = value (green, bold, as before) + U+2009 + unit (--ink, regular, ^2 a superscript)`, async () => {
      await lockOut(page, "PHYS_U01");
      const L = await line(page, "#q .ansl");
      assert.equal(L.b, "2.02");
      assert.ok(L.u, "a unit span: " + L.text);
      assert.equal(L.u.text, "m/s2"); assert.equal(L.u.sup, "2");
      assert.equal(L.u.prev, " ", "a thin space between value and unit");
      assert.equal(L.bColor, L.green, "the value stays green"); assert.ok(L.bWeight >= 600, "the value stays bold");
      assert.equal(L.u.color, L.ink, "the unit is the plain ink (white)"); assert.equal(L.u.weight, 400, "the unit is regular weight");
      assert.ok(L.u.gap > 0 && L.u.gap < 6, "a thin gap, on the value's line: " + L.u.gap);
      assert.ok(L.u.dy < 4, "same line: " + L.u.dy);
      hUnit = L.h;
      assert.match(await page.textContent("#sr"), /2\.02\s?m\/s2/, "the spoken line says the unit too");
    });
    await step(`${w}: Copy answer copies the value only`, async () => {
      await page.evaluate(() => navigator.clipboard.writeText("<empty>"));
      await page.locator("#q .ansl .mcopy").click();
      await page.waitForSelector("#q .ansl .mcopy.done");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "2.02");
    });
    await step(`${w}: a long unit (10^4 kg·m^2/s) keeps both superscripts, on the value's line`, async () => {
      await lockOut(page, "PHYS_U05");
      const L = await line(page, "#q .ansl");
      assert.equal(L.u.text, "104 kg·m2/s"); assert.equal(L.u.html, "10<sup>4</sup> kg·m<sup>2</sup>/s");
      assert.ok(L.u.dy < 4, "same line: " + L.u.dy);
    });
    await step(`${w}: unitless ("" or no unit): the value only, no gap, no unit span`, async () => {
      for (const c of ["PHYS_U02", "PHYS_U03"]) {
        await lockOut(page, c);
        const L = await line(page, "#q .ansl");
        assert.equal(L.u, null, c); assert.ok(!L.text.includes(" "), c);
        assert.ok(Math.abs(L.h - hUnit) < 0.5, `no jank: the line with m/s^2 is as tall as the unitless one (${hUnit} vs ${L.h})`);
        assert.equal(await page.$eval("#q .ansl b", b => b.parentElement.className), "ansl", c + ": the old markup");
      }
    });
    await step(`${w}: a multi: each num part's hint slot shows its own unit (part B unitless)`, async () => {
      await lockOut(page, "PHYS_U04", 0);
      const A = await line(page, '#q .part[data-i="0"] .ansl');
      assert.equal(A.b, "4"); assert.equal(A.u?.text, "kg·m2/s"); assert.equal(A.u.color, A.ink); assert.equal(A.bColor, A.green);
      await typedPart(page, 1, "901"); await typedPart(page, 1, "902");
      await page.waitForSelector('#q .part[data-i="1"] .ansl');
      assert.equal((await line(page, '#q .part[data-i="1"] .ansl')).u, null);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
