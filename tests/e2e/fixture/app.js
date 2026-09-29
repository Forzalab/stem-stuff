// Stand-in for the real app.js in e2e tests only (used when the repo has no index.html yet).
window.stemApp = {
  render(p) { const o = document.getElementById("out"); o.dataset.code = p.code; 
    const md = [].concat(p.body.find(b => b.type === "text")?.md ?? []).join(" ");
    o.innerHTML = md.split(/(\$[^$]+\$)/).map(t => /^\$.*\$$/.test(t) ? katex.renderToString(t.slice(1, -1)) : t.replace(/[<&]/g, "")).join(""); }
};
document.getElementById("f").addEventListener("submit", async e => {
  e.preventDefault();
  const code = document.getElementById("code").value.trim().toUpperCase();
  try { const r = await fetch("p/" + code + ".json"); if (!r.ok) throw new Error(r.status); stemApp.render(await r.json()); }
  catch (err) { document.getElementById("out").textContent = "error " + err.message; }
});
