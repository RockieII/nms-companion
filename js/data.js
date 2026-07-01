// Data layer — the single source of truth for fetching + caching game data.
// Views must not call fetch directly; they read through the functions below.

// Upstream community dataset. NOTE: bradhave94/nms moved its JSON from
// `src/data` to `src/datav2` (~Apr 2026); the old path 404s. Keep this pinned
// at datav2. If items ever stop loading, re-check the repo's data folder path.
const BASE = 'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/datav2';

const ENDPOINTS = {
  resources:   `${BASE}/RawMaterials.json`,
  products:    `${BASE}/Products.json`,
  refinery:    `${BASE}/Refinery.json`,
  nutrient:    `${BASE}/NutrientProcessor.json`,
  conTech:     `${BASE}/ConstructedTechnology.json`,
  technology:  `${BASE}/Technology.json`,
  curiosities: `${BASE}/Curiosities.json`,
  others:      `${BASE}/Others.json`,
  trade:       `${BASE}/Trade.json`,
  upgrades:    `${BASE}/Upgrades.json`,
  techModule:  `${BASE}/TechnologyModule.json`,
  buildings:   `${BASE}/Buildings.json`,
  food:        `${BASE}/Food.json`,
  fish:        `${BASE}/Fish.json`,
  starships:   `${BASE}/Starships.json`,
  exocraft:    `${BASE}/Exocraft.json`,
  corvette:    `${BASE}/Corvette.json`,
  eggModifiers:`${BASE}/EggModifiers.json`,
};

const UPDATES_URL = './data/updates.json';

// Version suffixes bumped when switching the source to datav2 so existing
// users' stale v1/v2 caches are abandoned and the app refetches from the new
// endpoints on next load. Favorites are intentionally NOT bumped (preserved).
const STORAGE = {
  resources:   'nms:resources:v3',
  products:    'nms:products:v3',
  refinery:    'nms:refinery:v3',
  nutrient:    'nms:nutrient:v1',
  conTech:     'nms:conTech:v2',
  technology:  'nms:technology:v2',
  curiosities: 'nms:curiosities:v2',
  others:      'nms:others:v2',
  trade:       'nms:trade:v2',
  upgrades:    'nms:upgrades:v1',
  techModule:  'nms:techModule:v1',
  buildings:   'nms:buildings:v1',
  food:        'nms:food:v1',
  fish:        'nms:fish:v1',
  starships:   'nms:starships:v1',
  exocraft:    'nms:exocraft:v1',
  corvette:    'nms:corvette:v1',
  eggModifiers:'nms:eggModifiers:v1',
  updates:     'nms:updates:v1',
  stamp:       'nms:lastRefresh:v3',
  favorites:   'nms:favorites:v1',
};

// Human labels per item kind — used by the Items browser type filter and the
// Favorites groupings. Keys match LOOKUP_KEYS.
export const KIND_LABELS = {
  resources:   'Raw Materials',
  products:    'Products',
  trade:       'Trade',
  technology:  'Technology',
  conTech:     'Constructed Tech',
  upgrades:    'Upgrades',
  techModule:  'Tech Modules',
  buildings:   'Buildings',
  food:        'Food',
  fish:        'Fish',
  starships:   'Starships',
  exocraft:    'Exocraft',
  corvette:    'Corvette',
  others:      'Other',
  curiosities: 'Curiosities',
  eggModifiers:'Egg Modifiers',
};

// Every item file, in browse order. Used to resolve recipe ingredient IDs
// (getItemById), for the global Items list, and as the union of all kinds.
const LOOKUP_KEYS = [
  'resources', 'products', 'trade',
  'technology', 'conTech', 'upgrades', 'techModule',
  'buildings', 'food', 'fish',
  'starships', 'exocraft', 'corvette',
  'others', 'curiosities', 'eggModifiers',
];

// Level-1 browse grid → level-2 kinds. Drives the Items category grid and the
// scoped list's type chips. `icon` maps to an inline SVG in the items view.
export const SUPER_CATEGORIES = [
  { id: 'materials', label: 'Materials',  icon: 'materials', kinds: ['resources', 'products', 'trade'] },
  { id: 'tech',      label: 'Technology', icon: 'tech',      kinds: ['technology', 'conTech', 'upgrades', 'techModule'] },
  { id: 'building',  label: 'Building',   icon: 'building',  kinds: ['buildings'] },
  { id: 'cooking',   label: 'Cooking',    icon: 'cooking',   kinds: ['food', 'fish'] },
  { id: 'vehicles',  label: 'Vehicles',   icon: 'vehicles',  kinds: ['starships', 'exocraft', 'corvette'] },
  { id: 'other',     label: 'Other',      icon: 'other',     kinds: ['others', 'curiosities', 'eggModifiers'] },
];

