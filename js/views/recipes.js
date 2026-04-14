import { getRefinerRecipes, getCraftingRecipes, getItemById } from '../data.js';
import { buildRow, buildCategorySelect, uniqueGroups, debounce, el, norm, imgOrPlaceholder } from './ui.js';

export async function renderRecipes(root, params = {}) {
  root.innerHTML = '';

  const state = {
    mode: params.mode === 'crafting' ? 'crafting' : 'refiner',
    query: '',
    group: '',
    produces: params.produces || '',
    uses: params.uses || '',
  };

  // Filter chip (shown when arriving with a ?produces= or ?uses= filter).
  const filterChipHost = el('div');

  async function renderFilterChip() {
    filterChipHost.innerHTML = '';
    if (!state.produces && !state.uses) return;
    const targetId = state.produces || state.uses;
    const target = await getItemById(targetId);
    const label = state.produces
      ? `Produces: ${target?.Name || targetId}`
      : `Uses: ${target?.Name || targetId}`;
    const clearBtn = el('button', { class: 'filter-chip-clear', 'aria-label': 'Clear filter', html: '×' });
    clearBtn.addEventListener('click', () => {
      state.produces = '';
      state.uses = '';
      location.hash = `#recipes${state.mode !== 'refiner' ? '?mode=' + state.mode : ''}`;
    });
    filterChipHost.appendChild(el('div', { class: 'filter-chip' }, [
      el('span', {}, label),
      clearBtn,
    ]));
  }

  const subtabs = el('div', { class: 'subtabs' }, [
    el('button', { class: 'subtab' + (state.mode === 'refiner' ? ' active' : ''), 'data-sub': 'refiner' }, 'Refiner'),
    el('button', { class: 'subtab' + (state.mode === 'crafting' ? ' active' : ''), 'data-sub': 'crafting' }, 'Crafting'),
  ]);
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Search by ingredient or output…',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const searchBar  = el('div', { class: 'searchbar' }, [searchInput]);
  const filterHost = el('div');
  const listEl     = el('div', { class: 'list' });

  root.appendChild(subtabs);
  root.appendChild(searchBar);
  root.appendChild(filterChipHost);
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
      // Clear the produces/uses filter when switching modes (keeps UX simple).
      if ((state.mode === 'refiner' && btn.dataset.sub !== 'refiner') ||
          (state.mode === 'crafting' && btn.dataset.sub !== 'crafting')) {
        state.produces = '';
        state.uses = '';
      }
      subtabs.querySelectorAll('.subtab').forEach(b =>
        b.classList.toggle('active', b === btn));
      await rebuildFilter();
      await renderFilterChip();
      repaint();
    });
  });

  const repaint = debounce(async () => {
    listEl.innerHTML = '<div class="spinner"></div>';
    if (state.mode === 'refiner') await paintRefiner(listEl, state);
    else await paintCrafting(listEl, state);
  }, 140);

  searchInput.addEventListener('input', () => {
    state.query = norm(searchInput.value);
    repaint();
  });

  await rebuildFilter();
  await renderFilterChip();
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

async function paintRefiner(listEl, state) {
  const recipes = await getRefinerRecipes();

  const enriched = [];
  for (const r of recipes) {
    const out = await getItemById(r.Output.Id);
    const ins = await Promise.all(r.Inputs.map(i => getItemById(i.Id)));
    const names = [out?.Name, ...ins.map(i => i?.Name)].filter(Boolean).join(' ').toLowerCase();
    enriched.push({ r, out, ins, names });
  }

  let filtered = enriched;
  if (state.produces) filtered = filtered.filter(e => e.r.Output?.Id === state.produces);
  if (state.uses)     filtered = filtered.filter(e => (e.r.Inputs || []).some(i => i.Id === state.uses));
  if (state.group)    filtered = filtered.filter(e => e.out?.Group === state.group);
  if (state.query)    filtered = filtered.filter(e => e.names.includes(state.query));

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
  const line = el('a', {
    class: 'recipe-line tall',
    href: `#item/${encodeURIComponent(r.Id)}`,
  });
  const chips = el('div', { class: 'recipe-chips' });
  ins.forEach((item, i) => {
    if (i > 0) chips.appendChild(el('span', { class: 'recipe-arrow' }, '+'));
    chips.appendChild(chip(item, r.Inputs[i].Quantity, r.Inputs[i].Id));
  });
  chips.appendChild(el('span', { class: 'recipe-arrow' }, '→'));
  chips.appendChild(chip(out, r.Output.Quantity, r.Output.Id));

  line.appendChild(chips);
  line.appendChild(el('div', { class: 'recipe-meta' },
    `${r.Operation || 'Refine'} · ${r.Time}s`));
  return line;
}

function chip(item, qty, fallbackId) {
  const name = item?.Name || fallbackId;
  return el('span', { class: 'recipe-chip' }, [
    imgOrPlaceholder(item),
    el('span', { class: 'recipe-chip-text' }, `${qty}× ${name}`),
  ]);
}

async function paintCrafting(listEl, state) {
  const products = await getCraftingRecipes();
  let filtered = products.filter(p => Array.isArray(p.RequiredItems) && p.RequiredItems.length > 0);

  if (state.produces) filtered = filtered.filter(p => p.Id === state.produces);
  if (state.uses)     filtered = filtered.filter(p => p.RequiredItems.some(r => r.Id === state.uses));
  if (state.group)    filtered = filtered.filter(p => p.Group === state.group);
  if (state.query)    filtered = await filterByIngredientOrName(filtered, state.query);

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
