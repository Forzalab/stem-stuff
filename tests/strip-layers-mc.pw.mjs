// B3 PR-B2 answer strip: the cabinet drawer for single multiple choice, pick-all and multi-part (extends strip-layers.pw.mjs, PR-B1, which owns the typed answers).
//   single mc  drawer spans the picked row: [Ask Cluck][Skip | Next][^]; Next = the one filled --action control once the question is closed (v10check: COMPUTED bg = --action);
//              the labelled Next in the row's slot stays (Tony Nov 2: both); inline pill rows: the drawer follows the group
//   pick-all   one drawer under the whole list (the .chk row); multi: one drawer, on the part whose verdict is newest, one Ask Cluck chip per question
//   reopen     mc / pick-all: tap the row's mark (a .vkb button over it; the rows' own buttons are disabled once closed); multi keeps each part's .vk;
//              the first close by ^ shows a one-time toast ("tap the badge") and never again
// For every case: the drawer is open after the verdict (not a child of its host), nothing is painted over it, closing it moves nothing (0 reflow), focus returns to the
// reopen target. Every check runs after SETTLE (> the 380 ms slide). Own serve.py; the bank and /check are routed.   node tests/strip-layers-mc.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8863), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 500;   // > the 380 ms drawer slide

const txt = md => [{ type: "text", md }];
const ch = (...ids) => ids.map(id => ({ id, md: id === "a" ? "The first long choice about the ball" : `Choice ${id.toUpperCase()}, a sentence about the ball` }));
const P = [
  { code: "STM_MCQ", title: "Practice, Question 1", type: "mc", how: "Pick one", wish: true, body: txt("A ball drops from rest. Which is true?"), choices: ch("a", "b", "c", "d") },
  { code: "STM_INL", title: "Practice, Question 2", type: "mc", how: "Pick one", wish: true, body: txt("Does it speed up?"), choices: [{ id: "a", md: "Yes" }, { id: "b", md: "No" }, { id: "c", md: "Maybe" }] },
  { code: "STM_ALL", title: "Practice, Question 3", type: "mc", pick: "all", how: "Pick all that are true", wish: true, body: txt("Which are vectors?"), choices: ch("a", "b", "c", "d") },
  { code: "STM_MUL", title: "Practice, Question 4", type: "multi", how: "Answer each part", wish: true, body: txt("A cart moves."),
    parts: [{ label: "a", prompt: "How far in 2 s?", type: "num" }, { label: "b", prompt: "How fast at 2 s?", type: "num" }] },
];
const RIGHT = { STM_MCQ: "c", STM_INL: "a", STM_ALL: ["a", "c"] };
const BANK = "BANK_STRIP2";
async function pageFor(browser, W, H, o = {}) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.addInitScript(tip => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))); if (tip) localStorage.setItem("stem-strip-badge", "1"); } catch { /* blocked */ } }, !o.tip);
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  const tries = {};
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "STM_MCQ" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Step one\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON(), code = b.code, key = code + (b.part ?? "");
    let ok;
    if (code === "STM_MUL") ok = b.answer === String(2 + 2 * b.part);          // part 0 = 2, part 1 = 4
    else if (code === "STM_ALL") ok = JSON.stringify([...b.choices].sort()) === JSON.stringify(RIGHT[code]);
    else ok = b.choice === RIGHT[code];
    if (ok) return r.fulfill({ json: { verdict: "correct" } });
    tries[key] = (tries[key] || 0) + 1;
    const left = Math.max(0, 2 - tries[key]);
    const struck = code === "STM_ALL" ? b.choices.find(c => !RIGHT[code].includes(c)) : undefined;
    return r.fulfill({ json: { verdict: "wrong", triesLeft: left, ...(struck ? { struck } : {}), ...(left === 0 ? { correct: code === "STM_ALL" ? RIGHT[code] : code === "STM_MUL" ? String(2 + 2 * b.part) : RIGHT[code] } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "STM_MCQ", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
async function goTo(page, code) {
  for (let i = 0; i < 6 && (await page.textContent("#pcode")) !== code; i++) {
    await page.evaluate(() => document.querySelector("#qnext").click());
    await page.waitForTimeout(500);
  }
  assert.equal(await page.textContent("#pcode"), code);
  await page.waitForSelector("#q .opt, #q .ans");
}
const pickMC = async (page, id) => { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch:has(.opt[data-id="${id}"]) .send`); };
async function pickAll(page, ids) { for (const id of ids) await page.click(`#q .opt[data-id="${id}"]`); await page.click("#mcGo"); }
async function part(page, i, v) { await page.fill(`#q .part[data-i="${i}"] .ans`, v); await page.click(`#go${i}`); }
const verdictCount = (page, n) => page.waitForFunction(k => window.__drill.state.tries.length >= k, n);
/* drive a question to a state: wrong (a try left), out (a second miss, same page), right (fresh page) */
async function reach(page, kind, state) {
  const code = { mc: "STM_MCQ", inl: "STM_INL", all: "STM_ALL", multi: "STM_MUL" }[kind];
  if (state !== "out") await goTo(page, code);
  if (kind === "mc" || kind === "inl") {
    if (state === "right") await pickMC(page, RIGHT[code]);
    else if (state === "wrong") { await pickMC(page, kind === "mc" ? "a" : "b"); await verdictCount(page, 1); }
    else { await pickMC(page, kind === "mc" ? "b" : "c"); await verdictCount(page, 2); }
  } else if (kind === "all") {
    if (state === "right") await pickAll(page, RIGHT[code]);
    else if (state === "wrong") { await pickAll(page, ["a", "b"]); await verdictCount(page, 1); }
    else { await pickAll(page, ["a", "d"]); await verdictCount(page, 2); }
  } else if (state === "right") { await part(page, 0, "2"); await verdictCount(page, 1); await part(page, 1, "4"); }
  else if (state === "wrong") { await part(page, 0, "9"); await verdictCount(page, 1); }
  else { await page.fill('#q .part[data-i="0"] .ans', "8"); await page.click("#go0"); await verdictCount(page, 2); }
  if (state !== "wrong") await page.waitForSelector("#q.closed");
  await page.waitForTimeout(SETTLE + 300);
}
const drawerOpen = page => page.evaluate(() => { const d = document.querySelector("#q .vdrawer"); return !!d && !d.hidden && getComputedStyle(d).display !== "none"; });
/* where the reopen target lives per kind */
const ICON = { mc: "#q .ch:has(.opt.wrong, .opt.right) .vkb", inl: "#q .ch:has(.opt.wrong, .opt.right) .vkb", all: "#q .ch:has(.opt.wrong, .opt.right) .vkb", multi: "#q .part .ff .vk[role=button]" };
const move = page => page.evaluate(() => {
  const t = s => [...document.querySelectorAll(s)].map(e => Math.round(e.getBoundingClientRect().top + scrollY));
  return { q: Math.round(document.querySelector("#q").getBoundingClientRect().height), ch: t("#q .ch"), chk: t("#q .chk"), part: t("#q .part"), ff: t("#q .part .ff"), nx: t("#q .nx"), fb: t("#fb"), wish: t("#wish"), choices: t("#q .choices") };
});

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const CASES = [["mc", [360, 390, 1280], ["wrong", "out", "right"]], ["inl", [390], ["wrong", "right"]], ["all", [390], ["wrong", "right"]], ["multi", [390], ["wrong", "right"]]];
const SIZE = { 360: 740, 390: 844, 1280: 800 };
for (const [kind, widths, states] of CASES) {
  for (const W of widths) {
    if (process.env.SL_W && +process.env.SL_W !== W) continue;
    let pg = null;
    for (const state of states) {
      const T = `${W} ${kind} ${state}`;
      if (state !== "out") { if (pg) await pg.ctx.close(); pg = await pageFor(browser, W, SIZE[W]); }
      await reach(pg, kind, state);
      if (kind === "multi" && state === "wrong") {   // a part miss with a try left makes no Cluck chip (partFeedback never calls wishOnWrong; Cluck comes when the whole item closes): nothing to host
        await step(`${T}: a part miss with a try left has no chip, so no drawer; the part keeps its own mark`, async () => {
          assert.equal(await drawerOpen(pg), false); assert.equal(await pg.evaluate(() => document.querySelectorAll("#q .vkb").length), 0);
          assert.ok(await pg.isVisible('#q .part[data-i="0"] .vk'), "part mark");
        });
        continue;
      }
      await step(`${T}: the drawer is open after the verdict, never a child of its host, one Ask Cluck chip`, async () => {
        assert.ok(await drawerOpen(pg), "no open drawer after the verdict");
        const rel = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), host = d.previousElementSibling; return { nest: !!d.closest(".opt, .ff, .ch"), n: document.querySelectorAll("#q .vdrawer").length, chips: document.querySelectorAll(".wchip").length, inD: d.querySelectorAll(".wchip").length, prev: host && host.className }; });
        assert.ok(!rel.nest && rel.n === 1 && rel.inD === 1 && rel.chips === 1, JSON.stringify(rel));
      });
      if (!(await drawerOpen(pg))) continue;
      await step(`${T}: overlap: points inside the open drawer are the drawer, not later content`, async () => {
        const bad = await pg.evaluate(() => {
          const t = document.querySelector("#q .vdrawer"), out = [];
          t.scrollIntoView({ block: "center" });
          const a = t.getBoundingClientRect();
          for (const [fx, fy] of [[.1, .85], [.5, .85], [.9, .85], [.5, .5]]) { const e = document.elementFromPoint(a.left + a.width * fx, a.top + a.height * fy); if (!e || !t.contains(e)) out.push(fx + "," + fy + "=" + (e ? e.className || e.tagName : "null")); }
          return out;
        });
        assert.deepEqual(bad, [], "something is painted over the drawer");
      });
      await step(`${T}: contents: Ask Cluck + a 44px close${kind === "mc" || kind === "inl" ? " + Skip / Next" : ", no Next"}, nothing cut`, async () => {
        const c = await pg.evaluate(() => {
          const d = document.querySelector("#q .vdrawer"), r = e => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; }, chip = d.querySelector(".wchip"), x = d.querySelector(".vd-x"), nx = d.querySelector(".vd-next");
          const a = d.getBoundingClientRect(), inside = e => { const b = e.getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5; };
          return { chip: chip && r(chip), x: x && r(x), nx: nx && { ...r(nx), txt: nx.textContent, cut: nx.scrollWidth > nx.clientWidth + 1, in: inside(nx) }, cut: chip && chip.scrollWidth > chip.clientWidth + 1, in: chip && inside(chip), inx: x && inside(x), text: chip && chip.textContent.trim() };
        });
        assert.ok(c.chip && c.x && c.chip.h >= 44 && c.x.h >= 44 && c.x.w >= 44 && !c.cut && c.in && c.inx, JSON.stringify(c));
        if (kind === "mc" || kind === "inl") {
          assert.ok(c.nx && c.nx.h >= 44 && !c.nx.cut && c.nx.in, JSON.stringify(c));
          assert.equal(c.nx.txt, state === "wrong" ? "Skip" : "Next");
        } else assert.equal(c.nx, null, "pick-all / multi: Next stays in the slot until PR-C");
      });
      if ((kind === "mc" || kind === "inl") && state !== "wrong") {
        await step(`${T}: the drawer's Next is the filled --action control (computed background = --action); the slot Next stays`, async () => {
          const r = await pg.evaluate(() => {
            const nx = document.querySelector("#q .vdrawer .vd-next"), probe = document.createElement("i"); probe.style.backgroundColor = "var(--action)"; document.body.append(probe);
            const want = getComputedStyle(probe).backgroundColor; probe.remove();
            return { bg: getComputedStyle(nx).backgroundColor, want, slot: !!document.querySelector("#q .nx") };
          });
          assert.equal(r.bg, r.want, "drawer Next bg"); assert.ok(r.slot, "the row's own Next must stay (Tony: both)");
        });
        await step(`${T}: the drawer's Next goes to the next question`, async () => {
          const before = await pg.textContent("#pcode");
          await pg.click("#q .vdrawer .vd-next"); await pg.waitForTimeout(700);
          assert.notEqual(await pg.textContent("#pcode"), before);
        });
        continue;   // Next left the page: the rest needs a fresh one
      }
      await step(`${T}: reflow 0: closing the drawer moves nothing; focus returns to the reopen target`, async () => {
        const a = await move(pg);
        await pg.click("#q .vdrawer .vd-x"); await pg.waitForTimeout(SETTLE);
        const b = await move(pg);
        assert.deepEqual(b, a, "something moved when the drawer closed");
        assert.equal(await drawerOpen(pg), false, "still showing after close");
        assert.equal(await pg.evaluate(sel => { const e = document.activeElement; return !!e && e.matches(sel); }, ICON[kind]), true, "focus must return to the reopen target");
      });
      await step(`${T}: the mark reopens it (aria-expanded), Esc closes, a tap outside closes`, async () => {
        const ic = pg.locator(ICON[kind]).last();
        assert.equal(await ic.getAttribute("aria-expanded"), "false");
        const box = await ic.boundingBox(); assert.ok(box.width >= 44 - 0.5 && box.height >= 44 - 0.5, "reopen target under 44px: " + JSON.stringify(box));
        await ic.click(); await pg.waitForTimeout(SETTLE);
        assert.ok(await drawerOpen(pg), "the mark did not reopen it"); assert.equal(await ic.getAttribute("aria-expanded"), "true");
        await pg.keyboard.press("Escape"); await pg.waitForTimeout(SETTLE);
        assert.equal(await drawerOpen(pg), false, "Esc did not close");
        await ic.click(); await pg.waitForTimeout(SETTLE);
        await pg.mouse.click(5, 5); await pg.waitForTimeout(SETTLE);
        assert.equal(await drawerOpen(pg), false, "an outside tap did not close");
      });
      if (SHOTS) { await pg.locator(ICON[kind]).last().click(); await pg.waitForTimeout(SETTLE); await pg.screenshot({ path: `${SHOTS}/${kind}-${state}-${W}.png` }); }
      assert.deepEqual(pg.errs, [], "page errors");
    }
    if (pg) await pg.ctx.close();
  }
}

await step("inline pills: the drawer follows the whole group (a sibling after .choices), not a row", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STM_INL"); const inl = await pg.evaluate(() => document.querySelector("#q .choices").classList.contains("inline"));
  await pickMC(pg, "b"); await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE + 300);
  const r = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), g = document.querySelector("#q .choices"); return { after: d && d.previousElementSibling === g || (d && d.previousElementSibling && d.previousElementSibling.classList.contains("pips") && d.previousElementSibling.previousElementSibling === g), open: !!d && !d.hidden }; });
  assert.ok(r.open && r.after, JSON.stringify({ inl, ...r })); await pg.ctx.close();
});

