"""copy_gate.py: the gate's `copy-words` checks for a view's student-facing strings (views plan, Oct 20: plain words,
Flesch-Kincaid grade 2-4, jargon only from a human-corpus allowlist, every slot fits its box). Stdlib only, like aiw.py.

    fk_grade(text) -> float | None          Flesch-Kincaid grade of text after TeX and numbers-with-units are removed
                                            (None when no words remain).
    check_view(strings, allow, budgets=None, lint_context=None) -> list[issue]
        strings  {slot_id: text}, every student-facing string of ONE view
        allow    set of allowed terms (lowercase words or 2-3-grams), e.g. load_allow(course)
        budgets  {slot_id: max characters} from slots.json (None: no overflow check)
        issue    {"check": "fk"|"jargon"|"overflow"|"aiw", "slot": slot_id, ...detail}. The fk issue scores the whole view,
                 so its slot is "*" and it lists every slot in "slots".

Rules
- fk: the WHOLE view text is joined (each slot is its own sentence) and scored once; single short strings are never
  scored alone. Under FK_MIN_WORDS (20) words the formula is noise (one short label swings it by many grades), so the
  check is skipped. Fail when grade > 4 or grade < 2.
- jargon: a content word (alphabetic, not a common-English word, see below) is jargon unless it, or a 2-3-gram of
  adjacent content words holding it, is in `allow`. One issue per distinct term per slot.
- overflow: len(text) > budgets[slot].
- aiw: every blocking aiw.lint_view_strings finding, with the slot it came from.

Common English = views/allow/common-en.txt (top 5000 English words, wordfreq data, CC-BY-SA-4.0; see its header).
A word also counts as common if stripping one regular suffix (s, es, ed, d, ing, ly, er, est; e.g. "dogs", "liked",
"running") gives a listed word. FUNCTION_WORDS (grammar words) never form or break n-grams.

Syllable heuristic (deterministic, no dictionary): lowercase, letters only; count runs of vowels [aeiouy]; minus one for
a silent final "e" (not "le" after a consonant, not "ee"/"ye"); minus one for a final "es"/"ed" after a consonant other
than the sibilant/dental endings (s, x, z, ch, sh, t, d) when that leaves at least one vowel run; floor 1.
FK = 0.39 * words/sentences + 11.8 * syllables/words - 15.59. Sentences end at . ! ? (one or more).
"""
import json
import os
import re

import aiw

ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOW_DIR = os.path.join(ROOT, "views", "allow")
COMMON_PATH = os.path.join(ALLOW_DIR, "common-en.txt")
FK_MIN_WORDS = 20
FK_LO, FK_HI = 2.0, 4.0

# Grammar words: never content words, never inside an n-gram (most are in common-en too; this set only shapes n-grams).
FUNCTION_WORDS = frozenset("""
a an the and or but nor so yet if then than that this these those there here of in on at by for to from with into onto
upon about over under after before between through during without within off up down out as is are was were be been
being am do does did done have has had having it its it's i you he she we they me him her us them my your his our their
not no yes can could will would shall should may might must what which who whom whose when where why how all any each
every some such both either neither one ones own same other another very too also just only
""".split())

_TEX = re.compile(r"\$\$.*?\$\$|\$[^$]*\$|\\\(.*?\\\)|\\\[.*?\\\]", re.S)
_UNITS = r"(?:%|°C|°F|°|km/h|m/s\^?2|m/s²|m/s|mph|mm|cm|km|m|ms|min|h|s|kg|mg|g|N|J|kJ|W|kW|V|A|Hz|Pa|kPa|K|mol|mL|L)"
_NUM_UNIT = re.compile(r"[-+−]?\d[\d,]*(?:\.\d+)?(?:\s?" + _UNITS + r"(?![A-Za-z]))?")
_WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
_VOWELS = re.compile(r"[aeiouy]+")

_common_cache = None


def load_common(path=COMMON_PATH):
    global _common_cache
    if path == COMMON_PATH and _common_cache is not None:
        return _common_cache
    with open(path, encoding="utf-8") as f:
        words = frozenset(w.strip() for w in f if w.strip() and not w.startswith("#"))
    if path == COMMON_PATH:
        _common_cache = words
    return words


def load_allow(course, allow_dir=ALLOW_DIR):
    """Allowed terms of views/allow/<course>.json (built by tools/jargon.py); a missing file is an empty set."""
    p = os.path.join(allow_dir, course + ".json")
    if not os.path.exists(p):
        return set()
    with open(p, encoding="utf-8") as f:
        return {t["term"] for t in json.load(f).get("terms", [])}


