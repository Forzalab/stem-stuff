// UI audit B (question screen): drives each question kind through idle / ready / wrong / right / out, measures with
// getBoundingClientRect + getComputedStyle, and saves viewport shots. Read-only: no app code is touched.
//   STEM_TRIES=<throwaway file> python3 serve.py 8841 &
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node design/notes/ui-consistency-2026-10-08/B-measure.mjs http://localhost:8841 <shotDir> <jsonOut>
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8841";
const SHOTS = process.argv[3] || "";
const OUT = process.argv[4] || "";
const ONLY = process.argv[5] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* kind -> the code, how a student answers it, one right and one wrong answer */
const KINDS = [
  { k: "mc5",      code: "CALC1_X2P",  type: "mc",    right: "b", wrong: "a", more: ["c"] },
  { k: "mc3",      code: "CSCI26_TFM", type: "mc",    right: "m", wrong: "t", more: ["f"] },
  { k: "mc2",      code: "CSCI26_TF3", type: "mc",    right: "t", wrong: "f", more: [] },
  { k: "all",      code: "CSCI26_A7K", type: "all",   right: ["a", "c"], wrong: ["b"], more: ["d"] },
  { k: "num",      code: "CALC1_T6B",  type: "num",   right: "12", wrong: "7" },
  { k: "numhow",   code: "CSCI26_Z6N", type: "num",   right: "0.25", wrong: "0.6" },
  { k: "text",     code: "CSCI26_Q8C", type: "num",   right: "~q -> ~p", wrong: "q -> p" },
  { k: "multi",    code: "CSCI26_M5V", type: "multi", right: ["14", "11"], wrong: ["7", "11"] },
  { k: "fig-scene", code: "PHYS_F3N",  type: "num",   right: "9.8*(sin(30 deg) - 0.2*cos(30 deg))", wrong: "7" },
  { k: "fig-cart", code: "CALC1_A9R",  type: "num",   right: "9/2", wrong: "7" },
  { k: "fig-mc5",  code: "CSCI26_C2A", type: "mc",    right: "a", wrong: "b", more: ["c"] },
  { k: "fig-mc2",  code: "CSCI26_F5A", type: "mc",    right: "n", wrong: "y", more: [] },
  { k: "fig-multi", code: "CSCI26_T2C", type: "multi", right: ["T", "F", "T", "F"], wrong: ["F", "F", "T", "F"] },
  { k: "snack",    code: "PHYS_F3N", snack: true, type: "num", right: "9.8*(sin(30 deg) - 0.2*cos(30 deg))", wrong: "7" },
].filter(K => !ONLY || ONLY.split(",").includes(K.k));
const VPS = [{ n: "393", w: 393, h: 852, mobile: true, dsf: 2 }, { n: "1280", w: 1280, h: 800, mobile: false, dsf: 1 }];

const STY = ["fontSize", "fontWeight", "lineHeight", "fontFamily", "color", "backgroundColor", "borderTopWidth", "borderTopStyle", "borderTopColor", "borderRadius",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "opacity", "textDecorationLine"];

