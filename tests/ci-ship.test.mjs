// SHIP_MODE policy (ci-loosen-review.md TODO 12-16: P4 stamp, P5 strict/LKG/rollback, P7 culprit, flake ticket). Pure units, no network:
// the CLI/workflow glue is thin; the decisions live in tools/operations/ci-ship.mjs, ci-flaky.mjs, ci-flake-ticket.mjs, prod-smoke.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { decideStamp, verifyStamp, makeStamp, stampName, parseStampName, decidePolicy, mainState, confirmedRed, decidePostdeploy,
  pickLkg, planRollback, applyEvent, pickCulprit, prOfSubject, shipModeOf } from "../tools/operations/ci-ship.mjs";
import { decideAll } from "../tools/operations/ci-flaky.mjs";
import { appendTickets } from "../tools/operations/ci-flake-ticket.mjs";
import { smoke } from "../tools/operations/prod-smoke.mjs";

const T = "a".repeat(40), T2 = "b".repeat(40), REPO = "Forzalab/stem-stuff", NOW = Date.parse("2026-11-15T12:00:00Z");
const jailEntry = (spec) => ({ spec, test: "*", owner: "t", reason: "#1", added: "2026-11-14", expires: "2026-11-20" });
const run = (o = {}) => ({ id: 7, path: ".github/workflows/tests.yml", event: "pull_request", conclusion: "success", created_at: "2026-11-15T10:00:00Z", head_repository: { full_name: REPO }, ...o });
const entry = (kind, o = {}, stampO = {}, tree = T) => ({ name: stampName(tree, kind), stamp: { tree, kind, flaky: [], ...stampO }, run: run(o) });

test("shipModeOf: only the exact word pr-green turns it on; default strict", () => {
  assert.equal(shipModeOf(undefined), "strict"); assert.equal(shipModeOf(""), "strict"); assert.equal(shipModeOf("PR-GREEN"), "strict"); assert.equal(shipModeOf("pr-green"), "pr-green");
});

test("AC5.1 same tree + full stamp -> ok; affected -> ok + needs_postdeploy", () => {
  const f = decideStamp({ tree: T, entries: [entry("full")], repo: REPO });
  assert.deepEqual([f.ok, f.kind, f.needs_postdeploy], [true, "full", false]);
  const a = decideStamp({ tree: T, entries: [entry("affected")], repo: REPO });
  assert.deepEqual([a.ok, a.kind, a.needs_postdeploy], [true, "affected", true]);
  assert.equal(decideStamp({ tree: T, entries: [entry("affected"), entry("full")], repo: REPO }).kind, "full", "full beats affected");
});
test("AC5.1 moved base (tree differs) / no stamp / fast-pipe run / fork run -> strict", () => {
  assert.equal(decideStamp({ tree: T2, entries: [entry("full")], repo: REPO }).ok, false, "moved base");
  assert.equal(decideStamp({ tree: T, entries: [], repo: REPO }).ok, false, "no stamp");
  assert.equal(decideStamp({ tree: T, entries: [entry("full", { event: "workflow_dispatch" })], repo: REPO }).ok, false, "dispatch (fast/bench) run");
  assert.equal(decideStamp({ tree: T, entries: [entry("full", { event: "schedule" })], repo: REPO }).ok, false, "schedule run");
  assert.equal(decideStamp({ tree: T, entries: [entry("full", { head_repository: { full_name: "evil/stem-stuff" } })], repo: REPO }).ok, false, "fork run");
  assert.equal(decideStamp({ tree: T, entries: [entry("full", { path: ".github/workflows/evil.yml" })], repo: REPO }).ok, false, "other workflow");
  assert.equal(decideStamp({ tree: T, entries: [entry("full", { conclusion: "failure" })], repo: REPO }).ok, false, "run not green");
  assert.equal(decideStamp({ tree: T, entries: [{ ...entry("full"), stamp: { tree: T2, kind: "full" } }], repo: REPO }).ok, false, "body does not match name");
});
test("AC3.11 a run with an unjailed flaky spec gets no stamp; a jailed one does", () => {
  assert.equal(makeStamp({ tree: T, kind: "full", flaky: ["flow"], jail: [], now: NOW }), null);
  assert.ok(makeStamp({ tree: T, kind: "full", flaky: ["flow"], jail: [jailEntry("flow")], now: NOW }));
  assert.equal(makeStamp({ tree: T, kind: "docs", now: NOW }), null, "docs-only has no stamp");
  assert.equal(verifyStamp(entry("full", {}, { flaky: ["flow"] }), { repo: REPO, tree: T, jail: [] }).ok, false, "forged stamp with an unjailed flake");
  assert.deepEqual(parseStampName(stampName(T, "full")), { tree: T, kind: "full" });
});

