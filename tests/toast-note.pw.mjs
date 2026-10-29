// Toast notes on the one toast component (todo 112, Tony's picks Oct 28 on the mock board): the old #toast's five kinds now go through
// stemToast.note (toast.js). Scratchpad tip A (above the button, caret down), Next note "stacked" (caret under Next, shows beside a stage
// toast, may cover only the brainrot link), kept choice A (on the kept row), HUD tips B and the pad-mode note B (caret + an X). Cover rule
// strict: a note never lies on a live control (its anchor and the Next note's brainrot link aside). Plus the desktop stage toast
// ("Ready when you are.") sits bottom-left of the question column, not under the question over the Key formulas card (img3).
// Own serve.py on a temp bank:   node tests/toast-note.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8879", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "tnote-")), banks = join(tmp, "banks");
mkdirSync(banks);
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = n => ({ code: `CALC1_TN${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Toast ${n}: pick a.` }], choices: ch("one", "two", "three", "four"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }], saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
writeFileSync(join(banks, "BANK_TNX.json"), JSON.stringify({ v: 1, problems: [1, 2, 3].map(real) }));
writeFileSync(join(banks, "BANK_TNO.json"), JSON.stringify({ v: 1, problems: [real(9)] }));   // one question: Next has nowhere to go, so it says why
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
/* seen = the onboarding notes already met (a returning device); fresh = a new device (stem-ob "1": the onboarding notes are due) */
const DIET = [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }];   // the phone pad is diet's (Tony, Oct 14)
async function open(w, h, { code = "BANK_TNX", seen = true, diet = false, extra = {} } = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", ...(w < 600 || h < 600 ? PHONE : {}), ...extra });
  if (diet) await c.addCookies(DIET);
  await c.addInitScript(seen => { try { localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    if (seen) { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); }
    else localStorage.setItem("stem-ob", "1"); } catch { /* */ } }, seen);
  const p = await c.newPage();
  const errors = []; p.on("pageerror", e => errors.push(String(e)));
  await p.goto(`${BASE}/#${code}`);
  await p.waitForFunction(() => /^[A-Z]+\d*_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
  return { c, p, errors };
}
const opened = (p, code) => p.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (p, code) => { await p.evaluate(c => { location.hash = c; }, code); await opened(p, code); };
const rig = (p, q) => p.evaluate(q => { const R = window.Rewards, A = R.answer; R.answer = o => { const r = Math.random; Math.random = () => q.length ? q.shift() : r();
  try { return A(o); } finally { Math.random = r; R.answer = A; } }; }, q);
async function pick(p, id) {
  const n = await p.evaluate(() => window.__drill.state.tries.length);
  await p.click(`#q .opt[data-id="${id}"]`); await p.click(`#q .ch[data-id="${id}"] .send`);
  await p.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
/* the note with this text, held (a pointer rests on it, so its 2 s timer waits), read in the same in-page poll that finds it */
const note = (p, text) => p.waitForFunction(t => { const e = document.querySelector("#toast.on"); if (!e || e.textContent.trim() !== t) return false;
  e.dispatchEvent(new PointerEvent("pointerenter"));
  const r = e.getBoundingClientRect(), x = e.querySelector(".toast-x");
  return { r: r.toJSON(), up: e.classList.contains("up"), row: e.classList.contains("row"), x: x ? x.getBoundingClientRect().toJSON() : null,
    mid: parseFloat(e.style.left) + parseFloat(getComputedStyle(e).getPropertyValue("--px")) }; }, text, { timeout: 8000 })
  .then(h => h.jsonValue()).catch(async e => { throw new Error(e.message + " | want " + text + " | got " + await p.evaluate(() => { const t = document.querySelector("#toast"); return t && t.className + " " + t.textContent; })); });
/* the live controls under a box (the cover rule): taps go there, so a note or a toast never lies on one; skip = what it may cover */
const under = (p, sel, skip = "") => p.evaluate(([sel, skip]) => {
  const t = document.querySelector(sel).getBoundingClientRect();
  return [...document.querySelectorAll("button, a[href], input, textarea, select, [role=button], .opt, .ck-say")]
    .filter(e => !e.closest("#toast, .stoast") && !(skip && e.matches(skip)) && e.getAttribute("aria-disabled") !== "true" && e.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top; })
    .map(e => e.id || e.className || e.tagName); }, [sel, skip]);
