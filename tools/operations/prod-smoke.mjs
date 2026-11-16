#!/usr/bin/env node
/* prod-smoke (AC5.4): the public checks of ship.sh's smoke, against a live URL with plain fetch (no `vercel curl`, so it only works
   on a URL without a login wall: production). Used after a live ship and after a rollback.
     node tools/operations/prod-smoke.mjs <url> [--expect-sha <sha>]
   exit 0 = every check ok, 1 = a check failed (or the URL is bad), 2 = usage. Each request has a 10 s timeout; <= 7 requests, so < 60 s. */
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 10_000;

export async function smoke(base, { expectSha = "", fetchImpl = fetch } = {}) {
  let root;
  try { root = new URL(base); if (!/^https?:$/.test(root.protocol)) throw new Error("not http(s)"); } catch { return [{ what: "url", ok: false, note: `bad URL ${base}` }]; }
  const get = async (path, init) => {
    try {
      const r = await fetchImpl(new URL(path, root), { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
      return { status: r.status, text: await r.text() };
    } catch (e) { return { status: 0, text: "", err: e.message }; }
  };
  const res = [];
  const check = (what, ok, note = "") => res.push({ what, ok: !!ok, note });
  let r = await get("/");
  check("page loads", r.status === 200, r.err || `status ${r.status}`);
  r = await get("/version.json");
  let v = null; try { v = JSON.parse(r.text); } catch { /* not json */ }
  check("version.json", r.status === 200 && v && v.sha, r.err || `status ${r.status}`);
  if (expectSha) check("version is the expected sha", v && v.sha && (expectSha.startsWith(v.sha) || v.sha.startsWith(expectSha)), `live ${v && v.sha} vs ${expectSha}`);
  r = await get("/p/PHYS_F3N.json"); check("a problem loads", r.status === 200, r.err || `status ${r.status}`);
  r = await get("/problems.json"); check("answers stay hidden", r.status === 404, r.err || `status ${r.status}`);
  r = await get("/banks/BANK_P2X.json"); check("banks stay hidden", r.status === 404, r.err || `status ${r.status}`);
  r = await get("/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "PHYS_F3N", answer: "3.2" }) });
  check("grading works", r.status === 200 && r.text.includes('"correct"'), r.err || `status ${r.status}`);
  return res;
}

export async function main(argv) {
  const url = argv[0], i = argv.indexOf("--expect-sha");
  if (!url || url.startsWith("-")) { console.error("usage: prod-smoke.mjs <url> [--expect-sha <sha>]"); return 2; }
  const res = await smoke(url, { expectSha: i >= 0 ? argv[i + 1] || "" : "" });
  for (const c of res) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.what}${c.ok ? "" : ` (${c.note})`}`);
  const bad = res.some((c) => !c.ok);
  console.log(bad ? `SMOKE RED: ${url}` : "smoke green");
  return bad ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
