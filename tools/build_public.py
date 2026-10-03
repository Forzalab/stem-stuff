"""Vercel build: copy the client into public/ (vercel.json outputDirectory) and build public/stem-stuff.html.
Everything is copied except the server side: answers (problems.json, banks/), tries, keys, logs, server code, tests.
tests/test_build_public.py checks that nothing serve.py blocks ends up in public/.
usage: python3 tools/build_public.py [out]   (default: <repo>/public)"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".github", ".claude", ".vercel", "public", "api", "banks", "k", "log", "tests", "tools", "node_modules", "__pycache__"}
SKIP_FILES = {"problems.json", "tries.json", "tries.json.tmp", "serve.py", "deploy.sh", "host.log", ".host.pid",
              "requirements.txt", "vercel.json", ".vercelignore", ".gitignore", "stem-stuff.html", "stem-stuff.html.tmp"}


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
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    try:
        import bundle
        bundle.build(os.path.join(out, "stem-stuff.html"))
    except Exception as e:  # noqa: BLE001  the offline download is a nice-to-have, never a failed deploy
        print("stem-stuff.html not built:", e, file=sys.stderr)
    return out


if __name__ == "__main__":
    print(build(os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "public")))
