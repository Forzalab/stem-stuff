// Browser choice for the WebKit lane (G6.1). Default = exactly the old `pw.chromium.launch(opts)`; nothing changes unless env is set.
//   PW_BROWSER=webkit        launch that engine instead (chromium-only launch args are dropped for the others)
//   PW_FORCE_FALLBACK=1      every context gets an init script making CSS.supports() answer false for text-box-trim / field-sizing,
//                            so the JS fallbacks (e.g. explain-box.js) run on an engine that has the feature. CSS @supports blocks are not affected.
//   reducedMotion (CI-ARCH D0): every newContext/newPage defaults to reducedMotion "reduce" (no animation to wait out).
//                            A spec that tests motion opts out with launchBrowser(pw, { motion: true, ... }); a context that
//                            passes reducedMotion itself keeps its own value.
//                            PW_MOTION=1 turns the default off for a whole run.
//   youtube (CI flake): every newContext/newPage defaults to aborting YouTube (youtube / ytimg / googlevideo), so no real player
//                            loads and takes the focus. Opt out with launchBrowser(pw, { youtube: true }); PW_YOUTUBE=1 for a whole run.
//   jev (JEV-DET 1): every newContext/newPage defaults to Jev OFF (init script: localStorage stem-jev=0 when unset), so no spec
//                            rolls live nudge/help dice (intent.js returns early). A spec that tests Jev opts in with
//                            launchBrowser(pw, { jev: true }) and pins its own rolls (__stemJevRand / __stemHelpRand). PW_JEV=1 = off for a whole run.
//                            JEV-DET 2: jev also per context: browser.newContext({ jev, ... }) / newPage({ jev }) beats the browser value.
//                            jev: <number> = Jev on with seeded dice (window.__stemDice, mulberry32): the whole scenario replays.
//   keyhint: every newContext/newPage defaults to the one-time "key moved" toast already seen (init script: localStorage stem-key-moved-1=1
//                            when unset), so it never queues ahead of the toast a spec waits for. tests/key-moved-hint.smoke.mjs opts in with
//                            launchBrowser(pw, { keyhint: true }), or per context (newContext({ keyhint: true })): a spec that needs a NEW device
//                            (no stem-* key at first load, the onboarding rows of ux-flows) opts out the same way.
//   PW_TRACE=0 (CI-ARCH E)   turns the event trace off. Default on: every context is recorded (tests/lib/trace.mjs) and a spec's
//                            FAIL line gets the last page events under it. Read-only for the page.
import { traceContext } from "./lib/trace.mjs";
export const BROWSER = process.env.PW_BROWSER || "chromium";
const MOTION = process.env.PW_MOTION === "1";
const YOUTUBE = process.env.PW_YOUTUBE === "1";
const JEV = process.env.PW_JEV === "1";
/* try: about:blank / opaque frames throw on localStorage. ?jev=1 still turns it on (intent.js removes the key after this runs) */
const JEV_OFF = `(() => { try { if (localStorage.getItem("stem-jev") === null) localStorage.setItem("stem-jev", "0"); } catch {} })();`;
const JEV_SEED = s => `(() => { let a = ${s >>> 0}; window.__stemDice = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;   // mulberry32
/* the jev init script for a context: off, seeded, or none (live dice) */
const jevInit = (ctxJev, browserJev) => { const j = JEV || (ctxJev ?? browserJev); return !j ? JEV_OFF : typeof j === "number" ? JEV_SEED(j) : null; };
const KEYHINT_SEEN = `(() => { try { if (localStorage.getItem("stem-key-moved-1") === null) localStorage.setItem("stem-key-moved-1", "1"); } catch {} })();`;
const YT_ROUTE = /youtube|ytimg|googlevideo/;
/* an aborted iframe lands on an opaque chrome-error page, where scripts reading localStorage throw "Access is denied" (mc-bento pageerror):
   a frame gets an empty page from the youtube origin instead; scripts/images/media are aborted */
const ytStub = r => r.request().resourceType() === "document" ? r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }) : r.abort();
const FALLBACK = process.env.PW_FORCE_FALLBACK === "1";
const INIT = `(() => { const s = CSS.supports.bind(CSS), no = /^(text-box-trim|text-box-edge|text-box|field-sizing)\\b/;
  CSS.supports = function (a, b) { return no.test(String(a).trim()) ? false : b === undefined ? s(a) : s(a, b); }; })();`;
export async function launchBrowser(pw, opts = {}, engine = BROWSER) {
  const { motion, youtube, jev, keyhint, ...lo } = opts;
  const keepYt = YOUTUBE || youtube;
  const b = await pw[engine].launch(engine === "chromium" ? lo : {});
  if (!MOTION && !motion) for (const k of ["newContext", "newPage"]) {
    const f = b[k].bind(b);
    b[k] = (o = {}, ...a) => f({ reducedMotion: "reduce", ...o }, ...a);
  }
  if (FALLBACK) {
    const nc = b.newContext.bind(b);
    b.newContext = async (...a) => { const c = await nc(...a); await c.addInitScript(INIT); return c; };
  }
  const nc = b.newContext.bind(b), np = b.newPage.bind(b);
  // route before the context is handed back: a spec's own youtube route is registered later, and Playwright runs the LAST
  // matching route first, so a spec stub still wins.
  // jev is ours, never handed to Playwright
  b.newContext = async ({ jev: cj, keyhint: ck, ...o } = {}, ...a) => { const c = await nc(o, ...a), js = jevInit(cj, jev); if (js) await c.addInitScript(js); if (!(ck ?? keyhint)) await c.addInitScript(KEYHINT_SEEN); if (!keepYt) await c.route(YT_ROUTE, ytStub); return traceContext(c); };
  b.newPage = async ({ jev: cj, keyhint: ck, ...o } = {}, ...a) => { const p = await np(o, ...a), js = jevInit(cj, jev); if (js) await p.context().addInitScript(js); if (!(ck ?? keyhint)) await p.context().addInitScript(KEYHINT_SEEN); if (!keepYt) await p.context().route(YT_ROUTE, ytStub); await traceContext(p.context()); return p; };
  return b;
}
