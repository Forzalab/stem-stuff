#!/usr/bin/env python3
"""Bench Cluck's live figures and reply shape (stdlib only), three ways to run the Claude path:
  A  solo Opus 5.5   (one stream: text + the ```fig fence, what serve.py ships)
  B  solo Haiku 5.5  (the same, CLAUDE_MODEL=claude-haiku-5-5)
  C  two models      (Haiku streams the text and calls the tool draw(brief); Opus draws the fence in parallel while Haiku's
                      follow-up turn keeps the text going: the API needs that second turn after a tool call, its hop is in C's times)
and, for A and B, the OLD prompt (CLAUDE_DELTA + livefig.RULE before ccr-cluck-fig-bench, passed with --old FILE) vs the NEW one.

    CLAUDE_API=... python3 tools/bench_figs.py --banks DIR --out DIR [--reps 2] [--old old_prompts.py] [--cap 3]

DIR holds BANK_P2X.json and BANK_CEQ.json (https://stem-stuff.vercel.app/b/...). Metrics per run: TTFT, time to the figure,
total, a valid figure, leaks, FORMAT (tools/bench_claude.check), the GPT-shape score, $, and an Opus judge's 1-5 for the figure.
shape() and fig_info() are pure; tests/test_bench_figs.py runs them without a key."""
import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import livefig  # noqa: E402
import serve  # noqa: E402
import bench_claude  # noqa: E402

OPUS, HAIKU = "claude-opus-5-5", "claude-haiku-5-5"
PHYS_KINDS, CS_KINDS = {"scene", "cartesian", "bars"}, {"network"}


# ---------------- pure scoring ----------------
DD = re.compile(r"^\s*\$\$.*\$\$\s*$")


def prose(text):
    """the words a student reads as prose: no fences, no $$ lines, no $...$, no (actions)"""
    t = livefig.strip(text)
    t = "\n".join(l for l in t.split("\n") if not DD.match(l))
    t = re.sub(r"\$[^$]*\$", " ", t)
    t = re.sub(r"\([^()]*\)", " ", t)
    return re.findall(r"[A-Za-z']+", t)


def shape(text, wish=True):
    """the GPT-shape score (the reference shot: QUACK line, assumption line, move line, 2-3 $$ lines, a boxed result, "Pick c.").
    Returns a dict; score is 0-5: prose 15-70 words (the shot itself: ~25) (chat: <= 60), 2-4 $$ lines, a \\boxed (chat: skipped, counts),
    a final pick line (chat: skipped, counts), no paragraph over 2 sentences."""
    t = livefig.strip(text)
    lines = [l for l in t.split("\n") if l.strip()]
    words = len(prose(t))
    dd = sum(bool(DD.match(l)) for l in lines)
    boxed = "\\boxed" in t
    last = lines[-1].strip() if lines else ""
    pick = bool(re.match(r"^\**\s*pick\b", last, re.I)) or (bool(DD.match(last)) and "\\boxed" in last)
    paras = [p for p in re.split(r"\n\s*\n", t) if p.strip()]
    long_para = 0
    for p in paras:
        body = "\n".join(l for l in p.split("\n") if not DD.match(l))
        body = re.sub(r"\$[^$]*\$", "x", body)
        if len(re.findall(r"[.!?](?:\s|$)", body)) > 2:
            long_para += 1
    r = {"prose_words": words, "dd_lines": dd, "boxed": boxed, "pick_line": pick, "long_paras": long_para}
    r["score"] = ((15 <= words <= 70) if wish else words <= 60) + (2 <= dd <= 4 if wish else dd <= 2) + (boxed or not wish) \
        + (pick or not wish) + (long_para == 0)
    return r


