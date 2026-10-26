#!/usr/bin/env node
/* J6 bench for the "seen" moments (intent.js tree). Offline, on files Tony copies by hand: stemJev.dump() → a JSONL file (one
   { s: session, i: item no., c: code, l: "+SS.s  kind  args" } per line; memory only on the device, nothing is ever sent).
     node tools/bench_seen.mjs dump.jsonl [--out label-sheet.csv]        → label-sheet.csv: sid,code,window,rule,label (label blank)
     node tools/bench_seen.mjs dump.jsonl --labels labels.csv            → rule precision / recall against the filled label column (y / n)
   The rule is intent.js's own tree (loaded, not copied; trap_beaten needs the item's distractor families, which a dump does not carry: inert here), fed the state rebuilt from the item's lines up to its first right pick.
   jevShadow(lines, client, model?): the Jev-model shadow (microsoft/microsoft-decision-1; typesafe/jev-1.14 is the 2nd arm) as a body for an INJECTED client only. No default network here,
   and the page never loads this file. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(new URL("../intent.js", import.meta.url), "utf8");
export const tree = (() => { const w = { URLSearchParams }; w.window = w; vm.runInNewContext(SRC, w); return w.__stemJev.tree; })();

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

/* the tree's state at the item's first right pick; null when it had none (nothing to propose on). fams = the families wrong on this session's earlier items */
export function itemState(it, fams = []) {
  const st = { solved: false, wrong: 0, deep: 0, help: false, s5: false, gaps: [], errs: [], fams, since: null };
  let prev = 0, errT = null;
  for (const l of it.lines) {
    if (l.kind === "pick") {
      const [, verdict] = l.args.split(" ");
      st.gaps.push(Math.round((l.t - prev) * 10) / 10); prev = l.t;
      if (verdict === "wrong") { st.wrong++; errT = l.t; const e = /\berr=(\S+)/.exec(l.args); if (e) st.errs.push(e[1]); }
      else if (verdict === "correct") { st.solved = true; st.since = errT == null ? null : l.t - errT; return st; }
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
  const seenFams = new Map();                                            // per session: families wrong on its earlier items
  return items.map(it => {
    const fams = seenFams.get(it.sid) || new Set(), st = itemState(it, [...fams]), c = st ? tree(st) : [], f = it.lines.find(l => l.kind === "seen");
    for (const l of it.lines) { const e = l.kind === "pick" && /\berr=(\S+)/.exec(l.args); if (e) fams.add(e[1]); }
    seenFams.set(it.sid, fams);
    return { sid: it.sid, code: it.code, window: it.window, rule: c.length ? "C" : "", fired: f ? f.args.replace(/^\S+ /, "").split(" ")[0] : "", fam: c.length ? c[0].fam : "", moment: c.length ? c[0].moment : "" };
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

/* the Jev-model shadow: the body for one item's lines, sent through the caller's client only (client(body) → answer).
   Two arms: MSD-1 (the default) and jev-1.14 (the 2nd arm). model = one slug to pick an arm; jevBench runs every arm (or the models given) */
export const JEV_MODELS = ["microsoft/microsoft-decision-1", "typesafe/jev-1.14"];
export const JEV_MODEL = JEV_MODELS[0];
/* OpenRouter provider prefs on every Jev request body, both arms: zero data retention, no prompt collection. NOT checked against the live API
   here (no network): the slugs above and the zdr / data_collection field names still need one live check */
export const JEV_PROVIDER = { zdr: true, data_collection: "deny" };
export function jevShadow(lines, client, model = JEV_MODEL) {
  if (typeof client !== "function") throw new Error("jevShadow needs an injected client: no default network");
  return client({ model, provider: { ...JEV_PROVIDER }, state: lines.join("\n"), questions: { earned: null } });
}
export async function jevBench(lines, client, models = JEV_MODELS) {
  const out = {};
  for (const m of models) out[m] = await jevShadow(lines, client, m);
  return out;
}

/* ---- --replay (W96, art. 7): the WHOLE homebrew decision path (create(): S2 / S5 / S6 / S7 / Q / F, the J5 nudge gate, the J6 seen fire,
   lane-4 hold is inert: a dump has no held choice) re-run on a dump's events with a fake clock, over many roll seeds. Offline, no network.
   What a dump does NOT carry, rebuilt here (so replay numbers are an estimate, not the device's):
     · item start times: each item starts 1 s after the last line of the item before (lines are seconds since q_open)
     · input between logged lines: a "pause Ns" at t = no input in [t − N, t]; elsewhere (outside an away) the student counts as active
       (a pointerdown every ACT_S s, the input listener logs a pause only past 5 s); a num/expr pick gets a keydown 1 s before it
     · the peek is always free; a nudge the student never taps is put away DISMISS_S s later (doubles the gap, as on the device)
   The recorded jev / seen / tree lines are ignored: the decision is recomputed with the intent.js given (src, default ../intent.js). */
const ACT_S = 4, DISMISS_S = 10;
const lcg = (s = 1) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
export function loadJev(src = SRC) { const w = { URLSearchParams }; w.window = w; vm.runInNewContext(src, w); return w.__stemJev; }
/* items (parseDump) → one session's timed events [{ t (s, session clock), k, p }] */
export function events(items) {
  const ev = [];
  let base = 0;
  for (const it of items) {
    const type = (/^\S+ (\S+)/.exec((it.lines.find(l => l.kind === "q_open") || {}).args || "") || [])[1] || "?";
    ev.push({ t: base, k: "q_open", p: { code: it.code, type } });
    const quiet = [];                                                    // [from, to] with no input: pauses and aways
    for (const l of it.lines) {
      const T = base + l.t, a = l.args;
      if (l.kind === "pause") quiet.push([T - parseFloat(a), T, "pause"]);
      else if (l.kind === "away") { const s = parseFloat(a), via = /via=(\S+)/.exec(a)?.[1] || "hide"; quiet.push([T - s, T, via]); }
    }
    let prev = base;
    for (const l of it.lines) {
      const T = base + l.t, a = l.args;
      if (l.kind === "q_open") continue;
      for (let x = prev + ACT_S; x < T; x += ACT_S) if (!quiet.some(([f, to]) => x > f - 0.01 && x < to + 0.01)) ev.push({ t: x, k: "input", p: "pointerdown" });
      prev = T;
      if (l.kind === "pick") {
        const [ch, verdict] = a.split(" "), tl = /tries_left=(\d+)/.exec(a), er = /\berr=(\S+)/.exec(a);
        if (type !== "mc") ev.push({ t: T - 1, k: "input", p: "keydown" });
        ev.push({ t: T, k: "pick", p: { choice: ch === "-" ? "" : ch, verdict, tries_left: tl ? +tl[1] : undefined, error: er ? er[1] : undefined } });
      } else if (l.kind === "pause") ev.push({ t: T, k: "input", p: "pointerdown" });
      else if (l.kind === "away") {
        const s = parseFloat(a), via = /via=(\S+)/.exec(a)?.[1] || "hide";
        ev.push({ t: T - s, k: via === "hide" ? "hide" : "blur", p: true }, { t: T, k: via === "hide" ? "hide" : "blur", p: false });
      } else if (l.kind === "cluck") {
        if (a.startsWith("open")) ev.push({ t: T, k: "cluck_open", p: { tab: a.split(" ")[1] || "" } });
        else if (a.startsWith("close")) ev.push({ t: T, k: "cluck_dwell", p: {} });
      }
    }
    base += (it.lines.length ? it.lines[it.lines.length - 1].t : 0) + 1;
  }
  return ev.sort((x, y) => x.t - y.t);
}
/* one replay with one roll seed → { counts: { signal: n }, fires: [{ t, sig }] }. Signals: the rule hits (S2 S5 S6 S7 Q F), the J5 nudge
   that SHOWS (nudge:S2 …), the seen fire (seen:nod|short|full) and its silent pick (seen:quiet) */
export function replay(ev, { seed = 1, src } = {}) {
  const J = loadJev(src), lines = [{ fam: {}, any: [] }][0];
  const SL = (() => { const w = {}; w.window = w; vm.runInNewContext(readFileSync(new URL("../copy/seen-lines.js", import.meta.url), "utf8"), w); return w.__stemSeenLines; })();
  const NL = (() => { const w = {}; w.window = w; vm.runInNewContext(readFileSync(new URL("../copy/nudge-lines.js", import.meta.url), "utf8"), w); return w.__stemNudgeLines; })();
  let t = 0, dismissAt = Infinity;
  const fires = [], j = J.create(() => t * 1000, {}, { rand: lcg(seed), lines: NL, seenLines: SL || lines, say: () => { dismissAt = t + DISMISS_S; return true; }, title: () => "" });
  const end = ev.length ? ev[ev.length - 1].t + 60 : 0, q = ev.slice();
  for (let clock = 0; clock <= end || q.length; clock += 5) {
    while (q.length && q[0].t <= clock) {
      const e = q.shift(); t = e.t;
      if (t >= dismissAt) { j.nudgeEnd(false); dismissAt = Infinity; }
      if (e.k === "input") j.input(e.p); else if (e.k === "hide") j.vis(e.p); else if (e.k === "blur") j.away("blur", e.p); else j.ev(e.k, e.p);
    }
    t = clock;
    if (t >= dismissAt) { j.nudgeEnd(false); dismissAt = Infinity; }
    j.tick();
  }
  const counts = {}, base = {};
  let off = 0, last = -1;
  for (const r of j.dump().split("\n").filter(Boolean).map(x => JSON.parse(x))) {
    const m = LINE.exec(r.l); if (!m) continue;
    if (r.i !== last) { last = r.i; off = (ev.filter(e => e.k === "q_open")[r.i - 1] || { t: 0 }).t; }
    const T = off + +m[1], a = m[3] || "";
    let sig = null;
    if (m[2] === "jev") { const s = /^(S2|S5|S6|S7|Q|F) /.exec(a), n = /^nudge (\S+) say/.exec(a); sig = s ? s[1] : n ? "nudge:" + n[1] : /^hold n=/.test(a) ? "hold" : null; }
    else if (m[2] === "seen") sig = "seen:" + a.split(" ")[1];
    if (sig) { counts[sig] = (counts[sig] || 0) + 1; fires.push({ t: T, sig }); }
  }
  return { counts, fires, base };
}
/* many seeds → the mean count per signal, and the mean per-minute timeline of the student-visible cues (nudge:*, seen nod/short/full) */
export function replayBench(ev, { seeds = 200, src } = {}) {
  const sum = {}, mins = {};
  for (let s = 1; s <= seeds; s++) {
    const r = replay(ev, { seed: s, src });
    for (const [k, v] of Object.entries(r.counts)) sum[k] = (sum[k] || 0) + v;
    for (const f of r.fires) if (/^nudge:|^seen:(nod|short|full)$/.test(f.sig)) { const m = Math.floor(f.t / 60); (mins[m] = mins[m] || {})[f.sig] = ((mins[m] || {})[f.sig] || 0) + 1; }
  }
  const mean = o => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, +(v / seeds).toFixed(2)]));
  return { seeds, mean: mean(sum), timeline: Object.fromEntries(Object.entries(mins).map(([m, o]) => [m, mean(o)])) };
}
/* --synth N: a seeded synthetic class (the numbers depend on THIS generator, not on real students): per session 12 items; per item a
   first-try right rate of 0.55, else 1–3 wrong picks before a right (or giving up, 10%); think time 10–120 s per pick; Cluck opened by
   hand on 20% of items; a tab-away (hide) of 10–300 s on 30% of items; input pauses of 5–40 s every ~30 s */
export function synth(n = 50, seed = 7) {
  const r = lcg(seed), out = [], U = (a, b) => a + r() * (b - a);
  for (let s = 0; s < n; s++) for (let i = 1; i <= 12; i++) {
    const L = ["+0.0  q_open  SYN_" + i + " " + (r() < 0.5 ? "mc" : "num")], push = (t, x) => L.push("+" + t.toFixed(1) + "  " + x);
    let t = 0;
    const wrongs = r() < 0.55 ? 0 : 1 + Math.floor(r() * 3), quit = wrongs && r() < 0.1, help = r() < 0.2, away = r() < 0.3;
    for (let k = 0; k <= wrongs; k++) {
      const think = U(10, 120);
      for (let x = 30; x < think; x += 30) { const p = U(5, 40); push(t + x, "pause  " + Math.round(p) + "s"); }
      if (away && k === 0) { const a = U(10, 300); t += a; push(t, "away  " + Math.round(a) + "s via=hide"); }
      t += think;
      if (help && k === 1) push(t - 5, "cluck  open ask");
      if (k < wrongs) push(t, "pick  A wrong tries_left=" + Math.max(0, 2 - k) + " err=sign");
      else if (!quit) push(t, "pick  B correct");
    }
    L.forEach(l => out.push(JSON.stringify({ s: "syn" + s, i: i, c: "SYN_" + i, l })));
  }
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = n => (a.indexOf(n) >= 0 ? a[a.indexOf(n) + 1] : undefined), file = a.find(x => !x.startsWith("--") && ![opt("--out"), opt("--labels"), opt("--src"), opt("--seeds"), opt("--synth")].includes(x));
  /* --replay [--src intent.js] [--seeds N] [--synth N]: the whole decision path re-run (see replay above); prints JSON, one line per session group */
  if (a.includes("--replay")) {
    const src = opt("--src") ? readFileSync(opt("--src"), "utf8") : undefined, seeds = +(opt("--seeds") || 200);
    const text = opt("--synth") ? synth(+opt("--synth")) : readFileSync(file, "utf8"), by = new Map();
    for (const it of parseDump(text)) { if (!by.has(it.sid)) by.set(it.sid, []); by.get(it.sid).push(it); }
    const tot = {}, nS = by.size, one = nS === 1;
    for (const [sid, items] of by) {
      const r = replayBench(events(items), { seeds, src });
      if (one) { console.log(JSON.stringify({ sid, items: items.length, seeds, mean: r.mean, timeline: r.timeline })); }
      for (const [k, v] of Object.entries(r.mean)) tot[k] = (tot[k] || 0) + v;
    }
    if (!one) console.log(JSON.stringify({ sessions: nS, seeds, mean_per_session: Object.fromEntries(Object.entries(tot).sort().map(([k, v]) => [k, +(v / nS).toFixed(2)])) }));
    process.exit(0);
  }
  if (!file) { console.error("usage: node tools/bench_seen.mjs dump.jsonl [--out label-sheet.csv] [--labels labels.csv] | --replay [--src intent.js] [--seeds N] [--synth N]"); process.exit(2); }
  const rs = rows(parseDump(readFileSync(file, "utf8")));
  if (opt("--labels")) console.log(JSON.stringify(score(rs, readFileSync(opt("--labels"), "utf8"))));
  else { const out = opt("--out") || "label-sheet.csv"; writeFileSync(out, labelSheet(rs)); console.log(`${rs.length} items, ${rs.filter(r => r.rule).length} proposed → ${out}`); }
}
