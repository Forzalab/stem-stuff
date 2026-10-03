// The multitask flow (design/MULTITASK.md: phone = round 3b/3d pad page behind the Scratchpad button, desktop = side by side) and the
// keyboard-up rules around it, at 390x844 and
// 375x667 (touch) and 1440x900 (mouse). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/flow.pw.mjs http://localhost:8812 [shotDir]
// The software keyboard is simulated as in swap.pw.mjs: the viewport shrinks to 55% of its height after a field is focused. Keyboard down
// after Back = the field loses focus and the viewport grows back. With a shotDir it saves flow-{1..N}-390.png and flow-desktop-1440.png.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const KB = 0.55;
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const lorem = n => Array.from({ length: n }, (_, i) => `Claim ${i + 1}: a block of ${i + 2} kg slides along a rough track, and the friction force on it changes as the angle of the track is changed.`);
/* choose-all, prove mode, with the long fix.how that clipped at 390px (BANK_P2X) */
const CA = { code: "CSCI26_FW1", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: lorem(5).join("\n\n") }],
  choices: [{ id: "a", md: "Raising the angle increases the normal force" }, { id: "b", md: "Raising the angle decreases the friction force" },
    { id: "c", md: "The mass does not change the acceleration" }, { id: "d", md: "None of these", lock: true }],
  fix: { how: "Type increases or decreases" } };
