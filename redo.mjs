/* redo.mjs: what happens after a graded miss on an item with a repair ladder (DESIGN-v3 §3-§5; Tony #25, recs 5 and 7).
   Per template: miss -> repair ladder -> the `a` twin alone -> (wrong) the `alt` ladder -> the `a` twin again -> (wrong) the full
   solution, come back later (the caller re-queues via shuffle GAPS). Never a third ladder. `a` twin right -> the `b` twin (if the
   template has one) queued B_GAP+ items later, alone; a `b` miss -> the repair ladder (if one is left), then the solution.
   Conquered = repaired + solo `a` twin + solo `b` twin where one exists. Back-off: after BACKOFF solo-twin wins in a row, the next
   ladder is offered ("want the steps?"), not auto-opened. The run counts solo-twin tries only: a twin miss resets it (and its alt
   ladder auto-opens); the original miss does not (every twin follows one, so the back-off could never trigger).
   State st = { v, pos, wins, t: { TPL: { phase, which, ladders, b, due, repaired, conquered } } }. Pure: rEvent / rDue read and
   write only st (no DOM, no storage), so a JSON round trip changes nothing; the caller persists it. */
export const B_GAP = 2;     // other items between the `a` twin and the `b` twin (TUNABLE)
export const BACKOFF = 2;   // solo-twin wins in a row before Cluck offers instead of auto-opening (Razzaq 2010)
const LADDERS = 2;          // repair + alt (or repair again on a `b` miss), then the solution: never a third
const NONE = Object.freeze({ do: "none" });
export function rNew() { return { v: 1, pos: 0, wins: 0, t: {} }; }
const open = st => st.wins >= BACKOFF ? "offer" : "auto";
/* ev = { type: "miss", tpl, b } | { type: "ladder_done", tpl } | { type: "twin", tpl, ok } | { type: "shown" } (one per showing).
   b = the template has a `b` twin. Returns the next action: { do: "repair"|"alt", open } | { do: "twin", which } |
   { do: "queue", which: "b", gap } | { do: "conquered" } | { do: "solution", later: true } | { do: "none" } */
export function rEvent(st, ev) {
  const s = st.t[ev.tpl];
  switch (ev.type) {
    case "shown": st.pos += 1; return NONE;
    case "miss":
      st.t[ev.tpl] = { phase: "repair", which: "a", ladders: 1, b: !!ev.b, due: null, repaired: false, conquered: false };
      return { do: "repair", open: open(st) };
    case "ladder_done":
      if (!s || (s.phase !== "repair" && s.phase !== "alt")) return NONE;
      s.repaired = true; s.phase = "twin";
      return { do: "twin", which: s.which };
    case "twin": {
      if (!s || (s.phase !== "twin" && s.phase !== "queued")) return NONE;
      if (ev.ok) {
        st.wins += 1;
        if (s.which === "a" && s.b) { s.which = "b"; s.phase = "queued"; s.due = st.pos + B_GAP + 1; return { do: "queue", which: "b", gap: B_GAP }; }
        s.phase = "done"; s.due = null; s.conquered = s.repaired;
        return { do: "conquered" };
      }
      st.wins = 0; s.due = null;
      if (s.ladders >= LADDERS) { s.phase = "later"; return { do: "solution", later: true }; }
      s.ladders += 1;
      s.phase = s.which === "a" ? "alt" : "repair";
      return { do: s.phase, open: open(st) };
    }
    default: return NONE;
  }
}
/* templates whose `b` twin may take the NEXT slot (pos + 1, like qPick), oldest first */
export function rDue(st) {
  return Object.keys(st.t).filter(k => st.t[k].phase === "queued" && st.t[k].due <= st.pos + 1).sort((x, y) => st.t[x].due - st.t[y].due);
}
