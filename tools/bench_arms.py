#!/usr/bin/env python3
"""Bench ARMS for the Cluck / mini-Cluck / error-label engines (Tony's #16, #17, #17b; brain P3-errors-cache.md arm D). Stdlib only.

Three jobs per student event (a wrong pick on a bank item):
  cluck  = the full wish, the live prompt (serve.PROMPT_V4, prompts/cluck-v4.txt) + the same user turn the server builds
  mini   = mini-Cluck: tiny system prompt, ONE short hint, must NOT give the answer
  label  = error-type label from the bucket listing (serve.GAPS + "new"), with a confidence
Arms (calls per event):
  A ONE engine    1 call : one prompt, one model does all three jobs in one reply
  B TWO engines   2 calls: cluck | mini+label (mini-Cluck also labels)
  C THREE engines 3 calls: cluck | mini | labeler
  D cascade       2 calls (+1 on escalation): like B, but mini+label runs on the arm's cheap model first and escalates to --escalate
                  when the label is `new`, confidence is low, or the reply fails the format
Every arm runs on every model in --models (default: haiku, sonnet, and the server's current default; deduped). All system prompts are
sent as one cache_control block (prompt caching on in every arm; a prefix under the model's minimum just reports 0 cache reads).

    python3 tools/bench_arms.py --dry-run                         no API: plan, call counts, canned replies through the real scorer
    python3 tools/bench_arms.py --items 3 --models claude-haiku-5-5 --escalate claude-haiku-5-5 --out DIR    the smoke run
    CLAUDE_API=sk-ant-... or OPENROUTER_API_KEY=...  (direct Anthropic wins; else OpenRouter anthropic/<model>)

Metrics per (arm, model): label accuracy, false-match rate (said a wrong bucket; `new` or no answer is not a false match), schema-fail
rate, mini answer-leak rate (bench_claude.new_numbers inverted: key numbers absent from the question that the mini reply says, or
"pick b"), Cluck invented-number rate (bench_claude's new_numbers on the wish), cache-key stability (a label must not change when only
the numbers do: fixture twins), cache hit rate, tokens, cost per 1k events (tokens x PRICES, fill PRICES), p50/p90 latency per call and
per event (calls in an event run in parallel in production: event latency = slowest call; a cascade escalation adds to its mini call).
Per-event rows (gold, label, correct, model, arm) go to records.jsonl so a router can be fit later (brain P3, FrugalGPT).
Fixture tests/fixtures/bench-arms-items.json: gold labels are a DRAFT, "needs Tony check"."""
import argparse
import collections
import json
import math
import os
import re
import sys
import time
import urllib.request  # noqa: F401  (bench_claude does the streaming; kept for the OpenRouter helper's HTTPError)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench_claude as bc  # noqa: E402  (imports serve)

serve = bc.serve
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "bench-arms-items.json")

# TODO(Tony): fill in $ per million tokens for every model you bench (deliberately NOT hard-coded from memory). A None keeps cost at "n/a".
# "cache_read" / "cache_write" are the cached-input and cache-write prices. Keys = the direct API name; OpenRouter ids are derived.
PRICES = {
    "claude-haiku-5-5": {"in": None, "out": None, "cache_read": None, "cache_write": None},    # TODO
    "claude-sonnet-5-5": {"in": None, "out": None, "cache_read": None, "cache_write": None},   # TODO
    "claude-opus-5-5": {"in": None, "out": None, "cache_read": None, "cache_write": None},     # TODO (cascade escalation target)
}
SPEND_CAP_USD = 1.0     # hard stop for a paid run (--cap); counted with serve.claude_price, which overestimates (no cache discount)
ARM_JOBS = {"A": ("all",), "B": ("cluck", "minilabel"), "C": ("cluck", "mini", "label"), "D": ("cluck", "minilabel")}
MAX_TOKENS = {"cluck": bc.serve.V4_MAX, "mini": 80, "label": 60, "minilabel": 120, "all": bc.serve.V4_MAX + 150}
OUT_EST = {"cluck": 300, "mini": 40, "label": 25, "minilabel": 65, "all": 370}      # dry-run output-token guesses (labelled as guesses)
LABELS = list(serve.GAPS) + ["new"]
_m = re.search(r"gap, the most specific that fits: (.+?)\nevidence:", serve.CLUCK_NOTE, re.S)
BUCKETS = (_m.group(1).strip() if _m else ", ".join(serve.GAPS)) + " · new (none of these fits: a slip no bucket describes)."

