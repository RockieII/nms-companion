import { refresh, lastRefreshedAt } from '../data.js';
import { toast } from '../app.js';
import { el } from './ui.js';

export async function renderSettings(root) {
  root.innerHTML = '';

  const stampEl = el('span', {}, formatStamp(lastRefreshedAt()));
  const resourcesCount = jsonCount('nms:resources:v2');
  const productsCount  = jsonCount('nms:products:v2');
  const refinerCount   = jsonCount('nms:refinery:v2');

  const refreshBtn = el('button', { class: 'btn' }, 'Refresh game data');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    const result = await refresh();
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh game data';
    if (result.ok) {
      toast('Data refreshed');
      renderSettings(root);
    } else {
      toast('Refresh failed — see console', 'error');
      console.error('Refresh errors:', result.errors);
    }
  });

  root.appendChild(el('div', { class: 'settings-section' }, [
    el('h2', {}, 'Data'),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Resources'), el('span', {}, String(resourcesCount))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Crafting recipes'), el('span', {}, String(productsCount))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Refiner recipes'),  el('span', {}, String(refinerCount))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Last refreshed'),   stampEl]),
    el('div', { style: 'margin-top:12px;' }, [refreshBtn]),
  ]));

  root.appendChild(el('div', { class: 'settings-section' }, [
    el('h2', {}, 'Storage'),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Stored in'), el('span', {}, 'LocalStorage (on-device)')]),
    el('div', { style: 'margin-top:12px;' }, [
      (() => {
        const btn = el('button', { class: 'btn btn-secondary' }, 'Clear cache');
        btn.addEventListener('click', () => {
          if (!confirm('Clear all cached data? Favorites will be kept.')) return;
          Object.keys(localStorage)
            .filter(k => k.startsWith('nms:') && k !== 'nms:favorites:v1')
            .forEach(k => localStorage.removeItem(k));
          toast('Cache cleared');
          renderSettings(root);
        });
        return btn;
      })(),
    ]),
  ]));

  root.appendChild(el('div', { class: 'settings-section' }, [
    el('h2', {}, 'Credits'),
    el('div', { class: 'sheet-desc', style: 'font-size:12px;' },
      'Game data from the No Man\'s Sky community ' +
      '(bradhave94/nms on GitHub), served via jsDelivr. ' +
      'Icons from cdn.nmsassistant.com. ' +
      'No Man\'s Sky © Hello Games. This app is fan-made and not affiliated.'),
  ]));
}

function formatStamp(iso) {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function jsonCount(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
