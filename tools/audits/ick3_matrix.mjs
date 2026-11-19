#!/usr/bin/env node
// ICK3 matrix audit (Nov 18 phone review): the REAL app (v7 UI) on many question layouts, in a real browser.
// It boots server/http_server/serve.py on a random port (STEM_BANKS / STEM_TRIES / STEM_TODAY=2026-10-23, the shot.mjs recipe),
// opens /?ui=v7#<CODE> per item, and MEASURES with getBoundingClientRect / Range.getClientRects / getComputedStyle. Never a pixel diff.
// One PASS|FAIL line per check. Exit 1 when a required check fails.
//   node tools/audits/ick3_matrix.mjs [--quick] [--t4] [--banks <dir>] [--out <dir>]
//   --quick  CEH + 2 physics + 2 PSYC items, phone only, no shots (the orc's fast proof)
//   --t4     also run C4 (text wraps around the Check key)
//   --mutate inline-block|clear|hidecard   counter-example probe: a wrong-but-plausible "fix" MUST go red
//              (C1 by display:inline-block+nowrap -> C0 chipOver; C6 by clearing the box -> C6 text; C8 by hiding the card -> C3/C8)
// Keyboard seam (tests/swap.pw.mjs, tests/polish.pw.mjs): focus the field, then page.setViewportSize(W, H*0.55); the app's
// layoutDock sees the visualViewport shrink and sets html.kbup. Down = the full height again. No blur call, no tap (C6).
import { createRequire } from "node:module"; import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs"; import { join, resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire("/opt/node22/lib/node_modules/");
let pw; try { pw = require("playwright"); } catch { pw = createRequire(import.meta.url)("playwright"); }
const HERE = dirname(fileURLToPath(import.meta.url)), STEM = resolve(HERE, "../..");

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const QUICK = argv.includes("--quick"), T4 = argv.includes("--t4");
/* bank dir: --banks > ICK3_BANKS > the Nov 18 ick3 bank set (CEH + old physics + PSYC) when it exists > the repo's banks.
   The brief's PROOF runs with no flag, so the ick3 set has to be reachable without one (the repo's banks/ has PSYC only). */
const ICK3_BANKS = "/tmp/claude-0/-home-user-stem-stuff/486a6774-e844-54c8-b760-6c1a0665ef2a/scratchpad/ick3/banks";
const BANKS = resolve(opt("--banks", process.env.ICK3_BANKS || (existsSync(ICK3_BANKS) ? ICK3_BANKS : join(STEM, "server/data/banks"))));
const OUT = resolve(opt("--out", "/tmp/ick3-shots"));
const MUT = opt("--mutate", "");   // counter-example probe only: never used for the baseline table
const PORT = 8850 + Math.floor(Math.random() * 60), BASE = `http://localhost:${PORT}`;

/* ---- STEP 1 inventory: code | bank | features | answer kind (read from the bank JSON; no feature a bank lacks) ---- */
const ITEMS = [
  { code: "PSY_7AA", bank: "BANK_PSY7", features: "plain one-line text", kind: "mc", quick: 3 },
  { code: "PSY_8AA", bank: "BANK_PSY8", features: "plain one-line text", kind: "typed short answer (text)", quick: 2 },
  { code: "CEH_T2A", bank: "BANK_CEH", features: "short text (3 setup lines) + ask", kind: "mc", quick: 3 },
  { code: "CEH_M2D", bank: "BANK_CEH", features: "inline `code` chip over 2 lines at 390 (struct Node {...}) + code block + ask", kind: "pick-all", quick: 1 },
  { code: "CEH_F2A", bank: "BANK_CEH", features: "long text (12 lines) + code block + 2 inline chips + ask", kind: "pick-all", quick: 3 },
  { code: "PHYS_AUM", bank: "BANK_P2X", features: "long text (13 lines) + KaTeX inline", kind: "mc", quick: 2 },
  { code: "PHYS_EN1", bank: "BANK_P2X", features: "figure BELOW text + KaTeX", kind: "mc", quick: 2 },
  { code: "PHYS_JEA", bank: "BANK_P2X", features: "figure between text blocks (below the setup) + KaTeX", kind: "mc", quick: 3 },
  { code: "PHYS_PZD", bank: "BANK_P2XH", features: "figure BELOW text + KaTeX + 6 lines", kind: "pick-all", quick: 3 },
  { code: "PHYS_LZG", bank: "BANK_P2XN", features: "figure BELOW text + long text + KaTeX", kind: "pick-all", quick: 3 },
  { code: "CEH_R2S", bank: "BANK_CEH", features: "KaTeX inline (divisible by 8) + ask", kind: "proof", proof: true, quick: 1 },
  { code: "CEH_R3T", bank: "BANK_CEH", features: "KaTeX inline + ask", kind: "proof", proof: true, quick: 3 },
  { code: "CEH_R7Y", bank: "BANK_CEH", features: "KaTeX inline (\\dfrac) + ask", kind: "proof", proof: true, quick: 3 },
  { code: "PSY_8PA", bank: "BANK_PSY8", features: "plain one-line question", kind: "proof", proof: true, quick: 2 },
];
/* Feature the banks do not have: table (no md table in any bank), figure ABOVE text (every graph body is text-first; qcard.js build()
   moves .fig after the text), typed `num` (the one num item, PHYS_D78, is pruned in the default sugar mode: saccharine.hide).
   Reported as NONE FOUND, never faked. */