MINI_RULES = ("You are mini-Cluck, a duck tutor. The student picked a wrong answer. Give ONE hint, at most 25 words, that points at the "
              "step to re-check. Never state the final answer, the right choice letter, or any number that is not in the QUESTION. "
              "Plain words. End with QUACK.")
LABEL_RULES = ("Name the student's slip as ONE bucket from this list, and how sure you are (low, medium, high). Buckets: " + BUCKETS +
               " Judge the pick against the QUESTION and KEY. Use `no_signal` when nothing shows the move, `new` when a move is shown but no bucket fits.")
SYS = {
    "cluck": serve.PROMPT_V4,
    "mini": MINI_RULES,
    "label": LABEL_RULES + '\nReply with only JSON: {"gap": "<bucket>", "confidence": "low|medium|high"}',
    "minilabel": LABEL_RULES + "\n" + MINI_RULES + "\nReply in exactly two lines:\nLABEL: <bucket>|<low|medium|high>\nMINI: <hint>",
    "all": (serve.PROMPT_V4 or "") + "\n\n[ BENCH: THREE JOBS, ONE REPLY ]\n" + LABEL_RULES + "\n" + MINI_RULES +
           "\nReply in this order: first line `LABEL: <bucket>|<low|medium|high>`; second line `MINI: <the hint>`; then a line `WISH:` and "
           "after it your usual full reply to the student, exactly as the letter above says.",
}


def load(path=FIXTURE):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["items"]


def problem(row):
    """the bank-shaped problem (bench_claude's builder) for a fixture row"""
    p = bc._p("ARM_" + row["id"], row["q"], [(chr(97 + i), c) for i, c in enumerate(row["ch"])], row["key"], {})
    return dict(p, correct=row["correct"])


def user_turn(row, job):
    u = serve.explain_prompt(problem(row), row["pick"])
    if row.get("msg"):
        u += "\n\nSTUDENT MESSAGE:\n" + serve.wrap(row["msg"], "student_bench")
    return u + ("\n\n" + serve.WISH_QUERY if job in ("cluck", "all") else "")


# ---------------- parsing + scoring (pure; tests/test_bench_arms.py) ----------------
LABEL_RE = re.compile(r"LABEL:\s*([A-Za-z_]+)\s*\|\s*(low|medium|high)", re.I)
LETTER_RE = re.compile(r"\b(?:pick|choose|choice|answer(?:\s+is)?|correct(?:\s+answer|\s+choice)?(?:\s+is)?)\s*:?\s*\(?([a-e])\)?(?![A-Za-z])", re.I)


def parse(job, text):
    """{label, conf, mini, wish, ok}: ok = a valid bucket and confidence came back in the asked shape"""
    out = {"label": None, "conf": None, "mini": "", "wish": "", "ok": False}
    if job in ("minilabel", "all"):
        m = LABEL_RE.search(text)
        if m:
            out["label"], out["conf"] = m.group(1).lower(), m.group(2).lower()
        mm = re.search(r"MINI:\s*(.+?)(?:\n\s*WISH:|\Z)", text, re.S | re.I)
        out["mini"] = mm.group(1).strip() if mm else ""
        out["wish"] = text.partition("WISH:")[2].strip() if job == "all" else ""
        if job == "all" and not out["wish"] and not out["label"]:
            out["wish"] = text
    elif job == "label":
        m = re.search(r"\{.*?\}", text, re.S)
        try:
            j = json.loads(m.group(0)) if m else {}
            out["label"], out["conf"] = str(j.get("gap", "")).lower() or None, str(j.get("confidence", "")).lower() or None
        except ValueError:
            pass
    elif job == "mini":
        out["mini"] = text.strip()
    elif job == "cluck":
        out["wish"] = text.strip()
    if job in ("minilabel", "all", "label"):
        out["ok"] = out["label"] in LABELS and out["conf"] in ("low", "medium", "high") and (job == "label" or bool(out["mini"]))
    else:
        out["ok"] = bool(text.strip())
    return out


