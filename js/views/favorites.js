import { listFavorites, getItemById, getRefinerRecipes } from '../data.js';
import { buildRow, el } from './ui.js';

export async function renderFavorites(root) {
  root.innerHTML = '';
  const favs = listFavorites();

  if (favs.length === 0) {
    root.appendChild(el('div', { class: 'empty' }, [
      'No favorites yet.',
      el('small', {}, 'Tap the ☆ on any resource or recipe to save it here.'),
    ]));
    return;
  }

  const groups = {
    resource: el('div', { class: 'list' }),
    product:  el('div', { class: 'list' }),
    refiner:  el('div', { class: 'list' }),
  };

  for (const f of favs) {
    if (f.type === 'refiner') {
      const recipes = await getRefinerRecipes();
      const r = recipes.find(x => x.Id === f.id);
      if (!r) continue;
      const out = await getItemById(r.Output.Id);
      groups.refiner.appendChild(buildRow({
        item: { Id: r.Id, Name: r.Operation || out?.Name || r.Id, CdnUrl: out?.CdnUrl, Colour: out?.Colour, Group: 'Refiner recipe' },
        kind: 'refiner',
        subtitle: `→ ${r.Output.Quantity}× ${out?.Name || '?'}`,
      }));
    } else {
      const item = await getItemById(f.id);
      if (!item) continue;
      groups[f.type].appendChild(buildRow({
        item,
        kind: f.type,
        subtitle: item.Group,
      }));
    }
  }

  const HEADER_STYLE = 'margin:8px 4px;color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:1px;';

  if (groups.resource.children.length) {
    root.appendChild(el('h3', { style: HEADER_STYLE }, 'Resources'));
    root.appendChild(groups.resource);
  }
  if (groups.product.children.length) {
    root.appendChild(el('h3', { style: HEADER_STYLE.replace('8px', '14px') }, 'Crafting'));
    root.appendChild(groups.product);
  }
  if (groups.refiner.children.length) {
    root.appendChild(el('h3', { style: HEADER_STYLE.replace('8px', '14px') }, 'Refiner'));
    root.appendChild(groups.refiner);
  }
}
