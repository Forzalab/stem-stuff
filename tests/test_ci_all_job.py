"""AC0.2: the `all` check (the one required check) is never skipped, and its verdict is red unless every needed job
succeeded or was skipped for a documented reason. Text-only parse of .github/workflows/tests.yml (no PyYAML on the
unit runner, same as test_ci_image.py), then the verdict script itself is run for each pipe/result combination.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WF = os.path.join(ROOT, ".github", "workflows", "tests.yml")
VERDICT = os.path.join(ROOT, "tools", "operations", "ci-all-verdict.sh")


def all_job():
    """The text of the top-level `all:` job (2-space key) of tests.yml."""
    with open(WF, encoding="utf-8") as f:
        lines = f.read().splitlines()
    start = lines.index("  all:")
    body = []
    for line in lines[start + 1:]:
        if re.match(r"^  \S", line):  # next job or comment at job level ends it
            break
        body.append(line)
    return "\n".join(body)


def verdict(**env):
    """Run the verdict script with the given job results; returns (exit code, output)."""
    base = {"INPUT_PIPE": "", "PIPE": "full", "DECIDE": "success", "PLAN": "success", "UNIT": "success",
            "BLOCK": "success", "LIVE_OK": "success", "EVENT": "pull_request", "DOCS_ONLY": "false", "SKIP_BLOCK": "false"}
    base.update(env)
    full_env = {k: v for k, v in os.environ.items() if k not in base}
    full_env.update(base)
    p = subprocess.run(["bash", VERDICT], env=full_env, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


class AllJobNeverSkipped(unittest.TestCase):
    def test_if_is_always_and_nothing_else(self):
        ifs = re.findall(r"^    if:\s*(.*)$", all_job(), re.M)
        self.assertEqual(ifs, ["always()"], "a pipe-dependent `if` lets GitHub skip the required check")

    def test_needs_every_job_it_judges(self):
        needs = re.search(r"^    needs:\s*\[(.*)\]", all_job(), re.M).group(1)
        self.assertEqual({n.strip() for n in needs.split(",")}, {"decide", "plan", "unit", "block", "live-ok"})

    def test_runs_the_verdict_script(self):
        self.assertIn("tools/operations/ci-all-verdict.sh", all_job())
        self.assertTrue(os.access(VERDICT, os.X_OK), "the workflow calls it directly, so it must be executable")


class LiveOk(unittest.TestCase):
    """VISUAL-PR GATE: the live-ok job script and its place in the verdict."""
    SCRIPT = os.path.join(ROOT, "tools", "operations", "ci-live-ok.sh")

    def labels(self, text, **extra):
        env = dict(os.environ, LABELS=text, **extra)
        return subprocess.run(["bash", self.SCRIPT], env=env, capture_output=True, text=True).returncode

    def test_labels(self):
        self.assertEqual(self.labels("nonvisual"), 0)
        self.assertEqual(self.labels("visual\nlive-ok-tony"), 0)
        self.assertEqual(self.labels("visual"), 1)
        self.assertEqual(self.labels("bug,other"), 1)
        self.assertEqual(self.labels(""), 1)
        self.assertEqual(self.labels("visual,nonvisual,live-ok-tony"), 1)

    def test_dependabot_is_exempt(self):
        self.assertEqual(self.labels("", AUTHOR="dependabot[bot]"), 0)
        self.assertEqual(self.labels("", AUTHOR="someone", HEAD_REF="dependabot/npm/x", HEAD_REPO="o/r", REPO="o/r"), 0)
        self.assertEqual(self.labels("", AUTHOR="someone", HEAD_REF="dependabot/npm/x", HEAD_REPO="fork/r", REPO="o/r"), 1)
        self.assertEqual(self.labels("visual", AUTHOR="someone"), 1)

    def test_verdict(self):
        self.assertEqual(verdict(LIVE_OK="failure")[0], 1)
        self.assertEqual(verdict(LIVE_OK="skipped")[0], 1)
        self.assertEqual(verdict(LIVE_OK="skipped", EVENT="push")[0], 0)


class Verdict(unittest.TestCase):
    def test_full_green(self):
        code, out = verdict()
        self.assertEqual(code, 0, out)

    def test_fast_pipe_is_red_with_the_named_reason(self):
        for env in ({"PIPE": "fast"}, {"INPUT_PIPE": "fast"}):
            code, out = verdict(**env)
            self.assertEqual(code, 1, env)
            self.assertIn("fast pipe only: no full run for this head", out)

    def test_fast_pipe_wins_over_skipped_jobs(self):
        code, _ = verdict(PIPE="fast", PLAN="skipped", UNIT="skipped", BLOCK="skipped")
        self.assertEqual(code, 1)

    def test_docs_only_may_skip_unit_and_block(self):
        code, out = verdict(UNIT="skipped", BLOCK="skipped", DOCS_ONLY="true")
        self.assertEqual(code, 0, out)

    def test_unit_skip_without_docs_only_is_red(self):
        code, _ = verdict(UNIT="skipped")
        self.assertEqual(code, 1)

    def test_zero_pw_selection_may_skip_block_only(self):
        self.assertEqual(verdict(BLOCK="skipped", SKIP_BLOCK="true")[0], 0)
        self.assertEqual(verdict(UNIT="skipped", DOCS_ONLY="true", BLOCK="skipped", SKIP_BLOCK="false")[0], 0)
        self.assertEqual(verdict(BLOCK="skipped", SKIP_BLOCK="false")[0], 1)

    def test_failed_or_cancelled_needs_are_red(self):
        for env in ({"DECIDE": "failure"}, {"PLAN": "cancelled"}, {"UNIT": "failure"}, {"BLOCK": "failure"},
                    {"BLOCK": "cancelled"}, {"PLAN": "skipped"}):
            self.assertEqual(verdict(**env)[0], 1, env)


if __name__ == "__main__":
    unittest.main()
