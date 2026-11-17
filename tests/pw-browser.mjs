// Browser choice for the WebKit lane (G6.1). Default = exactly the old `pw.chromium.launch(opts)`; nothing changes unless env is set.
//   PW_BROWSER=webkit        launch that engine instead (chromium-only launch args are dropped for the others)
//   PW_FORCE_FALLBACK=1      every context gets an init script making CSS.supports() answer false for text-box-trim / field-sizing,
//                            so the JS fallbacks (e.g. explain-box.js) run on an engine that has the feature. CSS @supports blocks are not affected.
//   reducedMotion (CI-ARCH D0): every newContext/newPage defaults to reducedMotion "reduce" (no animation to wait out).
//                            A spec that tests motion opts out with launchBrowser(pw, { motion: true, ... }); a context that
//                            passes reducedMotion itself keeps its own value.
//                            PW_MOTION=1 turns the default off for a whole run.
export const BROWSER = process.env.PW_BROWSER || "chromium";
const MOTION = process.env.PW_MOTION === "1";
const FALLBACK = process.env.PW_FORCE_FALLBACK === "1";
const INIT = `(() => { const s = CSS.supports.bind(CSS), no = /^(text-box-trim|text-box-edge|text-box|field-sizing)\\b/;
  CSS.supports = function (a, b) { return no.test(String(a).trim()) ? false : b === undefined ? s(a) : s(a, b); }; })();`;
export async function launchBrowser(pw, opts = {}, engine = BROWSER) {
  const { motion, ...lo } = opts;
  const b = await pw[engine].launch(engine === "chromium" ? lo : {});
  if (!MOTION && !motion) for (const k of ["newContext", "newPage"]) {
    const f = b[k].bind(b);
    b[k] = (o = {}, ...a) => f({ reducedMotion: "reduce", ...o }, ...a);
  }
  if (FALLBACK) {
    const nc = b.newContext.bind(b);
    b.newContext = async (...a) => { const c = await nc(...a); await c.addInitScript(INIT); return c; };
  }
  return b;
}
