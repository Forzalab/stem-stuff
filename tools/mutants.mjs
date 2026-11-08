#!/usr/bin/env node
// Blind mutation gate (PROOF-AND-REMINDERS.md PART A, A3 + A4). Script only, no model.
// usage: node tools/mutants.mjs --target <file> --test "<cmd>" --k 20 [--seed N] [--trace TRACE.tsv] [--timeout s]
// exit: 0 PASS, 1 FAIL, 2 usage / real tree changed, 3 base not green 3/3 (FLAKY-BASE)
// Mutants run only inside a temp copy of the repo (git ls-files, tracked + untracked-unignored; node_modules symlinked).
// TODO (out of scope here): step 6 differential survivor triage / EQUIVALENT-LIKELY (so equivalents = 0 below),
//   step 8 red-team model call, "failing test names/guards that code" check for KILLED, per-brief must-guard lines for KILLED-WEAK.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const die = (m, c = 2) => { console.error('mutants: ' + m); process.exit(c); };
if (!args.target || !args.test) die('usage: --target <file> --test "<cmd>" --k 20 [--seed N] [--trace f] [--timeout s]');
const K = +(args.k ?? 20), TIMEOUT = +(args.timeout ?? 60) * 1000;
const SEED = args.seed !== undefined ? +args.seed >>> 0 : Math.floor(Math.random() * 2 ** 32);
const TRACE = path.resolve(args.trace ?? 'TRACE.tsv');
const git = (...a) => spawnSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const top = git('rev-parse', '--show-toplevel');
if (top.status) die('not inside a git repo');
const ROOT = fs.realpathSync(top.stdout.trim());
const REL = path.relative(ROOT, fs.realpathSync(path.resolve(args.target)));
if (REL.startsWith('..')) die('target not in repo: ' + args.target);
const status = () => git('-C', ROOT, 'status', '--porcelain').stdout.split('\n')
  .filter(l => l && !((p => TRACE === p || TRACE.startsWith(p + path.sep))(path.resolve(ROOT, l.slice(3))))).join('\n');  // ignore the trace file / its new dir
const before = status();

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ext = path.extname(REL);
const lang = { '.mjs': 'js', '.js': 'js', '.cjs': 'js', '.sh': 'sh', '.bash': 'sh', '.py': 'py' }[ext] ?? die('unsupported target type ' + ext);
const syntax = { js: p => ['node', ['--check', p]], sh: p => ['bash', ['-n', p]], py: p => ['python3', ['-m', 'py_compile', p]] }[lang];

