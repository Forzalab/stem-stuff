// B7 (ii) (Tony, Oct 18): a wrong answer never opens Cluck by itself, on desktop too: the duck's sunrise comes (peek.js), and Cluck opens
// when the student taps the duck. Cluck's reply already streams in the background from the wrong answer (if the hourly auto budget allows,
// app.js shouldPrefetch: the first 2 questions this session, WISH_AUTO), so the duck opens it with the text there: ONE request, reused.
// No prefetch (budget spent, Q3+) = no request, the duck still rises, and its tap asks once (Tony, Oct 19, pick b). A right answer and diet
// ask nothing. No control overlaps another (360 / 390 / 393x852 / 393x659 / 1280). On a fake clock (as idle-peek); own serve.py + a stub OpenRouter.
//   node tests/cluck-rise.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8876", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "b7-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2, 3].map(n => ({ code: `CALC1_B7R${n}`, title: `B7 ${n}`, type: "mc", shuffle: false, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `B7 ${n}`, key: "Tick: a", slip: { b: "Two is not one." } } }));
/* a 2-choice mc = one try: a wrong pick is out of tries, so Next lands in the Check slot while the duck rises */
PROBS.push({ code: "CALC1_B7R4", title: "B7 4", type: "mc", shuffle: false, body: txt("Question 4: true or false?"), correct: "a",
  choices: [{ id: "a", md: "true" }, { id: "b", md: "false" }], saccharine: { title: "B7 4", key: "Tick: a", slip: { b: "It is true." } } });
writeFileSync(join(banks, "BANK_B7R.json"), JSON.stringify({ v: 1, problems: PROBS }));
/* a stub OpenRouter: Cluck's text in 3 pieces, 150 ms apart; counts the streamed (Cluck) requests */
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "Tick: a. Egg-cellent."];
let asked = 0;
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  asked++;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 150);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const DIET = [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }];
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const VPS = [["1280", { width: 1280, height: 900 }], ["390", { width: 390, height: 844 }]];

/* a page on a fake clock (idle-peek's open()); /explain counted at the page too */
async function open(vp, o = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  if (o.diet) await ctx.addCookies(DIET);
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.ai = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("request", r => { if (/\/(explain|chat)$/.test(new URL(r.url()).pathname)) page.ai++; });
  await page.clock.install();
  await page.goto(BASE + "/#BANK_B7R");
  await page.clock.runFor(3000);
  await page.waitForFunction(() => !!window.stemDuck && !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  if (o.spent) await page.evaluate(() => localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))));   // this hour's 5 auto asks are used up
  asked = 0;
  return page;
}
const pick = async (page, id) => {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`.opt[data-id="${id}"]`); await page.click(`.ch[data-id="${id}"] .send`);
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
};
const up = page => page.evaluate(() => window.stemDuck.up);
const cluckOpen = page => page.evaluate(() => !!window.stemCluckOpen && window.stemCluckOpen());
const settle = page => page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) a.finish(); }));
/* the stream runs on the real network: wait (real time) for the whole reply, kept in this browser when it ends */
const streamed = page => page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 8000, polling: 100 });

for (const [tag, vp] of VPS) {
  await step(`${tag}: a wrong answer leaves Cluck closed, streams his reply in the background, the duck rises; the duck opens Cluck on that text (one request)`, async () => {
    const page = await open(vp);
    await pick(page, "b");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), false, "a wrong answer does not open Cluck");
    await streamed(page);                                               // already streaming before the duck is tapped
    assert.equal(asked, 1, "the background stream: one Cluck request");
    await page.clock.runFor(1200);
    assert.equal(await up(page), true, "the duck's sunrise comes ~0.7 s after the wrong answer");
    assert.equal(await cluckOpen(page), false, "still closed while the duck is up");
    await settle(page); await page.clock.runFor(1000); await settle(page);
    const duck = await page.evaluate(() => { const b = document.querySelector(".ck-peek").getBoundingClientRect(); return { op: +getComputedStyle(document.querySelector(".ck-duck")).opacity, top: b.top, bottom: b.bottom }; });
    assert.ok(duck.op === 1 && duck.top < vp.height && duck.bottom > 0, "the duck is up, on screen: " + JSON.stringify(duck));
    assert.match(await page.textContent(".cl-peek .cl-steps"), /POOF! A wish is a wish\./, "the hint card already shows the start of Cluck's text");
    await page.screenshot({ path: join(SHOTS, `b7-duck-risen-${tag}.png`) });
    await page.click(".ck-peek");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), true, "the duck opens Cluck");
    await page.click("#cluck .wtext").catch(() => {});                  // a tap skips the typing
    await page.clock.runFor(2000);
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 4000 });
    assert.match(await page.textContent("#cluck .wtext"), /POOF! A wish is a wish\./, "the streamed text is in the sheet");
    assert.equal(await page.isVisible("#cluck .cl-bar"), true, "the Cluck / TUTOR header bar shows (B5)");
    assert.equal(await page.isVisible("#cluck .cl-bar .cl-x"), true, "its X shows");
    assert.equal(await page.isHidden("#cluck .cl-x2"), true, "no corner X");
    await page.screenshot({ path: join(SHOTS, `b7-cluck-open-${tag}.png`) });
    await page.waitForTimeout(500);
    assert.equal(asked, 1, "exactly one Cluck request: opening reuses the stream");
    assert.equal(page.ai, 1, "one /explain from the page");
    await page.click("#cluck .cl-bar .cl-x");
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), false, "the bar's X closes it");
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });

  await step(`${tag}: the hourly auto budget spent: no request, the duck still rises, Cluck stays closed; a duck tap = the chip's tap (one request)`, async () => {
    const page = await open(vp, { spent: true });
    await pick(page, "b");
    await page.clock.runFor(1500);
    assert.equal(await up(page), true, "the duck rises");
    assert.equal(await cluckOpen(page), false, "Cluck stays closed");
    await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForTimeout(600);
    assert.equal(asked, 0, "no Cluck request"); assert.equal(page.ai, 0, "no /explain");
    await page.click(".ck-peek");                                       // Tony, Oct 19 (pick b): an explicit duck tap asks, as the chip does
    await page.clock.runFor(300);
    assert.equal(await cluckOpen(page), true, "the duck opens Cluck");
    await page.click("#cluck .wtext").catch(() => {});
    await page.clock.runFor(2000);
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 6000, polling: 100 });
    await page.waitForTimeout(400);
    assert.equal(asked, 1, "one request, on the tap"); assert.equal(page.ai, 1);
    await page.context().close();
  });
}

