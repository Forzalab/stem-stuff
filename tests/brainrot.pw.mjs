// The brainrot corner skips a video YouTube won't play (todo 105, Tony, Oct 27: "Video unavailable. Playback on other websites has been
// disabled by the video owner" → "find and switch next video"). No request leaves for YouTube: brainrot.js is served with a small
// fixture CATS block, and every youtube-nocookie /embed/<id> is a stub player that speaks the IFrame API's postMessage protocol
// (www-widgetapi.js: the page sends {"event":"listening"} until it hears back, then a "command" addEventListener onError; the player answers
// with {"event":"onError","info":<code>} posted to the embed URL's origin parameter, so a missing / wrong origin = no message = red).
// usage: node tests/brainrot.pw.mjs http://localhost:8812
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";
const YT = "https://www.youtube-nocookie.com";

/* the stub player: once the page listens and asks for onError, a dead id reports its code (to the origin the URL names), then says so */
const stub = code => `<!doctype html><body style="margin:0;background:#000"><script>
const q = new URLSearchParams(location.search), id = location.pathname.split("/").pop();
let told = false;
addEventListener("message", e => {
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m.event === "listening") parent.postMessage(JSON.stringify({ event: "initialDelivery", info: {}, id: m.id, channel: "widget" }), q.get("origin"));
  if (${code} && !told && m.event === "command" && m.func === "addEventListener" && m.args[0] === "onError") {
    told = true;
    parent.postMessage(JSON.stringify({ event: "onError", info: ${code}, id: m.id, channel: "widget" }), q.get("origin"));
    fetch("/__told/" + id);
  }
});
</script></body>`;

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });

/* one page on the sugar start page (the players warm up parked, all built: one per category, up to 5): cats = the fixture CATS, verdict(id, seen) = the code the
   stub reports for that id (0 = plays); seen = the ids requested so far, in order. -> { page, seen, told, ids() } */
async function open(cats, verdict) {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const seen = [], told = [], other = [];
  await c.route(/\/brainrot\.js(\?|$)/, async r => {
    const res = await r.fetch(), js = await res.text();
    const body = js.replace(/(\/\* list:start[^\n]*\n).*?(\n *\/\/ list:end)/s, (_, a, z) => `${a}  const CATS = ${JSON.stringify(cats)};${z}`);
    assert.notEqual(body, js, "the fixture CATS went in");
    await r.fulfill({ response: res, body });
  });
  await c.route(/youtube|ytimg|googlevideo/, async r => {
    const u = new URL(r.request().url());
    if (u.origin === YT && u.pathname.startsWith("/embed/")) {
      const id = u.pathname.split("/").pop(); const code = verdict(id, seen.slice()); seen.push(id);
      return r.fulfill({ contentType: "text/html", body: stub(code) });
    }
    if (u.origin === YT && u.pathname.startsWith("/__told/")) { told.push(u.pathname.split("/").pop()); return r.fulfill({ body: "" }); }
    other.push(u.href); return r.abort();
  });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await c.newPage();
  await page.goto(BASE + "/");
  await page.waitForFunction(n => document.querySelectorAll("#rot iframe").length === n, Math.min(cats.length, 5), { timeout: 8000 });   // one per category, up to 5 (W135b)
  await page.evaluate(() => document.querySelectorAll("#rot iframe").forEach(f => f.removeAttribute("loading")));   // the lazy 3-5, parked off screen, load too
  const ids = () => page.$$eval("#rot iframe", fs => fs.map(f => new URL(f.getAttribute("src")).pathname.split("/").pop()));
  return { c, page, seen, told, other, ids };
}
const catOf = (cats, id) => cats.findIndex(([, v]) => v.some(x => x[0] === id));
const v = (id, short = 0) => [id, `Video ${id}`, short];

