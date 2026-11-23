// SKELETON-SPLASH generator: measures the REAL v7 question page with the vendored auto-skeleton core (client/vendor/auto-skeleton.js)
// at each viewport bucket and rewrites the launch splash in index.html (between the SK:css / SK:html markers) as STATIC markup + CSS,
// so the skeleton paints before any file loads. Also writes the raw layouts: tools/build_and_ship/splash_skeleton.layouts.json.
//
//   python3 server/http_server/serve.py 8812 &      node tools/build_and_ship/splash_skeleton.mjs http://localhost:8812 [CODE]
//   (--check = measure and print block counts only, no writes). Re-run when the v7 card / top bar / tile CSS changes.
//
// Buckets: phone (<= 600 px wide, measured 390x844), tablet (601..1099, 768x1024), desk (>= 1100, 1280x800). The desk + brainrot-open layout is measured
// too but only kept in the JSON: whether brainrot shows depends on the question (sugar layer), unknown at splash time.
// Honest limits: (1) the answer tiles are the bento of ONE random load (its shape depends on the question), so after the swap the answer area re-flows;
// (2) the Cluck pane's real empty state is one 404 note, so GENERIC_CHAT below injects a chat-shaped stand-in (avatar + text lines + composer) into the
//     live DOM before measuring: that is placeholder shape, never shipped as content; (3) blocks are horizontal-scaled to the viewport width by 4 lines of inline JS.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = (process.argv.find(a => /^https?:/.test(a)) || "http://localhost:8812").replace(/\/$/, "");
const CODE = process.argv.find((a, i) => i > 1 && /^[A-Z0-9_]+$/.test(a)) || "CSCI26_C2A";
const CHECK = process.argv.includes("--check");
const LIB = readFileSync(join(ROOT, "client/vendor/auto-skeleton.js"), "utf8");
const OPTS = { textScale: 0.5, mergeGap: 12, maxBlocks: 200 };   // Tony Nov 22: thinner bars (0.5)
const BUCKETS = [   // key, width, height, brainrot open, ships inline
  ["phone", 390, 844, 0, 1], ["tablet", 768, 1024, 0, 1], ["desk", 1280, 800, 0, 1], ["desk-rot", 1280, 800, 1, 0]];

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const layouts = {};
for (const [key, w, h, rot] of BUCKETS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", hasTouch: w < 500, isMobile: w < 500 });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const x of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + x, "9"); } catch { /* blocked */ } });
  await ctx.route(/youtube|ytimg|googlevideo|posthog|clarity/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?ui=v7#${CODE}`);
  await page.waitForSelector("#q"); await page.waitForFunction(() => !document.querySelector("#splash"));
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
  if (rot) { await page.evaluate(() => { window.stemBrainrotWanted = () => true; window.stemBrainrot.sync(); }); await page.waitForTimeout(2500); }
  await page.addScriptTag({ content: LIB });
  layouts[key] = await page.evaluate(({ o, rot }) => {
    const A = (sel, v) => document.querySelectorAll(sel).forEach(e => e.setAttribute("data-auto-skeleton", v));
    /* GENERIC_CHAT: the live Cluck pane holds one 404 note when the item has no layer; stand a chat-shaped placeholder in so the skeleton has a pane to show */
    const bd = document.querySelector("#cluck .cl-bd");
    if (bd && bd.getBoundingClientRect().width > 0) {
      const note = bd.querySelector(".cl-note"); if (note) note.style.display = "none";
      const msgs = [["Nice try. The NOT flips A first, so what does the OR see on its top input? Think about it before the gate combines both wires.", "Then walk B in. Which of the options keeps that exact order of operations?"],
        ["Look at the symbol at the left of the figure. The small circle on the tip of the triangle means invert.", "Write the output as a sentence, then match it to an option. Short and plain is fine.", "Check each tile against that sentence."],
        ["Good. That is the one.", "It reads: not A, or B."]];
      const m = document.createElement("div"); m.style.cssText = "padding:12px 24px 0;display:flex;flex-direction:column;gap:22px";
      (rot ? [msgs[2], msgs[0]] : msgs).forEach(g => {
        const r = document.createElement("div"); r.style.cssText = "display:flex;gap:12px;align-items:flex-start";
        const av = document.createElement("span"); av.style.cssText = "flex:none;width:32px;height:32px;border-radius:50%;background:rgb(34,28,22)";
        const t = document.createElement("div"); t.style.cssText = "flex:1;font:15px/22px system-ui;display:flex;flex-direction:column;gap:10px";
        g.forEach(s => { const q = document.createElement("p"); q.style.margin = "0"; q.textContent = s; t.appendChild(q); }); r.append(av, t); m.appendChild(r);
      });
      bd.appendChild(m);
      const c = document.createElement("div"); c.id = "skComposer"; c.style.cssText = "position:absolute;left:20px;right:20px;bottom:20px;height:52px;border-radius:26px;background:rgb(34,28,22);display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 20px";
      c.innerHTML = '<span style="font:15px system-ui">Ask Cluck a follow-up</span><button style="width:36px;height:36px;border-radius:50%;border:0;background:rgb(34,28,22)"></button>';
      bd.style.position = "relative"; if (!rot) bd.style.minHeight = "563px"; bd.appendChild(c);
    }
    /* noise: fixed overlays, probes, screen-reader text, the faint ghost numeral, figure labels, the live-region dots */
    A("#qlDim,#toast,#ver,#privacy,#padFab,#sr,.mc-probe,.cl-dim,.pad-fab,.sash,.qghostbox,.sr-only,.fig svg,.cl-dot,.fig .lbl,.rot .world .duo.dupe,.rot .ctl", "skip");
    A(".fig", "descend"); A(".rot .vid", "block");
    for (const e of document.body.children) { const r = e.getBoundingClientRect(); if (r.x < -500 || (e.tagName === "DIV" && r.width === 0)) e.setAttribute("data-auto-skeleton", "skip"); }
    /* cards are blocks first (one fill, no sweep); then each is re-measured with descend and its inner bars merged in */
    const cards = ["#problem", "#cluck", "#skComposer"].filter(s => document.querySelector(s) && document.querySelector(s).getBoundingClientRect().width > 0);
    A(cards.join(","), "block");
    const L = AutoSkeleton.measure(document.body, o);
    const pane = document.querySelector("#cluck"), PR = pane && pane.getBoundingClientRect();
    L.blocks.forEach(k => { if (cards.length) k.tone = ""; });
    for (const s of cards) {
      const el = document.querySelector(s); el.setAttribute("data-auto-skeleton", "descend"); const r = el.getBoundingClientRect();
      AutoSkeleton.measure(el, o).blocks.forEach(k => { k.x += r.x; k.y += r.y; L.blocks.push(k); });
      el.setAttribute("data-auto-skeleton", "block");
    }
    /* the figure: its drawn ink as one soft block (the svg box itself is the full card width) */
    const ink = [...document.querySelectorAll(".fig svg > *")].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
    if (ink.length) { const x0 = Math.min(...ink.map(r => r.left)) - 6, y0 = Math.min(...ink.map(r => r.top)) - 6, x1 = Math.max(...ink.map(r => r.right)) + 6, y1 = Math.max(...ink.map(r => r.bottom)) + 6; L.blocks.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, radius: "12px", kind: "media" }); }
    /* brainrot shelf: clip the scrolled tiles to the visible shelf, turn the "Hide curated brainrot" button into a text bar */
    const sh = document.querySelector("#rot .shelf");
    if (sh) {
      const R = sh.getBoundingClientRect();
      L.blocks = L.blocks.filter(k => {
        if (k.kind === "control" && Math.abs(k.width - 149) < 2 && k.y < R.top) { Object.assign(k, { kind: "text", x: 1260 - 122, y: 95, width: 122, height: 13, radius: "4px" }); return true; }
        if (k.kind === "text" || k.kind === "control" || k.x < R.left - 1 || k.width < 80 || k.width > 210 || k.height > 110 || k.radius === "20px" || k.y > R.bottom) return true;
        const y1 = Math.max(k.y, R.top), y2 = Math.min(k.y + k.height, R.bottom); if (y2 - y1 < 8) return false; k.y = y1; k.height = y2 - y1; return true;
      });
    }
    /* tones: how each block is painted (card = #0d142a no sweep; pane = Cluck brown no sweep; field = darker brown composer; warm = bars inside the pane) */
    const inPane = k => PR && PR.width > 0 && k.x >= PR.left - 1 && k.x < PR.right && k.y >= PR.top - 1 && k.y < PR.bottom;
    L.blocks.forEach(k => {
      if (PR && PR.width > 0 && Math.abs(k.x - PR.left) < 1.5 && Math.abs(k.y - PR.top) < 1.5 && Math.abs(k.width - PR.width) < 2) k.tone = "pane";
      else if (k.radius === "26px" && k.width > 300 && k.height < 60) k.tone = "field";
      else if (inPane(k)) k.tone = "warm";
      else if ((k.width > 300 && k.height > 200) || (k.width > 380 && k.height > 300)) k.tone = "card";
    });
    L.blocks.sort((a, b) => a.y - b.y || a.x - b.x);
    L.blocks.forEach(k => { for (const q of ["x", "y", "width", "height"]) k[q] = Math.round(k[q] * 10) / 10; });
    return L;
  }, { o: OPTS, rot });
  layouts[key].blocks = layouts[key].blocks.filter(k => k.y < h); layouts[key].height = h;
  console.log(key.padEnd(9), `${w}x${h}`, layouts[key].blocks.length, "blocks", JSON.stringify(layouts[key].blocks.reduce((a, k) => (a[k.tone || k.kind] = (a[k.tone || k.kind] || 0) + 1, a), {})));
  await ctx.close();
}

