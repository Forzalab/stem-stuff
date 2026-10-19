#!/usr/bin/env python3
"""Anthropic spend -> one KV key. Runs in GitHub Actions only (.github/workflows/spend.yml), so the Admin API key never
reaches the Vercel app, which takes public requests.

Reads the Admin API cost report (GET /v1/organizations/cost_report, daily buckets, amounts in USD cents as decimal
strings; docs: platform.claude.com/docs/en/manage-claude/usage-cost-api), sums spend for the current UTC calendar month
and since SPEND_SINCE (YYYY-MM-DD), and writes to Upstash/Vercel KV over its REST API (same scheme as serve.py `_kv`):

  stem:anthropic:spend      {"cents_month":N, "cents_since":N, "since":"YYYY-MM-DD", "at":"<ISO>", "ok":true}
  stem:anthropic:spend_err  {"ok":false, "err":"<status/type>", "at":"<ISO>"}   (only while failing; deleted on success)

A failure never touches the good key, so the last good cents stay readable. The app estimates the balance as
PREPAID_CENTS - cents_since.

env: ANTHROPIC_ADMIN_KEY, KV_REST_API_URL, KV_REST_API_TOKEN, SPEND_SINCE (optional; default = start of this month)
usage: tools/anthropic_spend.py [--dry-run] [--since YYYY-MM-DD]
  --dry-run  print the JSON instead of writing KV (KV vars not needed)
Exit 0 = good value written (or printed); 1 = failed (err key written when KV is configured); 2 = bad config.
Stdlib only. Never prints the key or the KV token.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from decimal import ROUND_HALF_UP, Decimal

API = "https://api.anthropic.com/v1/organizations/cost_report"
KEY = "stem:anthropic:spend"
ERR_KEY = "stem:anthropic:spend_err"
TIMEOUT = 20
MAX_PAGES = 200          # 31 daily buckets a page: ~17 years. A loop guard, not a real limit.
UA = "stem-stuff-spend/1.0 (https://github.com/Forzalab/stem-stuff)"


class SpendError(Exception):
    """err is short and safe to store/print: an HTTP status and error type, never a body or a header."""
    def __init__(self, err):
        super().__init__(err)
        self.err = err


def _http(method, url, headers, body=None, timeout=TIMEOUT):
    """One request -> (status, parsed JSON). The only network call; tests replace it."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.load(r)


def _call(method, url, headers, body=None, what="api"):
    try:
        return _http(method, url, headers, body)
    except urllib.error.HTTPError as e:
        etype = ""
        try:
            etype = json.loads(e.read().decode("utf-8", "replace")).get("error", {}).get("type", "")
        except Exception:
            pass
        raise SpendError(f"{what}_http_{e.code}" + (f":{etype}" if isinstance(etype, str) and etype.isidentifier() else ""))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SpendError(f"{what}_net:{type(e).__name__}")
    except ValueError:
        raise SpendError(f"{what}_bad_json")


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_buckets(admin_key, start, end):
    """Every daily bucket in [start, end), following next_page until has_more is false."""
    headers = {"x-api-key": admin_key, "anthropic-version": "2023-06-01", "User-Agent": UA}
    params = {"starting_at": _iso(start), "ending_at": _iso(end), "bucket_width": "1d", "limit": "31"}
    out = []
    for _ in range(MAX_PAGES):
        status, doc = _call("GET", API + "?" + urllib.parse.urlencode(params), headers)
        if status != 200 or not isinstance(doc, dict) or not isinstance(doc.get("data"), list):
            raise SpendError(f"api_bad_response_{status}")
        out.extend(doc["data"])
        if not doc.get("has_more"):
            return out
        if not doc.get("next_page"):
            raise SpendError("api_bad_page")
        params["page"] = doc["next_page"]
    raise SpendError("api_too_many_pages")


def _day(s):
    return dt.date.fromisoformat(str(s)[:10])


