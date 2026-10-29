// Copy math as plain, grader-exact text (todo 108; Tony's 11 answers, plan and-a-todo-list-dapper-yeti). KaTeX keeps htmlAndMathml (screen
// readers), so before the fix a drag over math copied the hidden MathML text AND the visible glyphs ("v=3m/sv = 3\,\text{m/s}").
// Now one capture copy listener (app.js) snaps any formula the selection touches to the whole formula and copies texPlain (nav.js) of its TeX.
// Cases: a whole formula, half a formula, a text+math sentence, an aligned block, a Cluck reply (stub OpenRouter), a formula card row,
// a phone long-press (touch context: the native Copy fires the same copy event, here execCommand), the tap-to-copy buttons (formula card +
// revealed answer, with the toast), and the paste-back: the copied revealed answer typed into the box grades correct on /check.
// The clipboard is read for real: clipboard-read/write granted, Ctrl+C (or the button), navigator.clipboard.readText() (stable on Chromium 141 headless).
// Own serve.py with a throwaway bank + formula sheet.   node tests/copy-math.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8893", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cpm-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
mkdirSync(BANKS); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const SAC = { title: "Copy math", key: "Use: $K = \\frac{1}{2}mv^2$\nAnswer: sqrt(x^2+16)/2", part: ["KE", "VF"], slip: { b: "Not b." } };
const STEM = "The speed is $v = 3\\,\\text{m/s}$ here. Energy: $\\frac{1}{2}mv^2$.\n\n$$\\begin{aligned} a &= b+c \\\\ &= d\\end{aligned}$$";
const ANSWER = "sqrt(x^2+16)/2";
writeFileSync(join(BANKS, "BANK_CPM.json"), JSON.stringify({ v: 1, problems: [
  { code: "CALC1_CM1", title: "Copy 1", type: "expr", var: "x", points: [1, 2, 3], body: txt(STEM), answer: ANSWER, saccharine: SAC },
  { code: "CALC1_CM2", title: "Copy 2", type: "expr", var: "x", points: [1, 2, 3], body: txt("Type the same answer."), answer: ANSWER, saccharine: SAC },
  { code: "CALC1_CM3", title: "Copy 3", type: "mc", shuffle: false, body: txt("Pick one."), correct: "a",
    choices: ["$\\frac{1}{2}mv^2$", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: SAC }] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Energy",
  rows: [{ id: "KE", tex: "K = \\frac{1}{2}mv^2", doc: { purpose: "Kinetic energy.", sym: [{ s: "m", m: "mass", u: "kg" }, { s: "v", m: "speed", u: "m/s" }],
    when: "Anything moving.", ex: "m=2, v=3: K = 9 J" } }, { id: "VF", tex: "v = \\sqrt{2gh}" }] }] }));
/* a stub OpenRouter: Cluck's reply, prose with inline and display math */
const REPLY = ["The drop turns into speed: $v = \\sqrt{2gh}$, so a taller drop is faster.\n\n", "$$K = \\frac{1}{2}mv^2$$\n\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < REPLY.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: REPLY[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 40);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(vp, code, touch = false) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, serviceWorkers: "block" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(`${BASE}/#BANK_CPM`);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash), null, { timeout: 10000 });
  await go(page, code);
  return { ctx, page };
}
const go = async (page, code) => {
  await page.evaluate(c => { location.hash = c; }, code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector("#blocks .katex, #blocks p"), null, { timeout: 4000 });
};
const clip = page => page.evaluate(() => navigator.clipboard.readText());
const blank = page => page.evaluate(() => navigator.clipboard.writeText("<empty>"));
/* the copy button's tap area (STYLE.md: 44px): its ::after; the points 12px above and below the 16px mark still hit the button */
const tapArea = (page, sel) => page.evaluate(s => {
  const b = document.querySelector(s), r = b.getBoundingClientRect(), x = r.left + r.width / 2;
  return [r.top - 12, r.top + r.height / 2, r.bottom + 12].map(y => !!document.elementFromPoint(x, y)?.closest(s));
}, sel);
/* drag with the mouse from a point to a point (each { sel, at }: an element's text at a char offset, or a fraction across a .katex) */
async function drag(page, from, to) {
  const pt = (spec) => page.evaluate(s => {
    const el = document.querySelector(s.sel);
    if (s.katex != null) { const k = el.querySelector(".katex-html") || el, r = k.getBoundingClientRect(); return { x: r.left + r.width * s.katex, y: r.top + r.height / 2 }; }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, left = s.at;
    while ((n = w.nextNode())) { if (n.parentElement.closest(".katex")) continue; if (left <= n.data.length) break; left -= n.data.length; }
    const r = document.createRange(); r.setStart(n, left); r.setEnd(n, Math.min(left + 1, n.data.length));
    const q = r.getBoundingClientRect(); return { x: q.left + 0.5, y: q.top + q.height / 2 };
  }, spec);
  const a = await pt(from), b = await pt(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
const copyNow = async page => { await blank(page); await page.keyboard.press("ControlOrMeta+c"); await page.waitForTimeout(80); return clip(page); };
/* select a whole element's contents (what a triple-tap / long-press + handles do), then copy */
const selectAll = (page, sel) => page.evaluate(s => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); getSelection().removeAllRanges(); getSelection().addRange(r); }, sel);

