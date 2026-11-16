// B3 PR-B2 answer strip: the cabinet drawer for single multiple choice, pick-all and multi-part (extends strip-layers.pw.mjs, PR-B1, which owns the typed answers).
//   single mc  drawer spans the picked row: [Ask Cluck][Skip | Next][^]; Next = the one filled --action control once the question is closed (v10check: COMPUTED bg = --action);
//              the labelled Next in the row's slot stays (Tony Nov 2: both); inline pill rows: the drawer follows the group
//   pick-all   one drawer under the whole list (the .chk row); multi: one drawer, on the part whose verdict is newest, one Ask Cluck chip per question
//   reopen     mc / pick-all: tap the row's mark (a .vkb button over it; the rows' own buttons are disabled once closed); multi keeps each part's .vk;
//              the first close by ^ shows a one-time toast ("tap the badge") and never again
// For every case: the drawer is open after the verdict (not a child of its host), nothing is painted over it, closing it moves nothing (0 reflow), focus returns to the
// reopen target. Every check runs once the drawer's slide has finished (drawerSettled / drawerGone / drawerAt, no fixed sleeps). Own serve.py; the bank and /check are routed.   node tests/strip-layers-mc.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8863), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 500;   // > the 380 ms drawer slide

const txt = md => [{ type: "text", md }];
const ch = (...ids) => ids.map(id => ({ id, md: id === "a" ? "The first long choice about the ball" : `Choice ${id.toUpperCase()}, a sentence about the ball` }));
const P = [
  { code: "STM_MCQ", title: "Practice, Question 1", type: "mc", how: "Pick one", wish: true, body: txt("A ball drops from rest. Which is true?"), choices: ch("a", "b", "c", "d") },
  { code: "STM_INL", title: "Practice, Question 2", type: "mc", how: "Pick one", wish: true, body: txt("Does it speed up?"), choices: [{ id: "a", md: "Yes" }, { id: "b", md: "No" }, { id: "c", md: "Maybe" }] },
  { code: "STM_ALL", title: "Practice, Question 3", type: "mc", pick: "all", how: "Pick all that are true", wish: true, body: txt("Which are vectors?"), choices: ch("a", "b", "c", "d") },
  { code: "STM_MUL", title: "Practice, Question 4", type: "multi", how: "Answer each part", wish: true, body: txt("A cart moves."),
    parts: [{ label: "a", prompt: "How far in 2 s?", type: "num" }, { label: "b", prompt: "How fast at 2 s?", type: "num" }] },
];
const RIGHT = { STM_MCQ: "c", STM_INL: "a", STM_ALL: ["a", "c"] };
const BANK = "BANK_STRIP2";
async function pageFor(browser, W, H, o = {}) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.addInitScript(tip => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))); if (tip) localStorage.setItem("stem-strip-badge", "1"); } catch { /* blocked */ } }, !o.tip);
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  const tries = {};
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "STM_MCQ" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Step one\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON(), code = b.code, key = code + (b.part ?? "");
    let ok;
    if (code === "STM_MUL") ok = b.answer === String(2 + 2 * b.part);          // part 0 = 2, part 1 = 4
    else if (code === "STM_ALL") ok = JSON.stringify([...b.choices].sort()) === JSON.stringify(RIGHT[code]);
    else ok = b.choice === RIGHT[code];
    if (ok) return r.fulfill({ json: { verdict: "correct" } });
    tries[key] = (tries[key] || 0) + 1;
    const left = Math.max(0, 2 - tries[key]);
    const struck = code === "STM_ALL" ? b.choices.find(c => !RIGHT[code].includes(c)) : undefined;
    return r.fulfill({ json: { verdict: "wrong", triesLeft: left, ...(struck ? { struck } : {}), ...(left === 0 ? { correct: code === "STM_ALL" ? RIGHT[code] : code === "STM_MUL" ? String(2 + 2 * b.part) : RIGHT[code] } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "STM_MCQ", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);   // UNKNOWN-kept: not sure what this waits for (first paint / intro?), no signal identified
  return page;
}
async function goTo(page, code) {
  for (let i = 0; i < 6 && (await page.textContent("#pcode")) !== code; i++) {
    const before = await page.textContent("#pcode");
    await page.evaluate(() => document.querySelector("#qnext").click());
    await page.waitForFunction(p => document.querySelector("#pcode")?.textContent !== p, before, { timeout: 4000 }).catch(() => {});   // the next question is up
  }
  assert.equal(await page.textContent("#pcode"), code);
  await page.waitForSelector("#q .opt, #q .ans");
}
const pickMC = async (page, id) => { await skipRetryWait(page); await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch:has(.opt[data-id="${id}"]) .send`); };
async function pickAll(page, ids) { await skipRetryWait(page); for (const id of ids) await page.click(`#q .opt[data-id="${id}"]`); await page.click("#mcGo"); }
async function part(page, i, v) { await page.fill(`#q .part[data-i="${i}"] .ans`, v); await page.click(`#go${i}`); }
const verdictCount = (page, n) => page.waitForFunction(k => window.__drill.state.tries.length >= k, n);
/* drive a question to a state: wrong (a try left), out (a second miss, same page), right (fresh page) */
async function reach(page, kind, state) {
  const code = { mc: "STM_MCQ", inl: "STM_INL", all: "STM_ALL", multi: "STM_MUL" }[kind];
  if (state !== "out") await goTo(page, code);
  if (kind === "mc" || kind === "inl") {
    if (state === "right") await pickMC(page, RIGHT[code]);
    else if (state === "wrong") { await pickMC(page, kind === "mc" ? "a" : "b"); await verdictCount(page, 1); }
    else { await pickMC(page, kind === "mc" ? "b" : "c"); await verdictCount(page, 2); }
  } else if (kind === "all") {
    if (state === "right") await pickAll(page, RIGHT[code]);
    else if (state === "wrong") { await pickAll(page, ["a", "b"]); await verdictCount(page, 1); }
    else { await pickAll(page, ["a", "d"]); await verdictCount(page, 2); }
  } else if (state === "right") { await part(page, 0, "2"); await verdictCount(page, 1); await part(page, 1, "4"); }
  else if (state === "wrong") { await part(page, 0, "9"); await verdictCount(page, 1); }
  else { await page.fill('#q .part[data-i="0"] .ans', "8"); await page.click("#go0"); await verdictCount(page, 2); }
  if (state !== "wrong") await page.waitForSelector("#q.closed");
  if (!(kind === "multi" && state === "wrong")) await drawerSettled(page);   // the drawer slides in after the verdict (a part miss with a try left has none)
}
const drawerOpen = page => page.evaluate(() => { const d = document.querySelector("#q .vdrawer"); return !!d && !d.hidden && getComputedStyle(d).display !== "none"; });
/* the drawer is shown and its open slide (vd-out, 380 ms) has finished; the wait behind every old SETTLE after a verdict or a mark tap. A missing wait is caught by the assert after it. */
const drawerSettled = page => page.waitForFunction(() => { const d = document.querySelector("#q .vdrawer"); return !!d && !d.hidden && !d.classList.contains("vd-shut") && d.getAnimations().every(a => a.playState === "finished"); }, null, { timeout: 4000 }).catch(() => {});
/* the drawer is gone (hidden after its 240 ms slide shut, or never built) */
const drawerGone = page => page.waitForFunction(() => { const d = document.querySelector("#q .vdrawer"); return !d || d.hidden; }, null, { timeout: 4000 }).catch(() => {});
/* the drawer is settled under part i (multi: it hangs under the newest verdict's part, or moved there by its icon) */
const drawerAt = (page, i) => page.waitForFunction(i => { const d = document.querySelector("#q .vdrawer"); if (!d || d.hidden || d.classList.contains("vd-shut") || !d.getAnimations().every(a => a.playState === "finished")) return false; const prev = d.previousElementSibling; const host = prev && prev.closest(".part"); const hp = prev && prev.classList.contains("pips") && prev.previousElementSibling && prev.previousElementSibling.closest(".part"); return document.querySelectorAll("#q .vdrawer").length === 1 && (host?.dataset.i === i || hp?.dataset.i === i); }, i, { timeout: 4000 }).catch(() => {});
/* where the reopen target lives per kind */
const ICON = { mc: "#q .ch:has(.opt.wrong, .opt.right) .vkb", inl: "#q .ch:has(.opt.wrong, .opt.right) .vkb", all: "#q .ch:has(.opt.wrong, .opt.right) .vkb", multi: "#q .part .ff .vk[role=button]" };
const move = page => page.evaluate(() => {
  const t = s => [...document.querySelectorAll(s)].map(e => Math.round(e.getBoundingClientRect().top + scrollY));
  return { q: Math.round(document.querySelector("#q").getBoundingClientRect().height), ch: t("#q .ch"), chk: t("#q .chk"), part: t("#q .part"), ff: t("#q .part .ff"), nx: t("#q .nx"), fb: t("#fb"), wish: t("#wish"), choices: t("#q .choices") };
});

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const CASES = [["mc", [360, 390, 393, 1280], ["wrong", "out", "right"]], ["inl", [390], ["wrong", "right"]], ["all", [390], ["wrong", "right"]], ["multi", [390], ["wrong", "right"]]];
const SIZE = { 360: 740, 390: 844, 393: 852, 1280: 800 };
for (const [kind, widths, states] of CASES) {
  for (const W of widths) {
    if (process.env.SL_W && +process.env.SL_W !== W) continue;
    let pg = null;
    for (const state of states) {
      const T = `${W} ${kind} ${state}`;
      if (state !== "out") { if (pg) await pg.ctx.close(); pg = await pageFor(browser, W, SIZE[W]); }
      await reach(pg, kind, state);
      if (kind === "multi" && state === "wrong") {   // a part miss with a try left makes no Cluck chip (partFeedback never calls wishOnWrong; Cluck comes when the whole item closes): nothing to host
        await step(`${T}: a part miss with a try left has no chip, so no drawer; the part keeps its own mark`, async () => {
          assert.equal(await drawerOpen(pg), false); assert.equal(await pg.evaluate(() => document.querySelectorAll("#q .vkb").length), 0);
          assert.ok(await pg.isVisible('#q .part[data-i="0"] .vk'), "part mark");
        });
        continue;
      }
      await step(`${T}: the drawer is open after the verdict, never a child of its host, one Ask Cluck chip`, async () => {
        assert.ok(await drawerOpen(pg), "no open drawer after the verdict");
        const rel = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), host = d.previousElementSibling; return { nest: !!d.closest(".opt, .ff, .ch"), n: document.querySelectorAll("#q .vdrawer").length, chips: document.querySelectorAll(".wchip").length, inD: d.querySelectorAll(".wchip").length, prev: host && host.className }; });
        assert.ok(!rel.nest && rel.n === 1 && rel.inD === 1 && rel.chips === 1, JSON.stringify(rel));
      });
      if (!(await drawerOpen(pg))) continue;
      await step(`${T}: overlap: points inside the open drawer are the drawer, not later content`, async () => {
        const bad = await pg.evaluate(() => {
          const t = document.querySelector("#q .vdrawer"), out = [];
          t.scrollIntoView({ block: "center" });
          const a = t.getBoundingClientRect();
          for (const [fx, fy] of [[.1, .85], [.5, .85], [.9, .85], [.5, .5]]) { const e = document.elementFromPoint(a.left + a.width * fx, a.top + a.height * fy); if (!e || !t.contains(e)) out.push(fx + "," + fy + "=" + (e ? e.className || e.tagName : "null")); }
          return out;
        });
        assert.deepEqual(bad, [], "something is painted over the drawer");
      });
      await step(`${T}: contents: Ask Cluck + a 44px close, no Next (Tony, Nov 3 18:41: the tray has no Next; it lives in the bar / the row), nothing cut`, async () => {
        const c = await pg.evaluate(() => {
          const d = document.querySelector("#q .vdrawer"), r = e => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; }, chip = d.querySelector(".wchip"), x = d.querySelector(".vd-x"), nx = d.querySelector(".vd-next");
          const a = d.getBoundingClientRect(), inside = e => { const b = e.getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5; };
          return { chip: chip && r(chip), x: x && r(x), nx: nx && { ...r(nx), txt: nx.textContent, cut: nx.scrollWidth > nx.clientWidth + 1, in: inside(nx) }, cut: chip && chip.scrollWidth > chip.clientWidth + 1, in: chip && inside(chip), inx: x && inside(x), text: chip && chip.textContent.trim() };
        });
        assert.ok(c.chip && c.x && c.chip.h >= 44 && c.x.h >= 44 && c.x.w >= 44 && !c.cut && c.in && c.inx, JSON.stringify(c));
        assert.equal(c.nx, null, "a Next / Skip inside the Cluck tray: " + JSON.stringify(c.nx));
      });
      await step(`${T}: reflow 0: closing the drawer moves nothing; focus returns to the reopen target`, async () => {
        const a = await move(pg);
        await pg.click("#q .vdrawer .vd-x"); await drawerGone(pg);
        const b = await move(pg);
        assert.deepEqual(b, a, "something moved when the drawer closed");
        assert.equal(await drawerOpen(pg), false, "still showing after close");
        assert.equal(await pg.evaluate(sel => { const e = document.activeElement; return !!e && e.matches(sel); }, ICON[kind]), true, "focus must return to the reopen target");
      });
      await step(`${T}: the mark reopens it (aria-expanded), Esc closes, a tap outside closes`, async () => {
        const ic = pg.locator(ICON[kind]).last();
        assert.equal(await ic.getAttribute("aria-expanded"), "false");
        const box = await ic.boundingBox(); assert.ok(box.width >= 44 - 0.5 && box.height >= 44 - 0.5, "reopen target under 44px: " + JSON.stringify(box));
        await ic.click(); await drawerSettled(pg);
        assert.ok(await drawerOpen(pg), "the mark did not reopen it"); assert.equal(await ic.getAttribute("aria-expanded"), "true");
        await pg.keyboard.press("Escape"); await drawerGone(pg);
        assert.equal(await drawerOpen(pg), false, "Esc did not close");
        await ic.click(); await drawerSettled(pg);
        await pg.mouse.click(5, 5); await drawerGone(pg);
        assert.equal(await drawerOpen(pg), false, "an outside tap did not close");
      });
      if (SHOTS) { await pg.locator(ICON[kind]).last().click(); await drawerSettled(pg); await pg.screenshot({ path: `${SHOTS}/${kind}-${state}-${W}.png` }); }
      assert.deepEqual(pg.errs, [], "page errors");
    }
    if (pg) await pg.ctx.close();
  }
}

