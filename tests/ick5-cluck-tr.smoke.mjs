// ICK5-CLUCK-TR smoke (Tony Nov 18): Ask Cluck = tangerine squircle at #problem's top right, floated (text wraps), both widths;
// in phone proof typing it FLIPs into the in-box 56px slot and back. Own serve.py, uploaded bank, ui-v7.
//   node tests/ick5-cluck-tr.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8847), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "ick5tr-")), "tries.json");
const LONG = "A cart rolls down a straight ramp with a steady acceleration. The ramp is 3.5 meters long and the cart starts from rest at the top. A student times the cart with a phone and writes the time on a sticky note. Another student measures the length of the ramp with a metal tape and records it twice. The two students then compare their numbers and argue about which measurement is more trustworthy. Before they answer, decide which quantity is the dependent one and which is the independent one, then explain how repeating each measurement would change the uncertainty in the final result. Finally, say which assumption you would check first if the measured time disagreed with the prediction, and why that one matters most.";
if (LONG.length < 400) throw new Error("ICK5 AC6 body is under 400 chars");
const FILE = { v: 1, problems: [
  { code: "PSY_T51", type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md: LONG }] },
  { code: "PSY_T52", type: "proof", how: "Say it in your own words.", body: [{ type: "text", md: "Maya must pick a phone this week and has time to read about each one. Leo does not care and is tired. Both see the same ad. Predict who is moved more by strong facts and who by a famous star. Explain why." }],
    proof: { reference: "Maya is motivated and able, so she uses the central route. Leo is low in motivation and ability, so he uses the peripheral route.", must: ["central route for Maya", "peripheral route for Leo"], hint: "QUACK. Who is ready to think hard?" } },
  { code: "PSY_T53", type: "text", answer: "yes", accept: ["true"], how: "Type yes or no.", body: [{ type: "text", md: "Is the number 4 even?" }] },
] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
async function fresh(ui, vp) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);   // flag only: no diet cookie, so sugar
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ick5.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_T51" && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
  return { ctx, page };
}
const go = async (page, code) => { await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => (document.querySelector("#pcode")?.textContent || "") === c && (document.querySelector("#q")?.textContent || "").length > 20, code, { timeout: 8000 }); await settled(page); };
const geo = page => page.evaluate(() => {
  const b = document.getElementById("cluckBtn"), p = document.getElementById("problem");
  if (!b || !p) return null;
  const br = b.getBoundingClientRect(), pr = p.getBoundingClientRect(), cs = getComputedStyle(b), pcs = getComputedStyle(p), px = v => parseFloat(v) || 0;
  const svg = b.querySelector("svg"), use = b.querySelector("svg use"), cbt = b.querySelector(".cb-t"), sr = svg && svg.getBoundingClientRect(), cr = cbt && cbt.getBoundingClientRect();
  return { parent: b.parentElement.id, pos: cs.position, flt: cs.cssFloat || cs.float, w: br.width, h: br.height, l: br.left, r: br.right, t: br.top, b: br.bottom,
    bg: cs.backgroundColor, shadow: cs.boxShadow, btw: px(cs.borderTopWidth),
    rad: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px),
    cb: { r: pr.right - px(pcs.paddingRight) - px(pcs.borderRightWidth), t: pr.top + px(pcs.paddingTop) + px(pcs.borderTopWidth) },
    aria: b.getAttribute("aria-disabled"), label: b.getAttribute("aria-label"), inbox: b.classList.contains("cb-inbox"), inProof: !!b.closest("#q .ff.proof"),
    href: use && (use.getAttribute("href") || use.getAttribute("xlink:href")), symbol: !!document.getElementById("i-duck-line"),
    ico: sr && { w: sr.width, h: sr.height, color: getComputedStyle(svg).color }, cbt: cbt ? { w: cr.width, h: cr.height } : null };
});
const look = page => page.evaluate(() => { const b = document.getElementById("cluckBtn"), cs = getComputedStyle(b), px = v => parseFloat(v) || 0;
  return { aria: b.getAttribute("aria-disabled"), bg: cs.backgroundColor, shadow: cs.boxShadow, btw: px(cs.borderTopWidth),
    rad: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px) }; });
