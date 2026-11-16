// F-PORT hint bar + toast smoke (proto column F): flag ON the stage toast ("Ready when you are.", bar + X) has border-width 0 and the --float fill;
// flag OFF it keeps the 1px --line edge. Own serve.py.   node tests/fport-hint-toast.pw.mjs [port]   (SHOT=/path/prefix saves -390.png / -1280.png)
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
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8896), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "fport-ht-"));
const BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_TC1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Piston", key: "Use: P = F/A\nAnswer: 4", slip: {} },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" }, { id: "answer", label: "Final answer", kind: "num" }] } };
writeFileSync(join(BANKS, "BANK_FHT.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_TC2", 1), num("PHYS_TC3", 2)] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_FHT", STEM_FRONT_TITLE: "Exam 3", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
let failures = 0;
async function probe(flag, w, h, shot) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); if (f === "on") localStorage.setItem("stem-ui", "v7"); } catch { /* */ } }, flag);
  const p = await c.newPage();
  await p.goto(BASE + "/#BANK_FHT");   // the start line "Ready when you are." shows by itself on a fresh bank
  await p.waitForSelector("#q .wl-ladder", { timeout: 12000 });   // was "#q .cc-welcome": under ui-v7 that card is the calc toast (Tony Nov 14), so wait for the welcome ladder
  // read the style in the same tick the toast is seen: on a loaded runner it can expire between a wait and a separate evaluate (null element)
  const r = await (await p.waitForFunction(() => { const e = document.querySelector(".stoast.on"); if (!e) return null; const s = getComputedStyle(e); return { bw: s.borderTopWidth, bg: s.backgroundColor, sh: s.boxShadow, fl: getComputedStyle(document.documentElement).getPropertyValue("--float").trim() }; }, null, { timeout: 15000 })).jsonValue();
  if (shot) await p.screenshot({ path: shot });
  await c.close();
  return r;
}
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 500)); } }
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const S = process.env.SHOT;
await step("flag on: toast has no border, the --float fill and a shadow", async () => {
  const r = await probe("on", 390, 844, S && S + "-390.png");
  assert.equal(r.bw, "0px"); assert.equal(r.bg, rgb(r.fl)); assert.notEqual(r.sh, "none");
  const d = await probe("on", 1280, 800, S && S + "-1280.png");
  assert.equal(d.bw, "0px"); assert.equal(d.bg, rgb(d.fl));
});
await step("flag off: toast keeps its 1px edge", async () => {
  const r = await probe("off", 390, 844);
  assert.equal(r.bw, "1px");
});
await browser.close(); srv.kill();
process.exit(failures ? 1 : 0);
