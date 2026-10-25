// Tag lint (CI plan PR 3, CEO-arch-2026-10-25 bullet 8 / idea 12-13): every schedulable .pw unit has a tags() line in run-all.sh
// (next to weight()), from a closed vocabulary, and the line does not lie about time. No browser, < 1 s. Runs in `npm test`
// (lint-tags.test.mjs) and alone:   node tests/lint-tags.mjs     (exit 1 + one line per problem, naming the spec)
// Rules:
//   - unit = a tests/<spec>.pw.mjs without parts, or each of its parts (PART_ENV in run-all.sh: ux-flows@phone ...), as weight() schedules them.
//     Every unit has exactly one tags() line; a line for anything else (no such spec, a spec that has parts, an undeclared part) = FAIL.
//   - exactly one engine tag (@engine | @layout | @logic), exactly one time tag (@real-time | @fast-time), at most one
//     @quarantine:<issue>:<YYYY-MM-DD> (issue = #123, 123 or an http(s) URL; date >= today and <= today + 14 days). Anything else = unknown tag.
//   - @fast-time only if the spec file installs the Playwright clock (clock.install) today; the real 2 s gate specs (REAL_GATE) are @real-time.
//   - a spec that references the SPAM_MS test knob (KNOB_RE) must be on KNOB_ALLOW (empty: the knob does not exist yet).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ENGINE = ["@engine", "@layout", "@logic"];
export const TIME = ["@real-time", "@fast-time"];
export const REAL_GATE = ["queue-walk", "redo-note", "next-reset", "overscroll"];   // Tony, round 2: the real SPAM_MS gate runs every run
export const KNOB_ALLOW = [];   // specs allowed to use the SPAM_MS test knob (only where page.clock fights an animation sampler; Tony, round 2)
export const KNOB_RE = /[?&]spam=|\bwindow\.__test\b|\b__stemSpam\b/;   // the knob as the plan sketches it (`?spam=0` or `window.__test`); update when it lands
export const QUARANTINE_DAYS = 14;
const CLOCK_RE = /\bclock\.install\s*\(/;
const DAY = 86400000;

// the body of a bash function `name() { ... }` (up to the first line that is just "}")
const fnBody = (src, name) => src.match(new RegExp(`^${name}\\(\\)\\s*\\{\\n([\\s\\S]*?)^\\}`, "m"))?.[1];

// parse run-all.sh: the tags() table ({name: [tags]}, duplicates listed) and the PART_ENV part names
export function parseRunAll(src) {
  const parts = [...(src.match(/^declare -A PART_ENV=\(\n([\s\S]*?)^\)/m)?.[1] ?? "").matchAll(/^\s*\[([^\]]+)\]=/gm)].map(m => m[1]);
  const body = fnBody(src, "tags");
  const tags = new Map(), dup = [];
  if (body !== undefined) {
    for (const line of body.split("\n")) {
      const code = line.replace(/\s#.*$/, "");
      for (const m of code.matchAll(/([^\s;()][^;()]*?)\)\s*echo\s+"([^"]*)"\s*;;/g)) {
        for (const n of m[1].split("|").map(s => s.trim())) {
          if (n === "*") continue;
          if (tags.has(n)) dup.push(n);
          tags.set(n, m[2].split(/\s+/).filter(Boolean));
        }
      }
    }
  }
  return { parts, tags: body === undefined ? null : tags, dup };
}

const ymd = d => d.toISOString().slice(0, 10);

