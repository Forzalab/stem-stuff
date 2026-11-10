/* try/genui-kit.js: shared helpers for try/genui-ui.html + try/genui-redeem.html (agent U, Oct 7 2026).
   Sprite from index.html, KaTeX helper, URL params, reduced motion, the feedback box (maxlength 4000, autogrow) and "Copy all". */
(function (root) {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const P = new URLSearchParams(location.search);
  const rm = P.get("rm") === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (P.get("rm") === "1") document.documentElement.classList.add("rm");
  const icon = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kx = (t, display = false) => { try { return katex.renderToString(t, { displayMode: display, throwOnError: false }); } catch { return esc(t); } };
  /* text with $..$ math -> HTML */
  const md = s => esc(s).replace(/\$\$([^$]+)\$\$/g, (_, m) => kx(m.replace(/&amp;/g, "&"), true)).replace(/\$([^$]+)\$/g, (_, m) => kx(m.replace(/&amp;/g, "&")));
  const wait = ms => new Promise(r => setTimeout(r, rm ? 0 : ms));

  function sprite() {
    return fetch("../index.html").then(r => r.text()).then(t => {
      const s = new DOMParser().parseFromString(t, "text/html").querySelector("svg symbol#i-duck")?.closest("svg");
      const host = $("#sprite"); if (s && host) host.append(document.importNode(s, true));
    }).catch(() => {});
  }

  /* feedback box + Copy all: `<PAGE>;v=..;<toggles>;note=..` */
  function feedback(page, toggles) {
    const ta = $("#note"), btn = $("#copyAll"), out = $("#copied");
    const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
    ta.addEventListener("input", grow); grow();
    btn.addEventListener("click", async () => {
      const line = `${page};${toggles()};note=${ta.value.replace(/\s+/g, " ").trim()}`;
      try { await navigator.clipboard.writeText(line); out.textContent = "Copied."; }
      catch { ta.value = line; ta.select(); out.textContent = "Selected: copy it by hand."; }
    });
  }

  /* variant + state segmented buttons: they rewrite the URL and reload the page (every state is a link) */
  function seg(host, key, vals, cur) {
    host.innerHTML = vals.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${label}</button>`).join("");
    host.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const q = new URLSearchParams(location.search); q.set(key, b.dataset.v); if (key === "v") q.delete("state");
      location.search = q.toString();
    });
  }

  root.GK = { $, P, rm, icon, esc, kx, md, wait, sprite, feedback, seg };
})(window);
