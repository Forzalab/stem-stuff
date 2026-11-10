// UI audit A (AI-mode entry points), read-only. Local serve.py only; /explain, /chat stubbed with page.route; YouTube aborted.
// usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node shoot.mjs <appRoot> <outDir> [port]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const [ROOT, OUT, PORTARG] = process.argv.slice(2);
const PORT = +(PORTARG || 8861), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "audit-a-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const base = { type: "mc", shuffle: false, choices: ch("1.0 m/s", "2.0 m/s", "3.0 m/s"), correct: "b", wrong: [{ choice: "a", hint: "QUACK. Total mass." }] };
const body = md => [{ type: "text", md }];
const NS = { ...base, code: "CALC1_N01", body: body("A 2.0 kg cart rolls at $3.0$ m/s. How fast after it sticks to a 1.0 kg cart?"),
  saccharine: { title: "Practice Exam 2, Question 1", tip: "Momentum before equals after.", key: "Answer: b", part: ["P_MOM"] } };
const SN = { ...base, code: "CALC1_N02", sugar_only: true, body: body("Snack: a 4.0 kg cart at 3.0 m/s sticks to a 2.0 kg cart. How fast after?"),
  saccharine: { title: "Practice Exam 2, Question 1: masses doubled", key: "Answer: b", snack: true, before: "CALC1_N01", part: ["P_MOM"],
    original: { q: 1, body: body("The original question 1."), solution: ["Use: $p = mv$", "Answer: 2.0 m/s"] } } };
const PL = { ...base, code: "CALC1_N03", body: body("Plain question, no Cluck layer: a 2.0 kg cart at 3.0 m/s hits a 1.0 kg cart.") };   // no saccharine key: no wish
mkdirSync(BANKS, { recursive: true }); mkdirSync(OUT, { recursive: true });
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 1, groups: [{ name: "Momentum", rows: [{ id: "P_MOM", tex: "p = mv" }] }] }));
writeFileSync(join(BANKS, "BANK_AU12.json"), JSON.stringify({ v: 1, problems: [NS, SN, PL] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { cwd: ROOT, env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: ["ignore", openSync(join(TMP, "srv.log"), "a"), openSync(join(TMP, "srv.log"), "a")] });
const TEXT = "Momentum is conserved in the sticking collision. Before: 2.0 kg times 3.0 m/s. After: 3.0 kg times v. So v is 2.0 m/s, which is choice b.\n\nCheck: the heavier cart slows the pair.";
const DEV = { phone: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } };
const QS = { snack: SN, nonsnack: NS, plain: PL };
const STATES = ["before", "wrong-writing", "wrong-done", "fail500", "fail503", "cap-local", "cap-429"];
const facts = () => {
  const vis = el => !!el && !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const y = el => vis(el) ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  const t = el => el ? el.textContent.replace(/\s+/g, " ").trim() : null;
  const card = document.querySelector("#origHd"), chip = document.querySelector("#wish .wchip"), hint = document.querySelector("#fb .cluck, #q .chk .cluck");
  const rot = document.querySelector("#rot"), fc = document.querySelector("#fcard"), cl = document.querySelector("#cluck");
  const rotShown = vis(rot) && !rot.classList.contains("parked");
  const clOpen = vis(cl);
  return {
    card: vis(card) ? t(card.querySelector(".rw-hint-t")) + (vis(document.querySelector(".rw-free")) ? " [FREE]" : "") : null, cardY: y(card),
    chip: vis(chip) ? t(chip) : null, chipY: y(chip),
    hint: vis(hint) ? t(hint).slice(0, 30) : null, hintY: y(hint),
    rot: rotShown ? (rot.classList.contains("docked") ? "docked" : "floating") + (rot.classList.contains("stashed") ? "+stashed" : "") + " / label=" + t(rot.querySelector(".rot-hd .xb-label")) + " / link=" + t(rot.querySelector(".rot-link")) : null,
    fcard: vis(fc) ? t(fc.querySelector(".fc-notch")) : null, fcardY: y(fc),
    sheet: clOpen ? { title: t(cl.querySelector(".cl-title")), explainPane: vis(cl.querySelector("#clTabEP")), fold: vis(cl.querySelector("#clFold")) ? cl.querySelector("#clFold").getAttribute("aria-expanded") : null,
      ask: vis(cl.querySelector(".cl-ft")) ? (cl.querySelector(".cl-ft input")?.placeholder || "input") : null, text: t(cl.querySelector(".wtext"))?.slice(0, 70) } : null,
    entries: [vis(card) && "card", vis(chip) && "chip"].filter(Boolean),
  };
};
const rows = [];
const srvUp = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) return; } catch { /* */ } await new Promise(r => setTimeout(r, 100)); } };
await srvUp();
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [dn, dv] of Object.entries(DEV)) for (const [qn, q] of Object.entries(QS)) for (const st of STATES) {
    if (qn === "plain" && !["before", "wrong-done"].includes(st)) continue;
    const ctx = await browser.newContext({ ...dv, serviceWorkers: "block" });
    const cap = st === "cap-local" ? Date.now() : 0;
    await ctx.addInitScript(c => { try { localStorage.setItem("stem-ob", "done"); if (c) localStorage.setItem("stem-wish", JSON.stringify([1, 2, 3, 4, 5].map(i => c - i * 1000))); } catch { /* */ } }, cap);
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    const calls = { explain: 0, chat: 0 };
    await page.route("**/explain", r => { calls.explain++;
      if (st === "wrong-writing") return;                                   // never answers: the stream stays open
      if (st === "fail500") return r.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
      if (st === "fail503") return r.fulfill({ status: 503, contentType: "text/plain", body: "off" });
      if (st === "cap-429") return r.fulfill({ status: 429, contentType: "text/plain", body: "cap" });
      r.fulfill({ contentType: "text/plain", body: TEXT }); });
    await page.route("**/chat", r => { calls.chat++; r.fulfill({ contentType: "text/plain", body: "QUACK. Stub chat reply." }); });
    await page.goto(BASE + "/#" + q.code);
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent.length > 0 && location.hash === "#" + c, q.code, { timeout: 10000 });
    await page.waitForTimeout(1200);
    if (st !== "before") {
      await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
      await page.waitForTimeout(st === "wrong-done" || st.startsWith("cap") ? 3500 : 1800);
    }
    const name = (s) => `${dn}-${qn}-${st}-${s}`;
    const snap = async (s) => { const f = await page.evaluate(facts); const file = `${name(s)}.png`; await page.screenshot({ path: join(OUT, file) }); rows.push({ dev: dn, q: qn, st, sheet: s, shot: file, ...f, explainCalls: calls.explain }); return f; };
    const f0 = await snap(await page.evaluate(() => { const c = document.querySelector("#cluck"); return c && !c.hidden ? "open" : "closed"; }));
    if (f0.sheet) {                                                         // landed open (desktop auto-open): close it
      await page.locator("#cluck .cl-x:visible").first().click(); await page.waitForTimeout(500); await snap("closed");
    } else if (f0.entries.length) {                                         // landed closed: open it by the first entry
      await page.click(f0.entries.includes("chip") ? "#wish .wchip" : "#origHd"); await page.waitForTimeout(3500); await snap("open");
    }
    await ctx.close();
  }
} finally { await browser.close(); srv.kill(); }
writeFileSync(join(OUT, "facts.json"), JSON.stringify(rows, null, 1));
console.log("rows", rows.length, "log", join(TMP, "srv.log"));
