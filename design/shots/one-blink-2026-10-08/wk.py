# run ios-sim.py (WebKitGTK, safari-expanded, --fresh) through one state: python3 wk.py <name> <mode> <before|after> <port>
import json, subprocess, sys
name, mode, tag, port = sys.argv[1:5]
steps = json.loads(subprocess.check_output(["node", "shot-one-blink.mjs", "--steps", mode]))
args = [a for s in steps for a in ("--js", s.replace("\n", " "))]
cmd = ["timeout", "200", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", "/home/claude/brain/_files/webkit-shot/ios-sim.py",
       f"http://localhost:{port}/#CALC1_B01", f"{name}-{tag}-webkit-393x852.png", "--profile", "safari-expanded", "--fresh", "--wait", "3500", "--timeout-ms", "90000", *args]
out = subprocess.run(cmd, capture_output=True, text=True).stdout
print(*[l[:900] for l in out.splitlines() if l.startswith("js[") or "TIMEOUT" in l], sep="\n")
