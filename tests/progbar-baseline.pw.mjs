// PROGBAR P1 (brain ui-polish/PORT-ARCH.md §D2): characterization of TODAY's progress HUD before the v9d notch bar replaces it. It pins what the
// code does now, not what it should do; if a later PR changes one of these on purpose, it edits the matching line here and the baseline log
// (docs/design/PROGBAR-BASELINE.md). Smoke size, HUD-local: the #rwHud DOM, app.js record() / finish() / settle() and what they feed, and the
// stage toasts (engine.js stageToasts). Own serve.py, throwaway bank, frozen date (a v:1 bank is dropped after the Nov 5 sunset).
//   node tests/progbar-baseline.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8889), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "pbb-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const sac = n => ({ title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(n) });
const multi = code => ({ code, type: "multi", body: [{ type: "text", md: "Two parts." }], saccharine: sac(9),
  parts: [{ type: "num", answer: "1", prompt: "one" }, { type: "num", answer: "2", prompt: "two" }] });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_PB1.json"), JSON.stringify({ v: 1, problems: [real("CALC1_P01", 1), real("CALC1_P02", 2), real("CALC1_P03", 3), multi("CALC1_PM1")] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function typePart(page, i, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill(`#q .part[data-i="${i}"] .ans`, v); await page.press(`#q .part[data-i="${i}"] .ans`, "Enter");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