/* app.js shouldPrefetch (Tony, Oct 18): only the first 2 questions opened this session prefetch; the 3rd asks when the student opens Cluck */
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.getElementById("freeze").hidden, code, { timeout: 8000 }); };
for (const [tag, vp] of VPS) await step(`${tag}: Q1 + Q2 wrong prefetch once each; Q3 wrong asks nothing; a duck tap opens Cluck with one request; the chip way still works`, async () => {
  const page = await open(vp);
  const first = await page.textContent("#pcode");                       // the bank's first question is Q1 of this session
  const order = [first, ...["CALC1_B7R1", "CALC1_B7R2", "CALC1_B7R3"].filter(c => c !== first)];
  for (const [i, code] of order.slice(0, 2).entries()) {
    await go(page, code);
    await pick(page, "b");
    await streamed(page);
    await page.waitForFunction(n => (localStorage.getItem("stem-cluck") || "").split("Egg-cellent").length - 1 === n, i + 1, { timeout: 8000, polling: 100 });
    assert.equal(asked, i + 1, `${code}: exactly one prefetch`);
    assert.equal(await cluckOpen(page), false, `${code}: Cluck stays closed`);
  }
  await page.clock.runFor(1000); await page.clock.fastForward(121000);   // past peek.js COOL (2 min between rises; Q1 / Q2 may have risen): flush Q2's 0.7 s rise timer first, then jump (a long runFor sometimes left performance.now behind; fastForward alone fired Q2's rise after the jump)
  await go(page, order[2]);
  await pick(page, "b");
  await page.clock.runFor(1500);
  await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
  await page.waitForTimeout(800);
  assert.equal(asked, 2, "Q3: no prefetch"); assert.equal(page.ai, 2, "Q3: no /explain yet");
  assert.equal(await cluckOpen(page), false, "Q3: Cluck stays closed");
  await page.waitForFunction(() => window.stemDuck.up, null, { timeout: 4000 }).catch(() => {});   // the verdict can land after runFor: the 0.7 s rise timer then runs on the flowing clock
  assert.equal(await up(page), true, "Q3: the duck rises");
  await page.click(".ck-peek");                                         // Tony, Oct 19 (pick b): the duck opens Cluck right away, a fresh request
  await page.clock.runFor(300);
  assert.equal(await cluckOpen(page), true, "the duck opens Cluck");
  await page.click("#cluck .wtext").catch(() => {});
  await page.clock.runFor(2000);
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 6000, polling: 100 });
  await page.waitForTimeout(400);
  assert.equal(asked, 3, "Q3: exactly one request, on the duck's tap"); assert.equal(page.ai, 3);
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
  /* no prefetch, no duck (the cooldown): the chip opens Cluck with the normal request, as before */
  const p2 = await open(vp);
  const f2 = await p2.textContent("#pcode"), o2 = [f2, ...["CALC1_B7R1", "CALC1_B7R2", "CALC1_B7R3"].filter(c => c !== f2)];
  await go(p2, o2[1]); await go(p2, o2[2]);
  await pick(p2, "b");
  await p2.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
  await p2.waitForTimeout(600);
  assert.equal(asked, 0, "Q3 via the chip: nothing yet");
  await p2.click("#wish .wchip");
  await p2.clock.runFor(300);
  assert.equal(await cluckOpen(p2), true, "the chip opens Cluck");
  await p2.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 8000, polling: 100 });
  assert.equal(asked, 1, "the chip: one request");
  await p2.context().close();
});

