// players.js
// Milestone 1 uses a hardcoded pair of batters and a single bowler so the
// scoring screen can be tested before team setup exists. Milestone 2
// replaces getBatters/getBowler with real team and batting order data;
// nothing else in the app should need to change when that happens.

const BATTERS = [
  { id: 'batter-1', name: 'Batter A', handedness: 'right' },
  { id: 'batter-2', name: 'Batter B', handedness: 'right' },
];

const BOWLER = { id: 'bowler-1', name: 'Bowler A' };

export function getBatters() {
  return BATTERS;
}

export function getBatterById(id) {
  return BATTERS.find((b) => b.id === id);
}

export function getBowler() {
  return BOWLER;
}
