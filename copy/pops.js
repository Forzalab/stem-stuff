/* F1 Cluck pops (brain design-round-66 DESIGN-v3 §6, v2 §D copy; Tony #25.3): the humor lines pops.js may show after a clean correct
   answer, through stemDuck.say. Data only; pops.js reads window.__stemPopLines, nothing else does.
   Rules for every line (tests/pops.test.mjs checks them): school-safe, text only, one physics `tag` (no "*" generic fallback); the line
   shown must match the finished item's tags, no match = no pop. `slang: true` marks a line whose joke is slang, not physics: ≤ 1 in 10.
   Cut by Tony #25.3: v2 line 7 (`units` "units checked first = sigma behaviour") and line 12 (`*` "bet. two more and we touch grass"). */
window.__stemPopLines = [
  { tag: "momentum", text: "momentum's conserved fr ( •̀ ᗜ •́ )" },
  { tag: "momentum", text: "Momentum? You're on a roll!" },
  { tag: "energy", text: "it's giving kinetic energy ✨ (½mv², we love her)" },
  { tag: "energy", text: "You're amps-olutely right!" },
  { tag: "forces", text: "free body diagram rizz is real and you have it", slang: true },
  { tag: "forces", text: "N and mg? Cancelled. Not on Twitter though, QUAACK—" },
  { tag: "signs", text: "The signs all aligned (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Fantastic work!" },
  { tag: "circular", text: "Chaotic quack-orbit of pure genius" },
  { tag: "rotation", text: "torque-pilled, wrench approves" },
  { tag: "rotation", text: "Rotation? That's how you roll, champ!" }
];
