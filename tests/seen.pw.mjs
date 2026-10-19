// J6 seen, moment C (intent.js proposeSeen → peek.js stemDuck.say; copy/seen-lines.js): with ?jev=1, an mc item answered wrong (negation),
// wrong (sign), then right, each pick 10 s apart → after the green row Cluck's peek rises carrying a line for the LAST wrong family (sign).
// A hollow tap puts it away, sets the session off and no second one comes. Flag off = nothing. Nothing leaves the device (no request
// besides the page's own; /explain /chat never called). The rolls are pinned (__stemJevRand reads window.__rs: quiet, kind, template, delay).
// Phone 390 + desktop 1280, shots. Own serve.py + banks folder.
//   node tests/seen.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8876", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "j6-")), banks = join(tmp, "banks"), shots = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(shots, { recursive: true });
const LINES = (() => { const w = {}; w.window = w; vm.runInNewContext(readFileSync(join(ROOT, "copy/seen-lines.js"), "utf8"), w); return JSON.parse(JSON.stringify(w.__stemSeenLines)); })();
const txt = md => [{ type: "text", md }];
/* tries: 3 so "two wrong, then right" is reachable on a 4-choice mc (the default is 2 tries: the 2nd wrong locks it) */
const PROBS = [1, 2].map(n => ({ code: `CALC1_T96M${n}`, title: `Limit from a table ${n}`, type: "mc", shuffle: false, tries: 3, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })),
  wrong: [{ choice: "b", error: "negation", hint: "QUACK. Look at the not." }, { choice: "c", error: "sign", hint: "QUACK. Check the sign." }, { choice: "d", error: "misread", hint: "QUACK. Reread it." }] }));