const DESK = { width: 1280, height: 800 }, PHONE = { width: 390, height: 844 };

await step("whole formula: a drag over all of v = 3 m/s copies it once, plain (no MathML twin)", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM1");
  const k = "#blocks p .katex";
  await drag(page, { sel: k, katex: 0.01 }, { sel: k, katex: 0.99 });
  assert.equal(await copyNow(page), "v = 3 m/s");
  /* text/html is the same plain text (a rich paste never gets the MathML back) */
  const html = await page.evaluate(() => new Promise(res => { addEventListener("copy", e => res(e.clipboardData.getData("text/html")), { once: true }); document.execCommand("copy"); }));
  assert.equal(html, "v = 3 m/s");
  assert.deepEqual(page.errs, []);
  await ctx.close();
});

await step("half a formula: a drag from the start into the middle of (1/2)mv^2 snaps to the whole formula", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM1");
  await page.evaluate(() => { const ks = document.querySelectorAll("#blocks p .katex"); ks[1].id = "k2"; });
  await drag(page, { sel: "#k2", katex: 0.02 }, { sel: "#k2", katex: 0.5 });
  assert.equal(await copyNow(page), "(1/2)*m*v^2");
  await ctx.close();
});

await step("text + math sentence: inline plain, the words pass through", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM1");
  await drag(page, { sel: "#blocks .md p", at: 0 }, { sel: "#blocks .md p", at: "The speed is  here.".length });
  assert.equal(await copyNow(page), "The speed is v = 3 m/s here.");
  /* intent.js still hears the copy in the stem (J6: never the text) */
  assert.ok(/copy\s+stem/.test(JSON.stringify(await page.evaluate(() => window.stemJev && window.stemJev.dump ? window.stemJev.dump() : ""))), "intent.js logged the copy");
  await ctx.close();
});

await step("aligned block: one row per line", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM1");
  await selectAll(page, "#blocks .katex-display");
  assert.equal(await copyNow(page), "a = b + c\n= d");
  /* the whole stem: words, inline math, the block's rows */
  await selectAll(page, "#blocks");
  const all = await copyNow(page);
  assert.ok(all.includes("The speed is v = 3 m/s here. Energy: (1/2)*m*v^2.\na = b + c\n= d"), JSON.stringify(all));
  await ctx.close();
});

await step("formula card: a drag over a row copies the formula; the copy button copies it too and says Copied", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM1");
  await page.waitForSelector("#fcard li.f .katex");
  await drag(page, { sel: "#fcard li.f .fm", katex: 0.3 }, { sel: "#fcard li.f .fm", katex: 0.7 });
  assert.equal(await copyNow(page), "K = (1/2)*m*v^2");
  await blank(page);
  assert.deepEqual(await tapArea(page, "#fcard li.f .mcopy"), [true, true, true], "the card row's copy has a 44px tap area");
  await page.locator("#fcard li.f").nth(1).locator(".mcopy").click();
  await page.waitForFunction(() => document.querySelectorAll("#fcard .mcopy.done").length === 1, null, { timeout: 3000 });
  assert.equal(await clip(page), "v = sqrt(2*g*h)");
  await page.waitForFunction(() => { const t = document.querySelector("#toast.on"); return !!t && t.textContent === "Copied" && t.getBoundingClientRect().width > 40; }, null, { timeout: 3000 });
  if (SHOTS) await page.locator("#fcard").screenshot({ path: join(SHOTS, "copy-fcard-1280.png") });
  await ctx.close();
});

/* W108c: on a row with a doc the copy sits after the "?": each keeps its own 44px tap area, side by side, never over the other (a 12px gap let the
   copy's area take the "?"'s right side: easy's "a 16px mark with a 44px tap area" hit BUTTON.mcopy), at every screen size */
