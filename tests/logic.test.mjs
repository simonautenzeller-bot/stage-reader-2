import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BarPager, clampZoom, createBackup, detectFile, filterSongs, fitSystems, formatSize, moveItem, parseZoomPercent, sortSongs, titleFromFileName, validateBackup } from '../js/logic.js';

test('Zoom per Tippen: Zahl, Prozentzeichen, Komma, Grenzen', () => {
  assert.equal(parseZoomPercent('70'), 0.7);
  assert.equal(parseZoomPercent(' 70 % '), 0.7);
  assert.equal(parseZoomPercent('62,5'), 0.625);
  assert.equal(parseZoomPercent('5'), 0.25);
  assert.equal(parseZoomPercent('9999'), 4);
  assert.equal(parseZoomPercent(''), null);
  assert.equal(parseZoomPercent('abc'), null);
  assert.equal(parseZoomPercent('-20'), null);
  assert.equal(clampZoom(1), 1);
});

test('Dateierkennung und Titel', () => {
  assert.equal(detectFile('Probe.GP5').type, 'guitar-pro');
  assert.equal(detectFile('x.pdf').type, 'pdf');
  assert.equal(detectFile('bild.png'), null);
  assert.equal(detectFile('ohne-endung', 'application/pdf').type, 'pdf');
  assert.equal(titleFromFileName('Mein Song.v2.gp5'), 'Mein Song.v2');
  assert.equal(formatSize(4958), '5 KB');
  assert.equal(formatSize(3 * 1048576), '3.0 MB');
});

const system = (top, bottom, firstBar, lastBar) => ({ top, bottom, firstBar, lastBar });

test('fitSystems zählt nur vollständig sichtbare Zeilen, die erste immer', () => {
  const systems = [system(0, 200, 0, 3), system(200, 400, 4, 7), system(400, 600, 8, 11)];
  assert.deepEqual(fitSystems(systems, 450), { count: 2, firstBar: 0, lastBar: 7, bottom: 400, complete: false });
  assert.equal(fitSystems(systems, 50).count, 1);
  assert.equal(fitSystems(systems, 600).complete, true);
  assert.equal(fitSystems([], 600), null);
});

test('Vorwärts: letzter sichtbarer Takt wird zum ersten der nächsten Seite', () => {
  const pager = new BarPager(40);
  const page1 = fitSystems([system(0, 200, 0, 3), system(200, 400, 4, 7), system(400, 600, 8, 11)], 450);
  assert.equal(pager.forward(page1), 7);
  const page2 = fitSystems([system(0, 200, 7, 10), system(200, 400, 11, 14)], 450);
  assert.equal(pager.forward(page2), 14);
  assert.equal(pager.start, 14);
});

test('Vorwärts am Ende bleibt stehen, bei einem einzigen Takt geht es trotzdem weiter', () => {
  const pager = new BarPager(12);
  assert.equal(pager.forward(fitSystems([system(0, 200, 0, 11)], 450)), null);
  const tiny = new BarPager(12, 3);
  assert.equal(tiny.forward({ count: 1, firstBar: 3, lastBar: 3, bottom: 900, complete: false }), 4);
});

test('Zurück nutzt die Seitenhistorie, sonst eine Schätzung', () => {
  const pager = new BarPager(60);
  const page = fitSystems([system(0, 200, 0, 3), system(200, 400, 4, 7)], 450);
  pager.forward(page);
  pager.forward({ ...page, firstBar: 7, lastBar: 14 });
  assert.equal(pager.back(page), 7);
  assert.equal(pager.back(page), 0);
  assert.equal(pager.back(page), null);

  const restored = new BarPager(60, 20);
  assert.equal(restored.back({ firstBar: 20, lastBar: 27 }), 13);
  restored.jump(2);
  assert.equal(restored.back({ firstBar: 2, lastBar: 9 }), 0);
});

test('Setlisten umsortieren und Bibliothek filtern/sortieren', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  const songs = [
    { title: 'Zulu 10', importedAt: 1, lastOpenedAt: null, fileType: 'pdf', isFavorite: false },
    { title: 'Alpha', importedAt: 2, lastOpenedAt: 50, fileType: 'guitar-pro', isFavorite: true },
    { title: 'Zulu 2', importedAt: 3, lastOpenedAt: 99, fileType: 'pdf', isFavorite: false },
  ];
  assert.deepEqual(sortSongs(songs, 'title').map((s) => s.title), ['Alpha', 'Zulu 2', 'Zulu 10']);
  assert.deepEqual(sortSongs(songs, 'opened').map((s) => s.title), ['Zulu 2', 'Alpha', 'Zulu 10']);
  assert.deepEqual(filterSongs(songs, 'zulu', false).length, 2);
  assert.deepEqual(filterSongs(songs, '', true).map((s) => s.title), ['Alpha']);
});

test('Backup enthält keine Dateien und wird validiert', () => {
  const backup = createBackup([{ id: '1', title: 'A', fileBlob: 'BLOB' }], [], { appTheme: 'eink' });
  assert.equal(backup.songs[0].fileBlob, undefined);
  assert.doesNotThrow(() => validateBackup(backup));
  assert.throws(() => validateBackup({ schema: 'other' }));
  assert.throws(() => validateBackup({ schema: 'stage-reader', version: 9, songs: [], setlists: [], settings: {} }));
});