// Raw Material groups that aren't real resources (faction standing, currency tokens).
const RESOURCE_EXCLUDED_GROUPS = new Set(['Reward Item']);

const inMemory = {};
let idIndex = null;
let recipesByInput = null;   // id -> [{type:'refiner'|'cooking'|'product', recipe}]
let recipesByOutput = null;  // id -> [{type, recipe}]

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// For any item that has an Icon but no CdnUrl, build the CDN url from Icon.
// (Technology.json and Others.json don't ship CdnUrl; the asset is still on cdn.nmsassistant.com.)
const CDN_BASE = 'https://cdn.nmsassistant.com';

// Obtainable — source definitions + per-group and per-item mappings. Drives
// the "Obtainable from" section on raw-material profiles and the #source/<id>
// detail page. Hand-curated in data/obtainable.json.
let obtainable = null;
async function getObtainableData() {
  if (obtainable !== null) return obtainable;
  try {
    const res = await fetch('./data/obtainable.json', { cache: 'no-cache' });
    obtainable = res.ok ? await res.json() : { sources: {}, byGroup: {}, byItem: {} };
  } catch {
    obtainable = { sources: {}, byGroup: {}, byItem: {} };
  }
  return obtainable;
}

// Each entry is { sourceId, note? }. byItem wins when present, otherwise we
// fall back to the group-level mapping. Notes are surfaced in the Obtainable
// row subtitle and on the source detail page to explain how THIS item works
// within the generic source mechanic.
export async function getObtainable(itemId, group) {
  const data = await getObtainableData();
  const entries = data.byItem?.[itemId] || data.byGroup?.[group] || [];
  return entries
    .map(entry => {
      // Tolerate both legacy string ids and new { sourceId, note } objects.
      const sourceId = typeof entry === 'string' ? entry : entry?.sourceId;
      const note     = typeof entry === 'string' ? null  : (entry?.note || null);
      const src = data.sources?.[sourceId];
      if (!src) return null;
      return { id: sourceId, ...src, note };
    })
    .filter(Boolean);
}

// Return the generic source definition; caller passes itemId separately when
// they want to surface the per-item note on the source detail page.
export async function getSource(sourceId) {
  const data = await getObtainableData();
  const s = data.sources?.[sourceId];
  return s ? { id: sourceId, ...s } : null;
}

export async function getSourceNoteForItem(sourceId, itemId) {
  if (!itemId) return null;
  const data = await getObtainableData();
  const entries = data.byItem?.[itemId] || [];
  const entry = entries.find(e => (typeof e === 'string' ? e : e?.sourceId) === sourceId);
  return entry && typeof entry === 'object' ? (entry.note || null) : null;
}

// Icon overrides — Fandom-hosted URLs for items whose AssistantNMS CDN icon
// is missing or 404. Generated by scripts/sync-icons.mjs on GitHub Actions.
let iconOverrides = null;
async function getIconOverrides() {
  if (iconOverrides !== null) return iconOverrides;
  try {
    const res = await fetch('./data/icon-overrides.json', { cache: 'no-cache' });
    iconOverrides = res.ok ? await res.json() : {};
  } catch {
    iconOverrides = {};
  }
  return iconOverrides;
}

function normalizeItems(list, overrides = {}) {
  if (!Array.isArray(list)) return list;
  for (const it of list) {
    if (!it.CdnUrl && it.Icon) it.CdnUrl = `${CDN_BASE}/${it.Icon}`;
    if (overrides[it.Id]) it.CdnUrl = overrides[it.Id];
    // datav2 renamed the abbreviation field Abbrev -> Symbol. Keep Abbrev
    // populated so search + the profile "Symbol" stat keep working.
    if (!it.Abbrev && it.Symbol) it.Abbrev = it.Symbol;
  }
  return list;
}

