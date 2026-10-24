// telemetry.js (design/plans/TELEMETRY.md): gates, config parsing, guess-spam + rage rules, and "no key = nothing happens".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../telemetry.js", import.meta.url), "utf8");

/* a fake browser: meta = the <meta name="stem-t"> attributes (or null), nav = navigator fields */
function run({ meta = null, nav = {}, search = "", store = {}, src = SRC, scr } = {}) {
  const added = [], listeners = [], handlers = {};
  const el = attrs => ({ getAttribute: k => (k in attrs ? attrs[k] : null) });
  const document = {
    readyState: "complete", visibilityState: "visible", head: { appendChild: s => added.push(s.src) },
    querySelector: q => (q === 'meta[name="stem-t"]' && meta ? el(meta) : null),
    getElementById: () => null, createElement: () => ({}),
    addEventListener: (t, f) => { listeners.push(t); handlers[t] = f; },
  };
  const win = {
    document, navigator: nav, performance: { now: () => 1, getEntriesByType: () => [] }, location: { href: "x", search }, crypto: globalThis.crypto, TextEncoder, Intl, screen: scr,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    addEventListener: () => {}, Blob, setTimeout: () => 0, requestIdleCallback: () => 0, matchMedia: () => ({ matches: false }), URLSearchParams,
  };
  win.window = win;
  vm.runInNewContext(src, win);
  return { win, document, added, listeners, handlers, store };
}

test("no meta / empty meta: stemT is a no-op, nothing is loaded, no listeners", () => {
  for (const meta of [null, { content: "" }]) {
    const { win, added, listeners } = run({ meta });
    assert.equal(typeof win.stemT, "function");
    assert.doesNotThrow(() => { win.stemT("pick", { code: "A" }); win.stemT(); win.stemT(null, 5); });
    assert.deepEqual(added, []); assert.deepEqual(listeners, []);
  }
});

test("DNT / GPC with a key: stays a no-op, no listeners", () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }, { msDoNotTrack: "1" }]) {
    const { win, listeners } = run({ meta: { content: "phc_abc", "data-clarity": "x1" }, nav });
    assert.equal(win.stemT.length, 0, "the noop stub");
    assert.deepEqual(listeners, []);
  }
});

test("a key, no DNT: stemT is live and listeners are set", () => {
  const { win, listeners } = run({ meta: { content: "phc_abc", "data-clarity": "x1" } });
  assert.equal(win.stemT.length, 2);
  assert.ok(listeners.includes("pointerdown") && listeners.includes("visibilitychange"));
  assert.doesNotThrow(() => win.stemT("pick", { verdict: "wrong", right: false }));
});

test("J6: a pick's `error` family never reaches the queue / PostHog (intent.js reads it on device)", async () => {
  const sent = [], nav = { sendBeacon: (u, b) => { sent.push(b); return true; } };
  const { win, document, handlers } = run({ meta: { content: "phc_abc" }, nav });
  win.stemT("pick", { code: "A", verdict: "wrong", right: false, error: "sign" });
  win.stemT("pick", { code: "A", verdict: "correct", right: true, error: undefined, families: ["negation", "sign"] });
  win.stemT("pick", { code: "A", verdict: "wrong", right: false, error: undefined, collide: ["drop", "factor"] });   // SLIP_TIE: a collide list is a family list too
  document.visibilityState = "hidden"; handlers.visibilitychange();   // no PostHog yet: the queue goes out as one beacon
  const batch = JSON.parse(await sent[0].text()).batch.filter(e => e.event === "pick");
  assert.equal(batch.length, 3);
  for (const e of batch) assert.ok(!("error" in e.properties), "error stripped");
  for (const e of batch) assert.ok(!("collide" in e.properties), "SLIP_TIE collide stripped");
  assert.ok(!/drop|factor/.test(JSON.stringify(batch)), "no colliding family name anywhere in the beacon");
  for (const e of batch) assert.ok(!("families" in e.properties), "the item's distractor families stripped");
  assert.ok(!JSON.stringify(batch).includes("negation"), "no family name anywhere in the beacon");
  assert.equal(batch[0].properties.code, "A"); assert.equal(batch[0].properties.verdict, "wrong");
});

