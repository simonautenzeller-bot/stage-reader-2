// IndexedDB-Schicht. Songs (Metadaten) und Dateien (Blobs) liegen getrennt,
// damit Leseposition-Speichern nicht jedes Mal die ganze Datei anfasst.

const DB_NAME = 'stage-reader-2';
const DB_VERSION = 1;

export const defaultSettings = { id: 'global', appTheme: 'eink', documentTheme: 'white', offsetStep: 50, migrationDismissed: false };

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('songs', { keyPath: 'id' });
      db.createObjectStore('files');
      db.createObjectStore('setlists', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Führt work(stores) in einer Transaktion aus und wartet auf deren Abschluss. */
async function transact(names, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));
    let result;
    Promise.resolve(work(stores)).then((value) => { result = value; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen.'));
  });
}

const wrap = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export const getAll = (store) => transact([store], 'readonly', (s) => wrap(s[store].getAll()));
export const get = (store, key) => transact([store], 'readonly', (s) => wrap(s[store].get(key)));
export const put = (store, value) => transact([store], 'readwrite', (s) => wrap(s[store].put(value)));
export const remove = (store, key) => transact([store], 'readwrite', (s) => wrap(s[store].delete(key)));

export const getFile = (id) => get('files', id);

export function saveSong(meta, blob) {
  return transact(['songs', 'files'], 'readwrite', async (s) => {
    s.songs.put(meta);
    if (blob) s.files.put(blob, meta.id);
  });
}

export function deleteSong(id) {
  return transact(['songs', 'files', 'setlists'], 'readwrite', async (s) => {
    s.songs.delete(id);
    s.files.delete(id);
    const lists = await wrap(s.setlists.getAll());
    for (const list of lists) {
      if (list.orderedSongIds.includes(id)) s.setlists.put({ ...list, orderedSongIds: list.orderedSongIds.filter((songId) => songId !== id), updatedAt: Date.now() });
    }
  });
}

export async function getSettings() {
  return { ...defaultSettings, ...((await get('settings', 'global')) ?? {}) };
}

export async function saveSettings(changes) {
  const next = { ...(await getSettings()), ...changes };
  await put('settings', next);
  try { localStorage.setItem('sr2.theme', next.appTheme); } catch { /* optional */ }
  return next;
}

export async function deleteEverything() {
  const db = await open();
  db.close();
  dbPromise = undefined;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = resolve;
  });
  try { localStorage.removeItem('sr2.theme'); } catch { /* optional */ }
}

export async function storageEstimate() {
  return (await navigator.storage?.estimate?.()) ?? {};
}