const NONE_FOUND = ["table", "figure ABOVE text", "typed num box (PHYS_D78 is sugar-hidden)"];
const VPS = [{ name: "phone", w: 390, h: 844, dsf: 2 }, { name: "desk", w: 1280, h: 800, dsf: 1 }];
const KB = 0.55;
const FILLER = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: the step assumes the claim holds for n and then shows it still holds when one more term is added.`).join("\n");

const results = [], fails = new Set();
const chk = (id, code, vp, ok, measured, want, num, dir) => {
  const r = { id, code, vp, ok: !!ok, measured, want: String(want), num: typeof num === "number" ? num : null, dir: dir || "max" };
  results.push(r); if (!ok) fails.add(id);
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${code} ${vp} measured=${measured} want=${want}`);
};
const skip = (id, code, vp, why, measured) => console.log(`SKIP ${id} ${code} ${vp} measured=${measured} want=${why}`);

/* ---- boot (shot.mjs recipe) ---- */
if (!existsSync(BANKS)) { console.error(`no bank dir: ${BANKS} (use --banks <dir>)`); process.exit(2); }
mkdirSync(OUT, { recursive: true });   // --quick writes no shots, but the server's tries file lives here
const TRIES = join(OUT, ".tries.json");
const srv = spawn("python3", [join(STEM, "server/http_server/serve.py"), String(PORT)], {
  env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: ["ignore", "ignore", "ignore"] });
const bye = () => { try { srv.kill(); } catch { /* gone */ } };
process.on("exit", bye); process.on("SIGINT", () => { bye(); process.exit(130); });
let up = false;
for (let i = 0; i < 120 && !up; i++) { try { await fetch(BASE + "/"); up = true; } catch { await new Promise(r => setTimeout(r, 250)); } }
if (!up) { console.error("server did not start"); process.exit(2); }

