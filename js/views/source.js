// Source detail page — renders a single "obtainable from" entry's full
// explanation. Routed as #source/<id>.

import { getSource } from '../data.js';
import { el } from './ui.js';

export async function renderSource(root, id) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const source = await getSource(id);
  root.innerHTML = '';

  if (!source) {
    root.appendChild(el('div', { class: 'empty' }, [
      'Source not found.',
      el('small', {}, `No record for id "${id}".`),
    ]));
    return;
  }

  root.appendChild(el('div', { class: 'profile-head' }, [
    el('div', { class: 'source-icon' }, '⛏'),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, source.name),
      el('p', { class: 'profile-group' }, 'Obtainable source'),
    ]),
  ]));

  root.appendChild(el('div', { class: 'profile-section' }, [
    el('h3', { class: 'profile-section-title' }, 'How it works'),
    el('div', { class: 'section-body' }, [
      el('div', { class: 'sheet-desc' }, source.detail || '—'),
    ]),
  ]));
}
