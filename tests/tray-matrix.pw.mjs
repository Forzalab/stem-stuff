// TRAY OVERLAY MATRIX (Tony, Nov 3 19:31 / 19:32): the strip tray may overlay the content below it, but it must not break its neighbours. Per cell
// (width x item type x state): (1) zero reflow of the neighbours when it opens and when it is dismissed (no room kept, none left behind);
// (2) it is never UNDER a sibling (4 points inside it hit the tray: no stale host z, no clipping parent); (3) it never covers the current
// answer / verdict row (only the 8px tuck under it) or the Next control; (4) it stays inside the window; (5) its Ask Cluck takes focus.
// States: wrong + tray open, dismissed, out of tries (MC), the last question. Items: MC, freeform, multi-part field.
// PW_BROWSER=firefox runs it in Firefox (no isMobile there). TM_W=393,1280 picks widths.   node tests/tray-matrix.pw.mjs <port>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8894", BASE = `http://127.0.0.1:${PORT}`;
const W = (process.env.TM_W || "360,393,721,1280").split(",").map(Number);
const tmp = mkdtempSync(join(tmpdir(), "tray-mx-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const HINT = "Which part of gravity pushes along the ramp?";   // the tail of the bank hint (the page dresses it as "quack. (kaomoji) ...")
const PROBS = [1, 2, 3].map(n => ({ code: `CALC1_CVT${n}`, title: `V2 ${n}`, type: "mc", shuffle: false,
  body: txt(`A 2.0 kg block starts from rest and slides 3.0 m down a frictionless ramp tilted at 30 degrees (${n}). How fast is it moving at the bottom?`), correct: "a",
  choices: ["5.4 m/s", "2.7 m/s", "7.7 m/s", "9.8 m/s"].map((md, i) => ({ id: "abcd"[i], md })),
  wrong: [{ choice: "b", error: "half", hint: "QUACK. " + HINT }],
  saccharine: n === 3 ? { title: `V2 ${n}` } : { title: `V2 ${n}`, key: "Tick: a", slip: { b: "Half of it." } } }));   // CV3: no Cluck key
PROBS.push({ code: "CALC1_CVT4", title: "V2 4", type: "num", answer: "42", body: txt("How many students are in the lab (4)?"),
  saccharine: { title: "V2 4", key: "Tick: 42" } });   // a numeric item: the wrong values are free text
PROBS.push({ code: "CALC1_CVT6", title: "V2 6", type: "mc", shuffle: false, correct: "a",
  body: [{ type: "text", md: "The graph shows the force on a block against the ramp angle (6). Which option describes it?" },
    { type: "graph", kind: "cartesian", alt: "force against angle", x: { min: 0, max: 8, step: 1 }, y: { min: 0, max: 5, step: 1 }, marks: [{ mark: "seg", from: [0, 1], to: [8, 4], color: "c1" }] }],
  choices: "abcde".split("").map(id => ({ id, md: `Option ${id}: raising the angle changes the force on the block by some amount` })),
  wrong: [{ choice: "d", error: "half", hint: "QUACK. " + HINT }],
  saccharine: { title: "V2 6", key: "Tick: a", slip: { d: "Close." } } });
PROBS.push({ code: "CALC1_CVT5", title: "V2 5", type: "multi", body: txt("Trace the loop for n = 5."),
  parts: [{ label: "a", prompt: "What is i when the test fails?", type: "num", answer: "6", tol: 0.0001 }, { label: "b", prompt: "What does it return?", type: "num", answer: "10", tol: 0.0001 }],
  saccharine: { title: "V2 5", key: "Tick: 6, 10" } });
writeFileSync(join(banks, "BANK_CVT.json"), JSON.stringify({ v: 1, problems: PROBS }));
const SHORT = ["Only the part of gravity along the ramp speeds it up.\n", "Tick: a. Egg-cellent."];
const stubPicks = [];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const jb = JSON.parse(body);
  const picked = /STUDENT PICKED: ([^\n]*)/.exec(JSON.stringify(jb.messages || []).replace(/\\n/g, "\n"))?.[1];   // the try /explain was asked about
  if (picked && jb.stream) stubPicks.push(picked);
  if (!jb.stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < SHORT.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (i === 0 && picked ? `You picked ${picked}.\n` : "") + SHORT[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw[process.env.PW_BROWSER || "chromium"].launch({ args: ["--no-sandbox"] });
async function open(w, hash = "#BANK_CVT", h) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h || (phone ? 852 : 800) }, hasTouch: phone && !process.env.PW_BROWSER, isMobile: phone && !process.env.PW_BROWSER, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.chats = []; page.on("request", r => { if (/\/chat$/.test(r.url()) && r.method() === "POST") page.chats.push(JSON.parse(r.postData() || "{}")); });
  await page.goto(BASE + "/" + hash);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 }).catch(async e => { throw new Error(e.message.split("\n")[0] + " " + JSON.stringify(await page.evaluate(() => ({ h: location.hash, b: window.stemBank && window.stemBank.code, f: document.getElementById("freeze")?.hidden, s: !!document.getElementById("splash") })))); });
  await page.waitForTimeout(500);
  return page;
}
const probe = page => page.evaluate(() => {
  const top = e => Math.round(e.getBoundingClientRect().top + scrollY), vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const near = [...document.querySelectorAll("#q .opt, #q .ff:not(.rbox), #q .part, #q .nx, #q .choices")].filter(vis).map(e => [e.id || e.dataset.id || e.className.split(" ")[0], top(e)]);
  const d = document.querySelector(".vdrawer:not([hidden])"); let dr = d && d.getBoundingClientRect();
  let hits = null, host = null, nextHit = null, focus = null; let sy = null;
  if (d) {
    sy = scrollY; d.scrollIntoView({ block: "nearest" }); dr = d.getBoundingClientRect();
    const pts = [[.25, .55], [.75, .55], [.25, .85], [.75, .85]].map(([x, y]) => document.elementFromPoint(dr.left + dr.width * x, dr.top + dr.height * y));
    hits = pts.map(e => !!e && !!e.closest(".vdrawer"));
    const h = document.querySelector("#q .opt.wrong, #q .opt.right, #q .ff.strip.bad, #q .ff.strip.ok, #q .part.bad, #q .part.ok, #q .vd-host") ;
    const hr = h && h.closest(".ch, .ff, .part, .choices")?.getBoundingClientRect();
    host = hr ? { overlap: Math.max(0, Math.min(dr.bottom, hr.bottom) - Math.max(dr.top, hr.top)) * (dr.right > hr.left && dr.left < hr.right ? 1 : 0) } : null;
    const nx = [...document.querySelectorAll("#qnext, #q .nx")].find(vis);
    if (nx) { const r = nx.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); nextHit = !!e && (!!e.closest("#qnext, #q .nx") || !!e.closest(".vdrawer .vd-next")); }
    const chip = d.querySelector(".wchip"); if (chip && !chip.hidden) { chip.focus({ preventScroll: true }); focus = document.activeElement === chip; }
  }
  if (sy !== null) scrollTo(0, sy);   // the probe must not move the page (a fixed / sticky Next reads differently per scroll)
  const cp = document.querySelector("#q .ansl .mcopy, #preview .ansl .mcopy");   // the revealed answer's copy: a 44px tap area that nothing else may take
  let copy = null;
  if (cp && vis(cp)) { const r = cp.getBoundingClientRect(), x = r.left + r.width / 2; copy = { w: Math.round(r.width), h: Math.round(r.height), hit: [r.top - 12, r.top + r.height / 2, r.bottom + 12].map(y => !!document.elementFromPoint(x, y)?.closest(".mcopy")) }; }
  return { near, copy, drawer: dr && dr.toJSON(), hits, host, nextHit, focus, vw: innerWidth, stale: [...document.querySelectorAll("#q .vd-host")].length };
});
const same = (a, b, what) => assert.deepEqual(a.near, b.near, what + " moved a neighbour");
const kinds = {
  "figure": { go: async p => { await p.evaluate(() => { location.hash = "#CALC1_CVT6"; }); await p.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_CVT6" && !!document.querySelector('#q .opt[data-id="e"]')); await p.waitForTimeout(400); },
    miss: async p => { await p.click('.opt[data-id="d"]'); await p.click('.ch[data-id="d"] .send'); }, second: "c" },
  "MC": { second: "c", go: async (p) => {}, miss: async p => { await p.click('.opt[data-id="b"]'); await p.click('.ch[data-id="b"] .send'); } },
  "freeform": { go: async p => { await p.evaluate(() => { location.hash = "#CALC1_CVT4"; }); await p.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_CVT4" && !!document.querySelector("#ans")); await p.waitForTimeout(400); },
    miss: async p => { await p.fill("#ans", "7"); await p.press("#ans", "Enter"); } },
  "multi-part": { go: async p => { await p.evaluate(() => { location.hash = "#CALC1_CVT5"; }); await p.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_CVT5" && !!document.querySelector("#q .part .ans")); await p.waitForTimeout(400); },
    miss: async p => { await p.fill('#q .part[data-i="0"] .ans', "5"); await p.press('#q .part[data-i="0"] .ans', "Enter"); } },
};
for (const w of W) for (const kb of (w < 500 ? [0, 1] : [0])) for (const [kind, K] of Object.entries(kinds)) {   // kb: the keyboard open = a short window (420 high)
  await step(`${process.env.PW_BROWSER || "chromium"} ${w}${kb ? " keyboard-open" : ""} ${kind}: wrong + tray open, dismiss, (out of tries), last question: no reflow, never under a sibling, never on the answer / Next, inside the window, focus`, async () => {
    const page = await open(w, "#BANK_CVT", kb ? 420 : undefined);
    await K.go(page);
    const t0 = await probe(page);
    await K.miss(page);
    if (kind === "multi-part") {   // a multi-part field has no tray (the chip lives in #wish): nothing to overlay, nothing may move or stay lifted
      await page.waitForTimeout(1500);
      const m = await probe(page);
      assert.equal(m.drawer, null, "a multi-part field grew a tray"); assert.equal(m.stale, 0, "a host is lifted");
      await page.context().close(); return;
    }
    await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 7000 }).catch(async e => { throw new Error(e.message.split("\n")[0] + " | " + await page.evaluate(() => JSON.stringify({ tries: window.__drill.state.tries.length, dr: [...document.querySelectorAll(".vdrawer")].map(d => d.hidden), cls: [...document.querySelectorAll("#q .part, #q .ff")].map(e => e.className), fb: document.querySelector("#fb")?.textContent.slice(0, 60) }))); });
    await page.waitForTimeout(700);
    const a = await probe(page);
    if (K.second) same({ near: a.near.filter(x => /^[a-e]$/.test(x[0])) }, { near: t0.near.filter(x => /^[a-e]$/.test(x[0])) }, "opening the tray");
    assert.ok(a.hits && a.hits.every(Boolean), `${w} ${kind}: the tray is under something (clipped or a sibling over it): ` + JSON.stringify(a.hits));
    assert.ok(!a.host || a.host.overlap <= 10, `${w} ${kind}: the tray covers the answer / verdict row by ${a.host?.overlap}px`);
    assert.ok(a.nextHit !== false, `${w} ${kind}: the tray covers Next`);
    assert.ok(a.drawer.left >= -1 && a.drawer.right <= a.vw + 1, `${w} ${kind}: outside the window ` + JSON.stringify(a.drawer));
    assert.ok(a.focus !== false, `${w} ${kind}: Ask Cluck cannot take focus`);
    await page.click(".vdrawer .vd-x"); await page.waitForTimeout(600);
    const b = await probe(page);
    same(a, b, "dismissing the tray");
    assert.equal(b.drawer, null, "the tray is gone");
    assert.equal(b.stale, 0, "a host is still lifted (z) after the tray shut");
    if (K.second) {   // out of tries: a 2nd wrong pick, the tray comes back over the same rows
      await page.waitForTimeout(2200);
      if (await page.locator("#toast.on").count()) await page.click("#toast.on");   // the one-time tray tip (a tap closes it)
      await skipRetryWait(page);
      await page.click('.opt[data-id="c"]'); await page.click('.ch[data-id="c"] .send');
      await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 7000 });
      await page.waitForTimeout(700);
      const c = await probe(page);
      assert.ok(c.hits && c.hits.every(Boolean), `${w} ${kind}: out of tries, the tray is under something ` + JSON.stringify(c.hits));
      await page.click(".vdrawer .vd-x"); await page.waitForTimeout(600);   // the out-of-tries reveal may grow the right row itself: the contract is tray open vs tray dismissed
      same({ near: (await probe(page)).near.filter(x => /^[a-e]$/.test(x[0])) }, { near: c.near.filter(x => /^[a-e]$/.test(x[0])) }, "dismissing the second tray");
    }
    if (kind === "freeform") {   // out of tries: the answer is revealed with its copy button; the tray lay over that line and the old reserved room kept its 44px tap area clear (Tony, Nov 3: keep it)
      for (let i = 0; i < 6 && !(await page.evaluate(() => window.__drill.state.finished)); i++) {
        await skipRetryWait(page);
        const n = await page.evaluate(() => window.__drill.state.tries.length);
        if (await page.locator("#toast.on").count()) await page.click("#toast.on");
        await page.fill("#ans", String(8 + i)); await page.press("#ans", "Enter");
        await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 6000 });
      }
      await page.waitForTimeout(900);
      const o = await probe(page);
      if (o.drawer) { await page.click(".vdrawer .vd-x"); await page.waitForTimeout(600); }
      const z = await probe(page);
      assert.equal(z.drawer, null, "the tray is gone");
      if (z.copy) {   // sugar bank shows the revealed answer line with a copy; a diet bank may not
        assert.ok(z.copy.hit.every(Boolean), `${w} ${kind}: the copy's 44px tap area is taken by another element: ` + JSON.stringify(z.copy));
      }
      console.log("     copy", JSON.stringify(z.copy));
    }
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });
}
await browser.close(); srv.kill(); stub.close();
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
