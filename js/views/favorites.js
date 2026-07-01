import { listFavorites, getItemById, getRefinerRecipes, KIND_LABELS } from '../data.js';
import { buildRow, el } from './ui.js';

// Order favorites groups appear in. Any type not listed falls to the end.
const GROUP_ORDER = ['resources', 'products', 'technology', 'conTech', 'curiosities', 'trade', 'others', 'refiner'];
const GROUP_LABELS = { ...KIND_LABELS, refiner: 'Refiner recipes' };

export async function renderFavorites(root) {
  root.innerHTML = '';
  const favs = listFavorites();

  if (favs.length === 0) {
    root.appendChild(el('div', { class: 'empty' }, [
      'No favorites yet.',
      el('small', {}, 'Tap the ☆ on any item or recipe to save it here.'),
    ]));
    return;
  }

  const byType = {};
  for (const f of favs) (byType[f.type] ||= []).push(f);

  // Preserve GROUP_ORDER, then append any unknown types.
  const types = [
    ...GROUP_ORDER.filter(t => byType[t]),
    ...Object.keys(byType).filter(t => !GROUP_ORDER.includes(t)),
  ];

  const refinerRecipes = byType.refiner ? await getRefinerRecipes() : [];

  for (const type of types) {
    const listEl = el('div', { class: 'list' });

    for (const f of byType[type]) {
      if (type === 'refiner') {
        const r = refinerRecipes.find(x => x.Id === f.id);
        if (!r) continue;
        const out = await getItemById(r.Output.Id);
        listEl.appendChild(buildRow({
          item: { Id: r.Id, Name: r.Operation || out?.Name || r.Id, CdnUrl: out?.CdnUrl, Colour: out?.Colour, Group: 'Refiner recipe' },
          kind: 'refiner',
          subtitle: `→ ${r.Output.Quantity}× ${out?.Name || '?'}`,
        }));
      } else {
        const item = await getItemById(f.id);
        if (!item) continue;
        listEl.appendChild(buildRow({ item, kind: type, subtitle: item.Group }));
      }
    }

    if (listEl.children.length) {
      root.appendChild(el('h3', { class: 'group-title' }, GROUP_LABELS[type] || type));
      root.appendChild(listEl);
    }
  }
}
