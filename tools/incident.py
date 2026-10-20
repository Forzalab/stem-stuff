#!/usr/bin/env python3
"""Look up one incident code (E-XXXXX from the page, S-XXXXX from serve.py) and print what we know: its incident line(s), the page's
flight-recorder snapshot (flight.js: the ring as a table, keyboard classes, page.before / page.at, the diag line) and every server line
of the same trace (serve.py log() ends each line with `trace=<trace id>`). README "Incidents".

No KV / Redis (Tony, Oct 19: "we do not have redis, and redis cost money"): it reads only what is already there for free.
  --paste FILE|-  a log saved or pasted by hand: a Vercel Logs JSON export, `vercel logs` output, serve.py's stderr. Works offline.
  Vercel          env VERCEL_KEY (or VERCEL_TOKEN): the request-log search the Vercel dashboard uses (Logs -> search; not in Vercel's
                  documented REST API, so it may change). Runtime logs are kept a short time only (Hobby: about 1 hour), so an older
                  code comes back empty: ask PostHog, or paste the log.
  PostHog         env POSTHOG_KEY (a personal API key, phx_...; the page's phc_ key cannot read): the event `incident`, kept for months.
                  The page's report only, and none from a device with Do Not Track / GPC / "Don't record me".
usage: tools/incident.py CODE [--paste FILE|-] [--hours N] [--no-vercel] [--no-posthog]
Exit 0 = found, 1 = nothing found, 2 = bad code. Stdlib only. Never prints a key.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CODE = re.compile(r"^[ES]-[2-9A-HJ-NP-Z]{5}$")             # serve.py INC_CODE
TRACE = re.compile(r"^[0-9a-f]{32}$")
VERCEL_LOGS = "https://vercel.com/api/logs/request-logs"
VERCEL_PROJECT = os.environ.get("VERCEL_PROJECT_ID", "prj_tF6vwwPqxMX5tfS1WVGI2DXE7LBh")
VERCEL_TEAM = os.environ.get("VERCEL_TEAM_ID", "team_5Dzt7eAwkIGvpAAfrasKaogy")
POSTHOG_HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")
POSTHOG_PROJECT = os.environ.get("POSTHOG_PROJECT", "650708")
TIMEOUT = 30
MAX_PAGES = 5


def _get_json(url, token, body=None):
    """GET (or POST body) url with a bearer token; the parsed JSON. Errors name the status only, never the token"""
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                          "User-Agent": "stem-stuff-incident/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise RuntimeError(type(e).__name__) from None


def messages(text):
    """every log message in a pasted log: a JSON export (a list of rows, or {"rows": [...]}, each with "message" or "logs": [...]),
    NDJSON, or plain lines"""
    def from_rows(rows):
        for r in rows:
            if isinstance(r, dict):
                if isinstance(r.get("message"), str):
                    yield r["message"]
                yield from (x["message"] for x in r.get("logs") or [] if isinstance(x, dict) and isinstance(x.get("message"), str))
            elif isinstance(r, str):
                yield r
    try:
        whole = json.loads(text)
    except ValueError:
        whole = None
    if isinstance(whole, (list, dict)):
        return list(from_rows(whole.get("rows", [whole]) if isinstance(whole, dict) else whole))
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            o = None
        if isinstance(o, dict) and not o.get("incident") and ("message" in o or "logs" in o):
            out.extend(from_rows([o]))
        else:
            out.append(line)
    return out


def vercel(search, hours, token, get=_get_json):
    """Vercel's runtime log messages whose text matches `search` in the last `hours`"""
    end = int(time.time() * 1000)
    out = []
    for page in range(MAX_PAGES):
        q = {"projectId": VERCEL_PROJECT, "ownerId": VERCEL_TEAM, "page": page, "startDate": end - int(hours * 3600000),
             "endDate": end, "search": search}
        d = get(VERCEL_LOGS + "?" + urllib.parse.urlencode(q), token)
        for row in d.get("rows") or []:
            out.extend(x["message"] for x in row.get("logs") or [] if isinstance(x.get("message"), str))
        if not d.get("hasMoreRows"):
            break
    return out


def posthog(code, token, get=_get_json, days=90):
    """the page's reports for this code: PostHog `incident` events, as {"t": time, "props": {...}}"""
    q = {"query": {"kind": "HogQLQuery", "query": "select timestamp, properties from events where event = 'incident' "
                   f"and timestamp > now() - interval {int(days)} day and properties.code = '{code}' "   # code: CODE-checked, no quote
                   "order by timestamp limit 20"}}
    d = get(f"{POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT}/query/", token, q)
    out = []
    for t, props in d.get("results") or []:
        try:
            props = json.loads(props) if isinstance(props, str) else props
        except ValueError:
            continue
        if isinstance(props, dict):
            out.append({"t": t, "props": props})
    return out


def incident_lines(msgs, code):
    """the JSON incident lines for this code (serve.py inc_line: {"incident": code, "src": ...})"""
    out = []
    for m in msgs:
        i = m.find('{"incident"')
        if i < 0 or code not in m:
            continue
        try:
            o = json.loads(m[i:])
        except ValueError:
            continue
        if isinstance(o, dict) and o.get("incident") == code and o not in out:
            out.append(o)
    return out


