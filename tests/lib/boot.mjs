/* CI-ARCH B3 BOOT-HELPER: wait for a spec's own serve.py. Before this, 95 specs polled 8 s, then went on and died later with
   page.goto ERR_CONNECTION_REFUSED (no word on why). Now a dead server fails at once with one clear line. */
export async function serverUp(base, { tries = 80, ms = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(base + "/")).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, ms));
  }
  throw new Error(`serve.py did not start on ${base}`);
}
