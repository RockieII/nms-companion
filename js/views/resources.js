// Browse — a two-level item browse. The tab opens to a grid of super-category
// cards (renderCategoryGrid) with an Items|Recipes toggle and a global search;
// tapping a card drills into a scoped list (renderCategoryList).
// Routes: #browse → grid, #browse?cat=<id> → list.

import { getItemsForKinds, KIND_LABELS, SUPER_CATEGORIES } from '../data.js';
import { buildRow, buildCategorySelect, buildTypeChips, uniqueGroups, debounce, el, norm } from './ui.js';
import { searchField, searchInputEl, mountGlobalSearch } from './search.js';

const PAGE = 200;

// Inline icons for the six super-category cards (line/solid, matching the app).
const CATEGORY_ICONS = {
  materials: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7z" opacity=".3"/><path fill="currentColor" d="M12 2 3 7l9 5 9-5z"/></svg>',
  tech: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3v2H7a2 2 0 0 0-2 2v2H3v2h2v2H3v2h2v2a2 2 0 0 0 2 2h2v2h2v-2h2v2h2v-2h2a2 2 0 0 0 2-2v-2h2v-2h-2v-2h2V9h-2V7a2 2 0 0 0-2-2h-2V3h-2v2h-2V3H9zm0 6h6v6H9z"/></svg>',
  building: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V11l7-4v2l7-4v16h-4v-5h-3v5H4z" opacity=".9"/><path fill="currentColor" d="M2 21h20v2H2z"/></svg>',
  cooking: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2M16 3c0 1-1 1-1 2s1 1 1 2"/><path fill="currentColor" d="M3 10a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 5 5 0 0 1-3 4.58V17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2.42A5 5 0 0 1 3 10z"/></svg>',
  vehicles: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c3 2.2 5 5.4 5 9.5L15.5 13h-7L7 11.5C7 7.4 9 4.2 12 2zm0 5.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM7 15l-2 4 4-1.2M17 15l2 4-4-1.2M10 19.2h4L12 22z"/></svg>',
  other: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>',
};

export async function renderResources(root, params = {}) {
  const cat = params.cat && SUPER_CATEGORIES.find(c => c.id === params.cat);
  if (cat) return renderCategoryList(root, cat);
  return renderCategoryGrid(root);
}

// --- Level 1: Items|Recipes toggle + global search + category grid ---
function renderCategoryGrid(root) {
  root.innerHTML = '';

  const toggle = el('div', { class: 'subtabs browse-toggle' }, [
    el('button', { class: 'subtab active' }, 'Items'),
    el('a', { class: 'subtab', href: '#recipes' }, 'Recipes'),
  ]);

  const searchInput = searchInputEl('Search all items…');
  const grid = el('div', { class: 'cat-grid' });
  for (const c of SUPER_CATEGORIES) {
    grid.appendChild(el('a', { class: 'cat-card', href: `#browse?cat=${c.id}` }, [
      el('div', { class: 'cat-card-icon', html: CATEGORY_ICONS[c.icon] || '' }),
      el('div', { class: 'cat-card-label' }, c.label),
    ]));
  }
  const results = el('div', { class: 'list' });
  results.style.display = 'none';

  root.appendChild(toggle);
  root.appendChild(searchField(searchInput));
  root.appendChild(grid);
  root.appendChild(results);

  mountGlobalSearch({ input: searchInput, results, other: grid });
}

// --- Level 2: one super-category's list, filterable by kind + group ---
async function renderCategoryList(root, cat) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const items = await getItemsForKinds(cat.kinds);
  root.innerHTML = '';

  const state = { query: '', kind: '', group: '' };

  const header = el('div', { class: 'cat-header' }, [
    el('a', { class: 'cat-back', href: '#browse' }, [
      el('span', { class: 'cat-back-arrow', html: '‹' }),
      'Categories',
    ]),
    el('span', { class: 'cat-heading' }, cat.label),
  ]);

  const searchInput = searchInputEl(`Search ${items.length} ${cat.label.toLowerCase()}…`);

  // Level-2 kind chips — only when the super-category spans more than one kind.
  const kindsPresent = cat.kinds.filter(k => items.some(it => it._kind === k));
  const chipRow = kindsPresent.length > 1
    ? buildTypeChips(
        [{ value: '', label: 'All' }, ...kindsPresent.map(k => ({ value: k, label: KIND_LABELS[k] }))],
        (val) => { state.kind = val; state.group = ''; rebuildGroups(); paint(); })
    : null;

  const groupHost = el('div');
  const listEl = el('div', { class: 'list' });

  root.appendChild(header);
  root.appendChild(searchField(searchInput));
  if (chipRow) root.appendChild(chipRow);
  root.appendChild(groupHost);
  root.appendChild(listEl);

  function rebuildGroups() {
    groupHost.innerHTML = '';
    const pool = state.kind ? items.filter(it => it._kind === state.kind) : items;
    const groups = uniqueGroups(pool);
    if (groups.length <= 1) return;
    groupHost.appendChild(buildCategorySelect(groups, (value) => {
      state.group = value;
      paint();
    }, state.group));
  }

  function paint() {
    const q = state.query;
    let list = items;
    if (state.kind)  list = list.filter(it => it._kind === state.kind);
    if (state.group) list = list.filter(it => it.Group === state.group);
    if (q) list = list.filter(it =>
      norm(it.Name).includes(q) || norm(it.Abbrev).includes(q) || norm(it.Group).includes(q));

    listEl.innerHTML = '';
    if (list.length === 0) {
      listEl.appendChild(el('div', { class: 'empty' }, 'No matches.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const item of list.slice(0, PAGE)) {
      frag.appendChild(buildRow({ item, kind: item._kind, subtitle: item.Group }));
    }
    listEl.appendChild(frag);
    if (list.length > PAGE) {
      listEl.appendChild(el('div', { class: 'empty' },
        `Showing first ${PAGE} of ${list.length}. Keep typing to narrow.`));
    }
  }

  const filter = debounce(() => { state.query = norm(searchInput.value); paint(); }, 120);
  searchInput.addEventListener('input', filter);

  rebuildGroups();
  paint();
}
