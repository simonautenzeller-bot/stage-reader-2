// Dialoge auf Basis von <dialog>; ersetzen prompt()/confirm(), die auf Tablets unschön sind.
import { h } from './util.js';

function show(build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dlg' });
    const close = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(null); });
    dialog.append(build(close));
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[autofocus]')?.focus();
  });
}

export function confirmDialog(message, { title = 'Bitte bestätigen', okText = 'OK', danger = false } = {}) {
  return show((close) => h('form', { method: 'dialog', onsubmit: (event) => { event.preventDefault(); close(true); } },
    h('h2', {}, title), h('p', {}, message),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => close(false) }, 'Abbrechen'),
      h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}`, autofocus: true }, okText)))).then(Boolean);
}

export function promptDialog(title, value = '', { okText = 'OK', label = '' } = {}) {
  return show((close) => {
    const input = h('input', { type: 'text', value, autofocus: true, 'aria-label': label || title });
    input.addEventListener('focus', () => input.select());
    return h('form', { method: 'dialog', onsubmit: (event) => { event.preventDefault(); close(input.value.trim() || null); } },
      h('h2', {}, title), label && h('label', {}, label), input,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn primary' }, okText)));
  });
}

/** choices: [{ value, label, primary?, danger? }] – liefert den gewählten value oder null. */
export function choiceDialog(title, message, choices) {
  return show((close) => h('div', {},
    h('h2', {}, title), message && h('p', {}, message),
    h('div', { class: 'dlg-choices' }, choices.map((choice, index) =>
      h('button', { type: 'button', class: `btn ${choice.primary ? 'primary' : ''} ${choice.danger ? 'danger' : ''}`, autofocus: index === 0, onclick: () => close(choice.value) }, choice.label))),
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, 'Abbrechen'))));
}

/** items: [{ id, label, sub? }] – Mehrfachauswahl, liefert Array der ids oder null. */
export function pickDialog(title, items, { okText = 'Übernehmen', emptyText = 'Nichts zur Auswahl.' } = {}) {
  return show((close) => {
    const boxes = items.map((item) => ({ item, box: h('input', { type: 'checkbox', value: item.id }) }));
    return h('form', { method: 'dialog', onsubmit: (event) => { event.preventDefault(); close(boxes.filter(({ box }) => box.checked).map(({ item }) => item.id)); } },
      h('h2', {}, title),
      items.length ? h('div', { class: 'dlg-list' }, boxes.map(({ item, box }) => h('label', { class: 'check' }, box, h('span', {}, item.label, item.sub && h('small', {}, item.sub))))) : h('p', {}, emptyText),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, 'Abbrechen'),
        items.length > 0 && h('button', { type: 'submit', class: 'btn primary' }, okText)));
  });
}
