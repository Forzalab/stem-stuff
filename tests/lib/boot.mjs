import { createServer } from "node:net";
/* CI-ARCH B3 BOOT-HELPER: wait for a spec's own serve.py. Before this, 95 specs polled 8 s, then went on and died later with
   page.goto ERR_CONNECTION_REFUSED (no word on why). Now a dead server fails at once with one clear line. */
export async function serverUp(base, { tries = 80, ms = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(base + "/")).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, ms));
  }
  throw new Error(`serve.py did not start on ${base}`);
}

/* PORT-PLUS-ONE: a spec's second server must ask the OS for a port. PORT + 1 / PORT + 1000 were never checked free; with 3 lanes
   picking ports at once, bank's PORT + 1 was taken once on CI (e899d11: "serve.py did not start on :59614" at serverUp(BASE2)). */
export function freePort() {
  return new Promise((ok, no) => { const s = createServer(); s.unref(); s.on("error", no); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}
