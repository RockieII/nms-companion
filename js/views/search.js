// Shared search UI: the search field wrapper and the global (cross-category)
// search behaviour used by both Browse and the Home hub.

import { getAllItems, KIND_LABELS } from '../data.js';
import { buildRow, debounce, el, norm } from './ui.js';

const PAGE = 200;
const SEARCH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>';

export function searchInputEl(placeholder) {
  return el('input', {
    type: 'search', placeholder,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
  });
}

export function searchField(input) {
  return el('div', { class: 'searchbar' }, [
    el('div', { class: 'search-field' }, [
      el('span', { class: 'search-icon', html: SEARCH_SVG }),
      input,
    ]),
  ]);
}

// Wire a global cross-category search. `other` is shown when the query is empty
// (the category grid, or the Home hub); `results` holds the hit list, each row
// tagged with its kind. Items load lazily on the first keystroke.
export function mountGlobalSearch({ input, results, other }) {
  let all = null;
  const run = debounce(async () => {
    const q = norm(input.value);
    if (!q) {
      if (other) other.style.display = '';
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    if (other) other.style.display = 'none';
    results.style.display = '';
    if (!all) {
      results.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
      all = await getAllItems();
    }
    if (norm(input.value) !== q) return; // superseded
    const list = all.filter(it =>
      norm(it.Name).includes(q) || norm(it.Abbrev).includes(q) || norm(it.Group).includes(q));
    results.innerHTML = '';
    if (!list.length) {
      results.appendChild(el('div', { class: 'empty' }, 'No matches.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const item of list.slice(0, PAGE)) {
      frag.appendChild(buildRow({
        item, kind: item._kind, subtitle: item.Group, badge: KIND_LABELS[item._kind] || '',
      }));
    }
    results.appendChild(frag);
    if (list.length > PAGE) {
      results.appendChild(el('div', { class: 'empty' },
        `Showing first ${PAGE} of ${list.length}. Keep typing to narrow.`));
    }
  }, 140);
  input.addEventListener('input', run);
}
