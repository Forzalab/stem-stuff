"""Vercel build: copy the client into public/ (vercel.json outputDirectory) and build public/stem-stuff.html.
Everything is copied except the server side: answers (problems.json, banks/), tries, keys, logs, server code, tests.
tests/test_build_public.py checks that nothing serve.py blocks ends up in public/.
usage: python3 tools/build_public.py [out]   (default: <repo>/public)"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".github", ".claude", ".impeccable", ".vercel", "public", "api", "author", "banks", "k", "log", "tests", "tools", "node_modules", "__pycache__"}
SKIP_FILES = {"problems.json", "tries.json", "tries.json.tmp", "serve.py", "deploy.sh", "host.log", ".host.pid",
              "requirements.txt", "vercel.json", ".vercelignore", ".gitignore", "stem-stuff.html", "stem-stuff.html.tmp"}


def stamp(out):
    """version.json (tools/ship.sh writes it: tools/version.sh --stamp) → a new sw.js per deploy (the browser installs it, the whole
    shell swaps at once) + the index.html meta the corner badge reads. None (local build, serve.py) → both stay "dev"."""
    try:
        with open(os.path.join(out, "version.json")) as f:
            v = json.load(f)
        pr, sha, built = (re.sub(r"[^\w#+:.-]", "", str(v.get(k, ""))) for k in ("pr", "sha", "built"))
    except (OSError, ValueError, AttributeError):
        return None
    sub = [("sw.js", r'const VERSION = "[^"]*";', f'const VERSION = "stem-{pr.lstrip("#")}-{sha}";'),
           ("index.html", r'<meta name="stem-build" content="dev">', f'<meta name="stem-build" content="{pr}" data-sha="{sha}" data-built="{built}">')]
    for name, old, new in sub:
        p = os.path.join(out, name)
        with open(p) as f:
            text, n = re.subn(old, new, f.read(), count=1)
        if n != 1:
            raise SystemExit(f"build_public: no version slot in {name}")   # a deploy without its stamp would be stale forever
        with open(p, "w") as f:
            f.write(text)
    return pr


def stamp_telemetry(out, env=os.environ):
    """Telemetry keys (design/plans/TELEMETRY.md): the Vercel Production env has POSTHOG_TOKEN (phc_, public by design) and CLARITY_ID
    (+ optional POSTHOG_HOST). Stamped into index.html's <meta name="stem-t">; absent (local, preview) → the meta stays empty, telemetry.js no-ops."""
    ph, cl = env.get("POSTHOG_TOKEN", "").strip(), env.get("CLARITY_ID", "").strip()
    host = env.get("POSTHOG_HOST", "").strip().rstrip("/") or "https://us.i.posthog.com"
    ph = ph if re.fullmatch(r"phc_\w+", ph) else ""
    cl = cl if re.fullmatch(r"[A-Za-z0-9]+", cl) else ""
    host = host if re.fullmatch(r"https://[\w.-]+", host) else "https://us.i.posthog.com"
    if not (ph or cl):
        return False
    p = os.path.join(out, "index.html")
    with open(p) as f:
        text, n = re.subn(r'<meta name="stem-t" content="">', f'<meta name="stem-t" content="{ph}" data-host="{host}" data-clarity="{cl}">', f.read(), count=1)
    if n != 1:
        raise SystemExit("build_public: no telemetry slot in index.html")
    with open(p, "w") as f:
        f.write(text)
    return True


def build(out):
    if os.path.isdir(out):
        shutil.rmtree(out)
    for d, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT)
        dirs[:] = [x for x in dirs if not (x in SKIP_DIRS and rel == ".") and x not in ("node_modules", "__pycache__", ".git")]
        for f in files:
            if rel == "." and (f in SKIP_FILES or f.startswith(".")):   # dotfiles: .env.local (vercel link), .vercelignore, ...
                continue
            dst = os.path.join(out, rel, f)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(d, f), dst)
    stamp(out)
    stamp_telemetry(out)
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    try:
        import bundle
        bundle.build(os.path.join(out, "stem-stuff.html"))
    except Exception as e:  # noqa: BLE001  the offline download is a nice-to-have, never a failed deploy
        print("stem-stuff.html not built:", e, file=sys.stderr)
    return out


if __name__ == "__main__":
    print(build(os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "public")))
