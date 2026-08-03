// Per-player profile for the shared chess coach (see wisdom/chess-coach/).
// This file is NOT generated — edit freely; everything else in ui/ is synced.
export const PROFILE = {
  id: 'londonsacrifice',
  playerName: 'London',
  heading: 'London',
  timeControlLabel: '3+0',
  other: { label: 'Jerry', href: '/chess/#summary' },
  // Fundamentals first for a two-week-old player: safety, then identity.
  // Mistakes lead: that card is the one that says what to train, and every
  // row in it is a drill query. Trend + rhythm live collapsed in .minor-cards.
  summaryOrder: ['mistake-card', 'latest-card', 'opening-card', 'league-preview-card', 'minor-cards'],
  stores: {
    stats: 'londonsacrifice-drill-stats-v1',
    srs: 'londonsacrifice-drill-srs-v1',
    motifs: 'londonsacrifice-drill-motifs-v1',
    rotation: 'londonsacrifice-drill-rotation-v1'
  }
};
