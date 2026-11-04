// BIG PLAN V2 (Tony, Nov 2 23:01): the permanent Cluck box on desktop sugar (>= 720), what it holds and where Ask Cluck lives. Builds on cluck-permanent (V1).
//   idle      before any miss: Cluck's one-line opener + 3 starter chips (What is this asking? / Which formula fits? / Check my setup), the ask field "5 left"
//   chip      a starter sends through the ask pipe (POST /chat, the opener as Cluck's first turn) and counts: "4 left", the chips go, the reply lands in the thread
//   hint      a miss: the LEFT hint box shows the bank's hint (wrong[].hint) and no live peek: no .cl-peek, no "okay, but how?" CTA anywhere
//   tray      the strip tray (drawer under the answer) appears with the hint box and its "Ask Cluck" is reachable at once; a tap puts the cursor in the box's ask field
//   steps     after a right try the "See Cluck's steps" chip is back on the page (V1 lost it)
//   nokey     a question with no Cluck key keeps the box and shows the note (CL_COPY.nokey: COPY-PENDING); no chips
//   guard     phone sugar (393): no starters, no box on load
//   genmiss   every width, matched or generic miss: the tray's Ask Cluck is the one Cluck entry; no peek, no "okay, but how?"
// CV_W=1280,721 (desk) or 393 (phone); default all. run-all splits them: cluck-v2@desk, cluck-v2@phone. Own serve.py + a stub OpenRouter. No page.clock jumps (nothing here waits on time).
//   node tests/cluck-v2.pw.mjs <port> [shots dir]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8884", BASE = `http://127.0.0.1:${PORT}`;
const W = (process.env.CV_W || "1280,721,393").split(",").map(Number);
const tmp = mkdtempSync(join(tmpdir(), "cv2-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const HINT = "Which part of gravity pushes along the ramp?";   // the tail of the bank hint (the page dresses it as "quack. (kaomoji) ...")
const PROBS = [1, 2, 3].map(n => ({ code: `CALC1_CVT${n}`, title: `V2 ${n}`, type: "mc", shuffle: false,
  body: txt(`A 2.0 kg block starts from rest and slides 3.0 m down a frictionless ramp tilted at 30 degrees (${n}). How fast is it moving at the bottom?`), correct: "a",
  choices: ["5.4 m/s", "2.7 m/s", "7.7 m/s", "9.8 m/s"].map((md, i) => ({ id: "abcd"[i], md })),
  wrong: [{ choice: "b", error: "half", hint: "QUACK. " + HINT }],
  saccharine: n === 3 ? { title: `V2 ${n}` } : { title: `V2 ${n}`, key: "Tick: a", slip: { b: "Half of it." } } }));   // CV3: no Cluck key
writeFileSync(join(banks, "BANK_CVT.json"), JSON.stringify({ v: 1, problems: PROBS }));
const SHORT = ["Only the part of gravity along the ramp speeds it up.\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < SHORT.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: SHORT[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
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
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, hash = "#BANK_CVT") {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.chats = []; page.on("request", r => { if (/\/chat$/.test(r.url()) && r.method() === "POST") page.chats.push(JSON.parse(r.postData() || "{}")); });
  await page.goto(BASE + "/" + hash);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 }).catch(async e => { throw new Error(e.message.split("\n")[0] + " " + JSON.stringify(await page.evaluate(() => ({ h: location.hash, b: window.stemBank && window.stemBank.code, f: document.getElementById("freeze")?.hidden, s: !!document.getElementById("splash") })))); });
  await page.waitForTimeout(500);
  return page;
}
const vis = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"), sel);
const boxText = page => page.evaluate(() => document.querySelector("#cluck")?.innerText || "");
const wrong = async page => { await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send'); };
const right = async page => { await page.click('.opt[data-id="a"]'); await page.click('.ch[data-id="a"] .send'); };
const streamed = page => page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck")?.innerText || ""), null, { timeout: 10000 });

for (const w of W.filter(w => w >= 720)) {
  await step(`@desk ${w}: idle box = one line + 3 starter chips, "5 left", before any miss`, async () => {
    const page = await open(w);
    const t = await boxText(page);
    assert.match(t, /Ask me anything about this question/, "the one-line opener: " + t);
    const chips = await page.$$eval("#cluck .cl-starters .cl-starter", els => els.filter(e => e.getClientRects().length).map(e => e.textContent));
    assert.deepEqual(chips, ["What is this asking?", "Which formula fits?", "Check my setup"], "the 3 starters");
    assert.match(t, /5 left/, "the budget shows: " + t);
    const fit = await page.evaluate(() => { const cs = [...document.querySelectorAll("#cluck .cl-starter")].map(e => e.getBoundingClientRect()), ft = document.querySelector("#cluck .cl-ft").getBoundingClientRect(); return { bottom: Math.max(...cs.map(r => r.bottom)), ft: ft.top, rot: document.querySelector("#rot")?.getBoundingClientRect().height }; });
    assert.ok(fit.bottom <= fit.ft - 12, "all 3 chips sit above the ask field's fade, videos on: " + JSON.stringify(fit));
    await page.screenshot({ path: join(SHOTS, `cv2-idle-${w}.png`) });
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });
  await step(`@desk ${w}: a starter sends through /chat and counts against the 5`, async () => {
    const page = await open(w);
    await page.click('#cluck .cl-starter:has-text("Which formula fits?")');
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .cl-thread")?.innerText || ""), null, { timeout: 10000 });
    assert.equal(page.chats.length, 1, "one /chat call");
    const h = page.chats[0].history;
    assert.equal(h.at(-1).content, "Which formula fits?", "the chip's text is the student's turn");
    assert.equal(h[0].role, "assistant", "Cluck's opener is the first turn");
    assert.match(page.chats[0].code, /^CALC1_CVT1$/, "this question's code");
    const t = await boxText(page);
    assert.match(t, /4 left/, "5 -> 4: " + t);
    assert.ok(!(await vis(page, "#cluck .cl-starter")), "the chips go after one is used");
    await page.context().close();
  });
  await step(`@desk ${w}: after a miss the left hint box is the bank hint, no live peek, no "okay, but how?"; the opener+chips give way to the stream`, async () => {
    const page = await open(w);
    await wrong(page); await streamed(page);
    const fb = await page.evaluate(() => document.querySelector("#fb")?.innerText || "");
    assert.ok(fb.includes(HINT), "the bank hint is in the left hint box: " + fb);
    assert.ok(!fb.includes("Egg-cellent") && !fb.includes("ramp speeds"), "no live stream in the hint box: " + fb);
    assert.ok(!(await vis(page, ".cl-peek, .cl-cta")), "no peek, no 'okay, but how?' CTA");
    const t = await boxText(page);
    assert.ok(!/Ask me anything/.test(t) && !(await vis(page, "#cluck .cl-starter")), "the idle opener and chips are gone: " + t);
    await page.screenshot({ path: join(SHOTS, `cv2-miss-${w}.png`) });
    await page.context().close();
  });
  await step(`@desk ${w}: the tray appears with the hint box, Ask Cluck in it, a tap lands in the box's ask field`, async () => {
    const page = await open(w);
    await wrong(page);
    await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 });
    const lab = await page.textContent(".vdrawer .wchip");
    assert.match(lab, /Ask Cluck/, "the tray's chip: " + lab);
    await streamed(page);
    await page.click(".vdrawer .wchip");
    await page.waitForFunction(() => document.activeElement?.matches?.("#cluck .ask textarea"), null, { timeout: 3000 });
    assert.ok(await page.evaluate(() => window.stemCluckOpen()), "the box is still open");
    await page.context().close();
  });
  await step(`@desk ${w}: after a wrong MC pick the tray covers no remaining answer row, and the next row is clickable with the tray open`, async () => {
    const page = await open(w);
    await wrong(page);
    await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 });
    await page.waitForTimeout(700);                                     // the drawer's slide (380 ms) and the rows' room settle
    const g = await page.evaluate(() => {
      const d = document.querySelector(".vdrawer:not([hidden])").getBoundingClientRect();
      const rows = [...document.querySelectorAll("#q .opt:not([data-id=\"b\"])")].map(o => ({ id: o.dataset.id, r: o.getBoundingClientRect() }));
      return { d, rows: rows.map(o => [o.id, o.r.top, o.r.bottom]), cls: document.querySelector("#q .ch.strip")?.className, vd: document.documentElement.className, hits: rows.filter(o => o.r.width && o.r.bottom > d.top && o.r.top < d.bottom && o.r.right > d.left && o.r.left < d.right).map(o => o.id) };
    });
    assert.deepEqual(g.hits, [], "the tray overlaps these remaining rows " + JSON.stringify(g));
    await page.click('.opt[data-id="c"]', { timeout: 3000 });           // no force, no closing the tray first
    assert.ok(await page.evaluate(() => !!document.querySelector('.opt[data-id="c"].sel, .opt[data-id="c"][aria-checked="true"]')), "row C took the pick");
    await page.context().close();
  });
  await step(`@desk ${w}: right after a miss, "See Cluck's steps" is on the page`, async () => {
    const page = await open(w);
    await wrong(page); await streamed(page);
    await right(page);
    await page.waitForFunction(() => [...document.querySelectorAll(".cue-ok, .vdrawer .wchip")].some(e => e.getClientRects().length && /steps/i.test(e.textContent)), null, { timeout: 6000 });
    await page.context().close();
  });
  await step(`@desk ${w}: right on the first try, the chip is there too`, async () => {
    const page = await open(w);
    await right(page);
    await page.waitForFunction(() => [...document.querySelectorAll(".cue-ok, .vdrawer .wchip")].some(e => e.getClientRects().length && /steps/i.test(e.textContent)), null, { timeout: 6000 });
    await page.context().close();
  });
  await step(`@desk ${w}: a question with no Cluck key keeps the box and the note (COPY-PENDING)`, async () => {
    const page = await open(w);
    await page.evaluate(() => { location.hash = "#CALC1_CVT3"; });
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_CVT3", null, { timeout: 8000 });
    await page.waitForTimeout(600);
    assert.ok(await vis(page, "#work.cl-on #cluck"), "the box stays");
    const t = await boxText(page);
    assert.match(t, /404/, "the note: " + t);
    assert.ok(!(await vis(page, "#cluck .cl-starter")), "no chips without a key");
    await page.screenshot({ path: join(SHOTS, `cv2-nokey-${w}.png`) });
    await page.context().close();
  });
}
for (const w of W.filter(w => w < 720)) {
  await step(`@phone ${w}: no starters, no box on load`, async () => {
    const page = await open(w);
    assert.ok(!(await vis(page, "#cluck, .cl-starter")), "nothing of the box on load");
    await wrong(page);
    await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000 });
    assert.ok(!(await vis(page, ".cl-starter")), "no starters on a phone");
    await page.context().close();
  });
}
// GENMISS (Tony Nov 3 16:13, "a generic error still show 'ok but how' when it should show a tray with the cluck button ONLY (one entry)"): on EVERY wrong try, at every width,
// matched (wrong[] hint) or generic (a value no wrong[] row names), the only Cluck entry is the tray's Ask Cluck chip. No peek card, no "okay, but how?" anywhere.
const generic = async page => { await page.click('.opt[data-id="c"]'); await page.click('.ch[data-id="c"] .send'); };
for (const w of W) for (const [kind, miss] of [["matched", wrong], ["generic", generic]]) {
  await step(`@${w < 720 ? "phone" : "desk"} ${w}: a ${kind} miss: the tray's Ask Cluck is the ONLY Cluck entry (no peek, no "okay, but how?")`, async () => {
    const page = await open(w);
    await miss(page);
    await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 });
    await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000 }).catch(() => { /* the stream may be off; the entries are what is asserted */ });
    await page.waitForTimeout(600);
    const g = await page.evaluate(() => {
      const shown = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
      const ent = [...document.querySelectorAll(".wchip, .cl-cta, .cl-peek, .cue-chip, #clBack")].filter(shown);
      return { ent: ent.map(e => (e.className + ":" + (e.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 60)), inTray: ent.filter(e => e.closest(".vdrawer")).length, body: document.body.innerText };
    });
    assert.equal(g.ent.length, 1, "exactly one Cluck entry: " + JSON.stringify(g.ent));
    assert.equal(g.inTray, 1, "and it is the tray's: " + JSON.stringify(g.ent));
    assert.match(g.ent[0], /Ask Cluck/, "its label: " + g.ent[0]);
    assert.ok(!/okay, but how/i.test(g.body), "'okay, but how?' is on the page");
    if (kind === "matched") assert.ok(g.body.includes(HINT), "the bank hint stays in the left hint card");
    await page.context().close();
  });
}
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
