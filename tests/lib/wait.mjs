/* CI-ARCH B2 WAIT-HELPERS: wait on STATE, not on time (a slow runner stretches every sleep's race; ci-arch-plan Vision 5).
   Every helper has an explicit timeout and throws with what it waited for. */

/* settled: no finite animation runs (in the page, or under `sel`) and two painted frames have passed.
   Infinite animations (spinners, pulses) never end, so they never block. */
export async function settled(page, sel = null, { timeout = 5000 } = {}) {
  await page.waitForFunction(s => {
    const els = s ? [...document.querySelectorAll(s)] : null;
    const anims = els ? els.flatMap(e => e.getAnimations({ subtree: true })) : document.getAnimations();
    return !anims.some(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity && Number.isFinite(a.effect?.getComputedTiming().endTime));   // WK-INF: webkit can report a finite endTime for an infinite loop (the .wcaret blink): skip by iterations too
  }, sel, { timeout }).catch(e => { throw new Error(`settled(${sel || "page"}): an animation still ran after ${timeout} ms (${e.message.split("\n")[0]})`); });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* vtHook: count document.startViewTransition calls (pattern from flow.pw.mjs). vtDone(n) waits until more than n started and
   none is still running. Call vtHook before the action. */
export async function vtHook(page) {
  await page.evaluate(() => { window.__vtN = 0; if (window.__vtHooked) return; window.__vtHooked = true; window.__vt = 0;
    if (!document.startViewTransition) return;
    const st = document.startViewTransition.bind(document);
    document.startViewTransition = cb => { const t = st(cb); window.__vt++; window.__vtN++; t.finished.finally(() => window.__vt--); return t; }; });
  return { vtN: () => page.evaluate(() => window.__vtN),
    vtDone: (n, { timeout = 5000 } = {}) => page.waitForFunction(n => window.__vtN > n && !window.__vt, n, { timeout }) };
}

/* onEvent: arm BEFORE the action, await after. The app fires drill:problem { code } / drill:answer / drill:bank / drill:pb on
   window (app.js). Resolves with the event's detail. */
export async function onEvent(page, name, { timeout = 8000 } = {}) {
  const key = `__ev_${name.replace(/\W/g, "_")}_${Math.random().toString(36).slice(2)}`;
  await page.evaluate(([n, k]) => { window[k] = { hit: false }; addEventListener(n, e => { window[k] = { hit: true, detail: e.detail ?? null }; }, { once: true }); }, [name, key]);
  return () => page.waitForFunction(k => window[k].hit && window[k], key, { timeout })
    .then(h => h.jsonValue()).then(v => v.detail)
    .catch(e => { throw new Error(`onEvent(${name}): not fired in ${timeout} ms (${e.message.split("\n")[0]})`); });
}