/* ux Tony Nov 2 (d) / cluck-rise "covered at its centre by button.vkb.vkb-r": the badge sits over the row's mark only, never over the middle of a pill (a tap there is the pill's own) */
for (const W of [360, 390]) await step(`${W}: inline pills: the badge never covers a pill's centre (the pill is what a tap at its centre hits), a try left and out of tries`, async () => {
  const pg = await pageFor(browser, W, 844);
  const hits = () => pg.evaluate(() => [...document.querySelectorAll("#q .ch:has(.vkb)")].map(ch => { const o = ch.querySelector(".opt"), r = o.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [ch.dataset.id, Math.round(r.width), !!e && !e.closest(".vkb"), e && e.className]; }));   // Next's own face (the cue pill) may sit there by design; the badge may not
  await reach(pg, "inl", "wrong");
  let h = await hits(); assert.ok(h.length >= 1, "a badge on the picked pill"); assert.deepEqual(h.filter(x => !x[2]), [], "a try left: a badge covers a pill's centre " + JSON.stringify(h));
  await reach(pg, "inl", "out");
  h = await hits(); assert.ok(h.length >= 1, "a badge on the picked pill"); assert.deepEqual(h.filter(x => !x[2]), [], "out of tries (Next in the pill): a badge covers a pill's centre " + JSON.stringify(h));
  await pg.ctx.close();
});

