/* 160 PR-B "tool call theater" (client half; the server half is serve.py "stage events"): while Cluck works, the wait shows its real steps
   as a Step list (mock v1, brain mock-opus/109-160): one row per stage, a spinner and the "now" words while it runs, a tick and the past
   tense when it ends, each row's own seconds. The reply ends it in a one-line summary ("Thought for 6s"), tap to open the rows again.
   Stage UI is app chrome (plain DOM), not Cluck's reply: the reply text stays what the server sent, minus the event lines.
   Stages.feed(state, chunk) -> { text, events }: the pure line splitter; state = { buf: "" }, one per request. A staged body is
     "\x1e"+JSON+"\n" lines among the text; an event may follow text with no newline; a line cut by a chunk waits for its newline; a half line
     at the very end is dropped, never shown. Without a "\x1e" the text is the chunk, byte for byte.
   Stages.make({ host, cap }) -> a tracker: .event(ev) .finish(ok) .stop() .paint() .seen. host() returns the element to paint in (null = nothing
     is open: it paints when asked again, so a sheet opened later shows the state so far); cap = the seconds limit shown as "4s / 25s"
     (the proof Check only). Nothing paints until the first event, so a server without stages changes nothing. */
(() => {
  const RS = "\x1e";
  function feed(s, chunk) {
    let b = s.buf + chunk, text = "";
    const events = [];
    for (;;) {
      const i = b.indexOf(RS);
      if (i < 0) { text += b; b = ""; break; }
      text += b.slice(0, i);
      const j = b.indexOf("\n", i);
      if (j < 0) { b = b.slice(i); break; }
      try { events.push(JSON.parse(b.slice(i + 1, j))); } catch { /* a garbled event line: dropped */ }
      b = b.slice(j + 1);
    }
    s.buf = b;
    return { text, events };
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const secs = ms => Math.max(0, Math.floor(ms / 1000));
  function make({ host = () => null, cap = 0 } = {}) {
    const L = window.STAGE_LINES || {}, rows = [], st = { rows, seen: false, state: "run", open: false, t0: Date.now(), total: 0, timer: 0 };
    const words = r => { const l = L[r.stage] || [[r.stage, r.stage]]; return l[Math.min(r.n, l.length - 1)]; };
    const sum = open => `<button type="button" class="stg-sum${open ? " open" : ""}" aria-expanded="${open}"><i class="stg-ic stg-ok" aria-hidden="true"></i><span>${esc(L.done)} ${Math.max(1, secs(st.total))}s</span><i class="stg-chev" aria-hidden="true"></i></button>`;
    const html = now => {
      if (st.state === "ok" && !st.open) return sum(false);
      const lis = rows.map(r => {
        const open = !r.t1, bad = open && st.state === "fail";
        return `<li class="stg-r ${bad ? "bad" : open ? "run" : "done"}"><i class="stg-ic" aria-hidden="true"></i><span class="stg-tx">${esc(bad ? L.fail : words(r)[open ? 0 : 1])}</span>${bad ? "" : `<span class="stg-s">${secs((r.t1 || now) - r.t0)}s</span>`}</li>`;
      }).join("");
      const chip = cap && st.state === "run" ? `<span class="stg-tmr">${secs(now - st.t0)}s / ${cap}s</span>` : "";
      return `${chip}${st.state === "ok" ? sum(true) : ""}<ol class="stg-l">${lis}</ol>`;
    };
    st.paint = () => {
      if (!st.seen || st.state === "stop") return;
      const h = host(); if (!h) return;
      const s = html(Date.now());
      if (h._stg !== s) h.innerHTML = h._stg = s;
      h.dataset.state = st.state;
      h.onclick = e => { if (st.state === "ok" && e.target.closest(".stg-sum")) { st.open = !st.open; st.paint(); } };   // assigned, not added: a repaint never stacks listeners
    };
    const halt = () => { clearInterval(st.timer); st.timer = 0; };
    st.event = ev => {
      if (!ev || !ev.stage) return;
      const now = Date.now();
      if (ev.at === "start") rows.push({ stage: ev.stage, n: rows.filter(r => r.stage === ev.stage).length, t0: now, t1: 0 });
      else { const r = rows.findLast(r => r.stage === ev.stage && !r.t1); if (r) r.t1 = now; }
      if (!st.seen) { st.seen = true; st.timer = setInterval(() => (st.state === "run" ? st.paint() : halt()), 100); }
      st.paint();
    };
    st.finish = ok => {                                     // ok = the reply (or the JSON) really arrived; anything else = no tick
      if (st.state !== "run") return;
      const now = Date.now();
      st.state = ok ? "ok" : "fail"; st.total = now - (rows[0] ? rows[0].t0 : st.t0);   // from the first step: a slow queue is not Cluck's thinking
      if (ok) for (const r of rows) r.t1 ||= now;
      halt(); st.paint();
    };
    st.stop = () => { halt(); if (st.state === "stop") return; st.state = "stop"; const h = st.seen && host(); if (h) h.innerHTML = h._stg = ""; };   // the student left: nothing stays
    return st;
  }
  window.Stages = { feed, make };
})();