test("J6: `_` names (_xmark, _copy ...) and q_open's shape: nothing new reaches the queue / PostHog", async () => {
  const sent = [], nav = { sendBeacon: (u, b) => { sent.push(b); return true; } };
  const { win, document, handlers } = run({ meta: { content: "phc_abc" }, nav });
  win.stemT("q_open", { code: "A", bank: "B", type: "mc", mode: "sugar" });
  win.stemT("_xmark", { choice: "b" }); win.stemT("_copy", { where: "stem" }); win.stemT("_whatever"); win.stemT("_ask"); win.stemT("_tok");
  win.stemT("pick", { code: "A", choice: "b", verdict: "wrong", right: false });
  document.visibilityState = "hidden"; handlers.visibilitychange();
  const batch = JSON.parse(await sent[0].text()).batch;
  assert.deepEqual(batch.map(e => e.event).filter(n => n !== "app_load" && n !== "guess_spam"), ["q_open", "pick", "tab_away", "bail"], "no `_` event, and _ask / _tok stay silent too");
  assert.ok(batch.every(e => !e.event.startsWith("_")));
  assert.ok(!JSON.stringify(batch).includes("xmark") && !JSON.stringify(batch).includes("whatever"));
  const q = batch.find(e => e.event === "q_open").properties;
  assert.deepEqual(Object.keys(q).sort(), ["$current_url", "$lib", "bank", "code", "distinct_id", "mode", "type"], "q_open: no w / ch");
});

test("incident (incident.mjs): only its allowlisted keys reach PostHog, no text-ish key, no student text", async () => {
  const { reason, KEYS } = await import("../incident.mjs");
  const sent = [], nav = { sendBeacon: (u, b) => { sent.push(b); return true; } };
  const { win, document, handlers } = run({ meta: { content: "phc_abc" }, nav });
  win.stemT("q_open", { code: "CALC1_XP1", bank: null, type: "mc", mode: "sugar" });
  const secret = "my typed answer is 42 and my notes";
  win.stemT("incident", { code: "E-7K3QX", ...reason("explain", "network", { phase: "stream", ms: 13000, bytes: 0, path: "/explain", err: new TypeError("Failed to fetch"),
    answer: secret, scratch: secret, text: secret, chat: secret, tapped: secret }) });
  document.visibilityState = "hidden"; handlers.visibilitychange();
  const e = JSON.parse(await sent[0].text()).batch.find(x => x.event === "incident");
  assert.ok(e, "incident sent");
  const keys = Object.keys(e.properties).filter(k => !["$current_url", "$lib", "distinct_id"].includes(k));
  assert.deepEqual(keys.sort(), [...KEYS].sort());
  for (const k of keys) assert.ok(!/text|answer|scratch|chat|note|msg|message|typed|tap|choice|pick/i.test(k), k);
  assert.ok(!JSON.stringify(e).includes(secret.slice(0, 12)), "no student text anywhere");
  assert.equal(e.properties.code, "E-7K3QX", "the incident code, not the question's");
});

test("readConfig: pattern-checks every value", () => {
  const T = run().win.__stemTelemetry;
  const doc = attrs => ({ querySelector: () => ({ getAttribute: k => (k in attrs ? attrs[k] : null) }) });
  assert.deepEqual({ ...T.readConfig(doc({ content: "phc_ab12", "data-clarity": "zz9", "data-host": "https://eu.i.posthog.com" })) },
    { ph: "phc_ab12", cl: "zz9", host: "https://eu.i.posthog.com" });
  assert.equal(T.readConfig(doc({ content: "phx_secret" })), null, "a personal key is never used");
  assert.equal(T.readConfig(doc({ content: "", "data-clarity": "a\"b" })), null);
  assert.equal(T.readConfig(doc({ content: "phc_a", "data-host": "javascript:alert(1)" })).host, "https://us.i.posthog.com");
});

