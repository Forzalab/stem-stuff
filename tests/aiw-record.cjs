// Regenerates tests/fixtures/aiw/corpus.json.gz: runs upstream's detector/patterns.test.js (not vendored; a checkout of
// conorbronsdon/avoid-ai-writing at the commit in vendor/avoid-ai-writing/NOTICE.txt) with analyzeText wrapped so every
// distinct (text, options) it passes is recorded. Usage:
//   node tests/aiw-record.cjs <checkout>/detector /tmp/rec.json && gzip -n -c /tmp/rec.json > tests/fixtures/aiw/corpus.json.gz
const path = require('path');
const fs = require('fs');
const dir = process.argv[2];
const det = require(path.join(dir, 'patterns.js'));
const orig = det.analyzeText;
const seen = new Map();
det.analyzeText = function (text, options) {
  if (typeof text === 'string') {
    const o = options && typeof options === 'object' ? { contextMode: options.contextMode, sourceMode: options.sourceMode } : {};
    const key = JSON.stringify([text, o]);
    if (!seen.has(key)) seen.set(key, [text, o]);
  }
  return orig.apply(this, arguments);
};
process.on('exit', () => {
  fs.writeFileSync(process.argv[3], JSON.stringify([...seen.values()]));
  console.error('recorded', seen.size);
});
require(path.join(dir, 'patterns.test.js'));