await step("inline pills: the drawer follows the whole group (a sibling after .choices), not a row", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STM_INL"); const inl = await pg.evaluate(() => document.querySelector("#q .choices").classList.contains("inline"));
  await pickMC(pg, "b"); await verdictCount(pg, 1); await drawerSettled(pg);
  const r = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), g = document.querySelector("#q .choices"); return { after: d && d.previousElementSibling === g || (d && d.previousElementSibling && d.previousElementSibling.classList.contains("pips") && d.previousElementSibling.previousElementSibling === g), open: !!d && !d.hidden }; });
  assert.ok(r.open && r.after, JSON.stringify({ inl, ...r })); await pg.ctx.close();
});

await step("multi: one drawer + one chip (Cluck comes when the item closes); it hangs under the newest verdict and moves to a part when its icon is tapped", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STM_MUL");
  await part(pg, 0, "9"); await verdictCount(pg, 1); await pg.fill('#q .part[data-i="0"] .ans', "8"); await pg.click("#go0"); await verdictCount(pg, 2);   // part a: out of tries (locked)
  await drawerSettled(pg);
  await part(pg, 1, "4"); await pg.waitForSelector("#q.closed"); await drawerSettled(pg);   // part b right: the item closes, Cluck's chip comes
  const under = () => pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"); const prev = d && d.previousElementSibling; return { n: document.querySelectorAll("#q .vdrawer").length, chips: document.querySelectorAll(".wchip").length, open: !!d && !d.hidden, host: prev && prev.closest(".part") && prev.closest(".part").dataset.i, hostPips: prev && prev.classList.contains("pips") && prev.previousElementSibling.closest(".part").dataset.i }; });
  const at = (u, i) => u.open && u.n === 1 && u.chips === 1 && (u.host === i || u.hostPips === i);
  let u = await under(); assert.ok(at(u, "1"), "part b (newest): " + JSON.stringify(u));
  await pg.click('#q .part[data-i="0"] .ff .vk[role=button]'); await drawerAt(pg, "0");
  u = await under(); assert.ok(at(u, "0"), "moved to part a: " + JSON.stringify(u));
  await pg.click('#q .part[data-i="1"] .ff .vk[role=button]'); await drawerAt(pg, "1");
  u = await under(); assert.ok(at(u, "1"), "back to part b: " + JSON.stringify(u));
  assert.deepEqual(pg.errs, []); await pg.ctx.close();
});