const PAD = "N = mg cos30 = 33.9\nf = 0.20 N = 6.79\nF = 19.6 - 6.79";

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
let n = 0;
for (const [W, H] of [[390, 844], [375, 667]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });   // onboarding has its own check below
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.route(`**/p/${CA.code}.json`, r => r.fulfill({ json: CA }));
  const T = `${W}x${H}`;
  const openPad = async () => { await page.locator("#padFab").tap(); await page.waitForFunction(() => document.documentElement.classList.contains("mt")); await page.waitForTimeout(350); };
  const shot = async () => { if (SHOTS && W === 390) { n++; await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/flow-${n}-390.png` }); } };
  const kbUp = async () => { await page.setViewportSize({ width: W, height: Math.round(H * KB) }); await page.waitForTimeout(450); };
  const kbDown = async () => { await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(500); };
  const cls = () => page.evaluate(() => document.documentElement.className);
  const has = c => page.evaluate(c => document.documentElement.classList.contains(c), c);
  const active = () => page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute("aria-label") || a.tagName; });
  const fix = '#q .ch[data-id="b"] .fix input';
  const inView = sel => page.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect(), vv = visualViewport, dock = document.querySelector("#dock").getBoundingClientRect();
    const bottom = Math.min(vv.height, getComputedStyle(document.querySelector("#dock")).position === "fixed" ? dock.top : vv.height);
    return { ok: r.height > 0 && r.top >= -0.5 && r.bottom <= bottom + 0.5, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: Math.round(bottom) };
  }, sel);

  await page.goto(`${BASE}/#${CA.code}`, { waitUntil: "networkidle" });
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, CA.code, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.evaluate(t => { const ta = document.querySelector("#scratch"); ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); }, PAD);

  await step(`${T} fix box: the long how fits (wraps above the box), never clipped`, async () => {
    await page.locator('#q .opt[data-id="b"]').tap(); await page.locator('#q .opt[data-id="b"]').tap();
    assert.ok(await page.locator('#q .ch[data-id="b"] .fix').isVisible(), "fix box shows on X");
    const f = await page.evaluate(s => {
      const i = document.querySelector(s), c = i.closest(".ch").querySelector(".fix-how"), cs = getComputedStyle(i);
      const x = document.createElement("canvas").getContext("2d"); x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { ph: i.placeholder, phW: x.measureText(i.placeholder).width, room: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        cap: c && !c.hidden ? c.textContent : "", capOver: c && !c.hidden ? c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > innerWidth : false };
    }, fix);
    assert.ok(f.phW <= f.room, `placeholder clips: ${Math.round(f.phW)} > ${Math.round(f.room)} ("${f.ph}")`);
    assert.ok(f.ph === CA.fix.how || f.cap === CA.fix.how, `the how text is shown whole somewhere (ph "${f.ph}", caption "${f.cap}")`);
    assert.equal(f.capOver, false, "caption overflows");
  });
  await shot();   // 1: the X'd row with its fix box

  await step(`${T} keyboard up in a fix box: Swap, no expand icon, no pill, no toggle; the pad peek shows the pad's last line`, async () => {
    await page.locator(fix).tap();
    await page.locator(fix).pressSequentially("increa");
    await kbUp();
    assert.ok(await has("swap") && await has("swap-problem"), `problem pane (${await cls()})`);
    for (const s of ["#mtExp", "#mtMode", "#swap"]) assert.ok(await page.locator(s).isHidden(), `${s} visible with the keyboard up`);
    assert.ok(await page.locator("#padPeek").isVisible(), "pad peek");
    assert.equal((await page.locator("#padPeekTx").textContent()).trim(), "F = 19.6 - 6.79");
    const p = await page.evaluate(() => { const r = document.querySelector("#padPeek").getBoundingClientRect(), t = document.querySelector("#padPeekTx"), cs = getComputedStyle(t);
      return { bottom: r.bottom, vh: visualViewport.height, h: r.height, ell: cs.textOverflow, ws: cs.whiteSpace, mono: /Mono/.test(getComputedStyle(document.querySelector("#padPeek")).fontFamily) }; });
    assert.ok(p.vh - p.bottom < 24 && p.bottom <= p.vh + 0.5, `peek pinned just above the keyboard (${p.bottom} of ${p.vh})`);
    assert.ok(p.h >= 40 && p.h <= 56, `one line (${p.h})`);
    assert.deepEqual([p.ell, p.ws, p.mono], ["ellipsis", "nowrap", true]);
  });
  await shot();   // 2: keyboard up, problem pane, pad peek

  await step(`${T} tap the pad peek: the pad page opens on q and the pad has focus in the same tap, caret at the end`, async () => {
    await page.locator("#padPeek").tap(); await page.waitForTimeout(450);
    assert.ok(await has("mt") && await has("mt-q"), `pad page on q (${await cls()})`);
    assert.equal(await active(), "scratch");
    const c = await page.evaluate(() => { const t = document.querySelector("#scratch"); return [t.selectionStart, t.value.length]; });
    assert.equal(c[0], c[1], "caret at the end");
    assert.ok(await page.locator("#swap").isHidden(), "no old toggle");
  });
  await shot();   // 3: the pad page from the peek

  await step(`${T} tap the question: the pad page closes, the fix box you typed in has focus`, async () => {
    await page.locator("#problem").tap({ position: { x: 40, y: 20 } }); await page.waitForTimeout(450);
    assert.equal(await has("mt"), false, `still open (${await cls()})`);
    assert.equal(await page.evaluate(s => document.activeElement === document.querySelector(s), fix), true, `focus: ${await active()}`);
  });
  await shot();   // 4: back on the problem

  await step(`${T} Back / keyboard down: the field you typed in is in view, not focused, no jump to the question start`, async () => {
    await page.evaluate(() => document.activeElement.blur());
    await kbDown();
    assert.equal(await has("swap"), false);
    const v = await inView(fix);
    assert.ok(v.ok, `fix box out of view: ${v.top}..${v.bottom} of ${v.vh}`);
    assert.equal(await page.evaluate(s => document.activeElement === document.querySelector(s), fix), false, "focused");
    assert.equal(await page.inputValue(fix), "increa");
  });
  await shot();   // 5: keyboard down, the box in view

  await step(`${T} the Scratchpad button: pad off the page; button >= 48px, above the bar, off the answer controls; hidden while typing an answer`, async () => {
    /* the button steps off answer controls where it (re)appears, then holds still while scrolling (Tony, Oct 3: it must not jump
       with the scroll; tests/fab.pw.mjs). So scroll first, then make it reappear (typing hides it, blur shows it), then check. */
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
    await page.locator(fix).focus(); await page.waitForTimeout(250);
    await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(250);
    assert.ok(await page.locator("#work").isHidden(), "pad on the plain page");
    const g = await page.evaluate(() => { const f = document.querySelector("#padFab").getBoundingClientRect(), d = document.querySelector("#dock").getBoundingClientRect();
      const hits = [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo")].map(e => e.getBoundingClientRect()).filter(q => q.width && q.right > f.left && q.left < f.right && q.bottom > f.top && q.top < f.bottom).length;
      return { h: f.height, w: f.width, bottom: f.bottom, dockTop: d.top, hits }; });
    assert.ok(g.h >= 48 && g.w >= 48, `size ${g.w}x${g.h}`);
    assert.ok(g.bottom <= g.dockTop + 0.5, `over the bar: ${g.bottom} > ${g.dockTop}`);
    assert.equal(g.hits, 0, "rests over an answer control");
    assert.equal((await page.locator("#padFab").textContent()).trim(), "Scratchpad");
    await page.locator(fix).focus(); await page.waitForTimeout(250);
    assert.ok(await page.locator("#padFab").isHidden(), "shown while an answer field has focus");
    await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(250);
    assert.ok(await page.locator("#padFab").isVisible(), "back after blur");
  });
  await shot();   // 6: the plain page with the button

  await step(`${T} the pad page: no header row; tool row in the pad (q | a left, collapse, Cut, Copy right); the tile hugs; Back closes`, async () => {
    const url = page.url();
    await openPad();
    assert.ok(await has("mt-q") && await has("mt-fit"), `q, hugging (${await cls()})`);
    assert.ok(await page.locator("#xbName").evaluate(e => !e.getClientRects().length || e.getBoundingClientRect().width <= 1), "header row label shown");
    const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), f = r("#xbField"), m = r("#mtMode"), x = r("#mtExp"), c = r("#cut"), p = r("#copy"), t = r("#freeze"), pr = document.querySelector("#problem");
      return { inside: [m, x, c, p].every(q => q.left >= f.left - 0.5 && q.right <= f.right + 0.5 && q.bottom <= f.bottom + 0.5 && q.top >= f.top), row: [m, x, c, p].map(q => Math.round(q.top)),
        order: m.right < x.left && x.right < c.left && c.right < p.left, tileH: t.height, need: pr.scrollHeight, vh: innerHeight }; });
    assert.ok(g.inside, "tool row not inside the pad's box");
    assert.ok(new Set(g.row).size === 1, `one row: ${g.row}`);
    assert.ok(g.order, "order q | a, collapse, Cut, Copy");
    const cap = (g.vh < 700 ? 1 / 3 : 0.45) * g.vh;
    assert.ok(g.tileH <= Math.min(g.need, cap) + 2, `tile ${g.tileH} > min(content ${g.need}, cap ${Math.round(cap)})`);
    await shot();   // 7: the pad page on q
    await page.goBack(); await page.waitForTimeout(400);
    assert.equal(await has("mt"), false, "Back closes"); assert.equal(page.url(), url, "Back stays on the page");
  });

  await step(`${T} q | a: a shows the answer only, q the problem only; keyboard up never closes; tap the problem = closed, caret in the answer`, async () => {
    await openPad();
    await page.locator("#mtMode").tap(); await page.waitForTimeout(400);
    assert.ok(await has("mt-a"), "a");
    assert.ok(await page.locator('#q .opt[data-id="a"]').isVisible() && await page.locator("#problem").isHidden(), "a: answer only");
    await shot();   // 8: the pad page on a
    await page.locator("#mtMode").tap(); await page.waitForTimeout(400);
    assert.ok(await has("mt-q") && await page.locator("#problem").isVisible() && await page.locator("#q").isHidden(), "q: problem only");
    await page.locator("#scratch").focus(); await kbUp();
    assert.ok(await has("mt") && !(await has("swap")), `still the pad page (${await cls()})`);
    assert.ok(await page.locator("#mtMode").isVisible(), "q | a hidden with the keyboard up on the pad page");
    await page.locator("#mtMode").tap(); await page.waitForTimeout(400);
    assert.ok(await has("mt-a") && await page.evaluate(() => document.activeElement.id) === "scratch", "q | a with the keyboard up: a, and the pad keeps focus");
    await page.locator("#mtMode").tap(); await page.waitForTimeout(400);
    await kbDown();
    assert.ok(await has("mt"), "keyboard down never closes");
    await page.locator("#problem").tap({ position: { x: 30, y: 20 } }); await page.waitForTimeout(400);
    assert.equal(await has("mt"), false, "tap the problem closes");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest("#q")), true, `caret in the answer (${await active()})`);
    await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(250);
  });

  await step(`${T} the thin bar: tap = an anchor (the hug ends); a drag follows the finger and snaps`, async () => {
    await openPad();
    const look = await page.evaluate(() => { const p = getComputedStyle(document.querySelector("#sash"), "::before"); return [p.width, p.height]; });
    assert.deepEqual(look, ["32px", "3px"], "thin bar");
    await page.locator("#sash").tap(); await page.waitForTimeout(400);
    assert.equal(await has("mt-fit"), false, "a tap ends the hug");
    const r = await page.evaluate(() => +getComputedStyle(document.documentElement).getPropertyValue("--r"));
    assert.ok([0, 0.333, 0.5].includes(+r.toFixed(3)), `anchor ${r}`);
    const s = await page.locator("#sash").boundingBox(), y0 = s.y + s.height / 2, x = s.x + s.width / 2;
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", y0 + i * (H * 0.3) / 8);
    assert.ok(await has("mt-drag"), "follows the finger");
    await touch("touchEnd"); await page.waitForTimeout(400);
    const r2 = +(await page.evaluate(() => +getComputedStyle(document.documentElement).getPropertyValue("--r"))).toFixed(3);
    assert.ok([0, 0.333, 0.5].includes(r2), `snapped to an anchor (${r2})`);
    await page.locator("#mtExp").tap(); await page.waitForTimeout(300);
    assert.equal(await has("mt"), false, "collapse closes");
  });

  await step(`${T} drag the Scratchpad button: snaps to the left edge, a drag is not a tap, kept after reload`, async () => {
    const f = await page.locator("#padFab").boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const x0 = f.x + f.width / 2, y0 = f.y + f.height / 2;
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", x0 - i * (W * 0.6) / 8, y0 - i * 20);
    await touch("touchEnd"); await page.waitForTimeout(400);
    assert.equal(await has("mt"), false, "a drag opened the pad page");
    const left = async () => (await page.locator("#padFab").boundingBox()).x;
    assert.ok(await left() <= 24, `not on the left edge: ${await left()}`);
    await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(600);
    assert.ok(await left() <= 24, "edge not kept after reload");
  });
  await step(`${T} no page errors`, async () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* onboarding (new device = no stem-* key) and the pointy toast on an MC row, phone 390 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const toastText = () => page.evaluate(() => { const t = document.querySelector("#toast"); return t.classList.contains("on") ? t.textContent.trim() : ""; });
  await step("390 onboarding: new device only, once each (button, then q | a)", async () => {
    await page.goto(`${BASE}/#CALC1_X2P`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
    assert.equal(await toastText(), "Tap Scratchpad to open your pad.");
    assert.ok(await page.evaluate(() => document.querySelector("#toast").classList.contains("up")), "the caret points down at the button");
    await page.locator("#padFab").tap(); await page.waitForTimeout(900);
    assert.equal(await toastText(), "Switch question and answer view here.");
    await page.locator("#mtExp").tap(); await page.waitForTimeout(300);
    await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1200);
    assert.equal(await toastText(), "", "shown again");
  });
  await step("390 wrong MC answer: the note lies on the struck choice, its caret points at the X", async () => {
    await page.locator('.opt[data-id="a"]').tap(); await page.locator('.ch[data-id="a"] .send').tap(); await page.waitForTimeout(500);
    const g = await page.evaluate(() => { const t = document.querySelector("#toast"), b = document.querySelector('.opt[data-id="a"] .badge').getBoundingClientRect(), r = t.getBoundingClientRect(), c = getComputedStyle(t, "::before");
      return { row: t.classList.contains("row"), caret: c.display !== "none" && c.content !== "none", left: r.left, badgeRight: b.right, txt: t.textContent.replace(/\u00a0/g, " ").trim() }; });
    assert.ok(g.row && g.caret, `caret on the MC row (${JSON.stringify(g)})`);
    assert.ok(g.left > g.badgeRight && g.left - g.badgeRight < 24, "right after the X badge");
    assert.equal(g.txt, "One more try, so choose wisely.");
  });
  await step("390 onboarding / toast: no page errors", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

/* desktop: side by side by default, divider snaps, the pad never under the problem */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.route(`**/p/${CA.code}.json`, r => r.fulfill({ json: CA }));
  await page.goto(`${BASE}/#CALC1_T6B`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_T6B", null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const geo = () => page.evaluate(() => { const f = document.querySelector("#freeze").getBoundingClientRect(), w = document.querySelector("#work").getBoundingClientRect(), q = document.querySelector("#q").getBoundingClientRect();
    const m = document.querySelector("main"), cs = getComputedStyle(m), inner = m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { fL: f.left, fR: f.right, fW: f.width, wL: w.left, wT: w.top, qB: q.bottom, inner, side: document.documentElement.classList.contains("side") }; });
  await step("1440 side by side by default: problem + answer left, pad right, 16px gap", async () => {
    const g = await geo();
    assert.ok(g.side, "html.side");
    assert.ok(g.wL >= g.fR + 15.5 && g.wL <= g.fR + 16.5, `gap ${g.wL - g.fR}`);
    assert.ok(Math.abs(g.fW - (g.inner - 16) / 2) < 2, `left is half (${g.fW} of ${g.inner})`);
    assert.ok(await page.locator("#mtExp").isHidden(), "no expand on desktop");
    assert.equal(await page.getAttribute("#sash", "role"), "separator");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/flow-desktop-1440.png` });
  });
  await step("1440 the divider: tap = next (1/2 -> 1/3 -> strip -> 2/3), double-click = 1/2, a drag snaps; never the pad under the problem", async () => {
    const tap = async () => { await page.locator("#sash").click(); await page.waitForTimeout(400); };
    await tap(); let g = await geo(); assert.ok(Math.abs(g.fW - (g.inner - 16) / 3) < 2, `1/3 (${g.fW})`);
    await tap(); assert.ok(await page.locator("#pstrip").isVisible(), "strip"); assert.equal(Math.round((await page.locator("#pstrip").boundingBox()).width), 52);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#pstrip span")).writingMode), "vertical-rl");
    await tap(); g = await geo(); assert.ok(Math.abs(g.fW - (g.inner - 16) * 2 / 3) < 2, `2/3 (${g.fW})`);
    await page.locator("#sash").dblclick(); await page.waitForTimeout(400); g = await geo(); assert.ok(Math.abs(g.fW - (g.inner - 16) / 2) < 2, `dblclick 1/2 (${g.fW})`);
    const s = await page.locator("#sash").boundingBox(), y = s.y + 200;
    await page.mouse.move(s.x + 8, y); await page.mouse.down();
    await page.mouse.move(s.x - 200, y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400);
    g = await geo(); assert.ok(Math.abs(g.fW - (g.inner - 16) / 3) < 2, `drag snapped to 1/3 (${g.fW})`);
    assert.ok(g.wL > g.fR, "pad right of the problem"); assert.ok(g.wT < g.qB, "pad not under the problem");
    assert.ok(await page.locator("#mtMode").isHidden(), "no q | a switch side by side (both are on screen)");
    await page.locator("#sash").click(); await page.waitForTimeout(400);
    assert.ok(await page.locator("#pstrip").isVisible(), "1/3 -> strip");
    await page.locator("#pstrip").click(); await page.waitForTimeout(400);
    g = await geo(); assert.ok(Math.abs(g.fW - (g.inner - 16) / 3) < 2, `strip tap brings the problem back (${g.fW})`);
  });
  await step("1440 no keyboard shortcuts are shown or documented for the divider", async () => {
    const t = await page.evaluate(() => [...document.querySelectorAll("#sash, #mtMode, #pstrip")].map(e => (e.title || "") + (e.getAttribute("aria-keyshortcuts") || "")).join(""));
    assert.equal(t, "");
  });
  await step("1440 no page errors", async () => assert.deepEqual(errors, []));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAIL` : "\nall ok");
