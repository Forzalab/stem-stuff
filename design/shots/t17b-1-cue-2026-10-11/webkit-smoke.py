"""WebKitGTK smoke for T17b-1 (ios-sim.py, safari-expanded 393x659): per case, answer to the close, then check Next covers the Check rect
and the card did not move. usage: python3 wk.py BASE OUTDIR"""
import json, os, re, subprocess, sys

BASE, OUT = sys.argv[1], sys.argv[2]
PFX = sys.argv[3] if len(sys.argv) > 3 else "wk"
os.makedirs(OUT, exist_ok=True)
SIM = "/home/claude/brain/_files/webkit-shot/ios-sim.py"

def fill(sel, val, go):
    return ("(()=>{const i=document.querySelector(%s); i.value=%s; i.dispatchEvent(new Event('input',{bubbles:true}));"
            "const g=document.querySelector(%s); g.hidden=false; g.disabled=false; g.scrollIntoView({block:'center'}); return 'filled'})()") % (json.dumps(sel), json.dumps(val), json.dumps(go))
def press(go):   # measure Check + card, then tap Check
    return ("(()=>{const g=document.querySelector(%s), r=g.getBoundingClientRect(); window.__pre={c:[r.left,r.top,r.right,r.bottom], card:document.querySelector('#blocks').getBoundingClientRect().top, y:scrollY};"
            "g.click(); return JSON.stringify(window.__pre)})()") % json.dumps(go)
def click(sel):
    return "(()=>{const e=document.querySelector(%s); e.scrollIntoView({block:'center'}); e.click(); return 'clicked'})()" % json.dumps(sel)
MEASURE = ("(()=>{const n=document.querySelector('#q .nx'); if(!n) return JSON.stringify({pre:window.__pre, nx:null});"
           "const r=n.getBoundingClientRect(), f=getComputedStyle(n.querySelector('.nf')); return JSON.stringify({pre:window.__pre, nx:[r.left,r.top,r.right,r.bottom],"
           " card:document.querySelector('#blocks').getBoundingClientRect().top, y:scrollY, focus:document.activeElement===n, ring:((b)=>(/^(none|normal)$/.test(b.content)?'none':Math.round(n.querySelector('.nf').getBoundingClientRect().top-r.top-parseFloat(b.top))+'px'))(getComputedStyle(n,'::before')),"
           " tri:document.querySelectorAll('.nx use[href=\"#i-tri\"]').length, nav:document.querySelector('#qnext use').getAttribute('href'),"
           " chip:(document.querySelector('#wish:not([hidden]) .cue-chip')||{}).textContent||null, fb:document.querySelector('#fb').textContent})})()")
WAIT = "'wait'"

def steps(t, outcome, code):
    s = ["location.hash='%s'" % code, WAIT, WAIT]
    right = outcome == "right"
    if t == "num":
        if not right: s += [fill("#ans", "1", "#ansGo"), click("#ansGo"), WAIT]
        s += [fill("#ans", "2.02" if right else "5", "#ansGo"), press("#ansGo")]
    elif t == "text":
        if not right: s += [fill("#ans", "loss", "#ansGo"), click("#ansGo"), WAIT]
        s += [fill("#ans", "negativity bias" if right else "framing", "#ansGo"), press("#ansGo")]
    elif t == "mc":
        if not right: s += [click('#q .opt[data-id="c"]'), click('#q .ch[data-id="c"] .send'), WAIT]
        i = "a" if right else "d"
        s += [click('#q .opt[data-id="%s"]' % i), WAIT, press('#q .ch[data-id="%s"] .send' % i)]
    elif t == "multi":
        s += [fill('#q .part[data-i="0"] .ans', "3", "#go0"), click("#go0"), WAIT]
        if not right: s += [fill('#q .part[data-i="1"] .ans', "1", "#go1"), click("#go1"), WAIT]
        s += [fill('#q .part[data-i="1"] .ans', "36" if right else "2", "#go1"), press("#go1")]
    return s + [WAIT, WAIT, MEASURE]

CASES = [("num", "PHYS_WKN"), ("text", "PHYS_WKT"), ("mc", "PHYS_WKM"), ("multi", "PHYS_WKP")]
rows, bad = [], 0
for mode in ("sugar", "diet"):
    for t, code in CASES:
        for outcome in ("right", "out"):
            name = "%s-%s-%s-%s-659" % (PFX, mode, t, outcome)
            # the app's own DIET_ / SUGAR_ entry (mode.mjs): WebKitGTK keeps cookies across --fresh runs, so every run sets its mode
            pre = ["(()=>{document.querySelector('#code').value='%s_BANK_TQWK'; document.querySelector('#entry').requestSubmit(); return document.cookie})()" % mode.upper(), WAIT, WAIT, WAIT]
            cmd = ["timeout", "240", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", SIM, BASE + "/#BANK_TQWK", os.path.join(OUT, name + ".png"),
                   "--profile", "safari-expanded", "--fresh", "--wait", "3000", "--timeout-ms", "120000"]
            for j in pre + steps(t, outcome, code): cmd += ["--js", j]
            p = subprocess.run(cmd, capture_output=True, text=True)
            got = None
            for line in p.stdout.splitlines():
                m = re.match(r"js\[\d+\] -> (\{.*\"nx\".*\})$", line)
                if m: got = json.loads(m.group(1))
            ok, why = False, "no measure (rc %d) %s" % (p.returncode, (p.stderr or "")[-300:])
            if got and got.get("nx") and got.get("pre"):
                c, n = got["pre"]["c"], got["nx"]
                inside = n[0] <= c[0] + 1 and n[1] <= c[1] + 1 and n[2] >= c[2] - 1 and n[3] >= c[3] - 1
                h = n[3] - n[1]; dcard = got["card"] - got["pre"]["card"]
                ring = (got["ring"] or "") == "3px"
                ok = inside and abs(h - 48) <= 0.5 and abs(n[2] - c[2]) <= 2 and dcard == 0 and got["y"] == got["pre"]["y"] and got["tri"] == 1 and got["nav"] == "#i-next" \
                    and "Out of tries" not in got["fb"] and ((mode == "sugar" and outcome == "right") == ring) and (mode == "sugar" or not got["chip"])
                why = "Check %s Next %s h %.1f dcard %s dy %s focus %s ring %s chip %s" % ([round(x, 1) for x in c], [round(x, 1) for x in n], h, dcard, got["y"] - got["pre"]["y"], got["focus"], ring, got["chip"])
            elif got: why = "no Next: " + json.dumps(got)[:300]
            bad += not ok
            rows.append("%s %s  %s" % ("ok  " if ok else "FAIL", name, why))
            print(rows[-1], flush=True)
print("\n%d/%d WebKit cases pass" % (len(rows) - bad, len(rows)))
sys.exit(1 if bad else 0)
