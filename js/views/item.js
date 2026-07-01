// Item profile page — full-screen view for a single item or refiner recipe.

import {
  getItemById,
  getRecipesUsing,
  getRecipesProducing,
  getObtainable,
  isFavorite,
  toggleFavorite,
  pushRecent,
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
  if (item._kind === 'refiner' || item._kind === 'cooking') {
    await renderRecipeProfile(root, item, item._kind);
  } else {
    pushRecent(item.Id); // track real items for the Home hub
    await renderRegularProfile(root, item);
  }
}

async function renderRegularProfile(root, item) {
  root.innerHTML = '';

  // Favorites are namespaced by the item's _kind (plural: 'resources',
  // 'products', 'technology', …) so every item type can be favorited.
  const favKind = item._kind;
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

  // "Cost to craft" — only for items something actually produces.
  const producedByAny = await getRecipesProducing(item.Id);
  if (producedByAny.length > 0) {
    root.appendChild(el('a', {
      class: 'btn calc-cta',
      href: `#calc?target=${encodeURIComponent(item.Id)}`,
    }, 'Cost to craft ›'));
  }

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

  // Made by — refiner + cooking recipes that produce this item.
  const producedBy = await getRecipesProducing(item.Id);
  const madeByRows = [
    aggregate(producedBy, 'refiner', 'Refiner recipes', `#recipes?mode=refiner&produces=${encodeURIComponent(item.Id)}`),
    aggregate(producedBy, 'cooking', 'Cooking recipes', `#recipes?mode=cooking&produces=${encodeURIComponent(item.Id)}`),
  ].filter(Boolean);
  if (madeByRows.length > 0) {
    const body = document.createDocumentFragment();
    madeByRows.forEach(r => body.appendChild(r));
    root.appendChild(section({ title: 'Made by' }, body));
  }

  // Used in — refiner + crafting + cooking recipes that consume this item.
  const usedIn = await getRecipesUsing(item.Id);
  const usedRows = [
    aggregate(usedIn, 'refiner', 'Refiner recipes', `#recipes?mode=refiner&uses=${encodeURIComponent(item.Id)}`),
    aggregate(usedIn, 'product', 'Crafting recipes', `#recipes?mode=crafting&uses=${encodeURIComponent(item.Id)}`),
    aggregate(usedIn, 'cooking', 'Cooking recipes', `#recipes?mode=cooking&uses=${encodeURIComponent(item.Id)}`),
  ].filter(Boolean);
  if (usedRows.length > 0) {
    const body = document.createDocumentFragment();
    usedRows.forEach(r => body.appendChild(r));
    root.appendChild(section({ title: 'Used in' }, body));
  }
}

// Build one aggregate row for recipes of a given type, or null if none.
function aggregate(entries, type, label, href) {
  const count = entries.filter(e => e.type === type).length;
  return count > 0 ? aggregateRow({ label, count, href }) : null;
}

async function renderRecipeProfile(root, recipe, kind = 'refiner') {
  root.innerHTML = '';
  const out = await getItemById(recipe.Output?.Id);
  const ins = await Promise.all((recipe.Inputs || []).map(i => getItemById(i.Id)));
  const kindLabel = kind === 'cooking' ? 'Cooking recipe' : 'Refiner recipe';
  const fallbackTitle = kind === 'cooking' ? `Cook → ${out?.Name || recipe.Output?.Id}` : `Refine → ${out?.Name || recipe.Output?.Id}`;

  root.appendChild(el('div', { class: 'profile-head' }, [
    imgOrPlaceholder(out, { class: 'profile-icon' }),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, recipe.Operation || fallbackTitle),
      el('p', { class: 'profile-group' }, `${kindLabel} · ${recipe.Time}s`),
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
