// Source detail page — renders an "obtainable from" entry. When reached from
// an item profile, also shows the item-specific note.

import { getSource, getSourceNoteForItem, getItemById } from '../data.js';
import { imgOrPlaceholder, el } from './ui.js';

export async function renderSource(root, id, params = {}) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const source = await getSource(id);
  const itemId = params?.item;
  const [item, note] = await Promise.all([
    itemId ? getItemById(itemId) : null,
    itemId ? getSourceNoteForItem(id, itemId) : null,
  ]);
  root.innerHTML = '';

  if (!source) {
    root.appendChild(el('div', { class: 'empty' }, [
      'Source not found.',
      el('small', {}, `No record for id "${id}".`),
    ]));
    return;
  }

  // Header
  root.appendChild(el('div', { class: 'profile-head' }, [
    el('div', { class: 'source-icon' }, '⛏'),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, source.name),
      el('p', { class: 'profile-group' }, 'Obtainable source'),
    ]),
  ]));

  // Item-specific note first, if we arrived from an item profile.
  if (note && item) {
    root.appendChild(el('div', { class: 'profile-section' }, [
      el('h3', { class: 'profile-section-title' }, `For ${item.Name}`),
      el('div', { class: 'section-body' }, [
        el('div', { class: 'sheet-desc source-item-note' }, note),
      ]),
    ]));
  }

  // Generic mechanic explanation.
  root.appendChild(el('div', { class: 'profile-section' }, [
    el('h3', { class: 'profile-section-title' }, 'How it works'),
    el('div', { class: 'section-body' }, [
      el('div', { class: 'sheet-desc' }, source.detail || '—'),
    ]),
  ]));

  // Back-to-item link
  if (item) {
    root.appendChild(el('a', {
      class: 'row',
      href: `#item/${encodeURIComponent(item.Id)}`,
    }, [
      imgOrPlaceholder(item, { class: 'row-icon' }),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, `Back to ${item.Name}`),
        el('div', { class: 'row-sub' }, item.Group || ''),
      ]),
      el('span', { class: 'row-chevron', html: '›' }),
    ]));
  }
}
