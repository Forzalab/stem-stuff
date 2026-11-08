// Smoke test for tools/mutants.mjs: tiny fixture repo in a temp dir, --k 5 --seed 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mutants.mjs');
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'mutfx-'));
fs.writeFileSync(path.join(fx, 'lib.mjs'), [
  'export function clamp(x, lo, hi) {',
  '  if (x < lo) return lo;',
  '  if (x > hi) return hi;',
  '  return x;',
  '}',
  'export function isAdult(age) {',
  '  return age >= 18;',
  '}',
  'export const both = (a, b) => a > 0 && b > 0;',
  '',
].join('\n'));
fs.writeFileSync(path.join(fx, 'lib.test.mjs'), [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { clamp, isAdult, both } from './lib.mjs';",
  "test('clamp', () => { assert.equal(clamp(5, 0, 10), 5); assert.equal(clamp(-1, 0, 10), 0); assert.equal(clamp(11, 0, 10), 10); assert.equal(clamp(0, 0, 10), 0); assert.equal(clamp(10, 0, 10), 10); });",
  "test('adult', () => { assert.equal(isAdult(18), true); assert.equal(isAdult(17), false); });",
  "test('both', () => { assert.equal(both(1, 1), true); assert.equal(both(1, 0), false); assert.equal(both(0, 1), false); });",
  '',
].join('\n'));
const sh = (c, a) => spawnSync(c, a, { cwd: fx, encoding: 'utf8' });
sh('git', ['init', '-q']);
const hash = () => ['lib.mjs', 'lib.test.mjs'].map(f => fs.readFileSync(path.join(fx, f), 'utf8')).join('\0');
const mut = trace => spawnSync('node', [MUT, '--target', 'lib.mjs', '--test', 'node --test lib.test.mjs', '--k', '5', '--seed', '1', '--trace', trace], { cwd: fx, encoding: 'utf8' });

test('mutants smoke: rows, determinism, real tree untouched', () => {
  const before = hash(), st = sh('git', ['status', '--porcelain', '--', 'lib.mjs', 'lib.test.mjs']).stdout;
  const t1 = path.join(fx, 'out', 't1.tsv'), t2 = path.join(fx, 'out', 't2.tsv');
  const r1 = mut(t1), r2 = mut(t2);
  assert.ok([0, 1].includes(r1.status), r1.stdout + r1.stderr);
  assert.match(r1.stdout, /seed=1/);
  const rows = fs.readFileSync(t1, 'utf8').trim().split('\n').map(l => l.split('\t'));
  assert.deepEqual(rows[0], ['ts', 'seed', 'target', 'test_sha', 'file:line', 'operator', 'run1_rc', 'run2_rc', 'failing_test', 'class', 'verdict']);
  assert.equal(rows.length, 6);
  assert.ok(rows.slice(1).every(r => r.length === 11 && r[1] === '1' && /^(KILLED|KILLED-WEAK|FLAKY|SURVIVED)$/.test(r[10])));
  const draw = f => fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').slice(4, 6).join(' '));
  assert.deepEqual(draw(t1), draw(t2));
  assert.equal(r1.stdout.split('\n').filter(l => /^lib\.mjs:\d+$/.test(l)).length, rows.slice(1).filter(r => r[10] !== 'KILLED').length);
  assert.equal(hash(), before);
  assert.equal(sh('git', ['status', '--porcelain', '--', 'lib.mjs', 'lib.test.mjs']).stdout, st);
});

test('mutants: red base exits 3', () => {
  const r = spawnSync('node', [MUT, '--target', 'lib.mjs', '--test', 'false', '--k', '1', '--trace', path.join(fx, 'out', 't3.tsv')], { cwd: fx, encoding: 'utf8' });
  assert.equal(r.status, 3);
});
