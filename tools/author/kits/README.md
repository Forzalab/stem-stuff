# Kits (authoring only, never shipped)

These are progressive disclosure for the authoring LLM (design/VISUAL-LANGUAGE.md §5). The LLM first sees one line per kit (its
description). It loads a kit body only for the question's subject, or when it names the kit.

Each kit has two parts:
- `KIT.md`: one `<!-- kit -->` JSON block with name, description, subjects, the approved components, and the examples with their invariants. Then the prose: common errors and invariants.
- `examples/*.json`: full scenes (SCHEMA.md `<!-- schema: scene -->`).

`tests/scene.test.mjs` is the gate. For every example it checks four things:
- the schema;
- the meaning check (names, binds and ids are real);
- that it uses only its kit's components;
- the kit's invariants.

| kit | subjects | what |
|---|---|---|
| mechanics | physics.mechanics | bodies, ramps, springs, force vectors, projectiles |
| energy-bars | physics.mechanics | K, U_g, U_s as bars that trade height; the total never changes |
| graph-search | discrete, cs | BFS / DFS: nodes, edges, queue or stack, a trace written by running the search |
