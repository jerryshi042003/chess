if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  addEventListener('load', () => navigator.serviceWorker.register('/chess/chess-league/sw.js'));
}