await step("multi: one drawer + one chip (Cluck comes when the item closes); it hangs under the newest verdict and moves to a part when its icon is tapped", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STM_MUL");
  await part(pg, 0, "9"); await verdictCount(pg, 1); await pg.fill('#q .part[data-i="0"] .ans', "8"); await pg.click("#go0"); await verdictCount(pg, 2);   // part a: out of tries (locked)
  await pg.waitForTimeout(SETTLE);
  await part(pg, 1, "4"); await pg.waitForSelector("#q.closed"); await pg.waitForTimeout(SETTLE + 300);   // part b right: the item closes, Cluck's chip comes
  const under = () => pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"); const prev = d && d.previousElementSibling; return { n: document.querySelectorAll("#q .vdrawer").length, chips: document.querySelectorAll(".wchip").length, open: !!d && !d.hidden, host: prev && prev.closest(".part") && prev.closest(".part").dataset.i, hostPips: prev && prev.classList.contains("pips") && prev.previousElementSibling.closest(".part").dataset.i }; });
  const at = (u, i) => u.open && u.n === 1 && u.chips === 1 && (u.host === i || u.hostPips === i);
  let u = await under(); assert.ok(at(u, "1"), "part b (newest): " + JSON.stringify(u));
  await pg.click('#q .part[data-i="0"] .ff .vk[role=button]'); await pg.waitForTimeout(SETTLE + 300);
  u = await under(); assert.ok(at(u, "0"), "moved to part a: " + JSON.stringify(u));
  await pg.click('#q .part[data-i="1"] .ff .vk[role=button]'); await pg.waitForTimeout(SETTLE + 300);
  u = await under(); assert.ok(at(u, "1"), "back to part b: " + JSON.stringify(u));
  assert.deepEqual(pg.errs, []); await pg.ctx.close();
});

