# Security: grading, anti-brute-force, incidents

Goal: McKay can't get answers by guessing, scripting, or reading files. This is a deterrent for one student on a self-hosted Python server, not a bank. Section 7 lists what it can't stop.

## 1. What moves server-side

- `p/<CODE>.json` stays public (fetched when the code is typed) but **has no answer** (see `SCHEMA-SPLIT.md`).
- `k/<CODE>.json` holds answer, tol, points, MC correct id, hints, misconception feedback. Never served.
- `serve.py` serves an **allowlist** (`index.html`, `p/*.json`, static assets), not a blocklist like v1. Everything else is 404, including `k/`, `log/`, `serve.py`.
- Endpoints: `POST /check` (JSON in/out; hints come back with wrong verdicts, no `/hint`, shapes in `MC.md` §7). Responses never include the answer, and take the same time whether right or wrong.

## 2. Who is this? (cookie, then IP, then fingerprint)

Every request carries up to three ids. The server stores all three and picks the **user key** in this order:

| order | id | how | notes |
|---|---|---|---|
| 1 | cookie `sid` | random 128-bit, set by server on first visit, `HttpOnly; SameSite=Lax; Max-Age=1y`, HMAC-signed | the normal case |
| 2 | IP | `REMOTE_ADDR` (or `X-Forwarded-For` only if Tony's host.sh sits behind a proxy he controls) | shared at school/home NAT |
| 3 | fingerprint `fp` | client hash (SHA-256, first 16 hex) of UA, language, timezone, screen size, device pixel ratio, hardware threads, a canvas-render hash; sent as header `X-FP` | spoofable, changes with browser updates |

Written as `c:<first 8 of sid>|ip:<ip>|fp:<fp>` in logs. Matching rule: two requests are the same user if the cookie matches, **or** (no/new cookie and) IP **and** fp both match an existing record for that problem. IP alone never merges users (too many shared IPs); fp alone never merges.

## 3. Limits (not trips)

- Per problem+user: 2 attempts (MC: distinct choices; freeform: distinct values, parse errors free). Each wrong attempt returns the hint for that answer; no separate hint cap. See `MC.md` §5.
- After the limit: `verdict: "locked"`, UI says "ask Tony, code X". Locking writes an incident with `status: "locked"` so Tony can reset it the same way.

## 4. Checks that trip (the easter egg)

Any **one** of these trips for that problem+user:

| id | check | why it means brute force |
|---|---|---|
| `rate` | more than 4 `/check` in 30 s, or 20 in 10 min, per problem+user | nobody does calculus that fast |
| `evade` | a new/missing cookie arrives with IP+fp that already has tries or a lock on this problem | cleared cookies / incognito to reset tries |
| `after-lock` | `/check` keeps coming after `locked` (3 more) | scripting past the lock |
| `raw` | request without the page's per-load token `X-Page` (random, issued in `index.html`, 2 h TTL) | curl/scripts instead of the page |
| `sweep` | freeform: 3+ answers in arithmetic/geometric progression or ±1 steps | scanning numbers |
| `mc-bypass` | MC choice id not in the shown set, or a letter instead of an id | hand-crafted requests |

On trip, the server replies once:

```json
{ "verdict": "egg", "msg": "bruh :)))) good riddance. optional: ping Tony if u see this msg with the prblem code", "code": "CALC1_T6B" }
```

The UI shows the message as-is (no celebration, no sock), with the code.
After that, **no security for that problem+user**: unlimited checks, no rate limit, no further trips. Grading still works normally, the answer is still never sent. Each further wrong answer still gets its matching Cluck hint.

## 5. Incident log and reset

File: `log/incidents.jsonl`, one JSON object per line, one line per problem+user. Tony edits it by hand.

```json
{"code":"CALC1_T6B","who":"c:3f9a1c0e|ip:73.12.4.9|fp:a1b2c3d4e5f60718","status":"tripped","check":"rate","at":"2026-09-29T21:04:11Z","tries":["11.9","12.1","12.01","12.001","11.99"],"note":""}
```

- `status`: `locked` (hit the limit) or `tripped` (egg shown, security off).
- `tries`: what was submitted, for Tony's curiosity.
- Attempt counters live in `log/state.json` (server-owned, don't edit).

**Reset:** Tony deletes the line and saves. The server re-reads the file when its mtime changes; for any problem+user whose line disappeared it clears tries, hints and the trip flag in `state.json`. Next visit is a fresh start with full security. Other users/problems untouched.
Writes: append under a lock file, rewrite through a temp file + rename, so a hand edit and a server write can't interleave badly (worst case Tony's delete is re-done once; the server logs a warning if a parse fails and keeps the old copy as `incidents.jsonl.bad`).

## 6. Explanation copy vs. security

The copy payload (`copy/COPY-PAYLOAD.md`) contains tried answers and verdicts but **no ids** (no cookie, IP or fingerprint), so pasting it into a chat leaks nothing about identity.

## 7. Honest limits

- Incognito + a different network (phone hotspot) gets a new cookie, new IP and usually a new fp: looks like a new user. Undetectable here.
- Fingerprint is client-reported; a script can send any `X-FP`. It only helps catch the lazy case (cookie cleared, same browser).
- Shared IPs (school) can't identify anyone; that's why IP alone never merges users.
- Two siblings on one laptop share a fingerprint and IP: `evade` could false-trip. Cost: they see the egg. Tony deletes the line.
- MC with 5 choices and 2 tries: 40% blind-guess success per problem. Rules limit guessing, they don't remove it.
- Anyone can still ask a friend or a CAS. Out of scope.
- Everything is plain HTTP unless Tony puts TLS in front; the cookie is then sniffable on shared Wi-Fi.
