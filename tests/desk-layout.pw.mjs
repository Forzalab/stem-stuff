// The desktop page as one layout (todo 129, brain projects/calc/_files/w129/PLAN.md L1-L6): the question column and the Explain column
// (#work: the brainrot label row + videos, the notes, Cluck's card) side by side, the footer (#privacy, #ver) fixed at the foot.
//   L1 one outer scroller, the page: #work never scrolls by itself (scrollHeight == clientHeight, overflow-y not auto/scroll, a wheel over it
//      leaves its scrollTop at 0), and the page does not scroll when the question column fits the window
//   L2 the inner scrollers keep working: Cluck's log (.cl-bd) scrolls under a wheel
//   L3 the column fits the window below its top: Cluck's ask field (and the notes box) fully on screen, >= 8px (--s2) above the footer
//   L4 a tap in the welcome ladder, Cluck opening, the brainrot fold: the question column moves <= 1px; CLS outside #work <= 0.01
//   L5 nothing overlaps the footer: no toast on #privacy / #ver
//   L6 pixel diff (Tony 15:5x PT: "any significant pixel change is a redflag, there shall be no jank at all"): every tap of the welcome
//      flow (each ladder chip, the why, the answer's Check), Cluck's open, the brainrot fold: a shot right before, then +50/+150/+300/+600 ms;
//      a changed pixel (any channel > 16) outside the allowed boxes (the rows whose state changed, the tapped control; Cluck / the fold: the
//      Explain column) in a cluster > 64 px = RED. A frame that changed somewhere the last frame did not (moved and came back) = RED too.
//      The diff runs in a blank page's canvas (no Pillow / pngjs on CI); DIFF_DIR=<dir> keeps the shots + a diff PNG of every red.
// The welcome item stands in for PHYS_BQ3 (pick, sheet, fill + why, keyless num answer). Own serve.py:
//   node tests/desk-layout.pw.mjs [port]      ENGINES=chromium,firefox,webkit  SIZES=1440x900,1366x768@1.25
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
const PORT = +(process.argv[2] || 8883), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "desk-layout-")), BANKS = join(TMP, "banks");
const DIFF_DIR = process.env.DIFF_DIR || "";
const WLC = "PHYS_DQ1", PLAIN = "PHYS_DA1";
const sac = n => ({ title: `Desk ${n}`, tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 4" });
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `A piston question ${n}: what is 2 + ${n}?` }], noob: { tier: 1 }, saccharine: sac(n) });
const welcome = {
  code: WLC, type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: sac(0),
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant standing on the big piston, of diameter $2.0\\ \\text{m}$. The two pistons are at the same height, so the oil pressure under both is the same. Find that pressure (in kPa, above the outside air)." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the elephant's" }, { id: "b", md: "the student's" }, { id: "c", md: "both" }], ok: "a" },
    { id: "sheet", label: "Which formula line do you use for pressure?", kind: "sheet", pool: ["PRESSURE", "DENSITY", "P_DEPTH"], ok: "PRESSURE",
      why: { q: "Why this line?", opts: ["pressure is mass per volume", "pressure is force per area", "pressure grows with depth here"], ok: 1 } },
    { id: "area", label: "Area of the big piston", kind: "fill", tex: "A=\\pi(▢)^2", opts: ["d/2", "d", "2d"], ok: "d/2", fam: "off-by-factor",
      why: { q: "Why half?", opts: ["the diameter is the radius", "you halve it for the second student", "area uses the radius, and the radius is half the diameter"], ok: 2 } },
    { id: "answer", label: "Final answer", kind: "num" }
  ] }
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_DSK.json"), JSON.stringify({ v: 1, problems: [welcome, num(PLAIN, 1), num("PHYS_DA2", 2)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [
  { id: "PRESSURE", tex: "P=\\frac{F}{A}" }, { id: "DENSITY", tex: "\\rho=\\frac{M}{V}" }, { id: "P_DEPTH", tex: "P=P_0+\\rho g h" }] }] }));

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DSK", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: process.env.STEM_TODAY || "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
/* the size matrix (PLAN): the side-by-side breakpoint (720) and one px over, laptops, desktops, 125% / 150% zoom at 1366 (CSS px = window / zoom) */
const SIZES = (process.env.SIZES || "720x800,721x800,1024x768,1280x720,1366x768,1440x900,1920x1080,2560x1440,1366x768@1.25,1366x768@1.5").split(",").map(s => {
  const [wh, z] = s.split("@"), [w, h] = wh.split("x").map(Number), zoom = +(z || 1);
  return { name: s, zoom, viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) } };
});
const ENGINES = (process.env.ENGINES || "chromium").split(",");
const LONG = Array.from({ length: 14 }, (_, i) => `Step ${i + 1}: pressure is force over area, so divide the weight by the piston's area and keep the units in pascals.`).join("\n\n");