const mainRun = (o) => ({ head_branch: "main", event: "push", status: "completed", created_at: "2026-11-15T09:00:00Z", head_sha: "c1", run_attempt: 1, ...o });
test("AC5.6 strict mode: main red refuses a PR-green stamp; its own full green (push) is ok; mode strict ignores stamps", () => {
  const strictNo = { ok: false, reason: "no successful full tests.yml run on main" };
  const red = [mainRun({ conclusion: "failure", test_failure: true })];
  assert.equal(mainState(red).red, true);
  const pr = decidePolicy({ mode: "pr-green", strict: strictNo, tree: T, entries: [entry("full")], repo: REPO, runs: red });
  assert.equal(pr.ok, false); assert.match(pr.reason, /main is red/);
  assert.equal(decidePolicy({ mode: "pr-green", strict: strictNo, tree: T, entries: [entry("affected")], repo: REPO, runs: red }).ok, false);
  assert.equal(decidePolicy({ mode: "pr-green", strict: strictNo, tree: T, entries: [entry("full", { event: "push" })], repo: REPO, runs: red }).ok, true, "own full green");
  const green = [mainRun({ conclusion: "success" })];
  const ok = decidePolicy({ mode: "pr-green", strict: strictNo, tree: T, entries: [entry("affected")], repo: REPO, runs: green });
  assert.deepEqual([ok.ok, ok.needs_postdeploy], [true, true]);
  assert.deepEqual(decidePolicy({ mode: "strict", strict: strictNo, tree: T, entries: [entry("full")], repo: REPO, runs: green }), { ...strictNo, needs_postdeploy: false, via: "strict" }, "strict = today");
  assert.equal(decidePolicy({ mode: undefined, strict: strictNo, tree: T, entries: [entry("full")], repo: REPO }).ok, false);
});
test("confirmedRed: an infra failure on attempt 1 is not red; attempt >= 2 or a FAIL line is", () => {
  assert.equal(confirmedRed({ conclusion: "failure", run_attempt: 1 }), false);
  assert.equal(confirmedRed({ conclusion: "failure", run_attempt: 2 }), true);
  assert.equal(confirmedRed({ conclusion: "failure", run_attempt: 1, test_failure: true }), true);
  assert.equal(confirmedRed({ conclusion: "cancelled", run_attempt: 2 }), false);
});

