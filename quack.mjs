/* quack.mjs: Generate randomized "QUACK" prefixes with warm kaomoji for hint feedback.
   Deterministic from seed; never returns the same string as the previous prefix. */

// Kaomoji emotes: warm/goofy, never sad/mocking/crying/angry
const EMOTES = [
  "(•̀ᴗ•́)و", "(｀・ω・´)", "ヽ(•‿•)ノ", "(ﾉ◕ヮ◕)ﾉ", "( ˘▽˘)っ", "ᕕ( ᐛ )ᕗ", "(•ө•)", "(๑•́ ω •̀๑)",
  "ヽ(´▽`)/", "(´∀｀)ノ", "٩(ˊᗜˋ)و", "(ง •̀ω•́)ง", "( ˙▿˙ )", "ʕ•ᴥ•ʔ", "(っ˘ω˘ς )",
];

// QUACK word variations: different lengths, shapes, and punctuation
// All must match /^qu+a+c+k/i when the emote is removed
const QUACKS = [
  "QUACK",
  "QUACK QUACK",
  "QUACK QUACK QUACK",
  "QUAAACK",
  "QUUUACK",
  "QUAAAACK",
  "QUACK!!",
  "quack.",
  "QUAACK",
  "QUACK~",
  "quACK",
  "QUACKKK",
  "quack!",
  "QUUACK",
  "QUuuACK",
];

// Simple deterministic hash of a string to a number
function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h = h & h; // Convert to 32bit integer
  }
  return Math.abs(h);
}

// Generate a prefix string from seed, ensuring it differs from prev
export function quack(seed, prev = "") {
  const hash = hashSeed(String(seed));

  // Pick QUACK word and emote deterministically from hash
  const quackIdx = hash % QUACKS.length;
  const emoteIdx = Math.floor(hash / QUACKS.length) % EMOTES.length;

  let result = QUACKS[quackIdx] + " " + EMOTES[emoteIdx];

  // If it matches prev, try the next variation
  if (result === prev) {
    const nextQuackIdx = (quackIdx + 1) % QUACKS.length;
    result = QUACKS[nextQuackIdx] + " " + EMOTES[emoteIdx];
  }

  // If still matches (very unlikely), try next emote
  if (result === prev) {
    const nextEmoteIdx = (emoteIdx + 1) % EMOTES.length;
    result = QUACKS[quackIdx] + " " + EMOTES[nextEmoteIdx];
  }

  return result;
}

// Strip existing QUACK prefix from text and return new prefix + rest
export function withQuack(text, seed, prev = "") {
  if (!text) return "";

  const trimmed = String(text).trim();

  // Match and remove leading "QUACK" or "Quack" word (case-insensitive) and trailing punctuation/spaces
  // Pattern: word boundary, QUACK word (case-insensitive), optional punctuation, then optional spaces/newlines
  const match = trimmed.match(/^qu+a+c+k[!.~?]?\s*/i);

  if (match) {
    const rest = trimmed.slice(match[0].length);
    return quack(seed, prev) + (rest ? " " + rest : "");
  }

  // If no QUACK prefix found, just prepend the new quack
  return quack(seed, prev) + " " + trimmed;
}