def sum_cents(buckets, month_start, since):
    """(cents_month, cents_since) as whole cents. Amounts are decimal strings in cents; non-USD is an error."""
    month, total = Decimal(0), Decimal(0)
    for b in buckets:
        try:
            day = _day(b["starting_at"])
            amt = Decimal(0)
            for r in b.get("results") or []:
                if r.get("currency", "USD") != "USD":
                    raise SpendError("api_currency")
                amt += Decimal(str(r["amount"]))
        except SpendError:
            raise
        except Exception:
            raise SpendError("api_bad_bucket")
        if day >= since:
            total += amt
        if day >= month_start:
            month += amt
    q = lambda d: int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP))  # noqa: E731
    return q(month), q(total)


def compute(admin_key, since, now):
    month_start = now.date().replace(day=1)
    start = min(since, month_start)
    end = dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), dt.timezone.utc)   # include today's bucket
    buckets = fetch_buckets(admin_key, dt.datetime.combine(start, dt.time(), dt.timezone.utc), end)
    cm, cs = sum_cents(buckets, month_start, since)
    return {"cents_month": cm, "cents_since": cs, "since": since.isoformat(), "at": _iso(now), "ok": True}


def kv(url, token, *cmd):
    status, doc = _call("POST", url, {"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                        json.dumps(cmd).encode(), what="kv")
    if status != 200 or not isinstance(doc, dict) or "error" in doc:
        raise SpendError(f"kv_bad_response_{status}")
    return doc.get("result")


def main(argv=None, env=None, now=None):
    env = os.environ if env is None else env
    ap = argparse.ArgumentParser(description="Anthropic spend -> KV key " + KEY)
    ap.add_argument("--dry-run", action="store_true", help="print the JSON instead of writing KV")
    ap.add_argument("--since", help="YYYY-MM-DD (default: $SPEND_SINCE, else the 1st of this month)")
    a = ap.parse_args(argv)
    now = now or dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

    admin_key = env.get("ANTHROPIC_ADMIN_KEY", "")
    kv_url, kv_token = env.get("KV_REST_API_URL", ""), env.get("KV_REST_API_TOKEN", "")
    since_s = (a.since or env.get("SPEND_SINCE") or "").strip()
    try:
        since = dt.date.fromisoformat(since_s) if since_s else now.date().replace(day=1)
    except ValueError:
        print("spend: SPEND_SINCE must be YYYY-MM-DD", file=sys.stderr)
        return 2
    if since > now.date():
        print("spend: SPEND_SINCE is in the future", file=sys.stderr)
        return 2
    if not admin_key:
        print("spend: ANTHROPIC_ADMIN_KEY is not set", file=sys.stderr)
        return 2
    if not a.dry_run and not (kv_url and kv_token):
        print("spend: KV_REST_API_URL / KV_REST_API_TOKEN not set (use --dry-run to print only)", file=sys.stderr)
        return 2

    try:
        val = compute(admin_key, since, now)
    except SpendError as e:
        err = {"ok": False, "err": e.err, "at": _iso(now)}
        print("spend: failed: " + e.err, file=sys.stderr)
        if a.dry_run:
            print(json.dumps(err))
        else:
            try:
                kv(kv_url, kv_token, "SET", ERR_KEY, json.dumps(err))   # the good key is left as it was
            except SpendError as e2:
                print("spend: could not write err key: " + e2.err, file=sys.stderr)
        return 1

    if a.dry_run:
        print(json.dumps(val))
        return 0
    try:
        kv(kv_url, kv_token, "SET", KEY, json.dumps(val))
        kv(kv_url, kv_token, "DEL", ERR_KEY)
    except SpendError as e:
        print("spend: KV write failed: " + e.err, file=sys.stderr)
        return 1
    print(f"spend: ok month={val['cents_month']}c since {val['since']}={val['cents_since']}c")
    return 0


if __name__ == "__main__":
    sys.exit(main())
