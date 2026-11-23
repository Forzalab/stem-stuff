// The codeblock (T43): a fenced cpp block in a question and in a choice, at 360 and 1280. No sideways page scroll, a well inside the card's margin,
// Tokyo Night token classes, a number per real line, a long line wraps hanging under its indent, the header shows the language,
// Copy (>= 44px) copies the raw code and shows i-ok for ~2 s, no KaTeX inside code. Starts its own serve.py with a throwaway bank.
//   node tests/codeblock.pw.mjs [port] [shots dir: also saves 360 / 390 / 1280 screenshots there]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: fonts.ready + painted frames, not 150 ms
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
  "  std::cout << \"s = \" << s << \" (odd squares, added up one by one in the loop above)\" << std::endl << std::flush << \"done\";",   // ~115 chars: ~1.8x the 1280 box (~62 chars of 16px mono), so it wraps whatever the page's type step is
  "}",
].join("\n");
const P = [{ code: "CSCI26_CB1", type: "mc", body: [{ type: "text", md: "What does the program print for $s$?\n\n```cpp\n" + CODE + "\n```" }],
  choices: [{ id: "a", md: "10" }, { id: "b", md: "30" }, { id: "c", md: "```cpp\nint s = 1 + 9;\n```" }, { id: "d", md: "20" }], correct: "a" }];
writeFileSync(join(BANKS, "BANK_CB1.json"), JSON.stringify({ v: 1, problems: P }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
await serverUp(BASE);

let bad = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; };

/* runs in the page: what the checks read */
function measure() {
  const cb = document.querySelector("#blocks .cb"), card = document.querySelector("#problem");
  const ls = [...cb.querySelectorAll(".l")], c = cb.getBoundingClientRect(), p = card.getBoundingClientRect();
  const long = ls[7], g = document.createRange(); g.selectNodeContents(long);   // the long line (indent 2)
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
    inset: [Math.round(c.left - p.left), Math.round(p.right - c.right)], pad: Math.round(parseFloat(getComputedStyle(card).paddingLeft)), radius: getComputedStyle(cb).borderRadius,
    copyW: copy.width, copyH: copy.height, katex: cb.querySelectorAll(".katex").length,
    toks: [...cb.querySelectorAll("[class^='t-']")].map(e => e.className + ":" + e.textContent),
    colours: new Set([...cb.querySelectorAll("[class^='t-']")].map(e => e.className + getComputedStyle(e).color)).size,
    ink: getComputedStyle(cb.querySelector("code")).color, kw: getComputedStyle(cb.querySelector(".t-kw")).color,
    choice: (() => { const x = document.querySelector("#q .opt .cb"); return x ? { copy: !!x.querySelector(".cb-copy"), lines: x.querySelectorAll(".l").length } : null; })(),
  };
}