test("optedOut", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.optedOut({ doNotTrack: "1" }), true);
  assert.equal(T.optedOut({ globalPrivacyControl: true }), true);
  assert.equal(T.optedOut({}, { doNotTrack: "1" }), true);
  assert.equal(T.optedOut({ doNotTrack: "0" }), false);
  assert.equal(T.optedOut({ doNotTrack: null, globalPrivacyControl: false }), false);
});

test("signals: names what optedOut acts on (privacy.html shows it), and the two always agree", () => {
  const T = run().win.__stemTelemetry;
  for (const [nav, win, want] of [[{ globalPrivacyControl: true }, {}, ["gpc"]], [{ doNotTrack: "1" }, {}, ["dnt"]], [{ doNotTrack: "yes" }, {}, ["dnt"]],
    [{}, { doNotTrack: "1" }, ["dnt"]], [{ msDoNotTrack: "1" }, {}, ["dnt"]], [{ globalPrivacyControl: true, doNotTrack: "1" }, {}, ["gpc", "dnt"]], [{}, {}, []]]) {
    assert.deepEqual([...T.signals(nav, win)], want, JSON.stringify([nav, win]));
    assert.equal(T.optedOut(nav, win), want.length > 0, JSON.stringify([nav, win]));
  }
  const bad = { get globalPrivacyControl() { throw new Error("blocked"); } };
  assert.throws(() => T.signals(bad, {}));
  assert.equal(T.optedOut(bad, {}), true, "can't tell: stay off");
});

test("guess-spam: <2 s after open, or the 3rd pick inside 10 s", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.spamCheck([], 0, 1500), "fast");
  const p = [];
  assert.equal(T.spamCheck(p, 0, 5000), ""); assert.equal(T.spamCheck(p, 4000, 9000), "");
  assert.equal(T.spamCheck(p, 9000, 14000), "burst");
  const q = [];
  T.spamCheck(q, 0, 5000); T.spamCheck(q, 6000, 5000);
  assert.equal(T.spamCheck(q, 11000, 5000), "", "the first pick fell out of the window");
});

test("rage tap: 3 taps in 700 ms within 30 px; spread or slow taps are not", () => {
  const T = run().win.__stemTelemetry;
  const a = [];
  assert.equal(T.rageCheck(a, 0, 100, 100), false); assert.equal(T.rageCheck(a, 200, 110, 105), false);
  assert.equal(T.rageCheck(a, 400, 95, 98), true);
  const b = [];
  T.rageCheck(b, 0, 0, 0); T.rageCheck(b, 200, 200, 0);
  assert.equal(T.rageCheck(b, 400, 400, 0), false, "spread out");
  const c = [];
  T.rageCheck(c, 0, 0, 0); T.rageCheck(c, 500, 0, 0);
  assert.equal(T.rageCheck(c, 1000, 0, 0), false, "slow");
});

test("replay PII blanker: e-mail + phone shapes go, physics stays", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.blankPII("call me 559-555-1234 ok"), "call me ***-***-**** ok");
  assert.equal(T.blankPII("(559) 555 1234"), "(***) *** ****");
  assert.equal(T.blankPII("maria.g@gmail.com"), "*****.*@*****.***");
  for (const t of ["v = 9.81 m/s, t=12.5", "F = 1234567 N", "1/2 m v^2 = 80 J", "x 2.0e8 m"]) assert.equal(T.blankPII(t), t);
  assert.equal(T.blankPII(""), ""); assert.equal(T.blankPII(null), null);
});

test("Don't record me (stem-t-off=1) with a key: stays a no-op", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.userOff({ getItem: () => "1" }), true);
  assert.equal(T.userOff({ getItem: () => null }), false);
  assert.equal(T.userOff({ getItem: () => { throw new Error("blocked"); } }), false);
});

