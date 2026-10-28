import { h } from './util.js';

export const APP_VERSION = '2.0.0';

export function pageShell(active, ...content) {
  const link = (href, name, text) => h('a', { class: 'tab', href, 'aria-current': active === name ? 'page' : null }, text);
  return h('div', { class: 'page' },
    h('header', { class: 'app-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'OFFLINE-NOTENLESER'), h('h1', {}, 'Stage Reader')),
      h('nav', { 'aria-label': 'Hauptmenü' }, link('#/', 'library', 'Bibliothek'), link('#/setlists', 'setlists', 'Setlisten'), link('#/settings', 'settings', 'Einstellungen'))),
    ...content);
}

export function noticeBox() {
  const box = h('p', { class: 'notice', role: 'status', hidden: true });
  box.show = (text) => { box.textContent = text; box.hidden = !text; };
  return box;
}
