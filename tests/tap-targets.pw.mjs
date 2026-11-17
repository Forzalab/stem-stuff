// TAP-TARGETS (sabotage findings, ui-polish): three small controls get a 44x44 hit area without a visual change, and the
// rewards level star's digit reads 4.5:1 on its gold star.
//   button.fq        the formula card "?" (16px mark, 1px ring): its hit area (::after) reaches 44x44
//   #privacy         the footer link on desktop with the notes pad (a 24px tall foot): its hit area reaches 44 tall
//   .rp-chip         the narrowest repair-ladder chip (34px wide on the welcome ladder): its hit area reaches 44x44
//   .rw-star b       the level star's digit "1": median contrast >= 4.5:1 on the star under it, measured on pixels (the star with the digit hidden).
//                    A guard: the ink is ~10:1 on the star; the 1.26:1 of the finding is the same ink against the page navy behind the star.
// A hit area is probed with elementFromPoint at the 9 points of a 44 px square centred on the element (offsets +-21.5 px).
// Points outside the window are skipped (a tap cannot land there); at least 5 of the 9 must be inside.
// Own serve.py + throwaway banks (a formula card bank and the welcome ladder bank), 390 phone (touch) and 1366 desktop.
//   node tests/tap-targets.pw.mjs <port> [shots dir]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: wait on state, not time
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8861", BASE = `http://127.0.0.1:${PORT}`;
const TMP = process.env.TAP_TMP || mkdtempSync(join(tmpdir(), "tap-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
mkdirSync(BANKS, { recursive: true }); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const FC = [
  { id: "KE", tex: "K = \\frac{1}{2}mv^2", doc: { purpose: "Kinetic energy.", sym: [{ s: "m", m: "mass", u: "kg" }, { s: "v", m: "speed", u: "m/s" }] } },
  { id: "VMAG", tex: "v = \\sqrt{v_x^2 + v_y^2}" }];
const LUI = {
  code: "PHYS_LQ1", type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Lift", tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 3.74" },
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant standing on the big piston, of diameter $2.0\\ \\text{m}$. Find that pressure (in kPa)." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the elephant's" }, { id: "b", md: "the student's" }, { id: "c", md: "both" }], ok: "a" },
    { id: "sheet", label: "Which formula line do you use for pressure?", kind: "sheet", pool: ["PRESSURE", "DENSITY", "P_DEPTH"], ok: "PRESSURE" },
    { id: "area", label: "Area of the big piston", kind: "fill", tex: "A=\\pi(▢)^2", opts: ["d/2", "d", "2d"], ok: "d/2", fam: "off-by-factor",
      miss: { d: "You used the diameter. What do you square in the area? QUACK." },
      why: { q: "Why half?", opts: ["the diameter is the radius", "you halve it for the second student", "area uses the radius, and the radius is half the diameter"], ok: 2 } },
    { id: "answer", label: "Final answer", kind: "num" }] } };
writeFileSync(join(BANKS, "BANK_LUI.json"), JSON.stringify({ v: 1, problems: [LUI] }));
writeFileSync(join(BANKS, "BANK_FCC.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_FC1", title: "CALC1_FC1", type: "expr", var: "x", points: [1, 2, 3], snack: true,
  body: [{ type: "text", md: "Type $x$." }], answer: "x", saccharine: { title: "CALC1_FC1", part: FC.map(r => r.id) } }] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Tap", rows: [...FC, { id: "PRESSURE", tex: "P=\\frac{F}{A}" }, { id: "DENSITY", tex: "\\rho=\\frac{M}{V}" }, { id: "P_DEPTH", tex: "P=P_0+\\rho g h" }] }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "", STEM_TODAY: "2026-11-03", STEM_FRONT: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
/* the 9 probe points of the 44 px square centred on the element (offsets +-21.5 px), the ones inside the window: each must hit el or a
   child of it, or (siblings: a row of chips, 8 px apart, shares the overlap of two 44 px areas) an element matching `sibs` */
const hitArea = async (page, sel, sibs = null) => { await settled(page, sel); return page.evaluate(([sel, sibs]) => {
  const el = document.querySelector(sel);
  { const q = el.getBoundingClientRect(); if (q.top < 0 || q.bottom > innerHeight) el.scrollIntoView({ block: "center", inline: "center" }); }
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, miss = [], own = [];
  let inside = 0;
  for (const dx of [-21.5, 0, 21.5]) for (const dy of [-21.5, 0, 21.5]) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    inside++;
    const t = document.elementFromPoint(Math.floor(x), Math.floor(y));
    const mine = !!t && (t === el || el.contains(t)), shared = !!t && !!sibs && t.matches(sibs);
    if (mine) own.push([dx, dy]);
    if (!mine && !shared) miss.push([dx, dy, t ? t.tagName.toLowerCase() + (typeof t.className === "string" && t.className ? "." + t.className.split(" ")[0] : "") : "none"]);
  }
  return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, inside, miss, own: own.length };
}, [sel, sibs]); };
const visible = (page, sel) => page.waitForFunction(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility === "visible"; }, sel, { timeout: 10000 });
const checkHit = (h, what, need) => assert.ok(h.inside >= 5 && h.miss.length === 0 && need(h), `${what} ${h.w}x${h.h}, ${h.inside}/9 points in the window, misses ${JSON.stringify(h.miss)}`);
/* the level star's "1" against what is behind it: the star's own pixels under the digit's box (the digit is hidden for the shot, so
   the star alone is screenshotted). min = the least contrast over those opaque pixels; onPage = the same ink against the page
   behind the star (the navy --page), the number a box-only check gets, reported for comparison */