async function context(browser, size, init) {
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.zoom, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#222'></body>" }));
  await ctx.route(/\/explain$/, r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: LONG }));
  await ctx.addInitScript(init => { try {
    localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
  } catch { /* blocked */ }
  window.__cls = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push({ v: e.value,
    nodes: (e.sources || []).map(s => s.node && s.node.nodeType === 1 ? s.node : s.node && s.node.parentElement).filter(Boolean) }); }).observe({ type: "layout-shift", buffered: true }); } catch { /* no layout-shift (firefox / webkit) */ } }, init);
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(e.message));
  return { ctx, page, errs };
}
/* the start line's toast (W112) lives 4 s with a running bar: let it go before the flow, so only taps change pixels */
async function settle(page) {
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const up = () => { const t = document.querySelector(".stoast"); return !!t && !!t.getClientRects().length && getComputedStyle(t).visibility !== "hidden" && getComputedStyle(t).opacity !== "0"; };
  const shown = await page.waitForFunction(up, null, { timeout: 4000 }).then(() => true, () => false);   // it may come late (WebKit): wait for it to show
  if (shown) { await page.click(".stoast-x"); await page.waitForFunction(u => !(0, eval)(u)(), up.toString(), { timeout: 9000 }); }   // closed by its X; no room = it never shows
  await page.mouse.move(1, 1);
  await page.waitForTimeout(700);
}
const rectOf = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null;
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
/* where the question column's pieces sit (page coords) and what the ladder rows are */
const qCol = page => page.evaluate(() => {
  const o = {};
  for (const s of [".top", "#freeze", "#problem", "#blocks", "#fb", "#sash", "#work"]) { const e = document.querySelector(s); if (e && e.getClientRects().length) { const r = e.getBoundingClientRect(); o[s] = [r.x, r.y, r.width, r.height]; } }
  return o;
});
const rows = page => page.evaluate(() => [...document.querySelectorAll("#q .rp-step")].map(li => { const r = li.getBoundingClientRect(); return { id: li.dataset.id, state: li.dataset.state, x: r.x, y: r.y, w: r.width, h: r.height }; }));

