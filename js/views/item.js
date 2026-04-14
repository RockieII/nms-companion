// Item profile page — full-screen view for a single item or refiner recipe.

import {
  getItemById,
  getRecipesUsing,
  getRecipesProducing,
  getObtainable,
  isFavorite,
  toggleFavorite,
} from '../data.js';
import { imgOrPlaceholder, el } from './ui.js';

export async function renderItem(root, id) {
  root.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const item = await getItemById(id);
  if (!item) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'empty' }, [
      'Item not found.',
      el('small', {}, `No record for id "${id}".`),
    ]));
    return;
  }
  if (item._kind === 'refiner') {
    await renderRefinerProfile(root, item);
  } else {
    await renderRegularProfile(root, item);
  }
}

async function renderRegularProfile(root, item) {
  root.innerHTML = '';

  // _kind comes from data.js LOOKUP_KEYS (plural: 'resources', 'products', …).
  // Favorites use the singular namespace ('resource', 'product').
  const favKind = item._kind === 'resources' ? 'resource' : 'product';
  const starred = isFavorite(favKind, item.Id);
  const star = el('button', {
    class: 'profile-star' + (starred ? ' on' : ''),
    'aria-label': starred ? 'Unfavorite' : 'Favorite',
    html: starred ? '★' : '☆',
  });
  star.addEventListener('click', () => {
    const nowOn = toggleFavorite(favKind, item.Id);
    star.classList.toggle('on', nowOn);
    star.innerHTML = nowOn ? '★' : '☆';
    window.dispatchEvent(new CustomEvent('nms:favorites-changed'));
  });

  root.appendChild(el('div', { class: 'profile-head' }, [
    imgOrPlaceholder(item, { class: 'profile-icon' }),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, item.Name || item.Id),
      el('p', { class: 'profile-group' }, item.Group || ''),
    ]),
    star,
  ]));

  if (item.Description) {
    root.appendChild(section({ title: 'Description' },
      el('div', { class: 'sheet-desc' }, item.Description)
    ));
  }

  // Products that have their own crafting recipe: show ingredients inline
  // (this IS the "made by" for crafting — no need to repeat it as a link).
  if (Array.isArray(item.RequiredItems) && item.RequiredItems.length > 0) {
    const ingBody = document.createDocumentFragment();
    for (const ing of item.RequiredItems) {
      const ingItem = await getItemById(ing.Id);
      ingBody.appendChild(ingredientRow(ingItem, ing.Quantity, ing.Id));
    }
    root.appendChild(section({ title: 'Crafting recipe' }, ingBody));
  }

  root.appendChild(section({ title: 'Stats' },
    el('div', { class: 'stat-grid' }, [
      item.Abbrev && statLine('Symbol', item.Abbrev),
      statLine('Value', `${item.BaseValueUnits || 0} ${item.CurrencyType === 'Nanites' ? 'nanites' : 'u'}`),
      statLine('Stack', `${item.MaxStackSize || '—'}`),
      statLine('ID', item.Id),
    ].filter(Boolean))
  ));

  // Obtainable — below Stats. Each source is a tappable row that opens a
  // detail page explaining that source in depth (with item-specific note if any).
  if (item._kind === 'resources') {
    const sources = await getObtainable(item.Id, item.Group);
    if (sources.length > 0) {
      const body = document.createDocumentFragment();
      for (const s of sources) body.appendChild(sourceRow(s, item.Id));
      root.appendChild(section({ title: 'Obtainable from' }, body));
    }
  }

  // Made by — refiner-only aggregation.
  const producedBy = await getRecipesProducing(item.Id);
  const producedByRefiner = producedBy.filter(e => e.type === 'refiner');
  if (producedByRefiner.length > 0) {
    root.appendChild(section({ title: 'Made by' },
      aggregateRow({
        label: 'Refiner recipes',
        count: producedByRefiner.length,
        href: `#recipes?mode=refiner&produces=${encodeURIComponent(item.Id)}`,
      })
    ));
  }

  // Used in — aggregated by type. Max two rows, so no collapsible.
  const usedIn = await getRecipesUsing(item.Id);
  const usedRefiner = usedIn.filter(e => e.type === 'refiner');
  const usedCrafting = usedIn.filter(e => e.type === 'product');
  if (usedRefiner.length + usedCrafting.length > 0) {
    const body = document.createDocumentFragment();
    if (usedRefiner.length > 0) body.appendChild(aggregateRow({
      label: 'Refiner recipes',
      count: usedRefiner.length,
      href: `#recipes?mode=refiner&uses=${encodeURIComponent(item.Id)}`,
    }));
    if (usedCrafting.length > 0) body.appendChild(aggregateRow({
      label: 'Crafting recipes',
      count: usedCrafting.length,
      href: `#recipes?mode=crafting&uses=${encodeURIComponent(item.Id)}`,
    }));
    root.appendChild(section({ title: 'Used in' }, body));
  }
}

