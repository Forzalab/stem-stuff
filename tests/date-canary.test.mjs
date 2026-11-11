// Real-date canary (ticket 03): the frozen STEM_TODAY pin makes specs deterministic, but the code-held
// expiry dates still pass for real. This spec ignores STEM_TODAY: "today" is the real Pacific date.
// CANARY_TODAY=YYYY-MM-DD overrides it (the red demo sets a date past an expiry).
// SUNSET (serve.py:218) is retired and deliberately not listed (the orc files the retire bug).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const todayPT = () => {
  const p = Object.fromEntries(PT.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const today = () => {
  const pinned = (process.env.CANARY_TODAY || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(pinned) ? pinned : todayPT();
};

// Each constant is read from its source file at test time (CANARY_ROOT overrides the repo root, for the scratch-copy proof).
// A source holds either a UTC instant (-> Pacific date) or a Pacific wall-clock datetime (-> its date as is).
const ROOT = process.env.CANARY_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// the one cram flag (calc/cram.json): off means no cram date can fire, so every source below is green on any calendar
const CRAM_ENABLED = (() => {
  try { return JSON.parse(readFileSync(path.join(ROOT, "client/calc/cram.json"), "utf8")).enabled !== false; }
  catch (e) { throw new Error(`calc/cram.json: cannot read the cram flag (${e.message})`); }
})();
// the instant is an exclusive bound (Date.now() < X): the last valid moment is X-1ms
const utcToPT = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`bad instant ${iso}`);
  const p = Object.fromEntries(PT.formatToParts(new Date(t - 1)).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const ptDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const SOURCES = [
  ["server/http_server/serve.py", 3534, /^CRAM_UNTIL = datetime\.datetime\((\d+), (\d+), (\d+), \d+, \d+, tzinfo=PT\)/, (m) => ptDate(m[1], m[2], m[3])],
  ["client/calc/cram.json", 9, /"until":\s*"([^"]+)"/, (m) => utcToPT(m[1])],
  ["client/cluck/jev_nudges/peek.js", 91, /var CRAM_UNTIL = Date\.parse\("([^"]+)"\)/, (m) => utcToPT(m[1])],
  ["client/calc/coach/calc-coach.js", 13, /var EXAM_END = Date\.parse\('([^']+)'\)/, (m) => utcToPT(m[1])],
  ["client/shell/welcome/welcome-first.js", 9, /\bUNTIL = Date\.parse\("([^"]+)"\)/, (m) => utcToPT(m[1])],
];

function readExpiries() {
  return SOURCES.map(([file, line, re, toPT]) => {
    const where = `${file}:${line}`;
    let text;
    try { text = readFileSync(path.join(ROOT, file), "utf8").split("\n")[line - 1]; } catch (e) { assert.fail(`${where}: cannot read source (${e.message})`); }
    const m = re.exec(text || "");
    if (!m) assert.fail(`${where}: expiry constant not found on that line (moved? update date-canary.test.mjs): ${JSON.stringify(text)}`);
    return [where, toPT(m)];
  });
}

test("no code-held expiry date has passed in the real Pacific calendar", () => {
  if (!CRAM_ENABLED) return;                        // flag off: green regardless of the dates
  const now = today();
  const late = readExpiries().filter(([, end]) => now > end);
  assert.equal(late.length, 0, late.map(([where, end]) => `${where}: ${end} passed, renew the date or turn the flag off`).join("\n"));
});