/* render the shipped buckets to static markup with the vendored renderSkeleton, in a blank page */
const rp = await (await browser.newContext()).newPage();
await rp.setContent("<!doctype html><html><head></head><body></body></html>"); await rp.addScriptTag({ content: LIB });
const shipped = BUCKETS.filter(b => b[4]).map(b => b[0]);
const out = await rp.evaluate(({ layouts, shipped }) => {
  const html = shipped.map(key => {
    const L = layouts[key], el = AutoSkeleton.renderSkeleton(L, { injectStyles: false, label: "Loading", className: "sk" });
    el.setAttribute("data-b", key); el.setAttribute("data-w", String(L.width));
    [...el.children].forEach((c, i) => { const t = L.blocks[i].tone; if (t) c.classList.add("sk-" + t); c.removeAttribute("aria-hidden"); });
    return el.outerHTML.replace(/ style="([^"]*)"/g, (m, s) => ` style="${s.replace(/ /g, "")}"`);
  }).join("");
  return { html, lib: AutoSkeleton.autoskeletonCSS };
}, { layouts, shipped });
await browser.close();

const CSS = `${out.lib.replace(/\n\s*/g, " ").replace(/\{ /g, "{").replace(/ \}/g, "}")}
#splash { position: fixed; inset: 0; z-index: 100; overflow: hidden; background: #02040d; transition: opacity .2s ease-out;
  --auto-skeleton-color: #141d36; --auto-skeleton-highlight: #29385e; --auto-skeleton-duration: 2s; }   /* --float rest, a dim dawn sweep, 2 s */
#splash.out { opacity: 0; pointer-events: none; }
#splash .sk { display: none; width: 390px; height: 100%; transform-origin: 0 0; animation: sk-in .12s ease-out .12s both; }   /* the first 120 ms stay plain page, then it fades in */
#splash .sk[data-b="phone"] { width: 390px; } #splash .sk[data-b="tablet"] { width: 768px; } #splash .sk[data-b="desk"] { width: 1280px; }
@media (max-width: 600px) { #splash .sk[data-b="phone"] { display: block; } }
@media (min-width: 601px) and (max-width: 1099px) { #splash .sk[data-b="tablet"] { display: block; } }
@media (min-width: 1100px) { #splash .sk[data-b="desk"] { display: block; } }
#splash .sk-card { background-color: #0d142a; } #splash .sk-pane { background-color: rgb(22,17,13); } #splash .sk-field { background-color: rgb(14,10,7); }   /* --card; the Cluck panel's own brown */
#splash .sk-warm { background-color: rgb(42,33,26); --_h: rgb(58,46,36); }   /* warm bars on the brown: no blue on brown */
#splash .sk-card::after, #splash .sk-pane::after, #splash .sk-field::after { display: none !important; }
@keyframes sk-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { #splash { transition: none; } #splash .sk { animation: none; } }`;
const SCALE = `<script>/* stretch the measured blocks sideways to this viewport (the page's columns are fluid; heights stay) */(function(){var a=document.querySelectorAll("#splash .sk"),i,e,s;for(i=0;i<a.length;i++){e=a[i];s=innerWidth/e.getAttribute("data-w");e.style.transform="scaleX("+Math.min(1.5,Math.max(.8,s))+")";}})();</script>`;

