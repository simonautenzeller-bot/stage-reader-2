// Reine Logik ohne DOM-Zugriff, damit sie mit `node --test` geprüft werden kann.

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const DEFAULT_ZOOM = { pdf: 1, 'guitar-pro': 0.7 };

export const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/** Wandelt eine getippte Prozentangabe ("70", "70%", "62,5") in einen Zoomfaktor um. */
export function parseZoomPercent(text) {
  const cleaned = String(text ?? '').trim().replace('%', '').replace(',', '.').trim();
  if (!cleaned) return null;
  const percent = Number(cleaned);
  return Number.isFinite(percent) && percent > 0 ? clampZoom(percent / 100) : null;
}

export const formatZoom = (zoom) => String(Math.round(zoom * 100));

const EXTENSIONS = {
  pdf: { type: 'pdf', mimeType: 'application/pdf' },
  gp3: { type: 'guitar-pro', mimeType: 'application/x-guitar-pro' },
  gp4: { type: 'guitar-pro', mimeType: 'application/x-guitar-pro' },
  gp5: { type: 'guitar-pro', mimeType: 'application/x-guitar-pro' },
  gpx: { type: 'guitar-pro', mimeType: 'application/x-guitar-pro' },
  gp: { type: 'guitar-pro', mimeType: 'application/x-guitar-pro' },
};

export function detectFile(name, mimeType = '') {
  const extension = String(name).split('.').pop()?.toLowerCase();
  if (extension && Object.hasOwn(EXTENSIONS, extension)) return EXTENSIONS[extension];
  if (mimeType === 'application/pdf') return EXTENSIONS.pdf;
  return null;
}

export const titleFromFileName = (name) => String(name).replace(/\.[^.]+$/, '').trim() || 'Unbenannter Song';

export function formatSize(bytes) {
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---------- Bibliothek ----------

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

export function sortSongs(songs, order) {
  const list = [...songs];
  if (order === 'opened') return list.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || collator.compare(a.title, b.title));
  if (order === 'imported') return list.sort((a, b) => b.importedAt - a.importedAt);
  if (order === 'type') return list.sort((a, b) => collator.compare(a.fileType, b.fileType) || collator.compare(a.title, b.title));
  return list.sort((a, b) => collator.compare(a.title, b.title));
}

export function filterSongs(songs, query, onlyFavorites) {
  const needle = query.trim().toLowerCase();
  return songs.filter((song) => (!onlyFavorites || song.isFavorite) && (!needle || song.title.toLowerCase().includes(needle)));
}

export function moveItem(list, index, direction) {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

// ---------- Blättern in Guitar-Pro-Dateien ----------

/**
 * Bestimmt, welche Notenzeilen (Systeme) in die Höhe passen.
 * systems: [{ top, bottom, firstBar, lastBar }] von oben nach unten, Takte 0-basiert.
 * Das erste System zählt immer, auch wenn es höher als der Platz ist (sonst gäbe es keinen Fortschritt).
 */
export function fitSystems(systems, height) {
  let count = 0;
  for (const system of systems) {
    if (count > 0 && system.bottom > height) break;
    count++;
  }
  if (!count) return null;
  const last = systems[count - 1];
  return { count, firstBar: systems[0].firstBar, lastBar: last.lastBar, bottom: last.bottom, complete: count === systems.length };
}

/**
 * Zustandsautomat für die Seitenwechsel: Beim Vorwärtsblättern beginnt die neue Seite
 * mit dem Takt direkt nach dem, der vorher unten rechts als letzter sichtbar war
 * (war unten rechts Takt 30, steht oben links Takt 31).
 */
export class BarPager {
  constructor(totalBars, start = 0) {
    this.total = totalBars;
    this.start = Math.min(Math.max(0, start), Math.max(0, totalBars - 1));
    this.history = [];
  }

  /** fit = Ergebnis von fitSystems für die aktuelle Seite. Liefert den neuen Starttakt oder null am Ende. */
  forward(fit) {
    if (!fit || fit.lastBar >= this.total - 1) return null;
    const next = fit.lastBar + 1;
    this.history.push(this.start);
    this.start = next;
    return next;
  }

  back(fit) {
    if (this.start <= 0) return null;
    const visible = fit ? Math.max(1, fit.lastBar - fit.firstBar + 1) : 4;
    const previous = this.history.length ? this.history.pop() : Math.max(0, this.start - visible);
    this.start = previous;
    return previous;
  }

  /** Nach Änderungen an Zoom, Spuren oder Zeilenumbruch stimmen die alten Seitengrenzen nicht mehr. */
  relayout() {
    this.history = [];
  }

  jump(start) {
    this.start = Math.min(Math.max(0, start), Math.max(0, this.total - 1));
    this.history = [];
  }
}

// ---------- Backup ----------

export function createBackup(songs, setlists, settings) {
  return {
    schema: 'stage-reader',
    version: 2,
    exportedAt: new Date().toISOString(),
    songs: songs.map(({ fileBlob, ...meta }) => meta),
    setlists,
    settings,
  };
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object' || data.schema !== 'stage-reader') throw new Error('Das ist keine Stage-Reader-Sicherung.');
  if (![1, 2].includes(data.version)) throw new Error('Diese Version der Sicherung wird nicht unterstützt.');
  if (!Array.isArray(data.songs) || !Array.isArray(data.setlists) || typeof data.settings !== 'object') throw new Error('Die Sicherung ist unvollständig.');
  return data;
}
