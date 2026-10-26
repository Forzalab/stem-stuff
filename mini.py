"""D1 mini-Cluck (DESIGN-v3 §4, TONY-DECISIONS #16): a tiny Socratic helper on one sub-step. System prompt only (prompts/mini-cluck.txt,
the static prefix, cached), no lore; the user turn carries the problem context. Engine: Claude (MINI_MODEL) first, then OpenRouter with the
same model id first and OPENROUTER_MODELS after; a refusal, an error or an empty reply moves on. Leak filter: a reply that says the key
(within tol) or the blanked formula is regenerated once; a second leak, a reply that is not OpenUI Lang, or no engine = an authored line.
Prompt-leak guard (W92c): the same serve.leak_cut / leak_scan as every Cluck reply, on the program's strings (mini is not streamed: no
PromptGuard needed); a source phrase is cut ("From the KEY: ..."), any other prompt word drops the reply like a key leak + an incident
(reason "leak", the pattern id, never the text). What goes out is always an OpenUI Lang program that passed views_gate (oui.py): replies use OpenUI Lang only (CLAUDE.md).
serve.py's pipe helpers (claude_ready, budget_hit, incident, _or_post, ...) are reused, imported late (serve imports mini, route S2)."""
import hashlib
import json
import os
import re
import secrets
import sys
import urllib.request

import livefig
import views_gate

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "prompts", "mini-cluck.txt"), encoding="utf-8") as _f:
    PROMPT = _f.read()
MINI_MODEL = os.environ.get("MINI_MODEL", "claude-sonnet-5-5")   # TUNABLE: the Oct 26 bench (TONY-DECISIONS #17b) picks it
MAX_TOKENS = 200
TIMEOUT = 6                                  # seconds per call; D4 caps the whole wait at 8 s with its own authored line
TOL = 0.02                                   # the key's leak window when ctx has no tol (slips.TOL_NUM)
OR_REFUSED = ("content_filter", "refusal")
# The fallback lines: no number, no formula, no topic word, so they fit any step (OpenUI Lang via authored())
AUTHORED = ["What is this step asking you to find? Say it in your own words first.",
            "Look at the step's goal again. Which given number connects to it?",
            "Try writing what you know before you solve. What changes, and what stays the same?"]


def _srv():
    """serve.py, imported late: run as the server it is __main__ (a plain import would load a second copy with its own state)"""
    main = sys.modules.get("__main__")
    if os.path.basename(getattr(main, "__file__", "") or "") == "serve.py":
        return main
    import serve
    return serve


def prompt(ctx):
    """(system blocks, user text): the static prompt as one cached block; the problem context in the user turn, the student's own
    words in a tag with a random suffix (serve.wrap)"""
    s = _srv()
    tag = "student_" + secrets.token_hex(4)
    user = "\n".join([f"Problem: {ctx.get('stem', '')}", f"Numbers: {ctx.get('numbers', '')}",
                      f"Worked solution (private: never quote it): {ctx.get('solution', '')}", f"Step goal: {ctx.get('goal', '')}",
                      f"Error label: {ctx.get('error') or 'general'}", f"Twist: {ctx.get('twist') or '-'}",
                      "Student answer:", s.wrap(str(ctx.get("answer", "")), tag)])
    return [{"type": "text", "text": PROMPT, "cache_control": {"type": "ephemeral"}}], user


_TEX_CMD = re.compile(r"\\(?:cdot|times|left|right|[,;:! ])")
_DROP = re.compile(r"[\s$\\{}*()·×]")


def _flat(s):
    return _DROP.sub("", _TEX_CMD.sub("", str(s))).lower()


def leaked(text, ctx):
    """True when the reply says the key (any number within tol of it) or the blanked formula (whole, or its longer side)"""
    try:
        key = abs(float(ctx.get("key")))
    except (TypeError, ValueError):
        key = None
    tol = ctx.get("tol") if ctx.get("tol") is not None else TOL
    if key is not None and any(abs(x - key) <= max(tol * key, 1e-9) for x in livefig.nums(text)):
        return True
    f = ctx.get("formula") or ""
    flat = _flat(text)
    sides = [_flat(f)] + [x for x in (_flat(y) for y in f.split("=")) if len(x) >= 4] if f.count("=") == 1 else [_flat(f)]
    return any(x and x in flat for x in sides)


def _fig_ctx(ctx):
    """the livefig.Ctx views_gate checks the reply against: the givens it may show, the key it may not"""
    try:
        key = [float(ctx.get("key"))]
    except (TypeError, ValueError):
        key = []
    more = " ".join(str(ctx.get(k, "")) for k in ("numbers", "answer", "goal"))
    return livefig.context(ctx.get("code", "-"), ctx.get("stem", ""), ctx.get("solution", ""), key, more)


def valid(text, ctx):
    """the reply as the OpenUI Lang program views_gate lets out (a ```openui fence around it is taken off), else None"""
    body = re.sub(r"^\s*```(?:openui)?\s*\n|\n?```\s*$", "", text.strip())
    prog, _ = views_gate.gate(body, _fig_ctx(ctx))
    return prog


