"""graph.* engine tools. The graph argument is a SCHEMA.md network block (the bank figure itself: nodes, edges with from/to/w,
directed). trace() returns the "walk" shape of brain topics/openui-graph-plan-2026-10-18.md §4.1: one full snapshot per stage,
closed state enums, edge keys "from-to" as written in the figure. Ties are broken by node order in the figure and reported in
"ties", so an author can reject an item whose answer hangs on a tie. networkx loads on first use (cold start, render-v2 vet)."""
from engine import EngineError, tool

SYM = {"type": "string", "maxLength": 12}
NUM = {"type": "number"}
GRAPH = {"type": "object", "required": ["nodes", "edges"], "properties": {
    "directed": {"type": "boolean"},
    "nodes": {"type": "array", "minItems": 1, "maxItems": 12,
              "items": {"oneOf": [SYM, {"type": "object", "required": ["id"], "properties": {"id": SYM}}]}},
    "edges": {"type": "array", "maxItems": 30,
              "items": {"type": "object", "required": ["from", "to"], "properties": {"from": SYM, "to": SYM, "w": NUM}}}}}
NODE_STATE = {"enum": ["idle", "front", "cur", "done"]}
EDGE_STATE = {"enum": ["idle", "seen", "tree", "skip"]}
ROW = {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "string"}}
WALK = {"type": "object", "required": ["algo", "start", "title", "panel", "legend", "stages", "order", "ties"], "properties": {
    "algo": {"type": "string"}, "start": SYM, "title": {"type": "string"}, "panel": {"type": "string"},
    "legend": {"type": "array", "items": {"type": "object"}},
    "stages": {"type": "array", "minItems": 1, "maxItems": 12, "items": {
        "type": "object", "required": ["cap", "nodes", "edges", "tags", "rows"], "additionalProperties": False, "properties": {
            "cap": {"type": "string", "maxLength": 140},
            "nodes": {"type": "object", "additionalProperties": NODE_STATE},
            "edges": {"type": "object", "additionalProperties": EDGE_STATE},
            "tags": {"type": "object", "additionalProperties": {"type": "string"}},
            "rows": {"type": "array", "maxItems": 12, "items": ROW}}}},
    "order": {"type": "array", "items": ROW},
    "ties": {"type": "array", "items": {"type": "array", "items": SYM}}}}


def num(x):
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


class Net:
    """the block as plain lists: ids in figure order, edges (u, v, w, key); adj[u] = [(v, w, key)] in figure order of v"""
    def __init__(self, block):
        self.ids = [n if isinstance(n, str) else n["id"] for n in block["nodes"]]
        if len(set(self.ids)) != len(self.ids):
            raise EngineError("bad-graph", "duplicate node id")
        self.rank = {v: i for i, v in enumerate(self.ids)}
        self.directed = bool(block.get("directed"))
        self.edges, seen = [], {}
        for e in block["edges"]:
            u, v = e["from"], e["to"]
            if u not in self.rank or v not in self.rank:
                raise EngineError("bad-graph", f"edge {u}-{v}: no such node")
            k = f"{u}-{v}"
            seen[k] = seen.get(k, 0) + 1
            self.edges.append((u, v, e.get("w", 1), k if seen[k] == 1 else f"{k}#{seen[k]}"))
        self.adj = {v: [] for v in self.ids}
        for u, v, w, k in self.edges:
            if u == v:
                continue                       # a loop never relaxes or joins a tree
            self.adj[u].append((v, w, k))
            if not self.directed:
                self.adj[v].append((u, w, k))
        for v in self.adj:
            self.adj[v].sort(key=lambda t: self.rank[t[0]])

    def node(self, v):
        if v not in self.rank:
            raise EngineError("bad-args", f"no node {v}")
        return v

    def nx(self):
        """networkx graph; of parallel edges only the lightest stays (its key in the edge data)"""
        import networkx as nx
        g = nx.DiGraph() if self.directed else nx.Graph()
        g.add_nodes_from(self.ids)
        for u, v, w, k in self.edges:
            if not g.has_edge(u, v) or w < g[u][v]["weight"]:
                g.add_edge(u, v, weight=w, key=k)
        return g


def _snap(cap, net, cur, locked, val, pred, examined):
    """one stage: cur = this stage's node; locked (list, in order) -> done; reached, not locked -> front"""
    done = set(locked)
    nodes = {v: "cur" if v == cur else "done" if v in done else "front" for v in net.ids if v in val}
    tree = {pred[v] for v in done if v in pred}
    seen = {pred[v] for v in val if v not in done and v in pred}
    edges = {k: "tree" if k in tree else "seen" if k in seen else "skip" for k in sorted(examined | tree | seen)}
    return {"cap": cap, "nodes": nodes, "edges": edges,
            "tags": {v: num(val[v]) for v in net.ids if v in val}, "rows": [[v, num(val[v])] for v in locked]}


