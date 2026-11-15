// PROGBAR P5 smoke (brain ui-polish/PORT-ARCH.md §D2): the v9d bar DOM + CSS behind html.ui-v7. Flag OFF = the nav DOM is untouched; flag ON = list tile
// (back + list), notch tile (7 notches from stem-pb:<bank>, P4), nav tile (prev + next) at the v9d numbers (fit06/MEASURE.md V9D-POLISH), no h-scroll,
// hit targets >= 44, notches never under 12 wide (INTEG B1), iOS back replaces the list icon. Smoke size, feature-local. Own serve.py, throwaway bank.
//   node tests/progbar-bar.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8889), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "pbbar-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const sac = n => ({ title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(n) });
const multi = code => ({ code, type: "multi", body: [{ type: "text", md: "Two parts." }], saccharine: sac(9),
  parts: [{ type: "num", answer: "1", prompt: "one" }, { type: "num", answer: "2", prompt: "two" }] });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_PB1.json"), JSON.stringify({ v: 1, problems: [1, 2, 3, 4, 5].map(n => real("CALC1_P0" + n, n)).concat([multi("CALC1_PM1")]) }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 }); };
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function typePart(page, i, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill(`#q .part[data-i="${i}"] .ans`, v); await page.press(`#q .part[data-i="${i}"] .ans`, "Enter");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
/* a fresh context on the bank; flag = "on" stores stem-ui=v7 (fx.js then sets html.ui-v7 before first paint), "off" leaves it */
async function fresh(browser, flag, w = 390, h = 844, extra = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", ...extra });
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (f === "on") localStorage.setItem("stem-ui", "v7"); }, flag);   // the real path: fx.js reads it in <head> and sets html.ui-v7
  const p = await c.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e.message))); p.__errs = errs;
  await p.goto(BASE + "/#BANK_PB1");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
  await p.waitForSelector("#qnav:not([hidden])");
  return [c, p];
}
const geo = p => p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right }; };
  const ns = [...document.querySelectorAll("#pbTile .pb-n")].map(e => { const b = e.getBoundingClientRect(); return { x: b.x, w: b.width, h: b.height, cls: e.className.replace("pb-n ", "") }; });
  return { list: r(".pb-list"), tile: r("#pbTile"), nav: r(".pb-nav"), prev: r("#qprev"), next: r("#qnext"), back: r("#qback"), btn: r("#qlistBtn"), ns,
    sw: document.documentElement.scrollWidth, vw: innerWidth, aria: document.querySelector("#pbTile")?.getAttribute("aria-label") };
});
const states = p => p.evaluate(() => [...document.querySelectorAll("#pbTile .pb-n")].map(e => e.className.replace("pb-n ", "")));

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("flag OFF: nav DOM untouched (no tile, no wrappers, 4 buttons straight under #qnav), buttons keep the live 48px", async () => {
    const [c, p] = await fresh(browser, "off");
    const d = await p.evaluate(() => ({ kids: [...document.querySelector("#qnav").children].map(e => e.id || e.className), tile: !!document.querySelector("#pbTile, .pb-list, .pb-nav"),
      h: document.querySelector("#qlistBtn").getBoundingClientRect().height, flag: document.documentElement.classList.contains("ui-v7") }));
    assert.deepEqual(d.kids, ["qback", "qlistBtn", "qprev", "qnext"]); assert.equal(d.tile, false); assert.equal(d.flag, false); assert.equal(d.h, 48);
    assert.deepEqual(p.__errs, []);
    await c.close();
  });

  await step("flag ON @390: three tiles in order, 52 high, notch tile 7 empty notches (first ringed) 24 high, 8-16 wide, gap 4 (QLIST-FIT phone), no h-scroll, hits >= 44", async () => {
    const [c, p] = await fresh(browser, "on");
    await p.waitForSelector("#pbTile .pb-n");
    const g = await geo(p);
    assert.equal(g.ns.length, 7); assert.deepEqual(await states(p), ["next", "empty", "empty", "empty", "empty", "empty", "empty"]);
    for (const t of [g.list, g.tile, g.nav]) assert.equal(Math.round(t.h), 52, "tile height 52");
    assert.ok(g.list.r <= g.tile.x + 0.5 && g.tile.x + g.tile.w <= g.nav.x + 0.5, "list | notches | nav, left to right, no overlap");
    assert.ok(g.list.x >= 11.5 && g.nav.r <= g.vw - 11.5, "phone margin 12");
    assert.ok(g.ns.every(n => Math.abs(n.h - 24) < 0.6 && n.w >= 7.9 && n.w <= 16.1), JSON.stringify(g.ns));
    assert.ok(Math.abs(g.ns[1].x - g.ns[0].x - g.ns[0].w - 4) < 0.6, "gap 4 (phone)");
    assert.ok(g.sw <= g.vw, "no h-scroll");
    assert.ok(g.prev.w >= 44 && g.next.w >= 44 && g.prev.h >= 44 && g.btn.h >= 44, "hit targets >= 44");
    assert.match(g.aria, /^This set: 0 of 7 answered, 0 right, 0 partly right, 0 wrong$/);
    assert.deepEqual(p.__errs, []);
    await c.close();
  });

  await step("flag ON: the bar follows stem-pb: right, wrong, partial (multi 1/2), streak lights the live run; aria says it", async () => {
    const [c, p] = await fresh(browser, "on");
    await go(p, "CALC1_P01"); await pick(p, "a");
    await p.waitForFunction(() => document.querySelector("#pbTile .pb-n")?.classList.contains("right"));
    await go(p, "CALC1_P02"); await pick(p, "b"); await pick(p, "c");
    await go(p, "CALC1_PM1"); await typePart(p, 0, "1"); await typePart(p, 1, "9"); await typePart(p, 1, "8");
    await p.waitForFunction(() => document.querySelectorAll("#pbTile .pb-n.partial").length === 1);
    assert.deepEqual(await states(p), ["right", "wrong", "partial", "next", "empty", "empty", "empty"]);
    const part = await p.evaluate(() => { const n = document.querySelector("#pbTile .pb-n.partial"), u = n.querySelector("u"), a = getComputedStyle(n), b = getComputedStyle(u);
      return { f: u.getBoundingClientRect().height / n.getBoundingClientRect().height, bg: a.backgroundColor, ubg: b.backgroundColor,
        right: getComputedStyle(document.querySelector("#pbTile .pb-n.right")).backgroundColor, wrong: getComputedStyle(document.querySelector("#pbTile .pb-n.wrong")).backgroundColor }; });
    assert.ok(Math.abs(part.f - 0.5) < 0.02, "right hue to 1/2 of the height, bottom up"); assert.equal(part.bg, part.wrong, "wrong hue above"); assert.equal(part.ubg, part.right);
    assert.notEqual(part.right, part.wrong);
    for (const n of [3, 4, 5]) { await go(p, "CALC1_P0" + n); await pick(p, "a"); }
    await p.waitForFunction(() => document.querySelectorAll("#pbTile .pb-n.streak").length === 3);
    assert.deepEqual(await states(p), ["right", "wrong", "partial", "right streak", "right streak", "right streak", "next"]);
    const s = await geo(p);
    assert.ok(s.ns[3].h > s.ns[0].h && Math.abs(s.ns[3].h - 32) < 0.6, "streak notch 32 high");
    assert.match(s.aria, /^This set: 6 of 7 answered, 4 right, 1 partly right, 1 wrong, 3 right in a row$/);
    await p.reload(); await p.waitForSelector("#pbTile .pb-n.streak");
    assert.equal((await states(p)).length, 7, "a reload keeps the set (storage, not memory)");
    await c.close();
  });

  // BANKTILE-FIT (Nov 14): after an answer the HUD row shows and the bank tile keeps its list icon and its padding (MEASURE.md: label never on the tile edge).
  await step("BANKTILE-FIT: flag ON @390 after one answer: list icon visible, label left >= tile left + 12 padding", async () => {
    const [c, p] = await fresh(browser, "on");
    await go(p, "CALC1_P01"); await pick(p, "a");
    await p.waitForFunction(() => document.querySelector("#pbTile .pb-n")?.classList.contains("right"));
    await go(p, "CALC1_P02"); await pick(p, "a");
    await p.waitForFunction(() => document.querySelectorAll("#pbTile .pb-n.right").length === 2);
    const d = await p.evaluate(() => {
      const tile = document.querySelector(".pb-list").getBoundingClientRect(), lab = document.querySelector("#qlistName").getBoundingClientRect();
      return { icon: getComputedStyle(document.querySelector("#qlistBtn .ico")).display, backHidden: document.querySelector("#qback").hidden,
        tileX: tile.x, labX: lab.x, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    assert.notEqual(d.icon, "none", "list icon hidden after an answer (backHidden=" + d.backHidden + ")");
    assert.ok(d.labX >= d.tileX + 12 - 0.5, `label at ${d.labX}, tile at ${d.tileX}`);
    assert.ok(d.sw <= d.vw, "no h-scroll");
    assert.deepEqual(p.__errs, []);
    await c.close();
  });

  await step("flag ON: a long bank title grows to its 45% cap then ellipsizes, notches give way first but stay 7 and >= 8 wide at 360 (QLIST-FIT, #564); iOS back replaces the list icon", async () => {
    const [c, p] = await fresh(browser, "on", 360, 740);
    await p.evaluate(() => { document.documentElement.classList.add("ios"); document.querySelector("#qlistName").textContent = "Thermodynamics Practice Exam Three"; document.querySelector("#qback").hidden = false; });
    const g = await geo(p);
    assert.equal(g.ns.length, 7); assert.ok(g.ns.every(n => n.w >= 7.9), "notch min 8: " + JSON.stringify(g.ns.map(n => n.w)));
    assert.ok(g.sw <= g.vw, "no h-scroll"); assert.ok(g.back && g.back.w >= 44 && g.back.h >= 44, "back is a 44 target");
    const d = await p.evaluate(() => ({ icon: getComputedStyle(document.querySelector("#qlistBtn .ico")).display, inList: !!document.querySelector(".pb-list #qback"), ell: (e => e.scrollWidth > e.clientWidth)(document.querySelector("#qlistName")),
      backFirst: document.querySelector(".pb-list").firstElementChild.id }));
    assert.deepEqual([d.icon, d.inList, d.ell, d.backFirst], ["none", true, true, "qback"]);
    await c.close();
  });

  await step("flag ON @1280: one row, list left | notches centred (166 wide, 16x24, gap 5) | nav right; HUD sits under, no overlap", async () => {
    const [c, p] = await fresh(browser, "on", 1280, 720);
    const g = await geo(p);
    assert.equal(Math.round(g.tile.w), 166); assert.equal(Math.round(g.tile.h), 52);
    assert.ok(g.ns.every(n => Math.abs(n.w - 16) < 0.6 && Math.abs(n.h - 24) < 0.6), JSON.stringify(g.ns));
    assert.ok(g.list.r < g.tile.x && g.tile.x + g.tile.w < g.nav.x, "left to right"); assert.ok(Math.abs(g.list.y - g.tile.y) < 1 && Math.abs(g.nav.y - g.tile.y) < 1, "one row");
    assert.ok(Math.abs((g.tile.x + g.tile.w / 2) - g.vw / 2) < 140, "notch tile near the centre");
    const hud = await p.evaluate(() => { const h = document.querySelector("#rwHud")?.getBoundingClientRect(), t = document.querySelector("#pbTile").getBoundingClientRect(); return h ? h.top >= t.bottom - 0.5 : true; });
    assert.ok(hud, "the HUD (until P6) is under the bar, not on it"); assert.ok(g.sw <= g.vw, "no h-scroll");
    await c.close();
  });

  await step("flag toggles at runtime: ON mounts, OFF puts the 4 buttons back in their order; ?ui=v7 sets the class and keeps it", async () => {
    const [c, p] = await fresh(browser, "off");
    await p.evaluate(() => document.documentElement.classList.add("ui-v7")); await p.waitForSelector("#pbTile");
    await p.evaluate(() => document.documentElement.classList.remove("ui-v7")); await p.waitForFunction(() => !document.querySelector("#pbTile"));
    assert.deepEqual(await p.evaluate(() => [...document.querySelector("#qnav").children].map(e => e.id)), ["qback", "qlistBtn", "qprev", "qnext"]);
    await c.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const q = await c2.newPage(); await q.goto(BASE + "/?ui=v7#BANK_PB1");
    await q.waitForSelector("#pbTile", { timeout: 8000 });
    assert.equal(await q.evaluate(() => localStorage.getItem("stem-ui")), "v7");
    await q.goto(BASE + "/#BANK_PB1"); await q.waitForSelector("#pbTile", { timeout: 8000 });                      // remembered
    await q.goto(BASE + "/?ui=off#BANK_PB1"); await q.waitForSelector("#qnav", { state: "attached" }); await q.waitForTimeout(400);
    assert.equal(await q.evaluate(() => [document.documentElement.classList.contains("ui-v7"), !!document.querySelector("#pbTile")]).then(a => a.join()), "false,false");
    await c2.close();
  });
  // COLOR-TOKENS 1 (Tony Nov 14): under html.ui-v7 the base surface tokens take the navy mock; flag off keeps the old values.
  const TOK = { "--page": "#02040d", "--card": "#0d142a", "--sheet": "#0d142a", "--float": "#141d36", "--chip": "#283352", "--line": "#556791", "--wrong": "#f0667a", "--wrong-on": "#ffc4c9", "--correct-on": "#b9efd8", "--help": "#ffa63e", "--help-sheet": "#16110d" };
  const OLD = { "--page": "#02060c", "--card": "#0b1422", "--sheet": "#14233a", "--float": "#1b2b40", "--chip": "", "--line": "#5e7899", "--wrong": "#eb596e", "--wrong-on": "#ffd1d3", "--correct-on": "#bdead5", "--help": "#ff9a3e", "--help-sheet": "#17130f" };
  const tokens = p => p.evaluate(names => names.map(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase()), Object.keys(TOK));
  await step("COLOR-TOKENS 1: ?ui=v7 base surfaces take the navy mock; flag off keeps the old values", async () => {
    const [c, p] = await fresh(browser, "on");
    const on = await tokens(p);
    assert.deepEqual(on, Object.keys(TOK).map(n => TOK[n]), "flag on = mock");
    await c.close();
    const [c2, q] = await fresh(browser, "off");
    assert.deepEqual(await tokens(q), Object.keys(OLD).map(n => OLD[n]), "flag off = old");
    await c2.close();
  });
  // NO-BORDER 1 (Tony Nov 14, option A): under ui-v7 an empty notch is a tint fill with no edge (only the next slot rings), the question card has
  // no inset edge, an unchosen option row has no 1px edge; the chosen row keeps its edge. Flag off keeps every edge.
  await step("NO-BORDER 1: ?ui=v7 empty notch = tint, no edge (.next keeps its ring); question card + unchosen option row: no edge; chosen row keeps it; flag off unchanged", async () => {
    const [c, p] = await fresh(browser, "on");
    await go(p, "CALC1_P01");
    await p.waitForSelector("#q .opt");
    await p.click('#q .opt[data-id="a"]');
    const on = await p.evaluate(() => {
      const st = e => { const s = getComputedStyle(e); return { bw: s.borderTopWidth, shadow: s.boxShadow, bg: s.backgroundColor }; };
      const q = s => document.querySelector(s);
      return { empty: st(q("#pbTile .pb-n:not(.next)")), next: st(q("#pbTile .pb-n.next")), rest: st(q("#q .opt:not([aria-checked='true'])")),
        chosen: st(q("#q .opt[aria-checked='true']")), card: q(".p") ? st(q(".p")) : null };
    });
    assert.equal(on.empty.bw, "0px", "empty notch: no edge");
    assert.equal(on.empty.shadow, "none", "empty notch: no inset ring");
    assert.notEqual(on.empty.bg, "rgba(0, 0, 0, 0)", "empty notch: a tint fill, not a hole");
    assert.equal(on.next.bw, "0px", "next slot: no border width");
    assert.notEqual(on.next.shadow, "none", "the next slot keeps its ring");
    assert.equal(on.rest.bw, "0px", "unchosen option row: no edge");
    assert.equal(on.chosen.bw, "0px", "chosen option row: no edge either (MC-BENTO: picked = a fill step, REVIEW2 item 2)");
    assert.ok(on.card, "a question card (.p) is on the page");
    assert.equal(on.card.bw, "0px", "question card: no edge");
    // precise (NAVY-MIN): an EDGE = an all-around inset ring (inset 0 0 Npx, zero y offset) or a border; a LIT TOP = inset 0 Ypx 0 <alpha <= .12>, no blur/spread, top only (allowed)
    const layers = on.card.shadow === "none" ? [] : on.card.shadow.split(/,(?![^(]*\))/).map(x => x.trim()).filter(x => /\binset\b/.test(x));
    const num = x => { const m = x.replace(/rgba?\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)/g, "").match(/-?[\d.]+px/g) || []; return m.map(parseFloat); };
    const alpha = x => { const m = x.match(/rgba?\(([^)]*)\)/); if (!m) return 1; const p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    for (const l of layers) {
      const [ox, oy, blur, spread] = num(l);
      assert.ok(!(ox === 0 && oy === 0 && (spread || 0) > 0), "question card: no all-around inset ring: " + l);
      assert.ok(ox === 0 && oy > 0 && (blur || 0) === 0 && (spread || 0) === 0 && alpha(l) <= 0.12, "question card: an inset layer must be a lit top (inset 0 Ypx 0, alpha <= .12): " + l);
    }
    assert.deepEqual(p.__errs, []);
    await c.close();
    const [c2, q] = await fresh(browser, "off");
    await go(q, "CALC1_P01"); await q.waitForSelector("#q .opt");
    const off = await q.evaluate(() => { const s = getComputedStyle(document.querySelector("#q .opt:not([aria-checked='true'])")); return s.borderTopWidth; });
    assert.equal(off, "1px", "flag off: option edge stays");
    await c2.close();
  });

} finally {
  await browser.close(); srv.kill();
}
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nALL OK");
