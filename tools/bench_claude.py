#!/usr/bin/env python3
"""Bench CLAUDE_MODEL candidates on Cluck FORMAT adherence (stdlib only). Same prompts the server sends: system_for(CLUCK_GENIE /
CLUCK_CHAT) + CLAUDE_DELTA, serve.claude_params (thinking off or least). Prints a markdown table.

    CLAUDE_API=sk-ant-... python3 tools/bench_claude.py [model ...]     (default: claude-opus-5-5 claude-sonnet-5-5 claude-haiku-5-5)

check(raw, key, budget) is the scorer; tests/test_bench_claude.py runs it on canned replies (no key needed)."""
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402

HEDGES = ("great question", "good question", "it might be", "it may be", "generally", "typically", "it's worth noting", "keep in mind",
          "i hope this helps", "in summary", "to summarize", "it depends", "arguably")
NUM_RE = re.compile(r"(?<![A-Za-z_\\])-?\d+(?:\.\d+)?")


def numbers(text):
    """the numbers in a text, as floats (list markers "1." at a line start skipped)"""
    text = re.sub(r"(?m)^\s*\d+\.\s", "", text)
    return {float(n) for n in NUM_RE.findall(text)}


def check(raw, key, budget, question=""):
    """score one raw reply (before the server's NOTE cut). Returns a dict; ok = every hard rule passed."""
    first, _, rest = raw.partition("\n")
    note = first.lstrip().startswith("NOTE:")
    shown = rest if note else raw                                     # what the student sees after the cut
    lines = shown.split("\n")
    r = {
        "note_line": note,
        "note_leak": "NOTE:" in shown,
        "paren_latex": bool(re.search(r"\\\(|\\\)|\\\[|\\\]", shown)),
        "split_dd": any(l.strip() == "$$" or (l.count("$$") % 2 == 1) for l in lines),   # $$ must open and close on one line
        "odd_dollar": shown.replace("$$", "").count("$") % 2 == 1,
        "headers": sum(bool(re.match(r"\s*#+\s", l)) for l in lines),
        "star_bullets": sum(bool(re.match(r"\s*\*\s", l)) for l in lines),
        "star_actions": len(re.findall(r"(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*(?!\*)", shown)),
        "new_numbers": sorted(numbers(shown) - numbers(key + "\n" + question) - {0.0, 1.0, 2.0}),
        "words": len(re.findall(r"[A-Za-z']+", shown)),
        "hedges": sum(shown.lower().count(h) for h in HEDGES),
        "quack": "quack" in shown.lower(),             # v4 (T62): quack / QUACK / quackkk are all fine, not only the caps
    }
    r["over_budget"] = r["words"] > budget
    r["ok"] = not (r["note_leak"] or r["paren_latex"] or r["split_dd"] or r["odd_dollar"] or r["headers"] or r["star_bullets"]
                   or r["star_actions"] or r["new_numbers"] or r["hedges"] or r["over_budget"]) and r["quack"]
    return r


def _p(code, q, choices, key, slip):
    return {"code": code, "type": "mc", "body": [{"type": "text", "md": q}], "choices": [{"id": i, "md": m} for i, m in choices],
            "correct": "b", "saccharine": {"key": key, "slip": slip}}


# Fixed cases, from the brain bench (cluck-chat-gate.md: carts, power) and tests/test_serve.py (work-energy sign)
PROBLEMS = [
    _p("BENCH_CART", "A 2.0 kg cart moving at 3.0 m/s hits a 1.0 kg cart at rest and they stick. Find their speed after.",
       [("a", "3.0 m/s"), ("b", "2.0 m/s"), ("c", "1.5 m/s")],
       "Momentum is kept: $p = m v = 2.0 \\cdot 3.0 = 6.0\\ \\text{kg m/s}$.\nAfter: $v = 6.0 / 3.0 = 2.0\\ \\text{m/s}$.\nAnswer: b) 2.0 m/s",
       {"a": "Assumed the first cart keeps its speed.", "c": "Halved the speed instead of sharing the momentum."}),
    _p("BENCH_POW", "A motor does 52.0 J of work in 4.0 s. What is its power?",
       [("a", "208 W"), ("b", "13.0 W"), ("c", "56.0 W")],
       "$P = W/t = 52.0 / 4.0 = 13.0\\ \\text{W}$.\nAnswer: b) 13.0 W", {"a": "Multiplied by time.", "c": "Added time."}),
    _p("BENCH_WORK", "Friction slows a 4.0 kg box from 3.0 m/s to rest. Find the work done by friction.",
       [("a", "18 J"), ("b", "-18 J"), ("c", "-12 J")],
       "Use: $W = \\Delta K = 0 - \\frac{1}{2} \\cdot 4.0 \\cdot 3.0^2 = -18\\ \\text{J}$.\nAnswer: b) -18 J", {"a": "Dropped the sign."}),
    _p("BENCH_SLOPE", "Find the slope of $f(x) = x^2$ at $x = 3$.",
       [("a", "9"), ("b", "6"), ("c", "3")],
       "$f'(x) = 2x$, so $f'(3) = 2 \\cdot 3 = 6$.\nAnswer: b) 6", {"a": "Plugged into f instead of f'.", "c": "Used x itself."}),
]
CHAT_Q = {"BENCH_CART": "why doesnt the first cart just keep going 3?", "BENCH_POW": "why divide by time and not multiply?",
          "BENCH_WORK": "why is it negative if the box moved?", "BENCH_SLOPE": "isnt slope just plugging in x?"}