def leak(mini, row):
    """mini-Cluck answer leak = bench_claude's new_numbers inverted: numbers of the KEY that the question never showed (and the student's
    own pick did not say) appearing in the mini reply, or the right choice letter named ("pick b"). {leak, nums, letter}"""
    pick_txt = row["ch"][ord(row["pick"]) - 97] if row["pick"] in "abcde" else ""
    secret = bc.numbers(row["key"]) - bc.numbers(row["q"]) - {0.0, 1.0, 2.0} - bc.numbers(pick_txt)
    hit = sorted(bc.numbers(mini) & secret)
    letter = any(m.group(1).lower() == row["correct"] for m in LETTER_RE.finditer(mini))
    return {"leak": bool(hit or letter), "nums": hit, "letter": letter}


def invented(wish, row):
    """the numbers a Cluck wish made up: bench_claude.check's new_numbers rule (not the key, the question or the shown choices)"""
    return sorted(bc.numbers(wish) - bc.numbers(row["key"] + "\n" + row["q"] + "\n" + " ".join(row["ch"])) - {0.0, 1.0, 2.0})


def escalate_needed(p):
    return (not p["ok"]) or p["label"] == "new" or p["conf"] == "low"


def usd(u, model):
    """$ for one call's tokens from PRICES; None while any needed price is None"""
    p = PRICES.get(model) or {}
    fresh = max(u["tin"] - u["cr"] - u["cw"], 0)
    parts = ((fresh, p.get("in")), (u["cr"], p.get("cache_read") if p.get("cache_read") is not None else p.get("in")),
             (u["cw"], p.get("cache_write") if p.get("cache_write") is not None else p.get("in")), (u["tout"], p.get("out")))
    if any(n and price is None for n, price in parts):
        return None
    return sum(n * price for n, price in parts if n) / 1e6


def pct(vals, q):
    v = sorted(x for x in vals if x == x)
    return v[max(0, math.ceil(q * len(v)) - 1)] if v else float("nan")   # nearest rank


# ---------------- calls ----------------
def or_id(model):
    return "anthropic/" + model.replace("-5-5", "-5.5")


_spent = [0.0]


def llm(model, system, user, max_tokens, cap):
    """one call -> {text, secs, ttft, tin, cr, cw, tout, err?}. Direct Anthropic when CLAUDE_API is set (bench_claude.stream_claude),
    else OpenRouter. Never raises on an API error (err is recorded); stops the run when the spend cap would be crossed."""
    if _spent[0] > cap:
        sys.exit(f"spend cap ${cap} reached (counted ${_spent[0]:.4f}); stopping")
    t0 = time.time()
    blk = [{"type": "text", "text": system, "cache_control": serve.CACHE}]
    try:
        if os.environ.get("CLAUDE_API"):
            u = bc.stream_claude(dict(serve.claude_params(model, max_tokens), system=blk, messages=[{"role": "user", "content": user}]))
        else:
            key = os.environ.get("OPENROUTER_API_KEY")
            if not key:
                sys.exit("set CLAUDE_API or OPENROUTER_API_KEY (or use --dry-run)")
            payload = dict(serve._model_params(or_id(model), max_tokens),
                           messages=[{"role": "system", "content": blk}, {"role": "user", "content": user}])
            with serve._or_post(payload, key, 60) as r:
                j = json.loads(r.read())
            us, d = j.get("usage") or {}, (j.get("usage") or {}).get("prompt_tokens_details") or {}
            secs = time.time() - t0
            u = {"text": j["choices"][0]["message"].get("content") or "", "ttft": secs, "secs": secs, "tin": int(us.get("prompt_tokens") or 0),
                 "cr": int(d.get("cached_tokens") or 0), "cw": int(d.get("cache_write_tokens") or 0), "tout": int(us.get("completion_tokens") or 0)}
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        return {"text": "", "secs": time.time() - t0, "ttft": float("nan"), "tin": 0, "cr": 0, "cw": 0, "tout": 0,
                "err": f"{type(e).__name__} {getattr(e, 'code', '')}"[:60]}
    pi, po = serve.claude_price(model)
    _spent[0] += (u["tin"] * pi + u["tout"] * po) / 1e6
    return u