// lint({ runAll, specs, today }): runAll = run-all.sh text, specs = {name: file text} for every tests/*.pw.mjs, today = "YYYY-MM-DD".
// Returns the problems (strings, each naming the spec); [] = green.
export function lint({ runAll, specs, today = ymd(new Date()) }) {
  const errs = [];
  const { parts, tags, dup } = parseRunAll(runAll);
  if (!tags) return ["run-all.sh: no tags() table (add one next to weight(): name) echo \"@<engine> @<time>\" ;;)"];
  const names = Object.keys(specs).sort();
  const partsOf = n => parts.filter(p => p.split("@")[0] === n).sort();
  const units = names.flatMap(n => partsOf(n).length ? partsOf(n) : [n]);
  for (const p of parts) if (!(p.split("@")[0] in specs)) errs.push(`${p}: part of a spec that does not exist (tests/${p.split("@")[0]}.pw.mjs)`);
  for (const n of new Set(dup)) errs.push(`${n}: more than one tags() line`);
  for (const n of tags.keys()) {
    if (units.includes(n)) continue;
    if (n in specs) errs.push(`${n}: has parts (${partsOf(n).join(" ")}): tag each part, not the whole spec`);
    else errs.push(`${n}: tags() line for a spec that does not exist (no tests/${n.split("@")[0]}.pw.mjs${n.includes("@") ? " part " + n : ""})`);
  }
  const t0 = Date.parse(today + "T00:00:00Z");
  for (const u of units) {
    const t = tags.get(u), spec = u.split("@")[0];
    if (!t) { errs.push(`${u}: no tags() line in run-all.sh (want one of ${ENGINE.join("|")} and one of ${TIME.join("|")})`); continue; }
    const eng = t.filter(x => ENGINE.includes(x)), tim = t.filter(x => TIME.includes(x)), q = t.filter(x => x.startsWith("@quarantine"));
    for (const x of t) if (!ENGINE.includes(x) && !TIME.includes(x) && !x.startsWith("@quarantine")) errs.push(`${u}: unknown tag ${x} (known: ${[...ENGINE, ...TIME, "@quarantine:<issue>:<YYYY-MM-DD>"].join(" ")})`);
    if (eng.length !== 1) errs.push(`${u}: wants exactly one engine tag (${ENGINE.join("|")}), has ${eng.length ? eng.join(" ") : "none"}`);
    if (tim.length !== 1) errs.push(`${u}: wants exactly one time tag (${TIME.join("|")}), has ${tim.length ? tim.join(" ") : "none"}`);
    if (q.length > 1) errs.push(`${u}: more than one @quarantine tag`);
    for (const x of q) {
      const m = x.match(/^@quarantine:(.+):(\d{4}-\d{2}-\d{2})$/);
      if (!m) { errs.push(`${u}: bad ${x} (want @quarantine:<#issue or URL>:<YYYY-MM-DD>)`); continue; }
      if (!/^(#?\d+|https?:\/\/\S+)$/.test(m[1])) errs.push(`${u}: ${x} has no issue (want #123 or an http(s) URL)`);
      const d = Date.parse(m[2] + "T00:00:00Z");
      if (Number.isNaN(d) || ymd(new Date(d)) !== m[2]) errs.push(`${u}: ${x}: ${m[2]} is not a date`);
      else if (d < t0) errs.push(`${u}: ${x} expired (${m[2]} < today ${today}): fix the spec or re-date with a reason`);
      else if (d > t0 + QUARANTINE_DAYS * DAY) errs.push(`${u}: ${x} expires more than ${QUARANTINE_DAYS} days from today ${today}`);
    }
    if (tim.includes("@fast-time") && !CLOCK_RE.test(specs[spec])) errs.push(`${u}: tagged @fast-time but tests/${spec}.pw.mjs never installs page.clock (clock.install): the tag is a lie until it does`);
    if (REAL_GATE.includes(spec) && !tim.includes("@real-time")) errs.push(`${u}: is a real 2 s gate spec (${REAL_GATE.join(", ")}): must be @real-time`);
  }
  for (const n of names) if (KNOB_RE.test(specs[n]) && !KNOB_ALLOW.includes(n)) errs.push(`${n}: uses the SPAM_MS test knob (${KNOB_RE.source}) but is not on KNOB_ALLOW in tests/lint-tags.mjs`);
  return errs;
}

// the real repo: tests/run-all.sh + every tests/*.pw.mjs
export function lintRepo(opts = {}) {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const specs = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith(".pw.mjs")).sort()
    .map(f => [f.slice(0, -".pw.mjs".length), readFileSync(dir + f, "utf8")]));
  return lint({ runAll: readFileSync(dir + "run-all.sh", "utf8"), specs, ...opts });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errs = lintRepo();
  for (const e of errs) console.log("FAIL lint-tags: " + e);
  if (!errs.length) console.log("ok   lint-tags");
  process.exit(errs.length ? 1 : 0);
}