test("dead_tap context: x/y as viewport %, stage, tries_left, never the tapped text; missing -> null, never throws", () => {
  const T = run().win.__stemTelemetry;
  const d = T.deadProps({ textContent: "  Hello world, this is a long caption  " }, "div.fig", 150, 600, 300, 800, "wrong", "A1", 2);
  assert.deepEqual({ ...d }, { el: "div.fig", code: "A1", x: 50, y: 75, stage: "wrong", tries_left: 2 });
  assert.equal("txt" in d, false);                                                    // privacy default (Tony, Oct 18): no text key at all
  assert.ok(!JSON.stringify(d).includes("Hello"), "no tapped text anywhere in the payload");
  const m = T.deadProps(null, "div.fig", undefined, 5, 0, 800, undefined, null, null);
  assert.deepEqual({ ...m }, { el: "div.fig", code: null, x: null, y: 1, stage: null, tries_left: null });
  assert.doesNotThrow(() => T.deadProps({ get textContent() { throw new Error("x"); } }, "", 1, 1, 1, 1));
  assert.equal(T.deadProps({ textContent: "z" }, "e", 9999, -5, 100, 100).x, 100);
});

test("T40 ltSum: long tasks inside a window", () => {
  const T = run().win.__stemTelemetry;
  const l = [{ s: 100, d: 60 }, { s: 9000, d: 120.4 }, { s: 12000, d: 80 }];
  assert.deepEqual({ ...T.ltSum(l, 0, 10000) }, { n: 2, ms: 180 });
  assert.deepEqual({ ...T.ltSum(l, 10000, 20000) }, { n: 1, ms: 80 });
  assert.equal(T.gpu({ createElement: () => ({ getContext: () => null }) }), "none", "no WebGL: none, no throw");
  assert.equal(T.gpu({ createElement: () => { throw new Error("x"); } }), "none", "throws: none");
  const gl = r => ({ createElement: () => ({ getContext: () => ({ RENDERER: 1, UNMASKED_RENDERER_WEBGL: 2,
    getExtension: n => n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 2 } : null, getParameter: () => r }) }) });
  assert.equal(T.gpu(gl("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)")), "nvidia", "only the family leaves gpu()");
});

test("T40 gpuFamily: the GPU is sent as a coarse family token, never the model string", () => {
  const T = run().win.__stemTelemetry;
  const cases = {
    "Apple GPU": "apple", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)": "apple",
    "Adreno (TM) 640": "adreno", "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)": "adreno",
    "Mali-G78 MP14": "mali", "ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)": "mali", "PowerVR Rogue GE8320": "powervr",
    "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)": "intel", "Intel Iris OpenGL Engine": "intel",
    "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)": "nvidia", "Quadro P1000/PCIe/SSE2": "nvidia",
    "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)": "amd", "AMD Radeon Pro 5500M OpenGL Engine": "amd",
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)": "other", "Mesa llvmpipe": "other",
    "": "none"
  };
  for (const [r, f] of Object.entries(cases)) assert.equal(T.gpuFamily(r), f, r);
  assert.equal(T.gpuFamily(null), "none"); assert.equal(T.gpuFamily(undefined), "none");
});

/* ---- Jev on for all (art. 11): jev_item + the owner tag ---- */
const beaconOf = async (o = {}) => {
  const sent = [], nav = { sendBeacon: (u, b) => { sent.push(b); return true; }, ...(o.nav || {}) };
  const r = run({ meta: { content: "phc_abc" }, ...o, nav });
  r.flush = async () => { r.document.visibilityState = "hidden"; r.handlers.visibilitychange(); return sent.length ? JSON.parse(await sent.at(-1).text()).batch : []; };
  r.sent = sent;
  return r;
};