/* ---- in-page measurement (one evaluate per state) ---- */
const MEASURE = () => {
  const R = e => { const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(2), t: +r.top.toFixed(2), r: +r.right.toFixed(2), b: +r.bottom.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const vis = e => { if (!e) return false; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === "none" || c.visibility === "hidden" || +c.opacity === 0 || c.visibility === "collapse") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const alpha = s => { s = String(s || "").trim(); if (!s || s === "transparent" || s === "none") return 0; const m = s.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean); return p.length >= 4 ? +p[3] : 1; } const c = s.match(/\/\s*([\d.]+)\s*\)/); return c ? +c[1] : 1; };
  const layers = s => { const out = []; let d = 0, cur = ""; for (const ch of String(s || "")) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && !d) { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out; };
  const ring = s => { for (const L of layers(s)) { if (alpha(L) <= 0.05) continue; const n = (L.match(/-?[\d.]+px/g) || []).map(parseFloat); const spread = n.length >= 4 ? n[3] : 0; if (/\binset\b/.test(L) || spread >= 1) return L.trim(); } return null; };
  const edges = (el, tag) => { const c = getComputedStyle(el), f = []; for (const s of ["Top", "Right", "Bottom", "Left"]) { const w = parseFloat(c[`border${s}Width`]) || 0; if (w > 0 && alpha(c[`border${s}Color`]) > 0.02) f.push(`${tag} border-${s.toLowerCase()} ${w}px ${c[`border${s}Color`]}`); }
    if (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0 && alpha(c.outlineColor) > 0.02) f.push(`${tag} outline ${c.outlineWidth} ${c.outlineColor}`);
    const rg = ring(c.boxShadow); if (rg) f.push(`${tag} box-shadow ${rg}`); return f; };
  /* text line boxes: Range rects of the text nodes, skipping code/pre/katex/controls */
  const SKIP = "code, pre, .katex, .katex-display, button, input, textarea, .qmeta, .twist-chip, .cb";
  const lines = root => { const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rg = document.createRange(); let n;
    while ((n = w.nextNode())) { if (!n.nodeValue || !n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || el.closest(SKIP)) continue; const c = getComputedStyle(el); if (c.display === "none" || c.visibility === "hidden" || +c.opacity === 0) continue;
      rg.selectNodeContents(n); for (const r of rg.getClientRects()) { if (r.width < 1 || r.height < 1) continue; out.push({ t: +r.top.toFixed(2), b: +r.bottom.toFixed(2), l: +r.left.toFixed(2), r: +r.right.toFixed(2), w: +r.width.toFixed(2) }); } }
    return out; };
  const P = document.getElementById("problem"), B = document.querySelector("#problem .blocks"), vv = window.visualViewport;
  if (!P || !B) return { none: true };
  const pr = R(P), chain = []; for (let n = P; n; n = n.parentElement) { chain.push(n); if (n.id === "freeze") break; }
  const edgeFails = [];
  chain.forEach((n, i) => { const tag = n.id ? "#" + n.id : n.tagName.toLowerCase(); edgeFails.push(...edges(n, tag));
    for (const pe of ["::before", "::after"]) { const c = getComputedStyle(n, pe); if (!c || c.content === "none") continue;
      for (const s of ["Top", "Right", "Bottom", "Left"]) { const w = parseFloat(c[`border${s}Width`]) || 0; if (w > 0 && alpha(c[`border${s}Color`]) > 0.02) edgeFails.push(`${tag}${pe} border-${s.toLowerCase()} ${w}px`); }
      const rg = ring(c.boxShadow); if (rg) edgeFails.push(`${tag}${pe} box-shadow ${rg}`); if (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) edgeFails.push(`${tag}${pe} outline ${c.outlineWidth}`); } });
  /* C1 chips: inline code with 2+ line fragments; chipOver: a chip wider than its text column (display:inline-block can't wrap) */
  const chips = []; let chipOver = 0; const all = lines(B);
  const pc = getComputedStyle(P), colRight = pr.r - (parseFloat(pc.paddingRight) || 0) - (parseFloat(pc.borderRightWidth) || 0);
  for (const c of document.querySelectorAll("#problem .blocks code")) { if (c.closest("pre") || c.closest(".katex")) continue; if (!vis(c)) continue;
    const fr = [...c.getClientRects()].map(r => ({ t: +r.top.toFixed(2), b: +r.bottom.toFixed(2), l: +r.left.toFixed(2), r: +r.right.toFixed(2) }));
    if (!fr.length) continue;
    chipOver = Math.max(chipOver, +(Math.max(...fr.map(f => f.r)) - colRight).toFixed(2));
    if (fr.length < 2) continue; let minGap = Infinity, ov = 0;
    for (let k = 0; k + 1 < fr.length; k++) minGap = Math.min(minGap, fr[k + 1].t - fr[k].b);
    for (const f of fr) { const own = all.slice().sort((a, b) => Math.abs((a.t + a.b) / 2 - (f.t + f.b) / 2) - Math.abs((b.t + b.b) / 2 - (f.t + f.b) / 2))[0];
      if (!own) continue; const above = all.filter(l => l.b <= own.t + 0.5).sort((a, b) => b.b - a.b)[0], below = all.filter(l => l.t >= own.b - 0.5).sort((a, b) => a.t - b.t)[0];
      if (above) ov = Math.max(ov, Math.min(above.b, f.b) - Math.max(above.t, f.t)); if (below) ov = Math.max(ov, Math.min(below.b, f.b) - Math.max(below.t, f.t)); }
    chips.push({ txt: c.textContent.trim().replace(/\s+/g, " ").slice(0, 34), n: fr.length, h: +(fr[0].b - fr[0].t).toFixed(2), lh: getComputedStyle(c.parentElement).lineHeight, gap: +minGap.toFixed(2), ov: +Math.max(0, ov).toFixed(2) }); }
  /* C3 last text line bottom vs the card's border-box bottom */
  const lastB = all.length ? Math.max(...all.map(l => l.b)) : null;
  /* C9 weights (body = the setup paragraph, not the bold ask; n/a when the item is one bold line) */
  const p = [...B.querySelectorAll("p")].find(e => e.textContent.trim() && !e.closest(".qlead, .qmeta") && !e.closest("pre"));
  const opt = document.querySelector("#q .opt .txt"), cod = document.querySelector("#problem .blocks pre code") || document.querySelector("#problem .blocks .md code");
  /* C7 Cluck */
  const q = document.getElementById("q"), nm = e => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("title") || "").trim();
  const clucks = q ? [...q.querySelectorAll("button, [role=button], a[href]")].filter(b => /cluck/i.test(nm(b)) && vis(b)).map(b => { const r = R(b); return { name: nm(b).slice(0, 30), ...r, big: r.w >= 44 && r.h >= 44, inVv: r.l >= -0.5 && r.r <= (vv ? vv.width : innerWidth) + 0.5 && r.t >= (vv ? vv.offsetTop : 0) - 0.5 && r.b <= (vv ? vv.offsetTop + vv.height : innerHeight) + 0.5 }; }) : [];
  const tabEl = P.querySelector(":scope > button.cluckbtn"), tabOn = vis(tabEl), tabR = tabEl ? R(tabEl) : null;
  /* C8 proof box */
  const ta = document.querySelector("#q .ff.proof textarea") || document.querySelector("#q .ff.proof .ans") || document.querySelector("#q textarea#ans"), go = document.getElementById("ansGo");
  let proof = null;
  if (ta) { const sc = ta.closest(".pwrap") || ta, cs = getComputedStyle(sc), tr = R(sc);   // ICK4-WRAP: the div scrolls inside .pwrap; the first VISIBLE line starts at the scroller's top
    proof = { top: tr.t, bottom: tr.b, firstLine: +(tr.t + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0)).toFixed(2),
      val: ta.value.length, go: go ? R(go) : null, goVis: vis(go), font: cs.fontSize + "/" + cs.lineHeight + " w" + cs.fontWeight }; }
  return {
    html: document.documentElement.className, card: { ...pr, cls: P.className }, chain: chain.map(n => n.id || n.tagName.toLowerCase()),
    edges: edgeFails, chips, chipOver, lastB, cardBottom: pr.b,
    w: { body: p ? getComputedStyle(p).fontWeight : null, opt: opt ? getComputedStyle(opt).fontWeight : null, code: cod ? getComputedStyle(cod).fontWeight : null },
    proof, clucks, tab: { on: tabOn, ...(tabR || {}) }, fig: !!document.querySelector("#blocks .fig"),
    scrollW: document.scrollingElement.scrollWidth, iw: innerWidth, cardSW: P.scrollWidth, cardCW: P.clientWidth, blocksSW: B.scrollWidth, blocksCW: B.clientWidth, qlen: (q ? q.textContent.trim().length : 0), blen: B.textContent.trim().length,
    vv: vv ? { h: +vv.height.toFixed(1), top: vv.offsetTop } : null,
  };
};
/* C4 only (--t4): the proof text's line boxes vs the Check key. A text-flow box (contenteditable/div) is measured straight off
   its text nodes. A <textarea> cannot wrap text around anything: its own text area is measured against the key, and a text that
   overflows the box means a line sits in the key's band. */