await step("the first close by ^ on a row teaches the badge once (toast), never twice; storage is per user", async () => {
  const pg = await pageFor(browser, 390, 844, { tip: true });
  await goTo(pg, "STM_MCQ"); await pickMC(pg, "a"); await verdictCount(pg, 1); await drawerSettled(pg);
  const shown = () => pg.evaluate(() => { const n = document.querySelector(".stoast.on, .stoast-note.on, [class*=stoast].on"); return !!n && /badge/i.test(n.textContent); });
  await pg.click("#q .vdrawer .vd-x");
  await pg.waitForFunction(() => /badge/i.test(document.body.innerText), null, { timeout: 3000 });
  assert.equal(await pg.evaluate(() => localStorage.getItem("stem-strip-badge")), "1");
  await pg.waitForTimeout(6000);   // UNKNOWN-kept: not sure what the 6 s waits for (toast timer / cooldown?), no signal identified
  await pg.locator(ICON.mc).last().click(); await drawerSettled(pg);
  await pg.click("#q .vdrawer .vd-x"); await pg.waitForTimeout(700);   // UNKNOWN-kept: a negative check (no toast came), no positive signal to wait on
  assert.equal(await pg.evaluate(() => /badge/i.test(document.body.innerText)), false, "the toast came a second time");
  await pg.ctx.close();
});

