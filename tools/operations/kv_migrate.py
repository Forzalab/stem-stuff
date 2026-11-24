#!/usr/bin/env python3
"""KV-FRUGAL slice 5 part 1: one-shot migration of the old tries blob (serve.py KV_KEY) to the per-browser keys.
Prod keyspace only: no preview prefix.

  stem:tries (one JSON blob)  ->
    t:<sid>                  HASH: one field per problem entry, the same names TriesStore writes ("CODE", "CODE <part>",
                             "r<N> CODE"), plus _bank and at:<BANK> from "last", plus _gen; EXPIRE 120 days.
    turns:<sid>:<CODE>       STRING: this browser's Cluck rows for the item (the KVF-4 key), JSON; SET ... EX 14 days.
                             No `c:` field is written into the hash: Cluck rows live in their own turns keys.

Default is a DRY RUN: read the blob ONCE, print the counts, write nothing. --apply writes through the Upstash REST
/pipeline endpoint in batches and checks EVERY per-command reply (a 200 reply can still hold {"error": ...}); the first
error stops the run and exits 1. The old blob is never written or deleted, so it stays as the rollback copy. Running
--apply twice writes the same values (HSET and SET overwrite): idempotent.

Bad rows (rows the blob loader in serve.py §grading could not load) are skipped and counted, never fatal. A malformed
top-level blob (not an object, a non-int "gen", or "tries"/"last"/"cluck" that is not an object) stops with exit 1
before anything is written.

env: KV_REST_API_URL, KV_REST_API_TOKEN
usage: tools/operations/kv_migrate.py [--apply]
Exit 0 = plan printed (dry run) or every command succeeded; 1 = read/write failed; 2 = config missing.
Stdlib only. A sid is never printed whole: only its first 6 chars + "..".

Constants and the field-name rule are copied from serve.py §tries-store (importing serve.py pulls sympy and every server
package; this is a standalone ops script). TURNS_LIFETIME is KVF-4's TURNS_TTL = 14 days.
"""
import argparse
import json
import os
import sys
import urllib.request

KV_KEY = "stem:tries"                      # serve.py KV_KEY (the one blob read, never written)
TRIES_KEY = "t:"                           # serve.py TRIES_KEY (prod)
TRIES_LIFETIME = 120 * 24 * 60 * 60        # serve.py TRIES_LIFETIME: 120 days
TURNS_KEY = "turns:"                       # KVF-4
TURNS_LIFETIME = 14 * 24 * 60 * 60         # KVF-4 TURNS_TTL: 14 days
KV_TIMEOUT = 5
BATCH = 100                                # commands per /pipeline round trip


class MigrateError(Exception):
    """a short, safe-to-print reason: never a token or a whole sid"""


def mask_id(sid):
    """a sid in any printed line: first 6 chars + ".." (Tony: never print a whole sid)"""
    return str(sid)[:6] + ".."


def mask_key(key):
    """t:<sid> / turns:<sid>:<CODE> with the sid masked"""
    key = str(key)
    if key.startswith(TURNS_KEY):
        sid, _, code = key[len(TURNS_KEY):].partition(":")
        return TURNS_KEY + mask_id(sid) + ":" + code
    if key.startswith(TRIES_KEY):
        return TRIES_KEY + mask_id(key[len(TRIES_KEY):])
    return key


def redact(text, sids):
    """replace every full sid that a KV error might echo with its masked form"""
    for sid in sorted(sids, key=len, reverse=True):
        if sid:
            text = text.replace(sid, mask_id(sid))
    return text


def base_sid(sid):
    """a redo round's sid (sid:r<N>) shares its browser's base hash (serve.py _base_sid)"""
    head, sep, tail = str(sid).rpartition(":r")
    return head if sep and tail.isdigit() else str(sid)


def field_name(key):
    """(sid, code[, part]) -> the hash field, serve.py _tries_field: "CODE" / "CODE 0"; a round sid:r2 -> "r2 CODE" """
    base = base_sid(key[0])
    tag = key[0][len(base) + 1:]
    return (f"{tag} " if tag else "") + " ".join(map(str, key[1:]))


