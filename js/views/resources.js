import { getResources } from '../data.js';
import { buildRow, buildCategorySelect, uniqueGroups, openSheet, debounce, el, norm, imgOrPlaceholder } from './ui.js';

export async function renderResources(root) {
  const resources = await getResources();
  root.innerHTML = '';

  const state = { query: '', group: '' };
  const groups = uniqueGroups(resources);

  const listEl = el('div', { class: 'list' });
  const searchInput = el('input', {
    type: 'search',
    placeholder: `Search ${resources.length} resources…`,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const searchBar = el('div', { class: 'searchbar' }, [searchInput]);
  const filterBar = buildCategorySelect(groups, (value) => {
    state.group = value;
    paint();
  });

  root.appendChild(searchBar);
  root.appendChild(filterBar);
  root.appendChild(listEl);

  function paint() {
    const q = state.query;
    const g = state.group;
    let items = resources;
    if (g) items = items.filter(r => r.Group === g);
    if (q) items = items.filter(r =>
      norm(r.Name).includes(q) ||
      norm(r.Abbrev).includes(q) ||
      norm(r.Group).includes(q)
    );

    listEl.innerHTML = '';
    if (items.length === 0) {
      listEl.appendChild(el('div', { class: 'empty' }, 'No matches.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const item of items.slice(0, 200)) {
      frag.appendChild(buildRow({
        item,
        kind: 'resource',
        subtitle: `${item.Group} · ${item.BaseValueUnits || 0} u`,
        onOpen: () => openResourceSheet(item),
      }));
    }
    listEl.appendChild(frag);
    if (items.length > 200) {
      listEl.appendChild(el('div', { class: 'empty' },
        `Showing first 200 of ${items.length}. Keep typing to narrow.`));
    }
  }

  const filter = debounce(() => {
    state.query = norm(searchInput.value);
    paint();
  }, 120);

  searchInput.addEventListener('input', filter);
  paint();
}

function openResourceSheet(item) {
  openSheet(({ close }) => {
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'sheet-head' }, [
      imgOrPlaceholder(item.CdnUrl, { class: 'sheet-icon' }),
      el('div', {}, [
        el('h2', { class: 'sheet-title' }, item.Name),
        el('p',  { class: 'sheet-group' }, item.Group || ''),
      ]),
      el('button', { class: 'sheet-close', onclick: close, 'aria-label': 'Close', html: '×' }),
    ]));

    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Description'),
      el('div', { class: 'sheet-desc' }, item.Description || '—'),
    ]));

    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Stats'),
      el('div', { class: 'stat-grid' }, [
        el('div', {}, [el('span', {}, 'Symbol: '), document.createTextNode(item.Abbrev || '—')]),
        el('div', {}, [el('span', {}, 'Value: '),  document.createTextNode(`${item.BaseValueUnits || 0} u`)]),
        el('div', {}, [el('span', {}, 'Stack: '),  document.createTextNode(`${item.MaxStackSize || '—'}`)]),
        el('div', {}, [el('span', {}, 'ID: '),     document.createTextNode(item.Id)]),
      ]),
    ]));

    return wrap;
  });
}
