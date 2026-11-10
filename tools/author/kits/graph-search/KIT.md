# Kit: graph-search

BFS and DFS on a small graph: nodes, edges, a queue or a stack, and a step-by-step trace.

<!-- kit -->
```json
{
 "name": "graph-search",
 "description": "BFS and DFS on a small graph: nodes, edges, a queue or a stack, and a step-by-step trace.",
 "subjects": [
  "discrete",
  "cs"
 ],
 "components": {
  "marks": [
   "node",
   "edge",
   "text"
  ],
  "syms": [
   "arrayCell",
   "stackFrame"
  ],
  "ops": [
   "visit",
   "mark",
   "unmark",
   "highlightEdge",
   "enqueue",
   "dequeue",
   "push",
   "pop"
  ],
  "constraints": []
 },
 "examples": [
  {
   "file": "bfs.json",
   "invariants": [
    {
     "type": "visit_once"
    },
    {
     "type": "visits_follow_edges"
    }
   ]
  },
  {
   "file": "dfs.json",
   "invariants": [
    {
     "type": "visit_once"
    },
    {
     "type": "visits_follow_edges"
    }
   ]
  }
 ]
}
```

Approved: nodes, edges, labels, a queue (arrayCell) or a stack (stackFrame); trace ops visit, mark, unmark, highlightEdge, enqueue, dequeue, push, pop.

Write the trace by RUNNING the search (a short function at authoring time), then commit only the JSON (VISUAL-LANGUAGE.md §3). Never type a trace by hand.

Common errors (each one fails a check):
- A node visited twice, or one never visited.
- A visit that jumps: the node must be joined by an edge to a node visited before it.
- A highlightEdge on an edge id that doesn't exist (the semantic check catches it).

Invariants the gate tests:
- `visit_once`: every node mark is visited exactly once.
- `visits_follow_edges`: each visited node after the first shares an edge with an earlier visited node.