def make_real(cap):
    def real(job, model, row):
        return llm(model, SYS[job], user_turn(row, job), MAX_TOKENS[job], cap)
    return real


def canned(job, model, row):
    """dry-run stand-in for llm(): deterministic fake replies, a few wrong / low-confidence / leaking on purpose, so every scorer path runs"""
    n = sum(map(ord, row["id"])) + len(job)
    wrong, leaks = n % 4 == 0, n % 5 == 0
    label, conf = ("algebra_slip", "low") if wrong else (row["gold"], "high")
    hint = "Check the step where you combine the two carts. QUACK." + (" It is 2.0 m/s, pick b." if leaks else "")
    wish = "POOF! Here is the full wish. QUACK.\n$$x = 1$$\nPick b."
    text = {"cluck": wish, "mini": hint, "label": json.dumps({"gap": label, "confidence": conf}),
            "minilabel": f"LABEL: {label}|{conf}\nMINI: {hint}", "all": f"LABEL: {label}|{conf}\nMINI: {hint}\nWISH:\n{wish}"}[job]
    return {"text": text, "secs": 0.5 + (n % 7) / 10, "ttft": 0.3, "tin": 2400 if job in ("cluck", "all") else 600, "cr": 0, "cw": 0, "tout": OUT_EST[job]}


# ---------------- one event through one arm ----------------
def run_event(arm, model, row, call, escalate):
    calls, parsed = [], {}
    for job in ARM_JOBS[arm]:
        u = call(job, model, row)
        calls.append(dict(u, job=job, model=model, escalation=False))
        parsed[job] = parse(job, u["text"]) if not u.get("err") else dict(parse(job, ""), ok=False)
    escalated = False
    ml = parsed.get("minilabel") or parsed.get("all")
    if arm == "D" and escalate_needed(parsed["minilabel"]):
        u = call("minilabel", escalate, row)
        calls.append(dict(u, job="minilabel", model=escalate, escalation=True))
        parsed["minilabel"] = parse("minilabel", u["text"]) if not u.get("err") else dict(parse("minilabel", ""), ok=False)
        ml, escalated = parsed["minilabel"], True
    lab = parsed["label"] if arm == "C" else ml
    mini = (parsed["mini"]["mini"] if arm == "C" else ml["mini"])
    wish = (parsed["all"]["wish"] if arm == "A" else parsed["cluck"]["wish"])
    label = lab["label"] if lab["ok"] else None
    lk = leak(mini, row)
    cost = [usd(c, c["model"]) for c in calls]
    per_job = collections.Counter()                                  # jobs run in parallel; an escalation follows its own mini+label call
    for c in calls:
        per_job[c["job"]] += c["secs"]
    return {"arm": arm, "model": model, "id": row["id"], "origin": row["origin"], "swap_of": row.get("swap_of"), "gold": row["gold"],
            "label": label, "conf": lab["conf"], "schema_ok": lab["ok"], "correct": label == row["gold"],
            "false_match": label is not None and label != row["gold"] and label != "new",
            "mini": mini, "leak": lk["leak"] if mini else None, "leak_nums": lk["nums"], "invented": invented(wish, row) if wish else None,
            "escalated": escalated, "err": next((c["err"] for c in calls if c.get("err")), None),
            "secs": max(per_job.values()), "calls": [{k: c[k] for k in ("job", "model", "escalation", "secs", "tin", "tout", "cr", "cw")} for c in calls],
            "usd": None if any(x is None for x in cost) else sum(cost)}


