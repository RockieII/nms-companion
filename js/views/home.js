// Home hub — the default landing. Global search up top; below it a set of quick
// tools, recently-viewed items, pinned favorites, and the latest game update.
// The hub content is hidden while a search query is active.

import { getRecent, getItemById, listFavorites, getUpdates } from '../data.js';
import { searchField, searchInputEl, mountGlobalSearch } from './search.js';
import { buildRow, el } from './ui.js';

const TOOL_SVG = {
  calc: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 4v3h10V6H7zm0 5v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 15v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v4h2v-4h-2z"/></svg>',
  projects: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 2h6v2h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2zm-2 4v14h10V6h-2v1H9V6H7zm2.7 4.6L11 12l3-3 1.4 1.4-4.4 4.4-2.7-2.8 1.4-1.4z"/></svg>',
  cooking: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2M16 3c0 1-1 1-1 2s1 1 1 2"/><path fill="currentColor" d="M3 10a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 5 5 0 0 1-3 4.58V17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2.42A5 5 0 0 1 3 10z"/></svg>',
};

export async function renderHome(root) {
  root.innerHTML = '';

  const searchInput = searchInputEl('Search all items…');
  const hub = el('div', { class: 'hub' });
  const results = el('div', { class: 'list' });
  results.style.display = 'none';

  root.appendChild(searchField(searchInput));
  root.appendChild(hub);
  root.appendChild(results);
  mountGlobalSearch({ input: searchInput, results, other: hub });

  // Quick tools
  hub.appendChild(el('div', { class: 'tools' }, [
    tool('Calculator', '#calc', TOOL_SVG.calc),
    tool('Projects', '#projects', TOOL_SVG.projects),
    tool('Cooking', '#recipes?mode=cooking', TOOL_SVG.cooking),
  ]));

  // Recently viewed
  const recentIds = getRecent().slice(0, 6);
  if (recentIds.length) {
    const list = el('div', { class: 'list' });
    for (const id of recentIds) {
      const item = await getItemById(id);
      if (item && item._kind !== 'refiner' && item._kind !== 'cooking') {
        list.appendChild(buildRow({ item, kind: item._kind, subtitle: item.Group }));
      }
    }
    if (list.children.length) { hub.appendChild(title('Recent')); hub.appendChild(list); }
  }

  // Pinned favorites
  const favs = listFavorites().filter(f => f.type !== 'refiner').slice(0, 6);
  if (favs.length) {
    const list = el('div', { class: 'list' });
    for (const f of favs) {
      const item = await getItemById(f.id);
      if (item) list.appendChild(buildRow({ item, kind: f.type, subtitle: item.Group }));
    }
    if (list.children.length) { hub.appendChild(title('Pinned')); hub.appendChild(list); }
  }

  // Latest update
  const updates = await getUpdates();
  const u = updates && updates[0];
  if (u) {
    hub.appendChild(title('Latest update'));
    const card = el('a', { class: 'update-card', href: `#update/${encodeURIComponent(u.id)}` });
    if (u.thumbnail) {
      const img = el('img', { class: 'update-thumb', src: u.thumbnail, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      card.appendChild(img);
    }
    card.appendChild(el('div', { class: 'update-body-wrap' }, [
      el('h2', { class: 'update-title' }, u.title),
      el('p', { class: 'update-excerpt' }, u.excerpt || ''),
    ]));
    hub.appendChild(card);
  }
}

function title(t) { return el('h3', { class: 'hub-title' }, t); }

function tool(label, href, svg) {
  return el('a', { class: 'tool', href }, [
    el('span', { class: 'tool-icon', html: svg }),
    el('span', { class: 'tool-label' }, label),
  ]);
}