def _greedy(net, args):
    """Dijkstra (val = distance) or Prim (val = key, cost of the cheapest edge into the tree)"""
    prim = args["algo"] == "prim"
    if prim and net.directed:
        raise EngineError("bad-args", "prim needs an undirected graph")
    if any(e[2] < 0 for e in net.edges):
        raise EngineError("bad-graph", "negative weight")
    s = net.node(args["start"])
    val, pred, locked, examined, stages, ties = {s: 0}, {}, [], set(), [], []
    while True:
        open_ = [v for v in net.ids if v in val and v not in locked]
        if not open_:
            break
        u = min(open_, key=lambda v: (val[v], net.rank[v]))
        tie = [v for v in open_ if val[v] == val[u] and v != u]
        if tie:
            ties.append([u] + tie)
        locked.append(u)
        news, kept = [], []
        for v, w, k in net.adj[u]:
            if v in locked:
                continue
            examined.add(k)
            nv = w if prim else val[u] + w
            if v not in val or nv < val[v]:
                val[v], pred[v] = nv, k
                news.append(f"${v}$ to ${num(nv)}$")
            else:
                kept.append(f"${v}$ keeps ${num(val[v])}$")
        if u == s:
            cap = f"Start. ${'key' if prim else 'd'}({u})=0$. {'Add' if prim else 'Lock'} ${u}$."
        elif prim:
            cap = f"Add ${u}$ by edge ${pred[u].split('#')[0]}$ (${num(val[u])}$)."
        else:
            cap = f"Lock ${u}$ (${num(val[u])}$)."
        more = (" Update " + ", ".join(news) + "." if news else "") + (" " + ", ".join(kept) + "." if kept else "")
        stages.append(_snap(cap + (more if len(cap + more) <= 140 else ""), net, u, locked, val, pred, examined))
    total = f" Tree weight ${num(sum(val[v] for v in locked))}$."
    if prim and len(stages[-1]["cap"] + total) <= 140:
        stages[-1]["cap"] += total
    return locked, val, stages, ties


def _search(net, args):
    """BFS (val = depth, stage per dequeue) or DFS (val = visit number, stage per first visit); neighbors in figure order"""
    s, bfs = net.node(args["start"]), args["algo"] == "bfs"
    val, pred, locked, examined, stages = {s: 0 if bfs else 1}, {}, [], set(), []
    if bfs:
        queue = [s]
        while queue:
            u = queue.pop(0)
            locked.append(u)
            for v, _, k in net.adj[u]:
                if v in locked:
                    continue
                examined.add(k)
                if v not in val:
                    val[v], pred[v] = val[u] + 1, k
                    queue.append(v)
            q = ", ".join(f"${v}$" for v in queue) or "empty"
            stages.append(_snap(f"Visit ${u}$ (depth ${val[u]}$). Queue: {q}.", net, u, locked, val, pred, examined))
    else:
        def go(u):
            locked.append(u)
            frm = f" by edge ${pred[u].split('#')[0]}$" if u in pred else ""
            stages.append(_snap(f"Visit ${u}$ (#{val[u]}){frm}.", net, u, locked, val, pred, examined))
            for v, _, k in net.adj[u]:
                examined.add(k)
                if v not in val:
                    val[v], pred[v] = len(val) + 1, k
                    go(v)
        go(s)
    return locked, val, stages, []


ALGOS = {"dijkstra": (_greedy, "Dijkstra", "Finalized distances", [{"state": "done", "label": "locked"}, {"state": "front", "label": "checked"}]),
         "prim": (_greedy, "Prim", "Tree keys", [{"state": "done", "label": "in tree"}, {"state": "front", "label": "candidate"}]),
         "bfs": (_search, "BFS", "Depth", [{"state": "done", "label": "visited"}, {"state": "front", "label": "in queue"}]),
         "dfs": (_search, "DFS", "Visit order", [{"state": "done", "label": "visited"}])}


@tool("graph.trace", "Run dijkstra | prim | bfs | dfs from start on a network block; one snapshot per stage (walk shape).",
      {"type": "object", "required": ["algo", "graph", "start"], "additionalProperties": False,
       "properties": {"algo": {"enum": sorted(ALGOS)}, "graph": GRAPH, "start": SYM}}, WALK)
def trace(args):
    net = Net(args["graph"])
    run, name, panel, legend = ALGOS[args["algo"]]
    locked, val, stages, ties = run(net, args)
    return {"algo": args["algo"], "start": args["start"], "title": f"{name} from {args['start']}", "panel": panel,
            "legend": legend + [{"edge": "tree", "label": "tree edge"}], "stages": stages,
            "order": [[v, num(val[v])] for v in locked], "ties": ties}


