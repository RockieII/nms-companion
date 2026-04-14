// Single update detail page — renders a full-screen article for one Steam
// announcement, identified by id. Content is already sanitized by the sync
// script, so we can drop it into the DOM directly.

import { getUpdates } from '../data.js';
import { el } from './ui.js';

export async function renderUpdate(root, id) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const updates = await getUpdates();
  const upd = (updates || []).find(u => u.id === id);
  root.innerHTML = '';

  if (!upd) {
    root.appendChild(el('div', { class: 'empty' }, [
      'Update not found.',
      el('small', {}, `No record for id "${id}".`),
    ]));
    return;
  }

  if (upd.thumbnail) {
    const hero = el('img', {
      class: 'update-hero',
      src: upd.thumbnail,
      alt: '',
      loading: 'eager',
    });
    hero.addEventListener('error', () => hero.remove());
    root.appendChild(hero);
  }

  root.appendChild(el('h1', { class: 'update-detail-title' }, upd.title));
  root.appendChild(el('div', { class: 'update-meta' }, [
    el('span', { class: 'update-feed' }, upd.feedlabel || 'Announcement'),
    el('span', { class: 'update-dot' }, '·'),
    el('span', { class: 'update-date' }, new Date(upd.date).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    })),
  ]));

  root.appendChild(el('div', { class: 'update-detail-body', html: upd.body || '' }));

  root.appendChild(el('a', {
    class: 'update-link btn btn-secondary',
    href: upd.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, 'Open on Steam ↗'));
}
