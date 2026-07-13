// innings.js
// Derives the live state of an innings (over, ball, who is on strike,
// wickets down, who has already batted) purely by replaying the current
// event log against the innings' openers and batting order. State is
// never tracked incrementally, so undo and edit cannot leave the
// scoring screen out of sync with what is actually stored.

import { displayAngleForHandedness } from './utils.js';

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
  let totalRuns = 0;

  const battersAppeared = new Set(innings.openers);

  for (const event of currentEvents(events)) {
    totalRuns += event.runs + event.extraRuns;

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
    totalRuns,
    battersAppeared,
    allOut,
    nextBatterId,
  };
}

// Per-batter runs, balls faced, scoring breakdown and dismissal, for
// the end of innings summary and the per-batter analysis export. Runs
// off the bat only (byes, leg byes and wides are not credited to the
// batter); balls faced excludes wides since those are not legitimately
// faced, but includes no balls, byes and leg byes. The breakdown counts
// how many deliveries the batter scored each value from (dots, 1s, 2s,
// 3s, 4s, 6s), which is what the single-batter analysis page shows.
export function computeBatterStats(innings, events) {
  const stats = new Map();

  function statsFor(playerId) {
    if (!stats.has(playerId)) {
      stats.set(playerId, {
        playerId,
        runs: 0,
        ballsFaced: 0,
        out: false,
        dismissalType: null,
        dismissalBowlerId: null,
        breakdown: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 },
      });
    }
    return stats.get(playerId);
  }

  innings.openers.forEach(statsFor);

  for (const event of currentEvents(events)) {
    const striker = statsFor(event.strikerBatterId);

    if (event.extraType !== 'wide') {
      striker.ballsFaced += 1;
    }
    if (!event.extraType || event.extraType === 'noball') {
      striker.runs += event.runs;
      // Only count deliveries the batter actually faced off the bat
      // towards the scoring breakdown; a wide is not faced, and byes or
      // leg byes are not runs off the bat.
      if (event.extraType !== 'wide' && Object.prototype.hasOwnProperty.call(striker.breakdown, event.runs)) {
        striker.breakdown[event.runs] += 1;
      }
    }

    if (event.wicket && event.dismissedBatterId) {
      const dismissed = statsFor(event.dismissedBatterId);
      dismissed.out = true;
      dismissed.dismissalType = event.dismissalType;
      dismissed.dismissalBowlerId = event.bowlerId;
      if (event.incomingBatterId) statsFor(event.incomingBatterId);
    }
  }

  return innings.battingOrder.filter((id) => stats.has(id)).map((id) => stats.get(id));
}

// Extras and the innings total, computed from the event log. The total
// deliberately includes extras not credited to any batter (wides,
// byes), so, as on a real scorecard, it will not simply equal the sum
// of the batting column.
export function computeInningsTotals(innings, events) {
  const extras = { wide: 0, noball: 0, bye: 0, legbye: 0 };
  let total = 0;
  let legalBalls = 0;
  let wickets = 0;

  for (const event of currentEvents(events)) {
    total += event.runs + event.extraRuns;
    if (event.extraType && Object.prototype.hasOwnProperty.call(extras, event.extraType)) {
      extras[event.extraType] += event.extraRuns;
    }
    if (event.legalDelivery) legalBalls += 1;
    if (event.wicket) wickets += 1;
  }

  const extrasTotal = extras.wide + extras.noball + extras.bye + extras.legbye;
  const overs = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

  return { extras, extrasTotal, total, wickets, legalBalls, overs };
}

export function strikeRate(runs, ballsFaced) {
  if (!ballsFaced) return '0.0';
  return ((runs / ballsFaced) * 100).toFixed(1);
}

// Eight scoring sectors: four either side of the wicket, each 45
// degrees, running from directly behind the stumps round to straight
// down the ground.
//
// Angles are measured with 0 straight back over the keeper's head and
// 180 straight down the ground, so 0 to 180 is one side of the wicket
// and 180 to 360 the other. Sectors are defined against a right handed
// batter's view (off side 0 to 180); handedness is applied at
// aggregation time by mirroring the angle first, exactly as the field
// labels are mirrored at render time. Without that, a left hander's leg
// side runs would be reported as off side.
export const SECTORS = [
  { id: 'off-1', side: 'off', from: 0, to: 45, label: 'Behind square' },
  { id: 'off-2', side: 'off', from: 45, to: 90, label: 'Square' },
  { id: 'off-3', side: 'off', from: 90, to: 135, label: 'Forward of square' },
  { id: 'off-4', side: 'off', from: 135, to: 180, label: 'Straight' },
  { id: 'leg-4', side: 'leg', from: 180, to: 225, label: 'Straight' },
  { id: 'leg-3', side: 'leg', from: 225, to: 270, label: 'Forward of square' },
  { id: 'leg-2', side: 'leg', from: 270, to: 315, label: 'Square' },
  { id: 'leg-1', side: 'leg', from: 315, to: 360, label: 'Behind square' },
];

// Aggregates a batter's runs into the eight sectors. Returns each
// sector with its runs, shot count, and share of that batter's total
// runs off the bat. Deliveries with no real shot position (keeper dot
// balls, extras, wickets) are excluded, since they belong to no sector.
export function computeSectorRuns(events, handedness) {
  const totals = new Map(SECTORS.map((s) => [s.id, { ...s, runs: 0, shots: 0, percentage: 0 }]));
  let totalRuns = 0;

  for (const event of currentEvents(events)) {
    if (event.extraType || event.wicket) continue;
    if (event.angle === 0 && event.distance === 0) continue;

    const angle = displayAngleForHandedness(event.angle, handedness);
    const normalised = ((angle % 360) + 360) % 360;

    const sector = SECTORS.find((s) => normalised >= s.from && normalised < s.to);
    if (!sector) continue;

    const entry = totals.get(sector.id);
    entry.runs += event.runs;
    entry.shots += 1;
    totalRuns += event.runs;
  }

  for (const entry of totals.values()) {
    entry.percentage = totalRuns > 0 ? Math.round((entry.runs / totalRuns) * 100) : 0;
  }

  return { sectors: Array.from(totals.values()), totalRuns, handedness };
}
