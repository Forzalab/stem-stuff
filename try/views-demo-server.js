// A FAKE /predict for the demo (F5): on the site this is serve.py's POST /predict {item, view, key, pick} -> {ok, tries_left, patch?}.
// The answer and the Reveal body live only here (the "server"), never in the page's program or DOM before stage post.
// Petersen 3-colouring: outer u0..u4 = 1 2 1 2 3, inner v0..v4 = 2 1 3 3 2 (checked against all 15 edges below).

function petersen() {
  const cx = 120, cy = 118, R = 96, r = 46, K = [1, 2, 1, 2, 3, 2, 1, 3, 3, 2], ids = [], pos = [];
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5, rad = ring ? r : R;
    ids.push(`${ring ? "v" : "u"}${i}`);
    pos.push(`${ids.at(-1)} ${Math.round(cx + rad * Math.cos(a))} ${Math.round(cy + rad * Math.sin(a))}`);
  }
  const E = [];
  for (let i = 0; i < 5; i++) E.push([i, (i + 1) % 5], [i, 5 + i], [5 + i, 5 + (i + 2) % 5]);
  if (E.some(([a, b]) => K[a] === K[b])) throw new Error("not a proper colouring");
  return { nodes: pos.join(", "), edges: E.map(([a, b]) => `${ids[a]}-${ids[b]}`).join(", "), marks: ids.map((id, i) => `${id}:k${K[i]}`).join(" ") };
}

export function makePredict({ used = 1, tries = 2, delay = 150 } = {}) {
  const ANSWER = "3";
  const g = petersen();
  const REVEAL = `rv = Reveal("The answer opens after your second try.", [ans, col, key])
ans = Answer("χ(P) = 3", "Three classes cover all 10 vertices; the odd cycle rules out 2.")
col = Graph("${g.nodes}", "${g.edges}", "", "${g.marks}")
key = Legend(["k1 class 1", "k2 class 2", "k3 class 3"])
`;
  return async function predict(pick) {
    await new Promise(r => setTimeout(r, delay));
    used++;
    const ok = String(pick) === ANSWER, left = Math.max(0, tries - used);
    return { ok, tries_left: left, ...(ok || left === 0 ? { patch: REVEAL } : {}) };
  };
}
