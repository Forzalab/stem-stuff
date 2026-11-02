// run-all.sh FAIL_RE: the lines that mark a spec red, and the ones it prints as the reason in the CI log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const src = readFileSync(new URL("./run-all.sh", import.meta.url), "utf8");
const re = src.match(/^FAIL_RE='([^']+)'$/m)?.[1];
const hit = line => spawnSync("grep", ["-qE", re], { input: line + "\n" }).status === 0;

test("FAIL_RE is defined", () => assert.ok(re, "no FAIL_RE='...' line in run-all.sh"));
test("a failed ux-flows row matches (both widths)", () => {
  assert.ok(hit("43 offline-sw             1280 FAIL t_ms=11485  page.waitForFunction: Timeout 10000ms exceeded."));
  assert.ok(hit("08 boot-splash            393 FAIL t_ms=900  flow timeout 60 s"));
});
test("other specs' FAIL lines still match", () => {
  for (const l of ["FAIL engine: PW_BROWSER=x is not a Playwright engine", "3 FAIL", "  FAIL step 2"]) assert.ok(hit(l), l);
});
test("ok / SKIP rows and the summary line do not match", () => {
  for (const l of ["43 offline-sw             1280 ok   t_ms=1200", "40 silent-reload-idle     1280 SKIP t_ms=56  needs a stamped deploy",
    "# done: widths 1280, 52 checks, 47 ok, 1 FAIL, 4 SKIP", "ok   ux-flows@desk 105.7 s"]) assert.ok(!hit(l), l);
});

// W138: #353 CI unit job showed "FAIL unittest 60.2 s" + only the head of the log (aiw_rewrite / claude noise matching "Error"),
// never the FAIL:/ERROR: block, so the failing test was unknown. Run a fake failing unittest module through run-all.sh's own run().
test("a failed unittest row names the failing test and its assertion", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "runall-unit-"));
  // noise first: 40 lines that match the old excerpt's "Error" grep, as the real unit job log had
  writeFileSync(join(dir, "test_fake_w138.py"), [
    "import sys, unittest",
    "class Fake(unittest.TestCase):",
    "    def test_noise(self):",
    "        for i in range(40): print(f'aiw_rewrite: claude Error {i}: upstream timeout', file=sys.stderr)",
    "    def test_zz_red(self):",
    "        self.assertEqual('w138-left', 'w138-right')",
    "    def test_zz_boom(self):",
    "        raise KeyError('w138-boom')",
    "",
  ].join("\n"));
  // run()'s region of run-all.sh: FAIL_RE .. the end of run() (helpers it calls live inside that region)
  const region = src.slice(src.indexOf("FAIL_RE='"), src.indexOf("\n}\n", src.indexOf("\nrun() {")) + 3);
  const r = spawnSync("bash", ["-c", `set -uo pipefail; TMP="$(mktemp -d)"; fails=0\n${region}\nrun unittest python3 -m unittest discover -s "$1" -p 'test_*.py'`, "x", dir],
    { encoding: "utf8" });
  const out = r.stdout;
  assert.match(out, /^FAIL unittest /m, out);
  assert.match(out, /FAIL: test_zz_red \(test_fake_w138\.Fake\.test_zz_red\)/, out);
  assert.match(out, /AssertionError: 'w138-left' != 'w138-right'/, out);
  assert.match(out, /ERROR: test_zz_boom \(test_fake_w138\.Fake\.test_zz_boom\)/, out);
  assert.match(out, /KeyError: 'w138-boom'/, out);
});

// W126: killing run-all.sh left serve.py servers behind holding ports: its trap killed only the main server, and the node spec it was
// running (which spawns its own serve.py) was orphaned. Start one spec, SIGTERM run-all mid-run, and no serve.py of that run may survive.
test("SIGTERM to run-all.sh leaves no serve.py behind (main server + the spec's own)", async () => {
  const { spawn, execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const alive = pid => { try { process.kill(pid, 0); return !readFileSync(`/proc/${pid}/stat`, "utf8").includes(") Z "); } catch { return false; } };
  const kids = pid => { try { return execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number); } catch { return []; } };
  const tree = pid => kids(pid).flatMap(k => [k, ...tree(k)]);
  const servers = pid => tree(pid).filter(p => { try { return readFileSync(`/proc/${p}/cmdline`, "utf8").includes("serve.py"); } catch { return false; } });
  const ra = spawn("bash", ["tests/run-all.sh"], { cwd: root, env: { ...process.env, SPECS: "mock" }, stdio: "ignore" });
  const seen = new Set();
  try {
    for (let i = 0; i < 150 && seen.size < 2; i++) { servers(ra.pid).forEach(p => seen.add(p)); await new Promise(r => setTimeout(r, 100)); }
    assert.ok(seen.size >= 2, `want the main server + the spec's own serve.py, saw ${seen.size}`);
    process.kill(ra.pid, "SIGTERM");
    await new Promise(r => setTimeout(r, 2000));
    const left = [...seen].filter(alive);
    assert.deepEqual(left, [], `serve.py left running after SIGTERM: ${left}`);
  } finally {
    for (const p of [...seen, ...tree(ra.pid)]) try { process.kill(p, "SIGKILL"); } catch { /* gone */ }
    try { process.kill(ra.pid, "SIGKILL"); } catch { /* gone */ }
  }
});
