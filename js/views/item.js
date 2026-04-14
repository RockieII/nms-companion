// Item profile page — renders a full-screen view for a single item id.
// Handles both "item" ids (raw/prod/conTech/tech/cur/other/trade) and
// refiner recipe ids (ref*).

import {
  getItemById,
  getRecipesUsing,
  getRecipesProducing,
  isFavorite,
  toggleFavorite,
} from '../data.js';
import { imgOrPlaceholder, buildRow, el } from './ui.js';

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

  // Header
  const favKind = item._kind === 'resource' ? 'resource' : 'product';
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
    root.appendChild(section('Description',
      el('div', { class: 'sheet-desc' }, item.Description)
    ));
  }

  root.appendChild(section('Stats',
    el('div', { class: 'stat-grid' }, [
      item.Abbrev && statLine('Symbol', item.Abbrev),
      statLine('Value', `${item.BaseValueUnits || 0} ${item.CurrencyType === 'Nanites' ? 'nanites' : 'u'}`),
      statLine('Stack', `${item.MaxStackSize || '—'}`),
      statLine('ID', item.Id),
    ].filter(Boolean))
  ));

  // Made by — forward recipes whose output is this item
  const producedBy = await getRecipesProducing(item.Id);
  if (producedBy.length > 0) {
    const madeBySection = section('Made by', document.createDocumentFragment());
    root.appendChild(madeBySection);
    const body = madeBySection.querySelector('.section-body');
    for (const entry of producedBy) {
      body.appendChild(await recipeRow(entry));
    }
  }

  // Used in — reverse lookup
  const usedIn = await getRecipesUsing(item.Id);
  if (usedIn.length > 0) {
    const usedSection = section(`Used in (${usedIn.length})`, document.createDocumentFragment());
    root.appendChild(usedSection);
    const body = usedSection.querySelector('.section-body');
    for (const entry of usedIn) {
      body.appendChild(await recipeRow(entry));
    }
  }

  if (producedBy.length === 0 && usedIn.length === 0) {
    root.appendChild(el('div', { class: 'empty' }, 'Not referenced by any recipe.'));
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
  root.appendChild(section('Inputs', inputsBody));

  root.appendChild(section('Output',
    ingredientRow(out, recipe.Output?.Quantity, recipe.Output?.Id)
  ));

  root.appendChild(section('Details',
    el('div', { class: 'stat-grid' }, [
      statLine('Operation', recipe.Operation || '—'),
      statLine('Time', `${recipe.Time}s`),
      statLine('ID', recipe.Id),
    ])
  ));
}

// --- helpers ---

function section(title, body) {
  const s = el('div', { class: 'profile-section' }, [
    el('h3', { class: 'profile-section-title' }, title),
    el('div', { class: 'section-body' }),
  ]);
  const bodyEl = s.querySelector('.section-body');
  if (body instanceof Node) bodyEl.appendChild(body);
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
  const row = el('a', {
    class: 'row',
    href: `#item/${id}`,
  }, [
    imgOrPlaceholder(item || { Name: fallbackId }, { class: 'row-icon' }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, `${qty}× ${item?.Name || fallbackId}`),
      el('div', { class: 'row-sub' }, item?.Group || ''),
    ]),
    el('span', { class: 'row-chevron', html: '›' }),
  ]);
  return row;
}

async function recipeRow(entry) {
  const { type, recipe } = entry;
  if (type === 'refiner') {
    const out = await getItemById(recipe.Output?.Id);
    const inputs = await Promise.all((recipe.Inputs || []).map(i => getItemById(i.Id)));
    const parts = inputs.map((it, i) => `${recipe.Inputs[i].Quantity}× ${it?.Name || recipe.Inputs[i].Id}`).join(' + ');
    const row = el('a', {
      class: 'row',
      href: `#item/${recipe.Id}`,
    }, [
      imgOrPlaceholder(out, { class: 'row-icon' }),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, `${recipe.Output?.Quantity || 1}× ${out?.Name || recipe.Output?.Id}`),
        el('div', { class: 'row-sub' }, `Refiner · ${parts}`),
      ]),
      el('span', { class: 'row-chevron', html: '›' }),
    ]);
    return row;
  }
  // product crafting recipe
  const p = recipe;
  const ings = (p.RequiredItems || []).length;
  return el('a', {
    class: 'row',
    href: `#item/${p.Id}`,
  }, [
    imgOrPlaceholder(p, { class: 'row-icon' }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, p.Name),
      el('div', { class: 'row-sub' }, `Crafting · ${ings} ingredient${ings === 1 ? '' : 's'}`),
    ]),
    el('span', { class: 'row-chevron', html: '›' }),
  ]);
}