async function badgeContrast(page) {
  const b = page.locator("#rwHud .rw-star b").first(), star = page.locator("#rwHud .rw-star").first();
  const rs = await star.boundingBox();
  await b.evaluate(e => { e.style.visibility = "hidden"; });
  const png = await star.screenshot();
  const rb = await b.boundingBox();
  await b.evaluate(e => { e.style.visibility = ""; });
  const box = { x: Math.floor(rb.x - rs.x), y: Math.floor(rb.y - rs.y), w: Math.ceil(rb.width), h: Math.ceil(rb.height) };
  const ink = await b.evaluate(e => getComputedStyle(e).color), page0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  return page.evaluate(async ({ b64, ink, box, page0 }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, nums = s => s.match(/[\d.]+/g).map(Number);
    const lum = v => { const [r, gg, bb] = v.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * bb; };
    const ratio = (a, bb) => (Math.max(a, bb) + 0.05) / (Math.min(a, bb) + 0.05);
    const Lk = lum(nums(ink)), ratios = [];
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * c.width + x) * 4; if (d[i + 3] < 255) continue;
      ratios.push(ratio(Lk, lum([d[i], d[i + 1], d[i + 2]])));
    }
    ratios.sort((p, q) => p - q);
    return { ink, min: ratios[0], med: ratios[ratios.length >> 1], n: ratios.length, onPage: ratio(Lk, lum(nums(page0))) };
  }, { b64: png.toString("base64"), ink, box, page0 });
}

const VIEWS = [["390x844 phone", { width: 390, height: 844 }, true], ["1366x768 desktop", { width: 1366, height: 768 }, false]];
for (const [label, vp, phone] of VIEWS) {
  const b = await launchBrowser(pw, { args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  // the onboarding is done, so the rewards HUD (#rwHud) shows on a question (as blink-fx.pw.mjs sets it)
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const x of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + x, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  const errs = []; let page;
  const fresh = async () => { if (page) await page.close(); page = await ctx.newPage(); page.on("pageerror", e => errs.push(String(e))); };   // one page per step: a hash change re-opens nothing
  try {
    // desktop + mouse keeps #privacy at 24px on purpose (Tony Oct 19: off Cluck's corner; a 44px area stole Cluck send clicks, flight spec): touch only
    if (phone) await step(`${label}: #privacy hit area is 44 tall (start page)`, async () => {
      await fresh();
      await page.goto(BASE + (phone ? "/" : "/#BANK_FCC"));
      if (!phone) await page.waitForFunction(() => /^#CALC1_/.test(location.hash) && !!document.querySelector("#fcard .fq"), null, { timeout: 15000 });
      await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 15000 }); await settled(page, "#privacy");
      await visible(page, "#privacy");
      const h = await hitArea(page, "#privacy");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tap-privacy-${vp.width}.png` });
      checkHit(h, "#privacy", () => true);
    });
    await step(`${label}: button.fq "?" hit area is 44x44 (formula card)`, async () => {
      await fresh(); await page.goto(BASE + "/#BANK_FCC");
      await page.waitForFunction(() => /^#CALC1_/.test(location.hash) && !!document.querySelector("#fcard .fq"), null, { timeout: 15000 });
      await visible(page, "#fcard .fq");
      const h = await hitArea(page, "#fcard .fq");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tap-fq-${vp.width}.png` });
      checkHit(h, "fq", () => true);
    });
    await step(`${label}: .rw-star b digit reads 4.5:1 on the star`, async () => { await fresh(); await page.goto(BASE + "/#BANK_FCC"); await page.waitForFunction(() => /^#CALC1_/.test(location.hash), null, { timeout: 15000 });
      await visible(page, "#rwHud .rw-star b");
      await page.waitForFunction(() => !!document.querySelector("#rwHud .rw-star b") && [...document.querySelectorAll("#rwHud, #rwHud *")].every(e => getComputedStyle(e).opacity === "1" && !e.getAnimations().length), null, { timeout: 10000 }).catch(() => {}); await settled(page, "#rwHud .rw-star b");
      const c = await badgeContrast(page);
      console.log(`     digit ${c.ink}: median ${c.med.toFixed(2)}:1, least ${c.min.toFixed(2)}:1 on the star under it (${c.n} px); ${c.onPage.toFixed(2)}:1 on the page behind the star`);
      assert.ok(c.med >= 4.5, `digit ${c.ink} on the star: median ${c.med.toFixed(2)}:1 over ${c.n} px`);
    });
    await step(`${label}: .rp-chip hit area is 44x44 (narrowest chip, welcome repair ladder)`, async () => { await fresh();
      await page.goto(BASE + "/#BANK_LUI");
      await page.waitForFunction(() => location.hash === "#PHYS_LQ1" && !!document.querySelector("#q section.wl .rp-chip"), null, { timeout: 15000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const sel = await page.evaluate(() => {
        const cs = [...document.querySelectorAll("#q section.wl .rp-chip")].filter(e => e.getClientRects().length && getComputedStyle(e).visibility === "visible");
        cs.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
        if (cs[0]) cs[0].dataset.tt = "1"; return cs[0] ? "#q section.wl .rp-chip[data-tt]" : null;
      });
      assert.ok(sel, "no visible chip");
      const h = await hitArea(page, sel, "#q section.wl .rp-chip");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tap-chip-${vp.width}.png` });
      checkHit(h, "rp-chip", h => h.own >= 3);
    });
    await step(`${label}: no page errors`, async () => assert.deepEqual(errs, []));
  } finally { await b.close(); }
}
srv.kill();
console.log(failures ? `${failures} failed` : "tap-targets: all green");
process.exit(failures ? 1 : 0);
