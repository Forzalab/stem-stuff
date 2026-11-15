// BENTO3 gallery: renders 2-8 options (single choice AND pick-all) built from REAL bank answer lengths at 360 / 390 / 768 / 1366,
// checks no holes / no overlap / no overflow / no clipped text / tap >= 44 / no page h-scroll, screenshots (deviceScaleFactor 2).
//   node tools/audits/bento3_gallery.mjs [outDir] [port]      env: SHOTS_ALL=1 shoot every combo (default: n=5 at all widths + others at 390/1366)
// Real banks: server/data/banks + STEM_BANKS_SRC (default: brain _files bank json). Own serve.py, throwaway banks.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || "/home/claude/brain/projects/calc/_files/ui-polish/bento3/shots";
const PORT = +(process.argv[3] || 8931), BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });
/* ---- real answers ---- */
function walk(d, acc = []) { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) { if (!/node_modules|proposals/.test(f)) walk(p, acc); } else if (/BANK_.*\.json$/.test(f)) acc.push(p); } return acc; }
const srcs = [join(ROOT, "server/data/banks"), process.env.STEM_BANKS_SRC || "/home/claude/brain/projects/calc/_files"].filter(existsSync);
const sets = [];
for (const d of srcs) for (const f of walk(d)) { let j; try { j = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  for (const p of (Array.isArray(j) ? j : j.problems || [])) if (p && p.type === "mc" && (p.choices || []).length >= 4 && !p.choices.some(c => c.lock)) sets.push(p.choices.slice(0, 5).map(c => c.md)); }
const len = s => s.reduce((a, x) => a + x.length, 0) / s.length, mx = s => Math.max(...s.map(x => x.length)), mn = s => Math.min(...s.map(x => x.length));
const pureMath = x => /^\$[^$]+\$$/.test(x.trim());
const pick = (f, k = 0) => { const l = sets.filter(f).sort((a, b) => (a.join("").length - b.join("").length) || (a.join() < b.join() ? -1 : 1)); return l[Math.min(l.length - 1, Math.floor(l.length * (k || .5)))] || sets[0]; };
const words = (n, s) => { const w = (s.join(" ").trim() ? s : vl).join(" ").replace(/\$/g, "").split(/\s+/); let o = []; while (o.length < n) o = o.concat(w); return o.slice(0, n).join(" "); };
const vl = pick(s => mx(s) > 150, .5), longs = sets.filter(s => mn(s) > 45);
const SC = {
  short: pick(s => mx(s) <= 8, .5), math: pick(s => s.every(pureMath) && s.some(x => /frac|sqrt/.test(x)), .5), medium: pick(s => len(s) > 15 && len(s) < 28, .5),
  long: pick(s => mn(s) > 40, .5), mixed: pick(s => mx(s) > 5 * mn(s) && mx(s) > 40, .5), mixed2: pick(s => mx(s) > 4 * mn(s) && mx(s) > 25 && mn(s) < 10, .8),
  vlong: [words(65, vl), "None", words(30, vl.slice(1)), "$x^2$", words(75, vl.slice(2))], vlongall: [words(62, vl), words(64, vl.slice(1)), words(61, vl.slice(2)), words(66, vl.slice(3)), words(63, vl.slice(4))],
  words1: ["increases", "decreases", "stays constant", "oscillates", "None of these"],
};
const TAIL = ["$7$", "A fairly long extra option that explains the case in a sentence or two", "$\\dfrac{3}{4}$"];
const ids = "abcdefgh";
const ch = m => m.map((md, i) => ({ id: ids[i], md }));
const probs = [], names = [], CODE = {};
const codeOf = key => CODE[key] || (CODE[key] = "CALC1_B" + String(Object.keys(CODE).length + 1).padStart(3, "0"));
for (const [k, t] of Object.entries(SC)) {
  const eight = [...t, ...TAIL, ...t.slice(0, 3)].slice(0, 8);
  for (const kind of ["mc", "all"]) for (const n of [2, 3, 4, 5]) {
    const code = codeOf(`${k}|${kind}|${n}`);
    const choices = ch(eight.slice(0, n));
    probs.push({ code, type: "mc", shuffle: false, ...(kind === "all" ? { pick: "all", miss: "QUACK. miss", correct: ["a", "c"].filter(x => ids.indexOf(x) < n) } : { correct: "b" }), body: [{ type: "text", md: `Gallery ${k} ${kind} n=${n}` }], choices,
      ...(kind === "all" ? { wrong: choices.filter(c => !["a", "c"].includes(c.id)).map(c => ({ choice: c.id, error: "misread", hint: "QUACK. no" })) } : { wrong: [{ choice: "a", error: "misread", hint: "QUACK. no" }] }), saccharine: { title: "Gallery item", key: "Use: a\nAnswer: a", slip: {} } });
  }
  probs.push({ code: codeOf(`${k}|tail`), type: "mc", shuffle: false, correct: "a", body: [{ type: "text", md: "tail" }], choices: ch([...eight.slice(5, 8), "$1$", "$2$"]), wrong: [{ choice: "b", error: "misread", hint: "QUACK. no" }], saccharine: { title: "Gallery item", key: "Use: a\nAnswer: a", slip: {} } });
  names.push(k);
}
const TMP = mkdtempSync(join(tmpdir(), "bento3-")), BANKS = join(TMP, "banks"); mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_BNT3.json"), JSON.stringify({ v: 1, problems: probs }));
import { execFileSync } from "node:child_process";
try { console.log(execFileSync("node", [join(ROOT, "tools/bank_tools/schema-check.mjs"), join(BANKS, "BANK_BNT3.json")]).toString().slice(0, 600)); } catch (e) { console.log(String(e.stdout).slice(0, 800)); }
const srv = spawn("python3", [join(ROOT, "server/http_server/serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* */ } await new Promise(r => setTimeout(r, 100)); }
console.log("srv", await (await fetch(BASE + "/p/" + CODE["short|mc|2"] + ".json")).text().then(t => t.slice(0, 200)));
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const CHECK = () => {
  const g = document.querySelector("#q .choices"), out = { bento: g.dataset.bento || "" , bad: [] };
  const chs = [...g.children].filter(c => c.classList.contains("ch")); out.n = chs.length;
  if (out.bento === "grid") {
    const C = +getComputedStyle(g).getPropertyValue("--bc"), rows = Math.round((g.getBoundingClientRect().height + 8) / 108), occ = {};
    out.C = C; out.rows = rows; out.shapes = [];
    for (const c of chs) { const m = c.style.gridColumn.match(/(\d+) \/ span (\d+)/), r = c.style.gridRow.match(/(\d+) \/ span (\d+)/); out.shapes.push(`${m[2]}x${r[2]}`);
      for (let y = +r[1]; y < +r[1] + +r[2]; y++) for (let x = +m[1]; x < +m[1] + +m[2]; x++) { const k = x + "," + y; if (occ[k]) out.bad.push("overlap " + k); occ[k] = 1; } }
    for (let y = 1; y <= rows; y++) for (let x = 1; x <= C; x++) if (!occ[x + "," + y]) out.bad.push(`hole ${x},${y}`);
  } else out.bad.push("not bento");
  for (const o of g.querySelectorAll(".opt")) { const t = o.querySelector(".txt"), r = o.getBoundingClientRect(), tr = t.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) out.bad.push("tap " + o.dataset.l);
    if (tr.right > r.right - 4 + .5 || tr.left < r.left + 4 - .5 || tr.bottom > r.bottom - 4 + .5 || tr.top < r.top + 4 - .5 || t.scrollWidth > t.clientWidth + 1) out.bad.push("clip " + (o.dataset.l || o.dataset.id));
    if (o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1) out.bad.push("ovf " + (o.dataset.l || o.dataset.id)); }
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.bad.push("hscroll");
  for (const o of g.querySelectorAll(".opt .txt")) if (!o.textContent.trim() || o.getBoundingClientRect().height < 10) out.bad.push("empty text");
  return out;
};
async function open(W) {
  const c = await browser.newContext({ viewport: { width: W, height: 1100 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await c.addInitScript(FLAGOFF => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off"); if (!FLAGOFF) localStorage.setItem("stem-ui", "v7");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } }, !!process.env.FLAGOFF);
  const p = await c.newPage(); p.errs = []; p.on("pageerror", e => p.errs.push(String(e.message) + " @ " + String(e.stack).split("\n").slice(1, 3).join(" | ")));
  await p.goto(BASE + "/#BANK_BNT3");
  await p.waitForFunction(() => /^CALC1_B/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 15000 }).catch(async e => { console.log("pcode:", await p.evaluate(() => document.querySelector("#pcode")?.textContent + " | " + document.body.innerText.slice(0, 300)), p.errs); throw e; });
  return [c, p];
}
async function go(p, code) {
  await p.evaluate(h => { location.hash = h; }, code);
  await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, code, { timeout: 8000 });
  await p.waitForSelector("#q .choices .ch", { timeout: 8000 }); await p.waitForTimeout(120);
}
const rows = []; let bad = 0;
/* phase 1 (once per scenario, in the real app): the rendered markup of the real options + a template .ch of each kind. phase 2 (every n 2..8, both kinds, every width):
   rebuild .choices in ONE page from those pieces, so the real bento.js / CSS run on real rendered KaTeX without a navigation per combo. */
const [c0, p0] = await open(390);
const PARTS = {};
for (const k of names) {
  const tmpl = {};
  for (const kind of ["mc", "all"]) { await go(p0, CODE[`${k}|tail`]); await go(p0, CODE[`${k}|${kind}|5`]);
    tmpl[kind] = await p0.evaluate(() => ({ cls: document.querySelector("#q .choices").className.replace(/\b(bento|inline)\b/g, "").trim(), role: document.querySelector("#q .choices").getAttribute("role"),
      ch: document.querySelector("#q .ch").outerHTML, txt: [...document.querySelectorAll("#q .ch .txt")].map(t => t.innerHTML) })); }
  await go(p0, CODE[`${k}|tail`]);
  tmpl.tail = await p0.evaluate(() => [...document.querySelectorAll("#q .ch .txt")].map(t => t.innerHTML));
  PARTS[k] = tmpl;
}
await c0.close();
const BUILD = ({ t, kind, n }) => {
  const g = document.querySelector("#q .choices"), txt = [...t.mc.txt, ...t.tail.slice(0, 3)].concat(t.mc.txt.slice(0, 3)).slice(0, 8), T = t[kind];
  g.className = T.cls; g.setAttribute("role", T.role); g.removeAttribute("style"); g.removeAttribute("data-bento");
  g.innerHTML = Array.from({ length: n }, (_, i) => { const d = document.createElement("div"); d.innerHTML = T.ch; const ch = d.firstElementChild, L = "ABCDEFGH"[i];
    ch.removeAttribute("style"); ch.className = "ch"; ch.dataset.id = "id" + i; const o = ch.querySelector(".opt"); o.dataset.id = "id" + i; o.dataset.l = L; o.className = "opt"; o.setAttribute("aria-checked", "false"); o.removeAttribute("data-k"); o.removeAttribute("data-brk");
    const lt = o.querySelector(".lt"); if (lt) lt.textContent = L; else o.querySelector(".badge").textContent = L;
    o.querySelector(".txt").innerHTML = txt[i]; o.setAttribute("aria-label", L + ": " + o.querySelector(".txt").textContent); return ch.outerHTML; }).join("");
  document.dispatchEvent(new Event("drill:problem"));
};
for (const W of (process.env.WIDTHS || "360,390,768,1366").split(",").map(Number)) {
  const [c, p] = await open(W);
  await go(p, CODE["short|mc|5"]);
  for (const k of names.filter(x => !process.env.ONLY || x === process.env.ONLY)) for (const kind of ["mc", "all"]) for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    await p.evaluate(BUILD, { t: PARTS[k], kind, n });
    await p.waitForFunction(() => document.querySelector("#q .choices").dataset.bento, null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(60);
    const r = await p.evaluate(CHECK); r.W = W; r.k = k; r.kind = kind; r.reqn = n; if (r.n !== n) r.bad.push(`n=${r.n}`);
    const shoot = process.env.SHOTS_ALL || n === 5 || (n === 8 && (W === 390 || W === 1366)) || (n === 3 && W === 390) || (n === 2 && W === 1366);
    if (shoot) await p.locator("#q .choices").screenshot({ path: join(OUT, `${k}-${kind}-n${n}-${W}.png`) });
    if (process.env.DUMP && n === 5 && kind === "all") console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("#q .ch")].map(c => { const o = c.querySelector(".opt"), t = o.querySelector(".txt"); return [c.style.gridColumn, c.style.gridRow, Math.round(o.getBoundingClientRect().height), Math.round(t.getBoundingClientRect().height), t.textContent.length, t.innerHTML.slice(0, 200)]; }))));
    rows.push(r); if (r.bad.length) { bad++; console.log("BAD", W, k, kind, n, (r.shapes || []).join(" "), r.bad.slice(0, 4).join("; ")); }
  }
  if (p.errs.length) console.log("pageerrors", W, p.errs.slice(0, 3));
  await c.close();
}
/* states in the real app: picked, wrong, right (mc) and ticked, wrong, kept (pick-all) on a mixed set */
if (process.env.STATES !== "0") for (const W of [390, 1366]) {
  const [c, p] = await open(W);
  for (const k of ["mixed", "short"]) {
    await go(p, CODE[`${k}|mc|5`]);
    const snap = n => p.locator("#q").screenshot({ path: join(OUT, `state-${k}-mc-${n}-${W}.png`) });
    await snap("idle");
    await p.click("#q .opt[data-id='a']"); await p.waitForTimeout(500); await snap("picked");
    await p.click("#q .ch:has(.opt[data-id='a']) .send"); await p.waitForTimeout(900); await snap("wrong");
    await p.click("#q .opt[data-id='b']"); await p.waitForTimeout(400);
    await p.click("#q .ch:has(.opt[data-id='b']) .send"); await p.waitForTimeout(900); await snap("right");
    await go(p, CODE[`${k}|all|5`]);
    await p.click("#q .opt[data-id='a']"); await p.click("#q .opt[data-id='b']"); await p.waitForTimeout(400); await p.locator("#q").screenshot({ path: join(OUT, `state-${k}-all-ticked-${W}.png`) });
    await p.click("#mcGo"); await p.waitForTimeout(900); await p.locator("#q").screenshot({ path: join(OUT, `state-${k}-all-checked-${W}.png`) });
  }
  if (p.errs.length) console.log("pageerrors (states)", W, p.errs.slice(0, 3));
  await c.close();
}
writeFileSync(join(OUT, `results-${process.env.WIDTHS || "all"}.json`), JSON.stringify(rows));
console.log(`${rows.length} layouts, ${bad} with problems`);
const sh = {}; for (const r of rows) for (const x of r.shapes || []) sh[x] = (sh[x] || 0) + 1; console.log("shape mix", JSON.stringify(sh));
await browser.close(); srv.kill(); process.exit(bad ? 1 : 0);
