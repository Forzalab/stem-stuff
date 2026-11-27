// mc-ink.mjs: pixel ink measure of the MC tiles' letter vs the answer's first line (Tony Nov 27: judge by eye + centred axis, not DOM boxes).
// measureTiles(page) -> [{ l, fw, fs, lfs, lines, kind, baseDy, capDy, fullDy }] for every single-choice tile of the open item (scrolls each into view, screenshots it at the page's scale).
//   baseDy = letter baseline - first-line baseline (DOM probe)
//   capDy  = letter ink centre - first-line ink centre, rows down to the first baseline (descenders / fraction bars below it ignored): the "cap line" axis, right for words
//   fullDy = letter ink centre - first-line ink centre over the WHOLE first-line ink (rows of the first line box, descenders and \dfrac bars included): the axis the eye takes for math / code
//   (exponents / subscripts are hidden during the scan)
//   kind   = "code" | "math" | "text" (what the first-line content holds)
export async function measureTiles(page) {
  const ls = await page.evaluate(() => [...document.querySelectorAll("#q .choices:not(.all) .opt")].map(o => o.dataset.l));
  const rows = [];
  for (const l of ls) {
    await page.evaluate(l => document.querySelector(`#q .opt[data-l="${l}"]`).scrollIntoView({ block: "center" }), l);
    const g = await page.evaluate(l => {
      const o = document.querySelector(`#q .opt[data-l="${l}"]`), t = o.querySelector(".txt"), b = o.querySelector(".badge"), tb = t.querySelector("p") || t, cs = getComputedStyle(t), lh = parseFloat(cs.lineHeight);
      const probe = el => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; el.insertBefore(s, el.firstChild); const y = s.getBoundingClientRect().bottom; s.remove(); return y; };
      const R = o.getBoundingClientRect(), T = t.getBoundingClientRect(), B = b.getBoundingClientRect(), bl = probe(tb), lbl = probe(b);
      const first = (tb.firstElementChild && tb.firstElementChild.matches(".katex, code") ? tb.firstElementChild : null) || [...tb.querySelectorAll(".katex, code")].find(e => e.getBoundingClientRect().top < T.top + lh) || null;
      const kind = first ? (first.matches("code") ? "code" : "math") : "text";
      return { x: R.x, y: R.y, w: R.width, h: R.height, bl: bl - R.y, baseDy: lbl - bl, tx0: T.left - R.x, tx1: T.right - R.x, ty0: T.top - R.y, ty1: T.top - R.y + (T.height < lh * 1.5 || (t.querySelector(".mfrac") && T.height < lh * 2.2) ? T.height : lh), bx0: B.left - R.x, bx1: B.right - R.x, by0: B.top - R.y, by1: B.bottom - R.y,
        fw: cs.fontWeight, fs: cs.fontSize, lfs: getComputedStyle(b).fontSize, lines: Math.round(T.height / lh), kind };
    }, l);
    // exponents / subscripts are hidden for the scan: the eye centres the letter on the MAIN line, not on a raised 4 (a 13^4 tile would read 2px off otherwise)
    await page.addStyleTag({ content: "#q .opt .msupsub { visibility: hidden !important }" }).then(h => h.evaluate(e => { e.id = "mc-ink-style"; }));
    const b64 = (await page.screenshot({ clip: { x: g.x, y: g.y, width: g.w, height: g.h } })).toString("base64");
    await page.evaluate(() => document.getElementById("mc-ink-style")?.remove());
    const px = await page.evaluate(async b64 => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0); return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; }, b64);
    const S = px.w / g.w;   // device pixels per css px
    const bg = px.d.slice(0, 3), on = (x, y) => { const i = (y * px.w + x) * 4; return Math.abs(px.d[i] - bg[0]) + Math.abs(px.d[i + 1] - bg[1]) + Math.abs(px.d[i + 2] - bg[2]) > 90; };
    const span = (x0, x1, y0, y1) => { let a = 1e9, z = -1; for (let y = Math.max(0, Math.floor(y0 * S)); y < Math.min(px.h, Math.ceil(y1 * S)); y++) for (let x = Math.floor(x0 * S); x < Math.min(px.w, Math.ceil(x1 * S)); x++) if (on(x, y)) { a = Math.min(a, y); z = Math.max(z, y + 1); } return z < 0 ? null : [a / S, z / S]; };
    const mid = r => (r[0] + r[1]) / 2, L = span(g.bx0, g.bx1, g.by0, g.by1), Tc = span(g.tx0, g.tx1, g.ty0, g.bl + 0.5), Tf = span(g.tx0, g.tx1, g.ty0, g.ty1);
    rows.push({ l, kind: g.kind, fw: g.fw, fs: g.fs, lfs: g.lfs, lines: g.lines, baseDy: +g.baseDy.toFixed(2),
      capDy: L && Tc ? +(mid(L) - mid(Tc)).toFixed(2) : null, fullDy: L && Tf ? +(mid(L) - mid(Tf)).toFixed(2) : null });
  }
  return rows;
}
