/* global LEAGUE */
import { makeBoard, REDUCED_MOTION, setCoordsOrientation } from './board.js?v=16';

const COACH_ROUTES = {
  'chess-openings': '/chess/',
  londonsacrifice: '/chess/londonsacrifice/',
};

const PLAYER_COLORS = {
  jerryshi042003: '#087f8c',
  londonsacrifice: '#7657c8',
};

const requestedCoach = new URLSearchParams(location.search).get('coach');
const returnCoach = Object.prototype.hasOwnProperty.call(COACH_ROUTES, requestedCoach)
  ? requestedCoach
  : 'chess-openings';
document.documentElement.dataset.returnCoach = returnCoach;
document.querySelectorAll('[data-coach-view]').forEach((link) => {
  link.href = `${COACH_ROUTES[returnCoach]}#${link.dataset.coachView}`;
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const momentHtml = (player, moment, momentIndex) => {
  const label = `Position before ${moment.played}. Red arrow shows played ${moment.played}. Green arrow shows better ${moment.best}.`;
  return `
    <article class="moment" data-moment-panel="${momentIndex}"${momentIndex ? ' hidden' : ''}>
      <div class="moment-layout">
        <div class="board-shell">
          <div class="board cg-wrap" data-player="${escapeHtml(player.user)}" data-moment="${momentIndex}" role="img" aria-label="${escapeHtml(label)}"></div>
        </div>
        <div class="moment-copy">
          <p class="moment-index">Worst moment ${momentIndex + 1} of ${player.moments.length}</p>
          <h3 class="severity-title">${escapeHtml(moment.title)}</h3>
          <p class="impact">${escapeHtml(moment.impact)}</p>
          <div class="move-pair" aria-label="Move comparison">
            <p class="played"><b>Played</b><span>${escapeHtml(moment.played)}</span></p>
            <span class="move-arrow" aria-hidden="true">→</span>
            <p class="best"><b>Better</b><span>${escapeHtml(moment.best)}</span></p>
          </div>
          <p class="frequency">Seen ${moment.occurrences}× across ${moment.gamesAffected}/${moment.sampleGames} games</p>
          <div class="moment-actions">
            <button type="button" class="replay-action" data-replay>Replay arrows</button>
            <a class="game-action" href="${escapeHtml(moment.game)}" target="_blank" rel="noreferrer">Open game ↗</a>
          </div>
        </div>
      </div>
    </article>`;
};

const playerHtml = (player) => {
  const external = player.action.external ? ' target="_blank" rel="noreferrer"' : '';
  const position = Math.min(100, player.blunderPer100 / LEAGUE.scaleMax * 100);
  const sample = `${player.tc} · ${player.games} games${player.era ? ` · ${player.era}` : ''}`;
  const color = PLAYER_COLORS[player.user] || '#7657c8';
  return `
    <details class="player" id="${escapeHtml(player.user)}" style="--player-color:${color}">
      <summary aria-label="${escapeHtml(player.name)}, ${player.pool}, ${player.blunderPer100} blunders per 100 decisions, ${sample}, 3 replays">
        <span class="crest" aria-hidden="true">${escapeHtml(player.name.charAt(0))}</span>
        <span class="identity"><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(sample)} · 3 replays</span></span>
        <span class="track" aria-hidden="true"><span class="marker" style="left:${position}%"></span></span>
        <span class="rate"><strong>${player.blunderPer100}</strong><small>/100</small></span>
        <span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="moments">
        <div class="moments-head">
          <div><p class="moments-label">3 worst verified moments</p><h3>Replay the damage</h3></div>
          <div class="moment-picker" role="group" aria-label="Choose a verified moment">
            ${player.moments.map((moment, index) => `<button type="button" data-moment-choice="${index}" aria-pressed="${index === 0}" aria-label="Moment ${index + 1}: ${escapeHtml(moment.title)}">${index + 1}</button>`).join('')}
          </div>
        </div>
        <div class="moment-stage">${player.moments.map((moment, index) => momentHtml(player, moment, index)).join('')}</div>
        <a class="profile-action" href="${escapeHtml(player.action.href)}"${external}>${escapeHtml(player.action.label)} →</a>
      </div>
    </details>`;
};

const poolDescription = () => 'Same pool · different clocks';

const poolHtml = (pool, players, poolIndex) => `
  <section class="pool" aria-labelledby="pool-${poolIndex}">
    <div class="pool-head">
      <div><h2 id="pool-${poolIndex}">${escapeHtml(pool)}</h2><p>${escapeHtml(poolDescription(pool))}</p></div>
      <span class="axis" aria-hidden="true"><span>0</span><span>${LEAGUE.scaleMax}</span></span>
    </div>
    <div class="players">${players.map(playerHtml).join('')}</div>
  </section>`;

const momentBoards = new WeakMap();
const replayTimers = new WeakMap();

function momentShapes(moment, includeBetter = true) {
  const shapes = [
    { orig: moment.playedUci.slice(0, 2), dest: moment.playedUci.slice(2, 4), brush: 'red' },
  ];
  if (includeBetter) {
    shapes.push({ orig: moment.bestUci.slice(0, 2), dest: moment.bestUci.slice(2, 4), brush: 'green' });
  }
  return shapes;
}

function initBoard(article) {
  const board = article.querySelector('.board');
  if (!board || momentBoards.has(board)) return;
  const player = LEAGUE.players.find((candidate) => candidate.user === board.dataset.player);
  const moment = player?.moments[Number(board.dataset.moment)];
  if (!moment) return;
  const api = makeBoard(board, {
    fen: moment.positionFen,
    orientation: moment.orientation,
    viewOnly: true,
    animation: { enabled: false },
    highlight: { lastMove: false, check: true },
    drawable: { enabled: false, visible: true },
    draggable: { enabled: false },
    selectable: { enabled: false },
  });
  momentBoards.set(board, api);
  requestAnimationFrame(() => {
    setCoordsOrientation(board, moment.orientation);
    api.setShapes(momentShapes(moment));
  });
}

function selectMoment(detail, index) {
  const buttons = [...detail.querySelectorAll('[data-moment-choice]')];
  const panels = [...detail.querySelectorAll('[data-moment-panel]')];
  const safeIndex = Math.max(0, Math.min(index, panels.length - 1));
  detail.dataset.activeMoment = String(safeIndex);
  buttons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === safeIndex)));
  panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== safeIndex; });
  const active = panels[safeIndex];
  if (active) initBoard(active);
}