GENIE_MAX, CHAT_MAX = 450, 250                       # the server's max_tokens for /explain and /chat
GENIE_WORDS, CHAT_WORDS = 140, 90                    # word budget the checker allows (the short GPT-shape prompt; was 260, 110)


def cases():
    """8 (name, messages, max_tokens, word budget, key, question text): each problem as a wish and as one chat turn"""
    out = []
    for p in PROBLEMS:
        user = serve.explain_prompt(p, "a")
        key = p["saccharine"]["key"]
        q = p["body"][0]["md"] + " " + " ".join(c["md"] for c in p["choices"])   # the shown choices: naming the pick's value is fine
        out.append((p["code"] + " wish", [{"role": "system", "content": serve.CLUCK_GENIE}, {"role": "user", "content": user}], GENIE_MAX, GENIE_WORDS, key, q))
        turns = [{"role": "system", "content": serve.CLUCK_CHAT}, {"role": "user", "content": user},
                 {"role": "assistant", "content": "POOF! (the wish, granted above)"},
                 {"role": "user", "content": serve.wrap(CHAT_Q[p["code"]], "student_bench")}]
        out.append((p["code"] + " chat", turns, CHAT_MAX, CHAT_WORDS, key, q + " " + CHAT_Q[p["code"]]))
    return out


def call(model, messages, max_tokens):
    """(raw text, seconds to first text, usd) for one streamed call"""
    body = dict(serve.claude_params(model, max_tokens), stream=True, system=messages[0]["content"] + serve.CLAUDE_DELTA, messages=messages[1:])
    req = urllib.request.Request(serve.CLAUDE_BASE + "/v1/messages", data=json.dumps(body).encode(), method="POST",
                                 headers={"x-api-key": os.environ["CLAUDE_API"], "anthropic-version": "2023-06-01", "content-type": "application/json"})
    t0, ttft, text, tin, tout = time.time(), None, "", 0, 0
    with urllib.request.urlopen(req, timeout=60) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            ev = json.loads(line[5:])
            if ev.get("type") == "message_start":
                u = ev["message"].get("usage") or {}
                tin = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
            elif ev.get("type") == "message_delta":
                tout = int((ev.get("usage") or {}).get("output_tokens") or tout)
            elif ev.get("type") == "content_block_delta" and ev["delta"].get("type") == "text_delta":
                ttft = ttft or time.time() - t0
                text += ev["delta"]["text"]
            elif ev.get("type") == "error":
                raise OSError(str(ev.get("error")))
    pi, po = serve.claude_price(model)
    return text, ttft or float("nan"), (tin * pi + tout * po) / 1e6


def row(model, name, r, ttft, usd):
    bad = [k for k in ("note_leak", "paren_latex", "split_dd", "odd_dollar", "headers", "star_bullets", "star_actions", "hedges", "over_budget") if r[k]]
    bad += ["new#" + ",".join(f"{n:g}" for n in r["new_numbers"])] if r["new_numbers"] else []
    bad += [] if r["quack"] else ["no QUACK"]
    return f"| {model} | {name} | {'pass' if r['ok'] else 'FAIL'} | {' '.join(bad) or '-'} | {'y' if r['note_line'] else 'n'} | {r['words']} | {ttft:.2f} | {usd:.5f} |"


def main(models):
    if not os.environ.get("CLAUDE_API"):
        sys.exit("set CLAUDE_API to run the bench")
    print("| model | case | verdict | broke | NOTE line | words | TTFT s | est $ |\n|---|---|---|---|---|---|---|---|")
    tot = {}
    for m in models:
        for name, msgs, mt, words, key, q in cases():
            try:
                text, ttft, usd = call(m, msgs, mt)
            except Exception as e:  # noqa: BLE001
                print(f"| {m} | {name} | ERROR | {str(e)[:60]} | | | | |")
                continue
            r = check(text, key, words, q)
            print(row(m, name, r, ttft, usd))
            t = tot.setdefault(m, [0, 0, 0.0, 0.0])
            t[0] += r["ok"]
            t[1] += 1
            t[2] += ttft
            t[3] += usd
    print("\n| model | pass | mean TTFT s | est $ total |\n|---|---|---|---|")
    for m, (ok, n, tt, usd) in tot.items():
        print(f"| {m} | {ok}/{n} | {tt / n:.2f} | {usd:.4f} |")


if __name__ == "__main__":
    main(sys.argv[1:] or ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"])
