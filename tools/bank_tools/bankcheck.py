#!/usr/bin/env python3
"""bankcheck: will a bank file load on the server, and does it follow SCHEMA.md? docs/design/BANKCHECK.md.

  python3 tools/bank_tools/bankcheck.py <bank.json | dir>... [--today YYYY-MM-DD] [--load-only] [--codes]

Every rule comes from server/http_server/serve.py or from the SCHEMA.md "problems" block; nothing is copied here.
Exit 0 = no FAIL (warnings allowed), 1 = any FAIL. On a FAIL the last line is `Agents: read docs/design/BANKCHECK.md#<CODE>`.
"""
import argparse
import copy
import datetime
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "server" / "http_server"), str(ROOT / "server")]
import serve  # noqa: E402  (no side effects when imported: serve.py MAIN is False)

try:
    import jsonschema
except ImportError:  # reported as B-DEPS, never a silent skip
    jsonschema = None

# server give-up order (= the pointer's precedence); B-DEPS is a tool failure, listed first
CODES = ["B-DEPS", "B-NAME", "B-JSON", "B-VER", "B-EMPTY", "B-HIDDEN", "B-SCHEMA", "B-DUP", "B-PREFIX"]
LOAD_CODES = {"B-NAME", "B-JSON", "B-VER", "B-EMPTY", "B-HIDDEN"}
PREFIX = re.compile(r"^([A-Z][A-Z0-9]*)_")


def schema():
    """the SCHEMA.md problems block, read the way tests/schemas.mjs reads it."""
    text = (ROOT / "SCHEMA.md").read_text(encoding="utf-8")
    m = re.search(r"<!-- schema: problems -->\s*```json\n([\s\S]*?)\n```", text)
    return json.loads(m[1])


def _hidden(p, mode):
    try:
        return serve.hidden(p, mode)
    except Exception:  # a malformed item is the schema's to report, not a crash here
        return False


def check_file(path, load_only):
    """(findings, survivors) for one file. findings = [(level, code, msg)] in check order; survivors = the unfolded problems the
    server would keep (None when the JSON does not load)."""
    out = []
    name = os.path.basename(path)
    stem = name[:-5] if name.endswith(".json") else name
    builtin = name == "problems.json"   # the built-in file, not a bank: never dropped (serve.py:256)
    if not builtin and not serve.BANK_CODE.match(stem):
        out.append(("FAIL", "B-NAME", f"'{stem}' is not BANK_ + 3-6 of A-Z0-9 (serve.py BANK_CODE): the server skips it"))
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        if not isinstance(doc, dict) or not isinstance(doc.get("problems"), list):
            raise ValueError("want an object with a problems list")
    except (OSError, ValueError) as e:
        out.append(("FAIL", "B-JSON", f"does not load as a bank: {e}"))
        return out, None
    # SPEC errors are computed on the raw doc (inherit_tol below adds keys the schema would refuse)
    errs = [] if load_only or jsonschema is None else list(jsonschema.Draft202012Validator(schema()).iter_errors(doc))
    if not builtin:
        v = doc.get("v", 1)
        v = v if isinstance(v, int) and not isinstance(v, bool) else 1   # serve.py:232-236: a bad v counts as 1
        note, dropped = serve.bank_notice(stem, v)
        if dropped:
            out.append(("FAIL", "B-VER", f"{note}: the server drops it (v {v} < {serve.CUTOFF})"))
        elif note:
            out.append(("WARN", "B-VER", f"{note}: update the bank before then"))
    d = copy.deepcopy(doc)
    serve.inherit_tol(d)
    keep, ps = [], []
    skipped = []
    for i, p in enumerate(d["problems"]):
        if isinstance(p, dict) and isinstance(p.get("code"), str):
            keep.append(p)
            ps += serve.unfold(p)
        else:
            skipped.append(f"problems[{i}] is {'not an object' if not isinstance(p, dict) else 'missing a string code'}")
    if not ps:
        out.append(("FAIL", "B-EMPTY", "no problem survives the loader's filter: " + ("; ".join(skipped) or "the list is empty")))
    elif skipped:
        out.append(("WARN", "B-EMPTY", "skipped by the loader: " + "; ".join(skipped)))
    if ps and all(_hidden(q, "sugar") for q in ps):
        out.append(("FAIL", "B-HIDDEN", f"all {len(ps)} problems are hidden in sugar mode (the default): the bank opens empty"))
    elif ps and all(_hidden(q, "diet") for q in ps):
        out.append(("WARN", "B-HIDDEN", "all problems are hidden in diet mode"))
    if not load_only and jsonschema is None:
        out.append(("FAIL", "B-DEPS", "jsonschema is not installed: pip install jsonschema (requirements.txt)"))
    elif errs:
        for e in sorted(errs, key=lambda e: list(e.absolute_path))[:3]:
            where = "/".join(str(x) for x in e.absolute_path) or "(root)"
            # the instance is not printed (answers live in the bank): only the key name or the failed keyword
            detail = e.message if e.validator in ("required", "additionalProperties") else f"fails {e.validator}"
            out.append(("FAIL", "B-SCHEMA", f"{where}: {detail}"))
        if len(errs) > 3:
            out.append(("FAIL", "B-SCHEMA", f"+{len(errs) - 3} more"))
    if not load_only and not builtin:
        seen, reported = {}, set()
        for q in ps:
            c = q["code"]
            if c in seen and seen[c] != q and c not in reported:
                reported.add(c)
                out.append(("FAIL", "B-DUP", f"code {c} appears twice in this file with different content: the first copy wins"))
            seen.setdefault(c, q)
        flag = doc.get("bank")
        if not (isinstance(flag, str) and serve.BANK_CODE.match(flag)):   # no valid "bank" flag: the prefix must be the stem's
            want = stem.removeprefix("BANK_")
            bad = [q["code"] for q in ps if (m := PREFIX.match(q["code"])) and m[1] != want]
            if bad:
                out.append(("WARN", "B-PREFIX", f"{len(bad)} code(s) do not start with {want}_ (e.g. {bad[0]}): "
                                                 f"a custom prefix needs \"bank\": \"BANK_<prefix>\" (docs/design/BANK.md)"))
    return out, ps


