// Updates tab — renders the Steam announcement gallery.
// Data is pulled from data/updates.json, which is auto-refreshed by the
// sync-updates GitHub Action.

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
  for (const upd of updates) {
    list.appendChild(buildUpdateCard(upd));
  }
  root.appendChild(list);
}

function buildUpdateCard(upd) {
  const expanded = { open: false };

  const thumb = upd.thumbnail
    ? el('img', { class: 'update-thumb', src: upd.thumbnail, alt: '', loading: 'lazy' })
    : null;

  const titleEl = el('h2', { class: 'update-title' }, upd.title);
  const metaEl = el('div', { class: 'update-meta' }, [
    el('span', { class: 'update-feed' }, upd.feedlabel || 'Announcement'),
    el('span', { class: 'update-dot' }, '·'),
    el('span', { class: 'update-date' }, formatRelativeDate(upd.date)),
  ]);
  const excerptEl = el('p', { class: 'update-excerpt' }, upd.excerpt || '');
  const bodyEl = el('div', { class: 'update-body', html: upd.body || '' });
  bodyEl.style.display = 'none';

  const steamLink = el('a', {
    class: 'update-link',
    href: upd.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, 'Open on Steam →');

  const toggle = el('button', { class: 'update-toggle' }, 'Read more');

  const card = el('article', { class: 'update-card' }, [
    thumb,
    el('div', { class: 'update-body-wrap' }, [
      titleEl,
      metaEl,
      excerptEl,
      bodyEl,
      el('div', { class: 'update-actions' }, [toggle, steamLink]),
    ]),
  ]);

  toggle.addEventListener('click', () => {
    expanded.open = !expanded.open;
    bodyEl.style.display = expanded.open ? 'block' : 'none';
    excerptEl.style.display = expanded.open ? 'none' : 'block';
    toggle.textContent = expanded.open ? 'Show less' : 'Read more';
  });

  return card;
}

function formatRelativeDate(ms) {
  const then = new Date(ms);
  const now = new Date();
  const diffMs = now - then;
  const sec = Math.round(diffMs / 1000);
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
