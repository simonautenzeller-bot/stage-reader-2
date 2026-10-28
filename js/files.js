import { DEFAULT_ZOOM, detectFile, formatSize } from './logic.js';
import { loadAlphaTab, loadPdfJs } from './libs.js';

const broken = (file) => new Error(`„${file.name}“ (${formatSize(file.size)}) ist beschädigt oder unvollständig und wurde nicht importiert. Bitte die Datei erneut übertragen.`);

/**
 * Prüft Typ und Inhalt. Dateien werden wirklich geparst, damit abgeschnittene oder defekte
 * Dateien nie in der Bibliothek landen (und keine funktionierende Datei überschreiben können).
 * Liefert { type, mimeType, trackNames?, pageCount? }.
 */
export async function inspectFile(file) {
  const detected = detectFile(file.name, file.type);
  if (!detected) throw new Error(`„${file.name}“: Dieses Dateiformat wird nicht unterstützt. Erlaubt sind PDF, GP3, GP4, GP5, GPX und GP.`);
  if (file.size === 0) throw new Error(`„${file.name}“ ist leer.`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (detected.type === 'pdf') {
    const head = new TextDecoder().decode(bytes.subarray(0, 1024));
    if (!head.includes('%PDF-')) throw new Error(`„${file.name}“ ist keine gültige PDF-Datei.`);
    const pdfjs = await loadPdfJs();
    try {
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const pageCount = pdf.numPages;
      await pdf.destroy();
      return { ...detected, pageCount };
    } catch (error) {
      console.error(error);
      throw broken(file);
    }
  }

  const alphaTab = await loadAlphaTab();
  try {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings());
    return { ...detected, trackNames: score.tracks.map((track, index) => track.name?.trim() || `Spur ${index + 1}`) };
  } catch (error) {
    console.error(error);
    throw broken(file);
  }
}

export function newSongMeta({ id, file, info, title, now = Date.now() }) {
  return {
    id,
    title,
    originalFileName: file.name,
    fileType: info.type,
    mimeType: info.mimeType,
    fileSize: file.size,
    importedAt: now,
    lastOpenedAt: null,
    isFavorite: false,
    currentPage: 1,
    scrollRatio: 0,
    startBar: 0,
    zoomLevel: DEFAULT_ZOOM[info.type],
    displayMode: 'page',
    selectedTrackIds: null,
    notationMode: 'both',
    barsPerRow: 0,
    trackNames: info.trackNames ?? [],
    pageCount: info.pageCount ?? null,
  };
}