await step("the embed asks for the JS API, for this page's origin only (enablejsapi=1, origin=)", async () => {
  const { c, page } = await open([["A", [v("aaaaaaaaaa1")]], ["B", [v("bbbbbbbbbb1")]], ["C", [v("cccccccccc1")]]], () => 0);
  const u = new URL(await page.$eval("#rot iframe", f => f.src));
  assert.equal(u.origin, YT, "still the no-cookie host");
  assert.equal(u.searchParams.get("enablejsapi"), "1");
  assert.equal(u.searchParams.get("origin"), new URL(BASE).origin);
  await c.close();
});

await step("a video that can't be embedded (150) is swapped for an unused one of the same category; the others stay", async () => {
  const cats = [["A", [v("aaaaaaaaaa1"), v("aaaaaaaaaa2", 1)]], ["B", [v("bbbbbbbbbb1"), v("bbbbbbbbbb2")]], ["C", [v("cccccccccc1"), v("cccccccccc2")]]];
  const first = new Map();                                              // the first id asked for in each category is dead
  const { c, page, ids, seen, other } = await open(cats, id => { const k = catOf(cats, id); if (!first.has(k)) first.set(k, id); return first.get(k) === id ? 150 : 0; });
  for (let t = Date.now(); first.size < 3 && Date.now() - t < 8000;) await page.waitForTimeout(100);   // all 3 slots asked for their first video
  await page.waitForFunction(dead => [...document.querySelectorAll("#rot iframe")].every(f => !dead.some(d => f.src.includes("/embed/" + d))),
    [...first.values()], { timeout: 8000 });
  const dead = [...first.values()], now = await ids();
  assert.equal(dead.length, 3, `all 3 slots loaded: ${seen}`);
  assert.deepEqual(now.filter(id => dead.includes(id)), [], `a dead video still shows: ${now} (dead ${dead})`);
  assert.equal(new Set(now).size, 3, `no repeat: ${now}`);
  assert.deepEqual(now.map(id => catOf(cats, id)).sort(), [0, 1, 2], "each slot stays in its category");
  const a = now.find(id => id[0] === "a");                             // aaaaaaaaaa2 is a Short, aaaaaaaaaa1 isn't: the flag follows the swap either way
  assert.equal(await page.$eval(`#rot iframe[src*="${a}"]`, f => [f.parentElement.classList.contains("short"), f.title].join("|")), `${a.endsWith("2")}|Video ${a}, muted`, "the new video's Short flag and title");
  assert.deepEqual(other, [], "a request went to YouTube");
  await c.close();
});

await step("its category used up: another category's unused video; nothing left: the slot keeps YouTube's message (no loop)", async () => {
  const cats = [["A", [v("aaaaaaaaaa1"), v("aaaaaaaaaa2")]], ["B", [v("bbbbbbbbbb1")]], ["C", [v("cccccccccc1")]]];
  const { c, page, ids, seen, told } = await open(cats, id => (id[0] === "a" ? 0 : 101));   // A plays; B and C are dead
  const until = Date.now() + 8000;
  while (Date.now() < until && !(told.includes("bbbbbbbbbb1") && told.includes("cccccccccc1"))) await page.waitForTimeout(100);
  assert.equal(told.length, 2, `B and C reported 101: ${told}`);
  await page.waitForFunction(() => [...document.querySelectorAll("#rot iframe")].filter(f => f.src.includes("/embed/aaaaaaaaaa")).length === 2, null, { timeout: 8000 });
  await page.waitForTimeout(500);                                          // a stray second swap would be asked for by now
  const now = await ids();
  assert.equal(new Set(now).size, 3, `no repeat: ${now}`);
  assert.deepEqual(now.filter(id => id[0] === "a").sort(), ["aaaaaaaaaa1", "aaaaaaaaaa2"], `the one free video took a dead slot: ${now}`);
  assert.equal(now.filter(id => id[0] !== "a").length, 1, `the other dead slot is left as it was: ${now}`);
  assert.equal(seen.filter(id => id[0] === "a").length, 2, `each A video was loaded once: ${seen}`);
  await c.close();
});