// operators: [name, langs, fn(line) -> mutated line | null]; first matching pattern per operator
const sw = pairs => l => { for (const [re, to] of pairs) if (re.test(l)) return l.replace(re, to); return null; };
const OPS = [
  ['flip-compare', 'js py', sw([[/===/, '!=='], [/!==/, '==='], [/==/, '!='], [/!=/, '=='], [/<=/, '<'], [/>=/, '>'],
    [/(?<![<=>-])<(?![<=/])/, '<='], [/(?<![<=>-])>(?![>=])/, '>=']])],
  ['flip-compare', 'sh', sw([[/-eq\b/, '-ne'], [/-ne\b/, '-eq'], [/-lt\b/, '-ge'], [/-ge\b/, '-lt'], [/-gt\b/, '-le'], [/-le\b/, '-gt'], [/==/, '!='], [/!=/, '==']])],
  ['swap-logic', 'js sh', sw([[/&&/, '||'], [/\|\|/, '&&']])],
  ['swap-logic', 'py', sw([[/\band\b/, 'or'], [/\bor\b/, 'and']])],
  ['negate-if', 'js', l => /^\s*(\}\s*else\s+)?if\s*\(/.test(l) ? l.replace(/\bif\s*\((.*)\)(\s*\{?\s*)$/, 'if (!($1))$2') : null],
  ['negate-if', 'sh', l => /^\s*(el)?if\s+/.test(l) ? l.replace(/^(\s*(?:el)?if\s+)/, '$1! ') : null],
  ['negate-if', 'py', l => /^\s*(el)?if\s+.*:\s*$/.test(l) ? l.replace(/^(\s*(?:el)?if\s+)(.*):\s*$/, '$1not ($2):') : null],
  ['drop-stmt', 'js', l => /;\s*$/.test(l) && !/^\s*(const|let|var|function|class|import|export|return|break|continue|case|default)\b|^\s*[})\]]/.test(l) ? l.replace(/\S.*$/, ';') : null],
  ['drop-stmt', 'sh', l => /\S/.test(l) && !/(\\|\{|\(|\bthen|\bdo|;;|\||&&)\s*$|^\s*(fi|done|esac|else|elif|if|for|while|case|set|local|declare|readonly|export|return|exit)\b|^\s*[})]|\(\)/.test(l) ? l.replace(/\S.*$/, ':') : null],
  ['drop-stmt', 'py', l => /\S/.test(l) && !/[:(\[{,\\]\s*$|^\s*(def|class|import|from|return|else|elif|except|finally|try|if|for|while|with|@)\b|^\s*[)\]}@]/.test(l) ? l.replace(/\S.*$/, 'pass') : null],
  ['early-return', 'js', l => /(\bfunction\b.*\)|=>)\s*\{\s*$/.test(l) ? l + ' return undefined;' : null],
  ['early-return', 'sh', l => /^\s*(function\s+[\w:-]+|[\w:-]+\s*\(\))\s*\{\s*$/.test(l) ? l + ' exit 0;' : null],
  ['early-return', 'py', l => /^\s*def .*:\s*$/.test(l) ? l + '\n' + l.match(/^\s*/)[0] + '    return None' : null],
  ['const-01', 'js sh py', sw([[/(?<![\w.$])0(?![\w.])/, '1'], [/(?<![\w.$])1(?![\w.])/, '0']])],
  ['const-bool', 'js sh py', sw([[/\btrue\b/, 'false'], [/\bfalse\b/, 'true'], [/\bTrue\b/, 'False'], [/\bFalse\b/, 'True']])],
  ['const-inc', 'js sh py', sw([[/(?<![\w.$-])(\d+)(?![\w.])/, (_, n) => String(+n + 1)]])],
  ['const-str', 'js py', sw([[/(["'])(?=[^"'\\]+\1)[^"'\\]+\1/, '""']])],
  ['delete-arg', 'js py', sw([[/,\s*[^,()]+\)/, ')']])],
  ['delete-case', 'sh', l => /^\s*[\w*|"'.\/-]+\)\s.*;;\s*$/.test(l) ? '' : null],
].filter(o => o[1].split(' ').includes(lang));

const src = fs.readFileSync(path.join(ROOT, REL), 'utf8').split('\n');
const sites = [];
src.forEach((line, i) => {
  if (/nomutate/.test(line) || /^\s*(#|\/\/|\*|\/\*)/.test(line) || (i === 0 && line.startsWith('#!'))) return;
  for (const [name, , fn] of OPS) { const m = fn(line); if (m !== null && m !== line) sites.push({ line: i + 1, op: name, text: m }); }
});
const rnd = mulberry32(SEED);
for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }  // seeded shuffle = draw without repeat
console.log(`mutants: target=${REL} sites=${sites.length} K=${K} seed=${SEED}`);

// temp copy of the repo; the real tree is never written
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mutants-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
for (const f of git('-C', ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').stdout.split('\0').filter(Boolean)) {
  const from = path.join(ROOT, f);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
  fs.copyFileSync(from, path.join(tmp, f));
}
if (fs.existsSync(path.join(ROOT, 'node_modules')) && !fs.existsSync(path.join(tmp, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
const T = path.join(tmp, REL), orig = fs.readFileSync(T, 'utf8');
const cwd = path.join(tmp, path.relative(ROOT, fs.realpathSync(process.cwd())));

const ansi = s => s.replace(/\x1b\[[0-9;]*m/g, '');
function run() {
  const r = spawnSync('bash', ['-c', args.test], { cwd, encoding: 'utf8', timeout: TIMEOUT, killSignal: 'SIGKILL', maxBuffer: 1 << 26 });
  const out = ansi((r.stdout ?? '') + (r.stderr ?? ''));
  const rc = r.error?.code === 'ETIMEDOUT' || r.signal ? 124 : r.status;
  let cls = 'pass';
  if (rc === 124) cls = 'timeout';
  else if (rc !== 0) cls = /ERR_ASSERTION|AssertionError|\bFAIL\b|assertion/i.test(out) ? 'assertion' : 'crash';
  const name = (out.match(/^\s*not ok \d+ - (.+)$/m) || out.match(/^\s*✖ (.+?)(?: \(\d.*)?$/m) || out.match(/^\s*FAIL:? (.+)$/m) || [])[1] ?? '';
  return { rc, cls, name: name.trim().replace(/\s+/g, ' ') };
}

// base must be green 3/3
for (let i = 0; i < 3; i++) { const r = run(); if (r.rc !== 0) die(`FLAKY-BASE: base run ${i + 1}/3 rc=${r.rc} (${r.cls}) ${r.name}`, 3); }

// test_sha = hash of the test command + the contents of any file it names
const named = args.test.split(/\s+/).map(w => path.join(ROOT, w)).filter(p => fs.existsSync(p) && fs.statSync(p).isFile());
const testSha = createHash('sha1').update([args.test, ...named.map(p => fs.readFileSync(p, 'utf8'))].join('\0')).digest('hex').slice(0, 12);
const COLS = ['ts', 'seed', 'target', 'test_sha', 'file:line', 'operator', 'run1_rc', 'run2_rc', 'failing_test', 'class', 'verdict'];
const rows = [], survivors = [];
const counts = { KILLED: 0, 'KILLED-WEAK': 0, FLAKY: 0, SURVIVED: 0 };
let valid = 0, invalid = 0;
for (const s of sites) {
  if (valid >= K) break;
  const lines = src.slice();
  lines[s.line - 1] = s.text;
  fs.writeFileSync(T, lines.join('\n'));
  const [cmd, cargs] = syntax(T);
  if (spawnSync(cmd, cargs, { encoding: 'utf8', timeout: 30000 }).status !== 0) { invalid++; continue; }  // INVALID: redraw, not counted
  valid++;
  const a = run(), b = run();
  let verdict;
  if (a.rc === 0 && b.rc === 0) verdict = 'SURVIVED';
  else if (a.rc === 0 || b.rc === 0) verdict = 'FLAKY';
  else verdict = a.cls === 'assertion' && b.cls === 'assertion' ? 'KILLED' : 'KILLED-WEAK';
  counts[verdict]++;
  if (verdict !== 'KILLED') survivors.push(`${REL}:${s.line}`);
  rows.push([new Date().toISOString(), SEED, REL, testSha, `${REL}:${s.line}`, s.op, a.rc, b.rc, a.name, a.cls === b.cls ? a.cls : `${a.cls}/${b.cls}`, verdict]);
}
fs.writeFileSync(T, orig);
if (valid < K) console.log(`mutants: WARN only ${valid} valid mutants available (K=${K})`);

if (status() !== before) die('real working tree changed (git status differs)', 2);
fs.mkdirSync(path.dirname(TRACE), { recursive: true });
if (!fs.existsSync(TRACE)) fs.writeFileSync(TRACE, COLS.join('\t') + '\n');
fs.appendFileSync(TRACE, rows.map(r => r.join('\t') + '\n').join(''));

const equivalents = 0;  // TODO step 6 triage
const score = valid ? counts.KILLED / (valid - equivalents) : 0;
const pass = valid > 0 && score >= 0.9 && counts['KILLED-WEAK'] === 0;
console.log(`mutants: seed=${SEED} valid=${valid} invalid=${invalid} killed=${counts.KILLED} killed-weak=${counts['KILLED-WEAK']} flaky=${counts.FLAKY} survived=${counts.SURVIVED}`);
if (counts.FLAKY) console.log(`mutants: !!! ${counts.FLAKY} FLAKY mutant(s): runs disagree, counted as survived`);
console.log(`mutants: score=${(score * 100).toFixed(1)}% ${pass ? 'PASS' : 'FAIL'}`);
if (!pass) for (const s of survivors) console.log(s);
process.exit(pass ? 0 : 1);
