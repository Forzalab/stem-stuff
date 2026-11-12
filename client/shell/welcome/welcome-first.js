/* welcome-first.js: during the cram window EVERYONE who lands anywhere but the start (a #CODE deep link, another bank, calc.html) is sent to the welcome page
   once (Tony Nov 6), established users included (the old welcome-seen / noob keys do NOT exempt anyone). "The start" = "/" with no hash: the front bank.
   ONCE PER USER: the flag is a NEW key scoped to this cram period (FLAG, "cram-welcome-2026-11"), set BEFORE the redirect (so it can never loop), kept like the
   calc pick: the server per sid (POST /calc {welcomed:true}, GET /calc -> {welcomed}) with localStorage FLAG as the cache. The window is Nov 5 00:00 PT to Nov 9 23:59 PT (FROM / UNTIL).
   Automated browsers (navigator.webdriver) are never redirected unless ?welcome1=1 or window.__welcomeFirst === true (same rule as calc-pick.js auto()).
   window.stemWelcomeFirst = { check() -> Promise<boolean>, FLAG }: true = the caller should drop the deep link and open the start. */
(function () {
  "use strict";
  var FLAG = "cram-welcome-2026-11", FROM = Date.parse("2026-11-05T08:00:00Z"), UNTIL = Date.parse("2026-11-10T07:59:59Z"), g = window;
  function seen() {
    try { return !!localStorage.getItem(FLAG); } catch (e) { return true; }   // storage blocked: the flag cannot hold, so never redirect (no loop)
  }
  function mark() {
    try { localStorage.setItem(FLAG, "1"); } catch (e) { /* */ }
    try { fetch("calc", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ welcomed: true }) }).catch(function () {}); } catch (e) { /* */ }
  }
  function check() {
    var force = /[?&]welcome1=1\b/.test(location.search) || g.__welcomeFirst === true;
    if (navigator.webdriver && !force) return Promise.resolve(false);
    if (Date.now() < FROM || Date.now() > UNTIL || seen()) return Promise.resolve(false);
    var get = fetch("calc", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; });
    var cap = new Promise(function (r) { setTimeout(function () { r(null); }, 2500); });
    return Promise.race([get, cap]).catch(function () { return null; }).then(function (j) {
      if (!j || !j.cram) return false;                                   // /calc says the cram flag is off (or unknown): no redirect
      if (j.welcomed) { try { localStorage.setItem(FLAG, "1"); } catch (e) { /* */ } return false; }
      mark();
      return true;
    });
  }
  g.stemWelcomeFirst = { check: check, FLAG: FLAG };
})();
