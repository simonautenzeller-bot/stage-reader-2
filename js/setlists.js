import { get, getAll, put, remove } from './db.js';
import { confirmDialog, pickDialog, promptDialog } from './dialogs.js';
import { moveItem } from './logic.js';
import { noticeBox, pageShell } from './shell.js';
import { h, uuid } from './util.js';

export async function renderSetlists(root) {
  let lists = await getAll('setlists');
  const notice = noticeBox();
  const container = h('section', { class: 'library', 'aria-label': 'Setlisten' });

  async function reload() { lists = await getAll('setlists'); draw(); }

  async function create() {
    const title = await promptDialog('Name der neuen Setliste', '', { okText: 'Erstellen' });
    if (!title) return;
    const list = { id: uuid(), title, createdAt: Date.now(), updatedAt: Date.now(), orderedSongIds: [] };
    await put('setlists', list);
    location.hash = `#/setlist/${list.id}`;
  }

  function draw() {
    if (!lists.length) { container.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'Noch keine Setlisten'), h('p', {}, 'Mit Setlisten spielst du Songs in fester Reihenfolge nacheinander.'))); return; }
    container.replaceChildren(...[...lists].sort((a, b) => b.updatedAt - a.updatedAt).map((list) => h('article', { class: 'song' },
      h('div', { class: 'song-main' }, h('h2', {}, list.title), h('p', { class: 'meta' }, `${list.orderedSongIds.length} Song${list.orderedSongIds.length === 1 ? '' : 's'}`)),
      h('div', { class: 'song-actions' },
        list.orderedSongIds.length > 0 && h('a', { class: 'btn primary', href: `#/reader/${list.orderedSongIds[0]}?setlist=${list.id}` }, 'Starten'),
        h('a', { class: 'btn', href: `#/setlist/${list.id}` }, 'Bearbeiten'),
        h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (await confirmDialog(`Setliste „${list.title}“ löschen? Die Songs bleiben erhalten.`, { okText: 'Löschen', danger: true })) { await remove('setlists', list.id); await reload(); } } }, 'Löschen')))));
  }

  root.replaceChildren(pageShell('setlists', h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'btn primary', onclick: () => void create() }, 'Setliste erstellen')), notice, container));
  draw();
  return () => {};
}

export async function renderSetlist(root, { id }) {
  let list = await get('setlists', id);
  if (!list) { location.hash = '#/setlists'; return () => {}; }
  const songs = new Map((await getAll('songs')).map((song) => [song.id, song]));
  const notice = noticeBox();
  const container = h('section', { class: 'library', 'aria-label': 'Songs der Setliste' });
  const title = h('h2', { class: 'page-title' });
  const startLink = h('a', { class: 'btn primary' }, 'Starten');

  async function save(changes) {
    list = { ...list, ...changes, updatedAt: Date.now() };
    await put('setlists', list);
    draw();
  }

  function draw() {
    title.textContent = list.title;
    startLink.hidden = list.orderedSongIds.length === 0;
    startLink.href = list.orderedSongIds.length ? `#/reader/${list.orderedSongIds[0]}?setlist=${list.id}` : '#';
    if (!list.orderedSongIds.length) { container.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Diese Setliste ist noch leer.'))); return; }
    container.replaceChildren(...list.orderedSongIds.map((songId, index) => {
      const song = songs.get(songId);
      return h('article', { class: 'song' },
        h('div', { class: 'song-main' }, h('span', { class: 'badge' }, `${index + 1}`), h('h2', {}, song?.title ?? 'Song nicht mehr vorhanden')),
        h('div', { class: 'song-actions' },
          song && h('a', { class: 'btn', href: `#/reader/${songId}?setlist=${list.id}` }, 'Öffnen'),
          h('button', { type: 'button', class: 'btn', disabled: index === 0, 'aria-label': 'Nach oben', onclick: () => void save({ orderedSongIds: moveItem(list.orderedSongIds, index, -1) }) }, '↑'),
          h('button', { type: 'button', class: 'btn', disabled: index === list.orderedSongIds.length - 1, 'aria-label': 'Nach unten', onclick: () => void save({ orderedSongIds: moveItem(list.orderedSongIds, index, 1) }) }, '↓'),
          h('button', { type: 'button', class: 'btn danger', 'aria-label': 'Aus Setliste entfernen', onclick: () => void save({ orderedSongIds: list.orderedSongIds.filter((_, position) => position !== index) }) }, '✕')));
    }));
  }

  async function addSongs() {
    const available = [...songs.values()].filter((song) => !list.orderedSongIds.includes(song.id)).sort((a, b) => a.title.localeCompare(b.title, 'de'));
    const picked = await pickDialog('Songs hinzufügen', available.map((song) => ({ id: song.id, label: song.title, sub: song.fileType === 'pdf' ? 'PDF' : 'Guitar Pro' })), { okText: 'Hinzufügen', emptyText: 'Alle Songs sind schon in der Setliste.' });
    if (picked?.length) await save({ orderedSongIds: [...list.orderedSongIds, ...picked] });
  }

  root.replaceChildren(pageShell('setlists',
    h('div', { class: 'toolbar' }, h('a', { class: 'btn', href: '#/setlists' }, '‹ Setlisten')),
    title,
    h('div', { class: 'toolbar' },
      startLink,
      h('button', { type: 'button', class: 'btn', onclick: () => void addSongs() }, 'Songs hinzufügen'),
      h('button', { type: 'button', class: 'btn', onclick: async () => { const name = await promptDialog('Setliste umbenennen', list.title); if (name) await save({ title: name }); } }, 'Umbenennen')),
    notice, container));
  draw();
  return () => {};
}