if (CHECK) { console.log("check only: html", out.html.length, "bytes, css", CSS.length, "bytes"); process.exit(0); }
writeFileSync(join(ROOT, "tools/build_and_ship/splash_skeleton.layouts.json"), JSON.stringify({ code: CODE, opts: OPTS, layouts }, null, 1) + "\n");
const swap = (s, tag, body) => { const a = s.indexOf(`<!-- SK:${tag}:start -->`), b = s.indexOf(`<!-- SK:${tag}:end -->`); if (a < 0 || b < 0) throw new Error("marker " + tag + " missing"); return s.slice(0, a) + `<!-- SK:${tag}:start -->` + body + s.slice(b); };
let idx = readFileSync(join(ROOT, "index.html"), "utf8");
const cssSwap = (s) => { const a = s.indexOf("/* SK:css:start */"), b = s.indexOf("/* SK:css:end */"); if (a < 0 || b < 0) throw new Error("css marker missing"); return s.slice(0, a) + "/* SK:css:start */\n" + CSS + "\n" + s.slice(b); };
idx = cssSwap(idx);
idx = swap(idx, "html", out.html + SCALE);
writeFileSync(join(ROOT, "index.html"), idx);
console.log("wrote index.html splash:", out.html.length, "bytes of markup,", CSS.length, "bytes of css");