/* nothing on top of anything (Tony, Oct 19): with the duck up (a miss with tries left: the hint card + "ok but how?"; out of tries: Next
   + the chip) and with Cluck open (the B5 bar), every visible control is hit at its own centre (elementFromPoint = itself) and no two
   controls' boxes cross. The duck's line (.ck-say) counts as a control: it must not sit on one. Phone: the open sheet covers the page by
   design, so only its own controls count then */
const CTL = "button, a[href], input, textarea, select, [role=button], .opt, .ck-say";
const clash = (page, scope) => page.evaluate(([sel, scope]) => {
  const W = innerWidth, H = innerHeight;
  const nm = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.classList.length ? "." + [...e.classList].join(".") : "") + (e.dataset.id ? `[${e.dataset.id}]` : "");
  const els = [...document.querySelector(scope).querySelectorAll(sel)].filter(e => {
    if (e.closest("[hidden], [inert], [aria-hidden=true]") && !e.closest(".ck-rise")) return false;
    if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  });
  const stuck = e => { for (let p = e; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === "sticky") return true; return false; };
  const out = [];
  for (const e of els) {
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (e.matches(".ck-say") || x < 0 || x >= W || y < 0 || y >= H) continue;   // the line is not a target (pointer-events: none)
    const h = document.elementFromPoint(x, y);
    if (!h || !(h === e || e.contains(h))) out.push(`${nm(e)} covered at its centre by ${h ? nm(h) : "nothing"}`);
  }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    if (a.closest(".ch") && a.closest(".ch") === b.closest(".ch")) continue;   // the mc pill: its Check / Next sits inside its own row by design (next-cue)
    if (stuck(a) !== stuck(b)) continue;                                       // a scrolled page under a sticky bar: scrolling, not a layout clash
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (w > 1 && h > 1) out.push(`${nm(a)} x ${nm(b)} (${Math.round(w)}x${Math.round(h)})`);
  }
  return out;
}, [CTL, scope]);
const OVPS = [["360x780", { width: 360, height: 780 }], ["390x844", { width: 390, height: 844 }], ["393x852", { width: 393, height: 852 }], ["393x659", { width: 393, height: 659 }], ["1280x900", { width: 1280, height: 900 }]];
const riseDone = async page => { await settle(page); await page.clock.runFor(1000); await settle(page); };
for (const [tag, vp] of OVPS) await step(`${tag}: no overlapping controls: the duck up after a miss, out of tries (Next), and Cluck open`, async () => {
  const phone = vp.width < 500, bad = [];
  const page = await open(vp);
  await pick(page, "b");
  await streamed(page);
  await page.clock.runFor(1500);
  assert.equal(await up(page), true, "the duck is up");
  await riseDone(page);
  bad.push(...(await clash(page, "body")).map(s => "miss, duck up: " + s));
  await page.screenshot({ path: join(SHOTS, `b7-duck-risen-${tag}-v2.png`) });
  await page.click(".ck-peek");
  await page.clock.runFor(600);
  await page.click("#cluck .wtext").catch(() => {});
  await page.clock.runFor(2000);
  assert.equal(await cluckOpen(page), true);
  bad.push(...(await clash(page, phone ? "#cluck" : "body")).map(s => "Cluck open: " + s));
  await page.screenshot({ path: join(SHOTS, `b7-cluck-open-${tag}-v2.png`) });
  await page.context().close();
  const p2 = await open(vp);
  await go(p2, "CALC1_B7R4");
  await pick(p2, "b");
  await p2.waitForSelector("#q .nx", { timeout: 4000 });
  await p2.clock.runFor(1500);
  assert.equal(await up(p2), true, "out of tries: the duck is up");
  await riseDone(p2);
  await p2.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch { /* infinite */ } }));   // Next's landing done
  bad.push(...(await clash(p2, "body")).map(s => "out, Next + duck: " + s));
  await p2.screenshot({ path: join(SHOTS, `b7-out-duck-${tag}-v2.png`) });
  await p2.context().close();
  assert.deepEqual(bad, [], "overlaps");
});

await step("1280: a right answer and diet ask Cluck nothing", async () => {
  const page = await open(VPS[0][1]);
  await pick(page, "a");
  await page.clock.runFor(1500); await page.waitForTimeout(600);
  assert.equal(page.ai, 0, "right: no /explain"); assert.equal(await cluckOpen(page), false);
  await page.context().close();
  const d = await open(VPS[0][1], { diet: true });
  await pick(d, "b");
  await d.clock.runFor(1500); await d.waitForTimeout(600);
  assert.equal(d.ai, 0, "diet: no /explain"); assert.equal(asked, 0); assert.equal(await cluckOpen(d), false);
  await d.context().close();
});

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