def summarize(recs):
    rows = []
    for (arm, model), rs in sorted(_group(recs).items()):
        n = len(rs)
        by = {r["id"]: r for r in rs}
        pairs = [(by[r["swap_of"]], r) for r in rs if r["swap_of"] in by]
        stable = [a["label"] is not None and a["label"] == b["label"] for a, b in pairs]
        leaks = [r["leak"] for r in rs if r["leak"] is not None]
        calls = [c for r in rs for c in r["calls"]]
        tin, cr = sum(c["tin"] for c in calls), sum(c["cr"] for c in calls)
        usds = [r["usd"] for r in rs]
        rows.append({"arm": arm, "model": model, "n": n, "calls": len(calls), "acc": sum(r["correct"] for r in rs) / n,
                     "false_match": sum(r["false_match"] for r in rs) / n, "schema_fail": sum(not r["schema_ok"] for r in rs) / n,
                     "leak": (sum(leaks) / len(leaks)) if leaks else float("nan"),
                     "invented": sum(bool(r["invented"]) for r in rs if r["invented"] is not None) / max(1, sum(r["invented"] is not None for r in rs)),
                     "stable": (sum(stable), len(pairs)), "esc": sum(r["escalated"] for r in rs) / n,
                     "cache_hit": cr / tin if tin else 0.0, "in_tok": tin / n, "out_tok": sum(c["tout"] for c in calls) / n,
                     "usd_1k": None if any(x is None for x in usds) else 1000 * sum(usds) / n,
                     "call_p50": pct([c["secs"] for c in calls], .5), "call_p90": pct([c["secs"] for c in calls], .9),
                     "ev_p50": pct([r["secs"] for r in rs], .5), "ev_p90": pct([r["secs"] for r in rs], .9),
                     "errors": sum(bool(r["err"]) for r in rs),
                     "confusion": dict(collections.Counter(f"{r['gold']}>{r['label']}" for r in rs if not r["correct"]))})
    return rows


def _group(recs):
    g = {}
    for r in recs:
        g.setdefault((r["arm"], r["model"]), []).append(r)
    return g


def table(rows):
    f = lambda x, d=2: "n/a" if x != x or x is None else f"{x:.{d}f}"  # noqa: E731
    out = ["| arm | model | events | calls | label acc | false-match | schema fail | mini leak | invented# | key-stable | escalated | cache hit | in tok | out tok | $/1k events | call p50/p90 s | event p50/p90 s | api errs |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        out.append(f"| {r['arm']} | {r['model']} | {r['n']} | {r['calls']} | {f(r['acc'])} | {f(r['false_match'])} | {f(r['schema_fail'])} | {f(r['leak'])} | "
                   f"{f(r['invented'])} | {r['stable'][0]}/{r['stable'][1]} | {f(r['esc'])} | {f(r['cache_hit'])} | {r['in_tok']:.0f} | {r['out_tok']:.0f} | "
                   f"{'n/a (fill PRICES)' if r['usd_1k'] is None else f(r['usd_1k'], 3)} | {f(r['call_p50'])}/{f(r['call_p90'])} | {f(r['ev_p50'])}/{f(r['ev_p90'])} | {r['errors']} |")
    return "\n".join(out)


