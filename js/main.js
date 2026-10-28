import { getSettings } from './db.js';
import { renderLibrary } from './library.js';
import { renderReader } from './reader.js';
import { renderSettings } from './settings.js';
import { renderSetlist, renderSetlists } from './setlists.js';
import { applyTheme } from './theme.js';

const root = document.getElementById('app');
let cleanup = () => {};
let renderId = 0;

function parseRoute() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  if (parts[0] === 'reader' && parts[1]) return { name: 'reader', id: decodeURIComponent(parts[1]), setlistId: params.get('setlist') };
  if (parts[0] === 'setlist' && parts[1]) return { name: 'setlist', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'setlists') return { name: 'setlists' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'library' };
}

async function route() {
  const current = ++renderId;
  cleanup();
  cleanup = () => {};
  const target = parseRoute();
  document.body.classList.toggle('in-reader', target.name === 'reader');
  window.scrollTo(0, 0);
  const views = { library: renderLibrary, setlists: renderSetlists, setlist: renderSetlist, settings: renderSettings, reader: renderReader };
  try {
    const dispose = await views[target.name](root, target);
    if (current !== renderId) { dispose?.(); return; }
    cleanup = dispose ?? (() => {});
  } catch (error) {
    console.error(error);
    root.textContent = `Fehler: ${error.message}`;
  }
}

window.addEventListener('hashchange', () => void route());
applyTheme(await getSettings());
await route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((error) => console.error('Service Worker:', error));
}