function replayMoment(article) {
  const board = article.querySelector('.board');
  const button = article.querySelector('[data-replay]');
  const player = LEAGUE.players.find((candidate) => candidate.user === board?.dataset.player);
  const moment = player?.moments[Number(board?.dataset.moment)];
  const api = board ? momentBoards.get(board) : null;
  if (!moment || !api || !button) return;
  clearTimeout(replayTimers.get(article));
  api.setShapes(momentShapes(moment, REDUCED_MOTION));
  if (REDUCED_MOTION) return;
  button.textContent = 'Played move…';
  const timer = setTimeout(() => {
    api.setShapes(momentShapes(moment));
    button.textContent = 'Replay arrows';
  }, 650);
  replayTimers.set(article, timer);
}

document.getElementById('updated').textContent = LEAGUE.updated;
const blitz = LEAGUE.players.filter((player) => player.pool === 'Blitz').sort((a, b) => a.blunderPer100 - b.blunderPer100);
if (blitz.length >= 2) {
  const lower = blitz[0];
  const higher = blitz.at(-1);
  const gap = (higher.blunderPer100 - lower.blunderPer100).toFixed(1);
  document.getElementById('league-verdict').textContent = `${higher.name}'s current Blitz rate is ${gap} higher.`;
  document.getElementById('league-scope').textContent = 'Same Chess.com pool · different clocks and windows';
}
document.getElementById('league-footnote').textContent = `${LEAGUE.engine} · Updated ${LEAGUE.updated}`;

const pools = [...new Set(LEAGUE.players.map((player) => player.pool))];
const league = document.getElementById('league');
league.innerHTML = pools.map((pool, index) => poolHtml(pool, LEAGUE.players.filter((player) => player.pool === pool), index)).join('');

const details = [...league.querySelectorAll('details')];
details.forEach((detail) => detail.addEventListener('toggle', () => {
  if (detail.open) {
    details.forEach((other) => { if (other !== detail) other.open = false; });
    history.replaceState(null, '', `#${detail.id}`);
    selectMoment(detail, Number(detail.dataset.activeMoment || 0));
    return;
  }
  detail.querySelectorAll('.moment').forEach((article) => clearTimeout(replayTimers.get(article)));
  queueMicrotask(() => {
    if (!details.some((candidate) => candidate.open) && location.hash === `#${detail.id}`) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
  });
}));

league.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-moment-choice]');
  if (choice) {
    selectMoment(choice.closest('details'), Number(choice.dataset.momentChoice));
    return;
  }
  const replay = event.target.closest('[data-replay]');
  if (replay) replayMoment(replay.closest('.moment'));
});

const requested = location.hash.slice(1);
const requestedPlayer = details.find((detail) => detail.id === requested);
if (requestedPlayer) {
  requestedPlayer.open = true;
  selectMoment(requestedPlayer, 0);
}