def fig_info(raw, ctx):
    """run the raw reply through the server's gate: (shown text, {"fig": bool, "kind", "log", "leaks", "json"})"""
    gate = livefig.Fence(ctx)
    out = gate.feed(raw) + gate.end()
    m = re.search(r"```fig\n(.*)\n```", out)
    g = json.loads(m.group(1)) if m else None
    return out, {"fig": g is not None, "kind": (g or {}).get("kind"), "log": gate.log,
                 "leaks": sum(x.startswith("leak") for x in gate.log), "json": m.group(1) if m else ""}


def kind_ok(case, kind):
    """the figure's kind matches the subject: physics scene/cartesian/bars, a graph bank network"""
    return kind in (CS_KINDS if case["subject"] == "cs" else PHYS_KINDS)


# ---------------- cases ----------------
def _bank(dirs, name):
    """the bank file from the first of the comma-separated dirs that has it (it needs the keys: the served copy has none)"""
    path = next(os.path.join(d, name) for d in dirs.split(",") if os.path.exists(os.path.join(d, name)))
    with open(path) as f:
        return {p["code"]: p for p in json.load(f)["problems"]}


# The served banks carry no keys; the bench writes its own (worked here, checked by hand) so it runs on the public copies.
KEYS = {
    "PHYS_ZL8": ("a", {"d": "Dropped a power of ten in the trillions."},
                 "$E = P t = 3.00 \\times 10^{26} \\cdot 2.0 \\times 10^{-6} = 6.0 \\times 10^{20}\\ \\text{J}$\n"
                 "$6.0 \\times 10^{20} / 3.6 \\times 10^6 = 1.67 \\times 10^{14}\\ \\text{kWh}$\n"
                 "$0.14 \\cdot 1.67 \\times 10^{14} = 2.33 \\times 10^{13}$ dollars $= \\boxed{23.3}$ trillion"),
    "PHYS_H3A": ("c", {"a": "Used the altitude 3 R_E as the orbit radius instead of R_E + 3 R_E = 4 R_E."},
                 "Gravity is the centripetal force: $T = 2\\pi\\sqrt{r^3/(G M_E)}$ with $r = R_E + 3R_E = 4 R_E = 2.55 \\times 10^7\\ \\text{m}$\n"
                 "$T = 2\\pi\\sqrt{(2.55 \\times 10^7)^3 / (6.67 \\times 10^{-11} \\cdot 5.98 \\times 10^{24})} = 4.06 \\times 10^4\\ \\text{s}$\n"
                 "$T = 4.06 \\times 10^4 / 3600 = \\boxed{11.3}$ h"),
    "CEQ_D8K": (None, {}, "Kruskal, cheapest first, both pieces: A-F 2, B-C 3, D-E 4, A-E 5, A-B 6 (C-E 7, E-F 9, C-D 10, A-C 11 close cycles); "
                "H-J 1, J-K 8, G-H 12 (G-K 13 closes a cycle).\nKruskal total $= 2+3+4+5+6+1+8+12 = \\boxed{41}$\n"
                "Prim from H never leaves H's piece: H-J 1, J-K 8, G-H 12, total $\\boxed{21}$", ["41", "21"]),
    "CEQ_PRT": (None, {}, "Places: home, mill, ford, church, Ives. Roads: home-mill 2, home-ford 5, mill-ford 2, mill-church 4, ford-church 1, "
                "church-Ives 3, ford-Ives 6; the bridge home-Ives is gone; the boat goes mill -> Ives 3, one way.\n"
                "Morning: home -> mill -> boat to Ives $= 2 + 3 = \\boxed{5}$\n"
                "Walk home: Ives -> church -> ford -> mill -> home $= 3 + 1 + 2 + 2 = \\boxed{8}$", ["5", "8"]),
}


def keyed(p):
    """the problem with the bench's key, the right choice or part answers, and the slips"""
    k = KEYS.get(p["code"])
    if not k:
        return p
    p = json.loads(json.dumps(p))
    p["saccharine"] = {"key": k[2], "slip": k[1]}
    if k[0]:
        p["correct"] = k[0]
    for part, a in zip(p.get("parts", []), k[3] if len(k) > 3 else []):
        part["answer"] = a
    return p