await step("the first close by ^ on a row teaches the badge once (toast), never twice; storage is per user", async () => {
  const pg = await pageFor(browser, 390, 844, { tip: true });
  await goTo(pg, "STM_MCQ"); await pickMC(pg, "a"); await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE + 300);
  const shown = () => pg.evaluate(() => { const n = document.querySelector(".stoast.on, .stoast-note.on, [class*=stoast].on"); return !!n && /badge/i.test(n.textContent); });
  await pg.click("#q .vdrawer .vd-x");
  await pg.waitForFunction(() => /badge/i.test(document.body.innerText), null, { timeout: 3000 });
  assert.equal(await pg.evaluate(() => localStorage.getItem("stem-strip-badge")), "1");
  await pg.waitForTimeout(6000);
  await pg.locator(ICON.mc).last().click(); await pg.waitForTimeout(SETTLE);
  await pg.click("#q .vdrawer .vd-x"); await pg.waitForTimeout(700);
  assert.equal(await pg.evaluate(() => /badge/i.test(document.body.innerText)), false, "the toast came a second time");
  await pg.ctx.close();
});

await step("a question without Cluck's key has no drawer on mc / pick-all / multi", async () => {
  for (const code of ["STM_MCQ", "STM_ALL"]) {
    const pg = await pageFor(browser, 390, 844);
    await goTo(pg, code); await pg.evaluate(() => { window.__drill.state.prob.wish = false; });
    if (code === "STM_MCQ") await pickMC(pg, "a"); else await pickAll(pg, ["a", "b"]);
    await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE + 300);
    assert.equal(await drawerOpen(pg), false, code); assert.equal(await pg.evaluate(() => document.querySelectorAll("#q .vkb").length), 0, code + " stray badge buttons");
    await pg.ctx.close();
  }
});