// Only the fields the app reads. Caching the full datav2 files for all ~15 data
// sources is ~10.5MB (over the ~5MB localStorage quota); slimming to these keeps
// it ~2.5MB. Covers both items and recipe files (Inputs/Output/Time/Operation).
const SLIM_FIELDS = ['Id', 'Name', 'Group', 'CdnUrl', 'Icon', 'Symbol', 'Abbrev', 'Colour',
  'BaseValueUnits', 'CurrencyType', 'MaxStackSize', 'Description', 'RequiredItems',
  'Inputs', 'Output', 'Time', 'Operation'];
function slim(list) {
  if (!Array.isArray(list)) return list;
  return list.map(o => {
    const n = {};
    for (const k of SLIM_FIELDS) if (o[k] !== undefined) n[k] = o[k];
    return n;
  });
}

// Quota-safe write. On QuotaExceededError (or private mode) we keep the data in
// memory for the session and just skip persisting it.
function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('nms: cache write skipped for', key, e?.name || e);
    return false;
  }
}

function stampNow() {
  try {
    if (!localStorage.getItem(STORAGE.stamp)) {
      localStorage.setItem(STORAGE.stamp, new Date().toISOString());
    }
  } catch { /* ignore */ }
}

async function ensure(key) {
  if (inMemory[key]) return inMemory[key];
  const overrides = await getIconOverrides();
  const cached = loadFromStorage(STORAGE[key]);
  if (cached) {
    inMemory[key] = normalizeItems(cached, overrides);
    return inMemory[key];
  }
  const data = normalizeItems(await fetchJson(ENDPOINTS[key]), overrides);
  persist(STORAGE[key], slim(data));
  stampNow();
  inMemory[key] = data;
  return data;
}

export async function getResources() {
  const all = await ensure('resources');
  return all.filter(r => !RESOURCE_EXCLUDED_GROUPS.has(r.Group));
}

// Merge several item kinds into one `_kind`-tagged, deduped list. The
// currency/standing "Reward Item" raw-material group is filtered out. Recipes
// are NOT items — they live in the Recipes tab.
function mergeKinds(kinds, lists) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    for (const item of lists[i]) {
      if (kind === 'resources' && RESOURCE_EXCLUDED_GROUPS.has(item.Group)) continue;
      if (seen.has(item.Id)) continue;
      seen.add(item.Id);
      out.push({ ...item, _kind: kind });
    }
  }
  return out;
}

// Items for a subset of kinds — used by the Items category grid so opening a
// super-category loads only its files (not all ~15).
export async function getItemsForKinds(kinds) {
  const lists = await Promise.all(kinds.map(k => ensure(k)));
  return mergeKinds(kinds, lists);
}

// Every browsable item across all data files. Loads everything, so it's only
// used by the global (cross-category) search.
export async function getAllItems() {
  return getItemsForKinds(LOOKUP_KEYS);
}

export async function getCraftingRecipes() {
  return ensure('products');
}

export async function getRefinerRecipes() {
  return ensure('refinery');
}

export async function getCookingRecipes() {
  return ensure('nutrient');
}