def wrong_pick(p):
    if p.get("type") != "mc":
        return []
    r = serve.rights(p)
    return next(c["id"] for c in p["choices"] if c["id"] not in r)


def cases(banks):
    with open(os.path.join(ROOT, "tests", "fixtures", "livefig.json")) as f:
        mqc = json.load(f)["problem"]
    p2x, ceq = _bank(banks, "BANK_P2X.json"), _bank(banks, "BANK_CEQ.json")
    p2x, ceq = {c: keyed(p) for c, p in p2x.items()}, {c: keyed(p) for c, p in ceq.items()}
    spec = [("MQC wish", mqc, "phys", True, None), ("MQC chat forces", mqc, "phys", True, "Can you draw the forces on the block as it slides down?"),
            ("ZL8 wish", p2x["PHYS_ZL8"], "phys", False, None), ("H3A orbit wish", p2x["PHYS_H3A"], "phys", True, None),
            ("D8K Kruskal/Prim wish", ceq["CEQ_D8K"], "cs", True, None), ("PRT St Ives wish", ceq["CEQ_PRT"], "cs", True, None)]
    out = []
    for name, p, subj, visual, chat in spec:
        pick = wrong_pick(p)
        user = serve.explain_prompt(p, pick)
        if chat:
            msgs = [{"role": "system", "content": serve.system_for(serve.CLUCK_CHAT, p)}, {"role": "user", "content": user},
                    {"role": "assistant", "content": "POOF! (the wish, granted above)"},
                    {"role": "user", "content": serve.wrap(chat, "student_bench")}]
        else:
            msgs = [{"role": "system", "content": serve.system_for(serve.CLUCK_GENIE, p)}, {"role": "user", "content": user}]
        q = serve.explain_prompt(p, pick) + " " + (chat or "")
        out.append({"name": name, "p": p, "subject": subj, "visual": visual, "wish": not chat, "msgs": msgs,
                    "max": 250 if chat else 450, "key": serve.sugar(p).get("key", ""), "q": q,
                    "ctx": serve.fig_ctx(p, pick, chat=bool(chat))})
    return out


# ---------------- the API ----------------
SPENT = {"usd": 0.0}
_lock = threading.Lock()


