import { deleteEverything, getAll, getSettings, put, saveSettings, storageEstimate } from './db.js';
import { confirmDialog } from './dialogs.js';
import { applyTheme } from './theme.js';
import { createBackup, formatSize, validateBackup } from './logic.js';
import { APP_VERSION, noticeBox, pageShell } from './shell.js';
import { downloadBlob, h } from './util.js';

function choiceRow(label, options, current, onPick) {
  return h('div', { class: 'setting' }, h('span', { class: 'menu-label' }, label),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(([value, text]) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(value === current), onclick: () => onPick(value) }, text))));
}

export async function renderSettings(root) {
  let settings = await getSettings();
  const notice = noticeBox();
  const backupInput = h('input', { type: 'file', hidden: true, accept: 'application/json,.json', onchange: () => { if (backupInput.files[0]) void importBackup(backupInput.files[0]); } });
  const rows = h('div', { class: 'settings' });

  async function change(changes) {
    settings = await saveSettings(changes);
    applyTheme(settings);
    draw();
  }

  async function exportBackup() {
    const backup = createBackup(await getAll('songs'), await getAll('setlists'), settings);
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'stage-reader-sicherung.json');
    notice.show('Sicherung gespeichert. Sie enthält Einstellungen, Setlisten und Leseposition, aber nicht die Notendateien selbst.');
  }

  async function importBackup(file) {
    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      const songs = await getAll('songs');
      let matched = 0;
      for (const meta of backup.songs) {
        const target = songs.find((song) => song.id === meta.id) ?? songs.find((song) => song.originalFileName === meta.originalFileName && song.fileSize === meta.fileSize);
        if (!target) continue;
        const { id, fileBlob, importedAt, fileSize, originalFileName, fileType, mimeType, ...rest } = meta;
        await put('songs', { ...target, ...rest });
        matched++;
      }
      for (const list of backup.setlists) await put('setlists', list);
      settings = await saveSettings({ ...backup.settings, id: 'global' });
      applyTheme(settings);
      draw();
      notice.show(`Sicherung eingespielt: ${backup.setlists.length} Setliste(n), ${matched} Song-Einstellungen. Die Notendateien selbst müssen auf diesem Gerät vorhanden sein.`);
    } catch (error) {
      notice.show(error instanceof Error ? error.message : 'Die Sicherung konnte nicht eingespielt werden.');
    } finally {
      backupInput.value = '';
    }
  }

  function draw() {
    rows.replaceChildren(
      choiceRow('Darstellung', [['eink', 'E-Ink (Schwarz/Weiß)'], ['light', 'Hell'], ['dark', 'Dunkel']], settings.appTheme, (value) => void change({ appTheme: value })),
      choiceRow('PDF-Seiten', [['white', 'Weiß'], ['warm', 'Warmweiß'], ['dark', 'Invertiert']], settings.documentTheme, (value) => void change({ documentTheme: value })),
      choiceRow('Schritt „Halbe Seite“', [40, 50, 60, 75, 100].map((value) => [value, `${value} %`]), settings.offsetStep, (value) => void change({ offsetStep: value })),
      h('p', { class: 'hint' }, 'E-Ink: reines Schwarz auf Weiß, kräftige Rahmen, keine Animationen und kein weiches Scrollen. Gilt auch für die Noten- und Tabulaturdarstellung.'));
  }

  const actions = h('div', { class: 'toolbar wrap' },
    h('button', { type: 'button', class: 'btn', onclick: async () => { const estimate = await storageEstimate(); const songs = await getAll('songs'); notice.show(`${songs.length} Song(s) gespeichert, ungefähr ${formatSize(estimate.usage ?? 0)} belegt${estimate.quota ? ` von ${formatSize(estimate.quota)}` : ''}.`); } }, 'Speicher anzeigen'),
    h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await navigator.storage?.persist?.(); notice.show(ok ? 'Dauerhafter Speicher ist aktiv.' : 'Dauerhafter Speicher wurde nicht gewährt oder ist nicht verfügbar.'); } }, 'Speicher schützen'),
    h('button', { type: 'button', class: 'btn', onclick: () => void exportBackup() }, 'Sicherung exportieren'),
    h('button', { type: 'button', class: 'btn', onclick: () => backupInput.click() }, 'Sicherung einspielen'), backupInput,
    h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (await confirmDialog('Wirklich alle Dateien, Setlisten und Einstellungen von diesem Gerät löschen?', { okText: 'Alles löschen', danger: true })) { await deleteEverything(); location.hash = '#/'; location.reload(); } } }, 'Alle Daten löschen'));

  root.replaceChildren(pageShell('settings', h('h2', { class: 'page-title' }, 'Einstellungen'), h('p', { class: 'hint' }, 'Alle Dateien und Einstellungen werden ausschließlich lokal auf diesem Gerät gespeichert.'), rows, h('h2', { class: 'page-title' }, 'Daten'), actions, notice, h('p', { class: 'hint' }, `Stage Reader ${APP_VERSION}`)));
  draw();
  return () => {};
}
