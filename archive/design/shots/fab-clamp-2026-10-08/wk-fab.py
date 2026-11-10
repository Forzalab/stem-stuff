# WebKitGTK (ios-sim.py, safari-expanded, --fresh) shot of the T4 fab-clamp case: the 5-choice + figure question from tests/fab.pw.mjs (CSCI26_FB2).
# usage: python3 wk-fab.py <out.png> [app.js to serve instead of the worktree's]   (run from anywhere; serves this worktree on a free local port only)
import http.server, json, os, subprocess, sys, threading
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
out = os.path.abspath(sys.argv[1]); app = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, "app.js")
FQ = {"code": "CSCI26_FB2", "type": "mc", "pick": "one", "shuffle": False,
  "body": [{"type": "text", "md": "Claim 1: a block of 2 kg slides along a rough track, and the friction force on it changes as the angle of the track is changed."},
    {"type": "graph", "kind": "cartesian", "alt": "force against angle", "x": {"min": 0, "max": 8, "step": 1}, "y": {"min": 0, "max": 5, "step": 1},
     "marks": [{"mark": "seg", "from": [0, 1], "to": [8, 4], "color": "c1"}]},
    {"type": "text", "md": "Which option describes the force on the block?"}],
  "choices": [{"id": i, "md": f"Option {i}: raising the angle changes the force on the block by some amount"} for i in "abcde"]}
TYPES = {".mjs": "text/javascript", ".woff": "font/woff", ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2"}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        if os.environ.get("WKV"): print("req", self.path, file=sys.stderr)
    def do_GET(self):
        p = self.path.split("?")[0].split("#")[0]
        if p == "/p/CSCI26_FB2.json": body, ct = json.dumps(FQ).encode(), "application/json"
        else:
            f = app if p == "/app.js" else os.path.normpath(os.path.join(ROOT, p.lstrip("/") or "index.html"))
            if (f != app and not f.startswith(ROOT)) or not os.path.isfile(f) or os.path.basename(f) in ("serve.py", "problems.json", "tries.json"): self.send_error(404); return
            body, ct = open(f, "rb").read(), TYPES.get(os.path.splitext(f)[1], "application/octet-stream")
            if f.endswith("index.html"): body = body.replace(b"<head>", b'<head><script>try{localStorage.setItem("stem-ob","done")}catch(e){}</script>', 1)  # no onboarding toast (the Chromium test does the same)
        self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
# the geometry probe prints the button against the question text and the choices (js[...] lines)
probe = """(()=>{const r=e=>{const b=e.getBoundingClientRect();return[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]},f=document.querySelector('#padFab'),F=r(f),
hit=q=>q[2]>F[0]&&q[0]<F[2]&&q[3]>F[1]&&q[1]<F[3],T=[...document.querySelectorAll('#blocks .md')].filter(e=>e.offsetParent).map(r),O=[...document.querySelectorAll('#q .opt')].filter(e=>e.offsetParent).map(r);
return JSON.stringify({fab:F,hidden:f.hidden,scrollY:Math.round(scrollY),inner:[innerWidth,innerHeight],text:T,onText:T.findIndex(hit),opts:O.length,onOpt:O.findIndex(hit)})})()"""
cmd = ["timeout", "200", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", "/home/claude/brain/_files/webkit-shot/ios-sim.py",
       f"http://127.0.0.1:{port}/#CSCI26_FB2", out, "--profile", "safari-expanded", "--fresh", "--wait", "3500", "--timeout-ms", "90000", "--no-sw", "--js", "scrollTo(0,0)", "--js", probe]
res = subprocess.run(cmd, capture_output=True, text=True)
print(*[l[:900] for l in res.stdout.splitlines() if l.startswith("js[") or "TIMEOUT" in l or os.environ.get("WKV")], sep="\n"); print("rc", res.returncode, res.stderr[-300:])