def stream(body, t0):
    """one streamed call: {"text", "ttft", "t_fence", "t_end", "usd", "tool": (id, name, input, t_done) | None, "blocks"}; times from t0"""
    req = urllib.request.Request(serve.CLAUDE_BASE + "/v1/messages", data=json.dumps(dict(body, stream=True)).encode(), method="POST",
                                 headers={"x-api-key": os.environ["CLAUDE_API"], "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    r = {"text": "", "ttft": None, "t_fence": None, "tool": None, "stop": None}
    tin = tout = 0
    tj, tid, tname = "", None, None
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            ev = json.loads(line[5:])
            k = ev.get("type")
            if k == "message_start":
                u = ev["message"].get("usage") or {}
                tin = sum(int(u.get(x) or 0) for x in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
            elif k == "message_delta":
                tout = int((ev.get("usage") or {}).get("output_tokens") or tout)
                r["stop"] = (ev.get("delta") or {}).get("stop_reason") or r["stop"]
            elif k == "content_block_start" and ev["content_block"].get("type") == "tool_use":
                tid, tname = ev["content_block"]["id"], ev["content_block"]["name"]
            elif k == "content_block_delta":
                d = ev["delta"]
                if d.get("type") == "text_delta":
                    r["ttft"] = r["ttft"] or time.time() - t0
                    r["text"] += d["text"]
                    if r["t_fence"] is None and r["text"].count("```") >= 2:
                        r["t_fence"] = time.time() - t0
                elif d.get("type") == "input_json_delta":
                    tj += d.get("partial_json", "")
            elif k == "content_block_stop" and tid and r["tool"] is None:
                try:
                    inp = json.loads(tj or "{}")
                except ValueError:
                    inp = {}
                r["tool"] = (tid, tname, inp, time.time() - t0)
            elif k == "error":
                raise OSError(str(ev.get("error")))
    r["t_end"] = time.time() - t0
    pi, po = serve.claude_price(body["model"])
    r["usd"] = (tin * pi + tout * po) / 1e6
    with _lock:
        SPENT["usd"] += r["usd"]
    return r


def solo(case, model, delta, rule):
    """arch A / B: what _cluck_stream sends, with this delta and figure rule"""
    msgs = case["msgs"]
    sysm = livefig.weave(msgs[0]["content"]) + delta + rule
    body = dict(serve.claude_params(model, case["max"] + serve.FIG_TOKENS), system=sysm, messages=msgs[1:])
    t0 = time.time()
    r = stream(body, t0)
    return {"raw": r["text"], "ttft": r["ttft"], "t_fig": r["t_fence"], "total": r["t_end"], "usd": r["usd"], "hop": None}


DRAW_TOOL = {"name": "draw", "description": "Draw ONE figure for the student while you keep talking: a free-body diagram, a graph of the "
             "question's vertices and edges with the chosen edges in order, energy bars, an orbit, an F-x or PV area. Pass a short brief "
             "of what to draw (objects, forces, which edges, in what order). Never the answer's value.",
             "input_schema": {"type": "object", "properties": {"brief": {"type": "string"}}, "required": ["brief"], "additionalProperties": False}}
DRAW_RULE = """
FIGURE (the tool draw): write the sentence on what the pick assumed (a chat reply: the first sentence), then STOP writing and call
draw with a short brief; after the tool answers, go on with the rest of the reply. Call it exactly once in every reply about forces,
motion, energy, orbits, F-x or PV, or any graph or tree; skip it only when the reply is pure arithmetic with nothing to picture.
Never write a figure, code or JSON yourself, and never mention the tool or the figure."""
DRAWER = """You draw ONE figure for a tutor's reply. Answer with only the fence: a line ```fig, the figure as ONE line of JSON, a line ```."""


def two_model(case, delta, rule):
    """arch C: Haiku streams the text with the draw tool; on the call Opus draws (a thread) while Haiku's follow-up turn goes on"""
    msgs = case["msgs"]
    t0 = time.time()
    hsys = msgs[0]["content"] + delta + DRAW_RULE
    # Haiku skipped the tool when only the system asked (Oct 17 bench); a line after the last user turn (where the NOTE goes) works
    turns = msgs[1:-1] + [dict(msgs[-1], content=msgs[-1]["content"] + "\n\nDRAW: call the tool draw once, right after the sentence on "
                                "what the pick assumed (a chat reply: after the first sentence), unless the reply is pure arithmetic.")]
    hbody = dict(serve.claude_params(HAIKU, case["max"]), system=hsys, messages=turns, tools=[DRAW_TOOL])
    h1 = stream(hbody, t0)
    out = {"ttft": h1["ttft"], "usd": h1["usd"], "hop": None, "t_fig": None}
    if not h1["tool"]:
        out.update(raw=h1["text"], total=h1["t_end"])
        return out
    tid, _, inp, t_call = h1["tool"]
    fig = {}

    def draw():
        body = dict(serve.claude_params(OPUS, serve.FIG_TOKENS), system=DRAWER + rule.replace("In a wish (the numbered steps) it goes right after the sentence on what the pick assumed; in a chat reply, after the first paragraph. ", ""),
                    messages=[{"role": "user", "content": msgs[1]["content"] + "\n\nDRAW: " + str(inp.get("brief", ""))}])
        try:
            fig.update(stream(body, t0))
        except Exception as e:  # noqa: BLE001
            fig.update(text="", t_fence=None, t_end=time.time() - t0, usd=0.0, err=str(e))
    th = threading.Thread(target=draw)
    th.start()
    asst = ([{"type": "text", "text": h1["text"]}] if h1["text"].strip() else []) + [{"type": "tool_use", "id": tid, "name": "draw", "input": inp}]
    follow = turns + [{"role": "assistant", "content": asst},
                         {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tid, "content": "Drawing; it shows where you called it. Go on."}]}]
    t_hop = time.time() - t0
    h2 = stream(dict(hbody, messages=follow), t0)
    th.join()
    fence = re.search(r"```[\s\S]*?```", fig.get("text", ""))
    out.update(raw=h1["text"] + ("\n" + fence.group(0) + "\n" if fence else "") + h2["text"],
               t_fig=fig.get("t_fence"), total=max(h2["t_end"], fig.get("t_end", 0)), usd=out["usd"] + h2["usd"] + fig.get("usd", 0),
               hop=(h2["ttft"] - t_hop) if h2["ttft"] else None)
    return out


def judge(case, fig_json):
    """Opus rates the figure 1-5 (0 = no figure)"""
    if not fig_json:
        return 0
    body = dict(serve.claude_params(OPUS, 300), system="You grade a figure a tutor drew for one question. Reply with one digit 1-5: 5 = the right "
                "kind for the subject, accurate to the question, shows the setup clearly and helps a student; 1 = wrong, empty or misleading.",
                messages=[{"role": "user", "content": "QUESTION AND KEY:\n" + case["msgs"][1]["content"][:4000] + "\n\nFIGURE JSON:\n" + fig_json}])
    try:
        m = re.search(r"[1-5]", stream(body, time.time())["text"])
        return int(m.group(0)) if m else 0
    except Exception:  # noqa: BLE001
        return 0


BUDGETS = {"old": (260, 110), "new": (bench_claude.GENIE_WORDS, bench_claude.CHAT_WORDS)}   # each prompt held to its own word budget


def score(case, arch, variant, run):
    shown, fi = fig_info(run["raw"], case["ctx"])
    text = livefig.strip(shown)
    fmt = bench_claude.check(text, case["key"], BUDGETS[variant][0 if case["wish"] else 1], case["q"])
    sh = shape(shown, case["wish"])
    return {"case": case["name"], "arch": arch, "variant": variant, "visual": case["visual"], "ttft": run["ttft"], "t_fig": run["t_fig"] if fi["fig"] else None,
            "total": run["total"], "hop": run["hop"], "usd": run["usd"], "fig": fi["fig"], "kind": fi["kind"], "kind_ok": fi["fig"] and kind_ok(case, fi["kind"]),
            "fig_log": fi["log"], "leaks": fi["leaks"], "fmt_ok": fmt["ok"], "fmt_bad": [k for k in ("note_leak", "paren_latex", "split_dd", "odd_dollar", "headers",
            "star_bullets", "star_actions", "hedges", "over_budget") if fmt[k]] + (["new#"] if fmt["new_numbers"] else []) + ([] if fmt["quack"] else ["noQUACK"]),
            "shape": sh["score"], "shape_d": sh, "fig_json": fi["json"], "raw": run["raw"]}


def table(rows):
    """markdown: one row per arch/variant, means over runs"""
    def mean(xs):
        xs = [x for x in xs if x is not None]
        return sum(xs) / len(xs) if xs else float("nan")
    groups = {}
    for r in rows:
        groups.setdefault((r["arch"], r["variant"]), []).append(r)
    out = ["| arch | prompt | runs | TTFT s | fig s | total s | C hop s | fig rate (visual) | kind ok | leaks | format ok | shape /5 | prose words (wish) | judge /5 | $ total |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for (a, v), rs in sorted(groups.items()):
        vis = [r for r in rs if r["visual"]]
        figs = [r for r in rs if r["fig"]]
        out.append(f"| {a} | {v} | {len(rs)} | {mean([r['ttft'] for r in rs]):.2f} | {mean([r['t_fig'] for r in rs]):.2f} | {mean([r['total'] for r in rs]):.2f} | "
                   f"{mean([r['hop'] for r in rs]):.2f} | {sum(r['fig'] for r in vis)}/{len(vis)} | {sum(r['kind_ok'] for r in figs)}/{len(figs)} | {sum(r['leaks'] for r in rs)} | "
                   f"{sum(r['fmt_ok'] for r in rs)}/{len(rs)} | {mean([r['shape'] for r in rs]):.2f} | {mean([r['shape_d']['prose_words'] for r in rs if r['case'].endswith('wish')]):.0f} | "
                   f"{mean([r['judge'] for r in figs]):.2f} | {sum(r['usd'] for r in rs):.3f} |")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--banks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--old", help="a .py file defining OLD_DELTA and OLD_RULE (the prompts before)")
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--cap", type=float, default=3.0)
    ap.add_argument("--arms", default="A-old,A-new,B-old,B-new,C-new")
    ap.add_argument("--rescore", nargs="*", help="raw.jsonl files: score them again (no calls) and write one table")
    a = ap.parse_args()
    if a.rescore:
        by = {c["name"]: c for c in cases(a.banks)}
        rows = []
        for path in a.rescore:
            with open(path) as f:
                for line in f:
                    r = json.loads(line)
                    n = score(by[r["case"]], r["arch"], r["variant"], {k: r.get(k) for k in ("raw", "ttft", "t_fig", "total", "usd", "hop")})
                    rows.append(dict(n, judge=r.get("judge", 0), rep=r.get("rep", 0), t_fig=r.get("t_fig")))
        os.makedirs(a.out, exist_ok=True)
        with open(os.path.join(a.out, "table.md"), "w") as f:
            f.write(table(rows) + "\n")
        print(table(rows))
        return
    if not os.environ.get("CLAUDE_API"):
        sys.exit("set CLAUDE_API")
    old = {}
    if a.old:
        exec(open(a.old).read(), old)  # noqa: S102 - a local file of two strings
    prompts = {"new": (serve.CLAUDE_DELTA, livefig.RULE), "old": (old.get("OLD_DELTA", ""), old.get("OLD_RULE", ""))}
    cs = cases(a.banks)
    os.makedirs(a.out, exist_ok=True)
    jobs = [(c, arm, i) for i in range(a.reps) for arm in a.arms.split(",") for c in cs]

    def one(job):
        c, arm, i = job
        if SPENT["usd"] > a.cap * 0.85:
            return None
        arch, variant = arm.split("-")
        d, rule = prompts[variant]
        try:
            run = two_model(c, d, rule) if arch == "C" else solo(c, OPUS if arch == "A" else HAIKU, d, rule)
        except Exception as e:  # noqa: BLE001
            print(f"{arm} {c['name']}: {str(e)[:120]}", file=sys.stderr)
            return None
        r = score(c, arch, variant, run)
        r["judge"] = judge(c, r["fig_json"])
        r["rep"] = i
        print(f"{arm:6} {c['name']:24} fig={r['fig']!s:5} {r['kind']} shape={r['shape']} fmt={r['fmt_ok']} ttft={r['ttft'] or 0:.2f} "
              f"total={r['total']:.1f} ${r['usd']:.4f} spent=${SPENT['usd']:.3f}", file=sys.stderr)
        return r
    with ThreadPoolExecutor(4) as ex:
        rows = [r for r in ex.map(one, jobs) if r]
    with open(os.path.join(a.out, "raw.jsonl"), "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    t = table(rows)
    with open(os.path.join(a.out, "table.md"), "w") as f:
        f.write(t + f"\n\nspent ${SPENT['usd']:.3f}\n")
    print(t)
    print(f"\nspent ${SPENT['usd']:.3f}")


if __name__ == "__main__":
    main()
