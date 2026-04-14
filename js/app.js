import { renderResources } from './views/resources.js';
import { renderRecipes }   from './views/recipes.js';
import { renderFavorites } from './views/favorites.js';
import { renderSettings }  from './views/settings.js';

const viewRoot = document.getElementById('view');
const tabLabel = document.getElementById('tab-label');
const toastEl  = document.getElementById('toast');

const TABS = {
  resources: { label: 'Resources', render: renderResources },
  recipes:   { label: 'Recipes',   render: renderRecipes },
  favorites: { label: 'Favorites', render: renderFavorites },
  settings:  { label: 'Settings',  render: renderSettings },
};

let currentTab = null;

function activateTab(name) {
  const tab = TABS[name];
  if (!tab) return;
  currentTab = name;
  tabLabel.textContent = tab.label;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  viewRoot.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  Promise.resolve(tab.render(viewRoot)).catch(err => {
    console.error(err);
    viewRoot.innerHTML = `<div class="empty">Failed to load.<small>${err.message}</small></div>`;
  });
  try { history.replaceState({}, '', `#${name}`); } catch {}
}

export function toast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', type === 'error');
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// Wire tab clicks
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// Initial tab — from hash if valid, else resources
const initial = (location.hash || '').replace('#', '');
activateTab(TABS[initial] ? initial : 'resources');

// Re-render current tab when favorites change so the star state stays in sync.
window.addEventListener('nms:favorites-changed', () => {
  if (currentTab === 'favorites') activateTab('favorites');
});

// Register service worker (only on http/https, not file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
