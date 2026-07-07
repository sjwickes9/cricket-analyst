// scoring.js
// Builds event objects and applies them via storage.js. This is the only
// module that constructs an event, so the schema stays in one place.
//
// Note: incomingBatterId is an addition to the schema in the brief. It
// only appears on wicket events and records who came in to replace the
// dismissed batter, which innings.js needs to replay state correctly
// without a second, separate "who's batting" record.

import { generateId } from './utils.js';
import { addEvent, deleteEvent, supersedeEvent, getEventsForMatch } from './storage.js';
import { computeLiveState, currentEvents } from './innings.js';

function baseEvent({ matchId, inningsNumber, over, ball, legalDelivery, strikerBatterId, nonStrikerBatterId, bowlerId, runs, extraType, extraRuns, angle, distance }) {
  return {
    id: generateId(),
    matchId,
    inningsId: inningsNumber,
    inningsNumber,

    over,
    ball,
    legalDelivery,

    strikerBatterId,
    nonStrikerBatterId,
    bowlerId,

    runs,
    extraType,
    extraRuns,

    wicket: false,
    dismissalType: null,
    dismissedBatterId: null,
    incomingBatterId: null,

    angle,
    distance,

    supersededBy: null,
    timestamp: new Date().toISOString(),
  };
}

export async function recordShot({ matchId, innings, angle, distance, runs, extraType = null, extraRuns = 0 }) {
  const allEvents = await getEventsForMatch(matchId);
  const events = allEvents.filter((e) => e.inningsNumber === innings.inningsNumber);
  const state = computeLiveState(innings, events);
  const legalDelivery = extraType !== 'wide' && extraType !== 'noball';

  const event = baseEvent({
    matchId,
    inningsNumber: innings.inningsNumber,
    over: state.over,
    ball: state.ball,
    legalDelivery,
    strikerBatterId: state.strikerId,
    nonStrikerBatterId: state.nonStrikerId,
    bowlerId: innings.currentBowlerId,
    runs,
    extraType,
    extraRuns,
    angle,
    distance,
  });

  await addEvent(event);
  return event;
}

export async function recordWicket({ matchId, innings, angle, distance, dismissalType, dismissedBatterId, incomingBatterId, runsBeforeWicket = 0 }) {
  const allEvents = await getEventsForMatch(matchId);
  const events = allEvents.filter((e) => e.inningsNumber === innings.inningsNumber);
  const state = computeLiveState(innings, events);

  const event = baseEvent({
    matchId,
    inningsNumber: innings.inningsNumber,
    over: state.over,
    ball: state.ball,
    legalDelivery: true,
    strikerBatterId: state.strikerId,
    nonStrikerBatterId: state.nonStrikerId,
    bowlerId: innings.currentBowlerId,
    runs: runsBeforeWicket,
    extraType: null,
    extraRuns: 0,
    angle,
    distance,
  });

  event.wicket = true;
  event.dismissalType = dismissalType;
  event.dismissedBatterId = dismissedBatterId;
  event.incomingBatterId = incomingBatterId;

  await addEvent(event);
  return event;
}

// Undo removes the most recently recorded event outright. Because it
// reverses an action the scorer just took, rather than correcting an
// earlier mistake, a hard delete is appropriate here; edit (below) is
// what preserves the audit trail for events further back.
export async function undoLastEvent(matchId, inningsNumber) {
  const events = await getEventsForMatch(matchId);
  const live = currentEvents(events).filter((e) => e.inningsNumber === inningsNumber);
  if (live.length === 0) return null;

  const last = live[live.length - 1];
  await deleteEvent(last.id);
  return last;
}

// Edit supersedes the target event with a corrected one, keeping the
// original in storage with supersededBy set, per the data model.
export async function editEvent(originalEvent, changes) {
  const replacement = {
    ...originalEvent,
    id: generateId(),
    runs: changes.runs ?? originalEvent.runs,
    strikerBatterId: changes.strikerBatterId ?? originalEvent.strikerBatterId,
    nonStrikerBatterId: changes.nonStrikerBatterId ?? originalEvent.nonStrikerBatterId,
    supersededBy: null,
    timestamp: new Date().toISOString(),
  };

  await supersedeEvent(originalEvent, replacement);
  return replacement;
}

export async function getLastEvent(matchId, inningsNumber) {
  const events = await getEventsForMatch(matchId);
  const live = currentEvents(events).filter((e) => e.inningsNumber === inningsNumber);
  return live.length ? live[live.length - 1] : null;
}
