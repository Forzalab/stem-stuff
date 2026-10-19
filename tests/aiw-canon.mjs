// The vendored avoid-ai-writing detector (vendor/avoid-ai-writing/patterns.js, MIT, @013d1db) as a stdin/stdout filter for the
// differential test of the Python port (tests/test_aiw.py): reads a JSON list of [text, options] pairs and prints the list of
// AIDetector.analyzeText results in the same order. `--time N` instead prints the mean ms per call over N passes.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const AIDetector = createRequire(import.meta.url)("../vendor/avoid-ai-writing/patterns.js");
const cases = JSON.parse(readFileSync(0, "utf8"));
const t = process.argv.indexOf("--time");
if (t !== -1) {
  const n = Number(process.argv[t + 1]) || 1;
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < n; k += 1) for (const [text, options] of cases) AIDetector.analyzeText(text, options);
  console.log(JSON.stringify({ msPerCall: Number(process.hrtime.bigint() - t0) / 1e6 / (n * cases.length) }));
} else {
  console.log(JSON.stringify(cases.map(([text, options]) => AIDetector.analyzeText(text, options))));
}
