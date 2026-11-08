# Invariants
Rules that hold for a whole set, not one example. Scope ALL = test loops over every member; ONE = checked on one instance only.
Status: E = enforced, P = partly, N = not enforced. Read before editing the files named; paste each "Check before DONE" output.
I1 unknown-file-pipe [ALL, E]
Rule: an unmapped file never selects fewer tests than its whole pipe (layout = all .pw units, logic = unittest + npm).
Why: an unknown file once selected nothing, so a break shipped untested.
Test: tests/handmaps.test.mjs ("an unknown layout path...", "an unknown logic path...")
Check before DONE: node --test tests/handmaps.test.mjs
I2 paths-mirror [ALL, E]
Rule: tests/paths.mjs exports equal tests/paths.py exports.
Why: the two drifted once; one side silently used a stale path.
Test: tests/handmaps.test.mjs ("paths.mjs and paths.py export the same layout")
Check before DONE: node --test tests/handmaps.test.mjs
I3 import-edge-inherits [ONE, E]
Rule: a module imported by serve.py gets all of serve.py's units.
Why: an imported python module changed with no serve.py tests run.
Test: tests/handmaps.test.mjs ("a root module imported by serve.py...", expr.py only)
Check before DONE: node --test tests/handmaps.test.mjs
I4 boot-files-all-layout [ONE, P]
Rule: index.html and sw.js select ALL layout units (hand.tsv seed); every index.html asset selects >=1 .pw unit.
Why: fx.js (loaded by index.html) once selected no layout unit.
Test: tests/invariants.slow.mjs "index.html asset -> affected (ALL)" + tests/handmaps/hand.tsv
Check before DONE: node --test tests/invariants.slow.mjs tests/handmaps.test.mjs
I5 sw-precache [ALL, E]
Rule: every client .js/.mjs that index.html loads (script src, modulepreload) or those import, recursively, is in sw.js BASE.
Why: offline start breaks for a file missing from BASE (login.js, mycluck.mjs misses).
Test: tests/invariants.slow.mjs "I5" (all files) + tests/rails/side-artifacts.mjs (new files vs a base)
Check before DONE: node tests/rails/side-artifacts.mjs; node --test tests/invariants.slow.mjs
I6 run-all-flags [ALL, P]
Rule: old run-all.sh flags keep their behavior: --list, --plan B L, SHARD=N/M (CI: tests.yml uses --plan and --quick).
Why: a flag rewrite once broke callers and nothing went red. --quick, SPECS, --fast: shape not tested.
Test: tests/invariants.slow.mjs "I6" + tests/run-all.test.mjs (FAIL_RE, SIGTERM)
Check before DONE: node --test tests/invariants.slow.mjs tests/run-all.test.mjs
I7 schedule-once [ALL, E]
Rule: every .pw spec has a weight() line and is scheduled exactly once across the shards.
Why: a spec with no weight line or a double deal silently skips or repeats in CI.
Test: tests/run-all.sh ("schedule check" block, runs in every --list/--plan)
Check before DONE: bash tests/run-all.sh --list >/dev/null
I8 tags-do-not-lie [ALL, E]
Rule: every .pw unit is tagged; tags match the code (@fast-time needs page.clock).
Why: a wrong time tag makes a spec flaky or slow in the wrong lane.
Test: tests/lint-tags.test.mjs ("the real repo: every unit tagged...")
Check before DONE: node --test tests/lint-tags.test.mjs
I9 route-url-agree [ONE, N]
Rule: every path the client fetches is a route serve.py serves.
Why: a python route and a JS URL are a hidden edge no tool shows.
Test: none yet (tests/invariants.slow.mjs is the place to add it)
Check before DONE: say "I9 not enforced" in the DONE note
I10 mirrored-constants [ONE, E]
Rule: mirrored constants/logic agree (serve.py PROOF_BUDGET = client 25 s; mode.mjs mirrors serve.py hidden()/view()).
Why: a mirror changed on one side only; each instance has its own test.
Test: tests/test_proof.py + tests/mode.test.mjs + tests/flight.test.mjs
Check before DONE: node --test tests/mode.test.mjs tests/flight.test.mjs; python3 -m unittest tests.test_proof
I11 no-student-text [ALL, E]
Rule: no student text is ever a field of the incident record.
Why: privacy; the report leaves the device.
Test: tests/incident.test.mjs
Check before DONE: node --test tests/incident.test.mjs
I12 figures-pure [ALL, E]
Rule: figcheck never mutates its input; kit invariants hold across a parameter grid.
Why: a mutated figure spec changes what the student sees on a re-render.
Test: tests/figcheck.test.mjs + tests/scene.test.mjs
Check before DONE: node --test tests/figcheck.test.mjs tests/scene.test.mjs
