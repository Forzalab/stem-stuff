// tools/fig_png.mjs: every graph block in problems.json (and banks/*.json) -> banks/figs/<code>-<i>.png, i = the block's index in body.
// The Claude arm of Cluck sends it with the question (serve.fig_images); the non-vision arm gets the JSON only.
// Light theme, white background, fit inside ~400x300 (Graph.render at 400 wide, narrower when that comes out taller than 300), then
// ImageMagick to a 32-colour palette so a figure stays small. Idempotent: a PNG whose bytes would not change is left alone.
//   node tools/fig_png.mjs          (playwright-core + Chromium from /opt/pw-browsers; never `playwright install`)
//   node tools/fig_png.mjs --check  exits 1 naming each graph block with no PNG (tests/test_serve.py runs the same check in Python)
//   --root DIR: DIR's problems.json + DIR/banks/*.json -> DIR/banks/figs, drawn with DIR's graph.js/app.css/vendor (default: this
//   checkout). tools/ship.sh renders + checks its deploy dir this way, so the brain-only banks (BANK_P3X, Exam 3) ship their PNGs too.
//   Playwright still comes from this checkout's tests/node_modules.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ri = process.argv.indexOf("--root");
if (ri > 0 && !process.argv[ri + 1]) { console.error("usage: node tools/fig_png.mjs [--check] [--root DIR]"); process.exit(2); }
const ROOT = ri > 0 ? resolve(process.argv[ri + 1]) : HERE;
const OUT = join(ROOT, "banks", "figs");
const W = 400, H = 300;

function blocks() {
  const bd = join(ROOT, "banks");
  const files = [join(ROOT, "problems.json"), ...(existsSync(bd) ? readdirSync(bd).filter(f => f.endsWith(".json")).map(f => join(bd, f)) : [])].filter(f => existsSync(f));
  const out = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(f, "utf8"));
    const ps = Array.isArray(d) ? d : Array.isArray(d.problems) ? d.problems : [];
    for (const p of ps) (p.body || []).forEach((b, i) => { if (b && b.type === "graph") out.push({ name: `${p.code}-${i}.png`, block: b }); });
  }
  return out;
}

const all = blocks();
if (process.argv.includes("--check")) {
  const miss = all.filter(x => !existsSync(join(OUT, x.name))).map(x => x.name);
  if (miss.length) { console.error(`missing figure PNGs (run: node tools/fig_png.mjs): ${miss.join(", ")}`); process.exit(1); }
  console.log(`ok ${all.length} figure PNGs`); process.exit(0);
}
if (!all.length) { console.log("fig_png: 0 blocks"); process.exit(0); }   // no browser needed

let pw;
for (const m of [join(HERE, "tests/node_modules/playwright-core"), "playwright-core", "/opt/node22/lib/node_modules/playwright"]) { try { pw = require(m); break; } catch { /* next */ } }
if (!pw) { console.error("fig_png: no playwright-core (cd tests && npm ci)"); process.exit(1); }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";   // else Playwright's own cache (CI)
const u = p => pathToFileURL(join(ROOT, p)).href;
const LIGHT = "--page:#fff;--card:#fff;--float:#f2f4f7;--line:#c9d1dc;--ink:#111a26;--muted:#4f5d70;--paper:#fff;--field:#fff;--qbox:#fff;" +
  "--body:#fff;--bg:#fff;--ramp:#fff;--knock:rgb(255 255 255 / 0.85);--action:#1d5fc9;--c1:#1d5fc9;--c1-hi:#0e3f8f;--c2:#c25e00;--c3:#b4237a;--grid:#dde3ea;" +
  "--correct:#0a7d55;--wrong:#c22b44;--help:#c25e00";
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${u("vendor/katex/katex.min.css")}"><link rel="stylesheet" href="${u("app.css")}">
<style>:root,html,body{${LIGHT}} html,body{margin:0;background:#fff;color:var(--ink)} .fig{margin:0;background:#fff}</style>
<script src="${u("vendor/katex/katex.min.js")}"></script><script src="${u("vendor/math.min.js")}"></script><script src="${u("graph.js")}"></script>
<body><div class="fig" id="f"></div></body>`;
const tmp = join(OUT, ".render.html");
mkdirSync(OUT, { recursive: true });
writeFileSync(tmp, html);
let made = 0, same = 0, browser;
try {   // the launch too: a failed one must not leave .render.html in banks/figs (ship.sh's deploy dir)
  browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  for (const { name, block } of all) {
    const draw = w => page.evaluate(([b, w]) => { const f = document.getElementById("f"); f.style.width = w + "px"; f.innerHTML = ""; Graph.render(f, b); return f.getBoundingClientRect().height; }, [block, w]);
    let h = await draw(W);
    if (h > H) h = await draw(Math.max(160, Math.floor(W * H / h)));
    const raw = await page.locator("#f").screenshot({ animations: "disabled" });
    const png = execFileSync("convert", ["png:-", "-strip", "-colors", "32", "-define", "png:compression-level=9", "-define", "png:exclude-chunks=date,time", "PNG8:-"], { input: raw });
    const path = join(OUT, name);
    if (existsSync(path) && readFileSync(path).equals(png)) { same++; continue; }
    writeFileSync(path, png); made++;
  }
} finally { await browser?.close(); rmSync(tmp, { force: true }); }
console.log(`fig_png: ${all.length} blocks, ${made} written, ${same} unchanged -> banks/figs/`);