def strip_math(text):
    """Remove TeX ($..$, $$..$$, \\(..\\), \\[..\\]) and numbers with an optional unit; they are not words."""
    return _NUM_UNIT.sub(" ", _TEX.sub(" ", text))


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    n = len(_VOWELS.findall(w))
    if len(w) > 2 and w.endswith("e") and not w.endswith(("ee", "ye")) and not (w.endswith("le") and w[-3] not in "aeiouy"):
        n -= 1
    elif len(w) > 3 and w.endswith(("es", "ed")) and w[-3] not in "aeiouy" and not w.endswith(
            ("ses", "xes", "zes", "ches", "shes", "ted", "ded")):
        if len(_VOWELS.findall(w[:-2])) >= 1:
            n -= 1
    return max(1, n)


def _words(text):
    return _WORD.findall(text)


def fk_stats(text):
    t = strip_math(text)
    words = _words(t)
    sents = [s for s in re.split(r"[.!?]+", t) if _words(s)]
    return {"words": len(words), "sentences": max(1, len(sents)), "syllables": sum(syllables(w) for w in words)}


def fk_grade(text):
    st = fk_stats(text)
    if not st["words"]:
        return None
    return round(0.39 * st["words"] / st["sentences"] + 11.8 * st["syllables"] / st["words"] - 15.59, 2)


def join_view(strings):
    """One document: each slot is its own sentence (a period is added when the slot has no end mark)."""
    parts = []
    for v in strings.values():
        v = (v or "").strip()
        if v:
            parts.append(v if re.search(r"[.!?]\s*$", strip_math(v)) else v + ".")
    return " ".join(parts)


def is_common(word, common):
    w = word.lower()
    if w in common or w in FUNCTION_WORDS:
        return True
    for suf, add in (("ing", ""), ("ing", "e"), ("es", ""), ("ed", ""), ("ed", "e"), ("est", ""), ("er", ""),
                     ("ly", ""), ("s", ""), ("d", "")):
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            base = w[:-len(suf)] + add
            if base in common:
                return True
            if suf in ("ing", "ed", "er", "est") and len(base) > 2 and base[-1] == base[-2] and base[:-1] in common:
                return True  # running -> run
    return False


def content_runs(text):
    """Runs of adjacent content tokens (lowercase); function words, punctuation, TeX and numbers break a run."""
    runs, cur = [], []
    for piece in re.split(r"[^A-Za-z']+", strip_math(text)):
        piece = piece.strip("'").lower()
        if not piece or piece in FUNCTION_WORDS:
            if cur:
                runs.append(cur)
            cur = []
            continue
        cur.append(piece)
    if cur:
        runs.append(cur)
    return runs


def _runs_by_phrase(text):
    out = []
    for chunk in re.split(r"[.,;:!?()\[\]{}\"]+", strip_math(text)):
        out.extend(content_runs(chunk))
    return out


def jargon_terms(text, allow, common=None):
    """Distinct jargon words in text, in first-seen order (see module doc)."""
    common = load_common() if common is None else common
    allow = {a.lower() for a in allow}
    found = []
    for run in _runs_by_phrase(text):
        for i, w in enumerate(run):
            if is_common(w, common) or w in allow:
                continue
            covered = False
            for n in (2, 3):
                for s in range(max(0, i - n + 1), min(i, len(run) - n) + 1):
                    if " ".join(run[s:s + n]) in allow:
                        covered = True
            if not covered and w not in found:
                found.append(w)
    return found


def check_view(strings, allow, budgets=None, lint_context=None, common=None):
    issues = []
    joined = join_view(strings)
    st = fk_stats(joined)
    if st["words"] >= FK_MIN_WORDS:
        g = fk_grade(joined)
        if g > FK_HI or g < FK_LO:
            issues.append({"check": "fk", "slot": "*", "slots": list(strings), "grade": g, "words": st["words"],
                           "want": [FK_LO, FK_HI]})
    for slot, text in strings.items():
        for term in jargon_terms(text or "", allow, common):
            issues.append({"check": "jargon", "slot": slot, "term": term})
    for slot, text in strings.items():
        if budgets and slot in budgets and len(text or "") > budgets[slot]:
            issues.append({"check": "overflow", "slot": slot, "len": len(text or ""), "budget": budgets[slot]})
    slots = list(strings)
    for slot, r in zip(slots, aiw.lint_view_strings([strings[s] or "" for s in slots], lint_context)):
        for b in r["block"]:
            issues.append({"check": "aiw", "slot": slot, "type": b["type"], "text": b["text"]})
    return issues


def fk_skipped(strings):
    """True when the view is too short for FK (under FK_MIN_WORDS words after stripping): the fk check did not run."""
    return fk_stats(join_view(strings))["words"] < FK_MIN_WORDS


if __name__ == "__main__":
    import sys
    data = json.load(sys.stdin)
    allow = load_allow(data["course"]) if data.get("course") else set(data.get("allow", []))
    print(json.dumps(check_view(data["strings"], allow, data.get("budgets")), indent=1))
