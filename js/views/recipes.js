import { getRefinerRecipes, getCraftingRecipes, getItemById } from '../data.js';
import { buildRow, openSheet, debounce, el, norm } from './ui.js';

export async function renderRecipes(root) {
  root.innerHTML = '';

  const state = { mode: 'refiner', query: '' };

  const subtabs = el('div', { class: 'subtabs' }, [
    el('button', { class: 'subtab active', 'data-sub': 'refiner' }, 'Refiner'),
    el('button', { class: 'subtab',         'data-sub': 'crafting' }, 'Crafting'),
  ]);
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Search by ingredient or output…',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const searchBar = el('div', { class: 'searchbar' }, [searchInput]);
  const listEl = el('div', { class: 'list' });

  root.appendChild(subtabs);
  root.appendChild(searchBar);
  root.appendChild(listEl);

  subtabs.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.sub;
      subtabs.querySelectorAll('.subtab').forEach(b =>
        b.classList.toggle('active', b === btn));
      repaint();
    });
  });

  const repaint = debounce(async () => {
    listEl.innerHTML = '<div class="spinner"></div>';
    if (state.mode === 'refiner') await paintRefiner(listEl, state.query);
    else await paintCrafting(listEl, state.query);
  }, 140);

  searchInput.addEventListener('input', () => {
    state.query = norm(searchInput.value);
    repaint();
  });

  repaint();
}

async function paintRefiner(listEl, query) {
  const [recipes] = await Promise.all([getRefinerRecipes()]);

  // Pre-resolve names for searching.
  const enriched = [];
  for (const r of recipes) {
    const out = await getItemById(r.Output.Id);
    const ins = await Promise.all(r.Inputs.map(i => getItemById(i.Id)));
    const names = [out?.Name, ...ins.map(i => i?.Name)].filter(Boolean).join(' ').toLowerCase();
    enriched.push({ r, out, ins, names });
  }

  const filtered = query
    ? enriched.filter(e => e.names.includes(query))
    : enriched;

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.appendChild(el('div', { class: 'empty' }, 'No matching refiner recipes.'));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const e of filtered.slice(0, 200)) {
    frag.appendChild(buildRefinerRow(e));
  }
  listEl.appendChild(frag);
  if (filtered.length > 200) {
    listEl.appendChild(el('div', { class: 'empty' },
      `Showing first 200 of ${filtered.length}. Keep typing to narrow.`));
  }
}

function buildRefinerRow({ r, out, ins }) {
  const line = el('button', { class: 'recipe-line tall', type: 'button' });
  const chips = el('div', {
    style: 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;width:100%;',
  });
  ins.forEach((item, i) => {
    if (i > 0) chips.appendChild(el('span', { class: 'recipe-arrow' }, '+'));
    chips.appendChild(chip(item, r.Inputs[i].Quantity));
  });
  chips.appendChild(el('span', { class: 'recipe-arrow' }, '→'));
  chips.appendChild(chip(out, r.Output.Quantity));

  line.appendChild(chips);
  line.appendChild(el('div', { class: 'recipe-meta' },
    `${r.Operation || 'Refine'} · ${r.Time}s`));

  line.addEventListener('click', () => openRefinerSheet(r, out, ins));
  return line;
}

function chip(item, qty) {
  const name = item?.Name || '?';
  return el('span', { class: 'recipe-chip' }, [
    item?.CdnUrl ? el('img', { src: item.CdnUrl, alt: '' }) : el('span', { class: 'row-icon', style: 'width:22px;height:22px;' }),
    document.createTextNode(`${qty}× ${name}`),
  ]);
}