/* ---- the pixel diff, in a blank page's canvas: shots are PNG buffers; boxes in CSS px (scaled by the zoom) ---- */
let differ = null;
async function diff(before, frames, allow, zoom, live) {
  return differ.evaluate(async ({ before, frames, allow, zoom, live }) => {
    const load = async b64 => { const bm = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
      const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext("2d"); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height); };
    const B = await load(before), W = B.width, H = B.height;
    const ok = new Uint8Array(W * H);
    for (const a of allow) { const x0 = Math.max(0, Math.floor((a.x - 3) * zoom)), y0 = Math.max(0, Math.floor((a.y - 3) * zoom)),
      x1 = Math.min(W, Math.ceil((a.x + a.w + 3) * zoom)), y1 = Math.min(H, Math.ceil((a.y + a.h + 3) * zoom));
      for (let y = y0; y < y1; y++) ok.fill(1, y * W + x0, y * W + x1); }
    const changed = img => { const m = new Uint8Array(W * H); if (img.width !== W || img.height !== H) return m.fill(1);
      for (let i = 0, p = 0; i < m.length; i++, p += 4) if (Math.abs(img.data[p] - B.data[p]) > 16 || Math.abs(img.data[p + 1] - B.data[p + 1]) > 16 || Math.abs(img.data[p + 2] - B.data[p + 2]) > 16) m[i] = 1;
      return m; };
    const clusters = mask => {                                               // 8-connected clusters of set pixels, > 64 px each: [{ n, x0, y0, x1, y1 }]
      const seen = new Uint8Array(W * H), out = [], st = [];
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || seen[i]) continue;
        let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; st.push(i); seen[i] = 1;
        while (st.length) { const j = st.pop(), x = j % W, y = (j - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const k = yy * W + xx; if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); } } }
        if (n > 64) out.push({ n, x0: x0 / zoom | 0, y0: y0 / zoom | 0, x1: x1 / zoom | 0, y1: y1 / zoom | 0 });
      }
      return out;
    };
    const masks = [];
    for (const f of frames) masks.push(changed(await load(f)));
    const last = masks[masks.length - 1], res = [];
    masks.forEach((m, k) => {
      const out = new Uint8Array(W * H), back = new Uint8Array(W * H);
      for (let i = 0; i < m.length; i++) { if (m[i] && !ok[i]) out[i] = 1; if (m[i] && !last[i] && !(live && ok[i])) back[i] = 1; }
      res.push({ k, outside: clusters(out), back: k < masks.length - 1 ? clusters(back) : [] });
    });
    /* the diff PNG of the worst frame: changed pixels red (outside) / amber (allowed), the allowed boxes dim */
    let png = null;
    const worst = res.findIndex(r => r.outside.length || r.back.length);
    if (worst >= 0) {
      const c = new OffscreenCanvas(W, H), x = c.getContext("2d"), img = x.createImageData(W, H), m = masks[worst];
      for (let i = 0, p = 0; i < m.length; i++, p += 4) { const g = (B.data[p] + B.data[p + 1] + B.data[p + 2]) / 9;
        if (m[i]) { img.data[p] = 255; img.data[p + 1] = ok[i] ? 170 : 0; img.data[p + 2] = 0; } else { img.data[p] = img.data[p + 1] = img.data[p + 2] = ok[i] ? g + 30 : g; }
        img.data[p + 3] = 255; }
      x.putImageData(img, 0, 0);
      const blob = await c.convertToBlob({ type: "image/png" }), buf = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      png = btoa(s);
    }
    return { res, worst, png };
  }, { before: before.toString("base64"), frames: frames.map(f => f.toString("base64")), allow, zoom, live });
}
const AT = [50, 150, 300, 600];
/* tap = the action; allowFn(after) = the boxes allowed to change (CSS px, viewport). Shoots before + AT, diffs, throws on red */
/* tap.live: the allowed boxes hold content that animates on its own (Cluck typing his reply): there a frame may differ from the last one */
async function gate(page, label, size, tap, allowFn) {
  if (tap.prep) await tap.prep();                                          // the student scrolls to it first (Playwright's click would, inside the shots)
  await page.waitForTimeout(250);
  const before = await page.screenshot({ caret: "hide" });
  const q0 = await qCol(page), r0 = await rows(page);
  const focus0 = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null;   // its focus ring leaves on a tap elsewhere: that box may change
    const r = (e.closest(".ff") || e).getBoundingClientRect(); return { x: r.x - 4, y: r.y - 4, w: r.width + 8, h: r.height + 8 }; });
  await page.evaluate(() => { window.__cls = []; });
  const t0 = Date.now(); await tap(); const frames = [], at = [];
  for (const ms of AT) { const w = ms - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); at.push(Date.now() - t0); frames.push(await page.screenshot({ caret: "hide" })); }
  const q1 = await qCol(page), r1 = await rows(page);
  const allow = [...await allowFn({ r0, r1, q0, q1 }), ...(focus0 ? [focus0] : [])];
  const { res, worst, png } = await diff(before, frames, allow, size.zoom, !!tap.live);
  const tag = `${size.engine}-${size.name.replace(/[@.]/g, "_")}-${label.replace(/\W+/g, "_")}`;
  if (DIFF_DIR) { mkdirSync(DIFF_DIR, { recursive: true }); writeFileSync(join(DIFF_DIR, tag + "-0before.png"), before);
    frames.forEach((f, k) => writeFileSync(join(DIFF_DIR, `${tag}-${AT[k]}.png`), f)); if (png) writeFileSync(join(DIFF_DIR, tag + "-DIFF.png"), Buffer.from(png, "base64")); }
  const red = res.filter(r => r.outside.length || r.back.length).map(r => `+${AT[r.k]}ms(${at[r.k]}): outside ${JSON.stringify(r.outside.slice(0, 3))} back ${JSON.stringify(r.back.slice(0, 3))}`);
  /* L4: the question column's pieces (not #work, not the ladder card itself, which is the region meant to change) */
  const moved = [];
  for (const k of [".top", "#problem", "#blocks"]) if (q0[k] && q1[k] && q0[k].some((v, i) => Math.abs(v - q1[k][i]) > 1)) moved.push(`${k} ${q0[k].map(Math.round)} -> ${q1[k].map(Math.round)}`);
  for (const a of r0) { const b = r1.find(r => r.id === a.id); if (b && a.state === b.state && (Math.abs(a.y - b.y) > 1 || Math.abs(a.h - b.h) > 1)) moved.push(`row ${a.id} y ${Math.round(a.y)} -> ${Math.round(b.y)} h ${Math.round(a.h)} -> ${Math.round(b.h)}`); }
  const cls = await page.evaluate(() => { const w = document.querySelector("#work"); return window.__cls.filter(e => !e.nodes.length || e.nodes.some(n => !w || !w.contains(n))).reduce((s, e) => s + e.v, 0); });
  assert.deepEqual({ red, moved, cls: cls > 0.01 ? cls : 0 }, { red: [], moved: [], cls: 0 }, `${tag}: jank (diff: DIFF_DIR=<dir> keeps ${tag}-DIFF.png)`);
}
/* the rows whose state changed (before or after box) + the tapped control */
const changedRows = ({ r0, r1 }) => { const out = [], wide = r => ({ ...r, x: r.x - 24, w: r.w + 24 });   // + the ▸ that hangs left of the number
  for (const a of r0) { const b = r1.find(r => r.id === a.id); if (!b || a.state !== b.state) { out.push(wide(a)); if (b) out.push(wide(b)); } } return out; };

