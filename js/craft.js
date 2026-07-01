// Crafting calculator engine — resolves an item to the raw materials you must
// gather, plus the intermediate recipe tree. Reuses the recipe indexes in
// data.js. Cycle-safe: RawMaterials are leaves (you gather them) and a visited
// set guards the 200+ reversible refine pairs, so resolution always terminates.

import { getItemById, getRecipesProducing, getRecipesUsing } from './data.js';

// Normalize a {type, recipe} entry from getRecipesProducing into a uniform shape.
function normalizeRecipe(entry) {
  const { type, recipe } = entry;
  if (type === 'product') {
    return {
      type, label: 'Craft', outId: recipe.Id, outQty: 1,
      inputs: (recipe.RequiredItems || []).map(i => ({ id: i.Id, qty: i.Quantity })),
      recipe,
    };
  }
  return {
    type,
    label: recipe.Operation || (type === 'cooking' ? 'Cook' : 'Refine'),
    outId: recipe.Output?.Id,
    outQty: recipe.Output?.Quantity || 1,
    inputs: (recipe.Inputs || []).map(i => ({ id: i.Id, qty: i.Quantity })),
    recipe,
  };
}

// All ways to produce `id` (normalized, real recipes only). Used for the
// per-node alternate-recipe switch in the UI.
export async function getProducingRecipes(id) {
  const producing = await getRecipesProducing(id);
  return producing.map(normalizeRecipe).filter(r => r.inputs.length > 0);
}

// Default recipe choice: an item's own crafting recipe if it has one (that IS
// "how to make it"), else the refiner recipe with the fewest inputs, else the
// first. `prefs[id]` (an index into getProducingRecipes(id)) overrides.
function chooseRecipe(id, recipes, prefs) {
  const pref = prefs?.[id];
  if (pref != null && recipes[pref]) return recipes[pref];
  const craft = recipes.find(r => r.type === 'product');
  if (craft) return craft;
  const refined = recipes.filter(r => r.type === 'refiner');
  if (refined.length) return refined.slice().sort((a, b) => a.inputs.length - b.inputs.length)[0];
  return recipes[0];
}

// Resolve `targetId` × `qty` into { raws, tree, hadFraction }.
//  - raws: { id: totalQty } of gatherable leaves (RawMaterials / no-recipe items)
//  - tree: nested { id, name, qty, item, leaf?, recipe?, alt, children[] }
//  - hadFraction: true if a multi-yield recipe produced a non-integer step
//    (callers should ceil the displayed raw totals).
export async function resolveCost(targetId, qty = 1, prefs = {}) {
  const raws = {};
  let hadFraction = false;

  async function walk(id, need, seen) {
    const item = await getItemById(id);
    const recipes = (await getProducingRecipes(id));
    const isRaw = item?._kind === 'resources';

    if (isRaw || recipes.length === 0 || seen.has(id)) {
      raws[id] = (raws[id] || 0) + need;
      return { id, name: item?.Name || id, qty: need, item, leaf: true };
    }

    const rec = chooseRecipe(id, recipes, prefs);
    const factor = need / (rec.outQty || 1);
    if (!Number.isInteger(factor)) hadFraction = true;

    const seen2 = new Set(seen);
    seen2.add(id);
    const children = [];
    for (const inp of rec.inputs) {
      children.push(await walk(inp.id, inp.qty * factor, seen2));
    }
    return { id, name: item?.Name || id, qty: need, item, recipe: rec, alt: recipes.length, children };
  }

  const tree = await walk(targetId, qty, new Set());
  return { raws, tree, hadFraction };
}

// Reverse lookup — "what can I make with X?": outputs of every recipe that
// consumes `id`. Returns [{ type, outId, recipe }].
export async function whatCanIMake(id) {
  const using = await getRecipesUsing(id);
  return using.map(({ type, recipe }) => ({
    type,
    outId: type === 'product' ? recipe.Id : recipe.Output?.Id,
    recipe,
  }));
}
