Changed: tests/mcclick.pw.mjs plus 7 other .pw.mjs files (blur, fab, flow, font, render, swap, ux-flows): app start-page page.goto(networkidle) -> waitUntil load + waitForSelector(#entry, #pcode attached).
Scope: only goto calls to index.html (BASE/ and BASE/#...); /try/*.html gotos and page.reload left as networkidle; no assertions, timeouts or test logic changed.
mcclick flake: 10/10 consecutive passes (node tests/mcclick.pw.mjs against serve.py, phone + desktop, 4 MC loads each).
Full suite: tests.log in this dir; the first two full runs had one flake each (npm step needed npm ci; then rewards.pw.mjs 3s timeout), third run ALL GREEN.
RUN_RC=0 (tests.log, final run).