writeFileSync(join(banks, "BANK_T96.json"), JSON.stringify({ v: 1, problems: PROBS }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch();

async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, hasTouch: !!o.touch });
  const page = await ctx.newPage();
  page.errs = []; page.ai = 0; page.seenReq = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) page.errs.push(m.text()); });
  page.on("request", r => { const u = new URL(r.url()); if (/\/(explain|chat|nudge)$/.test(u.pathname)) page.ai++; if (u.origin !== BASE) { page.seenReq++; page.seenUrl = r.url(); } });
  /* the pinned rolls: window.__rs = [quiet, kind, template, delay] is spent by moment C; every other roll (J5) passes (0.99) */
  await page.addInitScript(() => { window.__rs = []; window.__stemJevRand = () => (window.__rs.length ? window.__rs.shift() : 0.99); });
  await page.clock.install();
  await page.goto(BASE + "/" + (o.jev === false ? "" : "?jev=1") + "#BANK_T96");
  await page.clock.runFor(3000);
  await page.waitForFunction(() => !!window.stemDuck && !document.getElementById("splash"), null, { timeout: 10000 });
  await page.waitForFunction(() => !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  return page;
}
async function idle(page, ms) {
  const t0 = await page.evaluate(() => performance.now());
  await page.clock.runFor(ms);
  for (let k = 0; k < 5; k++) {
    const left = ms - ((await page.evaluate(() => performance.now())) - t0);
    if (left < 500) return;
    await page.clock.runFor(Math.ceil(left));
  }
}
const up = page => page.evaluate(() => window.stemDuck.up);
const settle = page => page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) a.finish(); }));
const pick = async (page, id) => {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`.opt[data-id="${id}"]`);
  await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
};
/* B7: the desktop turns Cluck's sheet to its text by itself, which keeps every peek down (peek.js ok()). Close it as the student would. */
const closeCluck = async page => {
  if (await page.evaluate(() => !!window.stemCluckOpen?.())) { await page.keyboard.press("Escape"); await page.evaluate(() => window.stemCluckOpen?.() && document.querySelector("#wish .wchip, .cl-x, [aria-label='Close Cluck']")?.click()); }
};
/* wrong (negation), wrong (sign), right: ten seconds apart so nothing reads as a guess; the rolls for moment C are armed before the right pick */
async function earned(page) {
  await idle(page, 10000); await pick(page, "b");
  await idle(page, 10000); await pick(page, "c");
  await idle(page, 10000);
  await page.evaluate(() => { window.__rs = [0.9, 0.5, 0, 0]; });     // not quiet · short · the first free template · the shortest delay
  await pick(page, "a");
}
const look = page => page.evaluate(() => {
  const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const duck = r(document.querySelector(".ck-peek")), say = r(document.querySelector(".ck-say")), hol = document.querySelector(".ck-hollow"), hr = r(hol);
  const hit = (a, b) => a.l < b.right && a.r > b.left && a.t < b.bottom && a.b > b.top;
  const over = [...document.querySelectorAll("button, a, input, textarea, [role=button], .opt")].filter(e => !e.closest(".ck-rise") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
    .filter(e => [duck, say, hr].some(x => hit(x, e.getBoundingClientRect()))).map(e => e.id || e.className);
  const s = document.querySelector(".ck-say");
  return { say: s.textContent, sayOp: +getComputedStyle(s).opacity, label: document.querySelector(".ck-peek").getAttribute("aria-label"), hol: { w: hr.w, h: hr.h, hidden: hol.hidden, op: +getComputedStyle(hol).opacity, label: hol.getAttribute("aria-label"), r: hr.r, l: hr.l },
    sayBox: say, over, W: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth };
});
const jev = page => page.evaluate(() => window.stemJev());

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
  await step(`${name}: wrong, wrong, right → after the green row the peek rises with a line for the last wrong family; a hollow tap puts it away and no second one comes`, async () => {
    const page = await open({ vp, touch: name === "phone" });
    await earned(page);
    await idle(page, 2500);
    await closeCluck(page);
    await idle(page, 500);
    assert.equal(await up(page), true, "the peek is up after the right pick");
    await settle(page);
    const L = await look(page), S = (await jev(page)).seen;
    assert.ok(LINES.fam.sign.filter(l => l.kind === "short").some(l => l.text === L.say), "a sign/short line, not the trigger: " + L.say);
    assert.equal(L.label, "Cluck: " + L.say); assert.equal(L.sayOp, 1, "the line shows");
    assert.equal(L.hol.hidden, false); assert.equal(L.hol.label, "Felt hollow"); assert.ok(L.hol.w >= 24 && L.hol.h >= 24, "24 px min: " + L.hol.w);
    assert.equal(L.hol.op, 1); assert.ok(L.hol.r <= L.W, "the hollow tap is on screen");
    assert.ok(L.sayBox.l >= 0 && L.sayBox.r <= L.W, "the line fits the screen: " + JSON.stringify(L.sayBox));
    assert.deepEqual(L.over, [], "the duck, its line and the hollow tap rest on no control");
    assert.ok(L.scrollW <= L.W, "no sideways scroll");
    assert.equal(S.n, 1); assert.equal(S.last.fam, "sign"); assert.equal(S.last.line, L.say);
    assert.match(await page.evaluate(() => window.stemJev.dump()), /pick {2}c wrong tries_left=\d err=sign/);
    await page.screenshot({ path: join(shots, `seen-${vp.width}.png`) });
    await page.click(".ck-hollow");
    assert.equal(await up(page), false, "a hollow tap puts it away");
    const st = await page.evaluate(() => ({ s: sessionStorage.getItem("stem-seen-s"), h: JSON.parse(localStorage.getItem("stem-seen-h")), off: localStorage.getItem("stem-seen-off") }));
    assert.equal(st.s, "1"); assert.deepEqual(st.h, { f: 1, h: 1 }); assert.equal(st.off, null, "one hollow: not for good");
    for (let i = 0; i < 6; i++) { await idle(page, 40000); await page.keyboard.press("Shift"); }   // past the shared gap, never idle long enough for the 3 min peek
    await page.evaluate(() => { location.hash = "#CALC1_T96M2"; });
    await page.waitForFunction(() => document.querySelector("#pcode").textContent === "CALC1_T96M2");
    await earned(page);
    await idle(page, 4000); await closeCluck(page); await idle(page, 500);
    assert.equal(await up(page), false, "this session is off: no second peek");
    assert.equal((await jev(page)).seen.n, 1);
    assert.equal(page.ai, 0, "no server call"); assert.equal(page.seenReq, 0, "nothing leaves the device: " + page.seenUrl);
    assert.deepEqual(page.errs, [], "no console errors");
    await page.context().close();
  });
}

await step("flag off (no ?jev=1): the same item, no peek, no stemJev", async () => {
  const page = await open({ jev: false });
  await earned(page);
  await idle(page, 4000); await closeCluck(page); await idle(page, 500);
  assert.equal(await up(page), false);
  assert.equal(await page.evaluate(() => typeof window.stemJev), "undefined");
  assert.equal(await page.evaluate(() => localStorage.getItem("stem-seen-h")), null);
  await page.context().close();
});