function openRefinerSheet(r, out, ins) {
  openSheet(({ close }) => {
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'sheet-head' }, [
      out?.CdnUrl ? el('img', { class: 'sheet-icon', src: out.CdnUrl, alt: '' }) : el('div', { class: 'sheet-icon' }),
      el('div', {}, [
        el('h2', { class: 'sheet-title' }, r.Operation || `Refine → ${out?.Name || '?'}`),
        el('p',  { class: 'sheet-group' }, `Refiner · ${r.Time}s`),
      ]),
      el('button', { class: 'sheet-close', onclick: close, 'aria-label': 'Close', html: '×' }),
    ]));

    const ingEls = ins.map((item, i) => el('div', { class: 'recipe-line' }, [
      item?.CdnUrl ? el('img', { class: 'row-icon', src: item.CdnUrl, alt: '', style: 'width:28px;height:28px;' }) : el('span'),
      document.createTextNode(`${r.Inputs[i].Quantity}× ${item?.Name || r.Inputs[i].Id}`),
    ]));
    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Inputs'),
      ...ingEls,
    ]));

    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Output'),
      el('div', { class: 'recipe-line' }, [
        out?.CdnUrl ? el('img', { class: 'row-icon', src: out.CdnUrl, alt: '', style: 'width:28px;height:28px;' }) : el('span'),
        document.createTextNode(`${r.Output.Quantity}× ${out?.Name || r.Output.Id}`),
      ]),
    ]));

    return wrap;
  });
}

async function paintCrafting(listEl, query) {
  const products = await getCraftingRecipes();
  // Only products with a recipe (RequiredItems populated) count as "crafting recipes".
  const craftable = products.filter(p => Array.isArray(p.RequiredItems) && p.RequiredItems.length > 0);

  const filtered = query
    ? (await filterByIngredientOrName(craftable, query))
    : craftable;

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.appendChild(el('div', { class: 'empty' }, 'No matching crafting recipes.'));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const p of filtered.slice(0, 200)) {
    const count = p.RequiredItems.length;
    frag.appendChild(buildRow({
      item: p,
      kind: 'product',
      subtitle: `${p.Group} · ${count} ingredient${count === 1 ? '' : 's'}`,
      onOpen: () => openCraftingSheet(p),
    }));
  }
  listEl.appendChild(frag);
  if (filtered.length > 200) {
    listEl.appendChild(el('div', { class: 'empty' },
      `Showing first 200 of ${filtered.length}. Keep typing to narrow.`));
  }
}

async function filterByIngredientOrName(products, query) {
  const out = [];
  for (const p of products) {
    if (norm(p.Name).includes(query) || norm(p.Group).includes(query)) {
      out.push(p);
      continue;
    }
    for (const ing of p.RequiredItems) {
      const item = await getItemById(ing.Id);
      if (item && norm(item.Name).includes(query)) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}

function openCraftingSheet(p) {
  openSheet(({ close }) => {
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'sheet-head' }, [
      p.CdnUrl ? el('img', { class: 'sheet-icon', src: p.CdnUrl, alt: '' }) : el('div', { class: 'sheet-icon' }),
      el('div', {}, [
        el('h2', { class: 'sheet-title' }, p.Name),
        el('p',  { class: 'sheet-group' }, p.Group || ''),
      ]),
      el('button', { class: 'sheet-close', onclick: close, 'aria-label': 'Close', html: '×' }),
    ]));

    if (p.Description) {
      wrap.appendChild(el('div', { class: 'sheet-section' }, [
        el('h3', {}, 'Description'),
        el('div', { class: 'sheet-desc' }, p.Description),
      ]));
    }

    const ingSection = el('div', { class: 'sheet-section' }, [el('h3', {}, 'Ingredients')]);
    wrap.appendChild(ingSection);
    // Resolve names async; render placeholders immediately.
    p.RequiredItems.forEach(async (ing) => {
      const item = await getItemById(ing.Id);
      ingSection.appendChild(el('div', { class: 'recipe-line' }, [
        item?.CdnUrl ? el('img', { class: 'row-icon', src: item.CdnUrl, alt: '', style: 'width:28px;height:28px;' }) : el('span'),
        document.createTextNode(`${ing.Quantity}× ${item?.Name || ing.Id}`),
      ]));
    });

    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Stats'),
      el('div', { class: 'stat-grid' }, [
        el('div', {}, [el('span', {}, 'Value: '), document.createTextNode(`${p.BaseValueUnits || 0} u`)]),
        el('div', {}, [el('span', {}, 'Stack: '), document.createTextNode(`${p.MaxStackSize || '—'}`)]),
        el('div', {}, [el('span', {}, 'ID: '),    document.createTextNode(p.Id)]),
      ]),
    ]));

    return wrap;
  });
}
