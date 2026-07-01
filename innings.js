// innings.js
// Owns match identity and derives the live state of an innings (over,
// ball, who is on strike) purely by replaying the current event log.
// Recomputing from events rather than tracking state incrementally means
// undo and edit cannot leave the scoring screen out of sync with storage.

import { getBatters } from './players.js';

const MATCH_ID_KEY = 'cricket-analyst-current-match-id';

export function getCurrentMatchId() {
  let matchId = sessionStorage.getItem(MATCH_ID_KEY);
  if (!matchId) {
    const today = new Date().toISOString().slice(0, 10);
    matchId = `m-${today}-${Math.random().toString(16).slice(2, 6)}`;
    sessionStorage.setItem(MATCH_ID_KEY, matchId);
  }
  return matchId;
}

// Only current (non-superseded) events count towards live state.
export function currentEvents(events) {
  return events
    .filter((e) => !e.supersededBy)
    .sort((a, b) => a.over - b.over || a.ball - b.ball);
}

export function computeLiveState(events) {
  const batters = getBatters();
  let strikerId = batters[0].id;
  let nonStrikerId = batters[1].id;
  let over = 0;
  let ball = 0;

  for (const event of currentEvents(events)) {
    if (event.legalDelivery) {
      ball += 1;
      if (ball === 6) {
        ball = 0;
        over += 1;
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    }

    // Odd runs off the bat rotate strike. Extras-aware rotation
    // (byes, leg byes, no-ball free hits) is Milestone 2 scope.
    if (event.runs % 2 === 1) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }
  }

  return { over, ball, strikerId, nonStrikerId };
}

export function nextBallNumber(events) {
  const state = computeLiveState(events);
  return { over: state.over, ball: state.ball };
}
