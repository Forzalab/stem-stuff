// The demo's view programs, as OpenUI Lang text (profile "stem", views-lib.js). On the site these come from the bank (authored)
// or the server gate (live); here they are constants the demo streams in chunks. The tests import the same text.
// None of them holds the P11 answer: that is in views-demo-server.js only (the fake /predict), sent as a patch at stage post.

/** View 1: P10 BFS crawl, stage post, card tokens. Truth from graph.trace("bfs", fig0, "A", {maxDepth: 2}): B 1, C 1, D 2, E never. */
export const P10 = `root = View([head, legend, walk])
head = Head("How BFS finds the pages", "One layer at a time. A page is recorded when first seen, fetched when its layer comes up.")
legend = Legend(["done fetched", "rec recorded only", "front in queue", "tree new", "seen seen", "skip not examined"])
walk = Steps(fig, [s1, s2, s3, s4], "Queue, front first", ["Page", "Depth", "Status"])
fig = Graph("A 48 100, B 160 48, C 160 152, D 272 100, E 392 100", "A>B, A>C, B>D, C>D, D>E", "48 depth 0, 160 depth 1, 272 depth 2, 392 not reached")
s1 = Step("Fetch **A** at depth 0. Its links to B and C are **new**: both are recorded at depth 1 and queued.", "A:cur B:front C:front", "A-B:tree A-C:tree", "A:0 B:1 C:1", ["A-B:new", "A-C:new"], ["B", "C"], [["A", "0", "fetched"], ["B", "1", "queued"], ["C", "1", "queued"], ["D", "–", "not seen"], ["E", "–", "not seen"]])
s2 = Step("Fetch **B** at depth 1. B→D is **new**: D is recorded at depth 2, the limit.", "A:done B:cur C:front D:front", "A-B:tree A-C:tree B-D:tree", "A:0 B:1 C:1 D:2", ["B-D:new"], ["C", "D"], [["A", "0", "fetched"], ["B", "1", "fetched"], ["C", "1", "queued"], ["D", "2", "queued"], ["E", "–", "not seen"]])
s3 = Step("Fetch **C** at depth 1. C→D is **seen**: D already has a depth, nothing changes.", "A:done B:done C:cur D:front", "A-B:tree A-C:tree B-D:tree C-D:seen", "A:0 B:1 C:1 D:2", ["C-D:seen"], ["D"], [["A", "0", "fetched"], ["B", "1", "fetched"], ["C", "1", "fetched"], ["D", "2", "queued"], ["E", "–", "not seen"]])
s4 = Step("**D** sits at maxDepth 2: recorded, **not fetched**. D→E is never examined, so E is never reached.", "A:done B:done C:done D:rec E:idle", "A-B:tree A-C:tree B-D:tree C-D:seen D-E:skip", "A:0 B:1 C:1 D:2", ["D-E:not examined"], [], [["A", "0", "fetched"], ["B", "1", "fetched"], ["C", "1", "fetched"], ["D", "2", "recorded only"], ["E", "–", "not reached"]])
`;

/** View 2: P11 χ(Petersen), picked 4, stage wrong:4, Cluck's sheet. Predict carries no answer; Reveal is a locked row. */
export const P11 = `root = View([hints, pick, rv])
hints = Hints(["The outer ring is a 5-cycle. An odd cycle cannot be 2-coloured, so χ(P) ≥ 3.", "Vertices that are not adjacent may share a colour. Colour the outer pentagon first, then the inner star.", "Petersen has 15 edges and no triangle. Try the inner star with the colours the spokes still allow."])
pick = Predict("Try again", "What is χ(P)?", ["2", "3", "4", "5"], ["4"], 2)
rv = Reveal("The answer opens after your second try.")
`;

/** View 3: the Compare/Graph-free fallback (L0 + Callout only): P2 BFS vs DFS from A as a table. */
export const P2 = `root = View([head, order, why])
head = Head("BFS and DFS, side by side", "Same graph A→B, A→C, B→D, C→D, D→E, C→E; neighbours in alphabetical order.")
order = Table(["Turn", "BFS takes", "DFS takes"], [["1", "A", "A"], ["2", "B (oldest)", "B (newest)"], ["3", "C", "D"], ["4", "D", "E"], ["5", "E", "C"]])
why = Callout("Where it breaks", "BFS takes the oldest waiting page, DFS the newest. Both see B and C from A; only the order of the pulls differs, so E comes last in BFS and C comes last in DFS.")
`;

/** View 4: every statement drops (unknown component, over a cap) -> the renderer's Doodle (VISUAL-FIRST). */
export const DROPPED = `root = View([a, b])
a = Sparkle("not in the library")
b = Legend(["done one", "done two", "done three", "done four", "done five", "done six", "done seven", "done eight", "done nine"])
`;

/** Cut a program into uneven chunks, the way a model streams it (mid-word, mid-string, mid-statement). */
export function chunk(text, seed = 7) {
  const out = [];
  let i = 0, s = seed;
  while (i < text.length) { s = (s * 9301 + 49297) % 233280; const n = 3 + Math.floor((s / 233280) * 40); out.push(text.slice(i, i + n)); i += n; }
  return out;
}
