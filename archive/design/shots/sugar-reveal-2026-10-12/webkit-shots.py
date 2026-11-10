"""WebKitGTK shots for T19 sugar-reveal (ios-sim.py, standalone-cover = 393x852): sugar and diet, mc and num, out of tries; colour + greyscale twin.
usage: python3 webkit-shots.py BASE PREFIX OUTDIR   (BASE = a local serve.py, never prod)"""
import json, os, subprocess, sys

BASE, PFX, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
SIM = "/home/claude/brain/_files/webkit-shot/ios-sim.py"
WAIT = "'wait'"

def click(sel):
    return "(()=>{const e=document.querySelector(%s); e.click(); return 'clicked'})()" % json.dumps(sel)
def fill(sel, val, go):
    return ("(()=>{const i=document.querySelector(%s); i.value=%s; i.dispatchEvent(new Event('input',{bubbles:true}));"
            "const g=document.querySelector(%s); g.hidden=false; g.disabled=false; g.click(); return 'filled'})()") % (json.dumps(sel), json.dumps(val), json.dumps(go))
GREY = "(()=>{document.documentElement.style.filter='grayscale(1)'; return 'grey'})()"

CASES = {"mc": "CALC1_X2P", "num": "CALC1_T6B"}
for mode in ("sugar", "diet"):
    for t, code in CASES.items():
        steps = ["(()=>{document.querySelector('#code').value='%s_%s'; document.querySelector('#entry').requestSubmit(); return document.cookie})()" % (mode.upper(), code), WAIT, WAIT, WAIT]
        if t == "mc":
            for i in ("a", "c"):
                steps += [click('#q .opt[data-id="%s"]' % i), WAIT, click('#q .ch[data-id="%s"] .send' % i), WAIT, WAIT]
        else:
            for v in ("5", "6"):
                steps += [fill("#ans", v, "#ansGo"), WAIT, WAIT]
        steps += [WAIT, WAIT, "(()=>{window.scrollTo(0,0); return document.querySelector('#q').className+'|'+document.querySelectorAll('#q .opt.reveal,#q .ansl').length})()"]
        for grey in (False, True):
            name = "webkit-%s-%s-%s-out-852%s" % (PFX, mode, t, "-grey" if grey else "")
            cmd = ["timeout", "240", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", SIM, BASE + "/#" + code, os.path.join(OUT, name + ".png"),
                   "--profile", "standalone-cover", "--fresh", "--wait", "3000", "--timeout-ms", "120000"]
            for j in steps + ([GREY] if grey else []): cmd += ["--js", j]
            p = subprocess.run(cmd, capture_output=True, text=True)
            last = [l for l in p.stdout.splitlines() if l.startswith("js[")][-2:]
            print(name, "rc", p.returncode, "|", " ".join(last)[:160])