const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
try {
  for (const width of [360, 390, 1280]) {
    const phone = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: phone ? 800 : 900 }, serviceWorkers: "block", isMobile: phone, hasTouch: phone });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#CSCI26_CB1`);
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CSCI26_CB1" && document.querySelector("#blocks .cb"), null, { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await settled(page, "#blocks .cb");
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `codeblock-${width}-v2.png`), fullPage: true }); }
    if (width === 390) { await ctx.close(); continue; }                 // 390: the screenshot only
    const at = `${width}px:`;
    /* CB-NOWRAP (Nov 16): wrap is off by default (no soft wrap, the code scrolls inside its box); Wrap turns the hang-wrap on */
    const nw = await page.$eval("#blocks .cb", cb => { const pre = cb.querySelector("pre"), r = cb.getBoundingClientRect();
      return { nowrap: cb.classList.contains("cb-nowrap"), pressed: cb.querySelector(".cb-wrap")?.getAttribute("aria-pressed"), fits: r.right <= document.documentElement.clientWidth + 0.5, ws: getComputedStyle(cb.querySelector(".l")).whiteSpace, scrolls: pre.scrollWidth > pre.clientWidth }; });
    check(nw.nowrap && nw.pressed === "false" && nw.ws === "pre" && nw.fits, `${at} default: no wrap, Wrap off, the box fits the column ${JSON.stringify(nw)}`);
    check(width > 480 || nw.scrolls, `${at} phone: the long line scrolls inside the box ${JSON.stringify(nw)}`);
    await page.click("#blocks .cb-wrap");
    check(await page.$eval("#blocks .cb", cb => !cb.classList.contains("cb-nowrap") && cb.querySelector(".cb-wrap").getAttribute("aria-pressed") === "true"), `${at} Wrap turns wrapping on`);
    const m = await page.evaluate(measure);
    check(m.scrollW <= m.innerW, `${at} no sideways page scroll (${m.scrollW} <= ${m.innerW})`);
    check(m.lang === "C++" && m.label === "C++ code", `${at} the header shows the language (${m.lang})`);
    check(m.lines === 9 && (width <= 480 ? !m.numbered : m.numbered), `${at} one line per real line, numbered on desktop only (${m.lines})`);   // CB-PHONE: no gutter on phones
    check(/Atkinson Hyperlegible Mono/.test(m.font) && m.size === (width <= 480 ? "14px" : "16px") && m.weight === "400", `${at} --mono ${width <= 480 ? 14 : 16}px 400 (${m.size} ${m.weight})`);   // CB-PHONE-13 (Nov 16): 13px on phones
    check(m.pad > 0 && m.inset[0] === m.pad && m.inset[1] === m.pad && m.radius === "8px", `${at} a well inside the card's margin, 8px radius (${m.inset} pad ${m.pad} ${m.radius})`);
    check(m.longRows >= 2 && m.lefts.length === m.longRows, `${at} the long line wraps (${m.longRows} rows)`);
    check(m.lefts.slice(1).every(x => Math.abs(x - m.lefts[0] - 4 * m.ch) <= 1), `${at} every wrapped row hangs at its indent + 2ch (${m.lefts}, 1ch ${m.ch.toFixed(1)})`);
    if (!phone) check(m.forRows === 1, `${at} a line that fits stays one row`);
    check(m.copyW >= 44 && m.copyH >= 44, `${at} Copy is a 44px target (${m.copyW}x${m.copyH})`);
    check(m.katex === 0, `${at} no KaTeX inside code`);
    const want = ["t-pre:#include <iostream>", "t-type:int", "t-fn:main", "t-kw:for", "t-num:0", "t-kw:continue", "t-com:// odd squares only: $i^2$", 't-str:"s = "'];
    check(want.every(t => m.toks.includes(t)), `${at} the spans carry the token classes (${want.filter(t => !m.toks.includes(t))})`);
    check(m.kw === "rgb(187, 154, 247)" && m.kw !== m.ink, `${at} a keyword wears --syn-kw (${m.kw})`);
    check(m.choice && !m.choice.copy && m.choice.lines === 1, `${at} a choice's fence is a codeblock without Copy`);
    await page.click("#blocks .cb-copy");
    await page.waitForFunction(() => document.querySelector("#blocks .cb-copy use").getAttribute("href") === "#i-ok", null, { timeout: 2000 });
    const got = await page.evaluate(() => navigator.clipboard.readText());
    check(got === CODE, `${at} Copy copies the raw code`);
    if (got !== CODE) console.log(JSON.stringify(got));
    if (SHOTS && width === 360) await page.screenshot({ path: join(SHOTS, "codeblock-360-copied-v2.png") });
    await page.waitForTimeout(1500);   // keep: app timer — the "copied" tick lives ~2 s, so 1.5 s must still show it
    check(await page.$eval("#blocks .cb-copy use", u => u.getAttribute("href")) === "#i-ok", `${at} still "copied" at 1.5 s`);
    await page.waitForTimeout(800);   // keep: app timer — past the tick's lifetime (~2 s), back to Copy
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
