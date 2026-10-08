# SCHEMA-V2: Cluck replies with blocks, ghosts, and 3 reveal levels

Status: DRAFT (agent S, gen-UI swarm, Oct 7 2026). Docs only. Bank fields in §3 are PROPOSALS: Tony alone edits banks.
Runtime (where it renders, graph.js, phone sheet, telemetry): `design/plans/RUNTIME.md`.
v1 (still the authoring format today): `SCHEMA.md` `<!-- schema: scene -->`, `design/VISUAL-LANGUAGE.md` §3, `design/VISUAL-GOALS.md`, `author/kits/*/KIT.md`.

> **North star (D69).** She comes back tomorrow because it felt good. A wrong pick must read as "a step", never a verdict.
> Every rule below that looks fussy (no value at L1, ghost never alone, no red, text first) is there for that.

## 0. Decisions this doc implements

| D | Rule | Where |
|---|---|---|
| D1 | Pregen first; live only fills gaps; live = data only | §6 |
| D8 | Two layouts: `short` (1–2 lines + visual) and `inter` (text / visual / text) | §1, §2 |
| D28 D35 | `ghost` is pregen per wrong option; it reaches the browser in the `/check` reply; `slip` text stays server-side | §3, §4 |
| D29 D39 | Cluck's L1 line names the slip flat, after wise feedback | §1 |
| D30 D42 | Exactly 3 reveal levels. L1 = ghost + true SHAPE (no value) + 1 line, no knob | §5 |
| D31 D41 | A right answer gets a small affirm thumbnail that never blocks Next | §2 (E11) |
| D32 D36 | Ghost only on `kind: concept`; a mechanical slip gets an algebra chip, no scene | §3, §4 |
| D37 | 2nd wrong pick = +1 level + a 2nd ghost | §5 |
| D38 | Last try = L3 + twin offer + re-queue | §5 |
| D18 | "Tell me everything" pref starts at L3, EXCEPT a re-queued Redeem Q starts at L1 | §5 |

## 1. The message: ordered blocks

A Cluck reply (`msg`) is `{v:2, q, pick, verdict, kind, layout, level, start, blocks:[…]}`. `blocks` is an ordered list; each block has `t`:

| `t` | Carries | Notes |
|---|---|---|
| `text` | `md` (≤280 chars, Markdown + `$…$`), `say` = `slip` / `normalize` / `step` / `affirm` / `joke` / `bridge` | `say` lets the gate enforce humor dose (§1 rule 8): no `joke` in a wrong-pick msg at L1, never first |
| `math` | `tex` (display), optional `missing` (the piece to highlight), `step` n | the L2 key step, L3 worked lines |
| `scene` | `id`, `src` = `pregen` / `live`, `role` = `explain` / `affirm`, `size` = `full` / `thumb`, `alt`, `spec` (a scene-v2) | arrives COMPLETE, never partial |
| `ghost` | `on` = `question` or a scene `id`, `n` = 1 / 2, `data` (the ghost from `/check`) | an overlay: dashed grey marks + the truth shape |
| `chip` | `tex` (the whole line), `missing` (the piece she dropped), `line` | mechanical slips only (D32) |
| `reveal` | `level` 1–3, `offer` (buttons), `valueOn` (what unlocks the value), `value` (L3 only), `twin`, `requeue` | the control strip under the visual |

**Layouts (D8).** Same blocks, two orders. The variant pages (`?t=short|inter`) pick one; the gate checks the shape.
- `short`: `text` (≤2 lines) → visual (`ghost` / `scene` / `chip`) → `reveal`.
- `inter`: `text` → visual → `text` (or `math`) → `reveal`.

**Streaming order (AG-UI / A2UI ideas, cheap version).** The `/explain` stream stays plain text (what `app.js:1146` reads today). A non-text
block travels as ONE record: ASCII RS `\x1e` + one JSON line + `\n` (RFC 7464 JSON text sequences). Rules:
1. Text first. Pregen visuals do not wait for the stream: they come from `/check` and are laid out at 0 ms (RUNTIME.md §2).
2. A `scene` record is sent only after it passed the gate (§6), whole. The client buffers bytes after RS until `\n`; a partial record is never parsed or drawn (A2UI's `beginRendering` idea: render only when complete).
3. If a record fails `JSON.parse` or the client-side schema check, it is dropped silently and the reply ends as text (+ the L3 static figure when the level allows).
4. No JSON Patch / state deltas (AG-UI `STATE_DELTA`): a scene is small (1–3 KB) and replaced whole. Not worth the code.

What I did NOT adopt (web check, Oct 7): MCP Apps / MCP-UI (`ui://` HTML resources in a sandboxed iframe = free code, breaks D1/invariant 1);
OpenGenerativeUI's streamed HTML + Idiomorph preview (same reason; the repo is still a Next.js 16 / CopilotKit v2 showcase); A2UI's component
tree (`surfaceUpdate` / `dataModelUpdate`) for layout (our message is a flat list; one renderer). Kept: AG-UI's "message start → content → end,
tool call = a complete unit" boundary; A2UI's "catalog + data, render on complete".

## 2. JSON examples (all validate; command + output in §8)

### E1. `/check` wrong, concept slip (Exam 2 Q4, PHYS_KWV pick d = 80 J; key c = 60 J)
Figure coordinates = the question's own grid squares (x 0–8, F 0–4; 1 square = 2.5 J). The ghost is the full 8×4 box (32 squares = her 80 J: the triangle
counted as a whole box); the truth is the rectangle + triangle, solid, NO value label.
<!-- v2: check kwv-d -->
```json
{"verdict":"wrong","triesLeft":1,"gen":3,"hint":"Count the triangle as half its box.","kind":"concept",
 "ghost":{"pick":"d","kind":"concept","label":"your 80 J","value":80,"unit":"J","on":"question","fit":"fixed",
  "line":"Your 80 J counts the triangle as a full box.",
  "marks":[
   {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false},
   {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
   {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"}]}}
```

### E2. `/check` wrong, mechanical slip (PHYS_6AA pick a = "Multiplied: 40.0", P = W/t)
No ghost, no scene: an algebra chip with the dropped piece marked.
<!-- v2: check 6aa-a -->
```json
{"verdict":"wrong","triesLeft":1,"gen":5,"hint":"Power is work per second.","kind":"mechanical",
 "chip":{"tex":"P = \\frac{W}{t}","missing":"\\div t","line":"The picture was right; the last step multiplied where it divides."}}
```

### E3. `/check` correct, with the affirm thumbnail (PHYS_KWV pick c = 60 J)
<!-- v2: check kwv-c -->
```json
{"verdict":"correct","triesLeft":1,"gen":4,
 "affirm":{"on":"question","line":"Yep: box plus half a box.","label":"60 J",
  "marks":[
   {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false},
   {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false,"label":"60 J"}]}}
```

### E4. Cluck msg, L1, `short` (the E1 ghost on the question's own figure)
<!-- v2: msg kwv-d-L1-short -->
```json
{"v":2,"q":"PHYS_KWV","pick":"d","verdict":"wrong","kind":"concept","layout":"short","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"Tricky one, and you can get it. Your 80 J (dashed) counts the triangle as a **full box**."},
  {"t":"ghost","on":"question","n":1,"data":{"pick":"d","kind":"concept","label":"your 80 J","value":80,"unit":"J","on":"question","fit":"fixed",
    "line":"Your 80 J counts the triangle as a full box.",
    "marks":[
     {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false},
     {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
     {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"}]}},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E5. Cluck msg, L2, `inter`: 2nd wrong (a = 40 J after d = 80 J) = +1 level + a 2nd ghost (D37) + the grab handle
The handle starts at HER number (t = 4: the rectangle only = her 40 J) and the readout shows the value only once she grabs it.
<!-- v2: msg kwv-a-L2-inter -->
```json
{"v":2,"q":"PHYS_KWV","pick":"a","verdict":"wrong","kind":"concept","layout":"inter","level":2,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"You saw the rectangle right. This time the triangle went missing: your 40 J stops at B."},
  {"t":"scene","id":"s1","src":"pregen","role":"explain","size":"full","alt":"F–x graph: blue rectangle and triangle; dashed grey box over the triangle (your 80 J) and a dashed line at B (your 40 J); a handle you drag from B to C.",
   "spec":{"v":2,"view":{"x":[0,8.8],"y":[-1,5]},"fit":"fixed",
    "goal":{"pick":"a","kind":"concept","slip":"left out the triangle","skill":"area_decompose","see":"the readout grows past 40 J as the line walks from B to C","say":"the work is the whole area, box plus half a box","predict":"Past B, does the work keep growing?","approach":"poe"},
    "params":{"t":{"min":0,"max":8,"step":0.5,"init":4,"unit":"sq"}},
    "derive":{"W":"t <= 4 ? 2.5*4*t : 40 + 2.5*(4*(t-4) - 0.5*(t-4)^2)"},
    "marks":[
     {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false},
     {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
     {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"},
     {"id":"gh_rect","mark":"poly","role":"ghost","pick":"a","pts":[[0,0],[0,4],[4,4],[4,0]],"dash":true,"color":"muted","label":"your 40 J"},
     {"id":"tline","mark":"vline","role":"handle","x":"=t","color":"mark"},
     {"id":"wread","mark":"text","role":"readout","at":[6,4.6],"text":"=W","color":"mark"}],
    "handles":[{"bind":"t","on":"tline","constraint":"onX","snap":0.5,"start":"pick"}],
    "reveal":[{"after":"grab","show":["wread"]}]}},
  {"t":"math","step":1,"tex":"W = \\underbrace{4\\cdot 4}_{\\text{box}} + \\underbrace{\\tfrac12\\cdot 4\\cdot 4}_{\\text{half a box}}\\ \\text{squares}"},
  {"t":"reveal","level":2,"offer":["retry","tellme"],"valueOn":["grab","retry","tellme"]}]}
