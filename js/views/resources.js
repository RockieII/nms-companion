// Items browser — every item across all 7 data files (raw materials, products,
// technology, constructed tech, curiosities, trade, other), filterable by type
// and category. Tapping a row opens its profile (item.js).

import { getAllItems, KIND_LABELS } from '../data.js';
import { buildRow, buildCategorySelect, buildTypeChips, uniqueGroups, debounce, el, norm } from './ui.js';

const PAGE = 200;

export async function renderResources(root) {
  const items = await getAllItems();
  root.innerHTML = '';

  const state = { query: '', kind: '', group: '' };

  const listEl = el('div', { class: 'list' });
  const searchInput = el('input', {
    type: 'search',
    placeholder: `Search ${items.length} items…`,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const searchBar = el('div', { class: 'searchbar' }, [
    el('div', { class: 'search-field' }, [
      el('span', { class: 'search-icon', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>' }),
      searchInput,
    ]),
  ]);

  // Type chips: All + one per kind that actually has items.
  const kindsPresent = Object.keys(KIND_LABELS).filter(k => items.some(it => it._kind === k));
  const chips = [{ value: '', label: 'All' }, ...kindsPresent.map(k => ({ value: k, label: KIND_LABELS[k] }))];
  const chipRow = buildTypeChips(chips, (val) => {
    state.kind = val;
    state.group = '';
    rebuildGroups();
    paint();
  });

  const groupHost = el('div');

  root.appendChild(searchBar);
  root.appendChild(chipRow);
  root.appendChild(groupHost);
  root.appendChild(listEl);

  // The category select only makes sense scoped to a single type (across all
  // types there'd be 100+ groups). Shown once a type chip is active.
  function rebuildGroups() {
    groupHost.innerHTML = '';
    if (!state.kind) return;
    const pool = items.filter(it => it._kind === state.kind);
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
      norm(it.Name).includes(q) ||
      norm(it.Abbrev).includes(q) ||
      norm(it.Group).includes(q)
    );

    listEl.innerHTML = '';
    if (list.length === 0) {
      listEl.appendChild(el('div', { class: 'empty' }, 'No matches.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const item of list.slice(0, PAGE)) {
      frag.appendChild(buildRow({
        item,
        kind: item._kind,
        subtitle: item.Group,
      }));
    }
    listEl.appendChild(frag);
    if (list.length > PAGE) {
      listEl.appendChild(el('div', { class: 'empty' },
        `Showing first ${PAGE} of ${list.length}. Keep typing to narrow.`));
    }
  }

  const filter = debounce(() => {
    state.query = norm(searchInput.value);
    paint();
  }, 120);

  searchInput.addEventListener('input', filter);
  paint();
}
