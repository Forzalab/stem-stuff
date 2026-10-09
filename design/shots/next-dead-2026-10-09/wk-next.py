# WebKitGTK (ios-sim.py, safari-expanded, 393x659 visible) Next matrix, 10 presses per row. Local serve.py only, scratch banks.
# usage: python3 wk-next.py <appRoot> <banksDir> <outPrefix> <port> row [row...]   rows: p2x diet bear odd out one in
import subprocess, sys, time, os, urllib.request, json
root, banks, pre, port = sys.argv[1:5]; rows = sys.argv[5:]
env = dict(os.environ, STEM_BANKS=banks, STEM_TRIES=os.path.join(banks, "..", f"tries-{port}.json"), OPENROUTER_API_KEY="")
srv = subprocess.Popen(["python3", "serve.py", port], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
SIM = "/home/claude/brain/_files/webkit-shot/ios-sim.py"
LOOP = """(()=>{window.__nd=[];let n=0;const $=s=>document.querySelector(s);const t=setInterval(()=>{const b=$('#qnext'),h=location.hash,c=$('#pcode').textContent,d=b.disabled,hid=$('#qnav').hidden;
if(!hid)b.click();setTimeout(()=>{window.__nd.push((n)+' '+h+'>'+location.hash+' shown '+c+'>'+$('#pcode').textContent+' dis='+d+' hid='+hid+' said='+JSON.stringify(($('#toast.on')||{}).textContent||$('#entryMsg').textContent))},500);if(++n>=10)clearInterval(t)},750)})()"""
POLL = "(window.__nd||[]).length"
DUMP = "(window.__nd||[]).join('\\n')"
SUBMIT = "(()=>{const i=document.querySelector('#code');i.value='DIET_BANK_P2X';i.form.requestSubmit();'sub'})()"
ING = lambda url, code: ("fetch('/b/%s.json').then(r=>r.json()).then(b=>stemOffline.ingest([{name:'F.json',size:1,text:async()=>JSON.stringify({v:1,problems:b.problems})}])).then(()=>{location.hash='%s'});'ing'" % (url, code))
ODD = "stemOffline.ingest([{name:'ODD.json',size:1,text:async()=>JSON.stringify({v:1,problems:[{code:'BEAR_001',type:'num',answer:'2',body:[{type:'text',md:'odd'}]}]})}]).then(()=>{location.hash='BEAR_001'});'odd'"
def sim(url, out, js, extra=()):
    a = ["timeout", "240", "xvfb-run", "-a", "-s", "-screen 0 1280x2700x24", "/usr/bin/python3.12", "-I", SIM, url, out, "--profile", "safari-expanded", "--wait", "2500", "--timeout-ms", "200000", "--no-sw", *extra]
    for j in js: a += ["--js", j]
    r = subprocess.run(a, capture_output=True, text=True)
    return r.stdout
try:
    for _ in range(80):
        try: urllib.request.urlopen(f"http://127.0.0.1:{port}/"); break
        except Exception: time.sleep(0.1)
    pre_js = "localStorage.setItem('stem-ob','done');'ob'"
    for row in rows:
        dd = f"/tmp/ios-sim-wkn-{port}-{row}"; out = f"{pre}-{row}.png"; B = f"http://127.0.0.1:{port}/"
        polls = [POLL] * 16
        if row == "p2x": js, url, ex = [pre_js, LOOP, *polls, DUMP], B + "#BANK_P2X", ["--fresh", "--data-dir", dd]
        elif row == "diet": js, url, ex = [pre_js, SUBMIT, LOOP, *polls, DUMP], B + "#BANK_P2X", ["--fresh", "--data-dir", dd]
        elif row == "bear": js, url, ex = [pre_js, ING("BANK_BEAR", "CSCI26_BAA"), LOOP, *polls, DUMP], B, ["--fresh", "--data-dir", dd]
        elif row == "odd": js, url, ex = [pre_js, ODD, POLL, POLL, "document.querySelector('#entryMsg').textContent"], B, ["--fresh", "--data-dir", dd]
        elif row == "one": js, url, ex = [pre_js, LOOP, *polls, DUMP], B + "#BANK_ONE", ["--fresh", "--data-dir", dd]
        elif row in ("in", "out"):
            sim(B + "#BANK_P2X", out + ".p1.png", [pre_js], ["--fresh", "--data-dir", dd])          # remember the bank in this profile
            js, url, ex = [LOOP, *polls, DUMP], B + ("#PHYS_P05" if row == "in" else "#PHYS_F3N"), ["--data-dir", dd]
        else: continue
        res = sim(url, out, js, ex)
        print("ROW", row)
        open(f"{pre}-{row}.log", "w").write(res)
        i = res.rfind("js["); print("\n".join(l[:200] for l in res[i:].splitlines() if l.startswith("js[") or l[:3].strip().isdigit() or "dis=" in l))
finally: srv.terminate()
