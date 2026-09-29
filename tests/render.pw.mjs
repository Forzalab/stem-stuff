// Dogfood test for the drill page (index.html). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/render.pw.mjs http://localhost:8812 [shotDir]
// Fails if any problem shows raw TeX, if no .katex renders, or if the MC / freeform / sticky / copy flows break.
// Not part of `npm test` (that one needs no server or browser).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const CODES = ["CALC1_T6B", "CALC1_A9R", "PHYS_F3N", "PHYS_S2K", "CALC1_X2P"];   // X2P = the MC example
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
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("response", r => { if (r.status() >= 400 && !/offline\.js/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
    // fresh document per problem, so dev grading state and hash navigation never leak between steps
    const open = async code => {
      await page.goto("about:blank");
      await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code, { timeout: 8000 });
    };

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
      await inp.fill("12"); await inp.press("Enter");
      await page.waitForSelector(".verdict.ok");
    });

    await step(`${label} ${vname} freeze: problem + question stay on top while scratchpad scrolls`, async () => {
      await open(`PHYS_S2K`);
      await page.waitForSelector(".fig svg");
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
      assert.ok(Math.abs(r.top) < 1.5, `freeze top ${r.top}`);
      assert.ok(r.stuck, "not marked stuck");
      assert.ok(r.bottom < r.vh * 0.75, `frozen layer too tall: ${r.bottom}/${r.vh}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-freeze-${viewport.width}.png` });
    });

    await step(`${label} ${vname} line length: scratchpad <= ~70ch`, async () => {
      const w = await page.evaluate(() => { const t = document.querySelector("#scratch"); const cs = getComputedStyle(t); const c = document.createElement("span"); c.style.font = cs.font; c.textContent = "0".repeat(70); document.body.append(c); const r = c.offsetWidth; c.remove(); return { box: t.clientWidth, ch70: r }; });
      assert.ok(w.box <= w.ch70 + 40, `textarea ${w.box}px vs 70ch ${w.ch70}px`);
    });

    await step(`${label} ${vname} entry box: upload + code bar only; blank empty state; placement`, async () => {
      await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
      assert.equal(await page.locator("#subjBtn, #subjMenu, .logo, .empty").count(), 0, "dropdown/logo/empty-state still present");
      const text = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.checkVisibility && e.checkVisibility() && !e.closest("svg"))
        .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("")).join("").trim());
      assert.equal(text, "", `empty state shows text: ${text}`);
      assert.equal(await page.locator(".so-dl:visible").count(), 0, "download shown on the empty page");
      const kids = await page.evaluate(() => [...document.querySelector("#entry").children].map(e => e.id || e.className));
      assert.deepEqual(kids, ["upload", "code-box"]);
      const d = await page.evaluate(() => { const r = document.querySelector("#entry").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, pos: getComputedStyle(document.querySelector("#dock")).position }; });
      if (vname === "phone") {
        assert.equal(d.pos, "fixed"); assert.ok(d.bottom > viewport.height - 80, `box not at the bottom: ${d.bottom}`);
        assert.ok(Math.abs(d.cx - viewport.width / 2) < 2, "box not centred");
      } else if (vname === "desktop") assert.ok(d.top < 60, `box not at the top: ${d.top}`);
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
        assert.equal(await page.inputValue("#code"), "CALC1_A9R");
      }
    });

    await step(`${label} ${vname} upload one problems.json: every problem loads, graded from the file`, async () => {
      await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
      assert.ok(await page.locator("#fileStatus").isHidden());
      // a bank with codes the server doesn't have: the upload is the only source
      const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
      for (const p of bank.problems) p.code = p.code.replace(/_(\w)/, "_Q");
      const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await ch.setFiles({ name: "my-problems.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
      const first = bank.problems[0].code;
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, first);
      assert.equal(await page.locator("#fileStatus").textContent(), "File my-problems.json in use.");
      assert.ok(await page.locator("#freeze .katex").count() > 0);
      const f3n = bank.problems.find(p => p.code.startsWith("PHYS_Q3N") || p.code.endsWith("3N")).code;
      await page.fill("#code", f3n); await page.press("#code", "Enter");
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, f3n);
      assert.ok(await page.locator("#freeze .fig svg").count() > 0, "figure from the uploaded file");
      assert.equal((await page.evaluate(c => window.__drill.check(c, { answer: "3.20" }), f3n)).verdict, "correct", "graded from the file");
    });

    await step(`${label} ${vname} nav: hidden for server problems; upload -> list, click a row, next, prev, keys`, async () => {
      await open("CALC1_T6B");
      assert.ok(await page.locator("#qnav").isHidden(), "nav shown for a server problem");
      const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
      for (const p of bank.problems) p.code = p.code.replace(/_(\w)/, "_N");
      bank.problems[1].title = "Area between a parabola and a line";
      const codes = bank.problems.map(p => p.code), n = codes.length;
      const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
      await ch.setFiles({ name: "bank.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
      const at = c => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, c, { timeout: 8000 });
      await at(codes[0]);
      const nav = page.locator("#qnav"), btn = page.locator("#qlistBtn"), prev = page.locator("#qprev"), next = page.locator("#qnext");
      assert.ok(await nav.isVisible(), "nav hidden after upload");
      assert.ok(await prev.isDisabled() && await next.isEnabled(), "first question: prev off, next on");
      for (const b of [btn, prev, next]) { const r = await b.boundingBox(); assert.ok(r.height >= 48 && r.width >= 48, "nav button under 48px"); }
      assert.equal((await btn.textContent()).trim(), "Questions list");
      assert.equal((await prev.textContent()).trim() + (await next.textContent()).trim(), "", "arrows carry text");
      // placement: beside the entry box on desktop; the top bar on phones and touch, clear of the bottom dock
      const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { nav: r("#qnav"), entry: r("#entry"), dock: r("#dock"), main: r("#main") }; });
      if (vname === "desktop") assert.ok(Math.abs(g.nav.top - g.entry.top) < 1 && g.nav.left > g.entry.right, "nav not beside the entry box");
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
      // keys: ] and [ outside fields; typed into the scratchpad they stay text
      await page.locator("#problem").click();
      await page.keyboard.press("]"); await at(codes[3]);
      await page.keyboard.press("["); await at(codes[2]);
      await page.locator("#scratch").click(); await page.keyboard.type("a[i]");
      await page.waitForTimeout(150);
      assert.equal(await page.locator("#pcode").textContent(), codes[2], "[ ] navigated while typing");
      assert.equal(await page.inputValue("#scratch"), "a[i]");
      // last question: next off; the list works from the keyboard
      await page.evaluate(c => { location.hash = c; }, codes[n - 1]); await at(codes[n - 1]);
      assert.ok(await next.isDisabled() && await prev.isEnabled(), "last question: next off, prev on");
      await btn.focus(); await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home"); await page.keyboard.press("Enter");
      await at(codes[0]);
      // a server problem after the upload: list stays, nothing marked, arrows off
      await page.fill("#code", "CALC1_T6B"); await page.press("#code", "Enter"); await at("CALC1_T6B");
      assert.ok(await nav.isVisible() && await prev.isDisabled() && await next.isDisabled(), "server problem: arrows should be off");
      assert.equal(await page.locator("#qlist [aria-current]").count(), 0);
    });

    await step(`${label} ${vname} copy button inside the scratchpad: text never runs under it`, async () => {
      await open("CALC1_T6B");
      const ta = page.locator("#scratch");
      // no line box of the text (laid out exactly like the textarea, with its current padding) may touch the button
      const clear = () => page.evaluate(() => {
        const t = document.querySelector("#scratch"), b = document.querySelector("#copy"), cs = getComputedStyle(t);
        const m = document.createElement("div");
        for (const k of ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "paddingTop", "paddingLeft", "paddingRight",
          "paddingBottom", "borderTopWidth", "borderLeftWidth", "borderRightWidth", "borderBottomWidth", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize"]) m.style[k] = cs[k];
        Object.assign(m.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", borderStyle: "solid", width: t.offsetWidth + "px", height: t.offsetHeight + "px" });
        m.textContent = (t.value || t.placeholder) + "\u200b"; document.body.append(m);
        const r = document.createRange(); r.selectNodeContents(m.firstChild);
        const mr = m.getBoundingClientRect(), tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
        const bx = br.left - tr.left, by = br.top - tr.top;
        const hits = [...r.getClientRects()].filter(q => q.width && q.right - mr.left > bx && q.bottom - mr.top > by && q.top - mr.top < by + br.height);
        m.remove();
        return { hits: hits.length, free: t.classList.contains("xb-free"), inside: br.right <= tr.right && br.bottom <= tr.bottom && br.left >= tr.left };
      });
      let c = await clear();
      assert.ok(c.inside, "button not inside the textarea box");
      assert.equal(c.hits, 0, "placeholder under the button");
      // grow one long paragraph a word at a time; the reserved band must switch on exactly when needed, never flicker
      await ta.click();
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
      // last line runs into the corner -> reserved
      const reserved = await page.evaluate(async () => {
        const t = document.querySelector("#scratch"), base = "resolve mg along the slope then balance with kx ";
        for (let n = 1; n < 400; n++) { t.value = base.repeat(3) + "x".repeat(n); t.dispatchEvent(new Event("input")); if (!t.classList.contains("xb-free")) return true; }
        return false;
      });
      assert.ok(reserved, "never reserved the band for a long last line");
      assert.equal((await clear()).hits, 0);
      if (SHOTS && vname === "phone") await page.locator("#work").screenshot({ path: `${SHOTS}/app-copy-reserved-390.png` });
      // short last line -> normal padding
      await page.evaluate(() => { const t = document.querySelector("#scratch"); t.value = t.value + "\nok"; t.dispatchEvent(new Event("input")); });
      c = await clear();
      assert.ok(c.free, "short last line still reserves the band");
      assert.equal(c.hits, 0);
      if (SHOTS && vname === "phone") await page.locator("#work").screenshot({ path: `${SHOTS}/app-copy-free-390.png` });
    });

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
