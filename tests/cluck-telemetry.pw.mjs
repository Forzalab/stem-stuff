// cluck_ask / cluck_reply / cluck_rise / dead_tap (travel rule) reach telemetry. Own serve.py + a stub OpenRouter + a stub PostHog (index.html gets a fake key).
//   node tests/cluck-telemetry.pw.mjs <port>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8877", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "ct-")), banks = join(tmp, "banks"); mkdirSync(banks);
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_CT${n}`, title: `CT ${n}`, type: "mc", shuffle: false, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `CT ${n}`, key: "Tick: a", slip: { b: "Two is not one." } } }));
writeFileSync(join(banks, "BANK_CTL.json"), JSON.stringify({ v: 1, problems: PROBS }));
const parts = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => { if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`); else { res.end("data: [DONE]\n\n"); clearInterval(t); } }, 100);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); } }
const STUB = `window.posthog = { init(k, o) { window.__ph = { ev: [] }; this.__loaded = true; o.loaded && o.loaded(this); }, capture(n, p) { window.__ph.ev.push({ n, p }); }, register() {} };`;
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
await ctx.route(/posthog\.com|clarity\.ms/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: /posthog/.test(r.request().url()) ? STUB : "" }));
await ctx.route(u => new URL(u).pathname === "/" || new URL(u).pathname === "/index.html", async r => {
  const res = await r.fetch(), html = await res.text();
  return r.fulfill({ response: res, body: html.replace('<meta name="stem-t" content="">', '<meta name="stem-t" content="phc_testtoken123" data-host="https://us.i.posthog.com">') });
});
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e)));
await page.goto(BASE + "/#BANK_CTL");
await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash), null, { timeout: 15000 });
await page.waitForFunction(() => window.__ph, null, { timeout: 15000 });
const evs = n => page.evaluate(n => window.__ph.ev.filter(e => e.n === n).map(e => e.p), n);
const wait = (n, k = 1) => page.waitForFunction(([n, k]) => window.__ph.ev.filter(e => e.n === n).length >= k, [n, k], { timeout: 12000 });

await step("a still tap on the question text is a dead_tap (travel_px 0); a 40 px scroll-like move is not", async () => {
  const box = await page.evaluate(() => { for (const e of document.querySelectorAll(".md, .ptitle")) { const r = e.getBoundingClientRect(); if (r.height > 8 && r.top > 0 && r.bottom < innerHeight && !e.closest("#cluck, [hidden]")) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; } return null; });
  assert.ok(box, "a dead-tap target is on the page");
  const fire = (type, x, y) => page.evaluate(([type, x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "touch" })), [type, x, y]);
  await fire("pointerdown", box.x, box.y); await fire("pointermove", box.x, box.y + 40); await fire("pointerup", box.x, box.y + 40);
  await page.waitForTimeout(300);
  assert.equal((await evs("dead_tap")).length, 0, "a scroll-like move is no dead_tap");
  await fire("pointerdown", box.x, box.y); await fire("pointerup", box.x, box.y);
  await wait("dead_tap");
  const d = (await evs("dead_tap"))[0]; assert.equal(d.travel_px, 0);
});

await step("wrong pick: the rise is shown, then dismissed (cluck_rise)", async () => {
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(() => window.stemDuck.up, null, { timeout: 8000 });
  await wait("cluck_rise");
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 8000, polling: 100 });
  await page.touchscreen.tap(20, 300);          // any other input puts it away
  await wait("cluck_rise", 2);
  const r = await evs("cluck_rise");
  assert.equal(r[0].phase, "shown"); assert.equal(r[0].trigger, "wrong"); assert.match(r[0].item, /^CALC1_CT/); assert.equal(r[0].code, "BANK_CTL");
  assert.equal(r[1].phase, "dismissed"); assert.ok(r[1].shown_ms >= 0);
});

await step("the background explain ends: cluck_reply has ok, chars, timings, plain text", async () => {
  await wait("cluck_reply");
  const p = (await evs("cluck_reply"))[0];
  assert.equal(p.ok, true); assert.ok(p.chars > 10); assert.ok(p.total_ms >= 0); assert.equal(p.auto, true); assert.equal(p.kind, "wish");
  assert.match(p.text, /Egg-cellent/); assert.ok(!/```|<[a-z]/i.test(p.text), "no markup: " + p.text);
});

await step("Ask box: cluck_ask carries the scrubbed text; its reply is a cluck_reply", async () => {
  if (!(await page.evaluate(() => !!document.querySelector(".vdrawer:not([hidden]):not(.vd-shut) .wchip")))) await page.click("#q .vkb, #q .ff .vk[role=button]");
  await page.click(".vdrawer .wchip");
  await page.locator("#cluck .ask textarea:not(:disabled)").click({ timeout: 8000 });
  await page.keyboard.type("my email is a@b.co, why x=2?"); await page.keyboard.press("Enter");
  await wait("cluck_ask");
  const a = (await evs("cluck_ask")).find(p => p.kind === "ask");
  assert.ok(a, "an ask-kind cluck_ask"); assert.match(a.text, /\[email\]/); assert.match(a.text, /x=2/); assert.ok(!/a@b\.co/.test(a.text));
  assert.equal(a.after_wrong, true); assert.match(a.item, /^CALC1_CT/); assert.equal(typeof a.tries_left, "number");
  await page.waitForFunction(() => window.__ph.ev.some(e => e.n === "cluck_reply" && e.p.kind === "ask"), null, { timeout: 12000 });
  const r = (await evs("cluck_reply")).find(p => p.kind === "ask"); assert.equal(r.ok, true); assert.match(r.text, /Egg-cellent/);
});
assert.deepEqual(errs, []);
await browser.close(); srv.kill(); stub.close();
console.log(failures ? failures + " FAILED" : "all ok"); process.exit(failures ? 1 : 0);