def val_of(value):
    """a hash value as TriesStore.save writes it: a str as is, anything else as compact JSON"""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def key_of(raw):
    """"sid CODE" / "sid CODE <part>" -> (sid, code[, part]); ValueError for a row the loader cannot load.
    A 4+-part key is bad too: the blob loader would silently truncate it, and no reader would ever build its field."""
    if not isinstance(raw, str):
        raise ValueError("key is not a string")
    bits = raw.split(" ")
    if len(bits) not in (2, 3):
        raise ValueError("key is not 'sid CODE' or 'sid CODE part'")
    if not bits[0] or not bits[1]:
        raise ValueError("empty sid or code")
    if len(bits) == 3:
        try:
            int(bits[2])
        except ValueError:
            raise ValueError("part is not an int")
    return tuple(bits)


def entry_of(value):
    """the blob loader's row check + normalization: {wrong: [...], done: bool, gen: int}"""
    if not isinstance(value, dict):
        raise ValueError("entry is not an object")
    wrong = value.get("wrong", [])
    if not isinstance(wrong, list):
        raise ValueError("wrong is not a list")
    try:
        gen = int(value.get("gen", 0))
    except (TypeError, ValueError):
        raise ValueError("gen is not an int")
    return {"wrong": wrong, "done": bool(value.get("done")), "gen": gen}


def row_ok(row):
    """a Cluck turn row the blob loader keeps: [n, reveal, xyz, pick] or the 5-row locked form"""
    return isinstance(row, list) and len(row) in (4, 5) and isinstance(row[0], int) and isinstance(row[2], str)


def build_plan(blob, blob_bytes=0):
    """blob -> {hashes, turns, bad, fields, commands, plan_bytes}; Bad rows are counted, never raised."""
    try:
        gen = int(blob.get("gen", 0))
    except (TypeError, ValueError):
        raise MigrateError("blob gen is not an int")
    tries = blob.get("tries") or {}
    last = blob.get("last") or {}
    cluck = blob.get("cluck") or {}
    for name, val in (("tries", tries), ("last", last), ("cluck", cluck)):
        if not isinstance(val, dict):
            raise MigrateError(f"blob {name} is not an object")

    hashes, turns, bad = {}, {}, 0
    for raw, value in tries.items():
        try:
            key, entry = key_of(raw), entry_of(value)
        except ValueError:
            bad += 1
            continue
        h = hashes.setdefault(base_sid(key[0]), {"fields": {}, "entry_gen": 0})
        h["fields"][field_name(key)] = entry
        h["entry_gen"] = max(h["entry_gen"], entry["gen"])

    for sid, place in last.items():
        if not isinstance(sid, str) or not sid or not isinstance(place, dict) or not isinstance(place.get("at"), dict):
            bad += 1
            continue
        h = hashes.setdefault(base_sid(sid), {"fields": {}, "entry_gen": 0})
        bank = place.get("bank")
        if isinstance(bank, str):
            if bank:
                h["fields"]["_bank"] = bank
        elif bank is not None:
            bad += 1
        for name, code in place["at"].items():
            if isinstance(name, str) and name and isinstance(code, str):
                h["fields"]["at:" + name] = code
            else:
                bad += 1

    for raw, rows in cluck.items():
        if not isinstance(raw, str):
            bad += 1
            continue
        bits = raw.split(" ")
        if len(bits) != 2 or not bits[0] or not bits[1] or not isinstance(rows, list):
            bad += 1
            continue
        good = [row for row in rows if row_ok(row)]
        bad += len(rows) - len(good)
        if good:
            turns[(base_sid(bits[0]), bits[1])] = good

    fields = 0
    for h in hashes.values():
        h["gen"] = max(gen, h["entry_gen"])          # _gen floor: never below a cached client's gen
        fields += sum(1 for name in h["fields"] if not name.startswith(("_", "at:")))
    plan = {"hashes": hashes, "turns": turns, "bad": bad, "fields": fields, "blob_bytes": blob_bytes}
    units = command_units(plan)
    plan["commands"] = sum(len(unit) for unit in units)
    plan["plan_bytes"] = sum(len(str(part).encode("utf-8")) for unit in units for cmd in unit for part in cmd)
    return plan


def command_units(plan):
    """the writes as units that must not split: [HSET, EXPIRE] for a hash, [SET ... EX] for a turn key"""
    units = []
    for base in sorted(plan["hashes"]):
        h = plan["hashes"][base]
        key = TRIES_KEY + base
        hset = ["HSET", key]
        for name in sorted(h["fields"]):
            hset += [name, val_of(h["fields"][name])]
        hset += ["_gen", val_of(h["gen"])]
        units.append([hset, ["EXPIRE", key, TRIES_LIFETIME]])
    for base, code in sorted(plan["turns"]):
        rows = json.dumps(plan["turns"][(base, code)], ensure_ascii=False, separators=(",", ":"))
        units.append([["SET", f"{TURNS_KEY}{base}:{code}", rows, "EX", TURNS_LIFETIME]])
    return units


