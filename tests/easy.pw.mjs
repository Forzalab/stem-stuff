// Sugar mode (saccharine, the default) vs diet (DIET_<code>, the original questions), design/EASY.md: no "None of these" in either;
// sugar hides None-is-the-answer questions, drops fix boxes, shows the saccharine title and tip, and Cluck; SUGAR_ goes back. Starts its own
// serve.py with a throwaway banks/ folder and tries.json:   node tests/easy.pw.mjs [port]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { speakable } from "../speak.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8825), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "easy-")), BANKS = join(TMP, "banks");
const row = (id, md, x = {}) => ({ id, md, ...x });
const NONE = row("e", "None of these", { lock: true });
const P = {
  all: { code: "CALC1_E01", title: "Original E01", type: "mc", pick: "all", shuffle: false,
    body: [{ type: "text", md: "Which are true?" }], choices: [row("a", "two"), row("b", "three"), row("c", "four"), NONE],
    correct: ["a", "c"], wrong: [{ choice: "b", hint: "QUACK. b" }], miss: "QUACK. Missing one.",
    saccharine: { title: "Practice Exam 2, Question 1: even numbers", tip: "Add the areas above the axis, subtract the ones below.", part: ["W_AREA", "WE_THM"],
      key: "Use: $W = \\Delta K$\nTick: a, c", slip: { b: "3 is odd." }, narration: "POOF. Two and four." } },
  none: { code: "CALC1_E02", type: "mc", shuffle: false, body: [{ type: "text", md: "Pick the even prime above 2." }],
    choices: [row("a", "3"), row("b", "5"), row("c", "7"), NONE], correct: "e" },
  prove: { code: "CALC1_E03", type: "mc", pick: "all", shuffle: false, fix: { type: "num", how: "4 sig figs" },
    body: [{ type: "text", md: "Mark each row." }], choices: [row("a", "$2+2=4$"), row("b", "$3 \\cdot 3=6$"), row("c", "$1+1=2$")],
    correct: ["a", "c"], wrong: [{ choice: "b", hint: "QUACK. times", fix: { answer: "9" } }], miss: "QUACK. Missing one.",
    key: "Tick: a, c", slip: { b: "3 times 3 is 9." } },
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 1, groups: [{ name: "Work and Energy",
  rows: [{ id: "WE_THM", tex: "W_{net} = \\Delta K" }, { id: "W_AREA", tex: "W = \\text{area under } F\\text{-}x" }] }] }));
P.split = { code: "CALC1_E04", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: "Two rows." }, { type: "text", md: "Tap a row to tick it." }],
  choices: [row("a", "first"), row("b", "second")], correct: ["a"], miss: "QUACK. Missing one.",
  saccharine: { title: "Practice Exam 2, Question 4", key: "Tick: a", split: [
    { sub: "CALC1_E04A", stem: "True or false: first.", answer: "true", slip: "First is true." },
    { sub: "CALC1_E04B", stem: "True or false: second.", answer: "false", slip: "Second is false." }] } };