async function renderRefinerProfile(root, recipe) {
  root.innerHTML = '';
  const out = await getItemById(recipe.Output?.Id);
  const ins = await Promise.all((recipe.Inputs || []).map(i => getItemById(i.Id)));

  root.appendChild(el('div', { class: 'profile-head' }, [
    imgOrPlaceholder(out, { class: 'profile-icon' }),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, recipe.Operation || `Refine → ${out?.Name || recipe.Output?.Id}`),
      el('p', { class: 'profile-group' }, `Refiner recipe · ${recipe.Time}s`),
    ]),
  ]));

  const inputsBody = document.createDocumentFragment();
  ins.forEach((input, i) => {
    inputsBody.appendChild(ingredientRow(input, recipe.Inputs[i].Quantity, recipe.Inputs[i].Id));
  });
  root.appendChild(section({ title: 'Inputs' }, inputsBody));

  root.appendChild(section({ title: 'Output' },
    ingredientRow(out, recipe.Output?.Quantity, recipe.Output?.Id)
  ));

  root.appendChild(section({ title: 'Details' },
    el('div', { class: 'stat-grid' }, [
      statLine('Operation', recipe.Operation || '—'),
      statLine('Time', `${recipe.Time}s`),
      statLine('ID', recipe.Id),
    ])
  ));
}

// --- helpers ---

function section({ title, collapsible = false, defaultOpen = true }, body) {
  const s = el('div', { class: 'profile-section' + (collapsible ? ' collapsible' : '') });
  const header = el('div', { class: 'profile-section-title' }, [
    el('span', {}, title),
    collapsible ? el('span', { class: 'section-chevron' }, defaultOpen ? '▾' : '▸') : null,
  ].filter(Boolean));
  const bodyEl = el('div', { class: 'section-body' });
  if (body instanceof Node) bodyEl.appendChild(body);
  if (collapsible && !defaultOpen) bodyEl.style.display = 'none';
  s.appendChild(header);
  s.appendChild(bodyEl);
  if (collapsible) {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const open = bodyEl.style.display !== 'none';
      bodyEl.style.display = open ? 'none' : '';
      const chevron = header.querySelector('.section-chevron');
      if (chevron) chevron.textContent = open ? '▸' : '▾';
    });
  }
  return s;
}

function statLine(label, value) {
  return el('div', {}, [
    el('span', {}, `${label}: `),
    document.createTextNode(value),
  ]);
}

function ingredientRow(item, qty, fallbackId) {
  const id = item?.Id || fallbackId;
  return el('a', { class: 'row', href: `#item/${encodeURIComponent(id)}` }, [
    imgOrPlaceholder(item || { Name: fallbackId }, { class: 'row-icon' }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, `${qty}× ${item?.Name || fallbackId}`),
      el('div', { class: 'row-sub' }, item?.Group || ''),
    ]),
    el('span', { class: 'row-chevron', html: '›' }),
  ]);
}

// One-line summary row for "Made by" / "Used in" aggregation — links to the
// Recipes tab filtered to recipes that produce or consume this item.
function aggregateRow({ label, count, href }) {
  return el('a', { class: 'row aggregate-row', href }, [
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, label),
      el('div', { class: 'row-sub' }, `${count} recipe${count === 1 ? '' : 's'}`),
    ]),
    el('span', { class: 'row-chevron', html: '›' }),
  ]);
}

// Clickable Obtainable row — opens the source detail page, passing the item
// id as a query so the detail page can show the item-specific note.
function sourceRow(source, itemId) {
  const href = `#source/${encodeURIComponent(source.id)}?item=${encodeURIComponent(itemId)}`;
  // Prefer the item-specific note as the row subtitle, else truncate generic.
  const subtitle = source.note ? truncate(source.note, 90) : truncate(source.detail, 90);
  return el('a', { class: 'row aggregate-row', href }, [
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, source.name),
      el('div', { class: 'row-sub' }, subtitle),
    ]),
    el('span', { class: 'row-chevron', html: '›' }),
  ]);
}

function truncate(s, max) {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
