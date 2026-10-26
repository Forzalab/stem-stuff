/* login.js: the "My Cluck" save + login dialog (Tony #21, #22, #22b, #23; DESIGN-v3 §7). App chrome, not a reply format.
   The account is a token; the token is a QR inside a Cluck image drawn on this device (mycluck.mjs). The image never leaves it:
   saving goes to the share sheet / a download, logging in decodes the picked photo here and POSTs only {token}.
   The account starts ephemeral (it lives as long as the sid cookie); Save makes it permanent: once the share sheet resolves or the
   download fires, POST acct/keep {token} (Tony #29.9). Only once keep answers ok, a green ✓ flashes in place of the Save button
   (Tony #32; login.css: no flash under reduced motion).

   stemLogin.open()       the dialog: mints a token on first use (POST acct/new), draws MY Cluck, [Save my Cluck], [I have my Cluck].
                          Signed in, the same call is "Show my Cluck": it re-draws the stored token, no new mint
   stemLogin.close()      closes and removes it (lazy, like popover.js: built on open, gone on close)
   stemLogin.signedIn()   a token is stored on this device (localStorage "stem-acct")
   stemLogin.ready        settles once a ?k= link on load has been tried
   window "stem:login"    fired once this device has an account: { detail: { via: "new" | "link" | "image" } }
                          ("new" = minted here: that account already holds this device's sid, nothing to reload)

   ?k=<token> on load: stripped from the URL bar first (history.replaceState: a screenshot must not leak it), then logged in.
   Lazy: qrcode-generator loads on open (it draws), jsQR (~257 KB) only once the dialog is up, never on a plain page view. */
