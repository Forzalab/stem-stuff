// Todo 114 / W114f (Tony Nov 2: 114r v1f WINNER, "build + ship"): the typed-answer reveal box. After Check (right, or wrong and out of tries) in sugar:
//   (a) nothing jumps: Next sits where Check was (y-shift <= 1 px, field and card too), at 390 and 1280
//   (b) Ask Cluck is in the verdict drawer under the bar (B3 PR-B1 replaced the flush right segment): a sibling of the field, solid Cluck colours, the simple inline-SVG duck, small and inline
//   (c) Next is OUTSIDE the field box, beside it
//   (d) the line under the field is a plain sentence: wrong "Not it. The answer is 3.03 s" + the copy icon, right "That's it! The answer is ..."
// Starts its own serve.py (static files); the bank and /check are routed.   node tests/reveal-box.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8851), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const P = [{ code: "PHYS_RRN", title: "Practice, Question 1", type: "num", unit: "s", how: "Number, in s", wish: true, body: [{ type: "text", md: "A ball drops from 45 m, from rest. How long until it lands?" }] }];
const BANK = "BANK_RB114";
async function pageFor(browser, W, H) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  let tries = 0;
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "PHYS_RRN" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Fall time\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON();
    if (b.answer === "3.03") return r.fulfill({ json: { verdict: "correct" } });
    tries++;
    return r.fulfill({ json: { verdict: "wrong", triesLeft: Math.max(0, 2 - tries), ...(tries >= 2 ? { correct: "3.03" } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_RRN", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
const R = `(e => e && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(e.getBoundingClientRect()))`;
const pos = page => page.evaluate(`(() => { const R = ${R}, y = window.scrollY; const g = s => R(document.querySelector(s));
  return { chk: g("#ansGo"), nx: g("#q .nx"), ff: g("#ff"), card: g("#q"), fz: g("#freezeIn"), room: document.querySelector("#q .vd-room")?.getBoundingClientRect().height || 0, y }; })()`);
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
// BIG PLAN V1 (Tony Nov 2): desktop sugar (>= 720) shows no drawer chip (its box is open and carries Cluck), so the wide pass runs at 700
for (const [W, H] of [[390, 844], [700, 900]]) for (const outcome of ["right", "out"]) {
  const T = `${W}x${H} ${outcome}`;
  const page = await pageFor(browser, W, H);
  const go = async v => { await page.fill("#ans", v); await page.evaluate(() => document.querySelector("#ansGo").click()); };
  // "before" = the state the closing Check is pressed in (out: after the first wrong try; its pips row is the tries' own, older, design)
  if (outcome === "out") { await go("1"); await page.waitForSelector("#ff.bad"); await page.waitForTimeout(900); }
  await page.fill("#ans", outcome === "right" ? "3.03" : "2");
  const before = await pos(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/before-${outcome}-${W}.png` });
  await go(outcome === "right" ? "3.03" : "2");
  await page.waitForSelector("#q .nx", { timeout: 5000 });
  await page.waitForSelector(".cue-chip", { timeout: 5000 });
  await page.waitForTimeout(1500);
  const after = await pos(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${outcome === "right" ? "correct" : "wrong"}-${W}.png` });
  await step(`${T}: nothing jumps (Next where Check was, field and card too)`, async () => {
    const dy = (after.nx.top + 2 + after.y) - (before.chk.top + before.y);   // Next's hit box is 52 tall with a 2px inset face (48): the face is what sits where Check was
    console.log(`     measured Next-after minus Check-before: dy=${dy.toFixed(2)}px; Next face top ${(after.nx.top + 2).toFixed(1)} vs Check top ${before.chk.top.toFixed(1)}`);
    assert.ok(Math.abs(after.ff.top + after.y - before.ff.top - before.y) <= 1, "the field moved");
    assert.ok(Math.abs(after.card.top + after.y - before.card.top - before.y) <= 1, "the question card moved");
    console.log(`     the question block grew ${(after.fz.height - before.fz.height).toFixed(2)}px (the old chip row added its own height under the field)`);
    assert.ok(after.fz.height - before.fz.height <= after.room + 1, `the block under the field grew ${after.fz.height - before.fz.height}px: only the open tray's own room (${after.room}px, Tony Nov 4: it slips out from under the box and keeps its room while shown) may be added after Check`);
    assert.ok(Math.abs(after.nx.top + after.nx.height / 2 - before.chk.top - before.chk.height / 2) <= 1 && Math.abs(dy) <= 1, `Next moved: centre ${after.nx.top + after.nx.height / 2} vs Check ${before.chk.top + before.chk.height / 2}`);
  });
  await step(`${T}: Ask Cluck is in the verdict drawer under the bar (a sibling, solid Cluck colours, inline SVG duck); Next is outside the field`, async () => {
    // B3 PR-B1 (Tony "ship it", Nov 2) replaced the 114r v1f flush right segment: the chip is docked in the drawer (strip.js), layer order bar > drawer > later content
    const g = await page.evaluate(`(() => { const R = ${R}; const ff = document.querySelector("#ff"), dr = document.querySelector("#q .vdrawer"), chip = dr && dr.querySelector(".cue-chip"), nx = document.querySelector("#q .nx");
      const cs = chip && getComputedStyle(chip), tok = n => { const d = document.createElement("i"); d.style.color = "var(--" + n + ")"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      return { ff: R(ff), dr: dr && R(dr), chip: chip && R(chip), nx: R(nx), inside: !!chip, inField: !!ff.querySelector(".wchip"), sib: !!dr && dr.parentElement === ff.parentElement && !ff.contains(dr), svg: !!chip?.querySelector("svg.dk"), img: !!chip?.querySelector("img"),
        bg: cs?.backgroundColor, help: tok("help"), ink: tok("help-ink"), col: cs?.color, label: chip?.querySelector("span")?.textContent,
        dk: chip && R(chip.querySelector(".dk")) }; })()`);
    assert.ok(g.inside && g.sib, "Ask Cluck is not in a drawer that is the field's sibling"); assert.equal(g.inField, false, "no chip left in the field");
    assert.ok(g.chip.left >= g.dr.left - 0.5 && g.chip.right <= g.dr.right + 0.5, "the chip is inside the drawer");
    assert.ok(Math.abs(g.dr.left - g.ff.left) <= 1, `drawer and field share the left edge ${g.dr.left} vs ${g.ff.left}`);   // Tony, Nov 4: the tray is anchored bottom-LEFT under the box (was: right edges equal)
    assert.ok(g.nx.left >= g.ff.right - 0.5, `Next is not outside the field (nx.left ${g.nx.left}, field.right ${g.ff.right})`);
    assert.ok(g.nx.left - g.ff.right <= 10, "Next is not beside the field");
    assert.ok(g.svg && !g.img, "the duck is not the inline SVG");
    assert.equal(g.bg, g.help, "solid Cluck fill"); assert.equal(g.col, g.ink, "Cluck ink label");
    assert.equal(g.label, outcome === "right" ? "See steps" : "Ask Cluck");
    assert.ok(g.dk.height <= 24 && g.dk.height > 0, `the duck must be a small inline icon (h ${g.dk.height})`);
  });
  await step(`${T}: the line under the field is a plain sentence with the copy icon`, async () => {
    const g = await page.evaluate(`(() => { const l = document.querySelector("#q .ansl"); const c = l?.querySelector(".mcopy"), b = l?.querySelector("b");
      return { t: (l?.textContent || "").replace(/\\s+/g, " ").trim(), copy: !!c, inFf: !!l?.closest(".ff"), chipLike: l ? getComputedStyle(l).borderTopWidth : "" }; })()`);
    if (outcome === "out") assert.match(g.t, /^Not it\. The answer is 3\.03\s*s$/, g.t);
    else assert.match(g.t, /^That's it! The answer is 3\.03\s*s$/, g.t);
    assert.ok(g.copy, "no copy icon"); assert.ok(!g.inFf, "the line must sit under the field, not in it"); assert.equal(g.chipLike, "0px", "no chip border");
  });
  await page.ctx.close();
}
await browser.close();
srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
