// TRAY ANCHOR + ANSWER-VALUE MARGINS (Tony, Nov 5: "i want the cluck panel to come from under the input box, OVERLAPPING any other element"):
// the "See steps" tray (.vdrawer, Ask Cluck + ^) slides out from under the INPUT box and floats OVER whatever is below it:
//   anchor  typed: the bar .ff that holds the input; choose-all: the choices box (.choices); single mc: the PICKED card (.ch), or the choices box when the picked card is the last one (Tony, Nov 6)
//   edges   (Tony: "the tray shall only go left IFF the form is choose all/tick box, bcs the next button is not convenient. otherwise, all stay at right")
//           choose-all: tray LEFT = anchor left; every other form: tray RIGHT = anchor right (+-1px); tray top = anchor bottom, tucked a few px BEHIND the anchor's border (-8..+2px); the anchor paints above the tray
//   over    elementFromPoint inside the open tray = the tray: it is on top of the verdict line (.ansl), Next, the Cluck card, the choose-all Next row
//   reflow  0: opening / closing the tray moves nothing (.ansl, Next, the next card, #q keep their rects); there is no .vd-room spacer
//   margin  the inline answer value in the .ansl line: gap before the value = gap after it (+-1px)
// 390 phone (touch, dpr 2). Own serve.py + a throwaway bank + a stub OpenRouter.   node tests/tray-anchor.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8889, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "tray-anchor-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const STEM = "Pat makes stacks of cups. The first stack has 5 cups. Each new stack has 2 more cups than the one before it.";
const PROBS = [
  { code: "PHYS_TA1", title: "Stamps", type: "num", answer: "18", tol: 0.01, unit: "cents", how: "A whole number.", body: txt("What is the smallest N cents so that every amount of N cents or more can be made? " + STEM),
    wrong: [{ value: "17", error: "off", hint: "QUACK. Check the amount just below." }], saccharine: { title: "Stamps", key: "Answer: 18", slip: { "17": "One short." } } },
  { code: "PHYS_TA2", title: "Cups", type: "mc", pick: "all", shuffle: false, body: txt(STEM + " Tick all correct options."),
    choices: [{ id: "a", md: "Good base case" }, { id: "b", md: "Good inductive step" }, { id: "c", md: "Good claim" }], correct: ["b"],
    wrong: [{ choice: "a", error: "misread", hint: "QUACK. Look at the base." }], saccharine: { title: "Cups", key: "Tick: b", slip: { a: "The base." } } },
  ...[["PHYS_TA4", "b"], ["PHYS_TA5", "d"]].map(([code, ok]) => ({ code, title: "Five", type: "mc", pick: "one", shuffle: false, body: txt(STEM + " Which is right?"),
    choices: "abcde".split("").map(id => ({ id, md: "Option " + id.toUpperCase() + " with a few more words" })), correct: ok,
    wrong: "abcde".split("").filter(id => id !== ok).map(id => ({ choice: id, error: "misread", hint: "QUACK. Look again." })), saccharine: { title: "Five", key: "Pick: " + ok, slip: Object.fromEntries("abcde".split("").filter(id => id !== ok).map(id => [id, "Slip."])) } })),
  { code: "PHYS_TA3", title: "Pick", type: "mc", pick: "one", shuffle: false, body: txt(STEM + " Which is right?"),
    choices: [{ id: "a", md: "Good base case" }, { id: "b", md: "Good inductive step" }, { id: "c", md: "Good claim" }], correct: ["b"],
    wrong: [{ choice: "a", error: "misread", hint: "QUACK. Look at the base." }], saccharine: { title: "Pick", key: "Pick: b", slip: { a: "The base." } } },
];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_TAA.json"), JSON.stringify({ v: 1, problems: [PROBS[0]] }));
writeFileSync(join(BANKS, "BANK_TAB.json"), JSON.stringify({ v: 1, problems: [PROBS[1]] }));
writeFileSync(join(BANKS, "BANK_TAC.json"), JSON.stringify({ v: 1, problems: [PROBS.find(p => p.code === "PHYS_TA3")] }));
writeFileSync(join(BANKS, "BANK_TAD.json"), JSON.stringify({ v: 1, problems: [PROBS.find(p => p.code === "PHYS_TA4")] }));
writeFileSync(join(BANKS, "BANK_TAE.json"), JSON.stringify({ v: 1, problems: [PROBS.find(p => p.code === "PHYS_TA5")] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Steps. Egg-cellent." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 1800)); }
}
const SETTLE = 600;   // > the drawer's 380 ms slide
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(code, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#" + ({ PHYS_TA1: "BANK_TAA", PHYS_TA2: "BANK_TAB", PHYS_TA3: "BANK_TAC", PHYS_TA4: "BANK_TAD", PHYS_TA5: "BANK_TAE" })[code]);
  try { await page.waitForFunction(() => !document.getElementById("splash") && /^#PHYS_TA/.test(location.hash) && !!document.querySelector("#q .opt, #ff input, #ff textarea"), null, { timeout: 10000 }); } catch (e) { console.log(await page.evaluate(() => location.hash + " " + !!document.getElementById("splash") + " " + document.body.innerText.slice(0, 200))); throw e; }
  return page;
}
/* rects of: the box (typed: #ff, grown to the verdict line's bottom; choose-all: .choices), the tray, Next, the verdict line + its pieces */
const geo = page => page.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
  const q = document.querySelector("#q"), ff = q.querySelector("#ff"), g = q.querySelector(".choices"), ansl = q.querySelector(".ansl");
  const box = ff ? R(ff) : R(g), d = q.querySelector(".vdrawer:not([hidden])"), nx = q.querySelector(".nx");
  const vis = e => e && e.getClientRects().length ? e : null;
  const b = ansl && ansl.querySelector("b, .ansv"), sp = ansl && ansl.querySelector(":scope > span");
  const span = (a, z) => { if (!a || !z) return null; return { b: R(z), sp: R(a) }; };
  const rr = e => R(vis(e));
  return { ff: R(ff), g: R(g), ansl: rr(ansl), b: rr(b), sp: rr(sp), box, d: rr(d), nx: rr(nx), chk: rr(q.querySelector(".chk")), y: scrollY, span: span };
});
const boxBottom = m => Math.max(m.box.bottom, m.ansl ? m.ansl.bottom : 0);
const typeAnswer = async (page, v) => { const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
const trayOpen = page => page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 8000 }).then(() => page.waitForTimeout(SETTLE));
const shot = (page, n) => SHOTS ? page.screenshot({ path: join(SHOTS, n) }) : null;
const near = (a, b, t, what) => assert.ok(Math.abs(a - b) <= t, `${what}: ${a.toFixed(1)} vs ${b.toFixed(1)} (tol ${t})`);

try {
  const prove = async (page, anchorSel, name, side) => {
    await trayOpen(page);
    const pick = () => page.evaluate(aSel => {
      const R = e => { if (!e || !e.getClientRects().length) return "-"; const r = e.getBoundingClientRect(); return [r.left, r.top + scrollY, r.width, r.height].map(x => Math.round(x * 10) / 10).join(","); };
      const q = document.querySelector("#q"), a = q.querySelector(aSel), d = q.querySelector(".vdrawer:not([hidden])");
      const r = e => { const k = e.getBoundingClientRect(); return { left: k.left, right: k.right, top: k.top + scrollY, bottom: k.bottom + scrollY }; };
      return { a: r(a), d: d ? r(d) : null, rooms: document.querySelectorAll(".vd-room").length,
        flow: [".ansl", ".nx", ".chk", "#preview"].map(s => R(q.querySelector(s))).concat([R(q), R(q.nextElementSibling), R(q.parentElement), String(document.documentElement.scrollHeight)]).join("|") };
    }, anchorSel);
    const m = await pick();
    await shot(page, name);
    assert.ok(m.d, "an open tray");
    if (side === "left") near(m.d.left, m.a.left, 1, "tray left vs anchor left (choose-all: the tray goes left, Next is on the right)");
    else near(m.d.right, m.a.right, 1, "tray right vs anchor right (every form but choose-all: the tray stays right)");
    assert.ok(m.d.top >= m.a.bottom - 8 && m.d.top <= m.a.bottom + 2, `tray top ${m.d.top.toFixed(1)} is not at the anchor bottom ${m.a.bottom.toFixed(1)} (-8..+2)`);
    const hits = await page.evaluate(() => { const d = document.querySelector("#q .vdrawer:not([hidden])"), r = d.getBoundingClientRect(); return [[.15, .6], [.5, .75], [.85, .6]].map(([fx, fy]) => { const e = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return !!e && !!e.closest(".vdrawer"); }); });
    assert.deepEqual(hits, [true, true, true], "elementFromPoint inside the open tray is not the tray (something paints over it)");
    const top = await page.evaluate(sel => { const a = document.querySelector("#q " + sel), r = a.getBoundingClientRect(), d = document.querySelector("#q .vdrawer:not([hidden])"), dr = d.getBoundingClientRect(); const e = document.elementFromPoint(Math.max(r.left, dr.left) + 12, r.bottom - 1); return { in: !!e && a.contains(e), tag: e && (e.tagName + "." + e.className) }; }, anchorSel);
    assert.ok(top.in, "the anchor does not paint above the tray at its bottom border: " + JSON.stringify(top));
    assert.equal(m.rooms, 0, "a .vd-room spacer is in the flow");
    await page.click("#q .vdrawer .vd-x"); await page.waitForTimeout(SETTLE);
    const shut = await pick();
    assert.equal(shut.d, null, "the tray did not close");
    assert.equal(shut.flow, m.flow, "reflow: opening/closing the tray moved something\n open " + m.flow + "\n shut " + shut.flow);
    assert.deepEqual(page.errs, []);
  };
  await step("390 typed right: the tray slides from under the input bar (.ff), right = bar right, paints over the verdict line / Next, reflow 0", async () => {
    const page = await open("PHYS_TA1");
    try {
      await typeAnswer(page, "18");
      await page.waitForSelector("#q .ansl b", { timeout: 6000 });
      await prove(page, "#ff", "ta-typed.png", "right");
    } finally { await page.context().close(); }
  });
  await step("390 choose-all right: the tray slides from under the choices box (LEFT edge = box left), paints over the Next row, reflow 0", async () => {
    const page = await open("PHYS_TA2");
    try {
      await page.click('#q .opt[data-id="b"]');
      await page.click("#q .chk .go, #q #mcGo, #q .chk button");
      await page.waitForSelector("#q .nx", { timeout: 6000 });
      await prove(page, ".choices", "ta-pickall.png", "left");
    } finally { await page.context().close(); }
  });
  await step("390 single mc right (picked card B, not last): the tray slides from under the PICKED card (right edge = card right), paints over what follows, reflow 0", async () => {
    const page = await open("PHYS_TA3");
    try {
      await page.click('#q .opt[data-id="b"]');
      await page.click('#q .ch:has(.opt[data-id="b"]) .send');
      await page.waitForFunction(() => window.__drill.state.tries.length >= 1, null, { timeout: 6000 });
      await prove(page, '.ch:has(.opt[data-id="b"])', "ta-mc.png", "right");
    } finally { await page.context().close(); }
  });
  /* single mc, five options (Tony, Nov 6): the tray hangs under the PICKED card and lies over the cards below it */
  const mc5 = async (code, pickId, width, last) => {
    const page = await open(code, width);
    try { await page.click(`#q .opt[data-id="${pickId}"]`, { timeout: 8000 }); } catch (e) {   // DIAGNOSTIC (CI-only failure: the locator matched nothing for 30 s): say what the page really holds
      const d = await page.evaluate(() => ({ url: location.href, q: window.__drill?.state?.prob?.code, opts: [...document.querySelectorAll("#q .opt")].map(o => o.dataset.id + ":" + (o.textContent || "").trim().slice(0, 30)), body: document.body.innerText.slice(0, 300) }));
      throw new Error(`${code} pick ${pickId} @${width}: ${String(e.message).split("\n")[0]}; page ${JSON.stringify(d)}; pageerrors ${JSON.stringify(page.errs)}`);
    }
    await page.click(`#q .ch:has(.opt[data-id="${pickId}"]) .send`);
    await trayOpen(page);
    const m = await page.evaluate(id => {
      const q = document.querySelector("#q"), cs = [...q.querySelectorAll(".choices > .ch")], row = q.querySelector(`.ch:has(.opt[data-id="${id}"])`), d = q.querySelector(".vdrawer:not([hidden])");
      const r = row.getBoundingClientRect(), dr = d.getBoundingClientRect(), g = q.querySelector(".choices"), gr = g.getBoundingClientRect(), i = cs.indexOf(row);
      const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e; };
      const nx = row.querySelector(".nx, .send"), nr = nx && nx.getClientRects().length ? nx.getBoundingClientRect() : null;
      const nh = nr ? hit(nr.left + nr.width / 2, nr.top + nr.height / 2) : null;
      const below = cs.slice(i + 1).map(c => c.getBoundingClientRect()).filter(c => c.top < dr.bottom - 4 && c.bottom > dr.top + 4);
      const cov = below.map(c => { const y = Math.max(c.top, dr.top) + 6, e = hit(dr.left + dr.width / 2, y); return !!e && !!e.closest(".vdrawer"); });
      const edge = hit(Math.max(r.left, dr.left) + 12, r.bottom - 1);
      return { top: dr.top, bottom: r.bottom, left: dr.left, right: dr.right, rl: r.left, rr: r.right, gb: gr.bottom, gl: gr.left, gr: gr.right, offTop: g.offsetTop + g.offsetHeight, dTopCss: parseFloat(d.style.top), nextOk: nr ? !!nh && !!nh.closest(".nx, .send") : null, cov, nBelow: below.length, edgeInRow: !!edge && row.contains(edge), n: cs.length, i };
    }, pickId);
    return { page, m };
  };
  for (const w of [360, 393, 721, 1280]) for (const [code, pick, what] of [["PHYS_TA4", "b", "right on B"], ["PHYS_TA5", "b", "wrong on B"], ["PHYS_TA5", "c", "wrong on C"]]) {
    await step(`${w} five-option mc, ${what}: the tray hangs under the picked card, over C-E, Next stays hittable`, async () => {
      const { page, m } = await mc5(code, pick, w);
      try {
        near(m.top, m.bottom, 2.6, "tray top vs the picked card's bottom (2px tuck)");
        assert.ok(m.top <= m.bottom + 0.5, `a gap under the picked card: tray ${m.top} card ${m.bottom}`);
        near(m.left, m.rl, 1, "tray left vs picked card left"); near(m.right, m.rr, 1, "tray right vs picked card right");
        assert.ok(m.nBelow >= 1, "the tray overlaps no card below it: " + JSON.stringify(m));
        assert.deepEqual(m.cov, m.cov.map(() => true), "a card below the picked one paints over the tray");
        assert.ok(m.edgeInRow, "the picked card does not paint above the tray at its bottom edge");
        if (m.nextOk !== null) assert.ok(m.nextOk, "Next / the send arrow on the picked card is covered");
        assert.ok(m.top < m.gb - 20, `the tray still hangs from the end of the list: tray ${m.top}, list bottom ${m.gb}`);
        await page.mouse.click(w > 500 ? 5 : 3, 3); await page.waitForTimeout(SETTLE);
        assert.equal(await page.locator("#q .vdrawer:not([hidden])").count(), 0, "a tap outside did not close the tray");
      } finally { await page.context().close(); }
    });
  }
  await step("390 five-option mc, wrong on the LAST card (E): the tray hangs from the list end exactly as before (box = .choices)", async () => {
    const { page, m } = await mc5("PHYS_TA5", "e", 390);
    try {
      assert.equal(m.dTopCss, m.offTop - 2, "the tray top is not the list's offset bottom - 2px: " + JSON.stringify(m));
      near(m.top, m.gb, 2.6, "tray top vs the list bottom"); near(m.left, m.gl, 1, "tray left vs list left"); near(m.right, m.gr, 1, "tray right vs list right");
    } finally { await page.context().close(); }
  });
  await step("390 typed right: the gap before the answer value = the gap after it (+-1px)", async () => {
    const page = await open("PHYS_TA1");
    try {
      await typeAnswer(page, "18");
      await page.waitForSelector("#q .ansl b", { timeout: 6000 });
      await page.waitForTimeout(SETTLE);
      await shot(page, "ta-ansl.png");
      const g = await page.evaluate(() => {
        const l = document.querySelector("#q .ansl"), v = l.querySelector(".ansv, :scope > b"), b = v.querySelector("b") || v, u = l.querySelector(".ansu");
        const ink = (el, last) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, out = null; while ((n = w.nextNode())) { if (!n.data.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); const rs = [...r.getClientRects()]; const k = last ? rs[rs.length - 1] : rs[0]; if (last || !out) out = k; } return out; };
        const sent = [...l.children].find(c => c.tagName === "SPAN" && /answer is/i.test(c.textContent));
        const w = document.createRange(), wt = ink(sent, true);
        // trim the spaces off each side of the value's ink: the value's own glyphs (the green <b>, its nbsp stripped)
        const rb = document.createRange(); rb.selectNodeContents(b);
        const bt = [...rb.getClientRects()]; const val = { left: Math.min(...bt.map(x => x.left)), right: Math.max(...bt.map(x => x.right)) };
        return { wordsRight: wt.right, vLeft: val.left, vRight: val.right, unitLeft: u ? ink(u, false).left : null, text: l.textContent };
      });
      if (process.env.TA_PROBE) console.log(await page.evaluate(() => { const v = document.querySelector("#q .ansv"); return [...v.childNodes].map(n => n.nodeType + JSON.stringify(n.data || n.className) + JSON.stringify((() => { const r = document.createRange(); r.selectNode(n); return [...r.getClientRects()].map(x => [x.left, x.width]); })())).join("|") + " ws=" + getComputedStyle(v).whiteSpace + " wsp=" + getComputedStyle(v).wordSpacing; }));
      if (process.env.TA_PROBE) console.log("PSEUDO", await page.evaluate(() => { const v = document.querySelector("#q .ansv"), c = getComputedStyle(v, "::before"), a = getComputedStyle(v.parentElement); return JSON.stringify([c.content, c.fontSize, c.fontFamily, c.fontWeight, c.letterSpacing, c.whiteSpace, c.display, c.width, a.gap, getComputedStyle(v).marginLeft, a.fontSize]); }));
      if (false) console.log(JSON.stringify(g), await page.evaluate(() => [...document.querySelectorAll("#q .ansl *")].map(e => e.tagName + "." + e.className + " " + JSON.stringify(e.getBoundingClientRect().toJSON()) + getComputedStyle(e).fontFamily.slice(0,20) + getComputedStyle(e).fontWeight + getComputedStyle(e).letterSpacing).join("\n")));
      assert.equal(g.unitLeft != null, true, "the unit follows the value: " + g.text);
      const before = g.vLeft - g.wordsRight, after = g.unitLeft - g.vRight;
      assert.ok(Math.abs(before - after) <= 1, `gap before the value ${before.toFixed(1)}px vs after ${after.toFixed(1)}px (${g.text})`);
    } finally { await page.context().close(); }
  });
} finally { await browser.close(); srv.kill(); stub.close(); }
console.log(failures ? `${failures} failing` : "all ok");
process.exit(failures ? 1 : 0);
