// Dogfood test for the drill page (index.html). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/render.pw.mjs http://localhost:8812 [shotDir]
// Fails if any problem shows raw TeX, if no .katex renders, or if the MC / freeform / sticky / copy flows break.
// Not part of `npm test` (that one needs no server or browser).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shuffled, mastery } from "../shuffle.mjs";
const require = createRequire(import.meta.url);
/* the code box: a bank keeps it with the list (Tony, Oct 5 clutter pass C2 / C8), a lone question as a label (C7), a phone strip in the bar */
async function showCode(page) {
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const CODES = ["CALC1_T6B", "CALC1_A9R", "PHYS_F3N", "PHYS_S2K", "CALC1_X2P", "CSCI26_G3H", "CSCI26_G2T"];   // X2P = the MC example; G3H, G2T = network
const RAW = [/\\vec\b/, /\^\\circ/, /\\frac/, /\\text\b/, /\\dfrac/, /\$/, /\\lim/, /\\mu/];
const VIEWS = { phone: { width: 390, height: 844 }, ipad: { width: 1024, height: 1366 }, desktop: { width: 1920, height: 1080 } };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 400)); }
}

async function run(browserType, label, opts = {}) {
  let browser;
  try { browser = await browserType.launch(opts); }
  catch (e) { console.log(`skip ${label}: ${e.message.split("\n")[0]}`); return; }
  for (const [vname, viewport] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: vname !== "desktop", isMobile: vname === "phone" && label === "chromium" });
    /* every page load here starts with no uploaded bank: an upload now persists in IndexedDB (design/RELOAD.md,
       tested in reload.pw.mjs), and these steps assume a fresh page shows server problems only */
    await ctx.addInitScript(() => { try { indexedDB.deleteDatabase("stem-stuff"); } catch { /* no idb */ } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("pinned")) { localStorage.setItem("stem-order", "pin"); sessionStorage.setItem("pinned", "1"); } } catch { /* blocked */ } });   // a known list order; the shuffle button may change it later
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("response", r => { if (r.status() >= 400 && !/offline\.js/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
    // fresh document per problem, so dev grading state and hash navigation never leak between steps
    const open = async code => {
      await page.context().clearCookies();   // a new sid = fresh server tries (tries.json now outlives a page; design/DONE.md)
    await page.goto("about:blank");
      await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code, { timeout: 8000 });
    };
    /* phones since round 3b: the pad is off the page; the Scratchpad button opens the pad page (design/MULTITASK.md) */
    const padPage = async () => { if (vname !== "phone") return; await page.click("#padFab"); await page.waitForFunction(() => document.documentElement.classList.contains("mt"));
      await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running")); await page.waitForTimeout(50); };   // measure the settled pad page, not its crossfade (CI red once, design/TESTING.md)

    for (const code of CODES) {
      await step(`${label} ${vname} ${code}: renders TeX, no raw TeX visible`, async () => {
        await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
        await page.waitForSelector("#blocks > *", { timeout: 8000 });
        await page.waitForTimeout(300);
        const n = await page.locator("#freeze .katex").count();
        assert.ok(n > 0, `no .katex in ${code}`);
        // visible text only: KaTeX's MathML copy (.katex-mathml) is screen-reader-only and holds the TeX source on purpose
        const text = await page.evaluate(() => {
          const c = document.querySelector("#freeze").cloneNode(true);
          c.querySelectorAll(".katex-mathml, .sr-only").forEach(e => e.remove());
          return c.textContent;
        });
        for (const re of RAW) assert.ok(!re.test(text), `raw TeX ${re} visible in ${code}: …${(text.match(new RegExp(".{0,30}" + re.source + ".{0,30}")) || [""])[0]}…`);
        // locked rule: every force arrow is one blue (c1 #7ab8ff); only velocity/acceleration differ
        const forces = await page.evaluate(() => [...document.querySelectorAll('#freeze [data-mark="force"][data-kind="force"] polyline, #freeze [data-mark="force"][data-kind="force"] polygon')]
          .map(e => getComputedStyle(e).stroke));
        for (const st of forces) assert.equal(st, "rgb(122, 184, 255)", `force stroke ${st} in ${code}`);
        if (/^PHYS-(F3N|S2K)$/.test(code)) {
          assert.ok(forces.length >= 3, `expected force arrows in ${code}`);
          assert.equal(await page.locator('#freeze [data-kind="kin"]').count(), 0, `non-blue force in ${code}`);
        }
        if (SHOTS && vname !== "ipad") await page.screenshot({ path: `${SHOTS}/app-${code}-${vname === "phone" ? 390 : 1920}.png`, fullPage: true });
      });
    }

    // ipad + desktop are side by side (design/MULTITASK.md "Desktop, revised"): the problem column has no pull-tab
    /* phones since round 3b (Tony, Oct 3: "big ass dark space"): the pad is off the page, so there is no frozen strip and no pull-tab;
       the whole problem stays in the page at every height */
    if (vname === "phone") await step(`${label} ${vname} no pull-tab on phones: the problem is never clipped (pad off)`, async () => {
      try {
        for (const code of ["CALC1_X2P", "CSCI26_M5V", "CALC1_T6B"]) {
          await open(code);
          for (const h of [600, 500, 400, 320]) {
            await page.setViewportSize({ width: viewport.width, height: h }); await page.waitForTimeout(150);
            assert.ok(await page.locator("#more").isHidden(), `${code} at ${h}px: pull-tab shown`);
            assert.ok(!(await page.evaluate(() => document.querySelector("#freeze").classList.contains("clipped"))), `${code} at ${h}px: clipped`);
          }
          await page.setViewportSize(viewport);
        }
      } finally { await page.setViewportSize(viewport); }
    });

    await step(`${label} ${vname} MC: select shows arrow, reselect hides it, wrong strikes`, async () => {
      await open(`CALC1_X2P`);
      await page.waitForSelector(".opt");
      const a = page.locator('.opt[data-id="a"]'), sendA = page.locator('.ch[data-id="a"] .send');
      assert.equal(await page.locator(".ch .send:visible").count(), 0);
      await a.click();
      assert.equal(await a.getAttribute("aria-checked"), "true");
      assert.ok(await sendA.isVisible(), "arrow not visible on selected choice");
      const box = await sendA.boundingBox(), obox = await a.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, "arrow under 44px");
      assert.ok(box.x + box.width <= obox.x + obox.width + 0.5 && box.x > obox.x + obox.width / 2, "arrow not flush inside the choice");
      await a.click();
      assert.equal(await a.getAttribute("aria-checked"), "false");
      assert.equal(await sendA.isVisible(), false);
      await a.click(); await sendA.click();
      await page.waitForSelector(".opt.wrong");
      assert.ok(await page.locator(".cluck").isVisible(), "no Cluck hint");
      // keyboard: arrow keys move + select, Enter submits
      await page.locator('.opt[data-id="b"]').focus();
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
      assert.equal(await page.locator('.opt[data-id="b"]').getAttribute("aria-checked"), "true");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".opt.right");
      if (SHOTS && vname === "phone") await page.screenshot({ path: `${SHOTS}/app-mc-graded-390.png`, fullPage: true });
    });

    await step(`${label} ${vname} freeform: arrow inside input, wrong then right`, async () => {
      await open(`CALC1_T6B`);
      const inp = page.locator("#ans"), go = page.locator("#ansGo");
      assert.ok(await go.isVisible(), "arrow must always show inside the field");
      assert.ok(await go.isDisabled(), "arrow should be dimmed/disabled while empty");
      await inp.fill("4");
      assert.ok(await go.isEnabled());
      const g = await go.boundingBox(), f = await page.locator("#ff").boundingBox();
      assert.ok(g.x + g.width <= f.x + f.width && g.y >= f.y && g.y + g.height <= f.y + f.height + 0.5, "arrow not inside the field");
      await go.click();
      await page.waitForSelector(".cluck");
      // wrong with a try left: the x sits in the arrow's slot, the box is dashed red, no verdict words; typing clears it
      assert.equal(await page.getAttribute("#ff .vk", "data-v"), "i-x");
      assert.equal(await page.locator("#fb .verdict").count(), 0, "no verdict words");
      assert.ok(await page.locator("#ff.bad").count() === 1 && await go.isHidden(), "bad box, the x holds the arrow's slot");
      const vk = await page.locator("#ff .vk").boundingBox();
      assert.ok(Math.abs(vk.x - g.x) < 1 && Math.abs(vk.y - g.y) < 1, "the x is where the arrow was");
      assert.equal(await page.locator("#toast.on").count(), 0, "no toast (Tony, Oct 5: try pips instead)");
      {   // the pips: right under the wrong box, right-aligned, one used + one left
        assert.deepEqual(await page.$eval("#ff + .pips", e => [e.querySelectorAll("i.used").length, e.querySelectorAll("i:not(.used)").length]), [1, 1]);
        const pb = await page.locator("#ff + .pips").boundingBox(), fb = await page.locator("#ff").boundingBox();
        assert.ok(pb.y >= fb.y + fb.height && pb.y - (fb.y + fb.height) < 24 && Math.abs(pb.x + pb.width - (fb.x + fb.width)) < 1, "pips under the box, right edge");
      }
      const iw = (await inp.boundingBox()).width;
      await inp.fill("12");
      assert.equal(await page.locator("#ff .vk").count(), 0, "typing clears the x");
      assert.ok(await go.isVisible() && Math.abs((await inp.boundingBox()).width - iw) < 0.5, "nothing moved");
      await inp.press("Enter");
      await page.waitForSelector('#ff .vk[data-v="i-ok"]');
      assert.ok(await inp.isDisabled(), "a right answer closes the box");
    });

    await step(`${label} ${vname} freeze: problem + question stay on top while scratchpad scrolls`, async () => {
      await open(`PHYS_S2K`);
      await page.waitForSelector(".fig svg");
      await padPage();
      const ta = page.locator("#scratch");
      await ta.click();
      await ta.fill(Array.from({ length: 60 }, (_, i) => `line ${i + 1}: resolve mg along the slope, then balance with kx.`).join("\n"));
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const f = document.querySelector("#freeze").getBoundingClientRect();
        const q = document.querySelector("#q").getBoundingClientRect();
        return { top: f.top, bottom: f.bottom, stuck: document.querySelector("#freeze").classList.contains("stuck"), qTop: q.top, vh: innerHeight };
      });
      // the scratchpad now stops at the visible bottom and scrolls inside itself, so the page may have little or nothing left
      // to scroll: then the layer is simply in view (stuck once the page does scroll past it)
      assert.ok(r.top >= -1.5 && r.bottom <= r.vh, `freeze out of view: ${r.top}..${r.bottom}`);
      assert.ok(r.bottom < r.vh * 0.75, `frozen layer too tall: ${r.bottom}/${r.vh}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-freeze-${viewport.width}.png` });
    });

    await step(`${label} ${vname} balance: scratchpad spans the column (right edge = the problem card's)`, async () => {
      // Tony, Tue 9/29 ~15:15 PT: "unbalanced UI" -> the 68ch cap is gone; the box runs to the column edge like the card
      const w = await page.evaluate(() => { scrollTo(0, 0); const b = document.querySelector("#xbField").getBoundingClientRect(), c = document.querySelector("#problem").getBoundingClientRect(), k = document.querySelector("#work").getBoundingClientRect();
        return { box: b.right, card: c.right, left: b.left, cardTop: c.top, workTop: k.top, boxTop: b.top }; });
      if (viewport.width >= 720) {   // side by side (design/MULTITASK.md "Desktop, revised"): the pad is the right column, never under the problem
        assert.ok(w.left >= w.card && w.left - w.card <= 48, `pad not beside the problem: pad left ${w.left}, card right ${w.card}`);
        assert.ok(Math.abs(w.boxTop - w.cardTop) <= 2, `pad box top ${w.boxTop} vs question box top ${w.cardTop} (the Question row levels them)`);
      } else assert.ok(Math.abs(w.box - w.card) <= 1, `scratchpad right ${w.box} vs card ${w.card}`);
    });

    await step(`${label} ${vname} entry box: upload + code bar only; start page = title + entry, centred; placement`, async () => {
      await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
      assert.equal(await page.locator("#subjBtn, #subjMenu, .logo, .empty").count(), 0, "dropdown/logo/empty-state still present");
      // start page (design/STYLE.md "Start page"): the one line of title is the only text
      await page.waitForFunction(() => !document.getElementById("splash") && document.documentElement.classList.contains("start"));
      const text = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.checkVisibility && e.checkVisibility() && !e.closest("svg"))
        .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("")).join("").trim());
      assert.equal(text, "Type a code to start.", `start page text: ${text}`);
      assert.equal(await page.locator(".so-dl:visible").count(), 0, "download shown on the empty page");
      const kids = await page.evaluate(() => [...document.querySelector("#entry").children].filter(e => !e.hidden).map(e => e.id || e.className));
      assert.deepEqual(kids, ["upload", "code-box"]);
      const d = await page.evaluate(() => {
        const r = document.querySelector("#entry").getBoundingClientRect(), t = document.querySelector("#startTitle").getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, titleBottom: t.bottom, titleCx: t.left + t.width / 2 };
      });
      assert.ok(Math.abs(d.cx - viewport.width / 2) < 2, `entry not centred across: ${d.cx}`);
      assert.ok(Math.abs(d.titleCx - viewport.width / 2) < 2, "title not centred across");
      assert.ok(d.cy > viewport.height * 0.35 && d.cy < viewport.height * 0.65, `entry not centred down: ${d.cy}`);
      assert.ok(d.titleBottom <= d.top, "title not above the entry");
      assert.ok(d.w >= Math.min(viewport.width - 40, 600), `entry not wide: ${d.w}`);
      // box never covers the scratchpad or Copy once scrolled to the end
      await open("CALC1_T6B");
      await page.evaluate(() => scrollTo(0, 1e5)); await page.waitForTimeout(150);
      const o = await page.evaluate(() => {
        const a = document.querySelector("#dock").getBoundingClientRect(), hit = s => { const r = document.querySelector(s).getBoundingClientRect(); return r.bottom > a.top && r.top < a.bottom && getComputedStyle(document.querySelector("#dock")).position === "fixed"; };
        return { copy: hit("#copy"), scratch: hit("#scratch") };
      });
      assert.ok(!o.copy && !o.scratch, `box covers ${JSON.stringify(o)}`);
    });

    await step(`${label} ${vname} code separator: "_" canonical, old "-" links and loose typing still work`, async () => {
      await page.goto("about:blank"); await page.goto(`${BASE}/#CALC1-T6B`, { waitUntil: "load" });   // back-compat: old link
      await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_T6B");
      assert.ok((await page.evaluate(() => location.hash)) === "#CALC1_T6B");
      for (const typed of ["calc1 a9r", "CALC1-A9R", "calc1a9r"]) {                                      // back-compat: typing
        await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
        await page.fill("#code", typed); await page.press("#code", "Enter");
        await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_A9R");
        assert.equal(await page.inputValue("#code"), "", "box empties after opening");
        assert.equal(await page.getAttribute("#code", "placeholder"), "CALC1_A9R");
      }
    });

    if (label === "chromium") await step(`${label} ${vname} paste: a code pasted elsewhere lands in the code box; paste button; placeholder`, async () => {
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      await open("CALC1_T6B");
      const clip = t => page.evaluate(x => navigator.clipboard.writeText(x), t);
      const code = page.locator("#code"), go = page.locator("#codeGo"), pasteBtn = page.locator("#codePaste");
      if (vname !== "desktop") { await page.waitForSelector("#barTab", { state: "visible" }); await page.click("#barTab"); await page.waitForSelector("#code", { state: "visible", timeout: 3000 }); }   // touch: the bar rests as a strip while a problem is open
      // placeholder = open problem's code, in the hint color; box empty; paste button shown, arrow hidden
      assert.equal(await code.getAttribute("placeholder"), "CALC1_T6B"); assert.equal(await code.inputValue(), "");
      assert.equal(await page.evaluate(() => window.__drill.state.code), "CALC1_T6B");
      assert.ok(await pasteBtn.isVisible() && await go.isHidden());
      assert.equal(await pasteBtn.getAttribute("aria-label"), "Paste code");
      assert.equal(await pasteBtn.evaluate(b => b.textContent.trim()), "", "no text on the button");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#code"), "::placeholder").color), "rgb(125, 142, 168)", "placeholder not in the hint color");
      assert.deepEqual(await pasteBtn.evaluate(b => [b.offsetWidth, b.offsetHeight]), vname === "desktop" ? [52, 52] : [44, 44]);   // flush inside the code box: --btn (56 on a 1920x1080 desktop, else 48) minus its 2px borders
      const hs = await page.evaluate(() => ["#upload", ".code-box"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }));
      assert.deepEqual(hs[0], hs[1], "code box and upload button: same top and bottom");
      if (SHOTS && vname === "phone") await page.screenshot({ path: `${SHOTS}/paste-placeholder-390.png` });
      // a whole code pasted into the answer box or the scratchpad moves to the code box; the field itself is unchanged
      const pasteInto = [["#ans", "  calc1-a9r ", "CALC1_A9R"], ["#scratch", "#PHYS F3N", "PHYS_F3N"], ["#scratch", "PHYS_S2K\n", "PHYS_S2K"]]
        .filter(([sel]) => sel !== "#scratch" || vname !== "phone");   // phones: the pad is on its own page (round 3b); the answer box covers the redirect there
      for (const [sel, txt, want] of pasteInto) {
        await page.locator(sel).fill("keep"); await clip(txt); await page.locator(sel).focus();
        await page.keyboard.press("Control+V");
        assert.equal(await code.inputValue(), want, `${sel} paste of ${JSON.stringify(txt)}`);
        assert.equal(await page.locator(sel).inputValue(), "keep", `${sel} changed`);
        assert.ok(await page.evaluate(() => document.activeElement.id === "code"), "code box not focused");
        assert.ok(await go.isVisible() && await pasteBtn.isHidden(), "arrow not shown");
        assert.equal(await page.evaluate(() => document.querySelector("#pcode").textContent), "CALC1_T6B", "auto-opened");
        await code.fill(""); assert.ok(await pasteBtn.isVisible(), "paste button not back after emptying");
      }
      // normal text, and a code inside longer text, paste normally
      for (const txt of vname === "phone" ? [] : ["3.20 m/s", "see CALC1_A9R for this", "CALC1_A9R and PHYS_F3N"]) {
        await page.locator("#scratch").fill(""); await clip(txt); await page.locator("#scratch").focus();
        await page.keyboard.press("Control+V");
        assert.equal(await page.locator("#scratch").inputValue(), txt);
        assert.equal(await code.inputValue(), "", "code box changed for ordinary text");
      }
      await code.fill(""); await page.locator("#scratch").focus();
      // the paste button reads the clipboard: code fills the box, arrow appears, press it to open
      await clip("physs2k"); await pasteBtn.click();
      await page.waitForFunction(() => document.querySelector("#code").value === "PHYS_S2K");
      assert.equal(await code.inputValue(), "PHYS_S2K");
      assert.ok(await go.isVisible() && await pasteBtn.isHidden());
      if (SHOTS && vname === "phone") await page.screenshot({ path: `${SHOTS}/paste-button-filled-390.png` });
      await go.click();
      await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_S2K");
      if (vname !== "desktop") { assert.ok(await code.isHidden(), "bar back to its strip after opening"); await page.click("#barTab"); }
      assert.equal(await code.inputValue(), ""); assert.equal(await code.getAttribute("placeholder"), "PHYS_S2K");
      assert.ok(await pasteBtn.isVisible() && await go.isHidden());
      // not a code on the clipboard: nothing is filled, the box is focused for a manual paste
      await clip("hello"); await pasteBtn.click(); await page.waitForFunction(() => document.activeElement.id === "code");
      assert.equal(await code.inputValue(), ""); assert.ok(await page.evaluate(() => document.activeElement.id === "code"));
    });

    await step(`${label} ${vname} upload one problems.json: every problem loads, graded from the file`, async () => {
      await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
      // a bank with codes the server doesn't have: the upload is the only source
      const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
      for (const p of bank.problems) p.code = p.code.replace("_", "_Q");   // insert, not swap: a swap made codes collide
      await showCode(page);   // the bar rests as a strip while a problem is open
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await ch.setFiles({ name: "my-problems.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
      const first = shuffled(bank.problems.map(p => p.code), "pin")[0];   // the page opens the first in its (pinned) order
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, first);
      assert.equal(await page.getAttribute("#qlistBtn", "title"), "my-problems.json", "the list button's title names the file (it says Questions)");
      assert.ok(await page.locator("#freeze .katex").count() > 0);
      const f3n = "PHYS_QF3N";
      await showCode(page);
      await page.fill("#code", f3n); await page.press("#code", "Enter");
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, f3n);
      assert.ok(await page.locator("#freeze .fig svg").count() > 0, "figure from the uploaded file");
      assert.equal((await page.evaluate(c => window.__drill.check(c, { answer: "3.20" }), f3n)).verdict, "correct", "graded from the file");
    });

    await step(`${label} ${vname} nav: hidden for server problems; upload -> list, click a row, next, prev, keys`, async () => {
      await open("CALC1_T6B");
      assert.ok(await page.locator("#qnav").isHidden(), "nav shown for a server problem");
      const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
      for (const p of bank.problems) p.code = p.code.replace("_", "_N");
      const file = bank.problems.map(p => p.code), codes = shuffled(file, "pin"), n = codes.length;   // the page's order (seed pinned above)
      assert.notDeepEqual(codes, file, "shuffle kept file order");
      bank.problems.find(p => p.code === codes[1]).title = "Area between a parabola and a line";
      await showCode(page);   // the bar rests as a strip while a problem is open
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await ch.setFiles({ name: "bank.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
      const at = c => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, c, { timeout: 8000 });
      await at(codes[0]);
      const nav = page.locator("#qnav"), btn = page.locator("#qlistBtn"), prev = page.locator("#qprev"), next = page.locator("#qnext");
      assert.ok(await nav.isVisible(), "nav hidden after upload");
      assert.ok(await prev.isDisabled() && await next.isEnabled(), "first question: prev off, next on");
      const shuf = page.locator("#qshuf");
      assert.equal((await shuf.textContent()).trim(), "", "shuffle button carries text");
      for (const b of [btn, shuf, prev, next]) { const r = await b.boundingBox(); assert.ok(r.height >= 48 && r.width >= 48, "nav button under 48px"); }
      // list button: the file name; ".json" dimmed on desktop, hidden on phones (Tony, Sep 30)
      assert.equal((await btn.innerText()).trim(), "Questions", "list button label"); assert.equal(await btn.getAttribute("title"), "bank.json", "its title names the file");
      assert.equal((await prev.textContent()).trim() + (await next.textContent()).trim(), "", "arrows carry text");
      // placement: beside the entry box on desktop; the top bar on phones and touch, clear of the bottom dock
      const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { nav: r("#qnav"), entry: r("#entry"), dock: r("#dock"), main: r("#main"), list: r("#qlistBtn"), shuf: r("#qshuf"), prev: r("#qprev") }; });
      // desktop: list + shuffle, then the entry box, then Prev/Next at the right (Tony, Sep 30)
      if (vname === "desktop") assert.ok(Math.abs(g.list.top - g.entry.top) < 1 && g.list.right < g.shuf.left && g.shuf.right < g.entry.left && g.prev.left > g.entry.right, "desktop bar order: list, shuffle, entry, arrows");
      else assert.ok(g.nav.bottom <= g.main.top + 1 && g.nav.top < 80, `nav not the top bar: ${g.nav.top}`);
      if (SHOTS && vname !== "ipad") await page.screenshot({ path: `${SHOTS}/nav-closed-${viewport.width}.png` });
      // list: bare numbers + titles, current marked, focus on the current row
      await btn.click();
      const rows = page.locator("#qlist a");
      assert.ok(await page.locator("#qlist").isVisible());
      assert.equal(await btn.getAttribute("aria-expanded"), "true");
      assert.equal(await rows.count(), n);
      assert.deepEqual(await page.locator("#qlist .qn").allTextContents(), codes.map((_, i) => String(i + 1)));
      assert.equal(await rows.nth(1).locator(".qt").textContent(), "Area between a parabola and a line");
      for (const t of await page.locator("#qlist .qt").allTextContents()) assert.ok(t.length <= 60 && !/[\\$]/.test(t), `title ${t}`);
      assert.equal(await rows.nth(0).getAttribute("aria-current"), "true");
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-current")), "true", "focus not on the current row");
      // in the flow: the list pushes the problem down and covers nothing
      const lr = await page.locator("#qlist").boundingBox(), fr = await page.locator("#freeze").boundingBox();
      assert.ok(lr.y + lr.height <= fr.y, "list covers the problem");
      if (SHOTS && vname !== "ipad") await page.screenshot({ path: `${SHOTS}/nav-open-${viewport.width}.png` });
      await rows.nth(2).click();
      await at(codes[2]);
      assert.ok(await page.locator("#qlist").isHidden(), "list stays open after a pick");
      await btn.click();
      assert.equal(await rows.nth(2).getAttribute("aria-current"), "true");
      assert.equal(await page.locator("#qlist [aria-current]").count(), 1);
      await page.keyboard.press("Escape");
      assert.ok(await page.locator("#qlist").isHidden());
      assert.equal(await page.evaluate(() => document.activeElement.id), "qlistBtn", "Escape: focus not back on the button");
      await next.click(); await at(codes[3]);
      if (SHOTS && vname !== "ipad") await page.screenshot({ path: `${SHOTS}/nav-next-${viewport.width}.png` });
      await prev.click(); await at(codes[2]);
      // no keyboard shortcuts (Tony, Oct 2 ~23:59 PT: "kill key shortcut"): [ and ] do nothing outside fields
      await page.locator("#problem").click();
      await page.keyboard.press("]"); await page.waitForTimeout(150);
      assert.equal(await page.locator("#pcode").textContent(), codes[2], "] still navigates");
      // last question: next off; the list works from the keyboard
      await page.evaluate(c => { location.hash = c; }, codes[n - 1]); await at(codes[n - 1]);
      assert.ok(await next.isDisabled() && await prev.isEnabled(), "last question: next off, prev on");
      await btn.focus(); await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home"); await page.keyboard.press("Enter");
      await at(codes[0]);
      // shuffle button: a new order (list, numbers, Prev/Next follow it); the open problem stays open; the order survives a reload
      const hrefs = () => page.locator("#qlist a").evaluateAll(as => as.map(a => a.getAttribute("href").slice(1)));
      await shuf.click();
      const seed2 = await page.evaluate(() => localStorage.getItem("stem-order"));
      const codes2 = mastery(shuffled(file, seed2), () => null, codes[0]);   // nothing answered: the open problem leads (design/NAV.md "Mastery order")
      assert.notEqual(seed2, "pin", "shuffle kept the seed");
      assert.equal(await page.locator("#pcode").textContent(), codes[0], "shuffle moved off the open problem");
      assert.deepEqual(await hrefs(), codes2, "list not in the new order");
      const k = codes2.indexOf(codes[0]);
      if (k < n - 1) { await next.click(); await at(codes2[k + 1]); await prev.click(); await at(codes[0]); }
      // a server problem after the upload: list stays, nothing marked, arrows off
      await showCode(page);
      await page.fill("#code", "CALC1_T6B"); await page.press("#code", "Enter"); await at("CALC1_T6B");
      assert.ok(await nav.isVisible() && await prev.isDisabled() && await next.isDisabled(), "server problem: arrows should be off");
      assert.equal(await page.locator("#qlist [aria-current]").count(), 0);
      // reload: this harness deletes the bank on every load, so check the seed itself (reload.pw.mjs reloads a kept bank)
      await page.reload();
      assert.equal(await page.evaluate(() => localStorage.getItem("stem-order")), seed2, "order seed lost on reload");
    });

    await step(`${label} ${vname} copy button inside the scratchpad: text never runs under it`, async () => {
      await open("CALC1_T6B");
      await padPage();
      const ta = page.locator("#scratch");
      // no line box of the text (laid out exactly like the textarea, with its current padding) may touch the button
      const clear = () => page.evaluate(() => {
        const t = document.querySelector("#scratch"), bs = ["#cut", "#copy"].map(q => document.querySelector(q)), cs = getComputedStyle(t);
        const m = document.createElement("div");
        for (const k of ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "paddingTop", "paddingLeft", "paddingRight",
          "paddingBottom", "borderTopWidth", "borderLeftWidth", "borderRightWidth", "borderBottomWidth", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize"]) m.style[k] = cs[k];
        Object.assign(m.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", borderStyle: "solid", width: t.offsetWidth + "px", height: t.offsetHeight + "px" });
        m.textContent = (t.value || t.placeholder) + "\u200b"; document.body.append(m);
        const r = document.createRange(); r.selectNodeContents(m.firstChild);
        const mr = m.getBoundingClientRect(), tr = t.getBoundingClientRect(), rects = [...r.getClientRects()];
        let hits = 0, inside = true;
        for (const b of bs) {   // neither Cut nor Copy may have a line box under it
          const br = b.getBoundingClientRect(), bx = br.left - tr.left, by = br.top - tr.top;
          hits += rects.filter(q => q.width && q.right - mr.left > bx && q.bottom - mr.top > by && q.top - mr.top < by + br.height).length;
          inside = inside && br.right <= tr.right && br.bottom <= tr.bottom && br.left >= tr.left;
        }
        const [cut, copy] = bs.map(b => b.getBoundingClientRect());
        m.remove();
        // once the box is capped at the viewport bottom it scrolls: lines pass under the buttons, but the last one rests above them
        return { hits: t.scrollHeight > t.clientHeight + 1 ? 0 : hits, free: t.classList.contains("xb-free"), inside, apart: cut.right <= copy.left };
      });
      let c = await clear();
      assert.ok(c.inside && c.apart, "Cut and Copy not both inside the textarea box, side by side");
      assert.equal(c.hits, 0, "placeholder under the button");
      // grow one long paragraph a word at a time; the reserved band must switch on exactly when needed, never flicker
      const side = viewport.width >= 720;   // side by side: the pad fills its column (design/MULTITASK.md), it does not grow with the text
      await ta.focus();   // a tap on a phone opens the pad page (variant 9); the band is checked on the plain page, as before
      // legit toggles: at most on (last line reaches the corner) and off (it wraps) once per new line
      let toggles = 0, prev = (await clear()).free, lines = 0, h = await ta.evaluate(t => t.offsetHeight);
      for (let i = 0; i < 40; i++) {
        await page.keyboard.type(i ? " slope" : "resolve mg along the slope then balance with kx and check units");
        c = await clear();
        assert.equal(c.hits, 0, `text under the button after ${i} words`);
        if (c.free !== prev) { toggles++; prev = c.free; }
        const nh = await ta.evaluate(t => t.offsetHeight); if (nh !== h) { lines++; h = nh; }
      }
      assert.ok(toggles <= 2 * lines + 2, `padding flickered: ${toggles} toggles for ${lines} height changes`);
      if (vname === "phone") {   // the pad page: the tool row (q | a, collapse, Cut, Copy) keeps its band under the text at all times
        const pb = await ta.evaluate(t => parseFloat(getComputedStyle(t).paddingBottom));
        assert.ok(pb >= 48, `tool row band ${pb}px`);
        return;
      }
      // last line runs into the corner -> reserved
      const reserved = await page.evaluate(async side => {
        const t = document.querySelector("#scratch"), base = "resolve mg along the slope then balance with kx ";
        if (side && document.documentElement.classList.contains("bar-mini")) return true;   // touch: the bar's band (>= 56px) always sits under the text
        if (side) {   // a column-tall box: walk one full line down to the bottom row; it must reserve before the box would scroll
          for (let k = 0; k < 400; k++) { t.value = "\n".repeat(k) + base + "x".repeat(400); t.dispatchEvent(new Event("input"));
            if (!t.classList.contains("xb-free")) return k > 0; if (t.scrollHeight > t.clientHeight + 1) return false; }   // the band's own padding may then scroll it a little
          return false;
        }
        for (let n = 1; n < 400; n++) { t.value = base + "x".repeat(n); /* one line of prose: stays under the height cap (a capped box always keeps the band) */ t.dispatchEvent(new Event("input")); if (!t.classList.contains("xb-free")) return true; }
        return false;
      }, side);
      assert.ok(reserved, "never reserved the band for a long last line");
      assert.equal((await clear()).hits, 0);
      if (SHOTS && vname === "phone") await page.locator("#work").screenshot({ path: `${SHOTS}/app-copy-reserved-390.png` });
      // short last line -> normal padding
      await page.evaluate(side => { const t = document.querySelector("#scratch"); t.value = side ? "ok" : t.value + "\nok"; t.dispatchEvent(new Event("input")); }, side);   // side: a short note in a tall pad
      c = await clear();
      assert.ok(c.free, "short last line still reserves the band");
      assert.equal(c.hits, 0);
      if (SHOTS && vname === "phone") await page.locator("#work").screenshot({ path: `${SHOTS}/app-copy-free-390.png` });
    });

    await step(`${label} ${vname} text + multi + 2-choice mc`, async () => {
      await open("CSCI26_Q8C");                                              // text: how line above the box, graded as text
      assert.match(await page.locator("#how").textContent(), /Type ~ for/);
      await page.fill("#ans", "q -> p"); await page.press("#ans", "Enter");
      await page.locator("#fb .cluck").waitFor();
      await page.fill("#ans", "~Q->~P"); await page.press("#ans", "Enter");
      await page.locator('#ff .vk[data-v="i-ok"]').waitFor();

      await open("CSCI26_M5V");                                              // multi: every part has its own arrow, verdict, tries and lockout
      const boxes = page.locator("#q .ans");
      assert.equal(await boxes.count(), 2);
      assert.equal(await page.locator("#ansGo").count(), 0, "no shared arrow any more");
      const marks = await page.locator("#q .mparts .mk").allTextContents();           // sub-questions: "a)" "b)" each with its own text and box
      assert.deepEqual(marks, ["a)", "b)"]);
      assert.match(await page.locator("#q .part").nth(0).locator(".pr").textContent(), /How many are in/);
      assert.equal(await page.locator("#q .part .pr .katex").count(), 1, "prompt TeX renders");
      assert.match(await page.locator("#q .part").nth(1).locator(".pr").textContent(), /exactly one set/);
      const rows = await page.evaluate(() => [...document.querySelectorAll("#q .part")].map(r => { const b = r.getBoundingClientRect(), t = r.querySelector(".pr").getBoundingClientRect(), x = r.querySelector(".ff").getBoundingClientRect(); return { top: b.top, pr: t.top, ptxt: t.bottom, box: x.top, boxL: x.left, prL: t.left, prR: t.right, w: x.width }; }));
      assert.ok(rows[1].top > rows[0].top, "rows stack");
      if (vname === "phone") assert.ok(rows[0].box >= rows[0].ptxt - 1, "phone: box under its prompt");
      else assert.ok(rows[0].boxL >= rows[0].prR - 1 && Math.abs(rows[0].box - rows[0].pr) < 20, "wide: box beside its prompt");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll");
      assert.match(await boxes.nth(0).evaluate(e => getComputedStyle(e).fontFamily), /Atkinson Hyperlegible Mono/);
      assert.match(await boxes.nth(1).getAttribute("aria-labelledby"), /mk1 pr1/);
      const arrows = () => page.locator("#q .part .send:visible").count();
      assert.equal(await arrows(), 0, "no arrow in an empty box");
      await boxes.nth(1).fill("14");                                       // typing in b shows only b's arrow, nested in b's box, flush right
      assert.equal(await arrows(), 1);
      assert.ok(await page.locator("#go0").isHidden() && await page.locator("#go1").isVisible());
      {
        const g = await page.locator("#go1").boundingBox(), f = await page.locator("#q .part .ff").nth(1).boundingBox(), t = await boxes.nth(1).boundingBox();
        assert.ok(g.x + g.width <= f.x + f.width && g.x >= f.x && g.y >= f.y && g.y + g.height <= f.y + f.height + 0.5, "arrow not inside its box");
        assert.ok(t.x + t.width <= g.x + 0.5, "the text field ends where the arrow begins (room reserved, text never under it)");
        assert.equal(await boxes.nth(1).evaluate(e => e.parentElement.contains(document.getElementById("go1"))), true);
      }
      await boxes.nth(1).fill(""); assert.equal(await arrows(), 0, "emptying the box hides the arrow");
      await boxes.nth(1).fill("14");
      await boxes.nth(0).fill("1"); assert.equal(await arrows(), 2, "arrows = non-empty unlocked boxes"); await boxes.nth(0).fill("");
      // b wrong twice -> only b locks (its hint is its own wrong entry, then the nudge)
      await boxes.nth(1).press("Enter");                                   // Enter submits THIS box
      await page.locator("#q .part").nth(1).locator(".phint .cluck").waitFor();
      assert.match(await page.locator("#ph1").textContent(), /Exactly one/);
      assert.equal(await page.locator("#q .part .ff").nth(1).evaluate(e => e.classList.contains("bad")), true, "b shows the bad state");
      assert.equal(await page.getAttribute("#q .part[data-i='1'] .vk", "data-v"), "i-x", "b: the x in its arrow's slot");
      assert.doesNotMatch(await page.locator("#ph1").textContent(), /Wrong\. 1 try left|One more try/, "no verdict words");
      assert.equal(await page.locator("#ph0").textContent(), "", "a is unaffected");
      assert.ok(await boxes.nth(0).isEnabled() && await page.locator("#q .part .ff").nth(0).evaluate(e => !e.classList.contains("bad")));
      await boxes.nth(1).fill("9"); assert.equal(await arrows(), 1); await page.click("#go1");
      await page.waitForFunction(() => document.querySelector("#q .part[data-i='1'] .ff.shut"));
      assert.equal(await arrows(), 0, "a locked part shows no arrow");
      assert.equal(await page.getAttribute("#q .part[data-i='1'] .vk", "data-v"), "i-lock", "b: out of tries, the lock in its box");
      const dead = await page.evaluate(() => { const i = document.querySelectorAll("#q .ans")[1], b = document.querySelector("#go1"); return { d: i.disabled, a: i.getAttribute("aria-disabled"), cur: getComputedStyle(i).cursor, op: getComputedStyle(i.closest(".ff")).opacity, go: b.hidden }; });
      assert.deepEqual(dead, { d: true, a: "true", cur: "not-allowed", op: "0.5", go: true }, "b is locked with the disabled look");
      assert.equal(await boxes.nth(0).isEnabled(), true, "locking b does not lock a");
      assert.equal(await page.evaluate(() => window.__drill.state.finished), false, "not finished: a is still open");
      // a wrong then right
      await boxes.nth(0).fill("17"); await boxes.nth(0).press("Enter");
      await page.locator("#q .part").nth(0).locator(".phint .cluck").waitFor();
      assert.match(await page.locator("#ph0").textContent(), /overlap twice/);
      await boxes.nth(0).fill("14"); await boxes.nth(0).press("Enter");
      await page.waitForFunction(() => document.querySelector("#q .part[data-i='0'] .ff.ok"));
      assert.equal(await arrows(), 0, "a correct part shows no arrow");
      assert.equal(await page.getAttribute("#q .part[data-i='0'] .vk", "data-v"), "i-ok", "a: the check in its box");
      assert.deepEqual(await boxes.nth(0).evaluate(e => [e.disabled, e.getAttribute("aria-disabled")]), [true, "true"], "a correct part's box is disabled");
      assert.equal(await page.evaluate(() => window.__drill.state.finished), true, "finished when every part is right or locked");
      assert.equal(await page.evaluate(() => window.__drill.state.solved), false, "a locked part means not solved");
      assert.match(await page.locator("#fb").textContent(), /1 of 2 right/);
      assert.equal(await page.locator("#fb .verdict.ok").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__drill.state.tries.map(t => [t.part, t.a, t.v])),
        [[1, "14", "wrong"], [1, "9", "wrong"], [0, "17", "wrong"], [0, "14", "correct"]]);
      await page.context().clearCookies();                                 // a new browser: fresh tries per part
      await open("CSCI26_M5V");                                            // both right: Correct
      await boxes.nth(0).fill("14"); await boxes.nth(0).press("Enter");
      await page.waitForFunction(() => document.querySelector("#q .part[data-i='0'] .ff.ok"));
      assert.equal(await page.evaluate(() => window.__drill.state.finished), false);
      assert.ok(await boxes.nth(0).isDisabled() && await boxes.nth(1).isEnabled(), "a right part closes its box only");
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelectorAll("#q .ans")[1]), true, "focus moves to the next open box");
      await boxes.nth(1).fill("11");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/multi-${vname}.png` });
      await page.click("#go1");
      await page.locator("#q .part[data-i='1'] .ff.ok").waitFor();
      assert.equal(await page.evaluate(() => window.__drill.state.solved), true);
      assert.equal((await page.locator("#fb").textContent()).trim(), "", "solved: the checks say it, no words");

      await open("CSCI26_TF3");                                              // 2 choices, shuffled by default (order varies, the set does not)
      assert.deepEqual(await page.locator("#q .opt .badge").allTextContents(), ["A", "B"]);
      assert.deepEqual((await page.locator("#q .opt .txt").allTextContents()).sort(), ["FALSE", "TRUE"]);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tf-${vname}.png` });
    });

    if (label === "chromium" && vname === "phone") {
      await step(`${label} ${vname} scratchpad stops at the visible bottom and scrolls; Cut all copies then clears`, async () => {
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
        await open("CALC1_T6B");
        await padPage();
        const ta = page.locator("#scratch");
        await ta.click();
        await ta.fill(Array.from({ length: 60 }, (_, i) => `line ${i + 1}: resolve mg along the slope, then balance with kx.`).join("\n"));
        await page.keyboard.type("!");   // typing (not fill) scrolls the caret line into view, above the corner buttons
        const geo = () => page.evaluate(() => {
          const t = document.querySelector("#scratch"), vv = window.visualViewport, r = t.getBoundingClientRect();
          const dk = document.querySelector("#dock"), dockUp = document.documentElement.classList.contains("dock-bottom") && !document.documentElement.classList.contains("dock-away");
          return { bottom: r.bottom, limit: vv.offsetTop + vv.height - (dockUp ? dk.offsetHeight : 0), sh: t.scrollHeight, ch: t.clientHeight, h: r.height, ov: getComputedStyle(t).overflowY };
        });
        let g = await geo();
        assert.ok(g.bottom <= g.limit + 0.5, `textarea bottom ${g.bottom} > visible bottom ${g.limit}`);
        assert.ok(g.sh > g.ch, `not scrollable: ${g.sh} <= ${g.ch}`);
        assert.equal(g.ov, "auto");
        if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/pad-long-390.png` }); }
        // a smaller visible area (keyboard, address bar) re-caps the box
        await page.setViewportSize({ width: 390, height: 520 });
        await page.waitForTimeout(250);
        g = await geo();
        assert.ok(g.bottom <= g.limit + 0.5, `after resize: textarea bottom ${g.bottom} > visible bottom ${g.limit}`);
        assert.ok(g.h >= 4 * 1.6 * 18, `below 4 rows: ${g.h}`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/pad-short-390x520.png` });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        // both buttons are visible in the box's bottom-right corner
        const vis = await page.evaluate(() => ["#cut", "#copy"].map(q => { const r = document.querySelector(q).getBoundingClientRect(), t = document.querySelector("#scratch").getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.bottom <= t.bottom && r.right <= t.right; }));
        assert.deepEqual(vis, [true, true]);
        // failed copy: nothing is cleared
        await page.evaluate(() => { window.__w = navigator.clipboard.writeText; navigator.clipboard.writeText = () => Promise.reject(new Error("no")); window.__e = document.execCommand; document.execCommand = () => false; });
        await page.locator("#cut").click();
        await page.waitForFunction(() => document.querySelector("#cut").querySelector("use").getAttribute("href") === "#i-x");
        assert.ok((await ta.inputValue()).startsWith("line 1:"), "failed copy cleared the text");
        await page.evaluate(() => { navigator.clipboard.writeText = window.__w; document.execCommand = window.__e; });
        await page.waitForFunction(() => document.querySelector("#cut").querySelector("use").getAttribute("href") === "#i-cut", null, { timeout: 4000 });
        // Cut all: payload has the text, box empties, done feedback, history keeps the clear
        await page.locator("#cut").click();
        await page.waitForSelector("#cut.done");
        assert.equal(await ta.inputValue(), "");
        assert.equal(await page.evaluate(() => document.querySelector("#cut use").getAttribute("href")), "#i-ok");
        const p1 = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
        assert.ok(p1.explain.startsWith("line 1:") && p1.explain.includes("line 60:"), "payload lacks the scratchpad");
        assert.ok(/^\d+px$/.test(await ta.evaluate(t => t.style.maxHeight)) && await ta.evaluate(t => t.offsetHeight) >= 4 * 28.8, "box collapsed below 4 rows");
        await page.waitForFunction(() => document.querySelector("#cut").querySelector("use").getAttribute("href") === "#i-cut", null, { timeout: 4000 });
        await page.locator("#copy").click();
        await page.waitForSelector("#copy.done");
        const p2 = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
        const { replay } = await import("../copy/payload.mjs");
        const snaps = replay(p2).map(x => x.text);
        assert.equal(p2.explain, ""); assert.ok(p2.hist.n >= 2, "history lost");
        assert.ok(snaps.at(-2).includes("line 60:") && snaps.at(-1) === "", "the clear is not recorded as an edit");
        if (SHOTS) { await ta.click(); await page.keyboard.type("after the cut"); await page.locator("#work").screenshot({ path: `${SHOTS}/pad-after-cut-390.png` }); }
      });
    }

    if (label === "chromium" && vname === "desktop") {
      await step(`${label} copy payload`, async () => {
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
        await open(`CALC1_A9R`);
        await page.locator("#ans").fill("9/2"); await page.locator("#ans").press("Enter");
        await page.locator("#scratch").fill("area between: integrate (4x-x^2) - x from 0 to 3");
        await page.locator("#copy").click();
        const txt = await page.evaluate(() => navigator.clipboard.readText());
        const p = JSON.parse(txt);
        assert.equal(p.v, 1); assert.equal(p.code, "CALC1_A9R"); assert.equal(p.tries.length, 1);
        // tries[0].v: graded by serve.py POST /check
        assert.equal(p.tries[0].v, "correct"); assert.ok(p.explain.startsWith("area between"));
      });
    }
    await step(`${label} ${vname} no page errors`, async () => { assert.deepEqual(errors, [], errors.join(" | ")); });
    await ctx.close();
  }
  await browser.close();
}

await run(pw.chromium, "chromium", { args: ["--no-sandbox"] });
await run(pw.webkit, "webkit");
await run(pw.firefox, "firefox");
console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
