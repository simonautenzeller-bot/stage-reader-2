import { get, getFile, put, getSettings } from './db.js';
import { clampZoom, DEFAULT_ZOOM, formatZoom, parseZoomPercent } from './logic.js';
import { debounce, h } from './util.js';
import { PdfView } from './pdfview.js';
import { GpView } from './gpview.js';

const TAP_MOVE_LIMIT = 12;
const TAP_TIME_LIMIT = 700;

function segmented(label, options, current, onPick) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([value, text]) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(value === current), onclick: () => onPick(value) }, text)));
}

function section(title, ...content) {
  return h('div', { class: 'menu-row' }, h('span', { class: 'menu-label' }, title), h('div', { class: 'menu-body' }, content));
}

export async function renderReader(root, { id, setlistId }) {
  const song = await get('songs', id);
  const blob = song && (await getFile(id));
  if (!song || !blob) { location.hash = '#/'; return () => {}; }
  const settings = await getSettings();
  const setlist = setlistId ? await get('setlists', setlistId) : null;
  const listIndex = setlist ? setlist.orderedSongIds.indexOf(id) : -1;

  song.lastOpenedAt = Date.now();
  const persist = debounce(() => put('songs', song).catch((error) => console.error(error)), 400);
  const save = (patch) => { Object.assign(song, patch); persist(); };
  void put('songs', song);

  // ---------- Aufbau ----------
  const position = h('span', { class: 'rpos', 'aria-live': 'polite' });
  const menuButton = h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false', onclick: () => toggleMenu() }, 'Menü');
  const backHref = setlist ? `#/setlist/${setlist.id}` : '#/';
  const bar = h('header', { class: 'rbar' },
    h('a', { class: 'btn', href: backHref }, setlist ? '‹ Setliste' : '‹ Bibliothek'),
    h('strong', { class: 'rtitle' }, song.title), position, menuButton);
  const menu = h('section', { class: 'rmenu', hidden: true, 'aria-label': 'Einstellungen für diesen Song' });
  const scroller = h('main', { class: 'rview', tabindex: '-1' });
  const stage = h('div', { class: 'rstage' }, scroller, h('div', { class: 'tap-hint left', 'aria-hidden': 'true' }, '‹'), h('div', { class: 'tap-hint right', 'aria-hidden': 'true' }, '›'), menu);
  root.replaceChildren(h('div', { class: 'reader' }, bar, stage));

  const callbacks = {
    position: (text) => { position.textContent = text; },
    save,
    error: (message) => showError(message),
    tracks: () => {},
  };
  const view = song.fileType === 'pdf'
    ? new PdfView({ scroller, blob, song, settings, callbacks })
    : new GpView({ scroller, blob, song, theme: settings.appTheme, callbacks });

  function showError(message) {
    scroller.replaceChildren(h('div', { class: 'rerror', role: 'alert' }, h('p', {}, message), h('a', { class: 'btn primary', href: backHref }, 'Zurück')));
    position.textContent = '';
  }

  // ---------- Menü ----------
  const zoomInput = h('input', { class: 'zoom-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Zoom in Prozent', value: formatZoom(song.zoomLevel) });
  const applyZoom = (zoom) => {
    const clamped = clampZoom(zoom);
    zoomInput.value = formatZoom(clamped);
    if (clamped === song.zoomLevel) return;
    save({ zoomLevel: clamped });
    view.setZoom(clamped);
  };
  const stepZoom = (direction) => {
    const percent = Math.round(song.zoomLevel * 100);
    applyZoom((direction > 0 ? (Math.floor(percent / 10) + 1) * 10 : (Math.ceil(percent / 10) - 1) * 10) / 100);
  };
  const commitTypedZoom = () => {
    const typed = parseZoomPercent(zoomInput.value);
    if (typed === null) zoomInput.value = formatZoom(song.zoomLevel);
    else applyZoom(typed);
  };
  zoomInput.addEventListener('focus', () => zoomInput.select());
  zoomInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedZoom(); zoomInput.blur(); } });
  zoomInput.addEventListener('blur', commitTypedZoom);

  function buildMenu() {
    const rows = [
      section('Zoom', h('div', { class: 'zoom' },
        h('button', { type: 'button', class: 'btn', 'aria-label': 'Verkleinern', onclick: () => stepZoom(-1) }, '−'),
        zoomInput, h('span', {}, '%'),
        h('button', { type: 'button', class: 'btn', 'aria-label': 'Vergrößern', onclick: () => stepZoom(1) }, '+'),
        h('button', { type: 'button', class: 'btn', onclick: () => applyZoom(DEFAULT_ZOOM[song.fileType]) }, 'Standard')),
      h('small', { class: 'hint' }, 'Prozentzahl eintippen und mit Enter bestätigen.')),
    ];
    if (song.fileType === 'pdf') {
      rows.push(section('Ansicht', segmented('Ansichtsmodus', [['page', 'Seite'], ['offset', 'Halbe Seite'], ['continuous', 'Endlos']], song.displayMode, (mode) => { view.setMode(mode); buildMenu(); })));
    } else {
      rows.push(section('Notation', segmented('Notation', [['standard', 'Noten'], ['tabs', 'Tabulatur'], ['both', 'Beides']], song.notationMode, (mode) => { save({ notationMode: mode }); view.setNotation(mode); buildMenu(); })));
      const selected = view.trackIds ?? [0];
      rows.push(section('Spuren', h('div', { class: 'tracks' }, (view.tracks ?? []).map((track) =>
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: selected.includes(track.index), onchange: (event) => {
            const next = event.target.checked ? [...new Set([...selected, track.index])] : selected.filter((value) => value !== track.index);
            if (!next.length) { event.target.checked = true; return; }
            view.setTracks(next);
            buildMenu();
          } }),
          h('span', {}, track.name))))));
      rows.push(section('Takte pro Zeile', segmented('Takte pro Zeile', [[0, 'Auto'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], song.barsPerRow || 0, (count) => { save({ barsPerRow: count }); view.setBarsPerRow(count); buildMenu(); })));
    }
    if (setlist && listIndex >= 0) {
      const go = (offset) => { const next = setlist.orderedSongIds[listIndex + offset]; if (next) location.hash = `#/reader/${next}?setlist=${setlist.id}`; };
      rows.push(section('Setliste', h('div', { class: 'setnav' },
        h('button', { type: 'button', class: 'btn', disabled: listIndex <= 0, onclick: () => go(-1) }, '‹ Vorheriger Song'),
        h('span', {}, `${listIndex + 1} von ${setlist.orderedSongIds.length}`),
        h('button', { type: 'button', class: 'btn', disabled: listIndex >= setlist.orderedSongIds.length - 1, onclick: () => go(1) }, 'Nächster Song ›'))));
    }
    menu.replaceChildren(...rows);
  }

  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) buildMenu();
  }

  // ---------- Eingaben ----------
  const pointers = new Set();
  let down = null;
  scroller.addEventListener('contextmenu', (event) => event.preventDefault());
  stage.addEventListener('pointerdown', (event) => {
    pointers.add(event.pointerId);
    if (event.target.closest('.rmenu')) { down = null; return; }
    down = { x: event.clientX, y: event.clientY, time: performance.now(), scroll: scroller.scrollTop, valid: pointers.size === 1 };
    if (pointers.size > 1) down.valid = false;
  });
  const endPointer = (event) => pointers.delete(event.pointerId);
  stage.addEventListener('pointercancel', (event) => { endPointer(event); down = null; });
  stage.addEventListener('pointerup', (event) => {
    endPointer(event);
    const start = down;
    down = null;
    if (!start?.valid) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_LIMIT || Math.abs(scroller.scrollTop - start.scroll) > 2;
    if (moved || performance.now() - start.time > TAP_TIME_LIMIT) return;
    if (!menu.hidden) { toggleMenu(false); return; }
    const rect = scroller.getBoundingClientRect();
    if (event.clientX < rect.left + rect.width / 2) view.prev?.();
    else view.next?.();
  });

  const onKey = (event) => {
    if (event.target.closest?.('input, textarea, select') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') { if (!menu.hidden) toggleMenu(false); else location.hash = backHref; return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); view.next?.(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); view.prev?.(); }
  };
  window.addEventListener('keydown', onKey);

  let wakeLock = null;
  const acquireWakeLock = async () => { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ } };
  const onVisibility = () => { if (document.visibilityState === 'visible') void acquireWakeLock(); else persist.flush(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', persist.flush);
  void acquireWakeLock();

  try {
    await view.start();
    callbacks.position(view.label);
  } catch (error) {
    console.error(error);
    showError(error.message);
  }

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', persist.flush);
    document.removeEventListener('visibilitychange', onVisibility);
    persist.flush();
    view.destroy();
    void wakeLock?.release?.();
  };
}