const LINES4 = () => {
  const box = document.querySelector("#q .ff.proof"), ta = box && box.querySelector("textarea"), go = document.getElementById("ansGo");
  if (!box || !go) return null;
  const key = go.getBoundingClientRect(), raw = [];
  let taHit = null;
  if (ta) {
    const cs = getComputedStyle(ta), br = ta.getBoundingClientRect();
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const cr = { l: br.left + padL, t: br.top + padT, r: br.right - padR, b: br.bottom - padB };
    taHit = { coverW: +Math.max(0, Math.min(cr.r, key.right) - Math.max(cr.l, key.left)).toFixed(1), coverH: +Math.max(0, Math.min(cr.b, key.bottom) - Math.max(cr.t, key.top)).toFixed(1),
      over: ta.scrollHeight > ta.clientHeight + 1, rows: 0 };
    ta.scrollTop = ta.scrollHeight;   // the typing state: the caret is at the end, the box shows its last lines
    const m = document.createElement("div");
    m.style.cssText = `position:fixed;left:-9999px;top:0;width:${Math.max(40, ta.clientWidth - padL - padR)}px;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;font-family:${cs.fontFamily};font-size:${cs.fontSize};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing};font-weight:${cs.fontWeight};font-variant:${cs.fontVariant};padding:0;border:0;margin:0;`;
    m.textContent = ta.value; document.body.appendChild(m); const mr = m.getBoundingClientRect(), rg = document.createRange();
    rg.selectNodeContents(m);
    const y0 = br.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0) - ta.scrollTop - mr.top, x0 = br.left + padL - mr.left;
    for (const r of rg.getClientRects()) { if (r.width < 1) continue; raw.push({ t: r.top + y0, b: r.bottom + y0, l: r.left + x0, r: r.right + x0 }); }
    m.remove();
  } else {
    const sc = box.querySelector(".pwrap"); if (sc) sc.scrollTop = sc.scrollHeight;   // ICK4-WRAP: the typing state, the box shows its last lines
    const w = document.createTreeWalker(box.querySelector(".ans") || box, NodeFilter.SHOW_TEXT), rg = document.createRange(); let n;
    while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) { if (r.width < 1) continue; raw.push({ t: r.top, b: r.bottom, l: r.left, r: r.right }); } }
  }
  /* one box per visual line: cluster rects by their top */
  const rows = [];
  for (const r of raw.sort((a, b) => a.t - b.t || a.l - b.l)) { const row = rows.find(q => Math.abs(q.t - r.t) <= 2); if (row) { row.l = Math.min(row.l, r.l); row.r = Math.max(row.r, r.r); row.b = Math.max(row.b, r.b); } else rows.push({ ...r }); }
  const vr = (ta || box).getBoundingClientRect();
  const out = rows.map(r => ({ t: +r.t.toFixed(1), b: +r.b.toFixed(1), l: +r.l.toFixed(1), r: +r.r.toFixed(1), w: +(r.r - r.l).toFixed(1) }))
    .filter(l => l.b > vr.top + 1 && l.t < vr.bottom - 1);
  if (taHit) taHit.rows = out.length;
  const hit = out.filter(l => Math.min(l.b, key.bottom) - Math.max(l.t, key.top) > 1 && Math.min(l.r, key.right) - Math.max(l.l, key.left) > 1);
  const level = out.filter(l => Math.min(l.b, key.bottom) - Math.max(l.t, key.top) > 1);
  const above = out.filter(l => l.b <= key.top + 1), maxAbove = above.length ? Math.max(...above.map(l => l.w)) : 0;
  const short = level.filter(l => maxAbove >= l.w + 48);
  return { ta: taHit, n: out.length, hit: hit.length, hitW: hit.length ? +Math.max(...hit.map(l => Math.min(l.r, key.right) - Math.max(l.l, key.left))).toFixed(1) : 0, level: level.length, short: short.length,
    levelW: level.length ? +Math.min(...level.map(l => l.w)).toFixed(1) : 0, aboveW: +maxAbove.toFixed(1), key: { t: +key.top.toFixed(1), b: +key.bottom.toFixed(1), l: +key.left.toFixed(1), r: +key.right.toFixed(1) },
    box: { t: +vr.top.toFixed(1), b: +vr.bottom.toFixed(1) }, rows: out.length ? [+out[0].t.toFixed(0), +out[out.length - 1].b.toFixed(0)] : [] };
};