await step("the drawer's chip stays live across Cluck's sheet (PR 385 CI): /explain fails, tap the chip, Escape at once, the chip is back and focused, a second tap opens the sheet again", async () => {
  const pg = await pageFor(browser, 1280, 800);
  await pg.route("**/explain", r => r.fulfill({ status: 500, body: "" }));   // a failed wish repaints #wish: a fresh chip, which the strip re-docks
  await goTo(pg, "STM_MCQ"); await pickMC(pg, "a");
  await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE);
  const opened = () => pg.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden; }, null, { timeout: 4000 });
  await pg.click("#q .vdrawer .wchip"); await opened();
  await pg.waitForTimeout(150);                                               // inside the drawer's 260 ms shut animation: the old code let its timer hide it for good
  await pg.keyboard.press("Escape");
  await pg.waitForFunction(() => document.querySelector("#cluck").hidden, null, { timeout: 3000 });
  await pg.waitForTimeout(SETTLE);
  assert.equal(await drawerOpen(pg), true, "the drawer is back once the sheet closes");
  assert.equal(await pg.evaluate(() => document.activeElement.matches(".vdrawer .wchip")), true, "focus returns to the chip");
  await pg.click("#q .vdrawer .wchip");
  await opened().catch(() => { throw new Error("the second tap on the chip did nothing (its handler sat on a stale chip)"); });
  await pg.ctx.close();
});

