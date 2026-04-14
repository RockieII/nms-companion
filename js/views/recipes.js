import { getRefinerRecipes, getCraftingRecipes, getItemById } from '../data.js';
import { buildRow, buildCategorySelect, uniqueGroups, openSheet, debounce, el, norm, imgOrPlaceholder } from './ui.js';

export async function renderRecipes(root) {
  root.innerHTML = '';

  const state = { mode: 'refiner', query: '', group: '' };

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
  const searchBar  = el('div', { class: 'searchbar' }, [searchInput]);
  const filterHost = el('div'); // category select mounts here; rebuilt when mode changes
  const listEl     = el('div', { class: 'list' });

  root.appendChild(subtabs);
  root.appendChild(searchBar);
  root.appendChild(filterHost);
  root.appendChild(listEl);

  async function rebuildFilter() {
    filterHost.innerHTML = '';
    const groups = state.mode === 'refiner'
      ? await refinerOutputGroups()
      : uniqueGroups(await getCraftingRecipes());
    filterHost.appendChild(buildCategorySelect(groups, (value) => {
      state.group = value;
      repaint();
    }, state.group));
  }

  subtabs.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.mode = btn.dataset.sub;
      state.group = '';
      subtabs.querySelectorAll('.subtab').forEach(b =>
        b.classList.toggle('active', b === btn));
      await rebuildFilter();
      repaint();
    });
  });

  const repaint = debounce(async () => {
    listEl.innerHTML = '<div class="spinner"></div>';
    if (state.mode === 'refiner') await paintRefiner(listEl, state.query, state.group);
    else await paintCrafting(listEl, state.query, state.group);
  }, 140);

  searchInput.addEventListener('input', () => {
    state.query = norm(searchInput.value);
    repaint();
  });

  await rebuildFilter();
  repaint();
}

async function refinerOutputGroups() {
  const recipes = await getRefinerRecipes();
  const set = new Set();
  for (const r of recipes) {
    const out = await getItemById(r.Output.Id);
    if (out && out.Group) set.add(out.Group);
  }
  return [...set];
}

async function paintRefiner(listEl, query, group) {
  const recipes = await getRefinerRecipes();

  // Resolve names for searching AND filtering by output group.
  const enriched = [];
  for (const r of recipes) {
    const out = await getItemById(r.Output.Id);
    const ins = await Promise.all(r.Inputs.map(i => getItemById(i.Id)));
    const names = [out?.Name, ...ins.map(i => i?.Name)].filter(Boolean).join(' ').toLowerCase();
    enriched.push({ r, out, ins, names });
  }

  let filtered = enriched;
  if (group) filtered = filtered.filter(e => e.out?.Group === group);
  if (query) filtered = filtered.filter(e => e.names.includes(query));

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
    chips.appendChild(chip(item, r.Inputs[i].Quantity, r.Inputs[i].Id));
  });
  chips.appendChild(el('span', { class: 'recipe-arrow' }, '→'));
  chips.appendChild(chip(out, r.Output.Quantity, r.Output.Id));

  line.appendChild(chips);
  line.appendChild(el('div', { class: 'recipe-meta' },
    `${r.Operation || 'Refine'} · ${r.Time}s`));

  line.addEventListener('click', () => openRefinerSheet(r, out, ins));
  return line;
}

function chip(item, qty, fallbackId) {
  const name = item?.Name || fallbackId;
  return el('span', { class: 'recipe-chip' }, [
    imgOrPlaceholder(item?.CdnUrl),
    document.createTextNode(`${qty}× ${name}`),
  ]);
}

function openRefinerSheet(r, out, ins) {
  openSheet(({ close }) => {
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'sheet-head' }, [
      imgOrPlaceholder(out?.CdnUrl, { class: 'sheet-icon' }),
      el('div', {}, [
        el('h2', { class: 'sheet-title' }, r.Operation || `Refine → ${out?.Name || r.Output.Id}`),
        el('p',  { class: 'sheet-group' }, `Refiner · ${r.Time}s${out?.Group ? ' · ' + out.Group : ''}`),
      ]),
      el('button', { class: 'sheet-close', onclick: close, 'aria-label': 'Close', html: '×' }),
    ]));

    const ingEls = ins.map((item, i) => el('div', { class: 'recipe-line' }, [
      imgOrPlaceholder(item?.CdnUrl, { class: 'row-icon', style: 'width:28px;height:28px;' }),
      document.createTextNode(`${r.Inputs[i].Quantity}× ${item?.Name || r.Inputs[i].Id}`),
    ]));
    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Inputs'),
      ...ingEls,
    ]));

    wrap.appendChild(el('div', { class: 'sheet-section' }, [
      el('h3', {}, 'Output'),
      el('div', { class: 'recipe-line' }, [
        imgOrPlaceholder(out?.CdnUrl, { class: 'row-icon', style: 'width:28px;height:28px;' }),
        document.createTextNode(`${r.Output.Quantity}× ${out?.Name || r.Output.Id}`),
      ]),
    ]));

    return wrap;
  });
}

async function paintCrafting(listEl, query, group) {
  const products = await getCraftingRecipes();
  const craftable = products.filter(p => Array.isArray(p.RequiredItems) && p.RequiredItems.length > 0);

  let filtered = craftable;
  if (group) filtered = filtered.filter(p => p.Group === group);
  if (query) filtered = await filterByIngredientOrName(filtered, query);

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
      imgOrPlaceholder(p.CdnUrl, { class: 'sheet-icon' }),
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
    p.RequiredItems.forEach(async (ing) => {
      const item = await getItemById(ing.Id);
      ingSection.appendChild(el('div', { class: 'recipe-line' }, [
        imgOrPlaceholder(item?.CdnUrl, { class: 'row-icon', style: 'width:28px;height:28px;' }),
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
