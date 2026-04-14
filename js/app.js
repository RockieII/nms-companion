import { renderResources } from './views/resources.js';
import { renderRecipes }   from './views/recipes.js';
import { renderUpdates }   from './views/updates.js';
import { renderFavorites } from './views/favorites.js';
import { renderSettings }  from './views/settings.js';
import { renderItem }      from './views/item.js';

const viewRoot = document.getElementById('view');
const tabLabel = document.getElementById('tab-label');
const toastEl  = document.getElementById('toast');
const tabbar   = document.querySelector('.tabbar');
const topbar   = document.querySelector('.topbar');
const backBtn  = document.getElementById('back-btn');

const TABS = {
  resources: { label: 'Resources', render: renderResources },
  recipes:   { label: 'Recipes',   render: renderRecipes },
  updates:   { label: 'Updates',   render: renderUpdates },
  favorites: { label: 'Favorites', render: renderFavorites },
  settings:  { label: 'Settings',  render: renderSettings },
};

let currentRoute = { kind: 'tab', name: 'resources' };
let lastTab = 'resources';

export function navigateToItem(id) {
  location.hash = `#item/${encodeURIComponent(id)}`;
}

// Parse the hash into a route. Supports #<tab> and #item/<id>.
function parseRoute(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return { kind: 'tab', name: 'resources' };
  if (raw.startsWith('item/')) {
    return { kind: 'item', id: decodeURIComponent(raw.slice(5)) };
  }
  if (TABS[raw]) return { kind: 'tab', name: raw };
  return { kind: 'tab', name: 'resources' };
}

function render() {
  const route = parseRoute(location.hash);
  currentRoute = route;

  if (route.kind === 'item') {
    topbar.classList.add('on-profile');
    tabbar.style.display = 'none';
    tabLabel.textContent = '';
    backBtn.hidden = false;
    viewRoot.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
    Promise.resolve(renderItem(viewRoot, route.id)).catch(err => {
      console.error(err);
      viewRoot.innerHTML = `<div class="empty">Failed to load.<small>${err.message}</small></div>`;
    });
    return;
  }

  // tab route
  lastTab = route.name;
  topbar.classList.remove('on-profile');
  tabbar.style.display = '';
  backBtn.hidden = true;
  const tab = TABS[route.name];
  tabLabel.textContent = tab.label;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === route.name);
  });
  viewRoot.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  Promise.resolve(tab.render(viewRoot)).catch(err => {
    console.error(err);
    viewRoot.innerHTML = `<div class="empty">Failed to load.<small>${err.message}</small></div>`;
  });
}

export function toast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', type === 'error');
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    location.hash = `#${btn.dataset.tab}`;
  });
});

backBtn.addEventListener('click', () => {
  if (history.length > 1) {
    history.back();
  } else {
    location.hash = `#${lastTab}`;
  }
});

window.addEventListener('hashchange', render);
render();

window.addEventListener('nms:favorites-changed', () => {
  if (currentRoute.kind === 'tab' && currentRoute.name === 'favorites') render();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