test("AC5.2/5.3 post-deploy: flaky jailed -> quiet; unjailed flaky -> ticket + strict, no rollback; failed twice -> rollback to lkg + strict", () => {
  const jail = [jailEntry("flow")];
  const q = decidePostdeploy({ failed: [], flaky: ["flow"], jail, now: NOW, lkg: "L" });
  assert.deepEqual([q.rollback, q.quiet, q.tickets], [null, true, []]);
  const t = decidePostdeploy({ failed: ["bar"], flaky: ["bar"], jail, now: NOW, lkg: "L" });   // unjailed flake prints FAIL too
  assert.deepEqual([t.rollback, t.mode, t.tickets], [null, "strict", ["bar"]]);
  const r = decidePostdeploy({ failed: ["bar"], flaky: [], jail, now: NOW, lkg: "L" });
  assert.deepEqual([r.rollback, r.mode], ["L", "strict"]);
  assert.equal(decidePostdeploy({ failed: ["bar"], jail, now: NOW, infra: true, lkg: "L" }).rollback, null, "infra failure: retry.yml's job");
  assert.equal(decidePostdeploy({ failed: ["bar"], jail, now: NOW, lkg: null }).rollback, null, "no lkg: nothing to roll back to");
});
test("AC5.3 lkg = newest sha that was live AND has a full green", () => {
  assert.equal(pickLkg({ live: ["ddddddd1", "ccccccc1", "bbbbbbb1"], fulls: ["bbbbbbb1aaaa", "aaaaaaa1"] }), "bbbbbbb1");
  assert.equal(pickLkg({ live: ["ddddddd1"], fulls: [] }), null);
});
test("Hobby rollback rule: lkg == previous prod deploy -> vercel rollback, else redeploy the sha", () => {
  const d = (sha, n) => ({ id: `dpl_${n}`, url: `https://s-${n}.vercel.app`, sha });
  assert.deepEqual(planRollback({ lkg: "1111111", deploys: [d("2222222", 2), d("1111111", 1)] }), { action: "rollback", target: "https://s-1.vercel.app", id: "dpl_1", reason: "lkg is the previous production deploy: vercel rollback" });
  assert.equal(planRollback({ lkg: "1111111", deploys: [d("3333333", 3), d("2222222", 2), d("1111111", 1)] }).action, "redeploy");
  assert.equal(planRollback({ lkg: "1111111", deploys: [d("2222222", 2), d(null, 1)] }).action, "redeploy", "unknown sha = redeploy, never guess");
  assert.equal(planRollback({ lkg: "1111111", deploys: [d("1111111", 1)] }).action, "noop");
  assert.equal(planRollback({ lkg: null, deploys: [] }).action, "none");
});

test("AC5.8 race: ship A ok, postdeploy A red, merge B, rollback, ship B requested, in any causal order -> prod == lkg, gate strict", () => {
  const evs = { shipA: { type: "ship", sha: "A" }, red: { type: "red" }, rollback: { type: "rollback" }, shipB: { type: "ship", sha: "B" } };
  const keys = Object.keys(evs);
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  let n = 0;
  for (const p of perms(keys)) {
    if (p.indexOf("shipA") > p.indexOf("red") || p.indexOf("red") > p.indexOf("rollback")) continue;   // causal: A ships, then it is seen red, then the rollback is dispatched
    // the rollback runs after the last ship run ahead of it in the `ship` group; a ship B behind it is gated strict (red) and refused
    const s = p.reduce((st, k) => applyEvent(st, evs[k]), { prod: "L", lkg: "L", red: false });
    assert.equal(s.prod, "L", p.join(">")); assert.equal(s.red, true, "gate stays strict until a full green"); n++;
  }
  assert.ok(n >= 4);
  // ship B behind the rollback in the group, B gated at run time (red recorded already) -> refused; B with its own full green -> allowed
  assert.equal(applyEvent({ prod: "L", lkg: "L", red: true }, { type: "ship", sha: "B", ownFull: true }).prod, "B");
});

test("AC5.11 culprit: the oldest failing merge, named by its PR", () => {
  const legs = [{ sha: "1".repeat(40), subject: "Add a (#101)", failed: false }, { sha: "2".repeat(40), subject: "Break it (#102)", failed: true }, { sha: "3".repeat(40), subject: "Merge pull request #103 from x/y", failed: true }];
  const c = pickCulprit(legs); assert.deepEqual([c.ok, c.pr], [true, 102]);
  assert.equal(pickCulprit(legs.map((l) => ({ ...l, failed: false }))).ok, false);
  assert.equal(prOfSubject("Merge pull request #5 from a/b"), 5); assert.equal(prOfSubject("no pr"), null);
});

