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
      { id: "neg-1", text: "Keen eye. That \"not\" didn't get you.", kind: "short" },
      { id: "neg-2", text: "Negation handled. Every part.", kind: "short" },
      { id: "neg-3", text: "Flipped the whole statement right.", kind: "full" }
    ],
    "counting": [
      { id: "cnt-1", text: "Every node counted, none twice.", kind: "short" },
      { id: "cnt-2", text: "🎶 You can count on me, like 1 2 3 🎶", kind: "short" },
      { id: "cnt-3", text: "Count me in too.", kind: "full" }
    ],
    "op-swap": [
      { id: "ops-1", text: "Quack-culate that win", kind: "short" },
      { id: "ops-2", text: "Operation: calculate 1+1. Total success!", kind: "short" },
      { id: "ops-3", text: "Your TI did not let you down.", kind: "full" }
    ],
    "misread": [
      { id: "mis-1", text: "Keen eyes this time. QUACKK.", kind: "short" },
      { id: "mis-2", text: "Bet you read the iTunes terms too.", kind: "short" },
      { id: "mis-3", text: "Fine print got nothing on you.", kind: "full" }
    ],
    "fallacy": [
      { id: "fal-1", text: "Sharp brain. Sharper than a razor.", kind: "short" },
      { id: "fal-2", text: "That trap gets old ducks like me.", kind: "short" },
      { id: "fal-3", text: "Better inference than early ChatGPT.", kind: "full" }
    ],
    "arithmetic": [
      { id: "ari-1", text: "Arithmetic held to the end.", kind: "short" },
      { id: "ari-2", text: "Every calculation landed.", kind: "short" },
      { id: "ari-3", text: "Elementary math, done right.", kind: "full" }
    ],
    "algebra": [
      { id: "alg-1", text: "Clean algebra, like a duck after a swim.", kind: "short" },
      { id: "alg-2", text: "Their last words, \"it's just algebra.\"", kind: "short" },
      { id: "alg-3", text: "Algebra was easy. DEAD easy.", kind: "full" }
    ],
    "off-by-one": [
      { id: "obo-1", text: "Boundaries landed exactly right.", kind: "short" },
      { id: "obo-2", text: "Burritos overflow by one. You didn't.", kind: "short" },
      { id: "obo-3", text: "One plus one isn't three today.", kind: "full" }
    ],
    "format": [
      { id: "fmt-1", text: "Right form this time, good catch.", kind: "short" },
      { id: "fmt-2", text: "Soap instructions: read and obeyed.", kind: "short" }
    ],
    "sign": [
      { id: "sgn-1", text: "Signs of recovery. Signed, Cluck.", kind: "short" },
      { id: "sgn-2", text: "All signs point to success.", kind: "short" },
      { id: "sgn-3", text: "Sign of the times.", kind: "full" }
    ],
    "quantifier": [
      { id: "qty-1", text: "All-inclusive. Some restrictions apply.", kind: "short" },
      { id: "qty-2", text: "Kills most germs. Not ALL. QUUACK.", kind: "short" },
      { id: "qty-3", text: "Everything goes well with ranch.", kind: "full" }
    ],
    "off-by-factor": [
      { id: "obf-1", text: "That's a feather-light calculation.", kind: "short" },
      { id: "obf-2", text: "A toast to the right scale.", kind: "short" },
      { id: "obf-3", text: "The front constant's spot on.", kind: "full" }
    ],
    "order-ops": [
      { id: "ord-1", text: "Operations ordered like my ducklings.", kind: "short" },
      { id: "ord-2", text: "Parentheses first. Right order.", kind: "short" },
      { id: "ord-3", text: "Stepping it right, one at a time.", kind: "full" }
    ],
    "limit-plug": [
      { id: "lim-1", text: "Plugging in wasn't the trap.", kind: "short" },
      { id: "lim-2", text: "Limit read correctly.", kind: "short" },
      { id: "lim-3", text: "A quacktastic substitution.", kind: "full" }
    ],
    "domain": [
      { id: "dom-1", text: "Domain expertise. QUUACK.", kind: "short" },
      { id: "dom-2", text: "Domain respected.", kind: "short" },
      { id: "dom-3", text: "Dope domain check.", kind: "full" }
    ],
    "other": [
      { id: "oth-1", text: "The math held up all the way.", kind: "short" },
      { id: "oth-2", text: "Solid reasoning, start to end.", kind: "short" }
    ]
  },
  any: [
    { id: "any-1", text: "Egg-cellent logic. Quacktastic.", kind: "short" },
    { id: "any-2", text: "Reasoning stayed strong.", kind: "short" },
    { id: "any-3", text: "That's egg-cellent reasoning, paddler.", kind: "short" },
    { id: "any-4", text: "You've got duck-umented skill.", kind: "full" },
    { id: "any-5", text: "{title}: handled with care.", kind: "full" },
    { id: "any-6", text: "Feathered applause. Force-ful answer.", kind: "full" }
  ]
};
