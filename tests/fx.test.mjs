// fx.js blur gate (20261013-T40): the dim rules, iOS / web view parsing, frame stats, and what it sets on <html>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../fx.js", import.meta.url), "utf8");
function run({ nav = {}, media = [], blur = true, store = {} } = {}) {
  const cls = new Set();
  const win = {
    navigator: { userAgent: "", ...nav }, devicePixelRatio: 3,
    document: { documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), add: c => cls.add(c) } }, visibilityState: "visible" },
    matchMedia: q => ({ matches: media.some(m => q.includes(m)) }), CSS: { supports: () => blur },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  const plain = o => JSON.parse(JSON.stringify(o));   // the vm's arrays have another realm's prototype
  const api = { ...win.__stemFx, gate: d => plain(win.__stemFx.gate(d)) };
  return { fx: plain(win.stemFx), cls, api };
}
const IP8 = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const IP26 = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

test("iPhone 8 Plus (iOS 16.7) dims and is weak; iOS 26 (UA 18_7) blurs", () => {
  const a = run({ nav: { userAgent: IP8, hardwareConcurrency: 6 } });
  assert.equal(a.fx.fx, "dim"); assert.equal(a.fx.tier, "weak"); assert.deepEqual(a.fx.why, ["ios_lt_17"]);
  assert.ok(a.cls.has("fx-dim") && !a.cls.has("fx-blur"));
  const b = run({ nav: { userAgent: IP26, hardwareConcurrency: 4 } });   // iOS core count is unverified: never a reason on iOS
  assert.equal(b.fx.fx, "blur"); assert.equal(b.fx.tier, "strong"); assert.ok(b.cls.has("fx-blur"));
});

test("each rule alone", () => {
  const { gate } = run().api;
  const base = { blurOk: true, ios: null, mem: 8, cores: 8 };
  assert.equal(gate(base).fx, "blur");
  assert.deepEqual(gate({ ...base, rt: true }), { fx: "dim", tier: "strong", why: ["reduced_transparency"] }, "a preference dims, not weak");
  assert.deepEqual(gate({ ...base, saveData: true }).why, ["save_data"]);
  assert.deepEqual(gate({ ...base, blurOk: false }).why, ["no_backdrop_filter"]);
  assert.deepEqual(gate({ ...base, mem: 4 }).why, ["mem_le_4"]);
  assert.equal(gate({ ...base, cores: 4 }).fx, "blur", "cores with a known memory: no tie to break");
  assert.deepEqual(gate({ ...base, mem: undefined, cores: 4 }).why, ["cores_le_4"]);
  assert.deepEqual(gate({ ...base, fpsBad: true }), { fx: "dim", tier: "weak", why: ["fps"] });
});

test("prefers-reduced-transparency, Save-Data, no backdrop-filter, a latched probe", () => {
  assert.equal(run({ media: ["reduced-transparency"] }).fx.fx, "dim");
  assert.equal(run({ nav: { connection: { saveData: true } } }).fx.fx, "dim");
  assert.equal(run({ blur: false }).fx.why[0], "no_backdrop_filter");
  assert.deepEqual(run({ store: { "stem-fx": "dim" } }).fx.why, ["fps"]);
});

test("iosMajor / webview", () => {
  const { iosMajor, webview } = run().api;
  assert.equal(iosMajor(IP8), 16); assert.equal(iosMajor(IP26), 18);
  assert.equal(iosMajor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"), null, "iPadOS desktop UA: unknown");
  assert.equal(webview(IP8), false);
  assert.equal(webview(IP26.replace(" Safari/604.1", "")), true, "iOS UA without Safari/ = web view");
  assert.equal(webview(IP26 + " Instagram 300.0"), true);
  assert.equal(webview("Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"), false);
  assert.equal(webview("Mozilla/5.0 (Linux; Android 13; K; wv) AppleWebKit/537.36"), true);
});

test("frameStats: 60 Hz passes, 30 Hz fails", () => {
  const { frameStats } = run().api;
  const ok = frameStats(Array(120).fill(16.7));
  assert.equal(ok.fps_med, 60); assert.equal(ok.bad, false); assert.equal(ok.dropped_pct, 0);
  const slow = frameStats(Array(60).fill(33.4));
  assert.equal(slow.bad, true); assert.equal(slow.dropped_pct, 100);
  const spiky = frameStats([...Array(90).fill(16.7), ...Array(10).fill(50)]);   // 10% long frames: p95 lands on them
  assert.equal(spiky.bad, true);
  assert.equal(frameStats([]), null);
});
