# WebKitGTK (ios-sim.py, safari-expanded, --fresh): 393x852, a long question scrolled down, bar pinned. python3 wk.py <appRoot> <port> <banksDir> <out.png>
import subprocess, sys, time, os, urllib.request
root, port, banks, out = sys.argv[1:5]
env = dict(os.environ, STEM_BANKS=banks, STEM_TRIES=os.path.join(banks, "..", "tries-wk.json"), OPENROUTER_API_KEY="")
srv = subprocess.Popen(["python3", "serve.py", port], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(80):
        try: urllib.request.urlopen(f"http://localhost:{port}/"); break
        except Exception: time.sleep(0.1)
    js = ["try{localStorage.setItem('stem-ob','done')}catch(e){}", "window.scrollTo(0,600)",
          "(()=>{const r=document.querySelector('.top').getBoundingClientRect();console.log('TOP '+r.top+' '+r.height+' y='+scrollY)})()"]
    cmd = ["timeout", "200", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", "/home/claude/brain/_files/webkit-shot/ios-sim.py",
           f"http://localhost:{port}/#BANK_PT12", out, "--profile", "safari-expanded", "--fresh", "--wait", "3500", "--timeout-ms", "90000",
           *[a for j in js for a in ("--js", j)]]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(*[l[:600] for l in r.stdout.splitlines() if l.startswith("js[") or "TIMEOUT" in l or "TOP" in l], sep="\n"); print(r.stderr[-400:])
finally: srv.terminate()