/* runs in the page: one record per element matching each selector */
const MEASURE = ({ sels, STY }) => {
  const r2 = n => Math.round(n * 100) / 100;
  const rec = (e) => {
    const b = e.getBoundingClientRect(), cs = getComputedStyle(e), s = {};
    for (const p of STY) s[p] = cs[p];
    s.fontFamily = (cs.fontFamily || "").split(",")[0].replace(/"/g, "");
    return { x: r2(b.left), y: r2(b.top + scrollY), w: r2(b.width), h: r2(b.height), r: r2(b.right), b: r2(b.bottom + scrollY), vis: !!(e.offsetParent || cs.position === "fixed") && b.width > 0, s, t: (e.textContent || "").trim().slice(0, 40) };
  };
  const out = { vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, sy: Math.round(scrollY), els: {} };
  for (const [name, sel] of Object.entries(sels)) out.els[name] = [...document.querySelectorAll(sel)].slice(0, 8).map(rec);
  return out;
};
const SELS = {
  freeze: "#freeze", problem: "#problem", pcode: "#pcode", ptitle: "#blocks .ptitle", chip: "#blocks .chg-chip", md: "#blocks .md", mdp: "#blocks .md p", mdkatex: "#blocks .md .katex",
  fig: "#blocks .fig", figsvg: "#blocks .fig svg", lbl: "#blocks .fig .lbl",
  q: "#q", how: "#q .how", choices: "#q .choices", opt: "#q .opt", badge: "#q .opt .badge", txt: "#q .opt .txt", lt: "#q .opt .lt", optsend: "#q .ch .send",
  mcGo: "#mcGo", chk: "#q .chk", ff: "#q .ff", lead: "#q .ff .lead", ans: "#q .ff input", ffsend: "#q .ff .send", vk: "#q .ff .vk", preview: "#q .preview",
  part: "#q .part", mk: "#q .mk", pr: "#q .pr", phint: "#q .phint", pips: "#q .pips", pip: "#q .pips i",
  fb: "#fb", verdict: "#fb .verdict", cluck: ".cluck", cluckp: ".cluck .md",
  qnext: "#qnext", qprev: "#qprev", dock: "#dock", work: "#work", fab: "#padFab", fcard: "#fcard", sash: "#sash",
};

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(vp, K) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dsf, hasTouch: vp.mobile, isMobile: vp.mobile, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", e => console.log("PAGEERROR", K.k, String(e).slice(0, 200)));
  if (K.snack) {
    /* a snack = one constant swapped from a real question: PHYS_F3N with the mass 4.0 -> 2.0 kg (the answer does not depend on it, so the server still grades it) */
    await page.route(`**/p/${K.code}.json`, async r => {
      const real = await (await r.fetch()).json();
      const orig = JSON.parse(JSON.stringify(real.body));
      real.body[0].md = real.body[0].md.replace("4.0\\ \\text{kg}", "2.0\\ \\text{kg}");
      real.snack = true; real.original = { body: orig }; real.title = "Block sliding down a ramp, lighter";
      await r.fulfill({ json: real });
    });
  }
  await page.goto(`${BASE}/#${K.code}`, { waitUntil: "networkidle" });
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), K.code, { timeout: 10000 });
  await wait(900);
  return { ctx, page };
}
async function snap(page, K, vp, state, shoot = true) {
  await wait(450);
  const m = await page.evaluate(MEASURE, { sels: SELS, STY });
  const file = `${K.k}-${state}-${vp.n}.png`;
  const keep = !!SHOTS && shoot;
  if (keep) await page.screenshot({ path: `${SHOTS}/${file}` });
  results.push({ kind: K.k, code: K.code, vp: vp.n, state, shot: keep ? file : null, m });
}
async function act(page, K, which, submit, select = true) {
  const v = which === "right" ? K.right : K.wrong;
  if (K.type === "mc") {
    if (select) await page.click(`#q .opt[data-id="${v}"]`);
    if (submit) await page.click(`#q .ch:has(.opt[data-id="${v}"]) .send`);
  } else if (K.type === "all") {
    if (select) for (const id of v) await page.click(`#q .opt[data-id="${id}"]`);
    if (submit) await page.click("#mcGo");
  } else if (K.type === "num") {
    if (select) await page.fill("#q .ans", v);
    if (submit) await page.click("#ansGo");
  } else if (K.type === "multi") {
    const ins = page.locator("#q .part .ans");
    if (select) for (let i = 0; i < v.length; i++) await ins.nth(i).fill(v[i]);
    if (submit) for (let i = 0; i < v.length; i++) { const g = page.locator(`#go${i}`); if (await g.isVisible()) { await g.click(); await wait(350); } }
  }
  await wait(500);
}

for (const vp of VPS) for (const K of KINDS) {
  { // R: right on the first try
    const { ctx, page } = await open(vp, K);
    await snap(page, K, vp, "idle");
    await act(page, K, "right", false);
    await snap(page, K, vp, "ready-right", false);
    await act(page, K, "right", true, false);
    await snap(page, K, vp, "right");
    await ctx.close();
  }
  { // W: one wrong (a 2-choice mc is then locked)
    const { ctx, page } = await open(vp, K);
    await act(page, K, "wrong", false);
    await snap(page, K, vp, "ready");
    await act(page, K, "wrong", true, false);
    await snap(page, K, vp, "wrong");
    await ctx.close();
  }
  if (!(K.type === "mc" && K.more.length === 0)) { // O: wrong twice -> out of tries
    const { ctx, page } = await open(vp, K);
    await act(page, K, "wrong", true);
    if (K.type === "mc") for (const id of K.more) { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch:has(.opt[data-id="${id}"]) .send`); await wait(500); }
    else if (K.type === "all") { for (const id of K.more) await page.click(`#q .opt[data-id="${id}"]`); await page.click("#mcGo").catch(() => {}); await wait(500); }
    else if (K.type === "num") { await page.fill("#q .ans", "8"); await page.click("#ansGo").catch(() => {}); await wait(500); }
    else if (K.type === "multi") { await page.locator("#q .part .ans").nth(0).fill("8"); const g = page.locator("#go0"); if (await g.isVisible()) await g.click(); await wait(500); }
    await snap(page, K, vp, "out");
    await ctx.close();
  }
  console.log("done", vp.n, K.k);
}
await browser.close();
if (OUT) writeFileSync(OUT, JSON.stringify(results));
console.log("states:", results.length);