test("jev_item: lines go out with err= / fam= stripped; no error / families fields, no typed text; after a hide it goes by beacon", async () => {
  const r = await beaconOf();
  const lines = ["+0.0  q_open  A mc w=31 ch=4", "+9.0  pick  B wrong tries_left=2 err=sign", "+9.0  tree  wrong d=1 read=slip fam=sign",
    "+12.0  xmark  c", "+14.0  copy  stem", "+20.0  pause  6s", "+30.0  seen  earned short neg-2", "+31.0  jev  nudge S2 say", "+40.0  tree  end fatigue"];
  r.win.stemT("jev_item", { sid: "sab12", i: 1, code: "A", lines, error: "sign", families: ["sign"] });
  const ev = (await r.flush()).find(e => e.event === "jev_item");
  assert.ok(ev, "queued, then out with the hide's beacon");
  const p = ev.properties;
  assert.equal(p.sid, "sab12"); assert.equal(p.i, 1); assert.equal(p.code, "A");
  assert.deepEqual(p.lines, ["+0.0  q_open  A mc w=31 ch=4", "+9.0  pick  B wrong tries_left=2", "+9.0  tree  wrong d=1 read=slip",
    "+12.0  xmark  c", "+14.0  copy  stem", "+20.0  pause  6s", "+30.0  seen  earned short neg-2", "+31.0  jev  nudge S2 say", "+40.0  tree  end fatigue"]);
  assert.ok(!("error" in p) && !("families" in p), "error / families fields stripped");
  for (const l of p.lines) assert.match(l, /^\+\d+\.\d  [a-z_]+(  .*)?$/, "the line shape: timing + kind + short args");
  assert.ok(!/err=|fam=/.test(JSON.stringify(p.lines)));
  const n = r.sent.length;
  r.win.stemT("jev_item", { sid: "sab12", i: 2, code: "B", lines: ["+0.0  q_open  B mc"] });   // already bailed (pagehide after the hide): out at once
  assert.equal(r.sent.length, n + 1);
  const late = JSON.parse(await r.sent.at(-1).text()).batch;
  assert.deepEqual(late.map(e => e.event), ["jev_item"]);
});

test("jev_item: no family name anywhere in the beacon", async () => {
  const r = await beaconOf();
  r.win.stemT("jev_item", { sid: "s1", i: 1, code: "A", lines: ["+1.0  pick  A wrong err=negation", "+1.0  tree  wrong d=1 read=slip fam=negation"], error: "negation", families: ["negation"] });
  const b = await r.flush();
  assert.equal(b.find(e => e.event === "jev_item").properties.lines[0], "+1.0  pick  A wrong");
  assert.ok(!JSON.stringify(b).includes("negation"));
});

test("owner tag: stem-me 1 / test → me on every event; none or 0 → no me key; ?me= sets it by hand", async () => {
  for (const [store, search, me, kept] of [[{ "stem-me": "test" }, "", "test", "test"], [{ "stem-me": "1" }, "", "1", "1"], [{}, "", undefined, undefined],
    [{ "stem-me": "0" }, "", undefined, "0"], [{}, "?me=test", "test", "test"], [{ "stem-me": "1" }, "?me=0", undefined, "0"], [{}, "?me=junk", undefined, undefined]]) {
    const r = await beaconOf({ store, search });
    r.win.stemT("q_open", { code: "A" }); r.win.stemT("jev_item", { sid: "s", i: 1, code: "A", lines: [] });
    const b = await r.flush();
    assert.ok(b.length >= 3);
    for (const e of b) assert.equal(e.properties.me, me, JSON.stringify([store, search, e.event]));
    assert.equal(r.store["stem-me"], kept);
  }
});

test("owner tag: fpStr is coarse (no browser version), userAgentData.platform first", () => {
  const T = run().win.__stemTelemetry;
  const nav = { platform: "MacIntel", userAgent: "Mozilla/5.0 Chrome/130.0.1", appVersion: "5.0", hardwareConcurrency: 8, deviceMemory: 8, language: "en-US", maxTouchPoints: 0 };
  assert.equal(T.fpStr(nav, { width: 1512, height: 982 }, 2, "America/Los_Angeles"), "MacIntel|1512x982|2|8|8|America/Los_Angeles|en-US|0");
  assert.equal(T.fpStr({ ...nav, userAgentData: { platform: "macOS" } }, { width: 1512, height: 982 }, 2, "America/Los_Angeles").split("|")[0], "macOS");
  assert.equal(T.fpStr({}, null, undefined, ""), "|||||||0", "missing fields: empty, never throws");
  assert.equal(T.meOf(null, "ab", ["ab"]), "1"); assert.equal(T.meOf(null, "cd", ["ab"]), ""); assert.equal(T.meOf("0", "ab", ["ab"]), "", "?me=0 beats the fingerprint");
  assert.equal(T.meOf("test", "", []), "test"); assert.equal(T.meOf(null, "", []), "");
});