/* a fresh sugar context on the bank: tips seen, Jev off (the same init as rewards.pw), every drill:answer event collected in window.__ev */
async function fresh(browser, w = 1280, h = 900) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    window.__ev = []; addEventListener("drill:answer", e => window.__ev.push({ ...e.detail })); });
  const p = await c.newPage();
  await p.goto(BASE + "/#BANK_PB1");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
  await p.waitForSelector("#rwHud:not([hidden])");
  return [c, p];
}
const toastNow = p => p.waitForFunction(() => { const t = document.querySelector(".stoast.on"); return t && !t.getAnimations({ subtree: true }).length && t.dataset.done === "1" ? t.querySelector(".stoast-t").textContent : false; }, null, { timeout: 9000 }).then(h => h.jsonValue());
const conquer = (p, tpl) => p.evaluate(t => { const R = window.Rewards; R.mastery({ type: "miss", tpl: t, b: false }); R.mastery({ type: "repair_done", tpl: t });
  return R.mastery({ type: "twin_a", tpl: t, ok: true }).newly; }, tpl);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("HUD DOM: one #rwHud strip before #qlist, with its parts, aria and the popover host; zeros at rest", async () => {
    const [c, p] = await fresh(browser);
    const d = await p.evaluate(() => { const h = document.querySelector("#rwHud"), q = s => h.querySelector(s);
      return { cls: h.className, role: h.getAttribute("role"), next: h.nextElementSibling?.id, tag: h.tagName, hidden: h.hidden,
        kids: [...h.children].map(e => e.className.trim()), coin: q("#rwCoin") === q(".rw-coin"), num: q(".rw-num").textContent, lvl: q(".rw-star b").textContent,
        to: q(".rw-to").textContent, streak: q(".rw-streak b").textContent, counts: q(".rw-counts").textContent, bar: q(".rw-bar i").style.getPropertyValue("--p"),
        tap: { tag: q(".rw-tap").tagName, pt: q(".rw-tap").getAttribute("popovertarget"), label: q(".rw-tap").getAttribute("aria-label"), type: q(".rw-tap").type },
        pop: { id: document.querySelector("#rwPop")?.id, attr: document.querySelector("#rwPop")?.hasAttribute("popover"), role: document.querySelector("#rwPop")?.getAttribute("role"), parent: document.querySelector("#rwPop")?.parentElement.tagName },
        aria: h.getAttribute("aria-label"), z: [h.classList.contains("rw-z-xp"), h.classList.contains("rw-z-st")], lit: q(".rw-flame").classList.contains("rw-lit") }; });
    assert.equal(d.tag, "DIV"); assert.equal(d.role, "group"); assert.equal(d.next, "qlist"); assert.equal(d.hidden, false);
    assert.equal(d.cls, "rw-hud rw-skin rw-z-xp rw-z-st", "zero xp + zero streak dim classes");
    assert.deepEqual(d.kids, ["rw-coin", "rw-lvl", "rw-streak", "rw-counts", "rw-tap"]);
    assert.ok(d.coin);
    assert.deepEqual([d.num, d.lvl, d.streak, d.counts], ["0", "1", "0", "exam 0 · easy 0"]);
    assert.equal(d.to, "80 XP to level 2"); assert.equal(+d.bar, 0); assert.equal(d.lit, false);
    assert.deepEqual(d.tap, { tag: "BUTTON", pt: "rwPop", label: "Your progress", type: "button" });
    assert.deepEqual(d.pop, { id: "rwPop", attr: true, role: "dialog", parent: "BODY" });
    assert.match(d.aria, /^0 XP \(points\), level 1, 80 XP to level 2, 0 cracked, 0 exam and 0 easy solved, /);
    await c.close();
  });

  await step("record(): every wrong / right verdict fires one drill:answer {code,right,ms} and feeds Rewards; a wrong with a try left pays a quiet +1", async () => {
    const [c, p] = await fresh(browser);
    await go(p, "CALC1_P01");
    await pick(p, "b");                                                         // wrong, a try left
    let ev = await p.evaluate(() => window.__ev);
    assert.equal(ev.length, 1); assert.deepEqual([ev[0].code, ev[0].right, typeof ev[0].ms], ["CALC1_P01", false, "number"]);
    assert.deepEqual(Object.keys(ev[0]).sort(), ["code", "ms", "right"], "the detail carries nothing else today (the bar needs more: IMPACT S1)");
    assert.deepEqual(await p.evaluate(() => window.__drill.state.tries.map(t => [t.c, t.v])), [["b", "wrong"]]);
    assert.equal(await p.evaluate(() => window.Rewards.state().xp), 1, "the +1 for trying is kept");
    assert.equal(await p.$eval("#q", q => q.classList.contains("closed")), false, "a try left: not finished");
    await pick(p, "a");                                                         // the closing right
    ev = await p.evaluate(() => window.__ev);
    assert.deepEqual(ev.map(e => e.right), [false, true]);
    assert.equal(await p.evaluate(() => window.Rewards.state().xp), 7, "1 + 6 (try 2)");
    await p.waitForFunction(() => document.querySelector("#rwHud .rw-num").textContent === "7", null, { timeout: 6000 });
    assert.equal(await p.textContent("#rwHud .rw-counts"), "exam 1 · easy 0");
    assert.equal(await p.textContent("#rwHud .rw-streak b"), "1");
    assert.equal(await p.$eval("#rwHud .rw-flame", e => e.classList.contains("rw-lit")), true);
    await c.close();
  });

  await step("finish(): a right closes the card (closed + solved, options and send disabled, Next cue); a wrong with a try left does not", async () => {
    const [c, p] = await fresh(browser);
    await go(p, "CALC1_P02");
    await pick(p, "b");
    assert.deepEqual(await p.evaluate(() => [window.__drill.state.finished, document.querySelector("#q").className.split(/\s+/).filter(k => /^(closed|solved)$/.test(k))]), [false, []]);
    await pick(p, "a");
    const f = await p.evaluate(() => ({ fin: window.__drill.state.finished, q: document.querySelector("#q").className.split(/\s+/).filter(k => /^(closed|solved)$/.test(k)).sort(),
      dis: [...document.querySelectorAll("#q .opt")].every(o => o.disabled && o.getAttribute("aria-disabled") === "true"), send: [...document.querySelectorAll("#q .send")].every(b => b.hidden),
      next: !!document.querySelector("#q .nx") }));
    assert.deepEqual([f.fin, f.q, f.dis, f.send, f.next], [true, ["closed", "solved"], true, true, true]);
    await go(p, "CALC1_P03");                                                   // out of tries = closed, not solved
    await pick(p, "b"); await pick(p, "c");
    assert.deepEqual(await p.evaluate(() => [window.__drill.state.finished, document.querySelector("#q").classList.contains("closed"), document.querySelector("#q").classList.contains("solved")]), [true, true, false]);
    await c.close();
  });

  await step("settle(): a multi finishes only when every part is shut; solved = every part right; else '<k> of <n> right.' in #fb; XP pays once on all-right", async () => {
    const [c, p] = await fresh(browser);
    await go(p, "CALC1_PM1");
    await typePart(p, 0, "1");
    assert.equal(await p.evaluate(() => window.__drill.state.finished), false, "part a shut, part b open: not settled");
    assert.equal(await p.evaluate(() => window.Rewards.state().xp), 0, "a multi pays once, at settle");
    await typePart(p, 1, "2");
    await p.waitForFunction(() => window.__drill.state.finished === true, null, { timeout: 6000 });
    assert.equal(await p.evaluate(() => window.__drill.state.solved), true);
    assert.equal((await p.textContent("#fb")).trim(), "", "all right: every box shows its check, no words");
    await p.waitForFunction(() => window.Rewards.state().xp > 0, null, { timeout: 6000 });
    assert.equal(await p.evaluate(() => window.Rewards.state().real), 1, "counted once");
    await c.close();
    const [c2, q] = await fresh(browser);
    await go(q, "CALC1_PM1");
    await typePart(q, 0, "1"); await typePart(q, 1, "9"); await typePart(q, 1, "8");   // part b out of tries
    await q.waitForFunction(() => window.__drill.state.finished === true, null, { timeout: 6000 });
    assert.equal(await q.evaluate(() => window.__drill.state.solved), false);
    assert.equal((await q.textContent("#fb")).trim(), "1 of 2 right.");
    assert.equal(await q.$eval("#q", e => e.classList.contains("closed")), true);
    assert.equal(await q.$eval("#q", e => e.classList.contains("solved")), false, "solved follows the LAST try (a wrong one here), not S.solved");
    await c2.close();
  });

  await step("stage toasts: start line once per bank at 0 done; a landmark crossing toasts the quarter; the toast no longer needs the HUD mounted (P2); config stage:false turns it off", async () => {
    const [c, p] = await fresh(browser);
    assert.equal(await toastNow(p), "Ready when you are.", "the start line, anchored by the engine config");
    assert.equal(await p.evaluate(() => typeof window.Rewards.config().toastAt), "function");
    assert.equal(await p.evaluate(() => window.Rewards.config().toastClear), "#fb");
    await p.evaluate(() => { window.Rewards.config({ goal: 4 }); window.stemToast.clear(); });
    await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
    assert.ok(await conquer(p, "Q1"), "Q1 conquered");
    assert.equal(await toastNow(p), "1 question done. Quack on!", "the render() after a conquest shows the 25% landmark");
    assert.equal(await p.evaluate(() => window.Rewards.state().stage), "1 question done. Quack on!", "the popover line is the same words");
    /* IMPACT R2, changed on purpose by PROGBAR P2: stageToasts no longer sits behind render()'s HUD guard, so an unmounted strip still toasts;
       Rewards.config({ stage: false }) is the one switch that turns them off (the P6 flip decides, INTEG 2) */
    await p.evaluate(() => { window.stemToast.clear(); document.querySelector("#rwHud").remove(); });
    await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
    assert.ok(await conquer(p, "Q2"), "Q2 conquered");
    await p.evaluate(() => window.Rewards.render(0));
    assert.equal(await toastNow(p), "Halfway there!", "no HUD in the page: the stage toast still comes");
    await p.evaluate(() => { window.Rewards.config({ stage: false }); window.stemToast.clear(); });
    await p.waitForFunction(() => !document.querySelector(".stoast.on"), null, { timeout: 3000 });
    assert.ok(await conquer(p, "Q3"), "Q3 conquered");
    await p.evaluate(() => window.Rewards.render(0));
    await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => !!document.querySelector(".stoast.on")), false, "config stage:false = no stage toast");
    await c.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
