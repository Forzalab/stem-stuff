# BRIDGE (temporary, todo 167): why = old URLs keep working after the client/ move; delete by BX (first Monday >= 7 days after B merges); map = shared/temporary_rename_map/rename-map.json
"""Write the bridge rules (stub rewrites + 307 redirects) into vercel.json, from the rename map. Stdlib only.

usage: bridge_gen.py           rewrite vercel.json in place
       bridge_gen.py --check   exit 0 if vercel.json already matches, else print the diff and exit 1
"""
import difflib
import json
import os
import sys

STUB = "/client/shell/stale_reload.js"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAP = os.path.join("shared", "temporary_rename_map", "rename-map.json")
VERCEL = "vercel.json"


def generate(rename_map):
    """(rewrites, redirects) for the map. Nothing unless active; only bridge:true entries."""
    rewrites, redirects = [], []
    if rename_map.get("active") is not True:
        return rewrites, redirects
    for e in rename_map.get("entries", []):
        if e.get("bridge") is not True:
            continue
        old, new = "/" + e["old"], "/" + e["new"]
        if e["old"].endswith("/"):
            rewrites.append({"source": old + ":f(.*\\.m?js)", "destination": STUB})
            redirects.append({"source": old + ":f((?!.*\\.m?js$).*)", "destination": new + ":f", "permanent": False})
        elif e["old"].endswith((".js", ".mjs")):
            rewrites.append({"source": old, "destination": STUB})
        else:
            redirects.append({"source": old, "destination": new, "permanent": False})
    return rewrites, redirects


def render(vercel_text, rename_map):
    """vercel.json text with the bridge rules replaced. Key order and 2-space indent kept; other keys untouched."""
    data = json.loads(vercel_text)
    rewrites, redirects = generate(rename_map)
    kept = [r for r in data.get("rewrites", []) if r.get("destination") != STUB]
    out = {}
    for k, v in data.items():
        if k == "redirects":
            continue
        if k == "rewrites":
            if redirects:
                out["redirects"] = redirects
            out["rewrites"] = kept + rewrites
        else:
            out[k] = v
    if "rewrites" not in out:
        if redirects:
            out["redirects"] = redirects
        if rewrites:
            out["rewrites"] = rewrites
    return json.dumps(out, indent=2, ensure_ascii=False) + "\n"


def main(argv, root=ROOT):
    if not set(argv) <= {"--check"}:
        print(__doc__)
        return 2
    with open(os.path.join(root, MAP), encoding="utf-8") as f:
        rename_map = json.load(f)
    path = os.path.join(root, VERCEL)
    with open(path, encoding="utf-8") as f:
        old = f.read()
    new = render(old, rename_map)
    if new == old:
        return 0
    if "--check" in argv:
        diff = difflib.unified_diff(old.splitlines(), new.splitlines(), VERCEL, VERCEL + " (generated)", lineterm="")
        print("\n".join(list(diff)[:200]))
        print("vercel.json is stale: run tools/build_and_ship/bridge_gen.py")
        return 1
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
