import { deleteSong, get, getAll, getFile, getSettings, put, saveSettings } from './db.js';
import { choiceDialog, confirmDialog, promptDialog } from './dialogs.js';
import { importFiles, migrateFromV1, oldDatabaseExists } from './importer.js';
import { filterSongs, formatSize, sortSongs } from './logic.js';
import { noticeBox, pageShell } from './shell.js';
import { downloadBlob, formatDate, h, uuid } from './util.js';

export async function chooseSetlist(songId) {
  const setlists = await getAll('setlists');
  const choices = [...setlists.map((list) => ({ value: list.id, label: `${list.title} (${list.orderedSongIds.length})` })), { value: '__new', label: '+ Neue Setliste …', primary: !setlists.length }];
  const picked = await choiceDialog('Zu Setliste hinzufügen', '', choices);
  if (!picked) return null;
  let list;
  if (picked === '__new') {
    const title = await promptDialog('Name der neuen Setliste', '', { okText: 'Erstellen' });
    if (!title) return null;
    list = { id: uuid(), title, createdAt: Date.now(), updatedAt: Date.now(), orderedSongIds: [] };
  } else {
    list = setlists.find((entry) => entry.id === picked);
  }
  if (list.orderedSongIds.includes(songId)) return `Der Song ist schon in „${list.title}“.`;
  await put('setlists', { ...list, orderedSongIds: [...list.orderedSongIds, songId], updatedAt: Date.now() });
  return `Zu „${list.title}“ hinzugefügt.`;
}

export async function renderLibrary(root) {
  let songs = await getAll('songs');
  const settings = await getSettings();
  let query = '';
  let filter = 'all';
  let sort = 'title';
  const notice = noticeBox();

  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.gp,.gp3,.gp4,.gp5,.gpx,application/pdf', onchange: () => { if (fileInput.files.length) void runImport(fileInput.files); } });
  const search = h('input', { type: 'search', placeholder: 'Songs durchsuchen', 'aria-label': 'Songs durchsuchen', oninput: () => { query = search.value; drawList(); } });
  const filterAll = h('button', { type: 'button', class: 'btn', onclick: () => setFilter('all') });
  const filterFav = h('button', { type: 'button', class: 'btn', onclick: () => setFilter('favorite') }, 'Favoriten');
  const sorter = h('select', { 'aria-label': 'Sortierung', onchange: () => { sort = sorter.value; drawList(); } },
    [['title', 'Titel'], ['opened', 'Zuletzt geöffnet'], ['imported', 'Zuletzt importiert'], ['type', 'Dateityp']].map(([value, text]) => h('option', { value }, text)));
  const list = h('section', { class: 'library', 'aria-label': 'Songbibliothek' });
  const banner = h('div', { class: 'banner', hidden: true });

  function setFilter(next) { filter = next; drawList(); }

  async function reload() { songs = await getAll('songs'); drawList(); }

  async function runImport(files) {
    notice.show('Dateien werden importiert …');
    const summary = await importFiles(files, (text) => notice.show(text));
    fileInput.value = '';
    notice.show(summary || 'Es wurde nichts importiert.');
    await reload();
  }

  async function moreActions(song) {
    const action = await choiceDialog(song.title, '', [
      { value: 'rename', label: 'Umbenennen' },
      { value: 'setlist', label: 'Zu Setliste hinzufügen' },
      { value: 'download', label: 'Datei herunterladen' },
      { value: 'delete', label: 'Löschen …', danger: true },
    ]);
    if (action === 'rename') {
      const title = await promptDialog('Songtitel', song.title);
      if (title) { await put('songs', { ...(await get('songs', song.id)), title }); await reload(); }
    } else if (action === 'setlist') {
      const message = await chooseSetlist(song.id);
      if (message) notice.show(message);
    } else if (action === 'download') {
      const blob = await getFile(song.id);
      if (blob) downloadBlob(blob, song.originalFileName);
    } else if (action === 'delete') {
      if (await confirmDialog(`„${song.title}“ wirklich löschen? Die Datei wird von diesem Gerät entfernt.`, { okText: 'Löschen', danger: true })) {
        await deleteSong(song.id);
        await reload();
      }
    }
  }

  function songRow(song) {
    const detail = [song.lastOpenedAt ? `Zuletzt geöffnet: ${formatDate(song.lastOpenedAt)}` : 'Noch nicht geöffnet', formatSize(song.fileSize),
      song.fileType === 'guitar-pro' && song.trackNames?.length ? `${song.trackNames.length} Spur${song.trackNames.length === 1 ? '' : 'en'}` : null,
      song.fileType === 'pdf' && song.pageCount ? `${song.pageCount} Seite${song.pageCount === 1 ? '' : 'n'}` : null].filter(Boolean).join(' · ');
    return h('article', { class: 'song' },
      h('div', { class: 'song-main' }, h('span', { class: 'badge' }, song.fileType === 'pdf' ? 'PDF' : 'Guitar Pro'), h('h2', {}, song.title), h('p', { class: 'meta' }, detail)),
      h('div', { class: 'song-actions' },
        h('a', { class: 'btn primary', href: `#/reader/${song.id}` }, 'Öffnen'),
        h('button', { type: 'button', class: 'btn', 'aria-pressed': String(song.isFavorite), 'aria-label': song.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren', onclick: async () => { await put('songs', { ...song, isFavorite: !song.isFavorite }); await reload(); } }, song.isFavorite ? '★' : '☆'),
        h('button', { type: 'button', class: 'btn', onclick: () => void moreActions(song) }, 'Mehr …')));
  }

  function drawList() {
    filterAll.textContent = `Alle (${songs.length})`;
    filterAll.setAttribute('aria-pressed', String(filter === 'all'));
    filterFav.setAttribute('aria-pressed', String(filter === 'favorite'));
    const shown = sortSongs(filterSongs(songs, query, filter === 'favorite'), sort);
    if (shown.length) list.replaceChildren(...shown.map(songRow));
    else if (songs.length) list.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Keine Songs gefunden.')));
    else list.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'Deine Bibliothek ist leer'), h('p', {}, 'Füge PDF- oder Guitar-Pro-Dateien hinzu. Sie bleiben nur auf diesem Gerät.'), h('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, 'Datei hinzufügen')));
  }

  const page = pageShell('library',
    h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, 'Datei hinzufügen'), fileInput),
    banner,
    h('div', { class: 'toolbar' }, search, filterAll, filterFav, sorter),
    notice, list);
  root.replaceChildren(page);
  page.addEventListener('dragover', (event) => event.preventDefault());
  page.addEventListener('drop', (event) => { event.preventDefault(); if (event.dataTransfer?.files?.length) void runImport(event.dataTransfer.files); });
  drawList();

  if (!settings.migrationDismissed && (await oldDatabaseExists())) {
    banner.hidden = false;
    banner.append(h('p', {}, 'Auf diesem Gerät wurden Daten von Stage Reader 1.0 gefunden. Songs und Setlisten übernehmen?'),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', class: 'btn primary', onclick: async () => {
          try {
            const result = await migrateFromV1();
            await saveSettings({ migrationDismissed: true });
            banner.hidden = true;
            notice.show(`${result.songs} Song(s) und ${result.setlists} Setliste(n) übernommen.`);
            await reload();
          } catch (error) { console.error(error); notice.show('Die Übernahme ist fehlgeschlagen.'); }
        } }, 'Übernehmen'),
        h('button', { type: 'button', class: 'btn', onclick: async () => { await saveSettings({ migrationDismissed: true }); banner.hidden = true; } }, 'Ausblenden')));
  }
  return () => {};
}
