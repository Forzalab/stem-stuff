/* stem-stuff offline layer. Contract in OFFLINE.md.
 * - registers sw.js where allowed (https or localhost), else runs without it
 * - wraps fetch for p/<CODE>.json: if the server can't be reached (or file://),
 *   asks the student for problems.json on disk and answers the fetch from it
 * - ONE file holds every problem ({ v: 1, problems: [...] }, SCHEMA.md); picking it loads them all
 * - window.stemOffline: { mode, loadProblem, onProblemLoaded, openPicker, pickFile, has, get, codes } */
(() => {
  if (window.stemOffline) return;
  const FILE = location.protocol === "file:";
  const CAN_SW = !FILE && "serviceWorker" in navigator && window.isSecureContext;
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const CODE = /^[A-Z][A-Z0-9]*_[A-Z0-9]{2,}$/;
  const PATH = /(?:^|\/)p\/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})\.json$/;
  const MAX = 8 * 1024 * 1024;

  const local = new Map();      // code -> problem picked from disk
  const listeners = [];
  let waiting = null;           // { code, resolve, reject } while a fetch waits on the picker
  const nativeFetch = window.fetch.bind(window);

  const api = window.stemOffline = {
    mode: FILE ? "file" : CAN_SW ? "sw" : "online",
    has: code => local.has(code),
    get: code => local.get(code),
    codes: () => [...local.keys()],
    onProblemLoaded(cb) { if (typeof cb === "function") listeners.push(cb); },
    openPicker: code => pick(code || null),
    pickFile: () => pickFile(),
    ingest: list => ingest(list),
    fileName: code => names.get(code) || null,
    loadProblem,
    validate,
    restore: () => restore(),
    ready: null
  };
  const TIMEOUT = 8000;
  const timed = (input, init) => {                       // every fetch from here: aborted after 8 s (design/RELOAD.md)
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
    return nativeFetch(input, { ...(init || {}), signal: ctl.signal }).finally(() => clearTimeout(t));
  };

  /* ---------- the uploaded bank survives reloads: IndexedDB stem-stuff / bank / "files" = [{ name, text }] ---------- */
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("no idb"));
      const o = indexedDB.open("stem-stuff", 1);
      o.onupgradeneeded = () => o.result.createObjectStore("bank");
      o.onerror = () => reject(o.error);
      o.onsuccess = () => {
        const db = o.result, tx = db.transaction("bank", mode), r = fn(tx.objectStore("bank"));
        tx.oncomplete = () => { db.close(); resolve(r && r.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const saveBank = files => idb("readwrite", s => s.put(files, "files")).catch(() => {});
  async function restore() {
    if (local.size) return false;
    let files;
    try { files = await idb("readonly", s => s.get("files")); } catch (e) { return false; }
    if (!Array.isArray(files) || !files.length) return false;
    const { got } = await ingest(files.map(f => ({ name: f.name, size: f.text.length, text: async () => f.text })), false);
    return got.length > 0;
  }
  api.ready = restore().catch(() => false);
  addEventListener("pageshow", e => { if (e.persisted && !local.size) api.ready = restore().catch(() => false); });

  if (CAN_SW) navigator.serviceWorker.register("sw.js").catch(() => { api.mode = "online"; });

  function validate(p) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return "not a problem file";
    if (typeof p.code !== "string" || !CODE.test(p.code)) return "no problem code";
    if (typeof p.type !== "string") return "no type";
    if (!Array.isArray(p.body) || !p.body.length || !p.body.every(b => b && typeof b.type === "string")) return "no body";
    return null;
  }

  function emit(p) {
    const app = window.stemApp;
    if (listeners.length) { for (const cb of listeners) { try { cb(p); } catch (e) { console.error(e); } } return; }
    if (app && typeof app.render === "function") { app.render(p); return; }
    location.hash = p.code;   // app.js loads #CODE via fetch, which the wrapper answers from memory
  }

  // Server first (unless file://); on network failure, disk.
  async function loadProblem(code) {
    code = String(code).trim().toUpperCase();
    if (local.has(code)) return local.get(code);
    if (!FILE) {
      let r;
      try { r = await timed("p/" + encodeURIComponent(code) + ".json"); } catch (e) { r = null; }
      if (r && r.ok) return r.json();
      if (r && r.status < 500) { const e = new Error("not found"); e.status = r.status; throw e; }
    }
    return pick(code);
  }

  window.fetch = function (input, init) {
    let m = null;
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      if ((!init || !init.method || init.method === "GET") && (url.origin === location.origin || FILE)) m = url.pathname.match(PATH);
    } catch (e) { /* not a URL we care about */ }
    if (!m) return nativeFetch(input, init);
    const code = m[1];
    const answer = p => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } });
    if (local.has(code)) return Promise.resolve(answer(local.get(code)));
    if (FILE) return pick(code).then(answer);
    return nativeFetch(input, init).then(
      r => r.status >= 500 ? pick(code).then(answer) : r,
      e => e && e.name === "AbortError" ? Promise.reject(e) : pick(code).then(answer));   // a timeout is not "offline"
  };

  /* ---------- picker UI ---------- */
  const ICON = {
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'
  };
  /* buttons use the page's one button system (.btn / .btn-go in app.css): 48px, 8px radius, 24px icon, 2px stroke */
  const svg = n => '<svg class="ico" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[n] + "</svg>";

  const CSS = `
.so{--so-ink:var(--ink,#e7edf6);--so-muted:var(--muted,#a2b3cb);--so-sheet:var(--sheet,#1d2839);--so-edge:var(--edge,#6b7f9e);--so-focus:var(--focus,#8fb0ff);--so-bad:var(--bad,#ff7a7a);--so-ok:var(--ok,#5fd394);
 position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgb(10 15 24/.72);
 font:400 1.0625rem/1.5 "Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;color:var(--so-ink)}
.so[hidden]{display:none}
.so-card{position:relative;box-sizing:border-box;width:100%;max-width:26rem;padding:1.5rem 1.25rem 1.25rem;background:var(--so-sheet);border:1px solid #34445d;border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0/.45)}
.so-card.drag{border-color:var(--so-focus);outline:2px dashed var(--so-focus);outline-offset:-8px}
.so h2{margin:0 3.75rem .35rem 0;font-size:1.25rem;line-height:1.3;font-weight:700}
.so p{margin:0 0 1.1rem;color:var(--so-muted)}
.so code{font:600 .95em ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--so-ink);overflow-wrap:anywhere}
.so-row{display:flex;gap:.5rem;flex-wrap:wrap}
.so-btn input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip-path:inset(50%)}
.so-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.so-x{position:absolute;top:.75rem;right:.75rem}
.so-msg{min-height:1.5em;margin:.9rem 0 0;font-size:.95rem;color:var(--so-muted)}
.so-msg.bad{color:var(--so-bad)}.so-msg.ok{color:var(--so-ok)}
@media (max-width:480px){.so{align-items:flex-end;padding:0}.so-card{max-width:none;border-radius:14px 14px 0 0;padding-bottom:calc(1.25rem + env(safe-area-inset-bottom))}}
@media (prefers-reduced-motion:no-preference){.so-card{animation:so-in .16s ease-out}@keyframes so-in{from{transform:translateY(8px);opacity:0}}}`;

  let ui = null, lastFocus = null;
  function build() {
    if (ui) return ui;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = document.createElement("div");
    el.className = "so";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "so-t");
    el.setAttribute("aria-describedby", "so-d");
    const dir = !IOS && "webkitdirectory" in document.createElement("input");
    el.innerHTML =
      '<div class="so-card">' +
      '<button type="button" class="btn so-x" aria-label="Close" title="Close">' + svg("x") + "</button>" +
      '<h2 id="so-t"></h2><p id="so-d"></p>' +
      '<div class="so-row">' +
      '<label class="btn btn-go so-btn main" title="Open file">' + svg("file") + '<span class="so-sr">Open file</span><input type="file" accept=".json,application/json" multiple></label>' +
      (dir ? '<label class="btn so-btn" title="Open folder">' + svg("folder") + '<span class="so-sr">Open folder</span><input type="file" webkitdirectory multiple></label>' : "") +
      "</div>" +
      '<p class="so-msg" role="status" aria-live="polite"></p></div>';
    document.body.appendChild(el);
    const card = el.firstChild;
    el.querySelector(".so-x").onclick = () => close(true);
    el.addEventListener("click", e => { if (e.target === el) close(true); });
    el.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      if (e.key === "Tab") {       // keep focus inside
        const f = [...el.querySelectorAll("button,input")];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    for (const inp of el.querySelectorAll("input")) inp.addEventListener("change", () => { read(inp.files); inp.value = ""; });
    card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("drag"); });
    card.addEventListener("dragleave", () => card.classList.remove("drag"));
    card.addEventListener("drop", e => { e.preventDefault(); card.classList.remove("drag"); read(e.dataTransfer.files); });
    return (ui = el);
  }

  function say(text, cls) {
    const m = ui.querySelector(".so-msg");
    m.textContent = text;
    m.className = "so-msg" + (cls ? " " + cls : "");
  }

  function pick(code) {
    const el = build();
    if (waiting && waiting.code !== code) waiting.reject(new TypeError("offline"));
    const p = new Promise((resolve, reject) => { waiting = code ? { code, resolve, reject } : null; });
    el.querySelector("#so-t").textContent = FILE ? "Offline copy" : "Server offline";
    el.querySelector("#so-d").innerHTML = code
      ? "Open <code>problems.json</code> (it has " + code + ") from your files."
      : "Open <code>problems.json</code> from your files.";
    say("");
    if (el.hidden) { lastFocus = document.activeElement; el.hidden = false; }
    el.querySelector("input").focus();
    return code ? p : Promise.resolve(null);
  }

  function close(cancel) {
    if (!ui || ui.hidden) return;
    ui.hidden = true;
    if (cancel && waiting) { waiting.reject(new TypeError("offline: no file chosen")); waiting = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Parse picked problems.json file(s) into the in-memory store. Shared by the dialog and by pickFile().
  const names = new Map();      // code -> file name it came from
  async function ingest(list, save = true) {
    const files = [...(list || [])].filter(f => /\.json$/i.test(f.name));
    const got = [], bad = [], keep = [];
    for (const f of files) {
      try {
        if (f.size > MAX) throw 0;
        const text = await f.text(), bank = JSON.parse(text);
        const ps = bank && Array.isArray(bank.problems) ? bank.problems.filter(p => !validate(p)) : [];
        if (!ps.length) throw 0;
        for (const p of ps) { local.set(p.code, p); names.set(p.code, f.name); got.push(p); }
        keep.push({ name: f.name, text });
      } catch (e) { bad.push(f.name); }
    }
    if (save && keep.length) await saveBank(keep);
    return { files, got, bad };
  }

  async function read(list) {
    const { files, got, bad } = await ingest(list);
    if (!files.length) { say("No .json files there.", "bad"); return; }
    if (!got.length) { say((bad.length === 1 ? bad[0] + " is" : "Those files are") + " not a problems.json.", "bad"); return; }
    if (waiting) {
      const hit = local.get(waiting.code);
      if (!hit) { say("Loaded " + got.length + ", but no " + waiting.code + " in them.", "bad"); return; }
      const w = waiting; waiting = null; close(false); w.resolve(hit);
      return;
    }
    close(false);
    emit(got[0]);
  }

  // Direct upload (the page's upload button): the OS file dialog, no modal. Loads every problem in the file.
  // Resolves { problem, name, count } (and emits the first problem), { error } otherwise, null if cancelled.
  let upInput = null;
  function pickFile() {
    if (!upInput) {
      upInput = document.createElement("input");
      upInput.type = "file"; upInput.accept = ".json,application/json"; upInput.hidden = true;
      document.body.appendChild(upInput);
    }
    return new Promise(resolve => {
      upInput.onchange = async () => {
        const { files, got, bad } = await ingest(upInput.files);
        upInput.value = "";
        if (!files.length) return resolve({ error: "No .json file there." });
        if (!got.length) return resolve({ error: (bad[0] || "That file") + " is not a problems.json." });
        emit(got[0]);
        resolve({ problem: got[0], name: names.get(got[0].code), count: got.length });
      };
      upInput.click();
    });
  }

})();