await step("a question without Cluck's key has no drawer on mc / pick-all / multi", async () => {
  for (const code of ["STM_MCQ", "STM_ALL"]) {
    const pg = await pageFor(browser, 390, 844);
    await goTo(pg, code); await pg.evaluate(() => { window.__drill.state.prob.wish = false; });
    if (code === "STM_MCQ") await pickMC(pg, "a"); else await pickAll(pg, ["a", "b"]);
    await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE + 300);   // negative check follows (no drawer): no positive signal to wait on
    assert.equal(await drawerOpen(pg), false, code); assert.equal(await pg.evaluate(() => document.querySelectorAll("#q .vkb").length), 0, code + " stray badge buttons");
    await pg.ctx.close();
  }
});

/* BIG PLAN V1 (Tony Nov 2): the desktop (1280) step 'the drawer's chip stays live across Cluck's sheet' is gone: desktop sugar has no drawer chip and no Escape-close (the box is open for good); the phone step below keeps the chip / sheet round trip */

await step("phone: a tap inside Cluck's sheet is not a tap outside the drawer (ux-flows@phone 23 cluck-errors, PR 385 CI): tap Try again in the sheet, close it, the drawer and its chip are back", async () => {
  const pg = await pageFor(browser, 390, 844);
  await pg.route("**/explain", r => r.fulfill({ status: 500, body: "" }));
  await goTo(pg, "STM_MCQ"); await pickMC(pg, "a");
  await verdictCount(pg, 1); await drawerSettled(pg);
  const opened = () => pg.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden; }, null, { timeout: 4000 });
  await pg.click("#q .vdrawer .wchip"); await opened();
  await pg.waitForSelector("#cluck .wtext .wretry", { timeout: 6000 });
  await pg.waitForTimeout(SETTLE);   // UNKNOWN-kept: not sure what this waits for (the sheet's own slide?), no signal identified
  await pg.click("#cluck .wtext .wretry");                                    // a tap in the sheet (the sheet floats over the drawer at phone width: #wish stays shown)
  await pg.waitForTimeout(SETTLE);   // UNKNOWN-kept: not sure what this waits for (the retry's own state change?), no signal identified
  await pg.keyboard.press("Escape");
  await pg.waitForFunction(() => document.querySelector("#cluck").hidden, null, { timeout: 3000 });
  await drawerSettled(pg);
  assert.equal(await drawerOpen(pg), true, "the sheet tap closed the drawer for good (it counted as a tap outside)");
  assert.equal(await pg.evaluate(() => { const c = document.querySelector("#q .vdrawer .wchip"), r = c.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && c.contains(e); }), true, "the chip is tappable");
  await pg.click("#q .vdrawer .wchip");
  await opened().catch(() => { throw new Error("the chip did nothing after the sheet closed"); });
  await pg.ctx.close();
});

