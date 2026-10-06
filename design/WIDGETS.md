<!-- design/WIDGETS.md — research (one Explore agent, Oct 5 ~20:55 PT): sandboxing LLM-written visual widgets.
     Coded against the LOCKED invariants (brain projects/calc/topics/stem-stuff-invariants.md):
     1) Tony alone pushes the banks → widgets are generated at AUTHORING time, tested, reviewed, committed; students never trigger codegen.
     2) LLMs code to spec → new widget types = LLM-written plugins on a stable core SDK.
     Caveat from this research: (2) holds for plumbing; scientific correctness is NOT proven (InteractScience ≤41.5% functional pass),
     so the test gate must check the physics/math invariants, not just "it renders". Companion: design/VISUALS.md, skills.json. -->

# Sandboxing LLM-written STEM widgets: options and a recommendation

**Bottom line:** Write each widget as a pure model (`knobs → state → scene graph`). Run it inside a sandboxed `srcdoc` iframe (`allow-scripts` only) that carries a `<meta>` CSP of `default-src 'none'`. Your existing SVG renderer is copied into that same iframe, and an author-time test gate decides what gets committed. Your authoring-time invariant is what makes this enough: the realistic threat is LLM bugs, not attackers. A separate site, QuickJS or SES would add cost for little extra protection.

Claims marked **[unverified]** come from my background knowledge; I didn't confirm them in this session.

## 1. Sandbox options compared

