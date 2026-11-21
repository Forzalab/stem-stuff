// smokes.pw.mjs (ick-ui orc7, Nov 20): the CI lane for tests/*.smoke.mjs (feature smokes that were run by hand only).
// Runs each one in turn; every smoke boots its own server (the port argument is ignored). Exit 1 if any fails.
//   node tests/smokes.pw.mjs [port]
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE).filter(f => f.endsWith(".smoke.mjs")).sort();
let bad = 0;
for (const f of files) {
  const t = Date.now(), r = spawnSync(process.execPath, [join(HERE, f)], { stdio: "inherit", timeout: 240e3 });
  const ok = r.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${f} (${((Date.now() - t) / 1e3).toFixed(1)} s)`);
  if (!ok) bad++;
}
console.log(bad ? `smokes: ${bad}/${files.length} failed` : `smokes: all ${files.length} ok`);
process.exit(bad ? 1 : 0);
