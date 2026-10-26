"""My Cluck accounts (DESIGN-v3 §7, AUTH-RESEARCH): a token is the only secret, the account is a thin layer over the sid cookie.
Progress already hangs off sid, so login = the server hands back the account's sid (serve.py sets the cookie). No image here:
the QR/Cluck art is drawn on the client from the token (mycluck.mjs).

Keys live OUTSIDE stem:tries, one per value (never the shared blob):
  acct:<sha256(token)>  -> {"sid", "name", "at", "rewards"}   the raw token is never stored, only its hash
  acct:sid:<sid>        -> the newest record's hash           so rewards are get/put by sid (Tony #25.1: XP syncs with login)

mint(sid, name=None) -> token        128-bit base64url (22 chars); a 2nd mint for the same sid carries its rewards over,
                                     older tokens keep opening the same sid
login(token) -> sid | None           unknown or malformed token = None
get_rewards(sid) -> dict | None      None = no account for this sid
put_rewards(sid, blob) -> bool       False = no account (nothing stored for a bare sid); ValueError = not a dict / over REWARDS_MAX
KV errors (OSError, ValueError) propagate: the caller tells a store outage from an unknown token."""
import datetime
import hashlib
import json
import os
import re
import secrets
import urllib.request

# Upstash Redis REST, as serve.py (same env vars, same _kv); unset (local dev, tests) = _mem, this process only
KV = (os.environ.get("KV_REST_API_URL"), os.environ.get("KV_REST_API_TOKEN"))
_mem = {}
NAME_MAX = 40          # display name only, never a login secret
REWARDS_MAX = 4096     # bytes of compact JSON: a small XP/streak blob, never a log
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{22,64}")   # checked before hashing: junk never reaches the store
SID_RE = re.compile(r"[0-9a-f]{32}")             # serve.new_sid's shape


def _kv(*cmd):
    req = urllib.request.Request(KV[0], data=json.dumps(cmd).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + KV[1], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r).get("result")


def _get(k):
    return _kv("GET", k) if all(KV) else _mem.get(k)


def _set(k, v):
    if all(KV):
        _kv("SET", k, v)
    else:
        _mem[k] = v


def _key(token):
    return "acct:" + hashlib.sha256(token.encode()).hexdigest()


def _rec(sid):
    """(record key, record) of sid's newest account, or (None, None)"""
    h = _get("acct:sid:" + sid) if isinstance(sid, str) and SID_RE.fullmatch(sid) else None
    raw = h and _get("acct:" + h)
    return ("acct:" + h, json.loads(raw)) if raw else (None, None)


def mint(sid, name=None):
    if not (isinstance(sid, str) and SID_RE.fullmatch(sid)):
        raise ValueError("bad sid")
    token = secrets.token_urlsafe(16)
    _, old = _rec(sid)
    k = _key(token)
    _set(k, json.dumps({"sid": sid, "name": (name or "").strip()[:NAME_MAX], "at": datetime.date.today().isoformat(),
                        "rewards": (old or {}).get("rewards", {})}, separators=(",", ":")))
    _set("acct:sid:" + sid, k[len("acct:"):])
    return token


def login(token):
    if not (isinstance(token, str) and TOKEN_RE.fullmatch(token)):
        return None
    raw = _get(_key(token))
    return json.loads(raw)["sid"] if raw else None


def get_rewards(sid):
    _, rec = _rec(sid)
    return rec.get("rewards", {}) if rec else None


def put_rewards(sid, blob):
    if not isinstance(blob, dict):
        raise ValueError("rewards: not an object")
    s = json.dumps(blob, separators=(",", ":"), allow_nan=False)   # NaN is not JSON: ValueError
    if len(s.encode()) > REWARDS_MAX:
        raise ValueError("rewards: over %d bytes" % REWARDS_MAX)
    k, rec = _rec(sid)
    if not rec:
        return False
    rec["rewards"] = blob
    _set(k, json.dumps(rec, separators=(",", ":")))
    return True
