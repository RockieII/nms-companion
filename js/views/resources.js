import { getResources } from '../data.js';
import { buildRow, openSheet, debounce, el, norm } from './ui.js';

export async function renderResources(root) {
  const resources = await getResources();
  root.innerHTML = '';

  const listEl = el('div', { class: 'list' });
  const searchInput = el('input', {
    type: 'search',
    placeholder: `Search ${resources.length} resources…`,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const searchBar = el('div', { class: 'searchbar' }, [searchInput]);

  root.appendChild(searchBar);
  root.appendChild(listEl);

  function paint(items) {
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
    const q = norm(searchInput.value);
    if (!q) return paint(resources);
    paint(resources.filter(r =>
      norm(r.Name).includes(q) ||
      norm(r.Abbrev).includes(q) ||
      norm(r.Group).includes(q)
    ));
  }, 120);

  searchInput.addEventListener('input', filter);
  paint(resources);
}

function openResourceSheet(item) {
  openSheet(({ close }) => {
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'sheet-head' }, [
      el('img', { class: 'sheet-icon', src: item.CdnUrl || '', alt: '' }),
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