/* ---- one item x viewport ---- */
const errors = [];
const open = async (page, code, vp) => {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto("about:blank");
  await page.goto(`${BASE}/?ui=v7#${code}`, { waitUntil: "load" });
  try { await page.waitForFunction(c => { const e = document.querySelector("#pcode"); return !!e && e.textContent === c && !!document.querySelector("#blocks > *"); }, code, { timeout: 20000 }); }
  catch { console.log(`RENDER MISS ${code} ${vp.name} url=${page.url()} pcode=${await page.evaluate(() => document.querySelector("#pcode")?.textContent)} blocks=${await page.evaluate(() => document.querySelectorAll("#blocks > *").length)}`); }
  await page.waitForFunction(() => { const s = document.querySelector("#splash"); return (!s || s.classList.contains("out")) && !document.body.hasAttribute("aria-busy"); }, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(500);
};
const kbUp = async (page, vp) => { const h = Math.round(vp.h * KB); await page.setViewportSize({ width: vp.w, height: h });
  await page.waitForFunction(h => Math.round(visualViewport ? visualViewport.height : innerHeight) === h, h, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400); };
const kbDown = async (page, vp) => { await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.waitForFunction(h => Math.round(visualViewport ? visualViewport.height : innerHeight) === h, vp.h, { timeout: 8000 }).catch(() => {}); };
const shot = async (page, code, vp, state) => { if (!QUICK) { await page.waitForTimeout(150); await page.screenshot({ path: join(OUT, `${code}-${vp.name}-${state}.png`) }); } };
const cls = page => page.evaluate(() => document.documentElement.className.trim().split(/\s+/).filter(Boolean).sort());
/* counter-example probes (--mutate): each one is a wrong-but-plausible fix that the audit MUST fail */
const mutate = async (page, when) => {
  if (!MUT) return;
  if (MUT === "inline-block" && when === "s1") await page.addStyleTag({ content: "#problem .blocks code{display:inline-block;white-space:nowrap}" });
  if (MUT === "hidecard" && when === "s2") await page.evaluate(() => { const p = document.getElementById("problem"); if (p) p.style.display = "none"; });
  if (MUT === "clear" && when === "s3") await page.evaluate(() => { const t = document.querySelector("#q #ans"); if (t) t.value = ""; });
};

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
/* STEP 2: Firefox once (brain REPO-stem-stuff "Firefox + WebKit locally"). A failed or stalled launch is NOT COVERED, never waited
   on; Chromium is the required engine and the matrix below runs on it. */
try { const t0 = Date.now(), bf = await pw.firefox.launch({ timeout: 90000 }), pf = await bf.newPage();
  await pf.goto(BASE, { timeout: 20000 }); console.log(`# firefox launched (${Math.round((Date.now() - t0) / 1000)}s)`); await bf.close(); }
catch (e) { console.log(`NOT COVERED firefox measured=launch-failed want=the matrix in Firefox (${String(e).split("\n")[0].slice(0, 90)})`); }
const picked = ITEMS.filter(i => (QUICK ? i.quick && i.quick <= 2 : true));
const vps = QUICK ? [VPS[0]] : VPS;
console.log(`# items=${picked.length} viewports=${vps.map(v => v.name).join(",")} banks=${BANKS} out=${QUICK ? "(none)" : OUT} t4=${T4}`);
console.log("## inventory: code | bank | features | answer kind");
for (const it of picked) console.log(`${it.code} | ${it.bank} | ${it.features} | ${it.kind}`);

for (const it of picked) for (const vp of vps) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dsf, hasTouch: vp.name === "phone", isMobile: vp.name === "phone", serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  const page = await ctx.newPage(); errors.length = 0;
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  const T = `${it.code} ${vp.name}`;
  try {
    /* ---- s1 rest ---- */
    await open(page, it.code, vp);
    await mutate(page, "s1");
    const s1 = await page.evaluate(MEASURE);
    await shot(page, it.code, vp, "s1");
    const nonEmpty = !s1.none && s1.blen > 0 && s1.qlen > 0 && s1.card.w > 0 && s1.card.h > 0;
    chk("C0", it.code, vp.name, nonEmpty && !errors.length && s1.scrollW <= s1.iw && s1.chipOver <= 0.5,
      `blocks=${s1.blen} q=${s1.qlen} err=${errors.length} scrollW=${s1.scrollW}/${s1.iw} card=${s1.card.w}x${s1.card.h} chipOver=${s1.chipOver}`, "card visible with text, 0 console errors, no h-scroll, no chip overflow");
    /* not part of C0's rule, printed for the record: the card clips content wider than itself (a figure's authored width on desk) */
    if (s1.cardSW > s1.cardCW + 1) console.log(`WARN C0/cardClip ${it.code} ${vp.name} measured=${s1.cardSW - s1.cardCW}px over (${s1.cardSW}/${s1.cardCW}) want=card content inside its box${s1.fig ? " [figure]" : ""}`);
    if (errors.length) console.log(`  ERRORS ${T} ${errors.join(" | ")}`);
    /* C1 inline code chip */
    if (s1.chips && s1.chips.length) {
      const minGap = Math.min(...s1.chips.map(c => c.gap)), ov = Math.max(...s1.chips.map(c => c.ov));
      chk("C1", it.code, vp.name, minGap >= 1 && ov <= 0, `${Math.max(0, -minGap, ov)} chips=${s1.chips.length} maxOverlapBeyondLine=${ov} minLineGap=${minGap} chipH=${s1.chips[0].h} lineH=${s1.chips[0].lh} "${s1.chips[0].txt}"`, "0px chip-box overlap; line gap >= 1px, none past its own line", Math.max(0, -minGap, ov));
    } else skip("C1", it.code, vp.name, "no wrapping inline code chip", `chips=0`);
    /* C3 card bottom base (pinned = the strip is actually stuck now: .qpinned, not .qpin which only means it may pin) */
    if (s1.card.cls.includes("qpinned") || s1.fig) skip("C3", it.code, vp.name, s1.fig ? "has figure" : "ask actually pinned", `bottom=${+(s1.cardBottom - (s1.lastB || 0)).toFixed(1)} lastB=${s1.lastB} cardB=${s1.cardBottom} cls="${s1.card.cls}"`);
    else { const d = +(s1.cardBottom - s1.lastB).toFixed(1), lim = vp.name === "phone" ? 24 : 32; chk("C3", it.code, vp.name, d >= 12 && d <= lim, d, `12..${lim}px (last text line -> card bottom)`, d); }
    /* C9 weights */
    const w = s1.w, optOk = w.opt == null || w.opt === "400" || w.opt === "600", codeOk = w.code == null || w.code === "400", bodyOk = w.body == null || w.body === "400";
    chk("C9", it.code, vp.name, bodyOk && optOk && codeOk, `body=${w.body ?? "n/a"} opt=${w.opt ?? "n/a"} code=${w.code ?? "n/a"}`, "body 400, option 400 (ICK5 Tony Nov 18; 600 = a short bento tile, bento.css --w-em), code 400");
    /* C7 at rest: no in-box Cluck, edge tab visible */
    chk("C7/s1", it.code, vp.name, s1.clucks.length === 0 && s1.tab.on, `inBox=${s1.clucks.length} tab=${s1.tab.on ? "visible" : "hidden"}`, "in-box cluck absent, edge tab visible");
    /* ---- s2 typing (proof only) ---- */
    if (it.proof) {
      const ta = page.locator("#q .ff.proof textarea, #q .ff.proof .ans, #q textarea#ans").first();
      if (!(await ta.count())) { chk("C5", it.code, vp.name, false, "no proof textarea", "proof box present"); }
      else {
        await ta.tap({ force: true }).catch(async () => { await ta.click({ force: true }); });
        await kbUp(page, vp);
        await ta.fill(FILLER).catch(async () => { await page.keyboard.type(FILLER, { delay: 0 }); });   // 12 lines in one input event (fast typing loses keys on a re-layout)
        await page.waitForTimeout(400);
        /* deterministic typing state: caret at the end (C4 sets the box scroll itself) */
        await page.evaluate(() => { const t = document.querySelector("#q .ff.proof textarea, #q .ff.proof .ans"); if (t) { t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch { /* not a textarea */ } } });
        await page.waitForTimeout(60);
        await mutate(page, "s2");
        const s2 = await page.evaluate(MEASURE);
        await shot(page, it.code, vp, "s2");
        chk("C5", it.code, vp.name, s2.edges.length === 0, s2.edges.length ? s2.edges.slice(0, 3).join(" ; ") : "no edge", "no border/outline/ring on the card and its wrappers to #freeze");
        const big = s2.clucks.filter(c => c.big && c.inVv), kb = s2.html.split(/\s+/).includes("kbup");
        if (vp.name === "phone") chk("C7/s2", it.code, vp.name, big.length >= 1 && !s2.tab.on,
          `inBox=${s2.clucks.length} >=44x44&inVv=${big.length}${s2.clucks[0] ? ` (${s2.clucks[0].w}x${s2.clucks[0].h})` : ""} tab=${s2.tab.on ? "VISIBLE" : "hidden"} kbup=${kb ? 1 : 0}`,
          "one cluck button in #q >=44x44 fully in the visual viewport, edge tab not visible");
        if (s2.proof) { const gap = +(s2.proof.firstLine - s2.cardBottom).toFixed(1);
          if (vp.name === "phone") chk("C8", it.code, vp.name, gap >= 8 && gap <= 16, `${gap} cardB=${s2.cardBottom} lineT=${s2.proof.firstLine} boxT=${s2.proof.top}`, "8..16px (card bottom -> first proof text line)", gap); }
        else chk("C8", it.code, vp.name, false, "no proof box", "8..16px");
        if (T4) { const l4 = await page.evaluate(LINES4), want4 = "no line box intersects #ansGo; a line level with the key is >=48px shorter than a line above";
          if (!l4) chk("C4", it.code, vp.name, false, "no proof box/Check key", want4);
          else chk("C4", it.code, vp.name, l4.hit === 0 && l4.short >= 1,
            `lines=${l4.n} hittingKey=${l4.hit}(w=${l4.hitW}) level=${l4.level} short=${l4.short} levelW=${l4.levelW} aboveW=${l4.aboveW} key=${l4.key.t}-${l4.key.b} box=${l4.box.t}-${l4.box.b} ta=${l4.ta ? `${l4.ta.coverW}x${l4.ta.coverH} over=${l4.ta.over ? 1 : 0}` : "none"}`, want4); }
        /* ---- s3 keyboard gone (phone only): no tap, no blur call ---- */
        if (vp.name === "phone") {
          await kbDown(page, vp);
          await page.waitForTimeout(60); const early = await cls(page);
          await page.waitForTimeout(440); const at500 = await cls(page);            // 500 ms after the viewport came back
          await mutate(page, "s3");
          const text = await page.evaluate(() => (document.querySelector("#q #ans") || {}).value || "");
          const before = s2.proof ? s2.proof.val : FILLER.length;
          /* reference: the same item's normal exit: a REAL click outside the proof box (no viewport change, no blur call).
             The point is scanned inside the card's visible area (never a control, never a scroll); a click that fails to leave
             typing mode is retried once from a lower row, and if it still fails refTyping=1 fails C6 instead of passing it. */
          const tapRef = async dy => {
            const pt = await page.evaluate(dy => {
              const p = document.getElementById("problem"), r = p.getBoundingClientRect(), vv = window.visualViewport;
              const top = vv ? vv.offsetTop : 0, bot = top + (vv ? vv.height : innerHeight), l = Math.max(r.left, 0) + 4, rr = Math.min(r.right, innerWidth) - 4;
              for (let y = Math.max(r.top, top) + 8 + dy; y < Math.min(r.bottom, bot) - 4; y += 10) for (let x = (l + rr) / 2; x < rr; x += 24) {
                const e = document.elementFromPoint(x, y); if (!e || !p.contains(e)) continue;
                if (e.closest("button, a, input, textarea, select, [role=button], #q")) continue; return { x, y }; }
              return null; }, dy);
            if (pt) await page.mouse.click(pt.x, pt.y); else await page.locator("#problem").click({ force: true, position: { x: 6, y: 6 } }).catch(() => {});
            await page.waitForTimeout(400); return { ref: await cls(page), pt };
          };
          let tap = await tapRef(0); if (tap.ref.includes("mt") || tap.ref.includes("kbup")) tap = await tapRef(24);
          const ref = tap.ref, diff = [...new Set([...at500.filter(c => !ref.includes(c)), ...ref.filter(c => !at500.includes(c))])];
          const refTyping = ref.includes("mt") || ref.includes("kbup");
          chk("C6", it.code, vp.name, diff.length === 0 && text.length === before && before > 500 && !refTyping,
            `${diff.length} diff=${diff.length ? diff.join(",") : "none"} early=${early.filter(c => !ref.includes(c)).join("+") || "-"} ref=${ref.filter(c => /^(mt|mt-fit|kbup|dock-away|pad-off|scrolled)$/.test(c)).join("+") || "-"} refTyping=${refTyping ? 1 : 0} tap=${tap.pt ? "card" : "fallback"} text=${text.length}/${before}`,
            "classes = normal-exit classes at 500ms, typed text kept", diff.length);
          await shot(page, it.code, vp, "s3");
          const s3 = await page.evaluate(MEASURE);
          chk("C7/s3", it.code, vp.name, s3.clucks.length === 0 && s3.tab.on, `inBox=${s3.clucks.length} tab=${s3.tab.on ? "visible" : "hidden"}`, "in-box cluck gone, edge tab visible again");
        }
      }
    }
  } catch (e) { chk("C0", it.code, vp.name, false, `audit crashed: ${String(e).split("\n")[0].slice(0, 120)}`, "the audit itself must run"); }
  await ctx.close();
}
await browser.close(); bye();

/* ---- STEP 5 summary ---- */
console.log("\n## summary: check | pass | fail | worst measured");
const ids = [...new Set(results.map(r => r.id))];
for (const id of ids) { const rs = results.filter(r => r.id === id), bad = rs.filter(r => !r.ok).length;
  const nums = rs.map(r => r.num).filter(n => typeof n === "number");
  const worst = nums.length ? (rs[0].dir === "min" ? Math.min(...nums) : Math.max(...nums)) : "-";
  console.log(`${id} | ${rs.length - bad} | ${bad} | ${worst}`); }
console.log(`\nNONE FOUND: ${NONE_FOUND.join(", ")}`);
const ONLY = opt("--only", ""); if (ONLY) for (const f of [...fails]) if (!ONLY.split(",").some(o => f === o || f.startsWith(o + "/"))) fails.delete(f);   // --only C1,C3: the exit code counts these checks only (one slice per coder)
console.log(`RESULT ${fails.size ? "RED" : "GREEN"}: ${fails.size ? [...fails].sort().join(" ") + " failed on current code" : "all checks pass"}`);
console.log(QUICK ? "shots: none (--quick)" : `shots: ${OUT}`);
process.exit(fails.size ? 1 : 0);
