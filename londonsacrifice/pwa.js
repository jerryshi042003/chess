/* GENERATED from wisdom/chess-coach/src/pwa.template.js — edit there and run scripts/chess/sync_coach_ui.mjs */
(function () {
  if (!("serviceWorker" in navigator)) return;
  var hadController = Boolean(navigator.serviceWorker.controller);
  var refreshing = false;
  function reloadForFreshShell() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  }
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController) reloadForFreshShell();
  });
  navigator.serviceWorker.addEventListener("message", function (event) {
    if (hadController && event.data && event.data.type === "londonsacrifice-update-ready") {
      reloadForFreshShell();
    }
  });
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/chess/londonsacrifice/sw.js", { scope: "/chess/londonsacrifice/" })
      .catch(function (error) {
        console.debug("londonsacrifice service worker registration failed", error);
      });
  });
})();