| Option | Isolation | Cost / friction | Fit |
|---|---|---|---|
| **A. `srcdoc` iframe, `sandbox="allow-scripts"` (no `allow-same-origin`) + meta CSP + `postMessage`** | Opaque ("null") origin: no access to parent DOM, cookies or storage. A meta CSP injected first can't be removed by script, even if the frame navigates to `data:`. Tested in Chromium and Firefox ([Willison 2026](https://simonwillison.net/2026/Apr/3/test-csp-iframe-escape/)). | Zero infra. About 1 iframe per widget. Messages are async. | **Best default** |
| A′. Same, but served from a separate *registrable domain* (the `claudeusercontent.com` / `cdpn.io` pattern) | Adds real HTTP CSP headers and cross-site process isolation. Anthropic says artifacts use "iframe sandboxes with full-site process isolation" plus strict CSPs ([Willison 2024](https://simonwillison.net/2024/Aug/28/how-anthropic-built-artifacts)). | A Vercel *subdomain* (`w.yoursite.app`) is **same-site** (same eTLD+1), so it gets no extra site isolation **[unverified]**; you'd need a second domain (~$10/yr) plus a second project. | Overkill for reviewed code. Revisit if students ever submit code. |
| B. Web Worker + OffscreenCanvas | No DOM ([web.dev](https://web.dev/articles/offscreen-canvas)). But a **same-origin worker still has `fetch`, IndexedDB and Cache for your origin**, so it isn't a security boundary on its own **[reasoning]**. | Async, no SVG DOM. | Only for CPU-heavy simulations, and only *inside* the sandboxed iframe. |
| C. QuickJS → WASM (`quickjs-emscripten`) | Separate VM. Memory limits (`setMemoryLimit`), stack limits and interrupt handler for CPU caps ([repo](https://github.com/justjake/quickjs-emscripten)). Figma moved here after several Realms-shim escapes ([Wallace](https://madebyevan.com/figma/an-update-on-plugin-security/), [Figma blog](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)). | Hundreds of KB of WASM **[unverified size]**. Slower than JIT. Awkward debugging. | Figma needed *synchronous* document access. You don't. |
| D. SES / Hardened JS (`lockdown`, `Compartment`, `harden`) | Same-realm object-capability sandbox ([ses README](https://github.com/endojs/endo/blob/HEAD/packages/ses/README.md)). | Freezes intrinsics, so third-party libraries can break. Same-VM confusion bugs are the class that hit Figma's Realms shim. | Not worth it here. |
| E. ShadowRealm | Still **Stage 2.7** (last advancement attempt Dec 2024) ([tc39](https://github.com/tc39/proposal-shadowrealm)). Not shipping. | — | Don't plan on it. |

Pitfalls for option A:
- Never combine `allow-scripts` with `allow-same-origin` for same-origin content. The frame can remove its own sandbox ([MDN](https://developer.mozilla.org/docs/Web/API/HTMLIFrameElement/srcdoc)).
- A `srcdoc` frame **inherits the parent page's CSP** (CVE-2017-7788 was the Firefox bug where it didn't) ([whatwg](https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2012-June/078745.html)). If your site's CSP blocks inline script, put the widget runtime script's hash in the parent CSP **[check per browser]**.
- On the parent side, always check `event.source === iframe.contentWindow`. `origin` will be `"null"`.

## 2. Declarative-only versus code
- **Penrose:** Domain = types, Substance = instance, Style = drawing rules. Content never says how it's drawn ([docs](https://penrose.cs.cmu.edu/docs/ref/)).
- **Mafs** (`MovablePoint` with constraints) and **JSXGraph** (gliders, intersections, dependent elements): dragging plus constraints, declared rather than coded.
- **math.js** expressions parse to an AST with no `eval` since v4. Disable `import`, `createUnit` and `reviver`, and consider a Worker for runaway expressions ([security doc](https://mathjs.org/docs/expressions/security.html)).
- **How far it goes [judgment]:** a scene graph with expression bindings (`x: "L*sin(theta)"`) covers geometry, function plots, vectors, projectile paths and probability bars. It breaks down at time-stepped simulations (collisions, springs, Monte Carlo), custom hit-testing and step-by-step algorithms. That's where code earns its place.
- **Use both:** start declarative, and let a widget drop to code only for `step()` and `view()`.

## 3. Architecture patterns to copy
- **tldraw `ShapeUtil`:** a shape is plain JSON. The util provides `getDefaultProps`, `getGeometry` (hit-testing and bounds), `component` and `indicator`. Props are typed with validators and versioned with migrations ([docs](https://tldraw.dev/docs/shapes)). This maps directly onto a widget registry.
- **Figma** splits work in two: a logic sandbox that only sees a narrow API, and a separate null-origin UI iframe, linked by messages ([blog](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)).
- **Capability SDK:** the widget gets an `sdk` object, never globals. No `fetch`, no DOM, just `draw`, `measure`, `emit`, `rng(seed)` and `units`.

## 4. What the LLM codegen literature says about specs
- **InteractScience** (150 tasks, ICML 2026): the best model (Claude Sonnet 4) passed only **41.5%** of functional tests, and **≤16%** of tasks passed every test. UI actions worked over 85% of the time, but VLM-judged correctness stayed below 60%. Prompts used long implementation plans: structure, element IDs, state, interaction logic ([arXiv](https://arxiv.org/abs/2510.09724)). The lesson: the UI usually works, but the science is often wrong.
- **SimuScene:** the best of 10 LLMs reached a **21.5%** pass rate on physics animations, checked by a VLM judge ([arXiv](https://arxiv.org/abs/2602.10840)).
- **TheoremExplainAgent:** the main failure was hallucinated API (missing functions, wrong signatures). Success rate was 93.8% with an agent loop ([arXiv](https://arxiv.org/pdf/2502.19400)).
- **Google Generative UI:** system instructions contain the goal, planning, examples, technical specs and a "common errors" list, and **post-processors** fix the output afterwards ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)).
- **JSXGraph's AI guide:** state the invariants that must survive dragging, use dependencies instead of fixed coordinates, check calls against the API reference, and give concrete drag-failure feedback ([guide](https://jsxgraph.uni-bayreuth.de/home/ai/ai-best-practices/)).
- **Claude inline visuals** (beta, Mar 2026): HTML/SVG/JS in a sandbox, with CDN libraries ([TNS](https://thenewstack.io/anthropics-claude-interactive-visualizations/)). The internal prompt and CSP aren't public.
- **Implication:** your invariant (2), "LLMs code reliably to spec", is true for the *plumbing* but **not proven for scientific correctness**. The test gate has to check the physics and math, not just "renders".

## 5. Recommended architecture

**Core (owner-written, rarely changes):** the bank loader, the widget host, the SVG renderer, the knob UI (sliders), drag handling, the message bridge and the test harness.
**Plugins (LLM-written, one folder per type):** `widgets/<type>@<semver>/{manifest.json, widget.js, examples/*.json, tests.json, golden/*.png}`.

**Runtime:**
1. The core page creates `<iframe sandbox="allow-scripts" srcdoc=…>`. Into the `srcdoc` it inlines, in this order:
   - the CSP meta: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`
   - the SDK
   - the shared renderer
   - `widget.js`
2. Knobs and sliders live in the iframe or the parent. Answers go to the parent via `sdk.emit`.

**Widget interface (pure where possible):**
```js
export default {
  init(params, sdk)            -> state            // params validated against manifest.paramsSchema
  step?(state, dt, sdk)        -> state            // optional sim tick, fixed dt
  view(state, sdk)             -> SceneNode[]      // data only: {type:'circle'|'path'|'text'|'symbol'|'arrow', ...}
  onDrag?(state, handleId, pt) -> state            // handles declared in view() nodes
  onKnob?(state, key, value)   -> state
  invariants?(state)           -> {name, ok, detail}[]   // e.g. sumP≈1, |ΔE|<ε
  answer?(state)               -> value            // for grading, compared by core
}
```

**SDK surface:**
- `sdk.math` (vectors, clamp, lerp)
- `sdk.rng(seed)` (deterministic)
- `sdk.units`
- `sdk.symbols.get(id)` (your SVG symbol library, drawn in advance)
- `sdk.measureText`
- `sdk.emit(event, payload)`
- `sdk.log`

Nothing else: no `Date.now`, no `Math.random`, no DOM. `view()` returning *data* means the core renderer owns all SVG output.

**Manifest fields:**
- Identity: `type`, `version`, `sdkVersion`, `title`, `description`
- Inputs: `paramsSchema` (JSON Schema), `knobs[] {key, label, min, max, step, unit, default}`, `handles[] {id, constraint}`
- Checks: `invariants[]` (names plus tolerances), `answerSchema`
- Budget: `budget {bytes ≤ 30 KB, stepMs ≤ 4, nodes ≤ 2000}`, `viewBox`
- Provenance: `a11y {altTemplate}`, `generatedBy {model, date, promptHash}`, `reviewedBy`

**Test gate (run in CI and locally before committing a bank; nothing reaches students without passing):**
1. **Static check** (acorn/eslint AST): ban `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function`, `import()`, `document`, `window`, `globalThis` writes, `Math.random`, `Date`, `postMessage`. Enforce the size budget.
2. **Schema check:** the manifest validates and every example matches `paramsSchema`.
3. **Property tests** (run headless in Node with no browser, since the core is pure):
   - every knob at min, max and random values
   - every handle dragged to the corners
   - N `step()`s
   - then assert: no NaN/Infinity; all nodes inside the `viewBox`; `invariants()` all pass; deterministic under a fixed seed; time per step within budget.
4. **Playwright:** render in the real sandboxed iframe, then check for zero console errors and zero CSP violations (`securitypolicyviolation`), and take screenshots at fixed knob states. Compare against `golden/*.png` (pixel diff).
5. **Optional VLM judge** on the screenshots with a checklist: labels readable, matches the description, physically plausible. Advisory only; you approve the final diff.
6. **Self-repair loop at authoring time:** feed failing test output back to the LLM, up to N rounds. Then human review, then commit.

**LLM prompt pack** (the spec the LLM codes against): typed SDK `.d.ts`, the `SceneNode` grammar, 3 full example widgets, a "common errors" list (degrees vs radians, y-axis pointing down, dt blow-up, unclamped drags), the invariant list for the topic, and the test command to run.

## 6. Five-step rollout
1. **Freeze the contract:** `SceneNode` grammar, SDK `.d.ts`, JSON Schema for the manifest. Port one existing visual to it by hand.
2. **Build the host:** sandboxed `srcdoc` iframe + meta CSP + `postMessage` bridge + shared renderer. Check that a widget can't read parent cookies, `fetch` or `localStorage` (write a negative test).
3. **Build the gate:** AST lint, the Node property-test runner, and Playwright snapshot plus CSP-violation checks. Wire them into CI and block merges on failure.
4. **Pilot generation:** have the LLM author 3 types: `vector_canvas` (declarative plus expressions), `canvas_draggable` (handles plus constraints), `prob_sim` (seeded Monte Carlo, ΣP = 1). Measure first-pass vs post-repair pass rates and refine the prompt pack's error list.
5. **Scale:** add the registry with versioned types, an SVG symbol library, a Worker-inside-iframe path for heavy simulations, and optionally the VLM judge. Revisit a separate domain or QuickJS only if the invariants change (for example, student-authored code).
