// matchio.js
// Match export and import. A match is portable as a single JSON file
// containing its match record, every innings, and the full event log
// (including superseded events, so the audit trail survives a round
// trip). This keeps the no-backend, no-login philosophy intact while
// giving matches a real backup and transfer format.

import {
  getMatch,
  getAllInningsForMatch,
  getEventsForMatch,
  saveMatch,
  saveInnings,
  putEvent,
} from './storage.js';

const EXPORT_FORMAT = 'howzt-match';
const EXPORT_VERSION = 1;

// Gathers everything belonging to one match into a single plain object.
export async function buildMatchExport(matchId) {
  const [match, innings, events] = await Promise.all([
    getMatch(matchId),
    getAllInningsForMatch(matchId),
    getEventsForMatch(matchId),
  ]);

  if (!match) throw new Error('Match not found');

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    match,
    innings,
    events,
  };
}

// Turns a match into a downloadable JSON file. The filename uses the
// team names and date so a season of exports is browsable on disk.
export async function exportMatchToFile(matchId) {
  const data = await buildMatchExport(matchId);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safe = (s) => (s || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const date = (data.match.createdAt || new Date().toISOString()).slice(0, 10);
  const filename = `howzt-${safe(data.match.teamName)}-v-${safe(data.match.opposition)}-${date}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}

// Validates a parsed export object before we trust it enough to write
// anything to storage. Returns an array of problems; empty means valid.
export function validateMatchExport(data) {
  const problems = [];
  if (!data || typeof data !== 'object') {
    problems.push('The file is not valid match data.');
    return problems;
  }
  if (data.format !== EXPORT_FORMAT) {
    problems.push('This does not look like a HOWZT match file.');
  }
  if (!data.match || !data.match.id) {
    problems.push('The file is missing its match record.');
  }
  if (!Array.isArray(data.innings)) {
    problems.push('The file is missing its innings records.');
  }
  if (!Array.isArray(data.events)) {
    problems.push('The file is missing its event log.');
  }
  return problems;
}

// Restores a previously exported match into IndexedDB, recreating the
// match, its innings and every event exactly as exported. Because the
// event model and the supersededBy audit trail already contain
// everything needed, this reconstructs the match faithfully with no
// separate "current state" to rebuild. Returns the restored matchId.
export async function importMatchFromData(data) {
  const problems = validateMatchExport(data);
  if (problems.length) {
    throw new Error(problems.join(' '));
  }

  await saveMatch(data.match);
  for (const innings of data.innings) {
    await saveInnings(innings);
  }
  for (const event of data.events) {
    await putEvent(event);
  }

  return data.match.id;
}

// Reads a File object (from a file input) and imports it.
export async function importMatchFromFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error('The file could not be read as JSON.');
  }
  return importMatchFromData(data);
}
