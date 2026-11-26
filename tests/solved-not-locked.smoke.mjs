// SOLVED-NOT-LOCKED smoke (F2): a student solved an item on the server (cookie kept), then the page lost its local record
// (storage purge / a new profile: IndexedDB and localStorage empty). On reload the item must read solved from the unit's done
// state: no "#q .guard.lock" card ("I'm guarding this one. It comes back for a revenge round.") and the ".solved" class present.
// Steps from scratchpad/desync/desync_cache_loss.pw.mjs (RED (2) before the fix).   node tests/solved-not-locked.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8898", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "solved-"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
const opened = (p, c) => p.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, c, { timeout: 15000 });
try {
  // context a: solve CALC1_X2P (mc, right = b) and keep its server cookie
  const a = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" }), pa = await a.newPage();
  await pa.goto(`${BASE}/#CALC1_X2P`); await opened(pa, "CALC1_X2P");
  await pa.click('.opt[data-id="b"]'); await pa.click('.ch[data-id="b"] .send');
  await pa.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 });
  const own = await pa.evaluate(() => ({ guardLock: !!document.querySelector("#q .guard.lock"), solved: document.querySelector("#q").classList.contains("solved") }));
  await step("same browser, just solved it: no lock card, .solved present", async () => {
    assert.equal(own.guardLock, false, "the lock card on a freshly solved item");
    assert.equal(own.solved, true, "no .solved class on a freshly solved item");
  });
  // context b: same server cookie, EMPTY IndexedDB / localStorage (the purged profile)
  const b = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await b.addCookies(await a.cookies());
  const pb = await b.newPage();
  await pb.goto(`${BASE}/#CALC1_X2P`); await opened(pb, "CALC1_X2P");
  await pb.waitForFunction(() => window.__drill.state.finished, null, { timeout: 15000 });
  await pb.waitForTimeout(800);   // the server sync's repaint (the empty cache rebuilds from /state)
  const st = await (await b.request.get(`${BASE}/state/CALC1_X2P`)).json();
  const lost = await pb.evaluate(() => ({ guardLock: !!document.querySelector("#q .guard.lock"), guardText: document.querySelector("#q .guard")?.textContent.trim() || null,
    solved: document.querySelector("#q").classList.contains("solved"), tries: window.__drill.state.tries.length }));
  await step("storage purged, same cookie: the solved item reads solved (no lock card, .solved present)", async () => {
    assert.equal((st.parts ? st.parts[0] : st).done, true, "the server does not report the item solved: " + JSON.stringify(st));
    assert.equal(lost.tries, 0, "the fresh context has a local try log: " + JSON.stringify(lost));
    assert.equal(lost.guardLock, false, "a solved item shows the guard lock card: " + JSON.stringify(lost));
    assert.equal(lost.solved, true, "a solved item lacks the .solved class: " + JSON.stringify(lost));
  });
} finally { await browser.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