const rect = (p, s) => p.evaluate(s => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect().toJSON() : null; }, s);
const stageUp = p => p.waitForFunction(() => { const t = document.querySelector(".stoast.on"); return t && !t.getAnimations({ subtree: true }).length && t.dataset.done === "1"
  ? { text: t.querySelector(".stoast-t").textContent, r: t.getBoundingClientRect().toJSON(), vh: innerHeight, vw: innerWidth } : false; }, null, { timeout: 9000 }).then(h => h.jsonValue());

try {
  /* img3 (Tony Oct 28, desktop prod 85a7da0): the start line sat 12px under the answer box, mid-column on the Key formulas card (1440, 1366)
     or never showed at all (1280x720: no room under the box). Desktop (the side layout) = bottom-left of the question column, on the
     viewport's foot; a phone keeps it under the question (the eye is there; its foot is the dock and the Scratchpad button). */
  await step("img3: on desktop the start line sits bottom-left of the question column, on no live control (1280x720 ... 2560, zoom 125 / 150)", async () => {
    const bad = [];
    for (const [w, h, z] of [[1440, 900], [1366, 768], [1280, 720], [1920, 1200], [2560, 1440], [1024, 768], [1440, 900, 1.25], [1440, 900, 1.5]]) {
      const vw = Math.round(w / (z || 1)), vh = Math.round(h / (z || 1));
      const { c, p, errors } = await open(vw, vh, { seen: true, extra: z ? { deviceScaleFactor: z } : {} });
      const tag = `${w}x${h}${z ? "@" + z * 100 + "%" : ""}`;
      try {
        const s = await stageUp(p), col = await rect(p, "#q");
        if (s.text !== "Ready when you are.") bad.push(tag + ": " + s.text);
        if (Math.abs(s.r.left - col.left) > 1) bad.push(`${tag}: left ${s.r.left} != column ${col.left}`);
        if (s.vh - s.r.bottom < 8 || s.vh - s.r.bottom > 32) bad.push(`${tag}: not on the foot (bottom ${s.r.bottom} of ${s.vh})`);
        const u = await under(p, ".stoast"); if (u.length) bad.push(`${tag}: over ${u}`);
        if (errors.length) bad.push(tag + ": " + errors);
      } catch (e) { bad.push(tag + ": " + e.message.split("\n")[0]); }
      await c.close();
    }
    assert.deepEqual(bad, []);
  });
  await step("img3: a phone keeps the start line under the question (390x844, 360x740), never on a control", async () => {
    for (const [w, h] of [[390, 844], [360, 740]]) {
      const { c, p } = await open(w, h);
      const s = await stageUp(p), q = await rect(p, "#q");
      assert.ok(s.r.top >= q.bottom + 8 && s.r.top <= q.bottom + 16, `${w}: under the question ${JSON.stringify([s.r, q])}`);
      assert.deepEqual(await under(p, ".stoast"), [], w + ": over a control");
      await c.close();
    }
  });

  /* HUD B (Tony Oct 28): the T37 tip keeps its caret on the piece and gains an X (44px, a real button); the X or a tap closes it */
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await step(`${w} HUD tip B: caret on the coin, an X that closes it, on no live control`, async () => {
      const { c, p, errors } = await open(w, h, { seen: true });
      await p.evaluate(() => localStorage.removeItem("stem-ob-rw-right"));
      await go(p, "CALC1_TN1"); await rig(p, [0.5, 0.99]); await pick(p, "a");
      const n = await note(p, "Points always go up and never let you down.");
      const a = await rect(p, "#rwCoin");
      assert.ok(Math.abs(n.mid - (a.left + a.width / 2)) < 2 && n.r.top >= a.bottom, "caret on the coin " + JSON.stringify([n, a]));
      assert.ok(n.x && n.x.width >= 44 && n.x.height >= 44, "B: an X, 44px " + JSON.stringify(n.x));
      assert.equal(await p.$eval("#toast .toast-x", b => b.tagName + " " + b.getAttribute("aria-label")), "BUTTON Close");
      assert.deepEqual(await under(p, "#toast", "#rwCoin, #rwHud *"), [], "over a control");
      await p.click("#toast .toast-x");
      await p.waitForFunction(() => !document.querySelector("#toast.on"), null, { timeout: 2000 });
      assert.deepEqual(errors, []);
      await c.close();
    });
  }

  /* phone onboarding: the Scratchpad tip A (above the button, caret down, no X), then the pad-mode note B (caret + X) */
  for (const [w, h] of [[390, 844], [360, 740]]) {
    await step(`${w} onboarding: Scratchpad tip A above the button, no X; pad-mode note B with an X; neither on a control`, async () => {
      const { c, p, errors } = await open(w, h, { code: "CALC1_TN1", seen: false, diet: true });
      const f = await note(p, "Quack up your thoughts here...");
      const fab = await rect(p, "#padFab");
      assert.ok(f.up && f.r.bottom <= fab.top, "A: above the button " + JSON.stringify([f, fab]));
      assert.equal(f.x, null, "A: no X");
      assert.deepEqual(await under(p, "#toast", "#padFab"), [], "Scratchpad tip over a control");
      await p.locator("#padFab").tap();
      const m = await note(p, "Switch question/answer here.");
      assert.ok(m.x && m.x.width >= 44, "B: an X " + JSON.stringify(m.x));
      assert.deepEqual(await under(p, "#toast", "#mtMode, #scratch"), [], "pad-mode note over a control (the pad page is all pad: it may lie on #scratch)");
      await p.keyboard.press("Escape");
      await p.waitForFunction(() => !document.querySelector("#toast.on"), null, { timeout: 2000 });
      assert.deepEqual(errors, []);
      await c.close();
    });
  }

  /* Next "stacked" (Tony Oct 28: "the stacked one"): the note keeps its caret under Next and shows beside a stage toast, not after it;
     it may lie on the brainrot link for its 2 s (Tony OK'd), nothing else */
  for (const [w, h] of [[1440, 900], [1366, 768], [390, 844], [844, 390]]) {
    await step(`${w}x${h} Next note stacked: caret under Next, no X, beside the stage toast, only the brainrot link under it`, async () => {
      const { c, p, errors } = await open(w, h, { code: "BANK_TNO", seen: true });
      await p.evaluate(() => { window.Rewards.config({ goal: 4 }); window.stemToast.clear(); const R = window.Rewards; R.mastery({ type: "miss", tpl: "Q1", b: false });
        R.mastery({ type: "repair_done", tpl: "Q1" }); R.mastery({ type: "twin_a", tpl: "Q1", ok: true }); });
      const s = await stageUp(p).catch(() => null);
      if (s) await p.evaluate(() => document.querySelector(".stoast.on").dispatchEvent(new PointerEvent("pointerenter")));   // its 4 s wait: a loaded runner must not time it out before the click lands
      await p.click("#qnext");
      const n = await note(p, "This is the only question here.");
      const a = await rect(p, "#qnext");
      assert.ok(Math.abs(n.mid - (a.left + a.width / 2)) < 2 && n.r.top >= a.bottom && !n.up, "caret under Next " + JSON.stringify([n, a]));
      assert.equal(n.x, null, "no X");
      assert.deepEqual(await under(p, "#toast", "#qnext, .rot-link"), [], "over a control");
      if (s) assert.equal(await p.evaluate(() => !!document.querySelector(".stoast.on")), true, "stacked: the stage toast stays up beside it");
      assert.deepEqual(errors, []);
      await c.close();
    });
  }

  /* kept choice A: the note lies on the kept row's own words (a dead control), caret at its badge, no X */
  await step("kept choice A: on the kept row, no X, over no other control (390, 1440)", async () => {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const { c, p } = await open(w, h, { code: "CSCI26_A7K", seen: true });
      await p.click('#q .opt[data-id="c"]'); await p.click("#mcGo");
      await p.waitForSelector('#q .opt[data-id="c"].kept', { timeout: 6000 });
      await p.click('#q .opt[data-id="c"]', { force: true });
      const n = await note(p, "That one's already correct!");
      assert.ok(n.row && n.x === null, w + ": A " + JSON.stringify(n));
      assert.deepEqual(await under(p, "#toast"), [], w + ": over a control");
      await c.close();
    }
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "toast-note: all ok");
process.exit(failures ? 1 : 0);