/* Tony Nov 2 (e): on a multi, the drawer's Ask Cluck asks about the part that was missed, not simply the newest try (here a right part b, after part a ran out of tries) */
await step("multi: Ask Cluck asks about the part that was missed (part a out of tries, part b right: the newest try is b's)", async () => {
  const pg = await pageFor(browser, 390, 844);
  const asked = []; await pg.route("**/explain", r => { asked.push(r.request().postDataJSON().part); r.fulfill({ status: 200, contentType: "text/plain", body: "1. Step one" }); });
  await goTo(pg, "STM_MUL");
  await part(pg, 0, "9"); await verdictCount(pg, 1); await pg.fill('#q .part[data-i="0"] .ans', "8"); await pg.click("#go0"); await verdictCount(pg, 2);   // part a: out of tries (locked)
  await drawerSettled(pg);
  await part(pg, 1, "4"); await pg.waitForSelector("#q.closed"); await drawerSettled(pg);   // part b right: the item closes, Cluck's chip comes
  const asking = pg.waitForResponse("**/explain", { timeout: 4000 }).catch(() => {});   // Ask Cluck's request has answered (the route pushed asked[] before it)
  await pg.click("#q .vdrawer .wchip"); await pg.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden; }, null, { timeout: 4000 });
  await asking;
  assert.deepEqual(asked, [0], "Ask Cluck asked about part " + JSON.stringify(asked) + " (part a = 0 was the miss)");
  await pg.ctx.close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