test("owner tag: a fingerprint in OWNER_FP sets stem-me=1 (sticky) and tags events; the hash itself is never sent; stemFP() gives it", async () => {
  const scr = { width: 390, height: 844 }, nav = { platform: "iPhone", language: "en-US", maxTouchPoints: 5 };
  const h = await run({ nav, scr }).win.stemFP();
  assert.match(h, /^[0-9a-f]{64}$/);
  const r = await beaconOf({ nav, scr, src: SRC.replace("var OWNER_FP = [];", `var OWNER_FP = ["${h}"];`) });
  for (let k = 0; k < 200 && !r.store["stem-me"]; k++) await new Promise(res => setTimeout(res, 10));   // the digest is async
  assert.equal(r.store["stem-me"], "1");
  r.win.stemT("q_open", { code: "A" });
  const b = await r.flush();
  assert.ok(b.every(e => e.properties.me === "1"));
  assert.ok(!JSON.stringify(b).includes(h), "never the hash");
  const other = await beaconOf({ nav: { ...nav, platform: "Win32" }, scr, src: SRC.replace("var OWNER_FP = [];", `var OWNER_FP = ["${h}"];`) });
  await other.win.stemFP(); await new Promise(res => setTimeout(res, 50));   // its own digest has had time to land
  assert.equal(other.store["stem-me"], undefined, "another device: no tag");
});

/* ---- T36 (Freeform T4): owner-only wrong-try log. me=1 keeps the full try trail + the slip family; me=test is the same, never ground truth;
   everyone else: the pick payload is exactly what it was before (typed values never leave the device). ---- */
/* owner = this device's hash is in OWNER_FP (the T36 gate); "other" = OWNER_FP holds Tony's hash but this is another device; false = OWNER_FP empty */
const OWN_DEV = { nav: { platform: "MacIntel", language: "en-US", hardwareConcurrency: 8 }, scr: { width: 1512, height: 982 } };
const tries = async (store, { search = "", owner = true } = {}) => {
  const h = await run(OWN_DEV).win.stemFP();
  const src = owner ? SRC.replace("var OWNER_FP = [];", `var OWNER_FP = ["${h}"];`) : SRC;
  const nav = owner === "other" ? { ...OWN_DEV.nav, platform: "Win32" } : OWN_DEV.nav;
  const r = await beaconOf({ store, search, src, nav, scr: OWN_DEV.scr });
  await r.win.stemFP(); await new Promise(res => setTimeout(res, 20));   // the gate's own digest (started at load) has landed
  let t = 1; r.win.performance.now = () => t;
  r.win.stemT("q_open", { code: "MF1", bank: "B", type: "num", mode: "sugar" });
  t = 30001; r.win.stemT("pick", { code: "MF1", choice: null, part: null, right: false, verdict: "wrong", tries_left: 2, error: "leftover-sum", families: undefined, typed: "19" });
  t = 75001; r.win.stemT("pick", { code: "MF1", choice: null, part: null, right: false, verdict: "wrong", tries_left: 1, error: undefined, collide: ["sign", "drop"], families: undefined, typed: "43" });
  t = 90001; r.win.stemT("pick", { code: "MF1", choice: null, part: null, right: true, verdict: "correct", tries_left: 1, error: undefined, families: ["leftover-sum"], typed: "26" });
  return (await r.flush()).filter(e => e.event === "pick").map(e => e.properties);
};

