// storage.js
// The only module that talks to IndexedDB. Everything else deals in
// plain event objects and calls the functions below.

const DB_NAME = 'cricket-analyst';
const DB_VERSION = 1;
const STORE_NAME = 'events';

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('matchId', 'matchId', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

export async function addEvent(event) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(event);
    tx.oncomplete = () => resolve(event);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateEvent(event) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(event);
    tx.oncomplete = () => resolve(event);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteEvent(eventId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(eventId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getEventsForMatch(matchId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('matchId');
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ ...originalEvent, supersededBy: replacementEvent.id });
    store.add(replacementEvent);
    tx.oncomplete = () => resolve(replacementEvent);
    tx.onerror = () => reject(tx.error);
  });
}