test("flake ticket rule: PR + unjailed flake -> `all` passes (yellow) with a ticket; main/strict -> still red", () => {
  const blocks = [{ block: 1, flaky: ["flow", "bar"] }], jail = [jailEntry("flow")];
  const pr = decideAll({ blocks, jail, now: NOW, pr: true });
  assert.deepEqual([pr.ok, pr.tickets], [true, ["bar"]]);
  const push = decideAll({ blocks, jail, now: NOW });
  assert.deepEqual([push.ok, push.tickets], [false, ["bar"]]);
  assert.equal(decideAll({ blocks: [{ block: 1, flaky: null }], jail, now: NOW, pr: true }).ok, false, "a missing flaky.txt still fails closed");
});
test("flake ticket body: one `- [ ]` line per spec, deduped while unchecked, re-added once checked", () => {
  const url = "https://github.com/x/y/actions/runs/9";
  const a = appendTickets("", ["flow", "bar", "flow"], url, "2026-11-15");
  assert.equal(a.body, `- [ ] flow — ${url} — 2026-11-15\n- [ ] bar — ${url} — 2026-11-15\n`); assert.deepEqual(a.added, ["flow", "bar"]);
  const b = appendTickets(a.body, ["flow", "baz"], url, "2026-11-16");
  assert.deepEqual([b.added, b.skipped], [["baz"], ["flow"]]);
  const c = appendTickets(a.body.replace("- [ ] flow", "- [x] flow"), ["flow"], url, "2026-11-17");
  assert.deepEqual(c.added, ["flow"], "a checked-off flake that comes back is a new ticket");
  assert.equal(appendTickets(a.body, ["flo"], url, "d").added[0], "flo", "prefix of another spec is not a duplicate");
});

test("AC5.4 prod-smoke: exit-0 conditions on a live server, red on a bad URL, fast", async () => {
  const srv = createServer((q, r) => {
    const ok = (s, b = "") => { r.statusCode = s; r.end(b); };
    if (q.url === "/" || q.url.startsWith("/p/")) return ok(200, "x");
    if (q.url === "/version.json") return ok(200, '{"pr":"#1","sha":"abc1234"}');
    if (q.url === "/check") return ok(200, '{"correct":true}');
    ok(404);
  });
  await new Promise((res) => srv.listen(0, res));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const t0 = Date.now();
  const good = await smoke(base, { expectSha: "abc1234ffff" });
  assert.ok(good.every((c) => c.ok), JSON.stringify(good)); assert.ok(Date.now() - t0 < 60_000);
  assert.equal((await smoke(base, { expectSha: "9999999" })).some((c) => !c.ok), true, "wrong sha is red");
  srv.close();
  assert.equal((await smoke("not a url")).some((c) => !c.ok), true);
  assert.equal((await smoke("http://127.0.0.1:1")).some((c) => !c.ok), true, "nothing listening");
});

test("AC5.7 ship.yml: group ship, no `queue: max`, rollback is a mode of ship.yml; auto-ship + SHIP_MODE wiring", () => {
  const ship = readFileSync(new URL("../.github/workflows/ship.yml", import.meta.url), "utf8");
  assert.match(ship, /^concurrency: \{ group: ship, cancel-in-progress: false \}$/m);
  assert.doesNotMatch(ship, /queue:\s*max/);
  assert.match(ship, /options: \[demo, live, rollback\]/);
  assert.match(ship, /inputs\.mode == 'rollback'/);
  assert.doesNotMatch(ship, /secrets\.(?!VERCEL_TOKEN|BRAIN_TOKEN)\w+/, "no new secret");
  const tests = readFileSync(new URL("../.github/workflows/tests.yml", import.meta.url), "utf8");
  for (const job of ["flake-ticket", "postdeploy", "lkg"]) assert.match(tests.slice(tests.indexOf(`\n  ${job}:`)), new RegExp(`${job}:[\\s\\S]*?vars\\.SHIP_MODE == 'pr-green'`), job);
  assert.equal(tests.split(/permissions:.*issues: write/).length, 2, "issues: write in exactly one job");
  assert.match(readFileSync(new URL("../.github/workflows/auto-ship.yml", import.meta.url), "utf8"), /vars\.SHIP_MODE == 'pr-green'/);
});