test("T36 owner me=1: every typed value in order, ms per try, tries, and the matched slip family (not stripped); gt=true", async () => {
  const p = await tries({ "stem-me": "1" });
  assert.equal(p.length, 3);
  assert.deepEqual(p.map(x => x.typed_seq), [["19"], ["19", "43"], ["19", "43", "26"]]);
  assert.deepEqual(p.map(x => x.typed), ["19", "43", "26"]);
  assert.deepEqual(p.map(x => x.try_ms), [30000, 45000, 15000], "time per try: since open, then since the last try");
  assert.deepEqual(p.map(x => x.tries), [1, 2, 3]);
  assert.equal(p[0].error, "leftover-sum", "the matched slip family is kept for the owner");
  assert.deepEqual(p.map(x => x.collide), [undefined, ["sign", "drop"], undefined], "SLIP_TIE: the colliding families are kept for the owner, like error");
  assert.deepEqual(p[2].families, ["leftover-sum"]);
  assert.ok(p.every(x => x.gt === true && x.me === "1" && x.code === "MF1"));
});

test("T36 owner me=test: same trail, flagged gt=false (never ground truth)", async () => {
  const p = await tries({ "stem-me": "test" });
  assert.deepEqual(p.map(x => x.typed_seq), [["19"], ["19", "43"], ["19", "43", "26"]]);
  assert.equal(p[0].error, "leftover-sum");
  assert.ok(p.every(x => x.gt === false && x.me === "test"));
});

test("T36 gate: ?me=1 / ?me=test / a hand-set stem-me on a device NOT in OWNER_FP logs no typed values; its me tag and the rest of its telemetry are unchanged", async () => {
  for (const owner of [false, "other"]) for (const [store, search, me] of [[{}, "?me=1", "1"], [{}, "?me=test", "test"], [{ "stem-me": "1" }, "", "1"], [{ "stem-me": "test" }, "", "test"]]) {
    const why = JSON.stringify([owner, store, search]);
    const p = await tries(store, { search, owner });
    const base = { code: "MF1", choice: null, part: null, sure: null, me, $lib: "stem-beacon", $current_url: "x" };
    const strip = x => { const { distinct_id, ...rest } = x; return rest; };
    assert.deepEqual(p.map(strip), [
      { ...base, right: false, verdict: "wrong", tries_left: 2, ms_since_open: 30000 },
      { ...base, right: false, verdict: "wrong", tries_left: 1, ms_since_open: 75000 },
      { ...base, right: true, verdict: "correct", tries_left: 1, ms_since_open: 90000 }], why);
    const b = JSON.stringify(p);
    for (const s of ["typed", "leftover", "collide", "drop", "\"19\"", "\"43\"", "\"26\"", "try_ms", "\"gt\""]) assert.ok(!b.includes(s), s + " " + why);
  }
});

test("T36 owner device with no stem-me yet: the fingerprint hit sets me=1 and the trail goes out", async () => {
  const p = await tries({});
  assert.deepEqual(p.map(x => x.typed_seq), [["19"], ["19", "43"], ["19", "43", "26"]]);
  assert.ok(p.every(x => x.me === "1" && x.gt === true));
});

test("T36 non-owner: pick payload byte-for-byte as before (no typed / trail / family / gt), and the extra app prop changes nothing", async () => {
  for (const [store, owner] of [[{}, false], [{ "stem-me": "0" }, false], [{ "stem-me": "0" }, true], [{}, "other"]]) {
    const p = await tries(store, { owner });
    const base = { code: "MF1", choice: null, part: null, sure: null, $lib: "stem-beacon", $current_url: "x" };
    const strip = x => { const { distinct_id, ...rest } = x; return rest; };
    assert.deepEqual(p.map(strip), [
      { ...base, right: false, verdict: "wrong", tries_left: 2, ms_since_open: 30000 },
      { ...base, right: false, verdict: "wrong", tries_left: 1, ms_since_open: 75000 },
      { ...base, right: true, verdict: "correct", tries_left: 1, ms_since_open: 90000 }]);
    assert.deepEqual(Object.keys(p[0]), ["code", "choice", "part", "right", "verdict", "tries_left", "ms_since_open", "sure", "distinct_id", "$current_url", "$lib"], "same keys in the same order as before T36");
    const b = JSON.stringify(p);
    for (const s of ["typed", "leftover", "collide", "drop", "\"19\"", "\"43\"", "try_ms", "\"gt\""]) assert.ok(!b.includes(s), s);
  }
});