await step("153 (no Referer: every video would fail the same) is not swapped", async () => {
  const cats = [["A", [v("aaaaaaaaaa1"), v("aaaaaaaaaa2")]], ["B", [v("bbbbbbbbbb1"), v("bbbbbbbbbb2")]], ["C", [v("cccccccccc1"), v("cccccccccc2")]]];
  const { c, page, ids, told } = await open(cats, () => 153);
  const before = await ids();
  const until = Date.now() + 8000;
  while (Date.now() < until && told.length < 3) await page.waitForTimeout(100);
  assert.equal(told.length, 3, `the 3 stubs reported 153: ${told}`);
  await page.waitForTimeout(500);
  assert.deepEqual(await ids(), before);
  await c.close();
});

await step("8 categories, 5 slots (W135b): a dead one is swapped for its category's unused video, no repeat across all 5, every slot loads", async () => {
  const cats = "abcdefgh".split("").map(x => [x.toUpperCase(), [v(x.repeat(10) + "1"), v(x.repeat(10) + "2")]]);
  const first = new Map();
  const { c, page, ids, seen } = await open(cats, id => { const k = catOf(cats, id); if (!first.has(k)) first.set(k, id); return first.get(k) === id ? 150 : 0; });
  const at0 = await ids();
  assert.equal(at0.length, 5, `5 slots: ${at0}`);
  assert.equal(new Set(at0.map(id => catOf(cats, id))).size, 5, `5 slots, 5 categories: ${at0}`);
  for (let t = Date.now(); first.size < 5 && Date.now() - t < 8000;) await page.waitForTimeout(100);   // all 5 load (nothing waits for a scroll)
  assert.equal(first.size, 5, `all 5 slots asked YouTube: ${seen}`);
  await page.waitForFunction(dead => [...document.querySelectorAll("#rot iframe")].every(f => !dead.some(d => f.src.includes("/embed/" + d))), [...first.values()], { timeout: 8000 });
  const now = await ids();
  assert.equal(new Set(now).size, 5, `no repeat across all 5: ${now} (asked ${seen})`);
  assert.deepEqual(now.map(id => catOf(cats, id)), at0.map(id => catOf(cats, id)), "each slot stays in its category");
  await c.close();
});

await step("6 categories of one video each, 5 slots (W135b): a dead slot takes the one category not shown, never a repeat", async () => {
  const cats = "abcdef".split("").map(x => [x.toUpperCase(), [v(x.repeat(10) + "1")]]);
  const { c, page, ids, told } = await open(cats, (id, seen) => (seen.length ? 0 : 150));   // the first asked is dead
  const at0 = await ids(), spare = cats.map(([, [[id]]]) => id).find(id => !at0.includes(id));
  assert.ok(spare, `one category left out of the 5: ${at0}`);
  for (let t = Date.now(); !told.length && Date.now() - t < 8000;) await page.waitForTimeout(100);
  assert.equal(told.length, 1, `one 150: ${told}`);
  await page.waitForFunction(d => ![...document.querySelectorAll("#rot iframe")].some(f => f.src.includes("/embed/" + d)), told[0], { timeout: 8000 });
  const now = await ids();
  assert.equal(new Set(now).size, 5, `no repeat: ${now}`);
  assert.ok(now.includes(spare), `the dead slot got the spare category's video ${spare}: ${now}`);
  await c.close();
});

await step("5 categories of one video each: a dead slot has nothing free (the other 4 are all shown) and keeps YouTube's message", async () => {
  const cats = "abcde".split("").map(x => [x.toUpperCase(), [v(x.repeat(10) + "1")]]);
  const { c, page, ids, told } = await open(cats, (id, seen) => (seen.length ? 0 : 150));   // the first asked is dead
  for (let t = Date.now(); !told.length && Date.now() - t < 8000;) await page.waitForTimeout(100);
  assert.equal(told.length, 1, `one 150: ${told}`);
  await page.waitForTimeout(500);
  const now = await ids();
  assert.equal(new Set(now).size, 5, `no repeat: ${now}`);
  assert.ok(now.includes(told[0]), `the dead slot was left as it was: ${now}`);
  await c.close();
});

await b.close();
if (fails) { console.log(`${fails} FAIL`); process.exit(1); }
console.log("all ok");