await step("phone: a tap inside Cluck's sheet is not a tap outside the drawer (ux-flows@phone 23 cluck-errors, PR 385 CI): tap Try again in the sheet, close it, the drawer and its chip are back", async () => {
  const pg = await pageFor(browser, 390, 844);
  await pg.route("**/explain", r => r.fulfill({ status: 500, body: "" }));
  await goTo(pg, "STM_MCQ"); await pickMC(pg, "a");
  await verdictCount(pg, 1); await pg.waitForTimeout(SETTLE);
  const opened = () => pg.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden; }, null, { timeout: 4000 });
  await pg.click("#q .vdrawer .wchip"); await opened();
  await pg.waitForSelector("#cluck .wtext .wretry", { timeout: 6000 });
  await pg.waitForTimeout(SETTLE);
  await pg.click("#cluck .wtext .wretry");                                    // a tap in the sheet (the sheet floats over the drawer at phone width: #wish stays shown)
  await pg.waitForTimeout(SETTLE);
  await pg.keyboard.press("Escape");
  await pg.waitForFunction(() => document.querySelector("#cluck").hidden, null, { timeout: 3000 });
  await pg.waitForTimeout(SETTLE);
  assert.equal(await drawerOpen(pg), true, "the sheet tap closed the drawer for good (it counted as a tap outside)");
  assert.equal(await pg.evaluate(() => { const c = document.querySelector("#q .vdrawer .wchip"), r = c.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && c.contains(e); }), true, "the chip is tappable");
  await pg.click("#q .vdrawer .wchip");
  await opened().catch(() => { throw new Error("the chip did nothing after the sheet closed"); });
  await pg.ctx.close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
