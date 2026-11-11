// DOT-1: the orange status dot on a wrong answer that has Cluck help (Tony, Nov 2; mock brain projects/calc/_files/dot1/NOTES.md).
//   dot      one per wrong tick: a struck mc row, each struck pick-all tick, a typed box with the x / lock, each multi part that is out; --help, 10px, 2px --card ring, -2px on the top-right corner
//   hide     Cluck's sheet opens: the dot fades (.18 s; reduced motion: no fade) and is gone; it is back when Cluck closes
//   tries    out of tries: the dot stays (Cluck help is still there); nothing wrong and no help (a multi part with a try left): no dot
//   right    the question ends right: no dot, not even on an earlier miss
//   clip     the dot and its ring are fully inside the viewport and painted (elementFromPoint is the row, no ancestor clips them)
//   dim      a dot is never inside a dimmed box (opacity of every ancestor up to #q is 1)
// Own serve.py; the bank and /check are routed.   WIDTH=393|700 (default both; run-all splits them: dot1@phone, dot1@desk)   node tests/dot1.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8871), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 800;

const txt = md => [{ type: "text", md }];
const ch = (...ids) => ids.map(id => ({ id, md: `Choice ${id.toUpperCase()}, a sentence about the ball` }));
const P = [
  { code: "DOT_MCQ", title: "Practice, Question 1", type: "mc", how: "Pick one", wish: true, body: txt("A ball drops from rest. Which is true?"), choices: ch("a", "b", "c", "d") },
  { code: "DOT_ALL", title: "Practice, Question 2", type: "mc", pick: "all", how: "Pick all that are true", wish: true, body: txt("Which are vectors?"), choices: ch("a", "b", "c", "d") },
  { code: "DOT_NUM", title: "Practice, Question 3", type: "num", how: "Number", wish: true, body: txt("A ball drops from 45 m, from rest. How long until it lands?") },
  { code: "DOT_MUL", title: "Practice, Question 4", type: "multi", how: "Answer each part", wish: true, body: txt("A cart moves."),
    parts: [{ label: "a", prompt: "How far in 2 s?", type: "num" }, { label: "b", prompt: "How fast at 2 s?", type: "num" }] },
];
const RIGHT = { DOT_MCQ: "c", DOT_ALL: ["a", "c"], DOT_NUM: "3" };
const BANK = "BANK_DOT1";
async function pageFor(browser, W, H, o = {}) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block", reducedMotion: o.reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))); localStorage.setItem("stem-strip-badge", "1"); } catch { /* blocked */ } });   // this hour's auto asks spent: a miss shows the chip, nothing streams
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  const tries = {};
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "DOT_MCQ" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Step one\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON(), code = b.code, key = code + (b.part ?? "");
    let ok;
    if (code === "DOT_MUL") ok = b.answer === String(2 + 2 * b.part);
    else if (code === "DOT_ALL") ok = JSON.stringify([...b.choices].sort()) === JSON.stringify(RIGHT[code]);
    else if (code === "DOT_NUM") ok = b.answer === RIGHT[code];
    else ok = b.choice === RIGHT[code];
    if (ok) return r.fulfill({ json: { verdict: "correct" } });
    tries[key] = (tries[key] || 0) + 1;
    const left = Math.max(0, 2 - tries[key]);
    const struck = code === "DOT_ALL" ? b.choices.find(c => !RIGHT[code].includes(c)) : undefined;
    return r.fulfill({ json: { verdict: "wrong", triesLeft: left, ...(struck ? { struck } : {}), ...(left === 0 ? { correct: code === "DOT_MUL" ? String(2 + 2 * b.part) : RIGHT[code] } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "DOT_MCQ", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
async function goTo(page, code) {
  for (let i = 0; i < 6 && (await page.textContent("#pcode")) !== code; i++) {
    await page.evaluate(() => document.querySelector("#qnext").click());
    await page.waitForTimeout(500);
  }
  assert.equal(await page.textContent("#pcode"), code);
  await page.waitForSelector("#q .opt, #q .ans");
}
const tap = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);   // a DOM click: an open drawer may sit over the row (it is not what this spec tests)
const pickMC = async (page, id) => { await skipRetryWait(page); await tap(page, `#q .opt[data-id="${id}"]`); await tap(page, `#q .ch:has(.opt[data-id="${id}"]) .send`); };
async function pickAll(page, ids) {
  await skipRetryWait(page);
  for (const id of ids) if ((await page.getAttribute(`#q .opt[data-id="${id}"]`, "aria-checked")) !== "true") await tap(page, `#q .opt[data-id="${id}"]`);
  await tap(page, "#mcGo");
}
async function part(page, i, v) { await page.fill(`#q .part[data-i="${i}"] .ans`, v); await tap(page, `#go${i}`); }
const verdictCount = (page, n) => page.waitForFunction(k => window.__drill.state.tries.length >= k, n);
const submitNum = async (page, v) => { await skipRetryWait(page); await page.fill("#ans", v); await page.evaluate(() => document.querySelector("#ansGo").click()); };
/* kind x state: wrong (a try left), out (a second miss, same page), right (a miss, then right: a page of its own) */
async function reach(page, kind, state) {
  const code = { mc: "DOT_MCQ", all: "DOT_ALL", num: "DOT_NUM", multi: "DOT_MUL" }[kind];
  if (state !== "out") await goTo(page, code);
  if (kind === "mc") {
    if (state === "right") { await pickMC(page, "a"); await verdictCount(page, 1); await pickMC(page, "c"); }
    else if (state === "wrong") { await pickMC(page, "a"); await verdictCount(page, 1); }
    else { await pickMC(page, "b"); await verdictCount(page, 2); }
  } else if (kind === "all") {
    if (state === "right") { await pickAll(page, ["a", "b"]); await verdictCount(page, 1); await pickAll(page, ["a", "c"]); }
    else if (state === "wrong") { await pickAll(page, ["a", "b"]); await verdictCount(page, 1); }
    else { await pickAll(page, ["a", "d"]); await verdictCount(page, 2); }
  } else if (kind === "num") {
    if (state === "right") { await submitNum(page, "9"); await verdictCount(page, 1); await submitNum(page, "3"); }
    else if (state === "wrong") { await submitNum(page, "9"); await verdictCount(page, 1); }
    else { await submitNum(page, "8"); await verdictCount(page, 2); }
  } else if (state === "wrong") { await part(page, 0, "9"); await verdictCount(page, 1); }
  else {   // multi: both parts finished (Cluck comes when the whole item closes); out = the page of "wrong" (part a missed once): a second miss, then two for b; right = a miss then right, both parts
    if (state === "out") { await part(page, 0, "8"); await verdictCount(page, 2); }
    else { await part(page, 0, "9"); await verdictCount(page, 1); await part(page, 0, "2"); await verdictCount(page, 2); }
    await part(page, 1, "9"); await verdictCount(page, 3); await part(page, 1, state === "out" ? "8" : "4"); await verdictCount(page, 4);
  }
  if (state !== "wrong") await page.waitForSelector("#q.closed");
  await page.waitForTimeout(SETTLE);
}
/* every dot the page paints: the ::after of an .ch / .ff that is really drawn, with its box, colour and the opacity up the tree */
const dots = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("#q .ch, #q #ff.ff, #q .part")) {
    const cs = getComputedStyle(el, "::after");
    if (cs.content === "none" || cs.content === "normal" || cs.position !== "absolute") continue;
    let dim = 1; for (let e = el; e && e.id !== "q"; e = e.parentElement) dim *= +getComputedStyle(e).opacity;
    out.push({ host: el.className, on: el.dataset.id || el.closest(".part")?.dataset.i || "ff", bg: cs.backgroundColor, w: cs.width, h: cs.height, top: cs.top, right: cs.right, ring: cs.outlineWidth + " " + cs.outlineStyle + " " + cs.outlineColor, op: +cs.opacity, vis: cs.visibility, dim });
  }
  return out;
});
const shown = ds => ds.filter(d => d.op > 0.99 && d.vis === "visible");
const HELP = "rgb(255, 154, 62)";
const chipOpen = async page => {
  await page.evaluate(() => document.querySelector(".vdrawer .wchip, #wish .wchip, .rbox .wchip, .cl-cta").click());
  await page.waitForFunction(() => !document.querySelector("#cluck").hidden);
};

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const WANT = process.env.WIDTH || process.env.DOT_W;
const SIZE = { 393: 852, 700: 900 };   // BIG PLAN V1 (Tony Nov 2): desktop sugar (>= 720) has Cluck open from load, so the dot (it hides while the sheet is open) never shows there; the wide pass runs at 700, just under the breakpoint
const CASES = [   // kind, then the dots expected in each state
  ["mc", { wrong: 1, out: 2, right: 0 }], ["all", { wrong: 1, out: 2, right: 0 }], ["num", { wrong: 1, out: 1, right: 0 }], ["multi", { wrong: 0, out: 2, right: 0 }],
];
for (const W of [393, 700].filter(w => !WANT || +WANT === w)) {
  for (const [kind, states] of CASES) {
    let pg = null;
    for (const [state, n] of Object.entries(states)) {
      const T = `${W} ${kind} ${state}`;
      if (state !== "out") { if (pg) await pg.ctx.close(); pg = await pageFor(browser, W, SIZE[W]); }
      await reach(pg, kind, state);
      const ds = await dots(pg);
      await step(`${T}: ${n} dot${n === 1 ? "" : "s"} (one per wrong tick)`, async () => assert.equal(shown(ds).length, n, JSON.stringify(ds.map(d => [d.on, d.op, d.vis]))));
      if (!n) continue;
      await step(`${T}: --help, 10px, 2px --card ring, -2px on the top-right corner`, async () => {
        for (const d of ds) {
          assert.equal(d.bg, HELP); assert.equal(d.w, "10px"); assert.equal(d.h, "10px"); assert.equal(d.top, "-2px"); assert.equal(d.right, "-2px");
          assert.equal(d.ring, "2px solid rgb(11, 20, 34)");   // the ring: 2px of --card #0b1422 (an outline: STYLE §2.7 allows no free shadow)
        }
      });
      await step(`${T}: not clipped (dot + ring inside the viewport, painted over the row) and never in a dimmed box`, async () => {
        await pg.evaluate(() => document.querySelector("#q").scrollIntoView({ block: "center" }));
        const bad = await pg.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("#q .ch, #q #ff.ff, #q .part")) {
            const cs = getComputedStyle(el, "::after"); if (cs.content === "none" || cs.content === "normal") continue;
            const box = el.matches(".part") ? el.querySelector(".ff") : el, r = box.getBoundingClientRect(), cx = r.right - 3, cy = r.top + 3;   // the dot centre (a part: its box)   // the dot's centre: 6px in: inside the corner arc
            const hit = document.elementFromPoint(r.right - 8, r.top + 8);   // inside the corner arc
            if (!hit || !(hit === box || box.contains(hit))) out.push("covered by " + (hit ? hit.className || hit.tagName : "null"));
            for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) {   // the ring's four edges: 4px out from the centre (the dot is 5 wide, the ring 7)
              const x = cx + dx, y = cy + dy;
              if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) out.push("ring outside the viewport");
              else { const e = document.elementFromPoint(x, y), o = e && e.closest(".ch, .ff, .vdrawer"); if (o && o !== box) out.push("ring over " + (o.className || o.tagName)); }   // the card padding / the row itself is fine; a neighbour or the drawer on top of it is not
            }
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {   // an ancestor that clips must contain dot + ring (4px beyond the corner)
              const o = getComputedStyle(a); if (o.overflowX === "visible" && o.overflowY === "visible") continue;
              const ar = a.getBoundingClientRect();
              if (r.top - 4 < ar.top - 0.5 || r.right + 4 > ar.right + 0.5) out.push(`clipped by ${a.id || a.className || a.tagName} (${o.overflowX}/${o.overflowY}) top ${Math.round(r.top - 4 - ar.top)} right ${Math.round(ar.right - r.right - 4)}`);
            }
          }
          return out;
        });
        assert.deepEqual(bad, []); for (const d of ds) assert.equal(d.dim, 1, "dimmed host " + d.host);
      });
      if (state === "wrong" || state === "out") {
        if (SHOTS) await pg.screenshot({ path: join(SHOTS, `dot1-${W}-${kind}-${state}.png`) });
        await step(`${T}: Cluck opens: the dot hides; closes: it is back`, async () => {
          await chipOpen(pg); await pg.waitForTimeout(400);
          assert.equal(shown(await dots(pg)).length, 0, "a dot is still shown with Cluck open");
          if (SHOTS) await pg.screenshot({ path: join(SHOTS, `dot1-${W}-${kind}-${state}-open.png`) });
          await pg.evaluate(() => document.querySelector("#cluck .cl-x").click());
          await pg.waitForFunction(() => document.querySelector("#cluck").hidden); await pg.waitForTimeout(500);
          assert.equal(shown(await dots(pg)).length, n, "the dots are not back after Cluck closed");
        });
      }
    }
    if (pg) await pg.ctx.close();
  }
}
// the fade: .18 s on opacity; reduced motion = none (one case is enough: the rule is one selector for every kind)
for (const reduced of [false, true]) {
  const W = +WANT || 393, pg = await pageFor(browser, W, SIZE[W], { reduced });
  await reach(pg, "mc", "wrong");
  await step(`${W} fade: ${reduced ? "reduced motion = no transition" : "opacity .18 s"}`, async () => {
    const t = await pg.evaluate(() => getComputedStyle(document.querySelector("#q .ch:has(.opt.wrong)"), "::after").transitionDuration);
    assert.ok(reduced ? /^0s(, 0s)*$/.test(t) : t.startsWith("0.18s"), t);
  });
  await pg.ctx.close();
}
await browser.close(); srv.kill();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
