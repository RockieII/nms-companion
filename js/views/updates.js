// Updates tab — gallery of Steam announcement cards. Each card links to a
// full detail page (rendered by update.js) rather than expanding inline.

import { getUpdates } from '../data.js';
import { el } from './ui.js';

export async function renderUpdates(root) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const updates = await getUpdates();
  root.innerHTML = '';

  if (!updates || updates.length === 0) {
    root.appendChild(el('div', { class: 'empty' }, [
      'No updates yet.',
      el('small', {}, 'First sync runs daily on GitHub Actions. Check back soon.'),
    ]));
    return;
  }

  const list = el('div', { class: 'update-list' });
  for (const upd of updates) list.appendChild(buildUpdateCard(upd));
  root.appendChild(list);
}

function buildUpdateCard(upd) {
  const card = el('a', {
    class: 'update-card',
    href: `#update/${encodeURIComponent(upd.id)}`,
  });

  if (upd.thumbnail) {
    const img = el('img', {
      class: 'update-thumb',
      src: upd.thumbnail,
      alt: '',
      loading: 'lazy',
    });
    img.addEventListener('error', () => img.remove());
    card.appendChild(img);
  }

  card.appendChild(el('div', { class: 'update-body-wrap' }, [
    el('h2', { class: 'update-title' }, upd.title),
    el('div', { class: 'update-meta' }, [
      el('span', { class: 'update-feed' }, upd.feedlabel || 'Announcement'),
      el('span', { class: 'update-dot' }, '·'),
      el('span', { class: 'update-date' }, formatRelativeDate(upd.date)),
    ]),
    el('p', { class: 'update-excerpt' }, upd.excerpt || ''),
  ]));
  return card;
}

function formatRelativeDate(ms) {
  const then = new Date(ms);
  const now = new Date();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  const week = Math.round(day / 7);
  if (week < 5) return `${week} week${week === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}
