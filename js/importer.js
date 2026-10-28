import { getAll, saveSong, put } from './db.js';
import { inspectFile, newSongMeta } from './files.js';
import { titleFromFileName, DEFAULT_ZOOM } from './logic.js';
import { choiceDialog } from './dialogs.js';
import { uuid } from './util.js';

/** Importiert Dateien; fragt bei gleichem Dateinamen nach. Liefert eine Zusammenfassung als Text. */
export async function importFiles(files, onProgress = () => {}) {
  let imported = 0;
  const problems = [];
  const list = Array.from(files);
  for (const [index, file] of list.entries()) {
    onProgress(`Importiere ${index + 1} von ${list.length}: ${file.name} …`);
    try {
      const info = await inspectFile(file);
      const existing = (await getAll('songs')).find((song) => song.originalFileName === file.name);
      let action = 'new';
      if (existing) {
        action = await choiceDialog('Datei existiert bereits', `„${file.name}“ ist schon in der Bibliothek.`, [
          { value: 'replace', label: 'Ersetzen (Favorit, Titel und Setlisten bleiben)', primary: true },
          { value: 'new', label: 'Zusätzlich importieren' },
          { value: 'skip', label: 'Überspringen' },
        ]);
        if (!action || action === 'skip') continue;
      }
      if (action === 'replace') {
        const meta = newSongMeta({ id: existing.id, file, info, title: existing.title });
        await saveSong({ ...meta, isFavorite: existing.isFavorite, lastOpenedAt: existing.lastOpenedAt }, file);
      } else {
        await saveSong(newSongMeta({ id: uuid(), file, info, title: titleFromFileName(file.name) }), file);
      }
      imported++;
    } catch (error) {
      console.error(error);
      problems.push(error instanceof Error ? error.message : `„${file.name}“ konnte nicht importiert werden.`);
    }
  }
  if (imported) navigator.storage?.persist?.().catch(() => {});
  return [imported ? `${imported} Datei(en) importiert.` : '', ...problems].filter(Boolean).join(' ');
}

// ---------- Übernahme aus Stage Reader 1.0 (Datenbank „stage-reader“ auf derselben Adresse) ----------

export async function oldDatabaseExists() {
  try { return Boolean((await indexedDB.databases?.())?.some((db) => db.name === 'stage-reader')); } catch { return false; }
}

function readAll(db, name) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(name)) { resolve([]); return; }
    const request = db.transaction(name, 'readonly').objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function migrateFromV1() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('stage-reader');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const [songs, setlists] = [await readAll(db, 'songs'), await readAll(db, 'setlists')];
    const known = new Set((await getAll('songs')).map((song) => song.id));
    let copied = 0;
    for (const old of songs) {
      if (known.has(old.id) || !old.fileBlob) continue;
      const type = old.fileType === 'pdf' ? 'pdf' : 'guitar-pro';
      await saveSong({
        id: old.id, title: old.title, originalFileName: old.originalFileName, fileType: type, mimeType: old.mimeType,
        fileSize: old.fileSize ?? old.fileBlob.size, importedAt: old.importedAt ?? Date.now(), lastOpenedAt: old.lastOpenedAt ?? null,
        isFavorite: Boolean(old.isFavorite), currentPage: old.currentPage ?? 1, scrollRatio: 0, startBar: 0,
        zoomLevel: type === 'pdf' ? DEFAULT_ZOOM.pdf : (old.zoomLevel ?? DEFAULT_ZOOM['guitar-pro']),
        displayMode: old.displayMode ?? 'page', selectedTrackIds: Array.isArray(old.selectedTrackIds) && old.selectedTrackIds.length ? old.selectedTrackIds : null,
        notationMode: old.notationMode ?? 'both', barsPerRow: 0, trackNames: [], pageCount: null,
      }, old.fileBlob);
      copied++;
    }
    const knownLists = new Set((await getAll('setlists')).map((list) => list.id));
    for (const list of setlists) if (!knownLists.has(list.id)) await put('setlists', list);
    return { songs: copied, setlists: setlists.filter((list) => !knownLists.has(list.id)).length };
  } finally {
    db.close();
  }
}