await step('formula card row with a "?": the "?" and the copy each keep a 44px tap area, no overlap (360, 390, 844x390, 1280, 1366, 1920)', async () => {
  for (const vp of [{ width: 360, height: 640 }, PHONE, { width: 844, height: 390 }, DESK, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const { ctx, page } = await open(vp, "CALC1_CM1");
    await page.waitForSelector("#fcard li.f .fq + .mcopy");
    await page.$eval("#fcard li.f .fq", x => x.scrollIntoView({ block: "center" }));
    const hits = await page.evaluate(() => {
      const row = document.querySelector("#fcard li.f"), out = {};
      for (const [k, s] of [["q", ".fq"], ["copy", ".mcopy"]]) {
        const b = row.querySelector(s), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        out[k] = [[20, 0], [-20, 0], [0, 20], [0, -20], [20, 20], [-20, -20]].map(([dx, dy]) => { const e = document.elementFromPoint(x + dx, y + dy); return b.contains(e) || (e ? e.tagName + "." + e.className : "none"); });
      }
      return out;
    });
    const all = Array(6).fill(true);
    assert.deepEqual(hits, { q: all, copy: all }, `${vp.width}x${vp.height}: 20px round each 16px mark is its own button`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${vp.width}: no sideways scroll`);
    if (SHOTS && (vp.width === 390 || vp.width === 1280)) await page.locator("#fcard").screenshot({ path: join(SHOTS, `copy-fcard-q-${vp.width}.png`) });
    await ctx.close();
  }
});

await step("Cluck reply: a drag over a sentence with math copies plain text", async () => {
  const { ctx, page } = await open(PHONE, "CALC1_CM3", true);
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await page.click("#cluck .wtext").catch(() => { /* the typing may be done already */ });
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 6000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const p = [...document.querySelectorAll("#cluck .wtext .wl")].find(x => /drop turns/.test(x.textContent)); p.id = "cl1"; });
  await selectAll(page, "#cl1");
  await page.evaluate(() => document.execCommand("copy"));
  assert.equal(await clip(page), "The drop turns into speed: v = sqrt(2*g*h), so a taller drop is faster.");
  await ctx.close();
});

await step("phone long-press (touch context): the native Copy fires the same copy event, plain text", async () => {
  const { ctx, page } = await open(PHONE, "CALC1_CM1", true);
  await page.locator("#blocks .md p .katex").first().tap();                   // a touch on the math, then the long-press selection
  await selectAll(page, "#blocks .md p");
  await blank(page);
  await page.evaluate(() => document.execCommand("copy"));               // what the long-press menu's Copy runs
  assert.equal(await clip(page), "The speed is v = 3 m/s here. Energy: (1/2)*m*v^2.");
  await ctx.close();
});

/* out of tries in sugar: the answer shows (T19); its copy button and a drag over it copy the same plain text, which grades correct */
for (const [tag, vp, touch] of [["1280", DESK, false], ["390", PHONE, true]]) {
  await step(`${tag}: revealed answer: copy button + paste-back grades correct on /check`, async () => {
    const { ctx, page } = await open(vp, "CALC1_CM1", touch);
    for (let i = 0; i < 6 && !(await page.evaluate(() => window.__drill.state.finished)); i++) {
      const n = await page.evaluate(() => window.__drill.state.tries.length);
      await page.fill("#ans", `${i + 7}*x`); await page.press("#ans", "Enter");
      await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 6000 });
    }
    await page.waitForSelector("#preview .ansl .katex", { timeout: 6000 });
    assert.deepEqual(await tapArea(page, "#preview .ansl .mcopy"), [true, true, true], "the answer's copy keeps its 44px tap area (the preview's clip)");
    await page.locator("#preview .ansl .mcopy").click();
    await page.waitForSelector("#preview .ansl .mcopy.done");
    const got = await clip(page);
    assert.equal(got, "sqrt(x^2 + 16)/2");
    await selectAll(page, "#preview .ansl b");
    assert.equal(await copyNow(page), got, "a drag over the answer copies what the button does");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `copy-reveal-${tag}.png`) });
    await go(page, "CALC1_CM2");
    const verdict = page.waitForResponse(r => /\/check$/.test(r.url()));
    await page.fill("#ans", got); await page.press("#ans", "Enter");
    assert.equal((await (await verdict).json()).verdict, "correct", "the pasted answer grades correct");
    if (SHOTS && tag === "390") { await go(page, "CALC1_CM1"); await page.locator("#fcard").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, "copy-fcard-390.png") }); }
    assert.deepEqual(page.errs, []);
    await ctx.close();
  });
}

await step("Copy my work: a choice try's math goes out as the same plain text (one converter)", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM3");
  await page.click('.opt[data-id="a"]'); await page.click('.ch[data-id="a"] .send');
  await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 5000 });
  await page.fill("#scratch", "kept as typed: $x^2$");
  await page.waitForSelector("#copy:not([hidden])", { timeout: 3000 });
  await blank(page);
  await page.click("#copy");
  await page.waitForSelector("#copy.done");
  const p = JSON.parse(await clip(page));
  assert.deepEqual([p.tries[0].a, p.tries[0].c, p.final.a, p.explain], ["(1/2)*m*v^2", "a", "(1/2)*m*v^2", "kept as typed: $x^2$"]);
  assert.equal(await page.evaluate(() => window.__drill.state.tries[0].a), "$\\frac{1}{2}mv^2$", "the saved try keeps the choice's markdown");
  await ctx.close();
});

await step("a selection with no math is left to the browser", async () => {
  const { ctx, page } = await open(DESK, "CALC1_CM2");
  await selectAll(page, "#blocks .md p");
  assert.equal(await copyNow(page), "Type the same answer.");
  await ctx.close();
});

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "copy-math: all ok");
process.exit(failures ? 1 : 0);
