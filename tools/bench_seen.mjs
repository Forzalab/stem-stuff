#!/usr/bin/env node
/* J6 bench for moment C "seen" (intent.js proposeSeen). Offline, on files Tony copies by hand: stemJev.dump() → a JSONL file (one
   { s: session, i: item no., c: code, l: "+SS.s  kind  args" } per line; memory only on the device, nothing is ever sent).
     node tools/bench_seen.mjs dump.jsonl [--out label-sheet.csv]        → label-sheet.csv: sid,code,window,rule,label (label blank)
     node tools/bench_seen.mjs dump.jsonl --labels labels.csv            → rule precision / recall against the filled label column (y / n)
   The rule is intent.js's own proposeSeen (loaded, not copied), fed the state rebuilt from the item's lines up to its first right pick.
   jevShadow(lines, client): the Jev-model shadow (typesafe/jev-1.14) as a body for an INJECTED client only. No default network here,
   and the page never loads this file. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(new URL("../intent.js", import.meta.url), "utf8");
export const proposeSeen = (() => { const w = { URLSearchParams }; w.window = w; vm.runInNewContext(SRC, w); return w.__stemJev.proposeSeen; })();

const LINE = /^\+(\d+(?:\.\d+)?) {2}(\S+)(?: {2}(.*))?$/;

/* JSONL text → items [{ sid, window, code, lines: [{ t, kind, args }] }], in dump order */
export function parseDump(text) {
  const items = [], by = new Map();
  for (const raw of String(text).split("\n")) {
    if (!raw.trim()) continue;
    let r; try { r = JSON.parse(raw); } catch { continue; }
    const m = r && typeof r.l === "string" ? LINE.exec(r.l) : null;
    if (!m) continue;
    const key = r.s + "|" + r.i;
    let it = by.get(key);
    if (!it) { it = { sid: r.s, window: r.i, code: r.c, lines: [] }; by.set(key, it); items.push(it); }
    it.lines.push({ t: +m[1], kind: m[2], args: m[3] || "" });
  }
  return items;
}

/* the proposeSeen state at the item's first right pick; null when it had none (nothing to propose on) */
export function itemState(it) {
  const st = { solved: false, wrong: 0, deep: 0, help: false, s5: false, gaps: [], errs: [] };
  let prev = 0;
  for (const l of it.lines) {
    if (l.kind === "pick") {
      const [, verdict] = l.args.split(" ");
      st.gaps.push(Math.round((l.t - prev) * 10) / 10); prev = l.t;
      if (verdict === "wrong") { st.wrong++; const e = /\berr=(\S+)/.exec(l.args); if (e) st.errs.push(e[1]); }
      else if (verdict === "correct") { st.solved = true; return st; }
    } else if (l.kind === "cluck" && l.args.startsWith("open")) st.help = true;
    else if (l.kind === "jev") {
      const d = /^S2 depth=(\d+)/.exec(l.args);
      if (d) st.deep = Math.max(st.deep, +d[1]);
      if (l.args.startsWith("S5")) st.s5 = true;
    }
  }
  return null;
}

/* one row per item: the rule's verdict ("C" when it proposes) and what the device did ("", "quiet", "nod", "short", "full") */
export function rows(items) {
  return items.map(it => {
    const st = itemState(it), c = st ? proposeSeen(st) : [], f = it.lines.find(l => l.kind === "seen");
    return { sid: it.sid, code: it.code, window: it.window, rule: c.length ? "C" : "", fired: f ? f.args.replace(/^C /, "").split(" ")[0] : "", fam: c.length ? c[0].fam : "" };
  });
}
const cell = x => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x);
export const labelSheet = rs => ["sid,code,window,rule,label", ...rs.map(r => [r.sid, r.code, r.window, r.rule, ""].map(cell).join(","))].join("\n") + "\n";

/* labels.csv (the sheet with label = y / n filled in) → precision and recall of the rule over the labelled rows */
export function score(rs, labelsCsv) {
  const L = new Map();
  for (const line of String(labelsCsv).split("\n").slice(1)) {
    const p = line.split(","); if (p.length < 5) continue;
    const v = p[4].trim().toLowerCase(); if (v === "y" || v === "n") L.set(p[0] + "|" + p[1] + "|" + p[2], v === "y");
  }
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rs) {
    const k = r.sid + "|" + r.code + "|" + r.window; if (!L.has(k)) continue;
    const yes = L.get(k), says = r.rule === "C";
    if (says && yes) tp++; else if (says) fp++; else if (yes) fn++; else tn++;
  }
  return { labelled: tp + fp + fn + tn, tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
}

/* the Jev-model shadow: the body for one item's lines, sent through the caller's client only (client(body) → answer) */
export const JEV_MODEL = "typesafe/jev-1.14";
export function jevShadow(lines, client) {
  if (typeof client !== "function") throw new Error("jevShadow needs an injected client: no default network");
  return client({ model: JEV_MODEL, state: lines.join("\n"), questions: { earned: null } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = n => (a.indexOf(n) >= 0 ? a[a.indexOf(n) + 1] : undefined), file = a.find(x => !x.startsWith("--") && x !== opt("--out") && x !== opt("--labels"));
  if (!file) { console.error("usage: node tools/bench_seen.mjs dump.jsonl [--out label-sheet.csv] [--labels labels.csv]"); process.exit(2); }
  const rs = rows(parseDump(readFileSync(file, "utf8")));
  if (opt("--labels")) console.log(JSON.stringify(score(rs, readFileSync(opt("--labels"), "utf8"))));
  else { const out = opt("--out") || "label-sheet.csv"; writeFileSync(out, labelSheet(rs)); console.log(`${rs.length} items, ${rs.filter(r => r.rule).length} proposed → ${out}`); }
}
