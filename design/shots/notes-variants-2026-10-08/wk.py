# WebKitGTK (ios-sim.py, safari-expanded, --fresh) for every variant state: python3 wk.py <port>
# The state is set with --js (set(v, s) is the page's own switcher), not with taps; then CHECK from shoot.mjs reports overlaps.
import json, subprocess, sys
port = sys.argv[1]
shots = [[1, "rest"], [1, "drag"], [1, "hidden"], [1, "open"], [2, "rest"], [2, "open"], [3, "rest"], [3, "open"], [4, "rest"], [5, "rest"], [5, "end"]]
check = subprocess.check_output(["node", "-e", "import('./shoot.mjs').then(m=>console.log(m.CHECK))", "--", "--list"], text=True).strip()
for v, s in shots:
    cmd = ["timeout", "200", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", "/home/claude/brain/_files/webkit-shot/ios-sim.py",
           f"http://localhost:{port}/try/notes-variants.html?v=1&bare=1", f"v{v}-{s}-webkit-393x852.png", "--profile", "safari-expanded", "--fresh", "--wait", "2500",
           "--js", f"set({v}, {json.dumps(s)}); 'set'", "--js", check]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    print(f"v{v}-{s}", *[l[:400] for l in out.splitlines() if l.startswith("js[") or "TIMEOUT" in l])