def expand(paths):
    files = []
    for a in paths:
        p = Path(a)
        if p.is_dir():
            files += sorted(str(x) for x in p.glob("*.json") if x.name != serve.SHEET_NAME)
        else:
            files.append(str(p))
    return files


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check bank files against the server and SCHEMA.md (docs/design/BANKCHECK.md).")
    ap.add_argument("paths", nargs="*", help="bank .json files or directories of them")
    ap.add_argument("--today", help="pin the date (YYYY-MM-DD) for the version check; default serve.today()")
    ap.add_argument("--load-only", action="store_true", help="skip the SPEC checks (throwaway fixtures)")
    ap.add_argument("--codes", action="store_true", help="print the codes in order and exit")
    a = ap.parse_args(argv)
    if a.codes:
        print("\n".join(CODES))
        return 0
    if not a.paths:
        ap.error("give a bank file or a directory")
    if a.today:
        try:
            os.environ["STEM_TODAY"] = datetime.date.fromisoformat(a.today).isoformat()
        except ValueError:
            ap.error("--today wants YYYY-MM-DD")
    results = []   # [path, findings, survivors]
    for f in expand(a.paths):
        findings, ps = check_file(f, a.load_only)
        results.append([f, findings, ps])
    if not a.load_only:   # cross-file duplicates: the server's order is problems.json first, then banks A-Z; first copy wins
        won = {}
        for r in sorted(results, key=lambda r: (os.path.basename(r[0]) != "problems.json", os.path.basename(r[0]))):
            for q in r[2] or []:
                c = q["code"]
                if c not in won:
                    won[c] = (r[0], q)
                elif won[c][1] != q and won[c][0] != r[0]:
                    r[1].append(("WARN", "B-DUP", f"code {c} is also in {won[c][0]} with different content: that copy wins"))
    fails = []
    for path, findings, ps in results:
        for level, code, msg in findings:
            print(f"BANKCHECK {level} {path} {code}: {msg}")
            if level == "FAIL":
                fails.append(code)
        if ps is not None and not any(level == "FAIL" for level, _, _ in findings):
            print(f"BANKCHECK OK {path} ({len(ps)} problems)")
    if fails:
        print(f"Agents: read docs/design/BANKCHECK.md#{min(fails, key=CODES.index)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
