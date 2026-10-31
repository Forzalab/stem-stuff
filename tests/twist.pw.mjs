// W133 the Twist chip + its one-time toast (todo 133; copy LOCKED, Tony Oct 29, verbatim):
//   an item with `twist: true` shows a small "Twist" chip in the card's header, left of the title; a tap opens a note popover with the
//   locked copy. The first twist on a device also gets the short toast "You found a twist." + "What is that?" (which opens the chip's
//   popover); once per device (localStorage), so a reload or the next twist shows none. The toast never lies on the answer area (#q:
//   the box, the choices) or Next. A non-twist item: no chip, no header row, its card pixel-identical before and after a twist was open.
// Screens: 390x844, 1366x768, 1440x900. Starts its own serve.py with a throwaway banks/ folder (made-up items, never bank items):
//   node tests/twist.pw.mjs [port]      SHOTS=<dir> also saves chip + toast + popover shots at 390 and 1366
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
const PORT = +(process.argv[2] || 8857), BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS || "";
const TMP = mkdtempSync(join(tmpdir(), "tw-")), BANKS = join(TMP, "banks");
const TOAST = "You found a twist.", ACT = "What is that?";
const POP = "You’ll see twists often. These twists change one detail from real exam questions, which will improve retention.";
const sac = title => ({ title, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const num = (code, title, extra = {}) => ({ code, title, type: "num", body: [{ type: "text", md: `${code}: a made-up question, type 4.` }],
  answer: "4", unit: "m", nudge: "QUACK. Try again.", saccharine: sac(title), ...extra });
mkdirSync(BANKS);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
writeFileSync(join(BANKS, "BANK_TW1.json"), JSON.stringify({ v: 1, problems: [
  num("PHYS_W01", "Made-up Set, Question 1", { twist: true }),
  num("PHYS_W02", "Made-up Set, Question 2"),
  { code: "PHYS_W03", title: "Made-up Set, Question 3", type: "mc", twist: true, body: [{ type: "text", md: "PHYS_W03: pick a." }],
    choices: [{ id: "a", md: "one" }, { id: "b", md: "two" }], correct: "a", saccharine: sac("Made-up Set, Question 3") },
  num("PHYS_W04", "Made-up Set, Question 4", { twist: false })] }));
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
async function openBank(page, first) {
  await page.goto(BASE + "/");
  await showCode(page);
  await page.fill("#code", "BANK_TW1"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /^PHYS_W/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
  if (first) await go(page, first);
}
/* the card alone: the floating things (a stage toast, a note, a popover) are not the card */
const CARD = { animations: "disabled", style: ".stoast, #toast, .pop { visibility: hidden !important; }" };
const twistToastOn = page => page.evaluate(t => { const e = document.querySelector(".stoast.on"); return !!e && e.querySelector(".stoast-t").textContent === t; }, TOAST);
const waitToast = page => page.waitForFunction(t => { const e = document.querySelector(".stoast.on"); return !!e && e.querySelector(".stoast-t").textContent === t && !e.classList.contains("out"); }, TOAST, { timeout: 14000 });
/* the toast's rect against every box it must never lie on: the answer area (#q, the box / choices) and Next */
const overlaps = page => page.evaluate(() => {
  const t = document.querySelector(".stoast.on").getBoundingClientRect(), out = [];
  for (const e of document.querySelectorAll("#q, #q input, #q .opt, .nx, #ansGo")) {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const ix = Math.min(t.right, r.right) - Math.max(t.left, r.left), iy = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top);
    if (ix > 0 && iy > 0) out.push(`${e.id || e.className} ${ix}x${iy}`);
  }
  return { out, t: [t.left, t.top, t.width, t.height].map(Math.round) };
});

let browser = null;
try {
  browser = await pw.chromium.launch({ args: ["--no-sandbox"] });   // inside the try: a failed launch still kills the server
  await step("serve: /p/ carries `twist: true` only (false stays home), never the key", async () => {
    const a = await (await fetch(`${BASE}/p/PHYS_W01.json`)).json(), b = await (await fetch(`${BASE}/p/PHYS_W04.json`)).json();
    assert.equal(a.twist, true); assert.ok(!("answer" in a)); assert.ok(!("twist" in b), JSON.stringify(b));
  });
  for (const [w, h] of [[390, 844], [1366, 768], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    const page = await ctx.newPage();
    let card0 = null;
    await step(`${w}: a non-twist item has no chip, no header row, and no toast`, async () => {
      await openBank(page, "PHYS_W02");
      const s = await page.evaluate(() => ({ chip: !!document.querySelector(".twist-chip, #twistChip, .twist-row"), title: document.querySelector("#blocks .ptitle")?.textContent,
        kids: [...document.querySelector("#blocks").children].map(e => e.className) }));
      assert.equal(s.chip, false); assert.equal(s.title, "Made-up Set, Question 2"); assert.deepEqual(s.kids, ["ptitle", "md"]);
      card0 = await page.locator("#problem").screenshot(CARD);
      await go(page, "PHYS_W04");                                      // twist: false = no twist
      assert.equal(await page.locator(".twist-chip").count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem("stem-twist-seen")), null);
    });
    await step(`${w}: a twist item: the "Twist" chip sits in the header, left of the title, on one line`, async () => {
      await go(page, "PHYS_W01");
      const s = await page.evaluate(() => {
        const c = document.querySelector("#blocks .ptitle .twist-chip"), t = c?.parentElement, r = c.getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(t); rg.setStartAfter(c); const tr = rg.getBoundingClientRect();
        return { text: c.textContent, tag: c.tagName, first: t.firstChild === c, rowFirst: t === document.querySelector("#blocks").firstElementChild,
          title: t.textContent, gap: tr.left - r.right, dy: Math.abs((r.top + r.bottom) / 2 - (tr.top + tr.bottom) / 2), h: r.height };
      });
      assert.equal(s.text, "Twist"); assert.equal(s.tag, "BUTTON"); assert.ok(s.first && s.rowFirst, JSON.stringify(s));
      assert.equal(s.title, "TwistMade-up Set, Question 1");
      assert.ok(s.gap >= 4 && s.gap <= 16 && s.dy <= 3 && s.h >= 20, JSON.stringify(s));
    });
    await step(`${w}: the first twist on this device: the short toast, exact copy, over no answer box / choice / Next`, async () => {
      await waitToast(page);
      const s = await page.evaluate(() => { const e = document.querySelector(".stoast.on"), a = e.querySelector(".stoast-a");
        return { a: a?.textContent, btn: a?.classList.contains("btn") && !a.classList.contains("btn-go"), bar: getComputedStyle(e.querySelector(".stoast-bar")).display,
          seen: localStorage.getItem("stem-twist-seen") }; });
      assert.deepEqual(s, { a: ACT, btn: true, bar: "none", seen: "1" });
      const o = await overlaps(page); assert.deepEqual(o.out, [], JSON.stringify(o));
      if (SHOTS && w !== 1440) { await page.waitForTimeout(300); await page.screenshot({ path: join(SHOTS, `twist-toast-${w}.png`) }); }
    });
    await step(`${w}: "What is that?" opens the chip's popover, the copy exact; the toast goes`, async () => {
      await page.click(".stoast.on .stoast-a");
      await page.waitForSelector(".pop", { timeout: 3000 }); await page.waitForTimeout(400);   // its fade-in ends
      const s = await page.evaluate(() => { const p = document.querySelector(".pop"), c = document.querySelector("#twistChip");
        return { text: p.textContent, variant: p.dataset.variant, ctl: c.getAttribute("aria-controls") === p.id, exp: c.getAttribute("aria-expanded"),
          toast: [...document.querySelectorAll(".stoast.on .stoast-t")].some(t => t.textContent === "You found a twist."), under: p.getBoundingClientRect().top - c.getBoundingClientRect().bottom }; });
      assert.equal(s.text, POP); assert.equal(s.variant, "note"); assert.ok(s.ctl); assert.equal(s.exp, "true"); assert.equal(s.toast, false);
      assert.ok(Math.abs(s.under - 6) <= 1 || s.under < 0, JSON.stringify(s));
      if (SHOTS && w !== 1440) await page.screenshot({ path: join(SHOTS, `twist-popover-${w}.png`) });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".pop").count(), 0);
    });
    await step(`${w}: the chip's tap opens the same popover; a second tap closes it`, async () => {
      await page.click("#twistChip");
      assert.equal(await page.locator(".pop").textContent(), POP);
      if (SHOTS && w !== 1440) await page.locator("#problem").screenshot({ path: join(SHOTS, `twist-chip-${w}.png`) });
      await page.click("#twistChip");
      assert.equal(await page.locator(".pop").count(), 0);
    });
    await step(`${w}: once per device: the next twist and a reload show no toast; the chip stays`, async () => {
      await go(page, "PHYS_W03");
      assert.equal(await page.locator("#blocks .ptitle .twist-chip").count(), 1);
      await page.waitForTimeout(2500); assert.equal(await twistToastOn(page), false);
      await page.reload(); await opened(page, "PHYS_W03");
      assert.equal(await page.locator("#blocks .ptitle .twist-chip").count(), 1);
      await page.waitForTimeout(2500); assert.equal(await twistToastOn(page), false);
    });
    await step(`${w}: the non-twist card is pixel-identical after a twist was open (nothing leaks)`, async () => {
      await go(page, "PHYS_W02"); await page.waitForTimeout(300);
      const card1 = await page.locator("#problem").screenshot(CARD);
      assert.ok(card0 && card0.equals(card1), "the non-twist card changed");
    });
    await ctx.close();
  }
  await step("blocked storage: no toast (never a toast on every twist), the chip still shows", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => { const ls = window.localStorage; try { ls.setItem("stem-ob", "done"); } catch { /* */ }
      const get = ls.getItem.bind(ls); Storage.prototype.getItem = function (k) { if (k === "stem-twist-seen") throw new Error("blocked"); return get(k); }; });
    const page = await ctx.newPage();
    await openBank(page, "PHYS_W01");
    assert.equal(await page.locator("#twistChip").count(), 1);
    await page.waitForTimeout(5000); assert.equal(await twistToastOn(page), false);
    await ctx.close();
  });
} finally {
  await browser?.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