def authored(line):
    return "root = View([t])\nt = Text(" + json.dumps(line, ensure_ascii=False) + ")"


def _claude(system, user):
    """one Claude call, not streamed (the leak filter needs the whole reply): (text, stop_reason). Counts the spend."""
    s = _srv()
    payload = dict(s.claude_params(MINI_MODEL, MAX_TOKENS), system=system, messages=[{"role": "user", "content": user}])
    req = urllib.request.Request(s.CLAUDE_BASE + "/v1/messages", data=json.dumps(payload).encode(), method="POST",
                                 headers={"x-api-key": os.environ.get("CLAUDE_API", ""), "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        d = json.load(r)
    u, (pi, po) = d.get("usage") or {}, s.claude_price(MINI_MODEL)
    s.claude_add((int(u.get("input_tokens") or 0) * pi + int(u.get("cache_creation_input_tokens") or 0) * pi * s.CACHE_WRITE
                  + int(u.get("cache_read_input_tokens") or 0) * pi * s.CACHE_READ + int(u.get("output_tokens") or 0) * po) / 1e6)
    return "".join(b.get("text") or "" for b in d.get("content") or [] if b.get("type") == "text"), d.get("stop_reason")


def _or(model, system, user, key):
    """one OpenRouter call, ZDR only, not streamed: (text, finish_reason; "refusal" when the model filled its refusal field)"""
    s = _srv()
    payload = dict(s._model_params(model, MAX_TOKENS), temperature=0.3, provider={"zdr": True, "data_collection": "deny"},
                   messages=[{"role": "system", "content": "".join(b["text"] for b in system)}, {"role": "user", "content": user}])
    with s._or_post(payload, key, TIMEOUT) as r:
        c = (json.load(r).get("choices") or [{}])[0]
    m = c.get("message") or {}
    return m.get("content") or "", "refusal" if m.get("refusal") else c.get("finish_reason")


def or_models():
    first = MINI_MODEL if "/" in MINI_MODEL else "anthropic/" + MINI_MODEL
    return [first] + [m for m in _srv().OPENROUTER_MODELS if m != first]


def _failed(e, provider, model, out):
    s = _srv()
    s.log(f"mini {model}: {e}")
    if not s.budget_hit(e, provider, out, where="mini", model=model):
        s.incident("mini", "upstream", provider=provider, model=model, status=getattr(e, "code", None), err=e, phase="headers")


def ask(system, user):
    """the engine's reply text, or None when every model failed, refused or said nothing"""
    s, out = _srv(), set()
    if s.claude_ready(out):
        try:
            text, stop = _claude(system, user)
            if text.strip() and stop != "refusal":
                return text
            s.log(f"mini {MINI_MODEL}: {stop if stop == 'refusal' else 'empty'}")
        except Exception as e:  # noqa: BLE001
            _failed(e, "claude", MINI_MODEL, out)
    key = os.environ.get("OPENROUTER_API_KEY", "")
    for m in or_models() if key else []:
        if "openrouter" in out:                  # out of credit: no model on this key can answer
            break
        try:
            text, finish = _or(m, system, user, key)
            if text.strip() and finish not in OR_REFUSED:
                return text
            s.log(f"mini {m}: {finish if finish in OR_REFUSED else 'empty'}")
        except Exception as e:  # noqa: BLE001
            _failed(e, "openrouter", m, out)
    return None


_STR = re.compile(r'"((?:[^"\\\n]|\\.)*)"')            # an OpenUI Lang string literal (its escapes kept as they are)


def guard(prog, ctx):
    """prog with every LEAK_CUT phrase gone from its strings (a cut program is gated again), or None when a string still says a prompt
    word (serve.leak_scan: the KEY, a prompt label, ...); the incident carries the pattern id only, never the text"""
    s = _srv()
    out = _STR.sub(lambda m: '"' + s.leak_cut(m.group(1))[0] + '"', prog)
    hits = [h for m in _STR.finditer(out) for h in s.leak_scan(m.group(1))]
    if not hits:
        return out if out == prog else valid(out, ctx)     # what goes out always passed views_gate
    s.incident("mini", "leak", err=s.PromptLeak(hits[0][0]), q=ctx.get("code"))
    return None


def reply(ctx):
    """mini-Cluck's answer for one stuck sub-step, as an OpenUI Lang program. ctx: code, stem, numbers, solution, answer, error,
    goal, twist (the prompt) + key, tol, formula (the leak filter)"""
    system, user = prompt(ctx)
    for _ in range(2):                           # the first reply, then one regenerate
        text = ask(system, user)
        if text is None:
            break
        prog = None if leaked(text, ctx) else valid(text, ctx)
        prog = prog and guard(prog, ctx)
        if prog:
            return prog
        _srv().log(f"mini {ctx.get('code', '-')}: reply dropped (leak, prompt word or not OpenUI Lang)")
    n = int(hashlib.sha256(f"{ctx.get('code')}|{ctx.get('error')}".encode()).hexdigest(), 16)
    return authored(AUTHORED[n % len(AUTHORED)])
