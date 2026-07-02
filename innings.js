// innings.js
// Derives the live state of an innings (over, ball, who is on strike,
// wickets down, who has already batted) purely by replaying the current
// event log against the innings' openers and batting order. State is
// never tracked incrementally, so undo and edit cannot leave the
// scoring screen out of sync with what is actually stored.

// Only current (non-superseded) events count towards live state.
// Sorted by over and ball first, with timestamp as a tiebreaker: wides
// and no-balls do not advance the ball count, so two events can
// legitimately share the same over/ball, and IndexedDB does not
// guarantee insertion order since ids are random.
export function currentEvents(events) {
  return events
    .filter((e) => !e.supersededBy)
    .sort((a, b) => a.over - b.over || a.ball - b.ball || a.timestamp.localeCompare(b.timestamp));
}

// A ball rotates the striker and non-striker if an odd number of runs
// were actually run between the wickets. Boundaries never rotate strike.
// This is a simplified rule suitable for amateur club scoring; overthrow
// edge cases are not modelled.
export function ballRotatesStrike(event) {
  if (event.extraType === 'wide') {
    const ran = Math.max(0, event.extraRuns - 1);
    return ran % 2 === 1;
  }
  if (event.extraType === 'noball') {
    return event.runs % 2 === 1 && event.runs < 4;
  }
  if (event.extraType === 'bye' || event.extraType === 'legbye') {
    return event.extraRuns % 2 === 1 && event.extraRuns < 4;
  }
  return event.runs % 2 === 1 && event.runs < 4;
}

export function computeLiveState(innings, events) {
  let strikerId = innings.openers[0];
  let nonStrikerId = innings.openers[1];
  let over = 0;
  let ball = 0;
  let wicketsDown = 0;

  const battersAppeared = new Set(innings.openers);

  for (const event of currentEvents(events)) {
    if (event.legalDelivery) {
      ball += 1;
      if (ball === 6) {
        ball = 0;
        over += 1;
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    }

    if (event.wicket) {
      wicketsDown += 1;
      // The incoming batter takes the exact role (striker or
      // non-striker) vacated by whoever was dismissed, since a run out
      // can dismiss either end regardless of who faced the ball.
      if (event.dismissedBatterId === strikerId && event.incomingBatterId) {
        strikerId = event.incomingBatterId;
        battersAppeared.add(strikerId);
      } else if (event.dismissedBatterId === nonStrikerId && event.incomingBatterId) {
        nonStrikerId = event.incomingBatterId;
        battersAppeared.add(nonStrikerId);
      }
    } else if (ballRotatesStrike(event)) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }
  }

  const allOut = wicketsDown >= innings.battingOrder.length - 1;

  const nextBatterId = innings.battingOrder.find((id) => !battersAppeared.has(id) && id !== strikerId && id !== nonStrikerId) || null;

  return {
    over,
    ball,
    strikerId,
    nonStrikerId,
    wicketsDown,
    battersAppeared,
    allOut,
    nextBatterId,
  };
}
