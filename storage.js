// storage.js
// The only module that talks to IndexedDB. Everything else deals in
// plain event, match and innings objects and calls the functions below.
//
// Three stores:
//   events  - the ball-by-ball log (unchanged from Milestone 1)
//   matches - one record per match: team name, roster of batters and
//             bowlers. Created once at setup and not changed mid-match.
//   innings - one record per innings: batting order for that innings,
//             openers, current bowler, and status (in-progress,
//             declared, all-out, complete).

const DB_NAME = 'cricket-analyst';
const DB_VERSION = 2;
const EVENTS_STORE = 'events';
const MATCHES_STORE = 'matches';
const INNINGS_STORE = 'innings';

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
        store.createIndex('matchId', 'matchId', { unique: false });
      }

      if (!db.objectStoreNames.contains(MATCHES_STORE)) {
        db.createObjectStore(MATCHES_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(INNINGS_STORE)) {
        const store = db.createObjectStore(INNINGS_STORE, { keyPath: 'id' });
        store.createIndex('matchId', 'matchId', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

function runTransaction(storeName, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = work(store);
        tx.oncomplete = () => resolve(result && result.__result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

// --- events -----------------------------------------------------------

export async function addEvent(event) {
  await runTransaction(EVENTS_STORE, 'readwrite', (store) => store.add(event));
  return event;
}

export async function deleteEvent(eventId) {
  await runTransaction(EVENTS_STORE, 'readwrite', (store) => store.delete(eventId));
}

export async function getEventsForMatch(matchId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EVENTS_STORE, 'readonly');
    const index = tx.objectStore(EVENTS_STORE).index('matchId');
    const request = index.getAll(matchId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Correction: the original event is kept but marked as superseded by the
// replacement's id, rather than deleted, preserving the audit trail.
export async function supersedeEvent(originalEvent, replacementEvent) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(EVENTS_STORE);
    store.put({ ...originalEvent, supersededBy: replacementEvent.id });
    store.add(replacementEvent);
    tx.oncomplete = () => resolve(replacementEvent);
    tx.onerror = () => reject(tx.error);
  });
}

// --- matches ------------------------------------------------------------

export async function saveMatch(match) {
  await runTransaction(MATCHES_STORE, 'readwrite', (store) => store.put(match));
  return match;
}

export async function getMatch(matchId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCHES_STORE, 'readonly');
    const request = tx.objectStore(MATCHES_STORE).get(matchId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// --- innings ------------------------------------------------------------

export async function saveInnings(innings) {
  await runTransaction(INNINGS_STORE, 'readwrite', (store) => store.put(innings));
  return innings;
}

export async function getAllInningsForMatch(matchId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INNINGS_STORE, 'readonly');
    const index = tx.objectStore(INNINGS_STORE).index('matchId');
    const request = index.getAll(matchId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getLatestInnings(matchId) {
  const all = await getAllInningsForMatch(matchId);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.inningsNumber - a.inningsNumber)[0];
}

// --- full deletion -------------------------------------------------------

// Used by "return to start": removes the match record, every innings
// belonging to it, and every event belonging to it. This is a genuine,
// irreversible deletion (not a supersede), since the whole point is to
// discard a match entirely, not correct one delivery within it.
export async function deleteMatchCompletely(matchId) {
  const [events, innings] = await Promise.all([getEventsForMatch(matchId), getAllInningsForMatch(matchId)]);
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([EVENTS_STORE, INNINGS_STORE, MATCHES_STORE], 'readwrite');

    events.forEach((e) => tx.objectStore(EVENTS_STORE).delete(e.id));
    innings.forEach((i) => tx.objectStore(INNINGS_STORE).delete(i.id));
    tx.objectStore(MATCHES_STORE).delete(matchId);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