writeFileSync(join(BANKS, "BANK_EZ12.json"), JSON.stringify({ v: 1, problems: [P.all, P.none, P.prove, P.split] }));
/* a stub OpenRouter: streams Cluck's text in 3 pieces, 150 ms apart (design/EASY.md Phase 4) */
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "Tick: a, c. Egg-cellent."];
let asked = 0;
const stub = createServer((req, res) => {
  asked++;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 150);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
async function typeCode(page, code) {
  if (await page.isVisible("#barTab") && !(await page.isVisible("#code"))) await page.click("#barTab");
  await page.fill("#code", code); await page.press("#code", "Enter");
}
const listCodes = async page => { if (await page.isHidden("#qlist")) await page.click("#qlistBtn"); const r = await page.$$eval("#qlist a", as => as.map(a => a.getAttribute("href").slice(1)).sort()); await page.click("#qlistBtn"); return r; };
const rows = page => page.$$eval("#q .opt .txt", xs => xs.map(x => x.textContent.trim()));

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("stem-ob", "done"); } catch { /* */ }
    window.__said = [];                                                    // the voice: what was spoken, how loud (no audio in CI)
    if (!("speechSynthesis" in window)) Object.defineProperty(window, "speechSynthesis", { value: { cancel() {}, speaking: false } });
    if (typeof SpeechSynthesisUtterance !== "function") window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    speechSynthesis.speak = u => window.__said.push({ text: u.text, volume: u.volume });
    speechSynthesis.cancel = () => {};
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");

  await step("sugar start page: the players warm up off screen (no question yet); no YouTube controls, no keyboard", async () => {
    await page.waitForSelector("#rot.parked", { state: "attached", timeout: 6000 });
    assert.equal(await page.$eval("#rot", e => e.inert && e.getAttribute("aria-hidden")), "true");
    const s = await page.$eval("#rot iframe", f => f.src);
    for (const k of ["controls=0", "disablekb=1", "fs=0", "mute=1", "autoplay=1", "playsinline=1"]) assert.ok(s.includes(k), k);
  });

  await step("easy (default): None-is-the-answer hidden, no None row, the tip on top, empty Check live", async () => {
    await typeCode(page, "BANK_EZ12");
    await page.waitForFunction(() => /^CALC1_E0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    assert.deepEqual(await listCodes(page), ["CALC1_E01", "CALC1_E03", "CALC1_E04A", "CALC1_E04B"]);   // the choose-all E04 split into rows
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.deepEqual(await rows(page), ["two", "three", "four"]);
    assert.equal((await page.textContent("#blocks .tip")).trim(), P.all.saccharine.tip);
    assert.equal(await page.title(), "CALC1_E01");
    assert.match(await page.$eval('#qlist a[href="#CALC1_E01"]', a => a.textContent), /Practice Exam 2, Question 1: even numbers/);
    assert.match(await page.textContent("#how"), /Tap all true ones, then Check\. None\? Just tap Check\./);
    assert.equal(await page.$eval("#mcGo", b => b.disabled), false, "Check needs a tick");
  });

  await step("sugar: the formula card (stepper) in order of use; the brainrot corner with the 2 muted players", async () => {
    assert.deepEqual(await page.$$eval("#fcard .st .n", n => n.map(x => x.textContent.trim())), ["1", "2"]);
    assert.equal(await page.$$eval("#fcard .then", t => t.length), 1);
    assert.match(await page.textContent("#fcard .st .g"), /Work and Energy/);
    await page.waitForSelector("#rot:not([hidden])", { timeout: 4000 });
    const srcs = await page.$$eval("#rot iframe", fs => fs.map(f => f.src));
    assert.equal(srcs.length, 2);
    const cats = await page.evaluate(() => window.stemBrainrot.cats);   // curated brainrots (Tony, Oct 5): 2 of his 3 playlists, one video each
    assert.equal(cats.length, 3);
    const catOf = s => cats.findIndex(([, v]) => v.some(([id]) => s.includes("/embed/" + id + "?")));
    for (const s of srcs) { assert.ok(catOf(s) >= 0 && /mute=1/.test(s) && /youtube-nocookie/.test(s), s); }
    assert.notEqual(catOf(srcs[0]), catOf(srcs[1]), "two different playlists");
    const r = await page.$eval("#rot", e => e.getBoundingClientRect().toJSON());
    const hits = await page.$$eval("#q .opt, #mcGo", (es, r) => es.filter(e => { const c = e.getBoundingClientRect(); return r.x < c.right && r.x + r.width > c.left && r.y < c.bottom && r.y + r.height > c.top; }).length, r);
    assert.equal(hits, 0, "the corner covers an answer control");
    const dock = await page.$eval("#rot", e => { const v = [...e.querySelectorAll(".vid")].map(x => x.getBoundingClientRect());   // desktop: "B: top of notes" (Tony, Oct 4)
      return { parent: e.parentElement.id, first: e.parentElement.firstElementChild === e, dock: e.classList.contains("docked"), side: v.length === 2 && Math.abs(v[0].top - v[1].top) < 1 && v[1].left > v[0].right }; });
    assert.deepEqual(dock, { parent: "work", first: true, dock: true, side: true }, "docked at the top of the notes column, players side by side");
    assert.ok(await page.$eval("#xb", e => e.getClientRects().length > 0), "no original, no wrong pick yet: the scratchpad is the default (Tony, Oct 5)");
    const head = await page.evaluate(() => {                            // video-bar.html ?v=1 (Tony, Oct 5): "Cluck" level with "Question"
      scrollTo(0, 0);                                                    // at rest: scrolled, both sticky columns clamp and hide an offset
      const t = s => document.querySelector(s).getBoundingClientRect().top;
      const v = [...document.querySelectorAll("#rot .vid")].map(x => x.getBoundingClientRect());
      return { q: t("#freeze .q-label"), c: t("#rot .rot-hd .xb-label"), tall: v.every(r => Math.abs(r.height / r.width - 16 / 9) < 0.02), cap: v.every(r => r.height <= innerHeight * 0.4 + 1),
        ctl: [...document.querySelectorAll("#rot .ctl, #rot .rtab")].some(e => e.getClientRects().length), box: getComputedStyle(document.getElementById("rot")).display };
    });
    assert.ok(Math.abs(head.q - head.c) <= 1, `labels level: Question ${head.q}, Cluck ${head.c}`);
    assert.deepEqual([head.tall, head.cap, head.ctl], [true, true, false], "9:16 frames, at most 40vh tall; no – / ✕ / tab when docked");
    assert.equal(head.box, "block", "a box of its own (the top bar's .dock class once unwrapped it: nav.css display: contents)");
    const b = "#rot .rot-btn";
    assert.equal(await page.textContent(b), "Curated brainrots");
    assert.equal(await page.getAttribute(b, "aria-expanded"), "true");
    await page.click(b);
    assert.deepEqual(await page.$eval("#rot", e => [e.classList.contains("stashed"), e.querySelector(".rot-btn").getAttribute("aria-expanded"), getComputedStyle(e.querySelector(".duo")).opacity]),
      [true, "false", "0"], "the button folds the players");
    assert.equal(await page.isVisible("#rot .rot-hd .xb-label"), true, "the label row stays");
    await page.click(b); assert.equal(await page.$eval("#rot", e => e.classList.contains("stashed")), false, "and brings them back");
  });

  await step("sugar (phone width): drag the brainrot corner down; the drop stays (and is kept), anchored to the bottom", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.getElementById("rot")?.parentElement === document.body && !document.getElementById("rot").hidden, null, { timeout: 4000 })
      .catch(async () => { await page.evaluate(() => window.stemBrainrot.sync()); await page.waitForFunction(() => document.getElementById("rot")?.parentElement === document.body, null, { timeout: 3000 }); });
    await page.waitForTimeout(300);
    const box = await page.$eval("#rot .duo", e => e.getBoundingClientRect().toJSON());
    const vw = await page.evaluate(() => [innerWidth, innerHeight]);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(60, vw[1] - 60, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
    const st = await page.$eval("#rot", e => ({ b: e.style.bottom, l: e.style.left, t: e.style.top, rect: e.getBoundingClientRect().toJSON() }));
    assert.ok(st.b.endsWith("px") && st.t === "auto" && st.l.endsWith("px"), JSON.stringify(st));
    assert.ok(st.rect.bottom > vw[1] / 2 && st.rect.left < vw[0] / 2, "not in the bottom left: " + JSON.stringify(st.rect));
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-rot")), "bl");
    await page.evaluate(() => window.stemBrainrot.sync()); await page.waitForTimeout(100);
    assert.equal(await page.$eval("#rot", e => e.style.bottom !== "auto" && e.style.left !== "auto"), true, "a re-sync moved the drop");
    const code = await page.textContent("#pcode");                    // back to desktop + the step-off default for the steps below
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { localStorage.removeItem("stem-rot"); localStorage.removeItem("stem-rot-pick"); }); await page.reload(); await opened(page, code);
  });

  await step("sugar: a split row is a True/False question, one try, its own slip", async () => {
    await page.evaluate(() => { location.hash = "CALC1_E04B"; }); await opened(page, "CALC1_E04B");
    await page.evaluate(() => { window.__said = []; });
    assert.deepEqual(await rows(page), ["True", "False"]);
    assert.match(await page.textContent("#blocks"), /True or false: second\./);
    assert.ok(!/Tap a row/.test(await page.textContent("#blocks")), "the parent's tick instructions");
    await page.click('.opt[data-id="t"]'); await page.click('.ch[data-id="t"] .send');
    await page.waitForFunction(() => /Second is false/.test(document.querySelector("#fb")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForSelector("#q.closed", { timeout: 4000 });                                    // one try
    await page.waitForFunction(() => /Hide Cluck's steps/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });   // a row has Cluck too; desktop: the sheet opens by itself
    assert.equal(await page.getAttribute("#clTabE", "aria-selected"), "true");
    assert.equal(await page.evaluate(() => document.getElementById("cluck").contains(document.activeElement)), false, "an auto-open never takes focus");
    await page.waitForFunction(() => document.querySelector("#cluck .wtext .wl") && !document.querySelector("#cluck .wcaret"), null, { timeout: 6000 });
    assert.equal(await page.evaluate(() => window.__said.length), 0, "an auto-open types the text but stays quiet (Tony, Oct 5)");
    assert.equal(await page.$eval("#xb", e => e.getClientRects().length), 0, "Cluck is showing: no scratchpad");
    asked = 0;
    await page.evaluate(() => localStorage.removeItem("stem-wish"));
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
  });

  await step("nothing ticked is a real answer (a try, the miss hint)", async () => {
    await page.click("#mcGo");
    await page.waitForFunction(() => /Missing one/.test(document.querySelector("#fb")?.textContent || ""), null, { timeout: 4000 });
  });

  await step("easy: a pre-written narration is the box text (no /explain); a lone caret, then typed, then the voice reads the same string at 0.2", async () => {
    const said = () => page.evaluate(() => window.__said);
    await page.waitForFunction(() => /Hide Cluck's steps/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });   // desktop: open by itself
    assert.equal(asked, 0, "the pre-written text needs no /explain");
    const anim = () => page.$eval("#wish .wchip", c => getComputedStyle(c).animationName);
    assert.equal(await anim(), "rw-wiggle", "the ad wiggle runs until the first tap (T4)");
    await page.emulateMedia({ reducedMotion: "reduce" }); assert.equal(await anim(), "none", "no wiggle with reduced motion");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.click("#wish .wchip");                                        // the chip still toggles: closed, then open again from the top
    assert.equal(await page.$eval("#wish .wchip", c => c.classList.contains("rw-wiggle")), false, "a tap stops the wiggle for good");
    assert.match(await page.textContent("#wish .wchip"), /Show Cluck's steps/);
    await page.evaluate(() => { window.__said = []; });
    await page.click("#wish .wchip");
    assert.match(await page.textContent("#wish .wchip"), /Hide Cluck's steps/);
    assert.ok(await page.$("#cluck .wtext .wcaret") && !(await page.$("#cluck .wtext .wl")), "the thinking caret comes first, alone");
    assert.equal((await said()).length, 0, "spoken before the text is out");
    await page.waitForFunction(() => document.querySelector("#cluck .wtext .wl"), null, { timeout: 2000 });
    const first = (await page.textContent("#cluck .wtext")).trim();
    assert.ok(first.length < P.all.saccharine.narration.length, "no typing: " + first);
    await page.waitForFunction(t => document.querySelector("#cluck .wtext")?.textContent.trim() === t && !document.querySelector("#cluck .wcaret"),
      P.all.saccharine.narration, { timeout: 4000 });
    const s = await said();
    assert.equal(s.length, 1, JSON.stringify(s));
    assert.equal(s[0].text, speakable(P.all.saccharine.narration));
    assert.ok(Math.abs(s[0].volume - 0.2) < 1e-6, "volume " + s[0].volume);
  });

  await step("past 5 auto wishes an hour, nothing fires until the Explain my mistake tap", async () => {
    await page.evaluate(() => localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))));
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.isHidden("#wish"), true, "the wish block left with the old question");
    await page.click('.opt[data-id="b"]'); await page.click("#mcGo");                       // wrong
    await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForTimeout(400);
    assert.equal(asked, 0, "fired on its own past the cap");
    await page.evaluate(() => { window.__said = []; });
    await page.click("#wish .wchip");
    await page.click("#cluck .wtext");                                       // a tap skips the wait + typing: the text shows as it streams
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 1500 })
      .catch(async e => { throw new Error(e.message + " | wish: " + await page.innerHTML("#cluck") + " | asked " + asked); });
    assert.equal(asked, 1);
    const t = await page.textContent("#cluck .wtext");
    assert.match(t, /POOF! A wish is a wish\./); assert.ok(await page.$("#cluck .wtext .katex"), "math rendered"); assert.ok(!/\*\*/.test(t));
    await page.waitForFunction(() => window.__said.length === 1, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => window.__said[0].text), speakable(parts.join("")), "the voice reads the box text");
    await page.evaluate(() => localStorage.removeItem("stem-wish"));
  });

  await step("Cluck's sheet: fills the notes column; 4 follow-ups through /chat with N left, then the field is done; Escape gives focus back", async () => {
    assert.equal(await page.$eval("#cluck", e => e.parentElement.id), "work", "desktop: the notes column");
    assert.equal(await page.getAttribute("#clTabE", "aria-selected"), "true");
    const box = await page.$eval("#cluck", e => { const r = e.getBoundingClientRect(), w = document.querySelector("#work").getBoundingClientRect(); return [r.width === w.width, w.height, Math.abs(r.bottom - w.bottom) < 1]; });
    assert.equal(box[0], true, "as wide as the column: no dead space"); assert.equal(box[1], 900 - 32, "the column: full height, less the 16px top and bottom margins");
    assert.equal(box[2], true, "the sheet fills the column under the videos");
    assert.equal(await page.textContent("#cluck .ask .left"), "4 left");
    await page.waitForFunction(() => { const r = document.querySelector("#cluck .ask").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 })
      .catch(() => { throw new Error("the ask field is not on screen when the sheet opens"); });
    for (let n = 1; n <= 4; n++) {
      const a0 = asked;
      await page.fill("#cluck .ask input", "why step " + n + "?"); await page.click("#cluck .ask .send");
      await page.waitForFunction(k => document.querySelectorAll("#cluck .wreply").length === k && !document.querySelector("#cluck.wbusy"), n, { timeout: 4000 });
      assert.equal(asked, a0 + 1, "one /chat call");
      { const rr = await page.$$eval("#cluck .wreply", r => r.map(x => x.textContent)); assert.match(rr.at(-1), /Egg-cellent/); }
      assert.equal((await page.$$eval("#cluck .bub.me", r => r.map(x => x.textContent))).at(-1), "why step " + n + "?");
      if (n < 4) assert.equal(await page.textContent("#cluck .ask .left"), `${4 - n} left`);
    }
    assert.ok(!(await page.$("#cluck .ask")) && /4 questions/.test(await page.textContent("#cluck .done-row")), "4 asked: the field is done");
    await page.keyboard.press("Escape");
    assert.equal(await page.isHidden("#cluck"), true);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("wchip")), true, "focus goes back to the chip");
  });

  await step("easy: prove-mode question has no fix boxes; a tick-only set is graded", async () => {
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.$$eval("#q .fix", f => f.length), 0);
    await page.click('.opt[data-id="a"]'); await page.click('.opt[data-id="c"]'); await page.click("#mcGo");
    await page.waitForSelector('#q .opt.right[data-id="a"]', { timeout: 4000 });
  });

  await step("DIET_EZ12: the original questions, every one, no tip, original titles, no fix boxes, no None row", async () => {
    await typeCode(page, "DIET_EZ12");
    await page.waitForFunction(() => /stem-mode=diet/.test(document.cookie), null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll("#qlist a").length === 4, null, { timeout: 8000 });
    assert.deepEqual(await listCodes(page), ["CALC1_E01", "CALC1_E02", "CALC1_E03", "CALC1_E04"]);
    await page.evaluate(() => { location.hash = "CALC1_E02"; }); await opened(page, "CALC1_E02");
    assert.deepEqual(await rows(page), ["3", "5", "7"]);
    await page.click("#mcGo");                                               // None was the key: nothing ticked is right
    await page.waitForSelector("#q.closed", { timeout: 4000 });
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.equal(await page.$$eval("#blocks .tip", t => t.length), 0, "tip in diet mode");
    assert.equal(await page.$$eval("#how", h => h.length), 0, "the sugar how line in diet mode");
    assert.equal(await page.$$eval("#fcard", f => f.length), 0, "formula card in diet mode");
    assert.ok(await page.$eval("#rot", e => e.hidden).catch(() => true), "brainrot in diet mode (not even parked)");
    assert.ok(await page.$eval("#xb", e => e.getClientRects().length > 0), "diet keeps the notes pad on desktop");
    assert.match(await page.$eval('#qlist a[href="#CALC1_E01"]', a => a.textContent), /Original E01/);
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.$$eval("#q .fix", f => f.length), 0, "fix boxes in diet mode (prove mode is gone)");
  });

  await step("SUGAR_EZ12: sugar again; the prefixed form is never remembered", async () => {
    await typeCode(page, "SUGAR_EZ12");
    await page.waitForFunction(() => !/stem-mode=diet/.test(document.cookie), null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll("#qlist a").length === 4, null, { timeout: 8000 });
    const saved = await page.evaluate(() => localStorage.getItem("stem-codes") || "");
    assert.ok(!/DIET|SUGAR/.test(saved), saved);
  });
} finally {
  await browser.close();
  srv.kill();
  stub.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
