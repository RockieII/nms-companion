// Data layer — the single source of truth for fetching + caching game data.
// Views must not call fetch directly; they read through the functions below.

const ENDPOINTS = {
  resources: 'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/data/RawMaterials.json',
  products:  'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/data/Products.json',
  refinery:  'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/data/Refinery.json',
};

const STORAGE = {
  resources: 'nms:resources:v1',
  products:  'nms:products:v1',
  refinery:  'nms:refinery:v1',
  stamp:     'nms:lastRefresh:v1',
  favorites: 'nms:favorites:v1',
};

let inMemory = { resources: null, products: null, refinery: null };
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

async function ensure(key) {
  if (inMemory[key]) return inMemory[key];
  const cached = loadFromStorage(STORAGE[key]);
  if (cached) {
    inMemory[key] = cached;
    return cached;
  }
  const data = await fetchJson(ENDPOINTS[key]);
  localStorage.setItem(STORAGE[key], JSON.stringify(data));
  if (!localStorage.getItem(STORAGE.stamp)) {
    localStorage.setItem(STORAGE.stamp, new Date().toISOString());
  }
  inMemory[key] = data;
  return data;
}

export async function getResources() {
  return ensure('resources');
}

export async function getCraftingRecipes() {
  return ensure('products');
}

export async function getRefinerRecipes() {
  return ensure('refinery');
}

export async function refresh() {
  const errors = [];
  for (const key of ['resources', 'products', 'refinery']) {
    try {
      const data = await fetchJson(ENDPOINTS[key]);
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

// Build a lookup from every known Id (raw + product) to its item,
// so we can resolve Inputs/Outputs referenced by Id in recipes.
export async function getItemById(id) {
  if (!idIndex) {
    const [resources, products] = await Promise.all([
      ensure('resources'),
      ensure('products'),
    ]);
    idIndex = {};
    for (const r of resources) idIndex[r.Id] = { ...r, _kind: 'resource' };
    for (const p of products)  idIndex[p.Id] = { ...p, _kind: 'product' };
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
  return idx < 0; // true = now favorited
}
