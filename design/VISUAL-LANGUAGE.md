# Visual language: premade options + the 10-concept spec (research, Oct 5 ~21:45 PT)

<!-- One Explore agent. Tony's decision (21:4x PT): SPEED FIRST. The LLM composes APPROVED components as data only (no free code);
     scope now = physics + discrete math + CS concepts. Invariants: brain projects/calc/topics/stem-stuff-invariants.md.
     Why: OpenGenerativeUI's live demo "takes a millennia to draw" (live codegen = minutes); pregenerated data draws in ms.
     Companions: design/WIDGETS.md (sandbox, if code ever returns), design/VISUALS.md (skills map), skills.json.
     Next session: turn §3 into scene.schema.json + review it top-down with Tony (agenda: visual language, goals, teaching approach). -->

I found no single ready-made package that covers physics, discrete math and CS with drag and animation as JSON. The fastest route is to keep graph.js, write a small data format of about 10 concepts for it, and copy the "trace of commands" idea from algorithm-visualizer.org for the CS widgets.

This is from web searches plus my own knowledge. Items marked **[unverified]** I did not check against a primary source in this session.

---

## 1. Candidate scan

| Candidate | What the spec is | Drag / knobs | Animation | Fit for this site | Size, license | LLM evidence |
|---|---|---|---|---|---|---|
| **Google A2UI** | JSON messages that build a page from a component catalog; values come from a data model | Forms and buttons only | No | **None for visuals.** It lays out cards and forms. You could reuse its "catalog + data" pattern for your own marks. | Apache-2.0 **[unverified]** | Designed for LLMs; supported in ADK, CopilotKit and CrewAI ([adk.dev](https://adk.dev/integrations/a2ui/), [CrewAI](https://docs.crewai.com/v1.15.2/en/learn/a2ui.md)) |
| **Vercel json-render** | Flat JSON tree checked against a catalog you define with Zod. If a component isn't in the catalog, the LLM can't use it. | Whatever your components do | No | **Good pattern, needs React/Vue** (not vanilla JS). Its strict catalog matches your "approved parts only" rule. | Apache-2.0 **[unverified]** | Made for LLMs ([skills.sh](https://www.skills.sh/vercel-labs/json-render/react)) |
| **CopilotKit OpenGenerativeUI** | The LLM writes free HTML/CSS/JS that runs in an iframe; there are BFS/DFS and binary-search demos | Anything | Anything | **Breaks your rule** (it's free code). Useful only for borrowing ideas. | MIT ([docs](https://docs.copilotkit.ai/mastra/generative-ui/open-generative-ui), [pyshine](https://pyshine.com/CopilotKit-OpenGenerativeUI-Open-Source-Generative-UI-Framework/)) | Yes |
| Thesys C1 / MCP-UI | Hosted service / embedded resources in chat | Forms | No | None. They're built for runtime chat; you author ahead of time. | C1 is paid **[unverified]** | Yes |
| **JSXGraph** | `board.create('point'|'glider'|'slider'…, parents, attrs)`; each call maps neatly to JSON. Also has the JessieCode script language. | **Best available**: gliders (points on a curve), sliders, linked elements | Basic: `moveTo` and animations driven by sliders | **Closest for physics and geometry.** Weak for graphs and algorithms. | About 200 KB per its own site (gzip likely about 60 KB **[unverified]**); LGPL/MIT dual ([download](https://jsxgraph.uni-bayreuth.de/wp/download/)) | LLMs write it well because there's lots of public code **[unverified]** |
| Mafs | React components | Movable points with constraints | Through React state | Clean, but **React** | MIT | — |
| GeoGebra | `.ggb` file (XML) plus a JS API | Excellent | Sliders | Strong, but the applet is several MB and loads slowly on phones; non-commercial license limits **[unverified]** | Proprietary-ish | Weak, XML is long-winded |
| Desmos API | State JSON from `getState()` | Sliders, movable points | Slider playback | Good for math; you need an API key and the license terms; graphs and trees are poor | Commercial key **[unverified]** | The state format is undocumented, so LLMs get it wrong |
| Penrose | Domain / Substance / Style languages | No | No | Static math diagrams laid out by optimisation; no interaction | MIT | Yes: Feynman agent ([arXiv 2603.12597](https://arxiv.org/html/2603.12597), [docs](https://penrose.cs.cmu.edu/docs/ref/substance/overview)) |
| MathBox, CindyJS | WebGL / CindyScript | Some | Yes | Overkill; maintenance is slow **[unverified]** | MIT / Apache | Low |
| **Lottie** | JSON layers + keyframes + easing curves | **No** | Excellent | Animation playback only; nothing changes with values; hard for an LLM to write by hand | lottie-web 75 KB gzip, light build 51 KB ([ics.media](https://ics.media/en/entry/240625/)); MIT | OmniLottie needed a custom tokenizer to get LLMs to produce it ([hackernoon](https://hackernoon.com/omnilottie-solves-ai-animations-hardest-problem)) |
| Rive | Binary file plus state machines | Inputs | Yes | Must be made in the Rive editor; can't be written as text | Runtime is WASM (~100 KB+) **[unverified]** | No |
| Motion Canvas / Manim | TypeScript generators / Python code | No | Excellent | It's code, and outputs video, not live widgets | MIT | LLM2Manim and PhysicsSolutionAgent write Manim *code* ([arXiv 2601.13453](https://arxiv.org/pdf/2601.13453)) |
| Theatre.js, GSAP, anime.js | Timeline / keyframe objects | No | Yes | You only need the *idea* of a keyframe timeline, which takes ~40 lines | GSAP is free now; anime ~10 KB **[unverified]** | Good |
| SVG SMIL | Built-in `<animate>` | No | Yes | Can't be scrubbed or tied to values; inconsistent on mobile Safari | 0 KB | — |
| **Vega / Vega-Lite** | JSON specs, `params`, selections | Brush/drag selections, slider bindings | Animated Vega-Lite (a research extension: time as a channel, timer events) is **not in the main release** ([MIT paper](https://vis.mit.edu/pubs/animated-vega-lite)) | Charts only; poor for diagrams and graphs | ~250 KB+ gzip for Vega + Vega-Lite **[unverified]**; BSD | Strong, lots of training data |
| Observable Plot | JS options object | Pointer only | No | Charts only | ~50 KB + d3 **[unverified]** | Good |
| **algorithm-visualizer tracers** | Your code calls `array.select(i)`, `graph.visit(v,u)`, `Tracer.delay()`. The library records these as a **list of commands**. The web app replays them. | Step / play | **Step trace** | **Best fit for CS**: the "algorithm → list of commands → replay" model is what you want | MIT ([tracers.js](https://github.com/algorithm-visualizer/tracers.js)). Exact JSON shape (`{key, method, args}`) **[unverified]**. Activity is low. | Easy for LLMs to write calls |
| VisuAlgo | Closed | — | — | Use for reference only | Proprietary | — |
| Cytoscape.js | JSON elements + style + layouts + `ele.animate()` | Node drag | Per-element tweens | Strong for graphs, but **131.5 KB gzip** ([depscope](https://depscope.dev/pkg/npm/cytoscape)), heavy for a phone site | MIT | Good |
| d3-graphviz / Mermaid | DOT text / Mermaid text | No | d3-graphviz animates between DOT frames | Mermaid is great for state machines and flowcharts but large (~several hundred KB **[unverified]**); Graphviz WASM ~700 KB **[unverified]** | MIT | Very strong, LLMs write Mermaid fluently |
| Python Tutor trace | JSON per step: `line, event, globals, ordered_globals, stack_to_render, heap, stdout` ([pythontutor llms.txt](https://pythontutor.com/llms.txt)) | — | Step | Good model for **recursion and call-stack** widgets | Source is BSD; the hosted service isn't | — |
| Research | LLM2Manim, PhysicsSolutionAgent, Feynman/Penrose, TPA-Net (JSON to physics simulator) ([arXiv 2211.13887](https://arxiv.org/pdf/2211.13887)) | — | — | The STEM work mostly writes **code** (Manim) or static diagrams. I found none that publish a reusable JSON format for interactive widgets. | — | — |

## 2. Answers

**(a) One ready-made package that does everything?** No. The closest options each miss a whole area:
- **JSXGraph** is closest for physics and math: proper gliders, sliders and linked elements. Graphs and algorithms are weak, it's about 60 KB gzip, and it has its own look.
- **algorithm-visualizer's command trace** is closest for CS: step-by-step replay. It has no physics.
- **json-render** and **A2UI** give you the "approved catalog only" rule, but have no visual parts.

**(b) Best combination, speed first:**
1. **Your own graph.js marks**, extended with a ~10-concept JSON scene format (below). Adds about 3–6 KB. It keeps one look, phone-friendly hit areas, and no new dependency.
2. **A trace-command format** for CS, modelled on algorithm-visualizer (`select / visit / mark / swap / push / pop` steps). The scene just replays the list; ~2 KB.
3. **A small keyframe/easing timeline** in the style of Theatre.js or GSAP, written by you; ~1–2 KB. Skip Lottie, Rive and Manim.
4. **Copy json-render's idea, not its code**: one JSON Schema catalog that you put in the LLM prompt and use to validate before committing. A small validator such as `@cfworker/json-schema` is ~5 KB **[unverified]**; or write a hand-rolled checker.
5. *Optional*, only if a geometry-heavy topic shows up later: load JSXGraph on demand for that page (~60 KB gzip).

Total added: **under 15 KB**, compared with 130 KB+ for Cytoscape or 250 KB+ for Vega.

**Tradeoffs.** Building it yourself costs about 2–4 days up front and leaves you maintaining a format. In return you get small size, one consistent style and full control over phone touch handling. Ready-made libraries are faster for their one area, but you'd end up with three looks, three APIs and 200 KB+.

## 3. The visual language (10 concepts)

1. **`params`**: named numbers with `{min,max,step,init,unit}`. They are the only state.
2. **`derive`**: named math.js expressions over the params and time `t`, e.g. `"x": "v0*cos(th)*t"`.
3. **`marks`**: your existing graph.js marks (`point, line, arrow, path, fn, rect, circle, text/tex, node, edge, bar`). Any property can be a number or an `"=expr"`.
4. **`symbols`**: a fixed set of icons: `block, cart, ball, spring, pulley, incline, ground, vector, gate:AND/OR/NOT/XOR, state, arrayCell, stackFrame`.
5. **`handles`**: draggable points tied to a param, with a constraint: `free | onX | onY | onPath:<fn> | radial:<center>`, plus `snap`.
6. **`knobs`**: on-screen controls tied to a param: `slider | stepper | toggle | select`.
7. **`timeline`**: a list of keyframes `{at, set:{param:value}, ease}`, or `drive:{param:"t", from, to, dur}`.
8. **`ease`**: a fixed list: `linear, inOut, out, step`.
9. **`trace`** (CS): a list of steps; each step is `{op, args, note}` with `op` from a fixed set: `visit, mark, unmark, swap, set, push, pop, highlightEdge, enqueue, dequeue, gateOut`.
10. **`reveal`**: when parts appear: `{after: "answer" | "step:n" | "param:cond", show:[ids]}`, so the visual doesn't give away the answer before the student responds.

Physics: a projectile with a draggable launch angle.
```json
{"v":1,"view":{"x":[0,40],"y":[0,20]},
 "params":{"th":{"min":10,"max":80,"init":45,"unit":"deg"},"v0":{"min":5,"max":20,"init":15},"t":{"min":0,"max":3,"init":0}},
 "derive":{"r":"th*pi/180","x":"v0*cos(r)*t","y":"max(0,v0*sin(r)*t-4.9*t^2)"},
 "marks":[
  {"id":"g","sym":"ground","y":0},
  {"id":"traj","mark":"fn","param":"s","range":[0,"=2*v0*sin(r)/9.8"],"x":"=v0*cos(r)*s","y":"=v0*sin(r)*s-4.9*s^2","style":"dashed"},
  {"id":"ball","sym":"ball","x":"=x","y":"=y"},
  {"id":"vel","sym":"vector","from":[0,0],"to":["=3*cos(r)","=3*sin(r)"],"label":"v_0"}],
 "handles":[{"bind":"th","on":"vel.to","constraint":"radial:[0,0]","snap":5}],
 "knobs":[{"bind":"v0","kind":"slider","label":"v_0\\,(m/s)"}],
 "timeline":{"drive":{"param":"t","from":0,"to":"=2*v0*sin(r)/9.8","dur":2000,"ease":"linear"}},
 "reveal":[{"after":"answer","show":["traj"]}]}
```

CS: BFS from node A.
```json
{"v":1,"view":{"x":[0,10],"y":[0,6]},
 "marks":[
  {"id":"A","mark":"node","x":1,"y":3,"label":"A"},{"id":"B","mark":"node","x":4,"y":5,"label":"B"},
  {"id":"C","mark":"node","x":4,"y":1,"label":"C"},{"id":"D","mark":"node","x":7,"y":3,"label":"D"},
  {"id":"AB","mark":"edge","from":"A","to":"B"},{"id":"AC","mark":"edge","from":"A","to":"C"},
  {"id":"BD","mark":"edge","from":"B","to":"D"},{"id":"CD","mark":"edge","from":"C","to":"D"},
  {"id":"Q","sym":"arrayCell","x":1,"y":0.3,"cells":[],"label":"queue"}],
 "trace":[
  {"op":"enqueue","args":["Q","A"],"note":"start at A"},
  {"op":"dequeue","args":["Q"]},{"op":"visit","args":["A"]},
  {"op":"highlightEdge","args":["AB"]},{"op":"enqueue","args":["Q","B"]},
  {"op":"highlightEdge","args":["AC"]},{"op":"enqueue","args":["Q","C"]},
  {"op":"dequeue","args":["Q"]},{"op":"visit","args":["B"]},{"op":"highlightEdge","args":["BD"]},{"op":"enqueue","args":["Q","D"]},
  {"op":"dequeue","args":["Q"]},{"op":"visit","args":["C"]},{"op":"dequeue","args":["Q"]},{"op":"visit","args":["D"]}],
 "timeline":{"stepMs":700,"ease":"step","controls":["prev","play","next"]},
 "reveal":[{"after":"answer","show":["trace"]}]}
```
To make sure the trace is correct, have the LLM write the BFS as a short JS function that outputs the trace at authoring time, then commit only the JSON. This is the same "algorithm → command list" approach algorithm-visualizer uses.

## 4. Adoption path (speed first)

1. **Day 1–2: format + validator.** Write `scene.schema.json` covering the 10 concepts, with closed lists for `op`, `sym`, `ease` and `constraint`. Use math.js `compile` on every `"=expr"` and reject anything that fails or uses identifiers you didn't declare. That schema becomes the LLM prompt and also the check before each commit.
2. **Day 2–4: runtime in graph.js.** Re-evaluate the `"=expr"` values whenever a param changes, add pointer-event handles (44 px touch areas), a `requestAnimationFrame` timeline that follows reduced-motion settings, a trace player (prev/play/next/scrub), and reveal rules. Build 3 reference scenes: projectile, BFS, logic gate.
3. **Week 2: authoring loop.** Prompt = schema + the 3 reference scenes + the question. The LLM returns JSON (CS traces come from generated JS that you run locally). Validate, render a preview page, review by eye, commit. Keep a list of failures and add a few-shot example whenever the same mistake repeats.
4. **Later: grow by need only.** Add symbols as topics arrive (E&M: `charge, fieldLine, resistor, battery`; CS: `stackFrame, treeNode, dfaState`). Add a Python Tutor-style `frames` op for recursion. Load JSXGraph on demand only if a geometry topic really needs constrained building, and switch to Mermaid only for large state diagrams where automatic layout saves time.

Sources: [A2UI/ADK](https://adk.dev/integrations/a2ui/) · [CrewAI A2UI](https://docs.crewai.com/v1.15.2/en/learn/a2ui.md) · [CopilotKit A2UI](https://docs.copilotkit.ai/strands/generative-ui/a2ui) · [json-render](https://www.skills.sh/vercel-labs/json-render/react) · [OpenGenerativeUI](https://docs.copilotkit.ai/mastra/generative-ui/open-generative-ui) · [tracers.js](https://github.com/algorithm-visualizer/tracers.js) · [Animated Vega-Lite](https://vis.mit.edu/pubs/animated-vega-lite) · [JSXGraph](https://jsxgraph.uni-bayreuth.de/wp/download/) · [Lottie sizes](https://ics.media/en/entry/240625/) · [Cytoscape size](https://depscope.dev/pkg/npm/cytoscape) · [Penrose](https://penrose.cs.cmu.edu/docs/ref/substance/overview) · [Feynman/Penrose LLM](https://arxiv.org/html/2603.12597) · [PhysicsSolutionAgent](https://arxiv.org/pdf/2601.13453) · [OmniLottie](https://hackernoon.com/omnilottie-solves-ai-animations-hardest-problem) · [TPA-Net](https://arxiv.org/pdf/2211.13887) · [Python Tutor](https://pythontutor.com/llms.txt)
