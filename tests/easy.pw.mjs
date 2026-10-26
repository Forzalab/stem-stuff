// Sugar mode (saccharine, the default) vs diet (DIET_<code>, the original questions), design/EASY.md: no "None of these" in either;
// sugar hides None-is-the-answer questions, drops fix boxes, shows the saccharine title and tip, and Cluck; SUGAR_ goes back. Starts its own
// serve.py with a throwaway banks/ folder and tries.json:   node tests/easy.pw.mjs [port]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const pilotSheet = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "formula-sheet-pilot.json"), "utf8"));   // 8 verbatim rows of sheet v3, docs included
const pilot = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "ladder-pilot.json"), "utf8")).items;
mkdirSync(BANKS);
/* BUOY, verbatim from brain sheet v3: the sheet's longest formula (about 560px at the card's size), no picture */
const BUOY = { id: "BUOY", tex: "B = \\rho_{fluid} V_{fluid\\ displaced}\\, g,\\quad V_{fluid\\ displaced} = V_{object} \\text{ (submerged)}", doc: { sym: [{ s: "B", m: "buoyant force, upward", u: "N" },
  { s: "\\rho_{fluid}", m: "density of the fluid", u: "kg/m³" }, { s: "V_{fluid\\ displaced}", m: "volume of fluid pushed aside", u: "m³" }, { s: "g", m: "free-fall acceleration, 9.8 m/s²", u: "m/s²" },
  { s: "V_{object}", m: "volume of the object", u: "m³" }], when: "Use for any object in a fluid. Fully submerged: displaced volume equals object volume.",
  ex: "ρ=1000 kg/m³, V=0.0020 m³ submerged → B = 1000·0.0020·9.8 = 19.6 N", purpose: "Buoyant force (the push up from a fluid on a thing in it): density of the fluid times the volume it displaces times g. A boat, a ball under water, a balloon." } };
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Work and Energy",
  rows: [{ id: "WE_THM", tex: "W_{net} = \\Delta K" }, { id: "W_AREA", tex: "W = \\text{area under } F\\text{-}x" }] }, ...pilotSheet.groups, { name: "Buoyancy", exam: [3], rows: [BUOY] }] }));
writeFileSync(join(BANKS, "BANK_BUO.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_BU1", title: "Buoyancy", type: "num", body: [{ type: "text", md: "A long formula." }], answer: "4",
  saccharine: { title: "Buoyancy", part: ["BUOY", "I_SUM"] } }] }));
/* ladder lane 3: the pilot's one-formula item (Q11 Q4e: mid pieces only) and its 4-formula item (Q11 Q5: mid pieces + 3 chain arrows) as CALC1 numerics */
const lad = (code, it) => ({ code, title: it.title, type: "num", body: [{ type: "text", md: "Ladder pilot." }], answer: "4", saccharine: { title: it.title, part: it.part, ladder: it.ladder } });
writeFileSync(join(BANKS, "BANK_LAD.json"), JSON.stringify({ v: 1, problems: [lad("CALC1_LD1", pilot.find(i => i.code === "PHYS_Z3X")), lad("CALC1_LD2", pilot.find(i => i.code === "PHYS_PGX"))] }));
P.split = { code: "CALC1_E04", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: "Two rows." }, { type: "text", md: "Tap a row to tick it." }],
  choices: [row("a", "first"), row("b", "second")], correct: ["a"], miss: "QUACK. Missing one.",
  saccharine: { title: "Practice Exam 2, Question 4", key: "Tick: a", part: ["WE_THM"], split: [
    { sub: "CALC1_E04A", stem: "True or false: first.", answer: "true", slip: "First is true." },
    { sub: "CALC1_E04B", stem: "True or false: second.", answer: "false", slip: "Second is false." }] } };
/* a problem far taller than a 1280×720 window, with a formula card: desktop has one scroller, the page (Tony, Oct 18) */
P.long = { code: "CALC1_L01", title: "Long one", type: "num", answer: "4",
  body: Array.from({ length: 24 }, (_, i) => ({ type: "text", md: `Line ${i + 1} of a long problem: $W = F d$ holds here.` })),
  saccharine: { title: "Long one", part: ["WE_THM", "W_AREA"] } };
