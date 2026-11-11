// Reference encoder/decoder for the Copy payload (see COPY-PAYLOAD.md). No deps; works in browser and node.
export const V = 1;
export const MAX_EDITS = 120;      // history entries kept after thinning
export const MAX_CHARS = 40000;    // soft cap on the JSON string

const secs = (t, t0) => Math.round((t - t0) / 100) / 10; // ms -> seconds, 0.1 s

// One splice turning a into b: common prefix/suffix, replace the middle.
export function diff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { at: i, del: a.length - i - j, ins: b.slice(i, b.length - j) };
}

// Keep first and last snapshot, thin the middle evenly down to max.
function thin(snaps, max) {
  if (snaps.length <= max) return snaps;
  const out = [];
  for (let k = 0; k < max; k++) out.push(snaps[Math.round(k * (snaps.length - 1) / (max - 1))]);
  return out;
}

// s = { code, start (ms), tries:[{t,a,c?,l?,part?,v}], hints:[{t,part?,n,kind}], explain, history:[{t,text}] }
export function build(s, now = Date.now()) {
  const t0 = s.start;
  const raw = (s.history ?? []).filter((h, k, arr) => k === 0 || h.text !== arr[k - 1].text);
  let max = MAX_EDITS, out;
  for (;;) {
    const kept = thin(raw, max);
    let prev = "";
    const edits = kept.map(h => { const d = diff(prev, h.text); prev = h.text; return { t: secs(h.t, t0), ...d }; });
    const last = s.tries?.at(-1);
    out = {
      v: V,
      code: s.code,
      subject: s.code.split("_")[0],
      start: new Date(t0).toISOString(),
      copied: new Date(now).toISOString(),
      final: last ? { a: last.a, ...(last.l ? { l: last.l } : {}), ...(last.part != null ? { part: last.part } : {}), v: last.v } : null,
      tries: (s.tries ?? []).map(x => ({ t: secs(x.t, t0), a: x.a, ...(x.c ? { c: x.c } : {}), ...(x.l ? { l: x.l } : {}), ...(x.part != null ? { part: x.part } : {}), v: x.v })),
      hints: (s.hints ?? []).map(h => ({ t: secs(h.t, t0), ...(h.part != null ? { part: h.part } : {}), n: h.n, kind: h.kind })),
      explain: s.explain ?? "",
      hist: { n: raw.length, kept: kept.length, edits },
    };
    if (JSON.stringify(out).length <= MAX_CHARS || max <= 2) return out;
    max = Math.max(2, Math.floor(max / 2));
  }
}

// Snapshots back from a payload: [{t, text}]
export function replay(p) {
  let text = "";
  return p.hist.edits.map(e => {
    text = text.slice(0, e.at) + e.ins + text.slice(e.at + e.del);
    return { t: e.t, text };
  });
}

// Readable, pasteable: one line per try/hint/edit.
export function stringify(p) {
  const rows = k => p[k].length ? "[\n" + p[k].map(x => "    " + JSON.stringify(x)).join(",\n") + "\n  ]" : "[]";
  const edits = p.hist.edits.length ? "[\n" + p.hist.edits.map(x => "      " + JSON.stringify(x)).join(",\n") + "\n    ]" : "[]";
  return `{
  "v": ${p.v}, "code": ${JSON.stringify(p.code)}, "subject": ${JSON.stringify(p.subject)},
  "start": ${JSON.stringify(p.start)}, "copied": ${JSON.stringify(p.copied)},
  "final": ${JSON.stringify(p.final)},
  "tries": ${rows("tries")},
  "hints": ${rows("hints")},
  "explain": ${JSON.stringify(p.explain)},
  "hist": { "n": ${p.hist.n}, "kept": ${p.hist.kept}, "edits": ${edits} }
}`;
}
