// Item profile page — full-screen view for a single item or refiner recipe.

import {
  getItemById,
  getRecipesUsing,
  getRecipesProducing,
  isFavorite,
  toggleFavorite,
} from '../data.js';
import { imgOrPlaceholder, el } from './ui.js';

// Group-based hint for "Obtainable" — maps the in-game category to where
// players usually find that material. Manual map, keyed by exact Group.
const OBTAIN_HINTS = {
  'Unrefined Organic Element':        ['Trees, plants, and vegetation (Mining Laser)'],
  'Refined Organic Element':          ['Refining unrefined organic elements'],
  'Concentrated Liquid Fuel':         ['Refining organic materials'],
  'High Energy Substance':            ['Crystal formations, asteroids, deep caves'],
  'Neutron-Rich Fuel Element':        ['Cave-dwelling deposits, nuclear formations'],
  'Metallic Mineral Extract':         ['Surface minerals (mineral extractors, mining)'],
  'Processed Metallic Minerals':      ['Refining raw metallic minerals'],
  'Charged Metallic Element':         ['Rare metallic deposits in exotic biomes'],
  'Abundant Mineral':                 ['Common ground deposits on most planets'],
  'Unrefined Catalytic Element':      ['Dense crystalline deposits (caves, rock formations)'],
  'Refined Catalytic Element':        ['Refining catalytic elements'],
  'Subterranean Mineral':             ['Underground deposits (caves)'],
  'Processed Subterranean Mineral':   ['Refining subterranean minerals'],
  'Aquatic Mineral Extract':          ['Ocean-floor deposits (underwater planets)'],
  'Processed Aquatic Mineral':        ['Refining aquatic minerals'],
  'Organic Compound':                 ['Refining organic materials'],
  'Refined Stellar Metal: Yellow':    ['Yellow-star systems, refining'],
  'Refined Stellar Metal: Red':       ['Red-star systems, refining'],
  'Refined Stellar Metal: Green':     ['Green-star systems, refining'],
  'Refined Stellar Metal: Blue':      ['Blue-star systems, refining'],
  'Refined Stellar Metal: Purple':    ['Purple-star systems (unlocked late-game)'],
  'Highly Refined Stellar Metal':     ['Advanced refining of stellar metals'],
  'Localised Earth Element':          ['Surface deposits tied to specific biomes'],
  'Harvested Substance':              ['Harvested from fauna'],
  'Anomalous Material':               ['Anomalies, rare encounters'],
  'Valuable Asteroid Mineral':        ['Asteroid fields (ship-mounted lasers)'],
  'Compressed Atmospheric Gas':       ['Atmosphere Harvester (specific biomes)'],
  'Harvested Agricultural Substance': ['Farmed plants, hydroponic growing'],
  'Junk':                             ['Salvaged debris, crashed freighters, old ruins'],
  'Technological Currency':           ['Nanite Clusters from scrapping, missions'],
  'Salvaged Scrap':                   ['Scrapping old technology, dismantling'],
  'Ashes of Despair':                 ['Twisted worlds (Atlas content)'],
  'Decayed Spacetime Remnant':        ['Dissonant planets, abandoned systems'],
  'Recessive Creature Genes':         ['Selective breeding, creature companions'],
  'Disharmonic Metal':                ['Sentinel worlds (harvesting Sentinels)'],
  'Essence of Atlantid':              ['Atlantid storms, lightning strikes'],
  'Soul Fragment':                    ['Twisted worlds / Atlas rewards'],
  'Recycled Minerals':                ['Recycling scrap at a Refinery'],
};

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

  // Obtainable — Group-based hint.
  const hints = OBTAIN_HINTS[item.Group];
  if (hints && item._kind === 'resource') {
    root.appendChild(section({ title: 'Obtainable from' },
      el('ul', { class: 'obtain-list' }, hints.map(h => el('li', {}, h)))
    ));
  }

  root.appendChild(section({ title: 'Stats' },
    el('div', { class: 'stat-grid' }, [
      item.Abbrev && statLine('Symbol', item.Abbrev),
      statLine('Value', `${item.BaseValueUnits || 0} ${item.CurrencyType === 'Nanites' ? 'nanites' : 'u'}`),
      statLine('Stack', `${item.MaxStackSize || '—'}`),
      statLine('ID', item.Id),
    ].filter(Boolean))
  ));

  // Made by — refiner-only aggregation (the product's own crafting recipe
  // is already displayed above as "Crafting recipe").
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

  // Used in — aggregated by type; collapsible because this list can be huge.
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
    root.appendChild(section({
      title: `Used in (${usedRefiner.length + usedCrafting.length})`,
      collapsible: true,
      defaultOpen: false,
    }, body));
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
