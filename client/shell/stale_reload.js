// BRIDGE (temporary, todo 167): why = old URLs keep working after the client/ move; delete by BX (first Monday >= 7 days after B merges); map = shared/temporary_rename_map/rename-map.json
// Classic script. A stale page asked for a moved .js/.mjs: update the service worker once per tab session, then reload.
(function () {
  var key = "stem-stale-reload", seen = false;
  try {
    seen = !!sessionStorage.getItem(key);
    if (!seen) sessionStorage.setItem(key, "1");
  } catch (e) { /* no sessionStorage: fall through and reload */ }
  if (seen) return;
  var reload = function () { location.reload(); };
  try {
    var sw = navigator.serviceWorker;
    if (!sw) return reload();
    sw.getRegistration()
      .then(function (r) { return r && r.update(); })
      .catch(function () { /* update failed: reload anyway */ })
      .finally(reload);
  } catch (e) { reload(); }
})();
