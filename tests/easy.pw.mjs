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
const require = createRequire(import.meta.url);
/* the code box: a bank keeps it with the list (Tony, Oct 5 clutter pass C2 / C8), a lone question as a label (C7), a phone strip in the bar */
async function showCode(page) {
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
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
  saccharine: { title: "Practice Exam 2, Question 4", key: "Tick: a", part: ["WE_THM"], split: [
    { sub: "CALC1_E04A", stem: "True or false: first.", answer: "true", slip: "First is true." },
    { sub: "CALC1_E04B", stem: "True or false: second.", answer: "false", slip: "Second is false." }] } };
writeFileSync(join(BANKS, "BANK_EZ12.json"), JSON.stringify({ v: 1, problems: [P.all, P.none, P.prove, P.split] }));
/* clutter C14: every title shares "Term: ", so the list shows one header over the rows, in any shuffle */
const term = (n, w) => ({ code: `CALC1_TR${n}`, title: `Term: ${w}`, type: "num", body: [{ type: "text", md: `Type ${n}.` }], answer: String(n) });
writeFileSync(join(BANKS, "BANK_TRM.json"), JSON.stringify({ v: 1, problems: [term(1, "one"), term(2, "two"), term(3, "three")] }));
/* a stub OpenRouter: streams Cluck's text in 3 pieces, 150 ms apart (design/EASY.md Phase 4) */
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "$$\nv = 2\n$$\n", "Tick: a, c. Egg-cellent."];   // $$ on lines of their own: what live models send
let asked = 0;
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }   // the gate
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
  await showCode(page);
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
    assert.equal(await page.getAttribute("#code", "placeholder"), "e.g. CALC1_E01", "the start title says what to do; the box shows a code (clutter C16)");
    await page.waitForSelector("#rot.parked", { state: "attached", timeout: 6000 });
    assert.equal(await page.$eval("#rot", e => e.inert && e.getAttribute("aria-hidden")), "true");
    const s = await page.$eval("#rot iframe", f => f.src);
    for (const k of ["controls=0", "disablekb=1", "fs=0", "mute=1", "autoplay=1", "playsinline=1"]) assert.ok(s.includes(k), k);
    assert.equal(await page.$$eval('link[rel="preconnect"]', ls => ls.filter(l => /youtube-nocookie/.test(l.href)).length), 1, "the warm-up adds the preconnect (index.html has none)");
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
    await page.reload(); await opened(page, "CALC1_E01");                 // the bank opens a random first question: E01 first this visit
    assert.equal((await page.textContent("#how")).trim(), "Tick every true one.");   // short, first choose-all only (clutter C6)
    assert.equal(await page.$eval("#mcGo", b => b.disabled), false, "Check needs a tick");
  });

  await step("sugar: Key formulas, in order of use; the brainrot corner: one muted player per category", async () => {
    assert.deepEqual(await page.$eval("#fcard", f => { const r = f.getBoundingClientRect(), cs = getComputedStyle(f), nr = f.querySelector(".fc-notch").getBoundingClientRect(), rows = [...f.querySelectorAll("li.f")].map(e => e.getBoundingClientRect());
      return { role: f.getAttribute("role"), label: f.getAttribute("aria-label"), notch: f.querySelector(".fc-notch").textContent.trim(), onBorder: Math.abs((nr.top + nr.bottom) / 2 - r.top) <= 2,
        n: rows.length, arrows: f.querySelectorAll('li.to[aria-hidden="true"]').length, centred: rows.every(q => Math.abs((q.left - r.left) - (r.right - q.right)) <= 2),
        frame: cs.borderTopColor + " " + cs.borderTopWidth, tinted: cs.backgroundColor !== getComputedStyle(document.body).backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)",
        tex: !!f.querySelector(".f .katex"), old: !!f.querySelector(".st, .n, .g, .then, .hd") }; }),   // Tony, Oct 5: "hybrid of 4 and 5" (design/mockups/formula-use.html ?v=7)
      { role: "note", label: "Key formulas, in order", notch: "Key formulas", onBorder: true, n: 2, arrows: 1, centred: true, frame: "rgb(122, 184, 255) 1px", tinted: true, tex: true, old: false });
    await page.waitForSelector("#rot:not([hidden])", { timeout: 4000 });
    const srcs = await page.$$eval("#rot iframe", fs => fs.map(f => f.src));
    assert.equal(srcs.length, 3);
    const cats = await page.evaluate(() => window.stemBrainrot.cats);   // curated brainrots (Tony, Oct 5): all 3 playlists, one video each
    assert.equal(cats.length, 3);
    const catOf = s => cats.findIndex(([, v]) => v.some(([id]) => s.includes("/embed/" + id + "?")));
    for (const s of srcs) { assert.ok(catOf(s) >= 0 && /mute=1/.test(s) && /youtube-nocookie/.test(s), s); }
    assert.equal(new Set(srcs.map(catOf)).size, 3, "one per playlist");
    const r = await page.$eval("#rot", e => e.getBoundingClientRect().toJSON());
    const hits = await page.$$eval("#q .opt, #mcGo", (es, r) => es.filter(e => { const c = e.getBoundingClientRect(); return r.x < c.right && r.x + r.width > c.left && r.y < c.bottom && r.y + r.height > c.top; }).length, r);
    assert.equal(hits, 0, "the corner covers an answer control");
    const dock = await page.$eval("#rot", e => { const v = [...e.querySelectorAll(".vid")].map(x => x.getBoundingClientRect());   // desktop: "B: top of notes" (Tony, Oct 4)
      return { parent: e.parentElement.id, first: e.parentElement.firstElementChild === e, dock: e.classList.contains("docked"), side: v.length === 3 && Math.abs(v[0].top - v[1].top) < 1 && v[1].left > v[0].right }; });
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
    assert.equal(await page.textContent("#rot .rot-hd .xb-label"), "Explain", "the column label (Tony, Oct 5: explain-column.html D1)");
    const b = "#rot .rot-link", folded = () => page.$eval("#rot", e => e.classList.contains("stashed"));
    assert.deepEqual([await page.textContent(b), await page.getAttribute(b, "aria-expanded")], ["Hide curated brainrot", "true"]);
    assert.equal(await page.$$eval("#rot .rot-btn, #rot .rot-grip", e => e.length), 0, "no button, no grip: one text link (Tony, Oct 5)");
    { const [l, k] = await page.$$eval("#rot .rot-hd .xb-label, #rot .rot-link", es => es.map(e => e.getBoundingClientRect()).map(r => r.top + r.height / 2));
      assert.ok(Math.abs(l - k) <= 2, `the link sits level with "Explain": ${l} vs ${k}`); }
    await page.click(b);
    assert.deepEqual(await page.$eval("#rot", e => [e.classList.contains("stashed"), e.querySelector(".rot-link").getAttribute("aria-expanded"), getComputedStyle(e.querySelector(".duo")).opacity]),
      [true, "false", "0"], "the link folds the players");
    assert.equal(await page.textContent(b), "Show curated brainrot");
    assert.equal(await page.isVisible("#rot .rot-hd .xb-label"), true, "the label row stays");
    await page.click(b); assert.equal(await folded(), false, "and brings them back");
    assert.deepEqual(await page.$eval("#rot .duo", d => [d.scrollWidth > d.clientWidth + 20, getComputedStyle(d).overflowX]), [true, "auto"], "3 videos in one box: the third scrolls in sideways");
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
    assert.deepEqual(await page.$eval("#fcard", f => { const r = f.getBoundingClientRect(), cs = getComputedStyle(f), nr = f.querySelector(".fc-notch").getBoundingClientRect(), rows = [...f.querySelectorAll("li.f")].map(e => e.getBoundingClientRect());
      return { role: f.getAttribute("role"), label: f.getAttribute("aria-label"), notch: f.querySelector(".fc-notch").textContent.trim(), onBorder: Math.abs((nr.top + nr.bottom) / 2 - r.top) <= 2,
        n: rows.length, arrows: f.querySelectorAll('li.to[aria-hidden="true"]').length, centred: rows.every(q => Math.abs((q.left - r.left) - (r.right - q.right)) <= 2),
        frame: cs.borderTopColor + " " + cs.borderTopWidth, tinted: cs.backgroundColor !== getComputedStyle(document.body).backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)",
        tex: !!f.querySelector(".f .katex"), old: !!f.querySelector(".st, .n, .g, .then, .hd") }; }),
      { role: "note", label: "Key formulas", notch: "Key formulas", onBorder: true, n: 1, arrows: 0, centred: true, frame: "rgb(122, 184, 255) 1px", tinted: true, tex: true, old: false }, "one formula: the same box, no arrow");
    assert.match(await page.textContent("#blocks"), /True or false: second\./);
    assert.ok(!/Tap a row/.test(await page.textContent("#blocks")), "the parent's tick instructions");
    await page.click('.opt[data-id="t"]'); await page.click('.ch[data-id="t"] .send');
    await page.waitForFunction(() => /Second is false/.test(document.querySelector("#fb")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForSelector("#q.closed", { timeout: 4000 });                                    // one try
    await page.waitForFunction(() => /Hide Cluck's steps/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });   // a row has Cluck too; desktop: the sheet opens by itself
    assert.equal(await page.isVisible("#cluck #clTabEP"), true, "Cluck's text shows");
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
    await page.waitForFunction(() => /Missing one/.test(document.querySelector("#q .chk .cluck")?.textContent || ""), null, { timeout: 4000 });   // short: left of Check (Tony, Oct 5)
  });

  await step("easy: a pre-written narration is the box text (no /explain); a lone caret, then typed; no voice (Tony, Oct 5)", async () => {
    const said = () => page.evaluate(() => window.__said);
    await page.waitForFunction(() => /Hide Cluck's steps/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });   // desktop: open by itself
    assert.equal(asked, 0, "the pre-written text needs no /explain");
    const anim = () => page.$eval("#wish .wchip", c => getComputedStyle(c).animationName);
    assert.equal(await anim(), "rw-wiggle", "the ad wiggle runs until the first tap (T4)");
    await page.emulateMedia({ reducedMotion: "reduce" }); assert.equal(await anim(), "none", "no wiggle with reduced motion");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await page.isHidden("#wish"), true, "desktop, sheet open: no Show/Hide chip (Tony, Oct 5: variant a)");
    await page.click("#cluck .cl-x2");                                       // closed: the chip is the way back, then open again from the top
    assert.match(await page.textContent("#wish .wchip"), /Show Cluck's steps/);
    assert.equal(await page.isVisible("#wish .wchip"), true);
    await page.evaluate(() => { window.__said = []; });
    await page.click("#wish .wchip");
    assert.equal(await page.$eval("#wish .wchip", c => c.classList.contains("rw-wiggle")), false, "a tap stops the wiggle for good");
    assert.match(await page.textContent("#wish .wchip"), /Hide Cluck's steps/);
    assert.equal(await page.isHidden("#wish"), true, "open again: the chip steps aside");
    assert.ok(await page.$("#cluck .wtext .wcaret") && !(await page.$("#cluck .wtext .wl")), "the thinking caret comes first, alone");
    assert.equal((await said()).length, 0, "spoken before the text is out");
    await page.waitForFunction(() => document.querySelector("#cluck .wtext .wl"), null, { timeout: 2000 });
    const first = (await page.textContent("#cluck .wtext")).trim();
    assert.ok(first.length < P.all.saccharine.narration.length, "no typing: " + first);
    await page.waitForFunction(t => document.querySelector("#cluck .wtext")?.textContent.trim() === t && !document.querySelector("#cluck .wcaret"),
      P.all.saccharine.narration, { timeout: 4000 });
    assert.deepEqual(await said(), [], "no voice: the voice is gone (Tony, Oct 5)");
    assert.equal(await page.$("#wish .wvoice"), null, "no voice button");
  });

  await step("past 5 auto wishes an hour, nothing fires until the Explain my mistake tap", async () => {
    await page.evaluate(() => localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))));
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.$("#how"), null, "the tick line is for the first choose-all only (clutter C6)");
    assert.equal(await page.$eval(".choices", g => g.getAttribute("aria-label")), "Choices");
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
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__said.length), 0, "no voice (Tony, Oct 5)");
    await page.evaluate(() => localStorage.removeItem("stem-wish"));
  });

  await step("Cluck's sheet: fills the notes column; 5 follow-ups through /chat with N left, then the field is done; Escape gives focus back", async () => {
    assert.equal(await page.$eval("#cluck", e => e.parentElement.id), "work", "desktop: the notes column");
    assert.equal(await page.isVisible("#cluck #clTabEP"), true);
    const box = await page.$eval("#cluck", e => { const r = e.getBoundingClientRect(), w = document.querySelector("#work").getBoundingClientRect(); return [r.width === w.width, w.height, Math.abs(r.bottom - w.bottom) < 1]; });
    assert.equal(box[0], true, "as wide as the column: no dead space"); assert.ok(box[1] <= 900 - 32, `the column: as tall as its content, at most the window less the 16px margins (Tony, Oct 6): ${box[1]}`);
    assert.equal(box[2], true, "the sheet fills the column under the videos");
    assert.deepEqual(await page.$eval("#rot", e => [e.classList.contains("stashed"), e.querySelector(".rot-link").getAttribute("aria-expanded"), e.querySelector(".rot-hd").getClientRects().length > 0]),
      [false, "true", true], "the sheet is open: the players stay, shown by default; the label row stays (Tony, Oct 6)");
    assert.equal(await page.textContent("#cluck .ask .left"), "5 left");
    assert.equal(await page.$$eval("#cluck [role=tab], #cluck .cl-ttl", e => e.length), 0, "one scroll: no tabs, no second title (Tony, Oct 5: variant a)");
    const aa = await page.evaluate(() => {                                    // every RM3 pair reads AA (the mock: all >= 7:1)
      const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number), L = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const cs = sel => getComputedStyle(document.querySelector(sel)), sheet = cs("#cluck").backgroundColor;
      return { text: cr(cs("#cluck .wtext").color, sheet), muted: cr(cs("#cluck .cl-fold-n").color, sheet), me: cr(getComputedStyle(document.querySelector("#cluck"), null).getPropertyValue("--ai-on-ct").trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16))})`), getComputedStyle(document.querySelector("#cluck")).getPropertyValue("--ai-ct").trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16))})`)),
        send: cr(cs("#cluck .send").color, cs("#cluck .send").backgroundColor), left: cr(cs("#cluck .ask .left").color, cs("#cluck .ask").backgroundColor),
        live: cr(cs("#cluck .cl-live").color, sheet), tag: cr(cs("#cluck .who .tag").color, cs("#cluck .who .tag").backgroundColor),
        name: cr(cs("#cluck .who .name").color, sheet), time: cr(cs("#cluck .who .time").color, sheet) };
    });
    for (const [k, v] of Object.entries(aa)) assert.ok(v >= 4.5, `${k} ${v.toFixed(2)}:1 < 4.5`);
    await page.waitForFunction(() => { const r = document.querySelector("#cluck .ask").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 })
      .catch(() => { throw new Error("the ask field is not on screen when the sheet opens"); });
    for (let n = 1; n <= 5; n++) {
      const a0 = asked;
      await page.fill("#cluck .ask input", "why step " + n + "?"); await page.click("#cluck .ask .send");
      if (n === 1) assert.match(await page.textContent("#cluck .cl-live"), /Cluck is typing/, "the typing line while Cluck answers");
      if (n === 1) assert.equal(await page.isVisible("#cluck .cl-live"), true, "the typing line while Cluck answers");
      await page.waitForFunction(k => document.querySelectorAll("#cluck .wreply").length === k && !document.querySelector("#cluck.wbusy"), n, { timeout: 4000 });
      if (n === 1) {
        assert.equal(await page.isVisible("#cluck .cl-live"), false, "the typing line leaves once typed");
        assert.equal((await page.textContent("#cluck .cl-verify:visible")).trim(), "verify b4 use lol", "the grey line under Cluck's text (Tony, Oct 5)");
        assert.deepEqual(await page.$$eval("#cluck .msg .name", e => e.map(x => x.textContent)), ["Cluck", "You", "Cluck"], "Cluck and you, as chat users (C1)");
        const look = sel => page.$eval(sel, e => { const c = getComputedStyle(e); return [c.borderTopWidth, c.boxShadow, c.paddingLeft, c.backgroundColor].join(" | "); });
        assert.equal(await look("#cluck .wreply"), await look("#cluck .wtext:not(.wreply)"), "one speaker, one format: the reply has no card");
        assert.deepEqual(await page.$eval("#cluck .wreply", r => [!!r.querySelector(".wmath .katex"), r.textContent.includes("$$")]), [true, false], "split $$ lines render as one display line");
      }
      assert.equal(asked, a0 + 1, "one /chat call");
      { const rr = await page.$$eval("#cluck .wreply", r => r.map(x => x.textContent)); assert.match(rr.at(-1), /Egg-cellent/); }
      assert.equal((await page.$$eval("#cluck .msg.me .md", r => r.map(x => x.textContent))).at(-1), "why step " + n + "?");
      if (n < 5) assert.equal(await page.textContent("#cluck .ask .left"), `${5 - n} left`);
    }
    assert.ok(!(await page.$("#cluck .ask")) && /5 questions/.test(await page.textContent("#cluck .done-row")), "5 asked: the field is done");
    await page.keyboard.press("Escape");
    assert.equal(await page.isHidden("#cluck"), true);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("wchip")), true, "focus goes back to the chip");
    assert.equal(await page.$eval("#rot", e => e.classList.contains("stashed")), false, "the sheet is shut: the players come back");
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

  /* a slow link (Tony, Oct 5: 128 kbps): no corner, no preconnect, not one request to YouTube, on a question with a layer */
  async function noRot(url, init) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    if (init) await c.addInitScript(init);
    const yt = [];
    c.on("request", r => { if (/youtube|ytimg/.test(r.url())) yt.push(r.url()); });
    const p = await c.newPage();
    await p.goto(BASE + url);
    await typeCode(p, "BANK_EZ12");
    await p.waitForFunction(() => /^CALC1_E0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    await p.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(p, "CALC1_E01");
    await p.waitForTimeout(3500);                                          // past warmUp's idle (3 s at most)
    await p.evaluate(() => window.stemBrainrot.sync());
    assert.equal(await p.$("#rot"), null, "no corner");
    assert.equal(await p.$$eval('link[rel="preconnect"]', ls => ls.filter(l => /youtube|ytimg/.test(l.href)).length), 0, "no preconnect");
    assert.deepEqual(yt, [], "a request went to YouTube");
    await c.close();
  }
  await step("clutter wave 4: no top gap, notes placeholder in the body font, Copy only with text, one header for a shared title prefix", async () => {
    await typeCode(page, "CALC1_E01"); await opened(page, "CALC1_E01");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).paddingTop), "0px", "C13: no top offset over a question");
    const ff = await page.evaluate(() => getComputedStyle(document.querySelector("#scratch"), "::placeholder").fontFamily);
    assert.match(ff, /^"?Atkinson Hyperlegible"?,/, `C9: placeholder font ${ff}`);
    assert.equal(await page.getAttribute("#scratch", "placeholder"), "Paste GPT answer here, but me be sad...", "C9: the joke stays");
    assert.equal(await page.locator("#cut").count(), 0, "C10: no Cut all");
    assert.ok(await page.locator("#copy").isHidden(), "C10: Copy on an empty pad");
    const type = v => page.evaluate(v => { const t = document.querySelector("#scratch"); t.value = v; t.dispatchEvent(new Event("input")); return document.querySelector("#copy").hidden; }, v);
    assert.equal(await type("x"), false, "C10: Copy with text");   // the sugar page covers the pad (Cluck's column), so no fill()
    assert.equal(await type(""), true, "C10: Copy after the pad is emptied");
    await typeCode(page, "BANK_TRM");
    await page.waitForFunction(() => /^CALC1_TR/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    if (await page.isHidden("#qlist")) await page.click("#qlistBtn");
    const l = await page.evaluate(() => ({ heads: [...document.querySelectorAll("#qlist .qh")].map(h => h.textContent),
      rows: [...document.querySelectorAll("#qlist .qt")].map(t => t.textContent).sort(), labels: [...document.querySelectorAll("#qlist a")].map(a => a.getAttribute("aria-label")),
      w: document.querySelector("#qlist").getBoundingClientRect().width, bar: ["#qlistBtn", "#qnext"].map(s => document.querySelector(s).getBoundingClientRect()).map(r => [r.left, r.right]),
      list: (r => [r.left, r.right])(document.querySelector("#qlist").getBoundingClientRect()), cols: getComputedStyle(document.querySelector("#qlist ol")).gridTemplateColumns.split(" ").length,
      tops: ["#qlistBtn", "#qshuf", "#entry", "#qprev", "#qnext"].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top)), hidden: [...document.querySelectorAll("#qlist .qh")].every(h => h.getAttribute("aria-hidden") === "true") }));
    assert.deepEqual(l.heads, ["Term"], "C14: one header");
    assert.deepEqual(l.rows, ["one", "three", "two"], "C14: rows show the rest of the title");
    assert.ok(l.hidden && l.labels.every(x => /^\d\. Term: \w+\.$/.test(x)), `C14: the link keeps the full title: ${l.labels}`);
    assert.ok(Math.abs(l.list[0] - l.bar[0][0]) < 1 && Math.abs(l.list[1] - l.bar[1][1]) < 1, `the list spans the bar, no gap at its right (Tony, Oct 6): ${JSON.stringify([l.list, l.bar])}`);
    assert.ok(l.cols >= 2, `C14 kept: wide, the rows go in columns (${l.cols}), never one ${l.w}px row`);
    assert.equal(new Set(l.tops).size, 1, `the list open, the bar stays one row (Tony, Oct 6): tops ${l.tops}`);
    await page.click("#qlistBtn");
  });
  await step("slow link (?slow=1): no brainrot corner, no YouTube at all", () => noRot("/?slow=1"));
  await step("slow link (Data Saver, navigator.connection): no brainrot corner, no YouTube at all", () =>
    noRot("/", () => Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g", downlink: 10 } })));
} finally {
  await browser.close();
  srv.kill();
  stub.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