def traces(records):
    return sorted({r.get("trace_id") for r in records if isinstance(r.get("trace_id"), str) and TRACE.match(r["trace_id"])})


def same_trace(msgs, trace):
    """every line of one trace: log()'s `trace=<id>` tail, or an incident line's "trace_id" """
    out = []
    for m in msgs:
        if (f"trace={trace}" in m or f'"trace_id":"{trace}"' in m) and m not in out:
            out.append(m)
    return out


def _cell(v):
    return "-" if v is None else json.dumps(v, separators=(",", ":")) if isinstance(v, (list, dict)) else str(v)


def render_fr(fr, w=print):
    """the flight recorder snapshot, readable: the diag line, /health, page.before / page.at, the ring and kb as tables (t = s since load)"""
    if not isinstance(fr, dict):
        return
    if fr.get("dup"):
        w(f"  fr: a repeat of {fr['dup']} (x{fr.get('n')}); its snapshot is under that code")
        return
    if fr.get("rate"):
        w("  fr: rate-limited (no snapshot)")
        return
    for k in ("diag", "health", "dev", "cut"):
        if fr.get(k) is not None:
            w(f"  {k}: {_cell(fr[k])}")
    page = fr.get("page") or {}
    for k in ("before", "at"):
        if page.get(k) is not None:
            w(f"  page.{k}: {_cell(page[k])}")
    for name in ("ring", "kb"):
        rows = fr.get(name) or []
        if rows:
            w(f"  {name} ({len(rows)}):")
        for e in rows:
            if isinstance(e, list) and e:
                t = e[0] / 1000 if isinstance(e[0], (int, float)) else e[0]
                w(f"    {t:>9.1f}s  " + "  ".join(_cell(x) for x in e[1:]) if isinstance(t, float) else "    " + _cell(e))


def render(code, lines, reports, server, w=print):
    for o in lines:
        fr = o.pop("fr", None)
        w(f"== {o.get('src', '?')} line (Vercel log) ==")
        w("  " + json.dumps(o, separators=(",", ":")))
        render_fr(fr, w)
    for r in reports:
        p = dict(r["props"])
        fr = p.pop("fr", None)
        keep = {k: v for k, v in p.items() if not k.startswith("$") or k in ("$browser", "$os", "$device_type", "$current_url")}
        w(f"== page report (PostHog, {r['t']}) ==")
        w("  " + json.dumps(keep, separators=(",", ":")))
        render_fr(fr, w)
    for t, ms in server.items():
        w(f"== server lines of trace {t} ({len(ms)}) ==")
        for m in ms:
            w("  " + (m if len(m) <= 600 else m[:600] + f"... ({len(m)} chars)"))


def main(argv=None, env=os.environ, get=_get_json, read=None, w=print):
    ap = argparse.ArgumentParser(description="Look up an incident code (E-/S-XXXXX).")
    ap.add_argument("code")
    ap.add_argument("--paste", help="a saved / pasted log file, or - for stdin")
    ap.add_argument("--hours", type=float, default=24, help="how far back Vercel is searched (default 24)")
    ap.add_argument("--no-vercel", action="store_true")
    ap.add_argument("--no-posthog", action="store_true")
    a = ap.parse_args(argv)
    code = a.code.strip().upper()
    if not CODE.match(code):
        w(f"not an incident code: {a.code!r} (want E-XXXXX or S-XXXXX)")
        return 2
    msgs, notes = [], []
    if a.paste:
        text = read(a.paste) if read else (sys.stdin.read() if a.paste == "-" else open(a.paste, encoding="utf-8", errors="replace").read())
        msgs += messages(text)
    vtok = env.get("VERCEL_KEY") or env.get("VERCEL_TOKEN")
    if not a.no_vercel:
        if vtok:
            try:
                msgs += vercel(code, a.hours, vtok, get)
            except RuntimeError as e:
                notes.append(f"Vercel: {e}")
        else:
            notes.append("Vercel: no VERCEL_KEY / VERCEL_TOKEN")
    lines = incident_lines(msgs, code)
    reports = []
    ptok = env.get("POSTHOG_KEY")
    if not a.no_posthog:
        if ptok:
            try:
                reports = posthog(code, ptok, get)
            except RuntimeError as e:
                notes.append(f"PostHog: {e}")
        else:
            notes.append("PostHog: no POSTHOG_KEY")
    server = {}
    for t in traces(lines + [r["props"] for r in reports]):
        ms = list(msgs)
        if vtok and not a.no_vercel:
            try:
                ms += vercel(t, a.hours, vtok, get)
            except RuntimeError as e:
                notes.append(f"Vercel (trace): {e}")
        server[t] = [m for m in same_trace(ms, t) if f'"incident":"{code}"' not in m]   # its own line is shown above; an S- of the same trace stays
    if not lines and not reports:
        w(f"{code}: nothing found." + (" (" + "; ".join(notes) + ")" if notes else "")
          + " Vercel keeps runtime logs a short time only: try PostHog, or --paste a saved log.")
        return 1
    render(code, lines, reports, server, w)
    for n in notes:
        w("note: " + n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
