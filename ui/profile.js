// Per-player profile for the shared chess coach (see wisdom/chess-coach/).
// This file is NOT generated — edit freely; everything else in ui/ is synced.
export const PROFILE = {
  id: 'chess-openings',
  playerName: 'Jerry',
  heading: "Jerry's Blitz Coach",
  timeControlLabel: '3+2',
  other: { label: 'London', href: '/chess/londonsacrifice/#summary' },
  // A returning player leads with identity (repertoire scatter) then discipline.
  // Mistakes lead: that card is the one that says what to train, and every
  // row in it is a drill query. Trend + rhythm live collapsed in .minor-cards.
  summaryOrder: ['read-card', 'mistake-card', 'latest-card', 'opening-card', 'league-preview-card', 'minor-cards'],
  stores: {
    stats: 'chess-openings-drill-stats-v1',
    srs: 'chess-openings-drill-srs-v1',
    motifs: 'chess-openings-drill-motifs-v1',
    rotation: 'chess-openings-drill-rotation-v1'
  }
};