@tool("graph.mst", "Minimum spanning tree (forest if disconnected): edge keys, total weight, and whether it is the only MST.",
      {"type": "object", "required": ["graph"], "additionalProperties": False, "properties": {"graph": GRAPH}},
      {"type": "object", "required": ["edges", "total", "connected", "unique"], "properties": {
          "edges": {"type": "array", "items": {"type": "string"}}, "total": NUM, "connected": {"type": "boolean"},
          "unique": {"type": "boolean"}}})
def mst(args):
    import networkx as nx
    net = Net(args["graph"])
    if net.directed:
        raise EngineError("bad-args", "mst needs an undirected graph")
    g = net.nx()
    g.remove_edges_from(list(nx.selfloop_edges(g)))
    t = nx.minimum_spanning_tree(g)
    total = sum(d["weight"] for *_, d in t.edges(data=True))
    unique = True                              # unique iff no tree edge can be swapped out at the same total
    for u, v, d in t.edges(data=True):
        h = g.copy()
        h.remove_edge(u, v)
        alt = nx.minimum_spanning_tree(h)
        if alt.number_of_edges() == t.number_of_edges() and sum(x["weight"] for *_, x in alt.edges(data=True)) == total:
            unique = False
            break
    return {"edges": sorted(d["key"] for *_, d in t.edges(data=True)), "total": total, "connected": nx.is_connected(g), "unique": unique}


@tool("graph.maxflow", "Max flow source -> sink (w = capacity, default 1; undirected edges carry flow either way): value, "
      "net flow per edge key (negative = against from->to), and a minimum cut.",
      {"type": "object", "required": ["graph", "source", "sink"], "additionalProperties": False,
       "properties": {"graph": GRAPH, "source": SYM, "sink": SYM}},
      {"type": "object", "required": ["value", "flow", "cut", "cut_edges"], "properties": {
          "value": NUM, "flow": {"type": "object", "additionalProperties": NUM},
          "cut": {"type": "array", "items": SYM}, "cut_edges": {"type": "array", "items": {"type": "string"}}}})
def maxflow(args):
    import networkx as nx
    net = Net(args["graph"])
    s, t = net.node(args["source"]), net.node(args["sink"])
    if s == t:
        raise EngineError("bad-args", "source = sink")
    if any(e[2] < 0 for e in net.edges):
        raise EngineError("bad-graph", "negative capacity")
    g = nx.DiGraph()
    g.add_nodes_from(net.ids)
    for u, v, w, _ in net.edges:
        for a, b in [(u, v)] + ([] if net.directed else [(v, u)]):
            if a != b:
                g.add_edge(a, b, capacity=g[a][b]["capacity"] + w if g.has_edge(a, b) else w)
    value, f = nx.maximum_flow(g, s, t)
    _, (side, _) = nx.minimum_cut(g, s, t)
    left = {}                                  # flow still to hand out per ordered pair, split over parallel edges in figure order
    flow = {}
    for u, v, w, k in net.edges:
        if u == v:
            flow[k] = 0
            continue
        pair = (u, v) if net.directed else tuple(sorted((u, v), key=net.rank.get))
        if pair not in left:
            a, b = pair
            left[pair] = f[a][b] - (0 if net.directed else f[b][a])
        sign = 1 if (u, v) == pair else -1
        take = max(-w, min(w, left[pair]))
        left[pair] -= take
        flow[k] = sign * take
    cut_edges = sorted(k for u, v, w, k in net.edges if (u in side) != (v in side) and (not net.directed or u in side))
    return {"value": value, "flow": flow, "cut": [v for v in net.ids if v in side], "cut_edges": cut_edges}


@tool("graph.coloring", "Chromatic number (exact, backtracking) and one proper coloring with colors 1..k.",
      {"type": "object", "required": ["graph"], "additionalProperties": False, "properties": {"graph": GRAPH}},
      {"type": "object", "required": ["chromatic", "colors"], "properties": {
          "chromatic": {"type": "integer"}, "colors": {"type": "object", "additionalProperties": {"type": "integer"}}}})
def coloring(args):
    net = Net(args["graph"])
    if any(u == v for u, v, *_ in net.edges):
        raise EngineError("bad-graph", "a loop: no proper coloring")
    nb = {v: {x for x, *_ in net.adj[v]} for v in net.ids}
    order = sorted(net.ids, key=lambda v: (-len(nb[v]), net.rank[v]))
    for k in range(1, len(order) + 1):
        col = {}

        def place(i):
            if i == len(order):
                return True
            v = order[i]
            for c in range(1, k + 1):
                if all(col.get(x) != c for x in nb[v]):
                    col[v] = c
                    if place(i + 1):
                        return True
                    del col[v]
            return False
        if place(0):
            return {"chromatic": k, "colors": {v: col[v] for v in net.ids}}
    raise EngineError("no-result", "no coloring")
