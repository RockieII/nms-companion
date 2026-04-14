// Data layer — the single source of truth for fetching + caching game data.
// Views must not call fetch directly; they read through the functions below.

const BASE = 'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/data';

const ENDPOINTS = {
  resources:   `${BASE}/RawMaterials.json`,
  products:    `${BASE}/Products.json`,
  refinery:    `${BASE}/Refinery.json`,
  conTech:     `${BASE}/ConstructedTechnology.json`,
  technology:  `${BASE}/Technology.json`,
  curiosities: `${BASE}/Curiosities.json`,
  others:      `${BASE}/Others.json`,
  trade:       `${BASE}/Trade.json`,
};

const STORAGE = {
  resources:   'nms:resources:v2',
  products:    'nms:products:v2',
  refinery:    'nms:refinery:v2',
  conTech:     'nms:conTech:v1',
  technology:  'nms:technology:v1',
  curiosities: 'nms:curiosities:v1',
  others:      'nms:others:v1',
  trade:       'nms:trade:v1',
  stamp:       'nms:lastRefresh:v2',
  favorites:   'nms:favorites:v1',
};

// Keys whose data is used to resolve recipe ingredient IDs.
const LOOKUP_KEYS = ['resources', 'products', 'conTech', 'technology', 'curiosities', 'others', 'trade'];

// Raw Material groups that aren't real resources (faction standing, currency tokens).
const RESOURCE_EXCLUDED_GROUPS = new Set(['Reward Item']);

const inMemory = {};
let idIndex = null;

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
function normalizeItems(list) {
  if (!Array.isArray(list)) return list;
  for (const it of list) {
    if (!it.CdnUrl && it.Icon) it.CdnUrl = `${CDN_BASE}/${it.Icon}`;
  }
  return list;
}

async function ensure(key) {
  if (inMemory[key]) return inMemory[key];
  const cached = loadFromStorage(STORAGE[key]);
  if (cached) {
    inMemory[key] = normalizeItems(cached);
    return inMemory[key];
  }
  const data = normalizeItems(await fetchJson(ENDPOINTS[key]));
  localStorage.setItem(STORAGE[key], JSON.stringify(data));
  if (!localStorage.getItem(STORAGE.stamp)) {
    localStorage.setItem(STORAGE.stamp, new Date().toISOString());
  }
  inMemory[key] = data;
  return data;
}

export async function getResources() {
  const all = await ensure('resources');
  return all.filter(r => !RESOURCE_EXCLUDED_GROUPS.has(r.Group));
}

export async function getCraftingRecipes() {
  return ensure('products');
}

export async function getRefinerRecipes() {
  return ensure('refinery');
}

export async function refresh() {
  const errors = [];
  for (const key of Object.keys(ENDPOINTS)) {
    try {
      const data = normalizeItems(await fetchJson(ENDPOINTS[key]));
      localStorage.setItem(STORAGE[key], JSON.stringify(data));
      inMemory[key] = data;
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  }
  idIndex = null;
  const timestamp = new Date().toISOString();
  if (errors.length === 0) {
    localStorage.setItem(STORAGE.stamp, timestamp);
  }
  return { ok: errors.length === 0, timestamp, errors };
}

export function lastRefreshedAt() {
  return localStorage.getItem(STORAGE.stamp);
}

// Build a lookup from every known Id to its item, across all 7 data files.
// Used to resolve Inputs/Outputs referenced by Id in recipes.
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
  }
  return idIndex[id] || null;
}

// Favorites — stored as [{ type, id }]. Not network-dependent.
function loadFavs() {
  return loadFromStorage(STORAGE.favorites) || [];
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
