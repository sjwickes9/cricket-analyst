// scoring.js
// Builds event objects and applies them via storage.js. This is the only
// module that constructs an event, so the schema stays in one place.

import { generateId } from './utils.js';
import { addEvent, deleteEvent, supersedeEvent, getEventsForMatch } from './storage.js';
import { computeLiveState, currentEvents } from './innings.js';
import { getBowler } from './players.js';

export function buildEvent({ matchId, over, ball, strikerBatterId, nonStrikerBatterId, runs, angle, distance }) {
  return {
    id: generateId(),
    matchId,
    inningsId: 1,
    inningsNumber: 1,

    over,
    ball,
    legalDelivery: true,

    strikerBatterId,
    nonStrikerBatterId,
    bowlerId: getBowler().id,

    runs,
    extraType: null,
    extraRuns: 0,

    wicket: false,
    dismissalType: null,
    dismissedBatterId: null,

    angle,
    distance,

    supersededBy: null,
    timestamp: new Date().toISOString(),
  };
}

export async function recordShot({ matchId, angle, distance, runs }) {
  const events = await getEventsForMatch(matchId);
  const state = computeLiveState(events);

  const event = buildEvent({
    matchId,
    over: state.over,
    ball: state.ball,
    strikerBatterId: state.strikerId,
    nonStrikerBatterId: state.nonStrikerId,
    runs,
    angle,
    distance,
  });

  await addEvent(event);
  return event;
}

// Undo removes the most recently recorded event outright. Because it
// reverses an action the scorer just took, rather than correcting an
// earlier mistake, a hard delete is appropriate here; edit (below) is
// what preserves the audit trail for events further back.
export async function undoLastEvent(matchId) {
  const events = await getEventsForMatch(matchId);
  const live = currentEvents(events);
  if (live.length === 0) return null;

  const last = live[live.length - 1];
  await deleteEvent(last.id);
  return last;
}

// Edit supersedes the target event with a corrected one, keeping the
// original in storage with supersededBy set, per the data model.
export async function editEvent(originalEvent, changes) {
  const replacement = buildEvent({
    matchId: originalEvent.matchId,
    over: originalEvent.over,
    ball: originalEvent.ball,
    strikerBatterId: changes.strikerBatterId ?? originalEvent.strikerBatterId,
    nonStrikerBatterId: changes.nonStrikerBatterId ?? originalEvent.nonStrikerBatterId,
    runs: changes.runs ?? originalEvent.runs,
    angle: originalEvent.angle,
    distance: originalEvent.distance,
  });

  await supersedeEvent(originalEvent, replacement);
  return replacement;
}

export async function getLastEvent(matchId) {
  const events = await getEventsForMatch(matchId);
  const live = currentEvents(events);
  return live.length ? live[live.length - 1] : null;
}