const TANGERINE = "rgb(255, 166, 62)", INK = "rgb(2, 4, 13)", near = (a, b, d) => Math.abs(a - b) <= d;
async function card(page, vp) {
  await step(`${vp} AC1: #cluckBtn child of #problem, not fixed, float right`, async () => {
    const g = await geo(page); assert.ok(g, "no #cluckBtn"); assert.equal(g.parent, "problem", "parent is not #problem");
    assert.notEqual(g.pos, "fixed", "position is still fixed"); assert.equal(g.flt, "right", `computed float is ${g.flt}`);
  });
  await step(`${vp} AC2: 44x44, --ick5-size drives it (56 -> 56x56)`, async () => {
    let g = await geo(page); assert.ok(near(g.w, 44, .5) && near(g.h, 44, .5), `default box ${g.w}x${g.h}`);
    await page.evaluate(() => document.documentElement.style.setProperty("--ick5-size", "56px"));
    try { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); g = await geo(page);
      assert.ok(near(g.w, 56, .5) && near(g.h, 56, .5), `--ick5-size:56px -> ${g.w}x${g.h}`); }
    finally { await page.evaluate(() => document.documentElement.style.removeProperty("--ick5-size")); }
  });
  await step(`${vp} AC3: right edge = content right (+-1.5), top = content top (+-3)`, async () => {
    const g = await geo(page); assert.ok(g, "no #cluckBtn");
    assert.ok(near(g.r, g.cb.r, 1.5), `right ${g.r} vs content right ${g.cb.r}`); assert.ok(near(g.t, g.cb.t, 3), `top ${g.t} vs content top ${g.cb.t}`);
  });
  await step(`${vp} AC4: tangerine both states, no shadow, no top border, four equal corners`, async () => {
    const check = (s, when) => { assert.equal(s.bg, TANGERINE, `${when}: background ${s.bg}`); assert.equal(s.shadow, "none", `${when}: box-shadow ${s.shadow}`);
      assert.equal(s.btw, 0, `${when}: border-top-width ${s.btw}`); assert.ok(s.rad.every(x => x > 0 && near(x, s.rad[0], .01)), `${when}: radii ${s.rad.join(" ")}`); };
    await settled(page, "#cluckBtn"); const a = await look(page); assert.equal(a.aria, null, "Nov 22: ready before the first try (no first state)"); check(a, "ready");
    /* synth off (data-st + aria-disabled) keeps the same tangerine look */
    const was = await page.evaluate(() => { const b = document.getElementById("cluckBtn"); return { st: b.dataset.st, ad: b.getAttribute("aria-disabled") }; });
    await page.evaluate(() => { const b = document.getElementById("cluckBtn"); b.dataset.st = "off"; b.setAttribute("aria-disabled", "true"); });
    try { await settled(page, "#cluckBtn"); check(await look(page), "aria-disabled=true"); }
    finally { await page.evaluate(w => { const b = document.getElementById("cluckBtn"); if (w.st === undefined) delete b.dataset.st; else b.dataset.st = w.st;
      if (w.ad === null) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", w.ad); }, was); }
  });
  await step(`${vp} AC5: duck-line icon 24x24 in --page, hidden label, name Ask Cluck`, async () => {
    const g = await geo(page); assert.ok(g, "no #cluckBtn"); assert.equal(g.href, "#i-duck-line", `svg use href ${g.href}`);
    assert.equal(g.symbol, true, "index.html has no <symbol id=\"i-duck-line\">"); assert.ok(g.ico && near(g.ico.w, 24, .5) && near(g.ico.h, 24, .5), `svg box ${g.ico && g.ico.w}x${g.ico && g.ico.h}`);
    assert.equal(g.ico.color, INK, `icon color ${g.ico.color}`); assert.ok(g.cbt && g.cbt.w <= 1 && g.cbt.h <= 1, `the label box is visible: ${g.cbt && g.cbt.w}x${g.cbt && g.cbt.h}`);
    assert.equal(g.label, "Ask Cluck", `aria-label ${g.label}`);
  });
  await step(`${vp} AC6: wraps around it (no overlap, back under); absolute probe overlaps`, async () => {
    const measure = () => page.evaluate(() => {
      const b = document.getElementById("cluckBtn"), blocks = document.querySelector("#problem .blocks");
      const el = [...blocks.children].find(e => (e.textContent || "").trim().length > 20 && e.getClientRects().length);
      if (!el) return null;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rg = document.createRange(), lines = [];
      for (let n; (n = w.nextNode());) { if (!n.nodeValue || !n.nodeValue.trim()) continue; rg.selectNodeContents(n);
        for (const x of rg.getClientRects()) if (x.width > 1 && x.height > 1) lines.push({ l: x.left, r: x.right, t: x.top, b: x.bottom }); }
      const br = b.getBoundingClientRect();
      return { chars: (el.textContent || "").trim().length, btn: { l: br.left, t: br.top, b: br.bottom, gap: parseFloat(getComputedStyle(b).marginLeft) || 0 }, lines };
    });
    const m = await measure(); assert.ok(m, "no text block in #problem .blocks"); assert.ok(m.chars >= 400, `text block only ${m.chars} chars`); assert.ok(m.lines.length >= 3, `only ${m.lines.length} line boxes`);
    const over = m.lines.filter(l => l.b > m.btn.t + .5 && l.t < m.btn.b - .5), bad = over.filter(l => l.r > m.btn.l + .5);
    assert.equal(bad.length, 0, `${bad.length}/${over.length} line boxes overlap the button: ${JSON.stringify(bad.slice(0, 2))}`);
    assert.ok(m.lines.some(l => l.t >= m.btn.b - .5 && l.r > m.btn.l - m.btn.gap + .5), "no line box below the button reaches past the float column (btn.l - gap), i.e. back under it: " + JSON.stringify({ vp: JSON.stringify(page.viewportSize()), btn: m.btn, lines: m.lines.map(l => [l.l, l.r, l.t, l.b].map(Math.round)) }));
    const probe = await page.addStyleTag({ content: "#cluckBtn{position:absolute!important;float:none!important;top:20px!important;right:16px!important;left:auto!important;bottom:auto!important;margin:0!important}" });
    try { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); const p = await measure();
      assert.ok(p.lines.some(l => l.b > p.btn.t + .5 && l.t < p.btn.b - .5 && l.r > p.btn.l + .5), "counter-example: absolute top-right did NOT overlap (this check would not catch it)"); }
    finally { await probe.evaluate(e => e.remove()); }
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
  });
}
const sample = page => page.evaluate(() => {
  const gen = window.__sg = (window.__sg || 0) + 1; window.__samples = []; const t0 = performance.now();
  const tick = () => { if (window.__sg !== gen) return; const b = document.getElementById("cluckBtn");
    window.__samples.push({ t: Math.round(performance.now() - t0), n: b ? b.getAnimations().length : 0, inbox: !!b && b.classList.contains("cb-inbox") });
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
/* read only once the sampler's own rAF tick has logged a cb-inbox frame: under reduced motion the move is instant, so inbox() could resolve
   and the read land before that tick ran (AC7 reduce "no frame saw cb-inbox", ~1 run in 8) */
const samples = async page => { await page.waitForFunction(() => (window.__samples || []).some(x => x.inbox), null, { timeout: 3000 }).catch(() => {}); return page.evaluate(() => window.__samples || []); };
const inbox = page => page.waitForFunction(() => { const b = document.getElementById("cluckBtn"); return !!b && b.classList.contains("cb-inbox") && !!b.closest("#q .ff.proof"); }, null, { timeout: 8000 });
const onCard = page => page.waitForFunction(() => { const b = document.getElementById("cluckBtn"); return !!b && b.parentElement && b.parentElement.id === "problem" && !b.classList.contains("cb-inbox"); }, null, { timeout: 8000 });
const anims = page => page.evaluate(() => document.getElementById("cluckBtn").getAnimations().length);
const win = (s, k) => s.filter(x => x.t >= k && x.t <= k + 50);
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
try {
  const ph = await fresh(true, { width: 390, height: 844 });
  await card(ph.page, "390");
  await step("390 AC7: proof typing -> inside #q .ff.proof, cb-inbox 56x56, one animation in 50 ms, none at 600 ms", async () => {
    await go(ph.page, "PSY_T52"); const g0 = await geo(ph.page); assert.equal(g0 && g0.parent, "problem", "the button does not start on the card");
    await sample(ph.page); await ph.page.locator("#q .ff.proof .ans").focus(); await inbox(ph.page);
    let g = await geo(ph.page); assert.equal(g.inProof, true, "not inside #q .ff.proof"); assert.equal(g.inbox, true, "no cb-inbox class");
    const s = await samples(ph.page), first = s.find(x => x.inbox); assert.ok(first, "no frame saw cb-inbox");
    assert.ok(Math.max(...win(s, first.t).map(x => x.n)) >= 1, `no animation within 50 ms of the move (${JSON.stringify(win(s, first.t).slice(0, 5))})`);
    await ph.page.waitForTimeout(650);   // keep: the AC's 600 ms window
    assert.equal(await anims(ph.page), 0, "still animating 600 ms after the move"); g = await geo(ph.page);
    assert.ok(near(g.w, 56, .5) && near(g.h, 56, .5), `in-box box ${g.w}x${g.h}`);
  });
  await step("390 AC7 reduce: the same move plays no animation", async () => {
    await ph.page.emulateMedia({ reducedMotion: "reduce" }); await ph.page.waitForFunction(() => matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 3000 });
    await ph.page.evaluate(() => document.activeElement.blur()); await onCard(ph.page);
    await ph.page.waitForFunction(() => document.getElementById("cluckBtn").getAnimations().length === 0, null, { timeout: 3000 });
    await sample(ph.page); await ph.page.locator("#q .ff.proof .ans").focus(); await inbox(ph.page);
    const s = await samples(ph.page), first = s.find(x => x.inbox); assert.ok(first, "no frame saw cb-inbox (reduced)");
    assert.equal(Math.max(0, ...win(s, first.t).map(x => x.n)), 0, `reduced motion played an animation (${JSON.stringify(win(s, first.t).slice(0, 5))})`);
  });
  await step("390 AC8: blur -> child of #problem, 44x44, no cb-inbox, an animation on the way back", async () => {
    await ph.page.emulateMedia({ reducedMotion: "no-preference" }); await ph.page.waitForFunction(() => !matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 3000 });
    await ph.page.locator("#q .ff.proof .ans").focus(); await inbox(ph.page);
    await ph.page.waitForFunction(() => document.getElementById("cluckBtn").getAnimations().length === 0, null, { timeout: 3000 });
    await sample(ph.page); await ph.page.evaluate(() => new Promise(r => requestAnimationFrame(r))); await ph.page.evaluate(() => document.activeElement.blur()); await onCard(ph.page);
    await ph.page.waitForFunction(() => { const s = window.__samples || []; return s.some((x, i) => i > 0 && s[i - 1].inbox && !x.inbox); }, null, { timeout: 2000 });
    const s = await samples(ph.page), k = s.findIndex((x, i) => i > 0 && s[i - 1].inbox && !x.inbox); assert.ok(k > 0, "no frame saw the move back to the card");
    assert.ok(Math.max(...win(s, s[k].t).map(x => x.n)) >= 1, `no animation within 50 ms of the move back (${JSON.stringify(win(s, s[k].t).slice(0, 5))})`);
    await ph.page.waitForFunction(() => document.getElementById("cluckBtn").getAnimations().length === 0, null, { timeout: 3000 });
    const g = await geo(ph.page); assert.equal(g.parent, "problem", "not back on the card"); assert.ok(near(g.w, 44, .5) && near(g.h, 44, .5), `back box ${g.w}x${g.h}`);
    assert.equal(g.inbox, false, "cb-inbox is still set");
  });
  await step("390 AC9: a typed short-answer field keeps the button on the card (no cb-inbox)", async () => {
    await go(ph.page, "PSY_T53"); await ph.page.locator("#q .ff:not(.proof) input").first().focus();
    await ph.page.waitForTimeout(250);   // keep: observation window; a wrong version moves it a task after focus
    const g = await geo(ph.page); assert.equal(g.parent, "problem", `focus moved the button (parent ${g.parent})`); assert.equal(g.inbox, false, "cb-inbox on a non-proof item");
  });
  await ph.ctx.close();
  const dk = await fresh(true, { width: 1280, height: 800 }); await card(dk.page, "1280"); await dk.ctx.close();
  await step("AC10: no ui-v7: the button does not exist or is not tangerine", async () => {
    const off = await fresh(false, { width: 1280, height: 800 });
    try { await off.page.waitForTimeout(300);   // keep: deferred cluckbtn.js mounts after load
      const r = await off.page.evaluate(() => { const b = document.getElementById("cluckBtn");
        return { flag: document.documentElement.classList.contains("ui-v7"), has: !!b, bg: b ? getComputedStyle(b).backgroundColor : null }; });
      assert.equal(r.flag, false, "ui-v7 is on without the flag"); assert.ok(!r.has || r.bg !== TANGERINE, `flag off drew a tangerine #cluckBtn (${r.bg})`);
    } finally { await off.ctx.close(); }
  });
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
