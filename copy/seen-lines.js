/* J6 "seen", moment C "earned it the hard way" (Tony Oct 19 19:3x): the lines Cluck's peek carries after a hard-won right pick, picked by
   the ERROR FAMILY of the last wrong pick on that item (the `error` values in problems.json + banks/*.json). Data only; intent.js reads
   window.__stemSeenLines, nothing else does.
   Rules for every line (tests/seen.test.mjs + tests/test_seen_lines.py check them): speak about the MATH they beat, never about the trigger.
   No counts, no "no help" / hint, no timers, no "again" / "finally", no digits, no emotion or state word. ≤ 8 words (after {title} is
   filled; a filled line over 8 words is skipped), no "!", no em dash, no answer text. kind: "short" | "full" ("full" is the rare one; some
   carry {title}, the item's title). A "nod" has no text: the duck just rises, so it has no line here. `any` = the pool for a family
   without lines (or without a free line of the kind). An id is used once per session. */
window.__stemSeenLines = {
  fam: {
    "negation": [
      { id: "neg-1", text: "That 'not' didn't get you.", kind: "short" },
      { id: "neg-2", text: "Negation handled. Every part.", kind: "short" },
      { id: "neg-3", text: "Flipped the whole statement right.", kind: "full" }
    ],
    "counting": [
      { id: "cnt-1", text: "Every node counted, none twice.", kind: "short" },
      { id: "cnt-2", text: "Each case counted exactly once.", kind: "short" },
      { id: "cnt-3", text: "Nothing missed, nothing doubled up.", kind: "full" }
    ],
    "op-swap": [
      { id: "ops-1", text: "Right operation this time. Clean.", kind: "short" },
      { id: "ops-2", text: "The operation fit the problem.", kind: "short" },
      { id: "ops-3", text: "Picked the operation it asked for.", kind: "full" }
    ],
    "misread": [
      { id: "mis-1", text: "Read it the way it's written. Nice.", kind: "short" },
      { id: "mis-2", text: "Read the question as asked.", kind: "short" },
      { id: "mis-3", text: "{title}: read exactly as written.", kind: "full" }
    ],
    "fallacy": [
      { id: "fal-1", text: "That reasoning holds up.", kind: "short" },
      { id: "fal-2", text: "Logic checks out, step by step.", kind: "short" },
      { id: "fal-3", text: "Skipped the tempting wrong inference.", kind: "full" }
    ],
    "arithmetic": [
      { id: "ari-1", text: "Arithmetic held to the end.", kind: "short" },
      { id: "ari-2", text: "Every calculation landed.", kind: "short" },
      { id: "ari-3", text: "The numbers worked out line by line.", kind: "full" }
    ],
    "algebra": [
      { id: "alg-1", text: "Algebra stayed clean throughout.", kind: "short" },
      { id: "alg-2", text: "Each rearrangement was legal.", kind: "short" },
      { id: "alg-3", text: "Every step kept both sides balanced.", kind: "full" }
    ],
    "off-by-one": [
      { id: "obo-1", text: "Boundaries landed exactly right.", kind: "short" },
      { id: "obo-2", text: "Endpoints counted right.", kind: "short" },
      { id: "obo-3", text: "Both endpoints in the right place.", kind: "full" }
    ],
    "format": [
      { id: "fmt-1", text: "Right form for the answer.", kind: "short" },
      { id: "fmt-2", text: "Answer in the form asked.", kind: "short" },
      { id: "fmt-3", text: "{title}: said the way they asked.", kind: "full" }
    ],
    "sign": [
      { id: "sgn-1", text: "That minus sign stayed put.", kind: "short" },
      { id: "sgn-2", text: "Signs all pointed the right way.", kind: "short" },
      { id: "sgn-3", text: "Negatives handled with real care.", kind: "full" }
    ],
    "quantifier": [
      { id: "qty-1", text: "All and some, told apart.", kind: "short" },
      { id: "qty-2", text: "Every versus some. Right call.", kind: "short" },
      { id: "qty-3", text: "{title}: 'every' meant every.", kind: "full" }
    ],
    "off-by-factor": [
      { id: "obf-1", text: "Scale factor came out right.", kind: "short" },
      { id: "obf-2", text: "Factor of the right size.", kind: "short" },
      { id: "obf-3", text: "The constant out front was right.", kind: "full" }
    ],
    "order-ops": [
      { id: "ord-1", text: "Order of operations held.", kind: "short" },
      { id: "ord-2", text: "Parentheses first. Right order.", kind: "short" },
      { id: "ord-3", text: "Did the steps in the right order.", kind: "full" }
    ],
    "limit-plug": [
      { id: "lim-1", text: "Plugging in wasn't the trap.", kind: "short" },
      { id: "lim-2", text: "Read that limit properly.", kind: "short" },
      { id: "lim-3", text: "Saw past the easy substitution.", kind: "full" }
    ],
    "domain": [
      { id: "dom-1", text: "Stayed inside the domain.", kind: "short" },
      { id: "dom-2", text: "Domain respected.", kind: "short" },
      { id: "dom-3", text: "Checked which values were allowed.", kind: "full" }
    ],
    "other": [
      { id: "oth-1", text: "The math held up all the way.", kind: "short" },
      { id: "oth-2", text: "Solid reasoning, start to end.", kind: "short" },
      { id: "oth-3", text: "{title}: the reasoning held together.", kind: "full" }
    ]
  },
  any: [
    { id: "any-1", text: "Clean finish.", kind: "short" },
    { id: "any-2", text: "The reasoning was sound.", kind: "short" },
    { id: "any-3", text: "That math held.", kind: "short" },
    { id: "any-4", text: "Right answer, solid reasoning.", kind: "full" },
    { id: "any-5", text: "{title}: handled with care.", kind: "full" },
    { id: "any-6", text: "Each step stood on solid ground.", kind: "full" }
  ]
};