export async function refresh() {
  const errors = [];
  iconOverrides = null; // force re-read of overrides file
  const overrides = await getIconOverrides();
  for (const key of Object.keys(ENDPOINTS)) {
    try {
      const data = normalizeItems(await fetchJson(ENDPOINTS[key]), overrides);
      persist(STORAGE[key], slim(data));
      inMemory[key] = data;
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  }
  idIndex = null;
  recipesByInput = null;
  recipesByOutput = null;
  try {
    const upd = await fetchJson(UPDATES_URL);
    persist(STORAGE.updates, upd);
    inMemory.updates = upd;
  } catch (e) {
    errors.push({ key: 'updates', message: e.message });
  }
  const timestamp = new Date().toISOString();
  if (errors.length === 0) {
    try { localStorage.setItem(STORAGE.stamp, timestamp); } catch { /* ignore */ }
  }
  return { ok: errors.length === 0, timestamp, errors };
}

export function lastRefreshedAt() {
  return localStorage.getItem(STORAGE.stamp);
}

// Cached item counts for the Settings screen. Reads the current STORAGE keys so
// it can't drift out of sync with the version suffixes above.
export function getCacheStats() {
  const count = key => {
    const v = loadFromStorage(key);
    return Array.isArray(v) ? v.length : 0;
  };
  const items = LOOKUP_KEYS.reduce((sum, k) => sum + count(STORAGE[k]), 0);
  return {
    items,
    resources: count(STORAGE.resources),
    products:  count(STORAGE.products),
    refinery:  count(STORAGE.refinery),
    nutrient:  count(STORAGE.nutrient),
    updates:   count(STORAGE.updates),
  };
}

// Build a lookup from every known Id to its item, across all 7 data files
// AND the refinery recipes (ref*). Used by profile pages and recipe renderers.
export async function getItemById(id) {
  if (!idIndex) {
    const lists = await Promise.all(LOOKUP_KEYS.map(k => ensure(k)));
    idIndex = {};
    for (let i = 0; i < LOOKUP_KEYS.length; i++) {
      const kind = LOOKUP_KEYS[i];
      for (const item of lists[i]) {
        idIndex[item.Id] = { ...item, _kind: kind };
      }
    }
    const [refinery, nutrient] = await Promise.all([ensure('refinery'), ensure('nutrient')]);
    for (const r of refinery) idIndex[r.Id] = { ...r, _kind: 'refiner' };
    for (const r of nutrient) idIndex[r.Id] = { ...r, _kind: 'cooking' };
  }
  return idIndex[id] || null;
}

// Build reverse indexes so we can answer "what recipes use X?" and
// "what recipes produce X?" on a profile page.
async function ensureRecipeIndexes() {
  if (recipesByInput && recipesByOutput) return;
  const [refinery, nutrient, products] = await Promise.all([
    ensure('refinery'),
    ensure('nutrient'),
    ensure('products'),
  ]);
  recipesByInput = {};
  recipesByOutput = {};
  for (const [recipes, type] of [[refinery, 'refiner'], [nutrient, 'cooking']]) {
    for (const r of recipes) {
      for (const inp of r.Inputs || []) {
        (recipesByInput[inp.Id] ||= []).push({ type, recipe: r });
      }
      if (r.Output?.Id) {
        (recipesByOutput[r.Output.Id] ||= []).push({ type, recipe: r });
      }
    }
  }
  for (const p of products) {
    if (!Array.isArray(p.RequiredItems) || p.RequiredItems.length === 0) continue;
    for (const ing of p.RequiredItems) {
      (recipesByInput[ing.Id] ||= []).push({ type: 'product', recipe: p });
    }
    // A product "produces itself" — clicking a raw mat wouldn't match here,
    // but clicking a product's Made-by shows its own crafting recipe.
    (recipesByOutput[p.Id] ||= []).push({ type: 'product', recipe: p });
  }
}

export async function getRecipesUsing(id) {
  await ensureRecipeIndexes();
  return recipesByInput[id] || [];
}

export async function getRecipesProducing(id) {
  await ensureRecipeIndexes();
  return recipesByOutput[id] || [];
}

// Steam updates — loaded from the static data/updates.json committed by
// the sync-updates GitHub Action. Cache in LocalStorage for offline.
export async function getUpdates() {
  if (inMemory.updates) return inMemory.updates;
  const cached = loadFromStorage(STORAGE.updates);
  if (cached) {
    inMemory.updates = cached;
    return cached;
  }
  try {
    const data = await fetchJson(UPDATES_URL);
    localStorage.setItem(STORAGE.updates, JSON.stringify(data));
    inMemory.updates = data;
    return data;
  } catch {
    return [];
  }
}

// Favorites — stored as [{ type, id }] where `type` is an item _kind
// ('resources' | 'products' | 'technology' | …) or 'refiner'. Not network-dependent.
// Legacy migration: early versions used singular 'resource'/'product'; map them
// to the plural _kind namespace so old favorites keep matching.
const LEGACY_FAV_TYPES = { resource: 'resources', product: 'products' };
function loadFavs() {
  const raw = loadFromStorage(STORAGE.favorites) || [];
  let changed = false;
  const favs = raw.map(f => {
    const mapped = LEGACY_FAV_TYPES[f.type];
    if (mapped) { changed = true; return { ...f, type: mapped }; }
    return f;
  });
  if (changed) saveFavs(favs);
  return favs;
}
function saveFavs(favs) {
  localStorage.setItem(STORAGE.favorites, JSON.stringify(favs));
}

export function listFavorites() {
  return loadFavs();
}

export function isFavorite(type, id) {
  return loadFavs().some(f => f.type === type && f.id === id);
}

export function toggleFavorite(type, id) {
  const favs = loadFavs();
  const idx = favs.findIndex(f => f.type === type && f.id === id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push({ type, id });
  saveFavs(favs);
  return idx < 0;
}
