/* Shared page.clock helpers (bug class playwright-clock-race, stem-stuff-bugs.md).
   Playwright's clock races itself: while time flows (install without pauseAt), a real-time tick (runTo) can still be running when a
   fastForward / runFor lands, and its _advanceNow(old) then rewinds the page clock: the jump is lost silently (CI-only red; a busy page with
   many timers, or a loaded runner, raises the odds). So: freeze() the clock, jump, resume(). Never loosen the assert that follows. */

/* Pause the page clock a little ahead of its own Date.now() (pauseAt stops real-time ticks), then wait out any tick already in flight.
   On a loaded runner that moment can already be past, so retry with a wider margin. Page time moves on by up to the margin. */
export async function freeze(page) {
  for (let m = 300; ; m *= 2) {
    const now = await page.evaluate(() => Date.now());
    try { await page.clock.pauseAt(now + m); } catch (e) { if (m > 10000 || !/past/.test(e.message)) throw e; continue; }
    await new Promise(r => setTimeout(r, m + 200)); return;
  }
}
/* freeze, jump (how = "fastForward" | "runFor"), let time flow again. A page whose clock is paused for good (pauseAt before load, only
   runFor moves it) needs none of this: call page.clock.runFor there. */
export async function jump(page, how, ms) {
  await freeze(page);
  try { await page.clock[how](ms); } finally { await page.clock.resume(); }
}

/* The second try on a sugar 2-try item waits 10 s (app.js startWait; tests/retry-wait.pw.mjs is the spec of the wait itself). Every other
   spec that answers wrong and then acts on the SAME item calls this first: a page with a fake clock jumps the 10 s (frozen jump, see above),
   a real-time page waits it out. A no-op when no wait is running (diet, 1-try items, first try). The wait stays real: nothing here turns it off. */
export async function skipRetryWait(page) {
  if (!(await page.evaluate(() => !!window.__drill?.state?.wait))) return;
  if (await page.evaluate(() => !!globalThis.__pwClock)) { await jump(page, "fastForward", 10100); return; }
  await page.waitForFunction(() => !window.__drill.state.wait, null, { timeout: 12000 });
}