def batches(units, size=BATCH):
    """units -> command lists of at most `size` commands (one unit may exceed it, never split)"""
    cur = []
    for unit in units:
        if cur and len(cur) + len(unit) > size:
            yield cur
            cur = []
        cur.extend(unit)
    if cur:
        yield cur


def _http(url, token, body, timeout=KV_TIMEOUT):
    """one POST of a Redis command or a pipeline list -> (status, parsed JSON). The only network call; tests replace it."""
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.load(r)


def read_blob(url, token):
    """the ONE read: GET KV_KEY -> (blob dict, bytes). Never writes the blob."""
    try:
        status, doc = _http(url, token, ["GET", KV_KEY])
    except (OSError, ValueError) as e:
        raise MigrateError(f"blob read failed: {type(e).__name__}")
    if status != 200 or not isinstance(doc, dict) or doc.get("error"):
        reason = doc.get("error") if isinstance(doc, dict) else None
        raise MigrateError("blob read failed: " + str(reason or f"HTTP {status}"))
    raw = doc.get("result")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    if not raw:
        raw = "{}"
    try:
        blob = json.loads(raw)
    except (TypeError, ValueError):
        raise MigrateError("blob is not JSON")
    if not isinstance(blob, dict):
        raise MigrateError("blob is not a JSON object")
    return blob, len(raw.encode("utf-8"))


def pipeline(url, token, cmds, sids):
    """one /pipeline round trip; check every per-command result, raise on the first error"""
    try:
        status, doc = _http(url.rstrip("/") + "/pipeline", token, cmds)
    except (OSError, ValueError) as e:
        raise MigrateError(f"pipeline failed: {type(e).__name__}")
    if status != 200:
        raise MigrateError(f"pipeline failed: HTTP {status}")
    if isinstance(doc, dict) and doc.get("error"):
        raise MigrateError("pipeline failed: " + redact(str(doc["error"]), sids))
    if not isinstance(doc, list) or len(doc) != len(cmds):
        raise MigrateError("pipeline failed: bad reply shape")
    for i, (item, cmd) in enumerate(zip(doc, cmds)):
        if not isinstance(item, dict):
            raise MigrateError(f"pipeline failed: command {i} reply is not an object")
        if item.get("error"):
            raise MigrateError(f"pipeline failed: command {i} ({cmd[0]} {mask_key(cmd[1])}): "
                               + redact(str(item["error"]), sids))


def write_plan(url, token, plan):
    """every key gets its expiry; stop at the first failed command; returns the commands sent"""
    units = command_units(plan)
    sids = set(plan["hashes"]) | {base for base, _ in plan["turns"]}
    sent = 0
    for batch in batches(units, BATCH):
        pipeline(url, token, batch, sids)
        sent += len(batch)
    return sent


def summary(plan):
    return (f"browsers={len(plan['hashes'])} fields={plan['fields']} turns={len(plan['turns'])} "
            f"blob_bytes={plan['blob_bytes']} plan_bytes={plan['plan_bytes']} bad={plan['bad']}")


def main(argv=None, env=None):
    ap = argparse.ArgumentParser(description="Migrate the tries blob to per-browser keys (dry run by default).")
    ap.add_argument("--apply", action="store_true", help="write through Upstash /pipeline; default is a dry run")
    a = ap.parse_args(argv)
    env = os.environ if env is None else env
    url = str(env.get("KV_REST_API_URL") or "").strip()
    token = str(env.get("KV_REST_API_TOKEN") or "").strip()
    if not url or not token:
        print("kv_migrate: KV_REST_API_URL / KV_REST_API_TOKEN not set", file=sys.stderr)
        return 2
    try:
        blob, blob_bytes = read_blob(url, token)
        plan = build_plan(blob, blob_bytes)
    except MigrateError as e:
        print("kv_migrate: " + str(e), file=sys.stderr)
        return 1
    print("kv_migrate: " + summary(plan))
    if not a.apply:
        print("kv_migrate: DRY RUN, nothing written (pass --apply)")
        return 0
    try:
        sent = write_plan(url, token, plan)
    except MigrateError as e:
        print("kv_migrate: " + str(e), file=sys.stderr)
        return 1
    print(f"kv_migrate: applied {sent} command(s) to {len(plan['hashes'])} browser(s), {len(plan['turns'])} turn key(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