def plan(rows, models, reps, esc_rate, escalate):
    """call-count + token plan, no API. Returns text"""
    n = len(rows)
    ev = n * reps * len(models)
    per_arm = {a: len(j) for a, j in ARM_JOBS.items()}
    calls = {a: ev * k for a, k in per_arm.items()}
    calls["D"] += round(ev * esc_rate)
    tot = sum(calls.values())
    lines = [f"fixture: {n} rows ({sum(1 for r in rows if r.get('swap_of'))} number-swap twins), models: {', '.join(models)}, reps: {reps}, escalate -> {escalate}",
             f"formula: calls = reps x rows x models x (A 1 + B 2 + C 3 + D 2 + rho_esc) = {reps} x {n} x {len(models)} x (8 + rho)  [rho = share of D events that escalate; assumed {esc_rate}]",
             "| arm | calls/event | calls this plan | est in tok (chars/4) | est out tok (guess) | est $ |", "|---|---|---|---|---|---|"]
    for a, jobs in ARM_JOBS.items():
        tin = sum(len(SYS[j]) + len(user_turn(r, j)) for r in rows for j in jobs) // 4 * reps * len(models)
        tout = sum(OUT_EST[j] for _ in rows for j in jobs) * reps * len(models)
        cost = [usd({"tin": tin // len(models), "cr": 0, "cw": 0, "tout": tout // len(models)}, m) for m in models]
        lines.append(f"| {a} | {per_arm[a]}{' (+1 on escalation)' if a == 'D' else ''} | {calls[a]} | {tin} | {tout} | "
                     f"{'needs PRICES' if any(c is None for c in cost) else '%.3f' % (sum(cost) * len(models))} |")
    lines.append(f"total calls: {tot}. With 3 reps (for p50/p90): {tot * 3 // reps}.")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--arms", default="ABCD")
    ap.add_argument("--models", default="claude-haiku-5-5,claude-sonnet-5-5,default", help="comma list; `default` = serve.CLAUDE_MODEL")
    ap.add_argument("--escalate", default="claude-opus-5-5", help="arm D's escalation model")
    ap.add_argument("--items", type=int, default=0, help="first N fixture rows only (0 = all)")
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--fixture", default=FIXTURE)
    ap.add_argument("--out", help="directory for records.jsonl + summary.md")
    ap.add_argument("--cap", type=float, default=SPEND_CAP_USD)
    ap.add_argument("--esc-rate", type=float, default=0.2, help="dry-run assumption for arm D's escalation share")
    ap.add_argument("--dry-run", action="store_true", help="no API: plan + canned replies through the real parser/scorer")
    a = ap.parse_args(argv)
    models = list(dict.fromkeys(serve.CLAUDE_MODEL if m == "default" else m for m in a.models.split(",") if m))
    rows = load(a.fixture)[:a.items or None]
    if serve.PROMPT_V4 is None:
        sys.exit("prompts/cluck-v4.txt missing")
    print(plan(rows, models, a.reps, a.esc_rate, a.escalate) + "\n")
    call = canned if a.dry_run else make_real(a.cap)
    if a.dry_run:
        print("DRY RUN: replies below are canned (fake), only the plumbing and scorer are real.\n")
    recs = []
    for _ in range(a.reps):
        for m in models:
            for arm in a.arms:
                for row in rows:
                    recs.append(run_event(arm, m, row, call, a.escalate if not a.dry_run else "claude-opus-5-5"))
    summ = summarize(recs)
    md = table(summ)
    print(md)
    if not a.dry_run:
        print(f"\ncounted spend (upper bound, serve.claude_price, no cache discount): ${_spent[0]:.4f}")
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        with open(os.path.join(a.out, "records.jsonl"), "w", encoding="utf-8") as f:
            f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in recs)
        with open(os.path.join(a.out, "summary.md"), "w", encoding="utf-8") as f:
            f.write(md + "\n\nconfusion (wrong labels, gold>label):\n" + "\n".join(f"- {r['arm']} {r['model']}: {r['confusion']}" for r in summ) + "\n")


if __name__ == "__main__":
    main()