/* J6 streak signals (log lines only). 1: a bank item (the page's own bank): w= ch=, copy inside the stem only, away via=blur. */
await step("streak signals: q_open w= ch= (bank item), copy stem (not a choice), away via=blur; nothing reaches stemT with a new prop", async () => {
  const page = await open({ vp: { width: 1280, height: 800 } });
  await page.evaluate(() => { window.__t = []; const o = window.stemT; window.stemT = (n, p) => { window.__t.push([n, JSON.stringify(p || {})]); return o && o(n, p); }; });
  const L = async () => (await jev(page)).lines;
  assert.match((await L())[0], /q_open {2}CALC1_T96M\d mc w=4 ch=4$/, "w= ch=: " + (await L())[0]);
  const sel = css => page.evaluate(c => { const r = document.createRange(); r.selectNodeContents(document.querySelector(c)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true })); }, css);
  await sel("#q .opt[data-id=a] .txt"); assert.ok(!(await L()).some(l => /copy/.test(l)), "a copy in a choice: no line");
  await sel("#blocks .md"); assert.equal((await L()).filter(l => /  copy {2}stem$/.test(l)).length, 1, "a copy in the stem");
  assert.ok(!(await L()).join("\n").includes("pick one"), "never the copied text");
  await page.evaluate(() => dispatchEvent(new Event("blur"))); await page.clock.runFor(3000); await page.evaluate(() => dispatchEvent(new Event("focus")));
  assert.ok(!(await L()).some(l => /away/.test(l)), "3 s: no line");
  await page.evaluate(() => dispatchEvent(new Event("blur"))); await page.clock.runFor(7000); await page.evaluate(() => dispatchEvent(new Event("focus")));
  assert.ok((await L()).some(l => /  away {2}[67]s via=blur$/.test(l)), "7 s blur → away: " + (await L()).join(" | "));
  const t = await page.evaluate(() => window.__t);
  assert.ok(t.every(x => !/"(w|ch|away|where)":/.test(x[1])), "stemT calls carry no new prop: " + JSON.stringify(t));
  assert.deepEqual(page.errs, []); assert.equal(page.seenReq, 0, "nothing leaves the device");
  await page.context().close();
});
/* 2: the student's own X in prove mode (a mocked pick-all with `fix`: the server strips it from served banks). "None of these" auto-X's the rest: silent. */
await step("streak signals: xmark only for the student's own X, not the None-of-these auto-X; no w= ch= for a non-bank item", async () => {
  const PV = { code: "CSCI26_J6S", type: "mc", pick: "all", shuffle: false, tries: 2, fix: { how: "a number" }, body: txt("Which of these squares is false here?"),
    choices: [{ id: "a", md: "$2^2=4$" }, { id: "b", md: "$3^2=8$" }, { id: "c", md: "$4^2=16$" }, { id: "d", md: "None of these", lock: true }] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.route(`**/p/${PV.code}.json`, r => r.fulfill({ json: PV }));
  await page.goto(BASE + "/?jev=1#" + PV.code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !!window.stemJev && !!document.querySelector("#q .opt"), PV.code, { timeout: 10000 });
  const L = async () => (await jev(page)).lines;
  assert.match((await L())[0], /q_open {2}CSCI26_J6S mc$/, "no bank entry → no w= ch=");
  await page.click("#q .opt[data-id=d]");
  assert.ok(await page.$$eval("#q .opt[data-mark=x]", e => e.length) >= 2, "the page X'd the other rows itself");
  assert.ok(!(await L()).some(l => /xmark/.test(l)), "the lock auto-X is not a student X: " + (await L()).join(" | "));
  await page.click("#q .opt[data-id=d]");                              // un-tick it
  const clicks = (id, n) => (async () => { for (let k = 0; k < n; k++) await page.click(`#q .opt[data-id=${id}]`); })();
  await clicks("c", 2);                                                // the auto-X'd row: X off → ticked: no X
  assert.ok(!(await L()).some(l => /xmark/.test(l)), "X off and a tick are not an X: " + (await L()).join(" | "));
  await clicks("c", 1);                                                // ticked → the student's X
  assert.equal((await L()).filter(l => /  xmark {2}c$/.test(l)).length, 1, "the student's X: " + (await L()).join(" | "));
  await clicks("c", 1);                                                // X → off
  assert.equal((await L()).filter(l => /xmark/.test(l)).length, 1, "taking an X off is not an X");
  assert.deepEqual(page.errs, []);
  await ctx.close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAILED` : "ALL OK", "(shots:", shots + ")");
process.exit(failures ? 1 : 0);
