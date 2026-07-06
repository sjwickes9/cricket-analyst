// match.js
// Owns match and innings identity: creating a new match from the setup
// screen, starting new innings (opening pair, declarations, all out),
// and looking up players by id. Replaces the hardcoded roster from
// Milestone 1.
//
// Scope note: this app scores one team's batting in detail (the team
// the coach is developing), which is what the wagon wheel and every
// report in the brief are for. The bowlers list exists only so each
// event can carry a bowlerId, ready for the bowling wagon wheel on the
// roadmap. Tracking the opposition's own batting order is out of scope.

import { generateId } from './utils.js';
import { saveMatch, getMatch, saveInnings, getAllInningsForMatch, getLatestInnings, deleteMatchCompletely } from './storage.js';

const ACTIVE_MATCH_KEY = 'cricket-analyst-active-match-id';

export function getActiveMatchId() {
  return sessionStorage.getItem(ACTIVE_MATCH_KEY);
}

export function setActiveMatchId(matchId) {
  sessionStorage.setItem(ACTIVE_MATCH_KEY, matchId);
}

export function clearActiveMatchId() {
  sessionStorage.removeItem(ACTIVE_MATCH_KEY);
}

export async function createMatch({ teamName, opposition, players, bowlers }) {
  const match = {
    id: `m-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(16).slice(2, 6)}`,
    teamName,
    opposition,
    players: players.map((p) => ({ id: generateId(), name: p.name, handedness: p.handedness })),
    bowlers: bowlers.map((b) => ({ id: generateId(), name: b.name })),
    createdAt: new Date().toISOString(),
  };

  await saveMatch(match);
  setActiveMatchId(match.id);
  return match;
}

export async function startInnings({ matchId, strikerId, nonStrikerId, bowlerId, battingOrder }) {
  const existing = await getAllInningsForMatch(matchId);
  const inningsNumber = existing.length + 1;

  const innings = {
    id: `${matchId}-${inningsNumber}`,
    matchId,
    inningsNumber,
    battingOrder,
    openers: [strikerId, nonStrikerId],
    currentBowlerId: bowlerId,
    status: 'in-progress',
  };

  await saveInnings(innings);
  return innings;
}

export async function setInningsStatus(innings, status) {
  const updated = { ...innings, status };
  await saveInnings(updated);
  return updated;
}

export async function setCurrentBowler(innings, bowlerId) {
  const updated = { ...innings, currentBowlerId: bowlerId };
  await saveInnings(updated);
  return updated;
}

export async function getActiveInnings(matchId) {
  return getLatestInnings(matchId);
}

export function getPlayerById(match, playerId) {
  return match.players.find((p) => p.id === playerId);
}

export function getBowlerById(match, bowlerId) {
  return match.bowlers.find((b) => b.id === bowlerId);
}

// Mid-innings additions: amateur teams often do not know their full XI
// or bowling attack in advance. A new batter is appended to the end of
// the current innings' batting order (they bat last if not already
// used); a new bowler simply becomes available to select next.
export async function addPlayersToMatch(match, newPlayers) {
  const players = newPlayers.map((p) => ({ id: generateId(), name: p.name, handedness: p.handedness }));
  const updatedMatch = { ...match, players: [...match.players, ...players] };
  await saveMatch(updatedMatch);
  return { match: updatedMatch, players };
}

export async function addPlayerMidMatch(match, { name, handedness }) {
  const player = { id: generateId(), name, handedness };
  const updatedMatch = { ...match, players: [...match.players, player] };
  await saveMatch(updatedMatch);
  return { match: updatedMatch, player };
}

export async function addBowlerMidMatch(match, { name }) {
  const bowler = { id: generateId(), name };
  const updatedMatch = { ...match, bowlers: [...match.bowlers, bowler] };
  await saveMatch(updatedMatch);
  return { match: updatedMatch, bowler };
}

export async function appendToBattingOrder(innings, playerId) {
  const updated = { ...innings, battingOrder: [...innings.battingOrder, playerId] };
  await saveInnings(updated);
  return updated;
}

export async function abandonMatch(matchId) {
  await deleteMatchCompletely(matchId);
  clearActiveMatchId();
}

export { getMatch };