```

### E6. Cluck msg, L1, `inter`, own scene: Ferris PHYS_8VQ pick b = 355 N (added the parts; key 286 N)
The question figure (wheel) can't show a vector sum, so the ghost lives in a small scene (1 unit = 100 N). Truth = the right-triangle sum
(no value); ghost = the two parts laid end to end.
<!-- v2: msg 8vq-b-L1-inter -->
```json
{"v":2,"q":"PHYS_8VQ","pick":"b","verdict":"wrong","kind":"concept","layout":"inter","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"This one is built to bait adding. Your 355 N lays the two pushes **end to end** (dashed)."},
  {"t":"scene","id":"s1","src":"pregen","role":"explain","size":"full","alt":"Up arrow 2.74 long and a sideways arrow 0.81; the solid blue sum is the slanted side of the right triangle; a dashed grey line 3.55 long is your 355 N.",
   "spec":{"v":2,"fit":"widen",
    "goal":{"pick":"b","kind":"concept","slip":"added perpendicular parts as numbers","see":"the dashed line is longer than the solid slanted side","say":"pushes at right angles add as a triangle, not a line"},
    "marks":[
     {"id":"up","mark":"arrow","role":"given","from":[0,0],"to":[0,2.74],"color":"c1","label":"$274\\ \\text{N}$"},
     {"id":"side","mark":"arrow","role":"given","from":[0,2.74],"to":[0.806,2.74],"color":"c1","label":"$80.6\\ \\text{N}$"},
     {"id":"sum","mark":"arrow","role":"truth","from":[0,0],"to":[0.806,2.74],"color":"c1","dash":false},
     {"id":"gh_line","mark":"seg","role":"ghost","pick":"b","from":[-0.5,0],"to":[-0.5,3.55],"dash":true,"color":"muted","label":"your 355 N"}]}},
  {"t":"text","say":"normalize","md":"Pushes at right angles share the work, so the total is shorter than the sum."},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E7. Out of bounds: orbit PHYS_H3A pick e (r = 5R_E; the question figure draws r = 4R_E)
5/4 = 1.25 ≤ the 1.35 widen cap, so the scene widens (truth stays ≥74% of its size). Past the cap a ghost uses `offscale: "edge"` (clamped to
the frame edge with a break chevron and its label, RUNTIME.md §3).
<!-- v2: msg h3a-e-L1-short -->
```json
{"v":2,"q":"PHYS_H3A","pick":"e","verdict":"wrong","kind":"concept","layout":"short","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"Close: you added a radius. Your orbit (dashed) adds **two**, so it sits one Earth too far out."},
  {"t":"ghost","on":"question","n":1,"data":{"pick":"e","kind":"concept","label":"your 5R_E","value":5,"unit":"R_E","on":"question","fit":"widen",
    "line":"Your r counts two Earth radii on top of the altitude.",
    "marks":[
     {"id":"tr_r","mark":"seg","role":"truth","from":[0,0],"to":[0,4],"color":"c2","dash":false},
     {"id":"gh_orbit","mark":"arc","role":"ghost","pick":"e","at":[0,0],"r":5,"from":0,"to":360,"dash":true,"color":"muted","label":"your 5R_E","offscale":"widen"}]}},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E8. Symbolic: Ferris PHYS_8U2 (answers are formulas like $mg - mr\omega^2$; no numbers to scale)
`scale: "schematic"`: lengths are a made-up ratio, every label is symbolic, a "not to scale" tag is drawn. The ghost shows only the DIRECTION her
formula implies (her "+" = the centripetal pull pointing away from the hub at the top).
<!-- v2: msg 8u2-L1-short -->
```json
{"v":2,"q":"PHYS_8U2","pick":"c","verdict":"wrong","kind":"concept","layout":"short","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"Your sign makes the pull at the top point **away** from the hub (dashed). It points to the center."},
  {"t":"scene","id":"s1","src":"pregen","role":"explain","size":"full","alt":"Seat at the top of the wheel: solid arrow down toward the hub labelled m r omega squared; dashed grey arrow up labelled your plus sign. Not to scale.",
   "spec":{"v":2,"scale":"schematic","fit":"fixed",
    "goal":{"pick":"c","kind":"concept","slip":"centripetal term with the wrong sign at the top","see":"the dashed pull points away from the hub","say":"the net pull at the top points to the center"},
    "marks":[
     {"id":"hub","mark":"pivot","role":"given","at":[0,0]},
     {"id":"rim","mark":"arc","role":"given","at":[0,0],"r":3,"from":0,"to":360,"dash":true,"color":"muted"},
     {"id":"ac","mark":"arrow","role":"truth","from":[0,3],"to":[0,1.8],"color":"c3","dash":false},
     {"id":"gh_ac","mark":"arrow","role":"ghost","pick":"c","from":[0.4,3],"to":[0.4,4.2],"dash":true,"color":"muted","label":"your $+mr\\omega^2$"},
     {"id":"nts","mark":"text","role":"guide","at":[2.6,-2.8],"text":"not to scale","color":"muted"}]}},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E9. Mechanical slip msg (E2): chip, no scene, no ghost
<!-- v2: msg 6aa-a-L1-chip -->
```json
{"v":2,"q":"PHYS_6AA","pick":"a","verdict":"wrong","kind":"mechanical","layout":"short","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"Your work number was right. The last step multiplied by the time; power **divides** by it."},
  {"t":"chip","tex":"P = \\frac{W}{t}","missing":"\\div t","line":"The picture was right; the last step multiplied where it divides."},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E10. Last try burned (D38): L3 + static figure + twin + re-queue
<!-- v2: msg kwv-d-L3-last -->
```json
{"v":2,"q":"PHYS_KWV","pick":"d","verdict":"wrong","kind":"concept","layout":"inter","level":3,"start":"last_try",
 "blocks":[
  {"t":"text","say":"slip","md":"This one trips most people: the triangle is half its box. Here is the whole thing."},
  {"t":"scene","id":"s1","src":"pregen","role":"explain","size":"full","alt":"F–x graph: blue rectangle 40 J and blue triangle 20 J; dashed grey box your 80 J.",
   "spec":{"v":2,"view":{"x":[0,8.8],"y":[-1,5]},"fit":"fixed",
    "goal":{"pick":"d","kind":"concept","see":"the dashed box is the triangle counted whole","say":"a triangle is half its box"},
    "marks":[
     {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false,"label":"40 J"},
     {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false,"label":"20 J"},
     {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"}]}},
  {"t":"math","step":1,"tex":"W = (4\\cdot4 + \\tfrac12\\cdot4\\cdot4)\\ \\text{sq} \\times 2.5\\ \\tfrac{\\text{J}}{\\text{sq}} = 24 \\times 2.5 = 60\\ \\text{J}"},
  {"t":"reveal","level":3,"value":"$60\\ \\text{J}$","offer":["twin","next"],"valueOn":["now"],"twin":"PHYS_YGH","requeue":true}]}
```

### E11. Right answer: affirm thumbnail, never blocks Next (D31/D41)
<!-- v2: msg kwv-c-affirm -->
```json
{"v":2,"q":"PHYS_KWV","pick":"c","verdict":"correct","kind":"none","layout":"short","start":"default",
 "blocks":[
  {"t":"text","say":"affirm","md":"Yep, box plus half a box. QUACK."},
  {"t":"scene","id":"a1","src":"pregen","role":"affirm","size":"thumb","blocking":false,"alt":"Blue rectangle plus blue triangle, 60 J.",
   "spec":{"v":2,"fit":"fixed","marks":[
     {"id":"tr_rect","mark":"poly","role":"truth","pts":[[0,0],[0,4],[4,4],[4,0]],"fill":true,"color":"c1","dash":false},
     {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false,"label":"60 J"}]}}]}
```

### E12. Live gap (D1): a typed answer that matches no buggy rule (calc ∫ area, a made-up Q code)
`src: "live"` = made now from the loaded kits only, gated in ≤1500 ms, `gate` records what passed. Fallback on any fail: text + L3 (§6).
<!-- v2: msg live-gap -->
```json
{"v":2,"q":"CALC_INT3","pick":null,"verdict":"wrong","kind":"concept","layout":"short","level":1,"start":"default",
 "blocks":[
  {"t":"text","say":"slip","md":"Your 7 looks like the area **above** the axis only. The dashed part below counts negative."},
  {"t":"scene","id":"s1","src":"live","role":"explain","size":"full","alt":"Curve crossing the axis; solid area above, solid area below, dashed outline of your 7 over the top part only.",
   "gate":{"ms":640,"kits":["xy-area"],"checks":["schema","live","names","kit","ghost_pair","no_value_L1"]},
   "spec":{"v":2,"view":{"x":[0,4],"y":[-3,4]},"fit":"fixed",
    "goal":{"kind":"concept","see":"the dashed outline covers only the part above the axis","say":"area below the axis counts negative"},
    "marks":[
     {"id":"curve","mark":"fn","role":"given","param":"s","x":"s","y":"3 - s^2","color":"c2"},
     {"id":"tr_up","mark":"shade","role":"truth","color":"c1","dash":false},
     {"id":"tr_dn","mark":"shade","role":"truth","color":"c3","dash":false},
     {"id":"gh_up","mark":"poly","role":"ghost","pick":"x","pts":[[0,0],[0,3],[2,3],[2,0]],"dash":true,"color":"muted","label":"your 7"}]}},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E13. A re-queued Redeem Q under the "tell me everything" pref still starts at L1 (D18 exception)
<!-- v2: msg redeem-L1 -->
```json
{"v":2,"q":"PHYS_KWV","pick":"d","verdict":"wrong","kind":"concept","layout":"short","level":1,"start":"redeem","redeem":true,"pref":"tellme",
 "blocks":[
  {"t":"text","say":"slip","md":"Same trap as last time, and you came back for it. Your 80 J (dashed) is the full box."},
  {"t":"ghost","on":"question","n":1,"data":{"pick":"d","kind":"concept","label":"your 80 J","value":80,"unit":"J","on":"question","fit":"fixed",
    "line":"Your 80 J counts the triangle as a full box.",
    "marks":[
     {"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
     {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"}]}},
  {"t":"reveal","level":1,"offer":["retry","tellme"],"valueOn":["retry","tellme"]}]}
```

### E14. Bank proposal for one question (PHYS_KWV): what Tony would add (§3)
<!-- v2: bankq kwv -->
```json
{"code":"PHYS_KWV","topic":"work.fx_area","parent":"EX2_Q4",
 "saccharine":{
  "slip":{"a":"Counted the rectangle only: 40.0.","b":"Counted the triangle only: 20.0.","d":"Forgot the 1/2 on the triangle (16 + 16 = 32 squares): 80.0.","e":"Counted grid squares as 1 m: 24.0."},
  "kind":{"a":"concept","b":"concept","d":"concept","e":"mechanical"},
  "ghost":{
   "a":{"pick":"a","kind":"concept","label":"your 40 J","value":40,"unit":"J","on":"question","fit":"fixed","line":"Your 40 J stops at B: the triangle went missing.",
    "marks":[{"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
             {"id":"gh_rect","mark":"poly","role":"ghost","pick":"a","pts":[[0,0],[0,4],[4,4],[4,0]],"dash":true,"color":"muted","label":"your 40 J"}]},
   "d":{"pick":"d","kind":"concept","label":"your 80 J","value":80,"unit":"J","on":"question","fit":"fixed","line":"Your 80 J counts the triangle as a full box.",
    "marks":[{"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false},
             {"id":"gh_box","mark":"poly","role":"ghost","pick":"d","pts":[[0,0],[0,4],[8,4],[8,0]],"dash":true,"color":"muted","label":"your 80 J"}]}},
  "chip":{"e":{"tex":"1\\ \\text{sq} = 2.5\\ \\text{m}\\times 1\\ \\text{N} = 2.5\\ \\text{J}","missing":"\\times 2.5","line":"The area was right; each square is 2.5 J, not 1."}},
  "affirm":{"on":"question","line":"Yep: box plus half a box.","label":"60 J",
   "marks":[{"id":"tr_tri","mark":"poly","role":"truth","pts":[[4,0],[4,4],[8,0]],"fill":true,"color":"c1","dash":false,"label":"60 J"}]}}}
```

## 3. Bank fields (PROPOSAL; Tony applies)

Per question (top level): `topic` (dotted, e.g. `work.fx_area`, feeds the D49 queue weight) and `parent` (the exam item or family the Q
belongs to, e.g. `EX2_Q4`; twins and sub rows share it).

Inside `saccharine` (server-side layer; `view()` already strips it, serve.py:305–311), next to the existing `slip` (unchanged, string per letter,
so `serve.py:926` keeps working):
- `kind: {letter: "concept" | "mechanical"}`. **Rule:** the slip changes her physics PICTURE (what the area is, which way a force points, what r
  is) → `concept`. The picture is right but the math broke (dropped 2π, ÷60 not ÷3600, ×t not ÷t, arithmetic, grid unit) → `mechanical`.
  Missing `kind` = `mechanical` (safe: no ghost is ever invented).
- `ghost: {letter: ghost}` for `concept` letters only (schema `$defs/ghost`). Pregen, reviewed, gated like any scene.
- `chip: {letter: chip}` for `mechanical` letters (`tex`, `missing`, `line`).
- `affirm`: one mini-overlay for the right answer (D31/D41).
- Why parallel maps, not `slip: {d: {text, kind}}`: the string `slip` is read in 4 places in serve.py and by the bank builder; parallel maps need
  zero changes to existing readers. If Tony prefers nesting, the schema's `$defs/bankq` changes in one place.

## 4. The `/check` reply (D35)

Today (`serve.py:786`): `{verdict, triesLeft, hint, gen, error?, struck?, fixWrong?, repeat?, part?}`. New optional fields:
- wrong: `kind` (`concept` | `mechanical`), and exactly one of `ghost` (concept) or `chip` (mechanical). E1, E2.
- correct: `affirm`. E3.

Server path (for whoever builds it): `/check` grades `view(p, mode)` (serve.py:1274), which has no `saccharine`. In `grade()` after `_grade()`
returns `wrong`, look up `sugar(lookup(code, mode))` by the picked id (`body["choice"]`; pick-all: `out["struck"]`) and copy only
`kind[pick]` + `ghost[pick]` or `chip[pick]`. Never the `slip` text, never another letter's ghost, never `key`. A typed answer gets a ghost
only through a matched buggy rule (gen-ui-spec §2b) and otherwise none (the live gap, §6). Sugar mode only (diet has no layer).

Leak note (decided here, flag for Tony): the L1 ghost carries HER value and the truth SHAPE, never the true value. The L2 scene's `derive`
can compute the value once she grabs the handle; that is the D42 "value on the grab-handle" rule by design. L3's `value` comes in the
`msg` only at level 3.

## 5. Reveal spectrum: exactly 3 levels (D30/D42)

| Level | Visual | Words | Value |
|---|---|---|---|
| **L1** | her ghost (dashed grey, "your 80 J") beside the true SHAPE (solid, coloured, no value label). No knob. | 1 line (wise feedback + the slip, flat) | hidden. Unlocks on retry, or "Just tell me" |
| **L2** | L1 + one grab handle (starts at her numbers, ≥48 dp) + a 2nd ghost if a 2nd wrong pick | + the key step in LaTeX (`math`) | on grab (the readout), retry, tell me |
| **L3** | full worked solution + a static figure (truth WITH value labels, ghosts kept) | worked lines | shown (`value`) |

Start level (first match wins):
1. `redeem` (a re-queued Redeem Q) → **L1**, always, even with the tell-me pref (the spaced return is where retrieval happens).
2. Last try burned (incl. a 2-choice MC: 1 try) → **L3** + `twin` + `requeue: true` (D38).
3. Tell-me pref on (3 skips in a row, D18) → **L3**.
4. 2nd wrong pick on the same Q → previous level **+1** and the 2nd ghost (`n: 2`) if that pick is `concept` (D37).
5. Else → **L1**.
"Just tell me" (always visible, D18) jumps to L3 for this Q; it counts as a skip for the pref. Any real interaction (drag, retry) resets the
skip count. `kind: mechanical` uses the same levels with a chip instead of a ghost: L1 chip, L2 chip + key step, L3 worked lines + the
question's static figure.

## 6. Live-gap profile (D1)

Live runs ONLY when no pregen covers the case: a typed answer with no buggy-rule match, or a chat ask no pregen visual answers.
1. **Inputs** (typed answer, chat text) pass `INJECT_RE` (serve.py:1092) first; a hit → no live scene, text only. Inputs are fenced (spotlighting) as `/chat` does.
2. **Data only**: the model returns one `scene` spec, validated against `$defs/liveScene`: closed enums, ≤16 marks, a closed key list per mark, no `trace`, no `timeline` (no demo in live), labels ≤40 chars and no `<`.
3. **Kit components only**: every `mark` / `sym` / handle constraint is in the kits the bank profile loads (`profile.kits`), checked like `uses()` in `tests/scene.test.mjs`.
4. **Same semantic gate as pregen**: names compile in math.js, binds real, ghost never alone, ghost only on concept, no value label at L1.
5. **ms gate**: model call + gate ≤ **1500 ms** wall clock (server timer). Over → abort.
6. **Fallback** on any fail or timeout: the message ends as text, and the reveal strip offers L3 (worked steps + the question's static figure). Nothing half-drawn ever reaches her.
7. Live output is logged (code, pick/typed value, spec, gate result) for Tony to promote into the bank as pregen.

## 7. The schema

`$id: scene-v2`. Root = a scene. The examples validate against `$defs/check`, `$defs/msg`, `$defs/bankq`. v2 is v1 plus: `v: 2`, mark
`role` (`given` / `truth` / `ghost` / `guide` / `handle` / `readout`), `pick`, `offscale`, scene `fit` (`fixed` / `widen`) and `scale`
(`true` / `schematic`), handle `start` (`pick` = her numbers), reveal `after` += `retry` / `grab` / `tellme` / `level:n`. The colour enum
drops `bad` (no red in a visual). A ghost mark MUST be dashed, `muted`, have a `pick` and a label starting "your ". A truth mark is solid
and never `muted`.

<!-- schema: scene-v2 -->
```json
{
 "$schema": "https://json-schema.org/draft/2020-12/schema",
 "$id": "scene-v2",
 "title": "stem-stuff scene v2 + Cluck message blocks + /check ghost + bank proposal (design/plans/SCHEMA-V2.md)",
 "$ref": "#/$defs/scene",
 "$defs": {
  "name": {"type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]*$"},
  "pick": {"type": "string", "pattern": "^[a-z]$"},
  "code": {"type": "string", "pattern": "^[A-Z0-9_]{3,40}$"},
  "range": {"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}], "items": false, "minItems": 2},
  "val": {"oneOf": [{"type": "number"}, {"type": "string", "pattern": "^="}]},
  "ease": {"enum": ["linear", "inOut", "out", "step"]},
  "color": {"enum": ["ink", "muted", "c1", "c2", "c3", "ok", "mark"]},
  "role": {"enum": ["given", "truth", "ghost", "guide", "handle", "readout"]},
  "label": {"type": "string", "minLength": 1, "maxLength": 40, "pattern": "^[^<>]*$"},
  "markName": {"enum": ["fn", "param", "shade", "tangent", "vline", "hline", "point", "seg", "line", "arrow", "arc", "poly", "path", "rect", "circle", "text", "tex", "node", "edge", "bar", "body", "spring", "pulley", "rope", "surface", "incline", "force", "pivot", "axes"]},
  "symName": {"enum": ["block", "cart", "ball", "spring", "pulley", "incline", "ground", "vector", "gate:AND", "gate:OR", "gate:NOT", "gate:XOR", "state", "arrayCell", "stackFrame"]},
  "mark": {
   "type": "object",
   "required": ["id"],
   "properties": {
    "id": {"$ref": "#/$defs/name"},
    "mark": {"$ref": "#/$defs/markName"},
    "sym": {"$ref": "#/$defs/symName"},
    "role": {"$ref": "#/$defs/role"},
    "pick": {"$ref": "#/$defs/pick"},
    "label": {"$ref": "#/$defs/label"},
    "color": {"$ref": "#/$defs/color"},
    "dash": {"type": "boolean"},
    "fill": {"type": "boolean"},
    "offscale": {"enum": ["widen", "edge"]}
   },
   "oneOf": [{"required": ["mark"], "not": {"required": ["sym"]}}, {"required": ["sym"], "not": {"required": ["mark"]}}],
   "allOf": [
    {"if": {"required": ["role"], "properties": {"role": {"const": "ghost"}}},
     "then": {"required": ["pick", "label", "dash", "color"], "properties": {"dash": {"const": true}, "color": {"const": "muted"}, "label": {"pattern": "^your "}}}},
    {"if": {"required": ["role"], "properties": {"role": {"const": "truth"}}},
     "then": {"required": ["color"], "properties": {"dash": {"const": false}, "color": {"not": {"const": "muted"}}}}}
   ]
  },
  "liveMark": {
   "allOf": [{"$ref": "#/$defs/mark"}],
   "propertyNames": {"enum": ["id", "mark", "sym", "role", "pick", "label", "param", "color", "dash", "fill", "offscale", "at", "from", "to", "pts", "r", "x", "y", "text", "anchor", "w", "shape"]}
  },
  "scene": {
   "type": "object",
   "required": ["v", "marks"],
   "additionalProperties": false,
   "properties": {
    "v": {"const": 2},
    "goal": {"type": "object", "required": ["see", "say"], "additionalProperties": false, "properties": {
      "pick": {"$ref": "#/$defs/pick"}, "slip": {"type": "string", "minLength": 1}, "skill": {"type": "string", "pattern": "^[a-z_]+$"},
      "see": {"type": "string", "minLength": 1}, "say": {"type": "string", "minLength": 1}, "predict": {"type": "string", "minLength": 1}, "approach": {"const": "poe"},
      "kind": {"enum": ["concept", "mechanical"]}}},
    "view": {"type": "object", "required": ["x", "y"], "additionalProperties": false, "properties": {"x": {"$ref": "#/$defs/range"}, "y": {"$ref": "#/$defs/range"}}},
    "fit": {"enum": ["fixed", "widen"]},
    "scale": {"enum": ["true", "schematic"]},
    "params": {"type": "object", "propertyNames": {"$ref": "#/$defs/name"}, "additionalProperties": {"type": "object", "required": ["min", "max", "init"], "additionalProperties": false,
      "properties": {"min": {"type": "number"}, "max": {"type": "number"}, "step": {"type": "number", "exclusiveMinimum": 0}, "init": {"type": "number"}, "unit": {"type": "string", "maxLength": 12}}}},
    "derive": {"type": "object", "propertyNames": {"$ref": "#/$defs/name"}, "additionalProperties": {"type": "string", "minLength": 1}},
    "marks": {"type": "array", "minItems": 1, "maxItems": 40, "items": {"$ref": "#/$defs/mark"}},
    "handles": {"type": "array", "maxItems": 1, "items": {"type": "object", "required": ["bind", "on", "constraint"], "additionalProperties": false, "properties": {
      "bind": {"$ref": "#/$defs/name"}, "on": {"type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z]+)?$"},
      "constraint": {"type": "string", "pattern": "^(free|onX|onY|onPath:[A-Za-z_][A-Za-z0-9_]*|radial:\\[-?[0-9.]+,-?[0-9.]+\\])$"},
      "snap": {"type": "number", "exclusiveMinimum": 0}, "start": {"enum": ["pick", "init"]}}}},
    "knobs": {"type": "array", "items": {"type": "object", "required": ["bind", "kind"], "additionalProperties": false, "properties": {
      "bind": {"$ref": "#/$defs/name"}, "kind": {"enum": ["slider", "stepper", "toggle", "select"]}, "label": {"type": "string"}, "options": {"type": "array", "items": {"type": "number"}, "minItems": 2}}}},
    "timeline": {"type": "object", "additionalProperties": false, "properties": {
      "keys": {"type": "array", "items": {"type": "object", "required": ["at", "set"], "additionalProperties": false, "properties": {
        "at": {"type": "number", "minimum": 0}, "set": {"type": "object", "propertyNames": {"$ref": "#/$defs/name"}, "additionalProperties": {"type": "number"}}, "ease": {"$ref": "#/$defs/ease"}}}},
      "drive": {"type": "object", "required": ["param", "from", "to", "dur"], "additionalProperties": false, "properties": {
        "param": {"$ref": "#/$defs/name"}, "from": {"$ref": "#/$defs/val"}, "to": {"$ref": "#/$defs/val"}, "dur": {"type": "number", "exclusiveMinimum": 0, "maximum": 20000}, "ease": {"$ref": "#/$defs/ease"}}},
      "stepMs": {"type": "number", "minimum": 100, "maximum": 5000}, "ease": {"$ref": "#/$defs/ease"},
      "controls": {"type": "array", "items": {"enum": ["prev", "play", "next", "reset"]}, "uniqueItems": true}}},
    "trace": {"type": "array", "maxItems": 200, "items": {"type": "object", "required": ["op", "args"], "additionalProperties": false, "properties": {
      "op": {"enum": ["visit", "mark", "unmark", "swap", "set", "push", "pop", "highlightEdge", "enqueue", "dequeue", "gateOut"]},
      "args": {"type": "array", "minItems": 1, "items": {"type": ["string", "number", "boolean"]}}, "note": {"type": "string"}}}},
    "reveal": {"type": "array", "items": {"type": "object", "required": ["after", "show"], "additionalProperties": false, "properties": {
      "after": {"type": "string", "pattern": "^(answer|interact|retry|grab|tellme|level:[123]|step:[0-9]+|param:.+)$"},
      "show": {"type": "array", "minItems": 1, "items": {"type": "string"}}}}}
   },
   "if": {"properties": {"marks": {"contains": {"required": ["role"], "properties": {"role": {"const": "ghost"}}}}}},
   "then": {"required": ["goal"], "properties": {"goal": {"required": ["kind"], "properties": {"kind": {"const": "concept"}}}}}
  },
  "liveScene": {
   "allOf": [{"$ref": "#/$defs/scene"}],
   "not": {"anyOf": [{"required": ["trace"]}, {"required": ["timeline"]}]},
   "properties": {"marks": {"maxItems": 16, "items": {"$ref": "#/$defs/liveMark"}}}
  },
  "overlay": {
   "type": "object",
   "required": ["on", "marks"],
   "properties": {
    "on": {"const": "question"},
    "fit": {"enum": ["fixed", "widen"]},
    "line": {"type": "string", "minLength": 1, "maxLength": 120},
    "label": {"$ref": "#/$defs/label"},
    "marks": {"type": "array", "minItems": 1, "maxItems": 12, "items": {"$ref": "#/$defs/mark"}}
   }
  },
  "ghost": {
   "type": "object",
   "required": ["pick", "kind", "label", "line", "on", "marks"],
   "additionalProperties": false,
   "properties": {
    "pick": {"$ref": "#/$defs/pick"},
    "kind": {"const": "concept"},
    "label": {"allOf": [{"$ref": "#/$defs/label"}, {"pattern": "^your "}]},
    "value": {"type": "number"},
    "unit": {"type": "string", "maxLength": 12},
    "on": {"const": "question"},
    "fit": {"enum": ["fixed", "widen"]},
    "line": {"type": "string", "minLength": 1, "maxLength": 120},
    "marks": {"type": "array", "minItems": 2, "maxItems": 12, "items": {"$ref": "#/$defs/mark"},
     "contains": {"required": ["role"], "properties": {"role": {"const": "ghost"}}}}
   }
  },
  "chip": {
   "type": "object",
   "required": ["tex", "missing", "line"],
   "additionalProperties": false,
   "properties": {"tex": {"type": "string", "minLength": 1}, "missing": {"type": "string", "minLength": 1}, "line": {"type": "string", "minLength": 1, "maxLength": 120}}
  },
  "affirm": {
   "type": "object",
   "required": ["on", "line", "label", "marks"],
   "additionalProperties": false,
   "properties": {"on": {"const": "question"}, "line": {"type": "string", "minLength": 1, "maxLength": 80}, "label": {"$ref": "#/$defs/label"},
    "marks": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"$ref": "#/$defs/mark"}}}
  },
  "check": {
   "type": "object",
   "required": ["verdict", "triesLeft"],
   "additionalProperties": false,
   "properties": {
    "verdict": {"enum": ["correct", "wrong", "locked", "invalid"]},
    "triesLeft": {"type": "integer", "minimum": 0},
    "gen": {"type": "integer"},
    "hint": {"type": "string"},
    "error": {"type": "string"},
    "struck": {"type": "string"},
    "fixWrong": {"type": "string"},
    "repeat": {"const": true},
    "part": {"type": "integer"},
    "kind": {"enum": ["concept", "mechanical"]},
    "ghost": {"$ref": "#/$defs/ghost"},
    "chip": {"$ref": "#/$defs/chip"},
    "affirm": {"$ref": "#/$defs/affirm"}
   },
   "allOf": [
    {"if": {"required": ["ghost"]}, "then": {"required": ["kind"], "properties": {"kind": {"const": "concept"}, "verdict": {"const": "wrong"}}, "not": {"required": ["chip"]}}},
    {"if": {"required": ["chip"]}, "then": {"required": ["kind"], "properties": {"kind": {"const": "mechanical"}, "verdict": {"const": "wrong"}}}},
    {"if": {"required": ["affirm"]}, "then": {"properties": {"verdict": {"const": "correct"}}}}
   ]
  },
  "block": {
   "type": "object",
   "required": ["t"],
   "properties": {"t": {"enum": ["text", "math", "scene", "ghost", "chip", "reveal"]}},
   "allOf": [
    {"if": {"properties": {"t": {"const": "text"}}}, "then": {"required": ["md", "say"], "additionalProperties": false, "properties": {
      "t": true, "md": {"type": "string", "minLength": 1, "maxLength": 280}, "say": {"enum": ["slip", "normalize", "step", "affirm", "joke", "bridge"]}}}},
    {"if": {"properties": {"t": {"const": "math"}}}, "then": {"required": ["tex"], "additionalProperties": false, "properties": {
      "t": true, "tex": {"type": "string", "minLength": 1}, "missing": {"type": "string"}, "step": {"type": "integer", "minimum": 1}}}},
    {"if": {"properties": {"t": {"const": "scene"}}}, "then": {"required": ["id", "src", "role", "size", "alt", "spec"], "additionalProperties": false, "properties": {
      "t": true, "id": {"$ref": "#/$defs/name"}, "src": {"enum": ["pregen", "live"]}, "role": {"enum": ["explain", "affirm"]}, "size": {"enum": ["full", "thumb"]},
      "blocking": {"const": false}, "alt": {"type": "string", "minLength": 10, "maxLength": 300}, "spec": {"$ref": "#/$defs/scene"},
      "gate": {"type": "object", "required": ["ms", "checks"], "additionalProperties": false, "properties": {
        "ms": {"type": "number", "minimum": 0, "maximum": 1500}, "kits": {"type": "array", "items": {"type": "string"}}, "checks": {"type": "array", "items": {"type": "string"}}}}},
      "allOf": [
       {"if": {"properties": {"src": {"const": "live"}}}, "then": {"required": ["gate"], "properties": {"spec": {"$ref": "#/$defs/liveScene"}}}},
       {"if": {"properties": {"role": {"const": "affirm"}}}, "then": {"required": ["blocking"], "properties": {"size": {"const": "thumb"}}}}]}},
    {"if": {"properties": {"t": {"const": "ghost"}}}, "then": {"required": ["on", "n", "data"], "additionalProperties": false, "properties": {
      "t": true, "on": {"type": "string", "pattern": "^(question|[A-Za-z_][A-Za-z0-9_]*)$"}, "n": {"enum": [1, 2]}, "data": {"$ref": "#/$defs/ghost"}}}},
    {"if": {"properties": {"t": {"const": "chip"}}}, "then": {"required": ["tex", "missing", "line"], "additionalProperties": false, "properties": {
      "t": true, "tex": {"type": "string", "minLength": 1}, "missing": {"type": "string", "minLength": 1}, "line": {"type": "string", "minLength": 1, "maxLength": 120}}}},
    {"if": {"properties": {"t": {"const": "reveal"}}}, "then": {"required": ["level", "offer", "valueOn"], "additionalProperties": false, "properties": {
      "t": true, "level": {"enum": [1, 2, 3]}, "value": {"type": "string", "minLength": 1},
      "offer": {"type": "array", "minItems": 1, "uniqueItems": true, "items": {"enum": ["retry", "tellme", "twin", "next"]}},
      "valueOn": {"type": "array", "minItems": 1, "uniqueItems": true, "items": {"enum": ["retry", "grab", "tellme", "now"]}},
      "twin": {"$ref": "#/$defs/code"}, "requeue": {"type": "boolean"}},
      "allOf": [{"if": {"properties": {"level": {"enum": [1, 2]}}}, "then": {"not": {"required": ["value"]}}},
                {"if": {"properties": {"level": {"const": 3}}}, "then": {"required": ["value"]}}]}}
   ]
  },
  "msg": {
   "type": "object",
   "required": ["v", "q", "pick", "verdict", "kind", "layout", "start", "blocks"],
   "additionalProperties": false,
   "properties": {
    "v": {"const": 2},
    "q": {"$ref": "#/$defs/code"},
    "pick": {"oneOf": [{"$ref": "#/$defs/pick"}, {"type": "null"}]},
    "verdict": {"enum": ["wrong", "correct"]},
    "kind": {"enum": ["concept", "mechanical", "none"]},
    "layout": {"enum": ["short", "inter"]},
    "level": {"enum": [1, 2, 3]},
    "start": {"enum": ["default", "redeem", "tellme_pref", "last_try"]},
    "redeem": {"type": "boolean"},
    "pref": {"enum": ["tellme"]},
    "blocks": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"$ref": "#/$defs/block"}}
   },
   "allOf": [
    {"if": {"properties": {"verdict": {"const": "wrong"}}}, "then": {"required": ["level"]}},
    {"if": {"properties": {"verdict": {"const": "correct"}}}, "then": {"properties": {"kind": {"const": "none"}}, "not": {"required": ["level"]}}},
    {"if": {"properties": {"redeem": {"const": true}}, "required": ["redeem"]}, "then": {"properties": {"level": {"const": 1}, "start": {"const": "redeem"}}}},
    {"if": {"properties": {"start": {"enum": ["last_try", "tellme_pref"]}}}, "then": {"properties": {"level": {"const": 3}}}},
    {"if": {"properties": {"kind": {"const": "mechanical"}}}, "then": {"properties": {"blocks": {"items": {"properties": {"t": {"enum": ["text", "math", "chip", "reveal"]}}}}}}}
   ]
  },
  "bankq": {
   "type": "object",
   "required": ["code", "topic", "parent", "saccharine"],
   "additionalProperties": false,
   "properties": {
    "code": {"$ref": "#/$defs/code"},
    "topic": {"type": "string", "pattern": "^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)*$"},
    "parent": {"$ref": "#/$defs/code"},
    "saccharine": {"type": "object", "properties": {
      "slip": {"type": "object", "propertyNames": {"$ref": "#/$defs/pick"}, "additionalProperties": {"type": "string"}},
      "kind": {"type": "object", "propertyNames": {"$ref": "#/$defs/pick"}, "additionalProperties": {"enum": ["concept", "mechanical"]}},
      "ghost": {"type": "object", "propertyNames": {"$ref": "#/$defs/pick"}, "additionalProperties": {"$ref": "#/$defs/ghost"}},
      "chip": {"type": "object", "propertyNames": {"$ref": "#/$defs/pick"}, "additionalProperties": {"$ref": "#/$defs/chip"}},
      "affirm": {"$ref": "#/$defs/affirm"}}}
   }
  }
 }
}
```

What the schema can't say, the gate script checks (§8, `S/validate.mjs`; port into `tests/scene.test.mjs` = agent X's file):
`ghost_pair` (a ghost mark never without a truth mark in the same scene or overlay), `kind_match` (a ghost's `pick` letter is `concept`
in the bank map; a `chip` letter is `mechanical`), `no_value_L1` (at L1 no truth mark has a label, no `readout` shows before `grab`),
`ghost_count` (≤2 ghosts; `n: 2` only at L2+), `layout` (short = text ≤2 lines → visual → reveal; inter = text → visual → text/math → reveal),
`humor` (no `joke` block before the first visual of a wrong msg; ≤1 joke per msg), `banned` (no "Wrong!", "Easy", "Obviously", "Just ", "Simply" in
any `md`), `names` (every `=expr` and derive compiles in math.js with declared names only), `kit` (a live scene uses only its gate's kits).

## 7b. Agent X's asks (PR B @752fa24): which name wins, how the cases migrate

1. **Mark-level `ghost: true` / `truth: true` → `role: "ghost"` / `role: "truth"` wins.** One closed enum instead of two booleans: a mark
   can't be both (X's `ghost_label` "not also truth" holds by construction), and the same field carries `given` / `guide` / `handle` /
   `readout`, which the no-leak and handle rules need. The schema enforces the style X checks in code: a ghost is `dash: true`,
   `color: "muted"` (the token; `"grey"` is not a token, so it goes), has a `pick` letter and a label starting "your "; a truth mark is solid
   and never `muted`.
2. **`goal.kind` wins over the wrapper's `slip_kind`.** `goal` gains `kind: "concept" | "mechanical"`, and the scene schema now REQUIRES
   `goal.kind = "concept"` whenever any mark has `role: "ghost"` (planted cases "ghost scene without goal.kind" and "… mechanical" are caught,
   §8). The `/check` ghost and the bank `kind` map carry the same word, so the three agree.
3. **Migration of `tests/visual-cases/*.json`** (X owns them; mechanical, no judgment): `scene.v` 1 → 2; each mark `ghost: true` →
   `role: "ghost"` + `pick: <the case's letter>`, `truth: true` → `role: "truth"`; `color: "grey"` → `"muted"`; the wrapper's `slip_kind` →
   `scene.goal.kind` (add `goal: {kind, see, say}` when the case has none; keep `slip_kind` on the wrapper one release for the old runner).
   Planted-bad cases that test exactly these rules (e.g. `orbit-ghost-alone-bad`, `kwv-e-bad`) keep failing, now at the schema step too.
4. One fix taken FROM X's `area` rule: my first draft drew KWV d's ghost as the triangle's own box (16 squares = 40 J) under the label
   "your 80 J", a picture that contradicts its label. The ghost is now the full 8×4 box (32 squares = 80 J), and KWV a's ghost is the
   rectangle A–B (16 squares = 40 J), matching X's `kwv-d-good` / `kwv-a-good`.

## 8. Validation run

Command (from the worktree; `tests/node_modules` = the repo's ajv + mathjs):
```
node <your copy of validate.mjs> design/plans/SCHEMA-V2.md
```
The script is inlined in Appendix A (the original /tmp copy is gone: copy it to a file outside the repo and run it). The semantic gate now runs in `tests/scene.test.mjs`.
Output (Oct 7, exit 0):
```
schema scene-v2: 23 $defs compiled (ajv 2020, strict)
PASS  check  kwv-d
PASS  check  6aa-a
PASS  check  kwv-c
PASS  msg    kwv-d-L1-short
PASS  msg    kwv-a-L2-inter
PASS  msg    8vq-b-L1-inter
PASS  msg    h3a-e-L1-short
PASS  msg    8u2-L1-short
PASS  msg    6aa-a-L1-chip
PASS  msg    kwv-d-L3-last
PASS  msg    kwv-c-affirm
PASS  msg    live-gap
PASS  msg    redeem-L1
PASS  bankq  kwv
PASS  scene  v1 q1-b bumped to v:2 (v2 is a superset)
CAUGHT planted: ghost drawn alone (no truth)  ← schema+gate: ghost n1: ghost_pair: a ghost without a truth mark
CAUGHT planted: ghost on a mechanical slip (check)  ← schema
CAUGHT planted: ghost block in a mechanical msg  ← schema+gate: ghost: n1 is not her pick
CAUGHT planted: true value label at L1  ← gate: ghost n1: no_value_L1: a truth mark carries a label at L1
CAUGHT planted: value in the L1 reveal  ← schema
CAUGHT planted: L3 without the value  ← schema
CAUGHT planted: 4 reveal levels  ← schema
CAUGHT planted: ghost solid / coloured  ← schema
CAUGHT planted: ghost label not 'your …'  ← schema
CAUGHT planted: red in a visual  ← schema
CAUGHT planted: redeem started at L3  ← schema
CAUGHT planted: last try not at L3  ← schema
CAUGHT planted: affirm blocks Next  ← schema
CAUGHT planted: affirm at full size  ← schema
CAUGHT planted: scene first (text must stream first)  ← gate: layout: inter = text → visual → text/math
CAUGHT planted: joke before the visual on a wrong pick  ← gate: layout: short = text → visual
CAUGHT planted: banned word  ← gate: banned: Wrong!
CAUGHT planted: handle at L1  ← gate: L1 has no knob/handle
CAUGHT planted: readout shown before grab  ← gate: no_value: readout wread not gated on grab/retry/tellme
CAUGHT planted: 3 ghosts  ← gate: scene s1: ghost_count: more than 2 ghosts
CAUGHT planted: live scene with a timeline  ← schema
CAUGHT planted: live scene over 1500 ms  ← schema
CAUGHT planted: live mark outside its kit  ← gate: kit: spring not in xy-area
CAUGHT planted: live mark with an unknown key  ← schema
CAUGHT planted: unknown name in a derive  ← gate: scene s1.derive.W: unknown name speed
CAUGHT planted: bank: ghost on a mechanical letter  ← gate: kind_match: ghost on d but kind mechanical
CAUGHT planted: /check leaks the slip text  ← schema
CAUGHT planted: ghost scene without goal.kind (agent X ask)  ← schema
CAUGHT planted: ghost scene whose goal.kind is mechanical  ← schema
CAUGHT planted: unknown block type  ← schema+gate: layout: a wrong msg ends with the reveal strip

14 examples + 1 superset check; 30/30 planted-bad caught; 0 problems
```

## 9. Coverage: the 10 concepts × the exams + calc

Legend: ✓ = the v1/v2 schema AND a kit today cover it · **K** = the schema has it, no kit lists it yet (kit gap: add to a kit) ·
**G** = a real gap (schema or graph.js lacks it) · – = not needed for this topic. Last 3 rows = the v2 additions.

| Concept | F–x (E2 Q4) | Pucks (E2 Q7–10) | Ferris (E2 Q12–13) | Orbit (E2 Q14–18) | Rotation (E3) | Fluids (E3) | Statics (E3) | SHM (E4) | Sound (E4) | Thermo (E4) | ∫ area (calc) | Related rates (calc) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| params | ✓ t | ✓ m, θ | ✓ ω, θ | ✓ r | ✓ ω | ✓ depth | ✓ x of load | ✓ A, ω | ✓ v_s | ✓ V | ✓ bound b | ✓ t |
| derive | ✓ W(t) | ✓ p sums | ✓ N(θ) | ✓ v ∝ 1/√r | ✓ KE_rot | ✓ F_b = ρgV | ✓ Στ | ✓ x(t) | ✓ f′ | ✓ W = ∫P dV (shapes) | ✓ signed area | ✓ closed form dy/dt |
| marks | **K** poly, vline, shade (no kit) | ✓ arrow | **K** arc, pivot | **K** arc / circle | **K** arc | **K** rect | **K** pivot | ✓ fn | **K** circle (wavefronts) | **K** poly | **K** shade | ✓ seg |
| symbols | – | ✓ ball | – | **G** planet (use body disk) | ✓ ball | **G** tank / fluid | – | ✓ spring, block | **G** source / listener | **G** gas particles | – | **G** ladder (use seg) |
| handles | ✓ onX | ✓ radial | ✓ radial | ✓ radial | ✓ radial | ✓ onY | ✓ onX | ✓ onX | ✓ onX | ✓ onPath | ✓ onX | ✓ onX |
| knobs | – (D44 grab) | ✓ stepper m | – | – | – | – | – | ✓ (no object: slider) | ✓ slider | ✓ slider T | – | – |
| timeline | ✓ demo keys | ✓ collision keys | ✓ drive θ | ✓ drive | ✓ drive | – | – | ✓ drive t | ✓ drive t | **G** random motion needs a seed | – | ✓ drive t |
| ease | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | ✓ | ✓ | – | ✓ |
| trace | – | – | – | – | – | – | – | – | – | – | – | – |
| reveal | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| v2 ghost (concept) | ✓ box, stop line | ✓ y-sign flip, kept m | ✓ 8VQ end to end; 8U2/ZAF schematic | ✓ 3R_E; 5R_E widen | ✓ KE_rot left out | ✓ weight vs F_b arrow | ✓ torque arm | ✓ phase-shifted fn | ✓ 1/r vs 1/r² bars | ✓ cycle sign | ✓ below-axis as + | ✓ rate as a constant |
| v2 chip (mechanical) | ✓ grid unit (KWV e) | ✓ forgot ÷t, 0.20 s | ✓ arithmetic | ✓ 2π, √, ÷60 | ✓ | ✓ | ✓ | ✓ 2π | ✓ | ✓ °C vs K | ✓ | ✓ chain rule |
| v2 offscale / schematic | – | **G** arrows not to scale today → `scale:"schematic"` | ✓ schematic (8U2/ZAF) | ✓ widen ≤1.35; edge past it | – | – | – | – | – | – | – | – |

Gaps, in build order: (1) a new kit **`xy-area`** (`poly`, `shade`, `fn`, `vline`, `seg`, `axes`, `text`, `tex`) covers F–x, thermo PV, ∫ area,
and the live example E12; (2) add `arc`, `pivot`, `circle`, `body` to **`mechanics`** (Ferris, orbit, rotation, statics); (3) `rect` + a
`tank` symbol for fluids; (4) sound and gas-box symbols wait for Exam 4 (not on the Oct 9 path). Trace is CS-only by design.

### Undrawable cases → fallbacks
| Case | Example | What she gets |
|---|---|---|
| Mechanical slip | 6AA a (×t), H3A b (dropped 2π), H3A d (÷60), pucks "forgot ÷t" | `chip` (E2/E9): the whole line in LaTeX, the dropped piece marked; no scene, no ghost (D32) |
| Symbolic answers | Ferris 8U2 / ZAF ($mg \pm mr\omega^2$) | `scale: "schematic"` scene (E8): direction-only ghost, symbolic labels, "not to scale" |
| Out of bounds | Orbit 5R_E (H3A e, QZR d, RAO e) | `fit: "widen"` when the ghost grows the frame ≤1.35× (E7); past that `offscale: "edge"`: clamped at the frame edge with a break chevron and the label |
| Not a picture at all | pucks "that is v2", 2MO energy ratios | ratio → energy bars (`energy-bars` kit); "that is v2" → `kind: concept` without ghost is invalid, so tag it `mechanical` + chip until a picture exists |
| Typed answer, no buggy rule | any num Q | live gap (§6, E12) or text + L3 |

## 10. SHAME CHECK

1. **Wrong pick, her voice:** "Oh, it drew MY 80 next to the real shape. I see what I did. Let me try again."
2. **Banned items:** none. No red (the colour enum drops `bad`); no lone X (a ghost is never drawn alone, `ghost_pair`); no value drop; the `banned` gate rejects "Wrong!", "Easy", "Obviously", "Just ", "Simply" in Cluck text ("Just tell me" is a button label, not `md`).
3. **Techniques:** 1 wise feedback (E4 first line "Tricky one, and you can get it"); 2 normalize as fact (E10 "trips most people", E6 "built to bait adding"); 4 interpret, don't grade (every ghost labelled "your 80 J" beside the truth); 5 error = a step (`offer: retry` first at L1/L2); 6 private (ghost data arrives only with her own pick, slip text stays server-side); 7 agency (L2 grab handle starts at her number); 8 humor dose (`humor` gate: no joke before the visual on a wrong pick, QUACK only in the affirm E11); 9 forgiving (Redeem starts at L1 even under the tell-me pref, E13; requeue on a burned last try); 10 fast + light (pregen ghost in `/check`, 0 ms, no LLM; ≤2 lines in `short`); 11 validating (E5 "You saw the rectangle right").
4. **Would she reopen it tomorrow?** Yes if the first wrong pick shows her own answer as a shape in under a second, with no lecture; the retry closes the loop and the Redeem comes back gently.
5. **Seconds + taps to the aha:** iPhone: pick (1 tap) → `/check` reply (~150–300 ms on LTE) → ghost on her own figure, ~0.5 s, 0 extra taps (desktop/partial-sheet variants). On the current full-screen phone sheet it costs +1 tap ("Explain my mistake") until RUNTIME.md §1 lands. Mid Android: same taps, ~1 s. Not measured on a device (docs only).

## Appendix A. The validation + gate script

<details><summary>validate.mjs (Node 22; needs the repo's tests/node_modules)</summary>

```js
// Validates every <!-- v2: <def> <name> --> example in SCHEMA-V2.md against its <!-- schema: scene-v2 --> block ($defs/<def>),
// then runs the semantic gate (what a schema can't say), then planted-bad cases that must FAIL. Usage: node validate.mjs <SCHEMA-V2.md>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/user/stem-stuff/tests/package.json");
const Ajv2020 = require("ajv/dist/2020.js").default || require("ajv/dist/2020.js");
const math = require("mathjs");

const doc = readFileSync(process.argv[2], "utf8");
const schema = JSON.parse(doc.match(/<!-- schema: scene-v2 -->\s*```json\n([\s\S]*?)\n```/)[1]);
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
ajv.addSchema(schema);
const V = def => ajv.getSchema(`scene-v2#/$defs/${def}`);
const ex = [...doc.matchAll(/<!-- v2: (\w+) (\S+) -->\s*```json\n([\s\S]*?)\n```/g)].map(m => ({ def: m[1], name: m[2], j: JSON.parse(m[3]) }));

// ---- semantic gate ----
const KITS = { "xy-area": { marks: ["poly", "shade", "fn", "vline", "seg", "axes", "text", "tex"], syms: [] } };   // draft kit (§9 gap 1)
const BANNED = /Wrong!|\bEasy\b|\bObviously\b|\bJust |\bSimply\b/;
function names(src) { const out = new Set(); math.parse(src).traverse((n, p, par) => { if (n.type === "SymbolNode" && !(par && par.type === "FunctionNode" && p === "fn")) out.add(n.name); }); return out; }
function exprs(scene, bad, where) {
  const scope = new Set([...Object.keys(scene.params || {}), ...Object.keys(scene.derive || {}), "t"]);
  const chk = (src, w, local = []) => { try { for (const n of names(src)) if (!scope.has(n) && !local.includes(n) && !(n in math)) bad.push(`${w}: unknown name ${n}`); } catch { bad.push(`${w}: does not compile: ${src}`); } };
  for (const [k, s] of Object.entries(scene.derive || {})) chk(s, `${where}.derive.${k}`);
  for (const m of scene.marks) for (const [k, v] of Object.entries(m)) {
    if (typeof v === "string" && v.startsWith("=")) chk(v.slice(1), `${where}.${m.id}.${k}`, m.param ? [m.param] : []);
    if (m.mark === "fn" && (k === "x" || k === "y") && typeof v === "string" && !v.startsWith("=")) chk(v, `${where}.${m.id}.${k}`, m.param ? [m.param] : []);
  }
  for (const h of scene.handles || []) { if (!(h.bind in (scene.params || {}))) bad.push(`${where}: handle binds no param ${h.bind}`); if (!scene.marks.some(m => m.id === h.on.split(".")[0])) bad.push(`${where}: handle on no mark ${h.on}`); }
  for (const r of scene.reveal || []) for (const id of r.show) if (!scene.marks.some(m => m.id === id)) bad.push(`${where}: reveal of no mark ${id}`);
}
function marksGate(marks, level, bad, where) {
  const g = marks.filter(m => m.role === "ghost"), t = marks.filter(m => m.role === "truth");
  if (g.length && !t.length) bad.push(`${where}: ghost_pair: a ghost without a truth mark`);
  if (new Set(g.map(m => m.pick)).size > 2) bad.push(`${where}: ghost_count: more than 2 ghosts`);
  if (level === 1 && t.some(m => m.label)) bad.push(`${where}: no_value_L1: a truth mark carries a label at L1`);
}
function gate(e) {
  const bad = [], j = e.j;
  if (e.def === "check") {
    if (j.ghost) marksGate(j.ghost.marks, 1, bad, "ghost");
  }
  if (e.def === "bankq") {
    const s = j.saccharine;
    for (const [l, gh] of Object.entries(s.ghost || {})) { if (s.kind?.[l] !== "concept") bad.push(`kind_match: ghost on ${l} but kind ${s.kind?.[l]}`); if (gh.pick !== l) bad.push(`ghost ${l}: pick ${gh.pick}`); marksGate(gh.marks, 1, bad, `ghost.${l}`); }
    for (const l of Object.keys(s.chip || {})) if (s.kind?.[l] !== "mechanical") bad.push(`kind_match: chip on ${l} but kind ${s.kind?.[l]}`);
  }
  if (e.def === "msg") {
    const B = j.blocks, ts = B.map(b => b.t), vis = ["ghost", "scene", "chip"];
    const firstVis = ts.findIndex(t => vis.includes(t));
    // layout (D8)
    if (j.layout === "short") {
      if (ts[0] !== "text" || B[0].md.split("\n").length > 2 || B[0].md.length > 160) bad.push("layout: short needs ≤2 lines of text first");
      if (firstVis !== 1) bad.push("layout: short = text → visual");
    } else {
      if (ts[0] !== "text" || firstVis !== 1 || !["text", "math"].includes(ts[2])) bad.push("layout: inter = text → visual → text/math");
    }
    if (j.verdict === "wrong" && ts.at(-1) !== "reveal") bad.push("layout: a wrong msg ends with the reveal strip");
    // humor dose (§1 rule 8, humor rules d/e)
    const jokes = B.filter(b => b.t === "text" && b.say === "joke");
    if (jokes.length > 1) bad.push("humor: >1 joke");
    if (j.verdict === "wrong" && B.findIndex(b => b.say === "joke") > -1 && B.findIndex(b => b.say === "joke") < firstVis) bad.push("humor: joke before the visual on a wrong pick");
    if (j.verdict === "wrong" && j.level === 1 && jokes.length) bad.push("humor: no jokes at L1 after a wrong pick");
    for (const b of B) if (b.md && BANNED.test(b.md)) bad.push(`banned: ${b.md.match(BANNED)[0]}`);
    // ghosts, levels, values
    let ghosts = 0;
    for (const b of B) {
      if (b.t === "ghost") { ghosts++; marksGate(b.data.marks, j.level, bad, `ghost n${b.n}`); if (b.n === 2 && j.level < 2) bad.push("ghost_count: a 2nd ghost below L2"); if (j.pick && b.data.pick !== j.pick && b.n === 1) bad.push("ghost: n1 is not her pick"); }
      if (b.t === "scene") {
        exprs(b.spec, bad, `scene ${b.id}`);
        marksGate(b.spec.marks, j.level, bad, `scene ${b.id}`);
        ghosts += new Set(b.spec.marks.filter(m => m.role === "ghost").map(m => m.pick)).size;
        const ro = b.spec.marks.filter(m => m.role === "readout").map(m => m.id);
        for (const id of ro) if (!(b.spec.reveal || []).some(r => r.show.includes(id) && ["grab", "retry", "tellme"].includes(r.after))) bad.push(`no_value: readout ${id} not gated on grab/retry/tellme`);
        if (j.level === 1 && b.spec.handles?.length) bad.push("L1 has no knob/handle");
        if (b.src === "live") { const k = b.gate.kits.flatMap(n => KITS[n]?.marks || []); for (const m of b.spec.marks) if (m.mark && !k.includes(m.mark)) bad.push(`kit: ${m.mark} not in ${b.gate.kits}`); }
      }
    }
    if (ghosts > 2) bad.push("ghost_count: >2 ghosts");
    if (j.kind === "mechanical" && ghosts) bad.push("D32: ghost on a mechanical slip");
    if (j.kind === "mechanical" && !ts.includes("chip")) bad.push("D32: a mechanical slip needs a chip");
    if (j.kind === "concept" && j.verdict === "wrong" && firstVis < 0) bad.push("a concept wrong pick needs a visual");
  }
  return bad;
}

let fails = 0;
console.log(`schema scene-v2: ${Object.keys(schema.$defs).length} $defs compiled (ajv 2020, strict)`);
for (const e of ex) {
  const ok = V(e.def)(e.j), g = gate(e);
  if (!ok || g.length) fails++;
  console.log(`${ok && !g.length ? "PASS" : "FAIL"}  ${e.def.padEnd(6)} ${e.name}${ok ? "" : "  schema: " + JSON.stringify(V(e.def).errors.slice(0, 3))}${g.length ? "  gate: " + g.join("; ") : ""}`);
}
// v1 superset: VISUAL-GOALS q1-b with v:2 validates as a v2 scene
const q1b = JSON.parse(readFileSync(new URL("../../../../../../home/user/stem-stuff/.claude/worktrees/agent-a3c6ccb76828d9be3/design/VISUAL-GOALS.md", "file:///"), "utf8").match(/<!-- scene: q1-b -->\s*```json\n([\s\S]*?)\n```/)[1]);
q1b.v = 2; const okq = V("scene")(q1b); if (!okq) fails++;
console.log(`${okq ? "PASS" : "FAIL"}  scene  v1 q1-b bumped to v:2 (v2 is a superset)${okq ? "" : JSON.stringify(V("scene").errors)}`);

// ---- planted-bad: each must FAIL (schema or gate) ----
const get = n => structuredClone(ex.find(e => e.name === n));
const planted = {
  "ghost drawn alone (no truth)": ["kwv-d-L1-short", e => { e.j.blocks[1].data.marks = e.j.blocks[1].data.marks.filter(m => m.role !== "truth"); }],
  "ghost on a mechanical slip (check)": ["6aa-a", e => { e.j.ghost = get("kwv-d").j.ghost; }],
  "ghost block in a mechanical msg": ["6aa-a-L1-chip", e => { e.j.blocks[1] = get("kwv-d-L1-short").j.blocks[1]; }],
  "true value label at L1": ["kwv-d-L1-short", e => { e.j.blocks[1].data.marks[0].label = "60 J"; }],
  "value in the L1 reveal": ["kwv-d-L1-short", e => { e.j.blocks[2].value = "60 J"; }],
  "L3 without the value": ["kwv-d-L3-last", e => { delete e.j.blocks[3].value; }],
  "4 reveal levels": ["kwv-d-L1-short", e => { e.j.level = 4; }],
  "ghost solid / coloured": ["kwv-d", e => { e.j.ghost.marks[2].dash = false; e.j.ghost.marks[2].color = "c3"; }],
  "ghost label not 'your …'": ["kwv-d", e => { e.j.ghost.marks[2].label = "80 J"; }],
  "red in a visual": ["kwv-d", e => { e.j.ghost.marks[0].color = "bad"; }],
  "redeem started at L3": ["redeem-L1", e => { e.j.level = 3; }],
  "last try not at L3": ["kwv-d-L3-last", e => { e.j.level = 2; delete e.j.blocks[3].value; }],
  "affirm blocks Next": ["kwv-c-affirm", e => { e.j.blocks[1].blocking = true; }],
  "affirm at full size": ["kwv-c-affirm", e => { e.j.blocks[1].size = "full"; }],
  "scene first (text must stream first)": ["8vq-b-L1-inter", e => { e.j.blocks.reverse(); }],
  "joke before the visual on a wrong pick": ["kwv-d-L1-short", e => { e.j.blocks.splice(1, 0, { t: "text", say: "joke", md: "QUACK, triangles are sneaky." }); }],
  "banned word": ["kwv-d-L1-short", e => { e.j.blocks[0].md = "Wrong! Simply halve it."; }],
  "handle at L1": ["h3a-e-L1-short", e => { e.j.blocks[1] = { t: "scene", id: "s9", src: "pregen", role: "explain", size: "full", alt: "a scene with a knob at L1", spec: get("kwv-a-L2-inter").j.blocks[1].spec }; }],
  "readout shown before grab": ["kwv-a-L2-inter", e => { e.j.blocks[1].spec.reveal = []; }],
  "3 ghosts": ["kwv-a-L2-inter", e => { e.j.blocks[1].spec.marks.push({ id: "g3", mark: "vline", role: "ghost", pick: "b", x: 6, dash: true, color: "muted", label: "your 20 J" }); }],
  "live scene with a timeline": ["live-gap", e => { e.j.blocks[1].spec.timeline = { keys: [] }; }],
  "live scene over 1500 ms": ["live-gap", e => { e.j.blocks[1].gate.ms = 2400; }],
  "live mark outside its kit": ["live-gap", e => { e.j.blocks[1].spec.marks.push({ id: "w", mark: "spring", role: "given" }); }],
  "live mark with an unknown key": ["live-gap", e => { e.j.blocks[1].spec.marks[0].onclick = "x"; }],
  "unknown name in a derive": ["kwv-a-L2-inter", e => { e.j.blocks[1].spec.derive.W = "t * speed"; }],
  "bank: ghost on a mechanical letter": ["kwv", e => { e.j.saccharine.kind.d = "mechanical"; }],
  "/check leaks the slip text": ["kwv-d", e => { e.j.slip = "Forgot the 1/2"; }],
  "ghost scene without goal.kind (agent X ask)": ["8vq-b-L1-inter", e => { delete e.j.blocks[1].spec.goal; }],
  "ghost scene whose goal.kind is mechanical": ["8vq-b-L1-inter", e => { e.j.blocks[1].spec.goal.kind = "mechanical"; }],
  "unknown block type": ["kwv-d-L1-short", e => { e.j.blocks.push({ t: "html", md: "<b>x</b>" }); }]
};
let caught = 0;
for (const [what, [n, f]] of Object.entries(planted)) {
  const e = get(n); f(e);
  const ok = V(e.def)(e.j), g = gate(e), failed = !ok || g.length > 0;
  if (failed) caught++; else fails++;
  console.log(`${failed ? "CAUGHT" : "MISSED"} planted: ${what}  ← ${!ok ? "schema" : ""}${!ok && g.length ? "+" : ""}${g.length ? "gate: " + g[0] : ""}`);
}
console.log(`\n${ex.length} examples + 1 superset check; ${caught}/${Object.keys(planted).length} planted-bad caught; ${fails} problems`);
process.exit(fails ? 1 : 0);
```
</details>