(function (root) {
  "use strict";
  const HERE = (document.currentScript && document.currentScript.src) || location.href;   // the app root: acct/, vendor/, mycluck.mjs sit beside this file
  const at = p => new URL(p, HERE).href;
  const KEY = "stem-acct", TOKEN = /^[A-Za-z0-9_-]{16,128}$/, MAX = 1600;               // MAX: a picked photo is scaled to this side for jsQR
  const QR = "vendor/qrcode-generator/qrcode.js", JSQR = "vendor/jsqr/jsQR.js";
  let cur = null;                                                                       // { d, file, opener, unkept }

  const store = {
    get() { try { const t = (JSON.parse(localStorage.getItem(KEY) || "null") || {}).token; return TOKEN.test(t) ? t : null; } catch { return null; } },
    set(t) { try { localStorage.setItem(KEY, JSON.stringify({ token: t })); } catch {} },
  };
  const loaded = {};
  const load = p => loaded[p] || (loaded[p] = new Promise((ok, no) => {                 // a vendored classic script, once (its global is what mycluck.mjs reads)
    const s = document.createElement("script"); s.src = at(p); s.async = true;
    s.onload = ok; s.onerror = () => { delete loaded[p]; no(new Error("load " + p)); };
    document.head.append(s);
  }));
  const cluck = () => import(at("mycluck.mjs"));
  const linkFor = t => { const u = new URL("./", HERE); u.search = "?k=" + t; return u.href; };
  const tokenOf = text => {                                                             // the QR holds the link; a bare token is fine too
    if (!text) return null;
    let t = text.trim();
    try { t = new URL(t).searchParams.get("k") || ""; } catch {}
    return TOKEN.test(t) ? t : null;
  };

  async function post(path, body) {
    const r = await fetch(at(path), { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json().catch(() => ({}));
  }
  async function login(t, via) {                                                        // S2 sets the sid cookie; we keep the token for Show my Cluck
    await post("acct/login", { token: t });
    store.set(t);
    root.dispatchEvent(new CustomEvent("stem:login", { detail: { via } }));
  }

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }
  function build() {
    const d = el("dialog", { class: "lg", "aria-labelledby": "lgTitle" });
    const x = el("button", { type: "button", class: "lg-x", "aria-label": "Close" }, "×");
    const h = el("h2", { id: "lgTitle", class: "lg-title" }, store.get() ? "My Cluck" : "Keep your progress");
    const c = el("canvas", { class: "lg-cluck", role: "img", "aria-label": "Your Cluck: a QR code that signs you in", width: "600", height: "600" });
    const cap = el("p", { class: "lg-cap" });
    cap.append(el("span", null, "This is your key 🔑"), " ", el("span", null, "Don't post it."));
    const save = el("button", { type: "button", id: "lgSave", class: "lg-btn lg-go", disabled: "" }, "Save my Cluck");
    const have = el("button", { type: "button", id: "lgHave", class: "lg-btn" }, "I have my Cluck");
    const file = el("input", { type: "file", id: "lgFile", class: "lg-file", accept: "image/*", tabindex: "-1", "aria-label": "Pick your Cluck from your photos" });
    const st = el("p", { id: "lgStatus", class: "lg-status", role: "status", "aria-live": "polite" });
    d.append(x, h, el("div", { class: "lg-art" }), cap, save, el("p", { class: "lg-new" }, "New phone?"), have, file, st);
    d.querySelector(".lg-art").append(c);
    x.addEventListener("click", () => close());
    d.addEventListener("click", e => { if (e.target === d) close(); });                // a tap on the backdrop
    d.addEventListener("close", () => { if (cur && cur.d === d) close(); });           // Esc
    save.addEventListener("click", onSave);
    have.addEventListener("click", () => { load(JSQR).catch(() => {}); file.click(); });
    file.addEventListener("change", () => onPick(file));
    return d;
  }
  const say = text => { if (cur) cur.d.querySelector("#lgStatus").textContent = text; };

  async function draw(t) {
    const me = cur;
    await load(QR);
    const { drawCluck } = await cluck();
    if (cur !== me) return;
    const img = drawCluck(linkFor(t), t), c = me.d.querySelector("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    if (cur !== me || !blob) return;
    me.file = new File([blob], "my-cluck.png", { type: "image/png" });               // ready before the tap: share() must run inside the click
    me.d.querySelector("#lgSave").disabled = false;
  }

  /* Save: share() straight from the click (iOS "Save Image" keeps the tap's user activation only that long); no await before it.
     A keep that failed leaves cur.unkept set: the next tap retries the keep only, the image is already saved */
  function onSave() {
    const f = cur && cur.file;
    if (!f) return;
    if (cur.unkept != null) return keep(cur.unkept);                                  // "" (share: the ✓ says it all) is a pending keep too
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] }))
      navigator.share({ files: [f] }).then(() => keep(""), e => { if (!e || e.name !== "AbortError") download(f); });   // cancelled: no keep, say nothing
    else download(f);
  }
  function download(f) {                                                                // desktop: a plain download (on iOS it would open a tab)
    const u = URL.createObjectURL(f), a = el("a", { href: u, download: f.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    keep("Keep this image secret, and do not show to others.");                         // Tony #32
  }
  async function keep(done) {                                                           // done: what to say beside the ✓ once the account is permanent
    const me = cur, t = store.get();
    if (!me || !t) return;
    me.unkept = null;
    try { await post("acct/keep", { token: t }); }
    catch { if (cur === me) { me.unkept = done; say('Save failed! Tap "Save my Cluck" to try again.'); } return; }   // Tony #32
    if (cur !== me) return;
    const save = me.d.querySelector("#lgSave"), ok = el("p", { class: "lg-saved", role: "img", "aria-label": "Saved", tabindex: "-1" }, "✓");   // COPY-PENDING: "Saved"
    const had = document.activeElement === save;
    save.replaceWith(ok);                                                               // the ✓ takes Save's place: nothing left to tap
    if (had) ok.focus();                                                                // focus stays in the dialog
    say(done);
  }

  /* I have my Cluck: decode the picked photo here, send only the token, drop the image */
  async function onPick(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    say("Reading your Cluck…");
    const u = URL.createObjectURL(f);
    let text = null;
    try {
      const [{ decode }] = await Promise.all([cluck(), load(JSQR)]);
      const im = new Image(); im.src = u; await im.decode();
      const s = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(im, 0, 0, c.width, c.height);
      text = decode(g.getImageData(0, 0, c.width, c.height));
      c.width = c.height = 0; im.src = "";
    } catch {} finally { URL.revokeObjectURL(u); input.value = ""; }
    const t = tokenOf(text);
    if (!t) return say("Couldn't find a Cluck in that picture. Pick the one you saved.");
    say("Checking…");
    try {
      await login(t, "image");
      if (!cur) return;
      cur.d.querySelector("#lgTitle").textContent = "My Cluck";
      say("Signed in ✓ Your progress is back.");
      draw(t).catch(() => {});
    } catch { say("Cluck didn't cluck! Come back in a minute."); }                     // Tony #32
  }

  async function open() {
    close();
    const d = build();
    cur = { d, file: null, opener: document.activeElement };
    document.body.append(d);
    d.showModal();
    load(JSQR).catch(() => {});                                                         // the login screen: fetch jsQR while they look
    try {
      let t = store.get();
      if (!t) {
        t = (await post("acct/new", {})).token;
        if (!TOKEN.test(t || "")) throw new Error("acct/new: no token");
        store.set(t);
        root.dispatchEvent(new CustomEvent("stem:login", { detail: { via: "new" } }));
      }
      await draw(t);
    } catch { say("Couldn't make your Cluck. Check your connection and try again."); }
  }
  function close() {
    if (!cur) return;
    const { d, opener } = cur;
    cur = null;
    if (d.open) d.close();
    d.remove();
    if (opener && opener.isConnected && opener.focus) opener.focus();
  }

  /* ?k= on load: strip first, then log in */
  function fromLink() {
    const q = new URLSearchParams(location.search), k = q.get("k");
    if (k === null) return Promise.resolve();
    q.delete("k");
    const s = q.toString();
    history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash);
    return TOKEN.test(k) ? login(k, "link").catch(() => {}) : Promise.resolve();
  }

  root.stemLogin = { open, close, signedIn: () => !!store.get(), ready: fromLink() };
})(window);