writeFileSync(join(BANKS, "BANK_LONG.json"), JSON.stringify({ v: 1, problems: [P.long] }));
writeFileSync(join(BANKS, "BANK_EZ12.json"), JSON.stringify({ v: 1, problems: [P.all, P.none, P.prove, P.split] }));
/* every title shares "Term: ": the list still shows one row per question, number + whole title, no shared-prefix header (owner, Oct 6) */
const term = (n, w) => ({ code: `CALC1_TR${n}`, title: `Term: ${w}`, type: "num", body: [{ type: "text", md: `Type ${n}.` }], answer: String(n) });
writeFileSync(join(BANKS, "BANK_TRM.json"), JSON.stringify({ v: 1, problems: [term(1, "one"), term(2, "two"), term(3, "three")] }));
/* a stub OpenRouter: streams Cluck's text in 3 pieces, 150 ms apart (design/EASY.md Phase 4) */
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "$$\nv = 2\n$$\n", "Tick: a, c. Egg-cellent."];   // $$ on lines of their own: what live models send
let asked = 0, gate = null, release = () => {};   // gate: a promise the next stream waits on before its first piece (one stream only)
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }   // the gate
  asked++;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const g = gate; gate = null; await g;
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
    try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
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

  await step("easy (default): None-is-the-answer hidden, no None row, the title on top (not the tip), empty Check live", async () => {
    await typeCode(page, "BANK_EZ12");
    await page.waitForFunction(() => /^CALC1_E0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    assert.deepEqual(await listCodes(page), ["CALC1_E01", "CALC1_E03", "CALC1_E04A", "CALC1_E04B"]);   // the choose-all E04 split into rows
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.deepEqual(await rows(page), ["two", "three", "four"]);
    assert.equal((await page.textContent("#blocks .ptitle")).trim(), P.all.saccharine.title, "the card's lead is the list's title");   // owner, Oct 6
    assert.equal(await page.$$eval("#blocks .tip", t => t.length), 0, "the tip is not shown");
    assert.ok(!(await page.textContent("#blocks")).includes(P.all.saccharine.tip), "the tip text is on the card");
    assert.equal(await page.title(), "CALC1_E01");
    assert.match(await page.$eval('#qlist a[href="#CALC1_E01"]', a => a.textContent), /Practice Exam 2, Question 1: even numbers/);
    await page.reload(); await opened(page, "CALC1_E01");                 // the bank opens a random first question: E01 first this visit
    assert.equal((await page.textContent("#how")).trim(), "Tick every true one.");   // short, first choose-all only (clutter C6)
    assert.equal(await page.$eval("#mcGo", b => b.disabled), false, "Check needs a tick");
  });

  await step("sugar: Key formulas, in order of use; the brainrot corner: 3 muted players, 3 different categories", async () => {
    assert.deepEqual(await page.$eval("#fcard", f => { const r = f.getBoundingClientRect(), cs = getComputedStyle(f), nr = f.querySelector(".fc-notch").getBoundingClientRect(), rows = [...f.querySelectorAll("li.f")].map(e => e.getBoundingClientRect());
      return { role: f.getAttribute("role"), label: f.getAttribute("aria-label"), notch: f.querySelector(".fc-notch").textContent.trim(), onBorder: Math.abs((nr.top + nr.bottom) / 2 - r.top) <= 2,
        n: rows.length, arrows: f.querySelectorAll('li.to[aria-hidden="true"]').length, centred: rows.every(q => Math.abs((q.left - r.left) - (r.right - q.right)) <= 2),
        frame: cs.borderTopColor + " " + cs.borderTopWidth, tinted: cs.backgroundColor !== getComputedStyle(document.body).backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)",
        tex: !!f.querySelector(".f .katex"), old: !!f.querySelector(".st, .n, .g, .then, .hd") }; }),   // Tony, Oct 5: "hybrid of 4 and 5" (design/mockups/formula-use.html ?v=7)
      { role: "note", label: "Key formulas, in order", notch: "Key formulas", onBorder: true, n: 2, arrows: 1, centred: true, frame: "rgb(146, 192, 255) 1px", tinted: true, tex: true, old: false });
    await page.waitForSelector("#rot:not([hidden])", { timeout: 4000 });
    const srcs = await page.$$eval("#rot iframe", fs => fs.map(f => f.src));
    assert.equal(srcs.length, 3);
    const cats = await page.evaluate(() => window.stemBrainrot.cats);   // curated brainrots: 3 playlists (Tony, Oct 5) + 5 hand-curated (Oct 26); 3 random categories per load, one video each
    assert.equal(cats.length, 8);
    const catOf = s => cats.findIndex(([, v]) => v.some(([id]) => s.includes("/embed/" + id + "?")));
    for (const s of srcs) { assert.ok(catOf(s) >= 0 && /mute=1/.test(s) && /youtube-nocookie/.test(s), s); }
    assert.equal(new Set(srcs.map(catOf)).size, 3, "3 different categories");
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

  await step("sugar (phone width, 390): no brainrot corner, no preconnect, no request to YouTube (Tony, Oct 17)", () => noRot("/", null, { width: 390, height: 844 }));

  await step("sugar (tablet width): drag the brainrot corner down; the drop stays (and is kept), anchored to the bottom", async () => {
    await page.setViewportSize({ width: 710, height: 844 });
    await page.evaluate(() => window.stemBrainrot.sync());
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
      { role: "note", label: "Key formulas", notch: "Key formulas", onBorder: true, n: 1, arrows: 0, centred: true, frame: "rgb(146, 192, 255) 1px", tinted: true, tex: true, old: false }, "one formula: the same box, no arrow");
    assert.match(await page.textContent("#blocks"), /True or false: second\./);
    assert.ok(!/Tap a row/.test(await page.textContent("#blocks")), "the parent's tick instructions");
    await page.click('.opt[data-id="t"]'); await page.click('.ch[data-id="t"] .send');
    await page.waitForFunction(() => /Second is false/.test(document.querySelector("#fb")?.textContent || ""), null, { timeout: 4000 });
    await page.waitForSelector("#q.closed", { timeout: 4000 });                                    // one try
    await page.waitForFunction(() => /Ask Cluck/.test(document.querySelector("#wish .cue-chip")?.textContent || "") && document.querySelector("#wish .cue-chip").getAttribute("aria-expanded") === "false", null, { timeout: 6000 });   // a row has Cluck too. Closed out of tries = the T17b-1 duck chip "Ask Cluck"
    assert.equal(await page.evaluate(() => !!window.stemCluckOpen && window.stemCluckOpen()), false, "a wrong answer never opens Cluck by itself, desktop too (B7 ii, Tony Oct 18)");
    await page.click("#wish .cue-chip");
    assert.equal(await page.isVisible("#cluck #clTabEP"), true, "Cluck's text shows");
    await page.waitForFunction(() => document.querySelector("#cluck .wtext .wl") && !document.querySelector("#cluck .wcaret"), null, { timeout: 6000 });
    assert.equal(await page.evaluate(() => window.__said.length), 0, "Cluck types the text but stays quiet (Tony, Oct 5)");
    assert.equal(await page.$eval("#xb", e => e.getClientRects().length), 0, "Cluck is showing: no scratchpad");
    asked = 0;
    await page.evaluate(() => localStorage.removeItem("stem-wish"));
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
  });

  await step("ladder (lane 3): a ladder card starts as the big pieces; stemLadder.step() pops the middle pieces, then the arrows, one each; then it stops", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const vis = sel => page.$$eval("#fcard " + sel, es => es.filter(e => !e.hidden && getComputedStyle(e).display !== "none").length);
    await page.evaluate(() => { location.hash = "CALC1_LD1"; }); await opened(page, "CALC1_LD1");
    assert.deepEqual([await vis("li.f:not(.mid)"), await vis("li.f.mid"), await page.evaluate(() => window.stemLadder.left())], [1, 0, 2], "Q11 Q4e: KE only, 2 pieces waiting");
    assert.equal(await page.$$eval("#fcard li.to", t => t.length), 0);
    /* per piece: [For, Why] as shown, and its "why?" toggle (null when hidden, else aria-expanded) */
    const notes = () => page.$$eval("#fcard li.f.mid", ms => ms.map(m => [...[...m.querySelectorAll(".fh")].map(h => h.checkVisibility() ? h.textContent.replace(/\s+/g, " ").trim() : ""),
      m.querySelector(".fh-more").checkVisibility() ? m.querySelector(".fh-more").getAttribute("aria-expanded") : null]));
    const want = pilot.find(i => i.code === "PHYS_Z3X").ladder.mid.map(m => [`Use it for ${m.use}`, `Why this ${m.why}`]), shut = ["", ""];
    assert.deepEqual(await notes(), [[...shut, null], [...shut, null]], "use/why wait with their pieces");
    for (const n of [1, 2]) {
      assert.equal(await page.evaluate(() => window.stemLadder.step()), true);
      assert.equal(await vis("li.f.mid"), n);
      assert.deepEqual(await notes(), want.map((w, i) => i === n - 1 ? [...w, null] : i < n ? [...shut, "false"] : [...shut, null]),
        "only the newest piece shows its use and why, as written; an older one folds to a why? toggle; a waiting one shows nothing");
    }
    const lab = await page.$eval("#fcard li.f.mid.cur .fh", h => { const b = getComputedStyle(h.querySelector("b")), t = getComputedStyle(h); return [b.color === t.color, t.textAlign, +t.fontWeight]; });
    assert.deepEqual(lab, [true, "start", 400], "notes are quiet captions: label in the note's colour (no blue), left-aligned, regular weight");
    const more = page.locator("#fcard li.f.mid:not(.cur) .fh-more");
    await more.click();
    assert.deepEqual(await notes(), [[...want[0], "true"], [...want[1], null]], "why? opens an older piece's notes in place");
    await more.focus(); await page.keyboard.press("Enter");
    assert.deepEqual(await notes(), [[...shut, "false"], [...want[1], null]], "Enter on why? folds them again");
    assert.equal(await page.$$eval("#fcard li.f.mid .katex", k => k.length), 2, "mid pieces are KaTeX");
    assert.equal(await page.evaluate(() => window.stemLadder.step()), false, "all out: the ladder stops");
    assert.equal(await page.evaluate(() => window.stemLadder.left()), 0);
    await page.evaluate(() => { location.hash = "CALC1_LD2"; }); await opened(page, "CALC1_LD2");
    assert.deepEqual([await vis("li.f:not(.mid)"), await vis("li.f.mid"), await vis("li.to"), await page.$$eval("#fcard li.to", t => t.length)], [4, 0, 0, 3], "Q11 Q5: 4 big pieces, no arrows yet");
    for (let i = 1; i <= 6; i++) {
      assert.equal(await page.evaluate(() => window.stemLadder.step()), true, "step " + i);
      assert.deepEqual([await vis("li.f.mid"), await vis("li.to")], [Math.min(i, 3), Math.max(0, i - 3)], "mid pieces first, then arrows, one per step");
    }
    assert.equal(await page.evaluate(() => window.stemLadder.step()), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll at 360");
    await page.evaluate(() => { location.hash = "CALC1_LD2"; location.reload(); }); await opened(page, "CALC1_LD2");
    assert.equal(await vis("li.to"), 0, "a fresh visit starts at the big pieces again");
  });

  await step('"?" docs: a small button per formula with a sheet doc; a popover built on open (formula, purpose, symbols + units, when, example); one at a time; Esc, an outside tap and a second tap close it; no doc, no "?"', async () => {
    /* which row's popover is open: the index of the "?" whose aria-controls names the one .pop in the page */
    const open = () => page.evaluate(() => [...document.querySelectorAll(".pop")].map(p => [...document.querySelectorAll("#fcard .fq")].findIndex(q => q.getAttribute("aria-controls") === p.id)));
    assert.equal(await page.$$eval("#fcard .fq", b => b.length), 4);
    assert.deepEqual(await page.$$eval("#fcard .fq", b => b.map(x => [x.textContent, x.getAttribute("aria-expanded"), x.getAttribute("aria-haspopup")])), Array(4).fill(["?", "false", "dialog"]));
    assert.deepEqual(await open(), [], "lazy: no popover in the page until a ? is tapped");
    await page.waitForFunction(() => !document.querySelector("#splash:not(.out)"));   // the last step reloaded: the splash goes first
    await page.$eval("#fcard .fq", x => x.scrollIntoView({ block: "center" }));
    const size = await page.$eval("#fcard .fq", x => { const r = x.getBoundingClientRect(), hit = (dx, dy) => { const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy); return x.contains(e) || (e ? e.tagName + "." + e.className + "#" + e.id : "none"); };
      return [r.width <= 16.5 && r.height <= 16.5, hit(20, 0), hit(-20, 0), hit(0, 20), hit(0, -20)]; });
    assert.deepEqual(size, [true, true, true, true, true], "a 16px mark with a 44px tap area");
    const q = await page.$$("#fcard .fq");
    await q[2].click();
    assert.deepEqual(await open(), [2]);
    const d = await page.$eval(".pop", e => { const r = e.getBoundingClientRect(), row = document.querySelectorAll("#fcard li.f:not(.mid)")[2], fm = e.firstElementChild.getBoundingClientRect(), rf = row.querySelector(".fm").getBoundingClientRect();
      return { syms: e.querySelectorAll(".fd-sym li").length, katex: e.querySelectorAll(".fd-s .katex").length, units: [...e.querySelectorAll(".fd-u")].every(u => u.textContent.trim()),
        when: /^Use it\s+\S/.test(e.querySelector(".fd-w").textContent), ex: /^Example\s+\S/.test(e.querySelector(".fd-x").textContent), dialog: e.getAttribute("role") === "dialog" && e.dataset.variant === "doc",
        inView: r.left >= 0 && r.right <= innerWidth, formula: e.firstElementChild.className === "pop-h" && e.firstElementChild.textContent === row.querySelector(".fm").textContent,
        sameSize: getComputedStyle(e.firstElementChild).fontSize === getComputedStyle(row).fontSize,
        centred: Math.abs((fm.left + fm.right) / 2 - (rf.left + rf.right) / 2) < 2 || Math.round(r.left) === 16 || Math.round(r.right) === innerWidth - 16 };   // under its row's formula, unless the viewport clamp moved it
    });
    assert.deepEqual(d, { syms: d.syms, katex: d.syms, units: true, when: true, ex: true, dialog: true, inView: true, formula: true, sameSize: true, centred: true });
    assert.ok(d.syms >= 2, JSON.stringify(d));
    assert.equal(await page.$eval(".pop", e => e.children[1].className + " " + e.children[1].textContent.replace(/\s+/g, "")),
      "pop-t fd-p " + pilotSheet.groups[1].rows.find(r => r.id === "KE_ROT").doc.purpose.replace(/_/g, "").replace(/\s+/g, ""), "the formula, then the purpose as the title");
    assert.equal(await q[2].getAttribute("aria-expanded"), "true");
    assert.equal(await page.$$eval(".pop .fig, .pop .fd-fig", f => f.length), 0, "a row with no picture (KE_ROT) has no figure");
    await q[1].click();                                                     // I = Σ m r²: formula-figs.js has its picture (design/FORMULA-FIGS.md)
    await page.waitForFunction(() => document.querySelector(".pop .fd-fig svg"), null, { timeout: 3000 });
    const fig = await page.$eval(".pop", e => { const f = e.querySelector(".fd-fig"), r = e.getBoundingClientRect(), fr = f.getBoundingClientRect(), s = f.querySelector("svg").getBoundingClientRect();
      return { at: [...e.children].indexOf(f), role: f.getAttribute("role"), alt: f.getAttribute("aria-label") === window.FormulaFigs.I_SUM.alt, drawn: s.height > 60 && s.width > 150,
        inside: fr.left >= r.left - 0.5 && fr.right <= r.right + 0.5, labels: f.querySelectorAll(".lbl .katex").length >= 3, inView: r.left >= 0 && r.right <= innerWidth }; });
    assert.deepEqual(fig, { at: 1, role: "img", alt: true, drawn: true, inside: true, labels: true, inView: true }, "the picture sits under the formula: graph.js, role img, its alt as the label, KaTeX labels, inside the popover");
    await q[0].click();
    assert.deepEqual(await open(), [0], "one popover at a time");
    await q[0].click();
    assert.deepEqual(await open(), [], "a second tap closes (and removes it)");
    assert.equal(await q[0].getAttribute("aria-expanded"), "false");
    await q[1].click(); await page.keyboard.press("Escape");
    assert.deepEqual(await open(), [], "Escape closes");
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelectorAll("#fcard .fq")[1]), true, "focus goes back to its ?");
    await q[1].click(); await page.click("#fcard .fc-notch");
    assert.deepEqual(await open(), [], "a tap outside closes");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll at 360");
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    assert.equal(await page.$$eval("#fcard .fq", b => b.length), 0, "rows without a doc have no ?");
    assert.equal(await page.$$eval("#fcard li.to", t => t.length), 1, "no ladder: the arrow is drawn as before");
    /* orc v23 round 2: a doc popover never runs past the screen (a tall one scrolls inside), and a long formula is never cut: the popover
       widens to it up to the viewport, and past that the header scrolls sideways */
    for (const [w, h] of [[390, 844], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => { location.hash = "CALC1_BU1"; }); await opened(page, "CALC1_BU1");
      for (const [i, id] of [[0, "BUOY"], [1, "I_SUM"]]) {
        const b = page.locator("#fcard .fq").nth(i);
        await b.evaluate(x => x.scrollIntoView({ block: "center" }));
        await b.click();
        await page.waitForSelector(".pop");
        if (id === "I_SUM") await page.waitForFunction(() => document.querySelector(".pop .fd-fig svg"));
        const r = await page.$eval(".pop", e => { const p = e.getBoundingClientRect(), hd = e.querySelector(".pop-h"), x = getComputedStyle(hd).overflowX;
          return { inView: p.top >= 0 && p.bottom <= innerHeight && p.left >= 0 && p.right <= innerWidth, fits: hd.scrollWidth <= hd.clientWidth + 1, scrolls: x === "auto" || x === "scroll",
            reach: e.scrollHeight <= e.clientHeight + 1 || getComputedStyle(e).overflowY === "auto" }; });
        assert.deepEqual(r, { inView: true, fits: w > 600 ? true : r.fits, scrolls: true, reach: true },
          `${w}x${h} ${id}: the popover stays on screen; its formula is whole when the screen has room, else it scrolls; a capped body scrolls`);
        await b.click();
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");   // where the next step starts
  });

  await step("nothing ticked is a real answer (a try, the miss hint)", async () => {
    gate = new Promise(r => { release = r; });                              // the next step checks the caret before any text is in (app.js WISH_DOTS is only 900 ms)
    await page.click("#mcGo");
    await page.waitForFunction(() => /Missing one/.test(document.querySelector("#q .chk .cluck")?.textContent || ""), null, { timeout: 4000 });   // short: left of Check (Tony, Oct 5)
  });

  await step("easy: an item with a narration still streams /explain (the narration is never the box text); a lone caret, then typed; reopening goes on where it was; no voice", async () => {
    const said = () => page.evaluate(() => window.__said);
    await page.waitForSelector(".cl-peek .cl-cta", { timeout: 6000 });     // B7 ii (Tony, Oct 18): the sheet stays closed, the reply streams in the background
    assert.equal(await page.isHidden("#cluck"), true, "a wrong answer never opens Cluck by itself");
    assert.equal(asked, 1, "the first wrong answer asks /explain, narration or not");
    await page.click(".cl-peek .cl-cta");
    await page.waitForFunction(() => document.querySelector("#cluck:not([hidden]) #clTabEP:not([hidden])"), null, { timeout: 6000 });
    assert.ok(await page.$("#cluck .wtext .wcaret") && !(await page.$("#cluck .wtext .wl")), "the thinking caret comes first, alone: " + await page.innerHTML("#cluck .wtext"));
    release();
    await page.waitForFunction(() => document.querySelector("#cluck .wtext .wl"), null, { timeout: 3000 });
    const first = (await page.textContent("#cluck .wtext")).trim();
    assert.ok(!/Egg-cellent/.test(first), "no typing: " + first);
    assert.equal(await page.isHidden("#wish"), true, "desktop, sheet open: no chip (Tony, Oct 5: variant a)");
    assert.equal(await page.$(".cl-peek"), null, "desktop, sheet open: no peek, no CTA");
    assert.equal(await page.isVisible("#cluck .cl-bar"), true, "B5 (Tony, Oct 18): bar visible at 1280, the Cluck / TUTOR header with its X");
    assert.equal(await page.isHidden("#cluck .cl-x2"), true, "B5: no corner X");
    await page.click("#cluck .cl-x");                                        // closed: the peek + CTA are the way back, then open again from the top
    assert.equal((await page.textContent(".cl-peek .cl-cta")).trim(), "ok but how?", "E1 = T2, wording b (Tony, Oct 13)");
    assert.equal(await page.isVisible(".cl-peek .cl-cta"), true);
    assert.ok((await page.$eval(".cl-peek .cl-cta", b => b.getBoundingClientRect().height)) >= 44, "the CTA is a 44px target");
    assert.match(await page.textContent(".cl-peek .cl-steps"), /POOF! A wish is a wish\./, "Q3 = C: Cluck's steps inline, under the hint");
    assert.equal(await page.$eval(".cl-peek .cl-steps", s => s.scrollHeight > s.clientHeight && getComputedStyle(s, "::after").backgroundImage.includes("gradient")), true, "the rest fades under a gradient");
    await page.evaluate(() => { window.__said = []; });
    await page.click(".cl-peek .cl-cta");
    assert.equal(await page.$(".cl-peek"), null, "open again: the peek steps aside");
    assert.equal((await said()).length, 0, "spoken before the text is out");
    await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 6000 });
    assert.ok(!(await page.textContent("#cluck .wtext")).includes(P.all.saccharine.narration), "the narration is not the box text");
    assert.equal(asked, 1, "one stream: reopening reuses it");
    assert.deepEqual(await said(), [], "no voice: the voice is gone (Tony, Oct 5)");
    assert.equal(await page.$("#wish .wvoice"), null, "no voice button");
    // Tony, Oct 18 (B1): hovering a message tints nothing; the pointer cursor is for the typing only
    await page.hover("#cluck .msg:not(.me)");
    assert.equal(await page.$eval("#cluck .msg:not(.me)", e => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)", "hovered Cluck message: no tint");
    await page.waitForFunction(() => !document.querySelector("#cluck .wtext.wrun"), null, { timeout: 4000 });
    assert.notEqual(await page.$eval("#cluck .wtext", e => getComputedStyle(e).cursor), "pointer", "done typing: no pointer cursor");
    // B2: a scrollbar thumb shows only while the pointer is over the box
    const sbc = () => page.$eval("#cluck .cl-bd", e => getComputedStyle(e).scrollbarColor);
    await page.mouse.move(2, 2);
    assert.match(await sbc(), /^rgba\(0, 0, 0, 0\) rgba\(0, 0, 0, 0\)$|^auto$|transparent/, "unhovered .cl-bd: transparent thumb");
    const idle = await sbc();
    await page.hover("#cluck .cl-bd");
    assert.notEqual(await sbc(), idle, "hovered .cl-bd: the thumb shows");
    await page.mouse.move(2, 2);
    // B3 (Tony, Oct 18): the finished reply is kept in this browser (stem-cluck): away and back, then a reload, show it whole with no new call
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem("stem-cluck")));
    assert.ok(Object.keys(kept).some(k => /^CALC1_E01\|[^|]*\|dev$/.test(k)), "key = code | picks | build: " + Object.keys(kept));
    const whole = async why => {
      await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 4000 });
      assert.equal(asked, 1, why + ": no new /explain");
      assert.equal(await page.$("#cluck .wcaret"), null, why + ": no caret"); assert.equal(await page.$("#cluck .wload"), null, why + ": no wait line");
    };
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    await page.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(page, "CALC1_E01");
    if (await page.isHidden("#cluck")) await page.click("#wish .wchip, .cl-peek .cl-cta, .cue-chip");
    await whole("away and back");
    await page.reload(); await opened(page, "CALC1_E01");
    if (await page.isHidden("#cluck")) await page.click("#wish .wchip, .cl-peek .cl-cta, .cue-chip");
    await whole("after a reload");
    await page.evaluate(() => { const o = JSON.parse(localStorage.getItem("stem-cluck")); for (const k of Object.keys(o)) o[k].t = Date.now() - 8 * 864e5; localStorage.setItem("stem-cluck", JSON.stringify(o)); });
    await page.reload(); await opened(page, "CALC1_E01");
    await page.waitForFunction(() => document.querySelector("#wish .wchip") && /Explain my mistake/.test(document.querySelector("#wish .wchip").textContent), null, { timeout: 4000 });
    assert.equal(asked, 1, "a 7-day-old entry is dropped, and a restore never calls by itself: the Explain my mistake chip");
  });

  await step("past 5 auto wishes an hour, nothing fires until the Explain my mistake tap", async () => {
    asked = 0; release();                                                     // here, so a red step above cannot fail this one too
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
      return { text: cr(cs("#cluck .wtext").color, sheet), muted: cr(cs("#cluck .cl-fold-n").color, sheet), me: cr(getComputedStyle(document.querySelector("#cluck"), null).getPropertyValue("--help-on").trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16))})`), getComputedStyle(document.querySelector("#cluck")).getPropertyValue("--ai-ct").trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16))})`)),
        send: cr(cs("#cluck .send").color, cs("#cluck .send").backgroundColor), left: cr(cs("#cluck .ask .left").color, cs("#cluck .ask").backgroundColor),
        tag: cr(cs("#cluck .cl-bar .tag").color, cs("#cluck .cl-bar .tag").backgroundColor), name: cr(cs("#cluck .cl-title").color, sheet) };
    });
    for (const [k, v] of Object.entries(aa)) assert.ok(v >= 4.5, `${k} ${v.toFixed(2)}:1 < 4.5`);
    await page.waitForFunction(() => { const r = document.querySelector("#cluck .ask").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 })
      .catch(() => { throw new Error("the ask field is not on screen when the sheet opens"); });
    for (let n = 1; n <= 5; n++) {
      const a0 = asked;
      if (n === 1) await page.evaluate(() => {                              // every state the reply passes through (Tony, Oct 12: the blink follows words, not lines)
        window.__rv = []; window.__rt = [];
        new MutationObserver(() => { const r = document.querySelector("#cluck .wreply:last-of-type"); if (!r) return; const c = r.cloneNode(true); c.querySelectorAll(".katex-mathml").forEach(m => m.remove());
          const t = c.textContent.replace(/\s+/g, " ").trim(); if (t !== window.__rv.at(-1)) { window.__rv.push(t); window.__rt.push(performance.now()); } }).observe(document.querySelector("#cluck"), { subtree: true, childList: true, characterData: true });
      });
      await page.fill("#cluck .ask textarea", "why step " + n + "?"); await page.click("#cluck .ask .send");
      await page.waitForFunction(k => document.querySelectorAll("#cluck .wreply").length === k && !document.querySelector("#cluck.wbusy"), n, { timeout: 9000 });
      if (n === 1) {
        const [rv, rt] = await page.evaluate(() => [window.__rv, window.__rt]), words = t => t.split(" ").filter(Boolean).length;
        // the reveal runs on elapsed time (wishType: 35 chars/s): after a late frame (CPU load, 3 CI lanes) it shows what it owes, ~5 chars a word,
        // in that frame or the next one: the budget counts the time since the state before the last
        const owed = i => 2 + Math.floor((rt[i] - rt[Math.max(0, i - 2)]) * 35 / 1000 / 5);
        assert.ok(rv.length >= 10, "the reply types out, it does not land a line (a chunk) at a time: " + rv.length + " states");
        assert.ok(rv.every((t, i) => words(t) - (i ? words(rv[i - 1]) : 0) <= owed(i)), "each state adds a word, not a line: " + JSON.stringify(rv.slice(0, 12).map((t, i) => [t, i ? Math.round(rt[i] - rt[i - 1]) : 0])));
        assert.ok(rv.every(t => !/[$\\]/.test(t)), "a formula shows whole or not at all, never as raw TeX: " + rv.find(t => /[$\\]/.test(t)));
      }
      if (n === 1) {
        assert.equal((await page.textContent("#cluck .cl-verify:visible")).trim(), "verify b4 use lol", "the grey line under Cluck's text (Tony, Oct 5)");
        assert.deepEqual(await page.$$eval("#cluck .msg > .sr-only", e => e.map(x => x.textContent.trim())), ["Cluck:", "You:", "Cluck:"], "the speakers, for screen readers only");
        assert.equal(await page.$$eval("#cluck .who, #cluck .time", e => e.length), 0, "Lane 2: no name/time line");
        assert.deepEqual(await page.$eval("#cluck .msg.me", e => { const c = getComputedStyle(e); return [c.backgroundColor === getComputedStyle(e.closest(".cl")).getPropertyValue("--ai-ct").trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16)).join(", ")})`), c.borderTopWidth]; }), [true, "0px"], "the student: a --ai-ct bubble, no edge");
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
    assert.equal(await page.evaluate(() => document.activeElement.matches(".wchip, .cl-cta")), true, "focus goes back to the chip / CTA");
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
    assert.equal(await page.$$eval("#blocks :is(.tip, .ptitle)", t => t.length), 0, "tip or title lead in diet mode");
    assert.equal(await page.$$eval("#how", h => h.length), 0, "the sugar how line in diet mode");
    assert.equal(await page.$$eval("#fcard", f => f.length), 0, "formula card in diet mode");
    assert.ok(await page.$eval("#rot", e => e.hidden).catch(() => true), "brainrot in diet mode (not even parked)");
    assert.ok(await page.$eval("#xb", e => e.getClientRects().length > 0), "diet keeps the notes pad on desktop");
    assert.match(await page.$eval('#qlist a[href="#CALC1_E01"]', a => a.textContent), /Original E01/);
    await page.evaluate(() => { location.hash = "CALC1_E03"; }); await opened(page, "CALC1_E03");
    assert.equal(await page.$$eval("#q .fix", f => f.length), 0, "fix boxes in diet mode (prove mode is gone)");
  });

  await step("SUGAR_EZ12: sugar again; the prefixed form is never remembered", async () => {
    await page.evaluate(() => { window.__opened = false; addEventListener("drill:problem", () => { window.__opened = true; }, { once: true }); });
    await typeCode(page, "SUGAR_EZ12");
    await page.waitForFunction(() => window.__opened && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });   // the bank's question is open: its load would close the code box under the next step (#125 CI flake)
    await page.waitForFunction(() => !/stem-mode=diet/.test(document.cookie), null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll("#qlist a").length === 4, null, { timeout: 8000 });
    const saved = await page.evaluate(() => localStorage.getItem("stem-codes") || "");
    assert.ok(!/DIET|SUGAR/.test(saved), saved);
  });

  /* a slow link (Tony, Oct 5: 128 kbps): no corner, no preconnect, not one request to YouTube, on a question with a layer */
  async function noRot(url, init, vp = { width: 1280, height: 900 }) {
    const c = await browser.newContext({ viewport: vp, serviceWorkers: "block" });
    await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
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
  await step("clutter wave 4: no top gap, notes placeholder in the body font, Copy only with text, one row per question: number + its whole title, no shared-prefix header", async () => {
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
    const l = await page.evaluate(() => ({ lis: [...document.querySelectorAll("#qlist li")].map(li => [li.children.length, li.querySelectorAll(".qn").length, li.querySelectorAll(".qt").length]),
      rows: [...document.querySelectorAll("#qlist .qt")].map(t => t.textContent).sort(), labels: [...document.querySelectorAll("#qlist a")].map(a => a.getAttribute("aria-label")),
      w: document.querySelector("#qlist").getBoundingClientRect().width, bar: ["#qlistBtn", "#qnext"].map(s => document.querySelector(s).getBoundingClientRect()).map(r => [r.left, r.right]),
      list: (r => [r.left, r.right])(document.querySelector("#qlist").getBoundingClientRect()), cols: getComputedStyle(document.querySelector("#qlist ol")).gridTemplateColumns.split(" ").length,
      tops: ["#qlistBtn", "#entry", "#qprev", "#qnext"].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top)) }));
    const one = await page.$$eval("#qlist .qt", ts => ts.map(t => ({ ws: getComputedStyle(t).whiteSpace, h: Math.round(t.getBoundingClientRect().height) })));
    assert.ok(one.every(x => x.ws === "nowrap") && new Set(one.map(x => x.h)).size === 1, `wide list: one line per row, rows line up (variant A): ${JSON.stringify(one)}`);
    assert.ok(await page.$$eval("#qlist a", as => as.every(a => a.title && a.title.length > 0)), "the full title is the tooltip");
    const shut = async () => { if (await page.isVisible("#qlist")) await page.click("#qlistBtn"); };
    await shut(); const before = await page.$eval("#q", e => Math.round(e.getBoundingClientRect().top));
    await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])");
    const pop = await page.evaluate(() => ({ q: Math.round(document.querySelector("#q").getBoundingClientRect().top), pos: getComputedStyle(document.querySelector("#qlist")).position,
      shadow: getComputedStyle(document.querySelector("#qlist")).boxShadow !== "none" }));
    assert.deepEqual(pop, { q: before, pos: "absolute", shadow: true }, "the list floats over the page: the question does not move (Tony, Oct 6)");
    const hit = await page.evaluate(() => ["#qlistBtn", "#qprev", "#qnext"].map(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
    assert.deepEqual(hit, [true, true, true], "the open list never covers its own bar (List, Prev, Next stay clickable)");
    await page.mouse.click(5, 880); await page.waitForTimeout(150);
    assert.equal(await page.isHidden("#qlist"), true, "an outside tap closes the list");
    await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])");
    assert.ok(l.lis.length === 3 && l.lis.every(x => x.join() === "1,1,1"), `every row = a link with one number + one label, no header rows (owner, Oct 6): ${JSON.stringify(l.lis)}`);
    assert.deepEqual(l.rows, ["Term: one", "Term: three", "Term: two"], "each row shows its whole title");
    assert.ok(l.labels.every(x => /^\d\. Term: \w+\.$/.test(x)), `the link's label is the full title: ${l.labels}`);
    assert.ok(Math.abs(l.list[0] - l.bar[0][0]) < 1 && Math.abs(l.list[1] - l.bar[1][1]) < 1, `the list spans the bar, no gap at its right (Tony, Oct 6): ${JSON.stringify([l.list, l.bar])}`);
    assert.ok(l.cols >= 2, `C14 kept: wide, the rows go in columns (${l.cols}), never one ${l.w}px row`);
    assert.equal(new Set(l.tops).size, 1, `the list open, the bar stays one row (Tony, Oct 6): tops ${l.tops}`);
    await page.click("#qlistBtn");
  });
  await step("slow link (?slow=1): no brainrot corner, no YouTube at all", () => noRot("/?slow=1"));
  await step("slow link (Data Saver, navigator.connection): no brainrot corner, no YouTube at all", () =>
    noRot("/", () => Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g", downlink: 10 } })));
  await step("1280x720: one scroller, the page; the wheel over the question scrolls it to the formula card and back (Tony, Oct 18)", async () => {
    const z = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
    await z.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    await z.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const zp = await z.newPage();
    await zp.goto(BASE + "/#CALC1_L01"); await opened(zp, "CALC1_L01");
    await zp.waitForSelector("#fcard", { timeout: 6000 });
    const traps = () => zp.evaluate(() => [...document.querySelectorAll("#freeze *, #freeze, #cluck .wtext, #cluck .wtext *")].filter(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight).map(e => e.id || e.className));
    assert.deepEqual(await traps(), [], "no own vertical scroller in the question or Cluck's text");
    const q = await zp.$eval("#q", e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 20, innerHeight - 20) }; });
    await zp.mouse.move(q.x, Math.max(q.y, 200));
    for (let i = 0; i < 20; i++) await zp.mouse.wheel(0, 200);
    await zp.waitForTimeout(300);
    const down = await zp.evaluate(() => ({ y: scrollY, card: document.querySelector("#fcard").getBoundingClientRect().bottom, inner: document.querySelector("#freezeIn").scrollTop }));
    assert.ok(down.y > 0, `the page scrolled: scrollY ${down.y}`);
    assert.equal(down.inner, 0, "the question box itself never scrolls");
    assert.ok(down.card <= 720 + 1, `the formula card bottom ${down.card} reaches the window`);
    for (let i = 0; i < 20; i++) await zp.mouse.wheel(0, -200);
    await zp.waitForTimeout(300);
    assert.equal(await zp.evaluate(() => scrollY), 0, "wheel back: the top returns");
    await z.close();
  });
  for (const [w, h] of [[1280, 720], [1920, 1080]]) await step(`divider at ${w}x${h}: grip mid-window, the sash inside the panes, no rail (Tony, Oct 18)`, async () => {
    const z = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    await z.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    await z.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const zp = await z.newPage();
    await zp.goto(BASE + "/#CALC1_E01");
    await opened(zp, "CALC1_E01");                                             // #sash is static HTML; the side-by-side layout (html.side, the shown sash) comes with the problem (app.js applyMT)
    await zp.waitForFunction(() => document.documentElement.classList.contains("side") && !document.querySelector("#sash").hidden, null, { timeout: 6000 });
    const m = await zp.evaluate(() => {
      const sash = document.querySelector("#sash"), r = sash.getBoundingClientRect(), kids = [...sash.parentElement.children].filter(k => k !== sash && k.getBoundingClientRect().height > 0), pane = { bottom: Math.max(...kids.map(k => k.getBoundingClientRect().bottom)) };   // the panes beside it
      return { top: parseFloat(getComputedStyle(sash, "::before").top), bottom: r.bottom, paneBottom: pane.bottom, after: getComputedStyle(sash, "::after").backgroundColor,
        afterImg: getComputedStyle(sash, "::after").backgroundImage, afterW: parseFloat(getComputedStyle(sash, "::after").width) };
    });
    await z.close();
    assert.ok(Math.abs(m.top - Math.round(h / 2 - 24)) <= 1, `grip top ${m.top} = ${Math.round(h / 2 - 24)}`);
    assert.ok(m.bottom <= m.paneBottom + 1, `sash bottom ${m.bottom} within the pane ${m.paneBottom}`);
    assert.equal(m.after, "rgba(0, 0, 0, 0)", "::after: transparent (no rail)"); assert.equal(m.afterImg, "none");
    assert.equal(m.afterW, 48, "the 48px hit area stays");
  });
  await step("zoomed out to heck (5464×3600, ~25%): videos B-spaced side by side, notes box capped, divider handle by the content, no sideways scroll, centred up-down", async () => {
    const z = await browser.newContext({ viewport: { width: 5464, height: 3600 }, serviceWorkers: "block" });   // Tony's test protocol, Oct 6
    await z.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    await z.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const zp = await z.newPage();
    await zp.goto(BASE + "/#CALC1_E01");
    await zp.waitForSelector("#rot.docked", { timeout: 6000 });
    const m = await zp.evaluate(() => {
      const v = [...document.querySelectorAll("#rot .vid")].map(x => x.getBoundingClientRect()), ta = document.querySelector("#scratch").getBoundingClientRect();
      return { gap: Math.round(v[1].left - v[0].right), side: Math.abs(v[0].top - v[1].top) < 1, notes: Math.round(ta.height),
        handle: parseFloat(getComputedStyle(document.querySelector("#sash"), "::before").top), hscroll: document.documentElement.scrollWidth > innerWidth,
        above: Math.round(document.querySelector(".top").getBoundingClientRect().top), below: Math.round(innerHeight - document.querySelector("main").getBoundingClientRect().bottom) };
    });
    await z.close();
    assert.equal(m.gap, 24, "variant B: 24px between the videos");
    assert.ok(m.side, "videos side by side");
    assert.ok(m.notes <= 800, `notes box capped (${m.notes}px)`);
    assert.ok(Math.abs(m.handle - Math.round(3600 / 2 - 24)) <= 1, `divider handle mid-window, no 16rem cap (${m.handle}px)`);
    assert.equal(m.hscroll, false, "no sideways scroll");
    assert.ok(m.above > 300 && Math.abs(m.above - m.below) <= 4, `snug in the middle up-down too (Tony, Oct 6 sketch): ${m.above}px above the bar, ${m.below}px below the page`);
  });

  /* bug 5 (owner, Oct 6, zoomed out): bar + question + explain/Cluck form one block, centred: the gap left of the whole block
     equals the gap right of it, Cluck open and closed, up to a 4K window (the owner's zoomed-out run) */
  for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) await step(`centred at ${w}: the bar + both panes, Cluck open and closed`, async () => {
    const z = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    await z.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    await z.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const zp = await z.newPage();
    await zp.goto(BASE + "/#BANK_EZ12");
    await zp.waitForFunction(() => !document.querySelector("#qnav").hidden && /^CALC1_E0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    await zp.evaluate(() => { location.hash = "CALC1_E01"; }); await opened(zp, "CALC1_E01");
    const gaps = () => zp.evaluate(() => {
      const rs = ["#qlistBtn", "#qnext", "#freeze", "#work", "#cluck"].map(s => document.querySelector(s)).filter(e => e && e.getClientRects().length).map(e => e.getBoundingClientRect());
      const L = Math.min(...rs.map(r => r.left)), R = Math.max(...rs.map(r => r.right));
      return { l: Math.round(L), r: Math.round(document.documentElement.clientWidth - R), cl: !!document.querySelector("#cluck")?.getClientRects().length };
    });
    await zp.click("#mcGo");                                                   // nothing ticked: a wrong try; the CTA opens the sheet (B7 ii: never by itself)
    await zp.click(".cl-peek .cl-cta");
    await zp.waitForFunction(() => document.querySelector("#work").classList.contains("cl-on"), null, { timeout: 6000 });
    const open = await gaps();
    await zp.click("#cluck .cl-x");
    await zp.waitForFunction(() => !document.querySelector("#work").classList.contains("cl-on"), null, { timeout: 3000 });
    const shut = await gaps();
    await z.close();
    assert.ok(open.cl, "Cluck did not open");
    assert.ok(Math.abs(open.l - open.r) <= 2, `Cluck open: left gap ${open.l}, right gap ${open.r}`);
    assert.ok(Math.abs(shut.l - shut.r) <= 2, `Cluck closed: left gap ${shut.l}, right gap ${shut.r}`);
  });
} finally {
  await browser.close();
  srv.kill();
  stub.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
