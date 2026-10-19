// The codeblock (T43): a fenced cpp block in a question and in a choice, at 360 and 1280. No sideways page scroll, the band runs edge to
// edge of the question card, a number per real line, a long line wraps hanging under its indent, the header shows the language,
// Copy (>= 44px) copies the raw code and shows i-ok for ~2 s, no KaTeX inside code. Starts its own serve.py with a throwaway bank.
//   node tests/codeblock.pw.mjs [port] [shots dir: also saves 360 / 390 / 1280 screenshots there]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8824), BASE = `http://localhost:${PORT}`, SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "cb-")), BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const CODE = [
  "#include <iostream>",
  "int main() {",
  "  int s = 0;",
  "  for (int i = 1; i <= 4; i++) {",
  "    if (i % 2 == 0) continue;",
  "    s += i * i;  // odd squares only: $i^2$",
  "  }",
  "  std::cout << \"s = \" << s << \" (odd squares)\" << std::endl;",
  "}",
].join("\n");
const P = [{ code: "CSCI26_CB1", type: "mc", body: [{ type: "text", md: "What does the program print for $s$?\n\n```cpp\n" + CODE + "\n```" }],
  choices: [{ id: "a", md: "10" }, { id: "b", md: "30" }, { id: "c", md: "```cpp\nint s = 1 + 9;\n```" }, { id: "d", md: "20" }], correct: "a" }];
writeFileSync(join(BANKS, "BANK_CB1.json"), JSON.stringify({ v: 1, problems: P }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let bad = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; };

/* runs in the page: what the checks read */
function measure() {
  const cb = document.querySelector("#blocks .cb"), card = document.querySelector("#problem");
  const ls = [...cb.querySelectorAll(".l")], c = cb.getBoundingClientRect(), p = card.getBoundingClientRect();
  const long = ls[7], g = document.createRange(); g.selectNodeContents(long.firstChild);   // the long line (one text node, indent 2)
  const rows = new Map();                                              // each visual row's left edge: the first row, then the hanging ones
  for (const f of g.getClientRects()) { const t = Math.round(f.top); rows.set(t, Math.min(rows.get(t) ?? Infinity, Math.round(f.left))); }
  const lefts = [...rows.keys()].sort((x, y) => x - y).map(t => rows.get(t));
  const ch = (() => { const s = document.createElement("span"); s.textContent = "0"; cb.querySelector("code").append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; })();
  const lh = parseFloat(getComputedStyle(long).lineHeight), copy = cb.querySelector(".cb-copy").getBoundingClientRect();
  return {
    scrollW: document.scrollingElement.scrollWidth, innerW: innerWidth,
    lang: cb.querySelector(".cb-lang").textContent, label: cb.getAttribute("aria-label"),
    lines: ls.length, numbered: ls.every(l => getComputedStyle(l, "::before").content !== "none"),
    font: getComputedStyle(cb.querySelector("code")).fontFamily, size: getComputedStyle(cb.querySelector("code")).fontSize,
    weight: getComputedStyle(cb.querySelector("code")).fontWeight,
    longRows: Math.round(long.getBoundingClientRect().height / lh), forRows: Math.round(ls[3].getBoundingClientRect().height / lh), lefts, ch,
    bleed: [Math.round(c.left - p.left), Math.round(p.right - c.right)], radius: getComputedStyle(cb).borderRadius,
    copyW: copy.width, copyH: copy.height, katex: cb.querySelectorAll(".katex").length,
    muted: [...cb.querySelectorAll(".tc")].map(e => e.textContent),
    choice: (() => { const x = document.querySelector("#q .opt .cb"); return x ? { copy: !!x.querySelector(".cb-copy"), lines: x.querySelectorAll(".l").length } : null; })(),
  };
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [360, 390, 1280]) {
    const phone = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: phone ? 800 : 900 }, serviceWorkers: "block", isMobile: phone, hasTouch: phone });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#CSCI26_CB1`);
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CSCI26_CB1" && document.querySelector("#blocks .cb"), null, { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `codeblock-${width}.png`), fullPage: true }); }
    if (width === 390) { await ctx.close(); continue; }                 // 390: the screenshot only
    const m = await page.evaluate(measure);
    const at = `${width}px:`;
    check(m.scrollW <= m.innerW, `${at} no sideways page scroll (${m.scrollW} <= ${m.innerW})`);
    check(m.lang === "C++" && m.label === "C++ code", `${at} the header shows the language (${m.lang})`);
    check(m.lines === 9 && m.numbered, `${at} one numbered line per real line (${m.lines})`);
    check(/Atkinson Hyperlegible Mono/.test(m.font) && m.size === "16px" && m.weight === "400", `${at} --mono 16px 400 (${m.size} ${m.weight})`);
    check(m.bleed[0] === 0 && m.bleed[1] === 0 && m.radius === "0px", `${at} the band runs edge to edge of the card, no radius (${m.bleed} ${m.radius})`);
    check(m.longRows >= 2 && m.lefts.length === m.longRows, `${at} the long line wraps (${m.longRows} rows)`);
    check(m.lefts.slice(1).every(x => Math.abs(x - m.lefts[0] - 4 * m.ch) <= 1), `${at} every wrapped row hangs at its indent + 2ch (${m.lefts}, 1ch ${m.ch.toFixed(1)})`);
    if (!phone) check(m.forRows === 1, `${at} a line that fits stays one row`);
    check(m.copyW >= 44 && m.copyH >= 44, `${at} Copy is a 44px target (${m.copyW}x${m.copyH})`);
    check(m.katex === 0, `${at} no KaTeX inside code`);
    check(m.muted.length === 2 && m.muted[0] === "#include <iostream>" && m.muted[1] === "// odd squares only: $i^2$", `${at} only the #include and the comment are muted`);
    check(m.choice && !m.choice.copy && m.choice.lines === 1, `${at} a choice's fence is a codeblock without Copy`);
    await page.click("#blocks .cb-copy");
    await page.waitForFunction(() => document.querySelector("#blocks .cb-copy use").getAttribute("href") === "#i-ok", null, { timeout: 2000 });
    const got = await page.evaluate(() => navigator.clipboard.readText());
    check(got === CODE, `${at} Copy copies the raw code`);
    if (got !== CODE) console.log(JSON.stringify(got));
    if (SHOTS && width === 360) await page.screenshot({ path: join(SHOTS, "codeblock-360-copied.png") });
    await page.waitForTimeout(1500);
    check(await page.$eval("#blocks .cb-copy use", u => u.getAttribute("href")) === "#i-ok", `${at} still "copied" at 1.5 s`);
    await page.waitForTimeout(800);
    check(await page.$eval("#blocks .cb-copy use", u => u.getAttribute("href")) === "#i-copy", `${at} back to Copy after ~2 s`);
    check(await page.$$eval("#q .opt", os => os.every(o => o.getAttribute("aria-checked") === "false")), `${at} Copy picks no choice`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(bad ? `${bad} FAILED` : "codeblock: all ok");
if (bad) process.exit(1);
