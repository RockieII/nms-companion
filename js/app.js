import { renderResources } from './views/resources.js';
import { renderRecipes }   from './views/recipes.js';
import { renderUpdates }   from './views/updates.js';
import { renderUpdate }    from './views/update.js';
import { renderFavorites } from './views/favorites.js';
import { renderSettings }  from './views/settings.js';
import { renderItem }      from './views/item.js';
import { renderSource }    from './views/source.js';
import { renderHome }       from './views/home.js';
import { renderCalculator } from './views/calculator.js';
import { renderMore }       from './views/more.js';
import { renderSaveImport } from './views/save-import.js';
import { initTheme }       from './theme.js';

initTheme();

const viewRoot = document.getElementById('view');
const tabLabel = document.getElementById('tab-label');
const toastEl  = document.getElementById('toast');
const tabbar   = document.querySelector('.tabbar');
const topbar   = document.querySelector('.topbar');
const backBtn  = document.getElementById('back-btn');

const TABS = {
  home:     { label: 'Home',       render: renderHome },
  browse:   { label: 'Browse',     render: renderResources },
  calc:     { label: 'Calculator', render: renderCalculator },
  projects: { label: 'Projects',   render: renderFavorites },
  more:     { label: 'More',       render: renderMore },
  // Secondary routes (reached from Browse / More), not in the tab bar:
  recipes:  { label: 'Recipes',    render: renderRecipes },
  updates:  { label: 'Updates',    render: renderUpdates },
  settings: { label: 'Settings',   render: renderSettings },
  save:     { label: 'Save import', render: renderSaveImport },
};

// Which bottom-bar tab is highlighted for a given route name.
const ROUTE_TAB = {
  home: 'home', browse: 'browse', calc: 'calc', projects: 'projects', more: 'more',
  recipes: 'browse', updates: 'more', settings: 'more', save: 'more',
};

let currentRoute = { kind: 'tab', name: 'home', params: {} };
let lastTab = 'home';

function parseRoute(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return { kind: 'tab', name: 'home', params: {} };
  if (raw.startsWith('item/')) {
    return { kind: 'item', id: decodeURIComponent(raw.slice(5)) };
  }
  if (raw.startsWith('update/')) {
    return { kind: 'update', id: decodeURIComponent(raw.slice(7)) };
  }
  if (raw.startsWith('source/')) {
    const after = raw.slice(7);
    const [id, queryStr] = after.split('?');
    const params = {};
    if (queryStr) new URLSearchParams(queryStr).forEach((v, k) => { params[k] = v; });
    return { kind: 'source', id: decodeURIComponent(id), params };
  }
  const [name, queryStr] = raw.split('?');
  if (TABS[name]) {
    const params = {};
    if (queryStr) new URLSearchParams(queryStr).forEach((v, k) => { params[k] = v; });
    return { kind: 'tab', name, params };
  }
  return { kind: 'tab', name: 'home', params: {} };
}

function render() {
  const route = parseRoute(location.hash);
  currentRoute = route;

  // Every route change resets scroll to the top so users don't land
  // mid-page when navigating from a scrolled list.
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  if (route.kind === 'item' || route.kind === 'update' || route.kind === 'source') {
    topbar.classList.add('on-profile');
    tabbar.style.display = 'none';
    tabLabel.textContent = '';
    backBtn.hidden = false;
    viewRoot.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
    const fn = route.kind === 'item' ? renderItem
            : route.kind === 'update' ? renderUpdate
            : renderSource;
    // source view takes an extra params argument for item context
    const extra = route.kind === 'source' ? route.params : undefined;
    Promise.resolve(fn(viewRoot, route.id, extra)).catch(err => {
      console.error(err);
      viewRoot.innerHTML = `<div class="empty">Failed to load.<small>${err.message}</small></div>`;
    });
    return;
  }

  // tab route
  const activeTab = ROUTE_TAB[route.name] || route.name;
  lastTab = activeTab;
  topbar.classList.remove('on-profile');
  tabbar.style.display = '';
  backBtn.hidden = true;
  const tab = TABS[route.name];
  tabLabel.textContent = tab.label;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  viewRoot.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  Promise.resolve(tab.render(viewRoot, route.params)).catch(err => {
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
  if (currentRoute.kind === 'tab' && (currentRoute.name === 'projects' || currentRoute.name === 'home')) render();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
