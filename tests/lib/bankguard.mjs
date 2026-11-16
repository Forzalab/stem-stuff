/* The bank harness guard (docs/design/BANKCHECK.md "Harness rule"): a harness that opens a bank fails on text, never on a screenshot.
   bankReady({ child, port, bank }): throws unless the server we spawned is alive and serves a loadable bank. The error has the server's
     own text and the `Agents: read docs/design/BANKCHECK.md#<code>` pointer (the code the server's answer maps to, BANKCHECK.md).
   watchBank(page): records the bank incident lines (console "incident {...}" with where "bank") and page errors on one page.
     .lines = the parsed bank incident records, .errors = page error messages, .clear() forgets them, .assertClean() throws on any. */
const POINT = "Agents: read docs/design/BANKCHECK.md#";

export async function bankReady({ child, port, bank }) {
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error(`server on port ${port} exited (${child.exitCode ?? child.signalCode}): the port is busy, so the harness would talk to an old server`);
  const r = await fetch(`http://localhost:${port}/b/${bank}.json`);
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* not JSON: a 404 page or a crash */ }
  const fail = (why, code) => new Error(`${bank}: ${why}\n  server said: ${text.slice(0, 300)}\n${POINT}${code}\n  full list: python3 tools/bank_tools/bankcheck.py server/data/banks/${bank}.json`);
  if (r.status !== 200) throw fail(`GET /b/${bank}.json is ${r.status}, not loaded`, "B-NAME");
  if (typeof j?.dropped === "string") throw fail("dropped by the server (old version)", "B-VER");
  if (!Array.isArray(j?.problems) || j.problems.length === 0) throw fail("loads with 0 problems", "B-EMPTY");
  return j;
}

export function watchBank(page) {
  const lines = [], errors = [];
  page.on("console", m => {
    const t = m.text();
    if (!t.startsWith("incident ")) return;
    try { const j = JSON.parse(t.slice("incident ".length)); if (j.where === "bank") lines.push(j); } catch { /* not a record: not ours */ }
  });
  page.on("pageerror", e => errors.push(e.message));
  return {
    lines, errors,
    clear() { lines.length = 0; errors.length = 0; },
    assertClean() {
      const code = { dropped: "B-VER", empty: "B-EMPTY", not_found: "B-NAME" };   // the code each client reason maps to (BANKCHECK.md)
      const bad = lines.map(j => `incident ${JSON.stringify(j)}\n    ${POINT}${code[j.reason] || "B-NAME"}`).concat(errors.map(e => "pageerror " + e));
      if (bad.length) throw new Error("bank failures on the page:\n  " + bad.join("\n  "));
    },
  };
}