/* L1 / L3 / L5 on the column as it stands */
async function column(page, tag, size) {
  const m = await page.evaluate(() => {
    const wk = document.querySelector("#work"), cs = getComputedStyle(wk), r = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
    const main = document.querySelector("main"), fz = document.querySelector("#freeze");
    return { sh: wk.scrollHeight, ch: wk.clientHeight, ov: cs.overflowY, work: r("#work"), ask: r("#work .cl-ft .ask"), notes: r("#work .pad, #work #scratch"), privacy: r("#privacy"), ver: r("#ver"),
      toast: r(".stoast"), ih: innerHeight, docH: document.documentElement.scrollHeight,
      tall: [...document.querySelectorAll("body *")].map(e => [e, e.getBoundingClientRect().bottom + scrollY]).filter(([e, b]) => b > innerHeight + 1 && getComputedStyle(e).position !== "fixed" && !e.closest("#work .cl-bd, .stoast"))
        .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e, b]) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String(e.className).split(" ")[0]}@${Math.round(b)}`), qBottom: Math.max(...[...document.querySelectorAll("#stage > *, main > *")].filter(e => !e.closest("#work") && !["work", "sash", "stage"].includes(e.id) && e.getClientRects().length)
        .map(e => e.getBoundingClientRect().bottom)) + scrollY + parseFloat(getComputedStyle(main).paddingBottom)
        + parseFloat(getComputedStyle(document.body).paddingBottom) };   // the question column's foot (what may make the page scroll), + peek.js's room under the page for the duck (html.ck-room)
  });
  assert.ok(!["auto", "scroll"].includes(m.ov), `${tag}: L1 the Explain column scrolls itself (overflow-y ${m.ov})`);
  assert.ok(m.sh <= m.ch + 1, `${tag}: L1 the Explain column overflows (scrollHeight ${m.sh} > clientHeight ${m.ch})`);
  assert.ok(m.docH <= Math.max(m.ih, Math.ceil(m.qBottom)) + 1, `${tag}: L1 the page scrolls though the question column fits (doc ${m.docH}, window ${m.ih}, question column ${Math.round(m.qBottom)}; lowest: ${m.tall.join(", ")})`);
  const foot = [m.privacy, m.ver].filter(Boolean);
  for (const [name, box] of [["ask field", m.ask], ["notes", m.notes]]) {
    if (!box) continue;
    assert.ok(box.y >= 0 && box.b <= m.ih, `${tag}: L3 the ${name} is cut by the window (${Math.round(box.y)}..${Math.round(box.b)} of ${m.ih})`);
    for (const f of foot) if (f.x < box.r && f.r > box.x) assert.ok(box.b <= f.y - 8 + 0.5, `${tag}: L3 the ${name} ends ${Math.round(f.y - box.b)}px above the footer (want >= 8; ${name} ${Math.round(box.y)}..${Math.round(box.b)}, footer ${Math.round(f.y)}..${Math.round(f.b)}, window ${m.ih})`);
  }
  if (m.toast) for (const f of foot) assert.ok(!(m.toast.x < f.r && m.toast.r > f.x && m.toast.y < f.b && m.toast.b > f.y), `${tag}: L5 a toast on the footer`);
  const wheel = await page.evaluate(() => [scrollY, document.querySelector("#work").scrollTop]);
  await page.mouse.move(m.work.x + 24, m.work.y + 12); await page.mouse.wheel(0, 300); await page.waitForTimeout(250);
  const after = await page.evaluate(() => [scrollY, document.querySelector("#work").scrollTop]);
  assert.equal(after[1], 0, `${tag}: L1 a wheel scrolled the Explain column itself`);
  if (m.docH <= m.ih) assert.equal(after[0], wheel[0], `${tag}: L1 a wheel over the column moved the page, which fits the window`);
  await page.mouse.wheel(0, -300); await page.waitForTimeout(150);
  return m;
}

try {
  for (const engine of ENGINES) {
    const browser = await pw[engine].launch(engine === "chromium" ? { args: ["--no-sandbox"] } : {});
    const dctx = await browser.newContext(); differ = await dctx.newPage(); await differ.goto(BASE + "/privacy.html");
    for (const sz of SIZES) {
      const size = { ...sz, engine }, tag = `${engine} ${sz.name}`;
      /* the welcome flow, every tap */
      {
        const { ctx, page, errs } = await context(browser, size, {});
        await step(`${tag}: the welcome ladder, every tap: nothing moves outside the rows it changes (L4, L6)`, async () => {
          await page.goto(BASE + "/");
          await page.waitForSelector('#q .wl .rp-step[data-state="active"] .rp-chip', { timeout: 10000 });
          await settle(page);
          const act = sel => `#q .rp-step[data-state="active"] ${sel}`;
          /* a tap where the student sees it: scrolled into view first (prep, before the shots), then a plain mouse click at its centre (page.click
             would scroll again inside the shots on WebKit) */
          const tapIn = sel => { let at = null; return Object.assign(async () => { await page.mouse.click(at.x, at.y); }, { prep: async () => {
            const l = page.locator(act(sel)).first(); await l.scrollIntoViewIfNeeded(); await page.waitForTimeout(100); const b = await l.boundingBox(); at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } }); };
          const chipAllow = sel => async c => [...changedRows(c), ...(await page.$$eval(act(sel), els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })))];
          await gate(page, "1-pick", size, tapIn('.rp-chip[data-v="a"]'), async c => changedRows(c));
          await gate(page, "2-sheet", size, tapIn('.rp-chip[data-v="PRESSURE"]'), async c => changedRows(c));
          /* the fill step: its value, then its why, in the same row (the row stays active between: the row itself is what changes) */
          const row = id => async () => { const r = await rows(page); return r.filter(x => x.id === id); };
          await gate(page, "3-fill", size, tapIn('.rp-chip[data-v="d/2"]'), async c => [...changedRows(c), ...(await row("area")())]);
          await gate(page, "3-why", size, tapIn('.rp-chip[data-why="2"]'), async c => changedRows(c));
          await page.fill(act(".rp-in"), "3.74");
          /* the last Check: the answer row, the done line and Next arrive at the card's foot (below the ladder: meant to change) */
          await gate(page, "4-answer", size, tapIn(".rp-check"), async c => { const wl = await rectOf(page, "#q section.wl"), a = c.r0.find(r => r.id === "answer");
            return [...changedRows(c), { x: wl.x, y: a.y, w: wl.w, h: wl.b - a.y + 80 }]; });
          assert.ok(await page.$("#q section.wl .nx"), "no Next after the welcome");
          assert.deepEqual(errs, []);
        });
        await ctx.close();
      }
      /* the Explain column with the notes, the brainrot fold, then Cluck open (a normal item: a miss, his reply, "okay, but how?") */
      {
        const { ctx, page, errs } = await context(browser, size, { "stem-welcome-BANK_DSK": "1" });
        await step(`${tag}: the Explain column (notes, the brainrot fold, Cluck open) is one window tall, never its own scroller, clear of the footer (L1-L6)`, async () => {
          await page.goto(BASE + "/#" + PLAIN);
          await page.waitForSelector("#ans", { timeout: 10000 });
          await settle(page);
          await column(page, `${tag} notes`, size);
          if (await page.$("#work .rot-link")) {
            await gate(page, "fold", size, () => page.click("#work .rot-link"), async c => [{ x: c.q0["#work"][0], y: c.q0["#work"][1], w: c.q0["#work"][2], h: Math.max(c.q0["#work"][3], c.q1["#work"][3]) }]);
            await column(page, `${tag} folded`, size);
            await page.click("#work .rot-link"); await page.waitForTimeout(400);
          }
          await page.fill("#ans", "1"); await page.keyboard.press("Enter");
          await page.waitForSelector(".cl-peek .cl-cta", { timeout: 8000 });
          await page.waitForTimeout(1500); await page.mouse.move(1, 1);
          /* allowed: the card the CTA sits in, Cluck's duck (peek.js .ck-rise: it sinks when he opens), the Explain column */
          const card = await page.evaluate(() => [document.querySelector(".cl-peek")?.closest(".cluck") || document.querySelector(".cl-peek"), document.querySelector(".ck-rise")]
            .filter(e => e && e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
          await gate(page, "cluck-open", size, Object.assign(() => page.click(".cl-peek .cl-cta"), { live: true }), async c => [...card, { x: c.q0["#work"][0], y: Math.min(c.q0["#work"][1], c.q1["#work"][1]), w: c.q0["#work"][2], h: size.viewport.height }]);
          await page.waitForSelector("#work.cl-on .cl-ft .ask", { timeout: 5000 });
          await page.waitForTimeout(600);
          await column(page, `${tag} cluck`, size);
          const bd = await rectOf(page, "#work .cl-bd");                     // L2: his log scrolls inside itself
          const sc = await page.$eval("#work .cl-bd", e => [e.scrollHeight, e.clientHeight]);
          if (sc[0] > sc[1] + 4) {
            await page.mouse.move(bd.x + bd.w / 2, bd.y + bd.h / 2); await page.mouse.wheel(0, 200); await page.waitForTimeout(300);
            assert.ok(await page.$eval("#work .cl-bd", e => e.scrollTop) > 0, `${tag}: L2 Cluck's log does not scroll`);
          }
          assert.deepEqual(errs, []);
        });
        await ctx.close();
      }
    }
    await browser.close();
  }
} finally {
  srv.kill();
}
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
