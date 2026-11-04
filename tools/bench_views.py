"""Cluck view bench (same method as #399): real serve.py of a tree, POST /explain with a wrong pick, CLUCK_ARM=claude.
Claude reached through OpenRouter's Messages API (CLAUDE_BASE/CLAUDE_API/CLAUDE_MODEL envs; no Anthropic key in this container).
usage: python3 bench.py <tree> <port> <tag> <reps>   -> <tag>.json (per call: code, views, gate log, leak, words)"""
import concurrent.futures as cf, json, os, re, subprocess, sys, time, urllib.request

tree, port, tag, reps = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.dirname(HERE)
BANK = json.load(open(os.path.join(S, "banks", "BANK_P3X.json")))["problems"]
P = {p["code"]: p for p in BANK}
HARD = ["PHYS_SGU", "PHYS_T6Y", "PHYS_USR", "PHYS_FW6", "PHYS_75G"]
WIDE = ["PHYS_96G", "PHYS_GVE", "PHYS_7HA", "PHYS_CL8", "PHYS_JJN", "PHYS_HCM"]
JOBS = [c for c in HARD for _ in range(reps)] + WIDE
env = dict(os.environ, CLUCK_ARM="claude", CLAUDE_API=os.environ["OPENROUTER_API_KEY"], CLAUDE_BASE="https://openrouter.ai/api",
           CLAUDE_MODEL="anthropic/claude-sonnet-5.5", STEM_BANKS=os.path.join(S, "banks"), STEM_FRONT="BANK_P3X",
           STEM_TRIES=os.path.join(HERE, f"tries-{tag}.json"))
log = open(os.path.join(HERE, f"serve-{tag}.log"), "w")
srv = subprocess.Popen(["python3", os.path.join(tree, "serve.py"), str(port)], env=env, stderr=log, stdout=log)
for _ in range(100):
    try:
        urllib.request.urlopen(f"http://localhost:{port}/", timeout=1)
        break
    except Exception:
        time.sleep(0.2)


def nums(s):
    return set(re.findall(r"\d+(?:\.\d+)?", s))


def one(i_code):
    i, code = i_code
    p = P[code]
    pick = p["wrong"][0]["choice"]
    req = urllib.request.Request(f"http://localhost:{port}/explain", data=json.dumps({"code": code, "answer": pick, "auto": True}).encode(),
                                 headers={"Content-Type": "application/json", "X-Bench": f"{tag}-{i}"}, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            st, txt = r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        st, txt = getattr(e, "code", 0), ""
    views = re.findall(r"```openui\n[\s\S]*?\n```", txt)
    kinds = [m for v in views for m in re.findall(r"=\s*(Tug|Flip|Table|Steps|Geometry|Callout)\(", v)]
    figs = re.findall(r"```fig[ \t]*(\w*)", txt)
    prose = re.sub(r"```[\s\S]*?```", "", txt)
    key = next(c["md"] for c in p["choices"] if c["id"] == p["correct"])
    given = nums(json.dumps(p["body"])) | {n for c in p["choices"] if c["id"] != p["correct"] for n in nums(c["md"])}
    knum = nums(key) - given
    leak = bool(knum & nums(prose)) or bool(knum & nums("".join(views)))
    pipes = bool(re.search(r"(?m)^\s*\|.*\|\s*$", prose))
    return {"i": i, "code": code, "status": st, "kinds": kinds, "figs": figs, "leak": leak, "pipes": pipes,
            "words": len(prose.split()), "secs": round(time.time() - t0, 1), "text": txt}


with cf.ThreadPoolExecutor(6) as ex:
    out = list(ex.map(one, enumerate(JOBS)))
time.sleep(1)
srv.terminate()
log.close()
gl = [re.sub(r" rid=.*", "", ln.strip()) for ln in open(os.path.join(HERE, f"serve-{tag}.log")) if re.match(r"fig PHYS_\w+ (v4|reask):", ln.strip())]
json.dump({"calls": out, "gate": gl}, open(os.path.join(HERE, f"{tag}.json"), "w"), indent=1)
hard = [c for c in out if c["code"] in HARD[:3]]
vis = lambda c: bool(re.search(r"```(fig|openui)", c["text"]))
first = [g for g in gl if " v4: " in g]
bad = [g for g in first if g.split(" v4: ")[1] not in ("oui:ok", "ok")]
views_bad = [g for g in first if "oui:" in g and "oui:ok" not in g]
lost = [g for g in gl if "-> words only" in g]
print(f"{tag}: calls {len(out)} http200 {sum(c['status'] == 200 for c in out)} · leaks {sum(c['leak'] for c in out)} · pipes {sum(c['pipes'] for c in out)}"
      f" · visual shown {sum(vis(c) for c in out)}/{len(out)} · openui views {sum(bool(c['kinds']) for c in out)} (Tug {sum('Tug' in c['kinds'] for c in out)}, hard3 Tug {sum('Tug' in c['kinds'] for c in hard)}/{len(hard)})"
      f" · first-try gate fails {len(bad)} (views {len(views_bad)}) · lost to words-only {len(lost)} · avg words {sum(c['words'] for c in out) // max(1, len(out))}")
print("gate:", sorted(set(g.split(": ",1)[1] for g in bad)))
for c in out:
    print(f"  {c['code']} {c['status']} {','.join(c['kinds']) or '-'} vis={int(vis(c))} leak={int(c['leak'])} w={c['words']}")
