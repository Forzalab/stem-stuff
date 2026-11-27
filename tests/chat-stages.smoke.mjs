// Smoke (feature-local): a /chat reply shows the same thinking line (stages.js step rows) as an /explain reply, until the reply finishes.
// Bug (Nov 27): the free starter chip (pre-try, locked strip) streamed its reply with no step rows: clSend never asked for stages.
// /chat is stubbed in the page as a stream the test writes (stage lines "\x1e"+JSON, then text). Phone width 390, ui-v7.
//   node tests/chat-stages.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8893", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "chatstg-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const STARTER = "How do I get angular frequency from a graph?";
writeFileSync(join(BANKS, "BANK_CST.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_CST1", title: "CST", type: "num", answer: "42", starter: STARTER,
  body: [{ type: "text", md: "How many students are in the lab? Say it as a number." }], saccharine: { title: "CST", key: "Tick: 42" } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ }
    const f0 = window.fetch;   // POST chat: a stream the test writes through window.__chat
    window.fetch = (u, o) => {
      if (!/(^|\/)chat$/.test(String(u))) return f0(u, o);
      window.__chatBody = JSON.parse(o.body);
      const enc = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({ start(c) { window.__chat = { w: s => c.enqueue(enc.encode(s)), end: () => c.close() }; } }), { status: 200, headers: { "content-type": "text/plain" } }));
    };
  });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?ui=v7#BANK_CST`);
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_CST1" && !document.getElementById("splash"), null, { timeout: 15000 });
  await settled(page);
  await page.click("#cluckBtn");
  await page.waitForSelector("#cluck .cl-starter", { state: "visible", timeout: 8000 });
  await page.click("#cluck .cl-starter");
  await page.waitForFunction(() => !!window.__chat, null, { timeout: 5000 });
  const RS = "\x1e", ev = (stage, at) => RS + JSON.stringify({ stage, at }) + "\n";
  const line = () => page.evaluate(() => { const m = [...document.querySelectorAll("#cluck .cl-thread .msg:not(.me)")].at(-1), h = m && m.querySelector(".stg");
    return { rows: h ? [...h.querySelectorAll(".stg-r")].filter(e => e.getClientRects().length).length : 0, run: !!(h && h.querySelector(".stg-r.run")) }; });
  try {
    assert.equal(await page.evaluate(() => window.__chatBody.stages), true, "the free /chat ask does not ask for stages");
    await page.evaluate(s => window.__chat.w(s), ev("note", "start"));
    await page.waitForTimeout(150);
    let x = await line(); assert.ok(x.rows >= 1 && x.run, "no thinking line in the wait: " + JSON.stringify(x));
    await page.evaluate(s => window.__chat.w(s), ev("note", "end") + ev("write", "start") + "You read one thing off the graph: the period.");
    await page.waitForTimeout(150);
    x = await line(); assert.ok(x.rows >= 2 && x.run, "the thinking line went away while the reply streams: " + JSON.stringify(x));
    await page.evaluate(s => { window.__chat.w(s); window.__chat.end(); }, ev("write", "end"));
    await page.waitForFunction(() => !document.querySelector("#cluck .cl-thread .msg:not(.me):last-child .stg-r.run"), null, { timeout: 8000 });
    console.log("ok   390 free starter /chat: thinking line while streaming, gone (no spinner) when done");
  } catch (e) { fails++; console.log("FAIL 390 free starter /chat thinking line\n     ", String(e.message).slice(0, 600)); }
  await ctx.close();
} finally { await browser.close(); srv.kill(); }
process.exit(fails ? 1 : 0);
