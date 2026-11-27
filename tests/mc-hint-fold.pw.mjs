// MC-HINT-FOLD (Tony Nov 23): after a wrong MC tap on a 7-option bank at 390x844 the hint bubble must be FULLY inside the
// viewport. Shipped A, not B: measured on the base (probe: tests/_probe-mc-hint.cjs on 759d88c), moving the hint above the tiles
// shifted the first tile down 71.9 px (rows 2 / 3 down 57.6, 4 / 5 down 38.4, 6 / 7 down 19.2) and the phone fill re-planned its
// rows: a layout shift under the finger. A keeps the hint under the tiles and scrolls it into view (block: nearest, no smooth
// scroll under prefers-reduced-motion) on a miss only.
// 390x844 phone (touch, dpr 2), ui-v7, own serve.py + a throwaway 7-option bank.   node tests/mc-hint-fold.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8897, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "mc-hint-fold-")), BANKS = join(TMP, "banks");
const LETTERS = "abcdefg".split("");
mkdirSync(BANKS);
/* A single-pick MC with the ONE cap (7 options, app.js MAX_SHOWN). Every distractor has a hint, so the trap hint is the bug. */
const PROB = {
  code: "CALC1_HF1", title: "Seven tiles", type: "mc", pick: "one", shuffle: false,
  body: [{ type: "text", md: "A question with seven plausible answers sits above the fold. Which one is right?" }],
  choices: LETTERS.map(id => ({ id, md: "Answer " + id.toUpperCase() + " with a few more words, enough to wrap onto a second line on a phone" })),
  correct: "d",
  wrong: LETTERS.filter(id => id !== "d").map(id => ({ choice: id, error: "misread", hint: "QUACK. This trap hint must be seen." })),
  saccharine: { title: "Seven tiles", key: "Pick: d", slip: { a: "Trap." } }
};
writeFileSync(join(BANKS, "BANK_HF1.json"), JSON.stringify({ v: 1, problems: [PROB] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS,
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 1200)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
/* the answer's geometry is final: the phone fill wrote its spans and is unchanged across two frames */
const settled = p => p.waitForFunction(() => new Promise(done => {
  const g = document.querySelector("#q .choices");
  const snap = () => !g ? "" : (g.style.gridTemplateRows || "") + "|" + g.dataset.bento + "|" + g.dataset.fill;
  const a = snap(); requestAnimationFrame(() => requestAnimationFrame(() => done(snap() === a)));
}), null, { timeout: 5000 });
/* document-space geometry (scroll does not move it) + the live viewport box */
const geo = p => p.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, h: r.height }; };
  const hint = document.querySelector("#fb .cluck");
  const hr = hint && hint.getBoundingClientRect();
  return {
    vw: innerWidth, vh: innerHeight, y: scrollY,
    hint: hr && { top: hr.top, bottom: hr.bottom, left: hr.left, right: hr.right, h: hr.height, text: hint.textContent.replace(/\s+/g, " ").trim() },
    hintDoc: R(hint), gDoc: R(document.querySelector("#q .choices")),
    tiles: [...document.querySelectorAll("#q .ch")].map(c => ({ id: c.dataset.id, ...R(c) }))
  };
});

try {
  await step("390x844: a wrong tap on a 7-option MC puts the whole hint inside the viewport (A: under the tiles, scrolled in)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-ui", "v7");
      for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    const p = await ctx.newPage();
    p.errs = []; p.on("pageerror", e => p.errs.push(String(e)));
    try {
      await p.goto(BASE + "/#BANK_HF1");
      await p.waitForFunction(() => !!document.querySelector("#q .opt"), null, { timeout: 10000 });
      await p.waitForFunction(() => !!document.querySelector("#q .choices")?.dataset.bento, null, { timeout: 5000 });
      await p.evaluate(() => (document.fonts && document.fonts.ready) || true);
      await settled(p);
      const before = await geo(p);
      assert.equal(before.hint, null, "a hint is on screen before any answer");
      assert.equal(before.tiles.length, 7, "the bank must show 7 tiles: " + before.tiles.length);
      assert.ok(before.gDoc.bottom > before.vh - 16, `the 7-tile bank must run to the bottom of the old answer area (g ${before.gDoc.bottom} vs vh ${before.vh})`);

      await p.click("#q .opt[data-id='a']");
      await p.click("#q .chk #mcGo");                     // Tony Nov 26: the MC key lives in the .chk row under the choices, not in the tile
      await p.waitForSelector("#fb .cluck", { timeout: 8000 });
      await p.waitForFunction(() => {                                    // reducedMotion=reduce: the scroll is instant; wait on it, not a sleep
        const h = document.querySelector("#fb .cluck"); if (!h) return false;
        const r = h.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5;
      }, null, { timeout: 8000 });
      const m = await geo(p);

      /* THE BUG: at 390x844 the trap hint was 848..919.9 in the live viewport (below 844) before this fix. */
      assert.ok(m.hint, "no hint bubble after the miss");
      assert.ok(/trap hint/i.test(m.hint.text), "not the miss hint: " + m.hint.text);
      assert.ok(m.hint.top >= 0 && m.hint.bottom <= m.vh + 0.5 && m.hint.left >= 0 && m.hint.right <= m.vw + 0.5,
        `the hint is not fully inside the viewport: top ${m.hint.top.toFixed(1)}, bottom ${m.hint.bottom.toFixed(1)}, vh ${m.vh}, scrollY ${m.y}`);

      /* A, not B: the hint sits BELOW the tiles (it must not wedge between the card and the tiles) ... */
      assert.ok(m.hintDoc.top >= m.gDoc.bottom - 1, `the hint moved above the tiles (hint ${m.hintDoc.top}, tiles end ${m.gDoc.bottom})`);
      /* ... and adding it moved NO tile in the document (the B failure mode was every tile +71.9 px) */
      const moved = m.tiles.map((t, i) => +(t.top - before.tiles[i].top).toFixed(1));
      assert.deepEqual(moved, before.tiles.map(() => 0), "the hint shifted the tiles: " + JSON.stringify(moved));
      assert.deepEqual(p.errs, []);
    } finally { await ctx.close(); }
  });
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} failing` : "all ok");
process.exit(failures ? 1 : 0);
