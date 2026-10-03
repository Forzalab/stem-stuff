"""The bank hatch: fetch only the exam banks (projects/*/_files/*-bank/BANK_*.json) from the brain on GitLab, over its HTTP API.
No clone and no git: the brain is heavy and Tony's phone has no copy (design/DEPLOY.md). tools/ship.sh calls this when no local
brain clone exists.

usage: python3 tools/brain_banks.py OUTDIR
  writes each bank to OUTDIR/<name> and prints "EPOCH<tab>PATH" per bank. If one name sits in several *-bank folders, the
  newest commit wins (EPOCH = that commit time, else 0).
exit: 0 ok, 3 no BRAIN_TOKEN (skipped), 1 error (bad token, network, a file that is not a bank): ship.sh then stops, so a broken
  or partial bank set is never deployed.
env: BRAIN_TOKEN (GitLab token with read_api; from stem-stuff/.env), BRAIN_API (default https://gitlab.com/api/v4),
  BRAIN_PROJECT (default Forzalab-bravo/brain), BRAIN_REF (default main).
The token goes in one header, only to BRAIN_API's host, never across a redirect, and is never printed."""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("BRAIN_API", "https://gitlab.com/api/v4").rstrip("/")
PROJECT = urllib.parse.quote(os.environ.get("BRAIN_PROJECT", "Forzalab-bravo/brain"), safe="")
REF = os.environ.get("BRAIN_REF", "main")
BANK = re.compile(r"^projects/[^/]+/_files/[^/]+-bank/(BANK_[A-Z0-9]{3,6}\.json)$")


class Fail(Exception):
    pass


def get(endpoint, token, **query):   # not "path": GitLab's own query field is called path
    url = f"{API}/projects/{PROJECT}/{endpoint}" + ("?" + urllib.parse.urlencode(query) if query else "")
    req = urllib.request.Request(url)
    req.add_unredirected_header("PRIVATE-TOKEN", token)   # not re-sent if GitLab redirects elsewhere
    try:
        return urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise Fail("BRAIN_TOKEN rejected (it needs read_api on the brain project)") from None
        raise Fail(f"GitLab answered {e.code} for {endpoint}") from None
    except OSError as e:
        raise Fail(f"GitLab unreachable: {getattr(e, 'reason', e)}") from None


def bank_paths(token):
    found, page = [], "1"
    while page:   # the tree is paged; X-Next-Page is empty on the last page
        r = get("repository/tree", token, path="projects", recursive="true", per_page="100", ref=REF, page=page)
        found += [i["path"] for i in json.load(r) if i.get("type") == "blob" and BANK.match(i.get("path", ""))]
        page = r.headers.get("X-Next-Page", "")
    return found


def committed(path, token):
    c = json.load(get("repository/commits", token, path=path, ref_name=REF, per_page="1"))
    return int(datetime.datetime.fromisoformat(c[0]["committed_date"].replace("Z", "+00:00")).timestamp()) if c else 0


def main(out):
    token = os.environ.get("BRAIN_TOKEN", "")
    if not token:
        return 3
    by_name = {}
    for p in bank_paths(token):
        by_name.setdefault(BANK.match(p).group(1), []).append(p)
    for name, paths in sorted(by_name.items()):
        when = {p: committed(p, token) for p in paths} if len(paths) > 1 else {paths[0]: 0}
        path = max(paths, key=lambda p: (when[p], p))
        raw = get(f"repository/files/{urllib.parse.quote(path, safe='')}/raw", token, ref=REF).read()
        try:
            ok = isinstance(json.loads(raw).get("problems"), list)
        except (ValueError, AttributeError):
            ok = False
        if not ok:
            raise Fail(f"{path}: not a bank (needs a JSON object with a problems list)")
        dest = os.path.join(out, name)
        with open(dest, "wb") as f:
            f.write(raw)
        print(f"{when[path]}\t{dest}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        sys.exit("usage: brain_banks.py OUTDIR")
    try:
        sys.exit(main(sys.argv[1]))
    except Fail as e:
        print(f"brain: {e}", file=sys.stderr)
        sys.exit(1)
