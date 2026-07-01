import { refresh, lastRefreshedAt, getCacheStats } from '../data.js';
import { THEMES, getTheme, applyTheme } from '../theme.js';
import { toast } from '../app.js';
import { el } from './ui.js';

export async function renderSettings(root) {
  root.innerHTML = '';

  // Appearance — theme picker.
  const activeTheme = getTheme();
  const themeList = el('div', { class: 'theme-list' },
    THEMES.map(t => {
      const opt = el('button', { class: 'theme-option' + (t.id === activeTheme ? ' active' : '') }, [
        el('span', { class: 'theme-swatch', style: `background:${t.color}` }),
        el('span', { class: 'theme-name' }, t.label),
        t.id === activeTheme ? el('span', { class: 'theme-check', html: '✓' }) : null,
      ].filter(Boolean));
      opt.addEventListener('click', () => {
        applyTheme(t.id);
        toast(`Theme: ${t.label}`);
        renderSettings(root);
      });
      return opt;
    }));
  root.appendChild(el('div', { class: 'settings-section' }, [
    el('h2', {}, 'Appearance'),
    themeList,
  ]));

  const stampEl = el('span', {}, formatStamp(lastRefreshedAt()));
  const stats = getCacheStats();

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
    el('div', { class: 'settings-row' }, [el('span', {}, 'Items cached'),     el('span', {}, String(stats.items))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Crafting recipes'), el('span', {}, String(stats.products))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Refiner recipes'),  el('span', {}, String(stats.refinery))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Cooking recipes'),  el('span', {}, String(stats.nutrient))]),
    el('div', { class: 'settings-row' }, [el('span', {}, 'Steam updates'),    el('span', {}, String(stats.updates))]),
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
    el('div', { style: 'font-size:12px; line-height:1.55; color:var(--text-dim);' },
      'Game data from the No Man\'s Sky community ' +
      '(bradhave94/nms on GitHub), served via jsDelivr. ' +
      'Icons from cdn.nmsassistant.com + static.wikia.nocookie.net. ' +
      'Updates pulled from the Steam community API. ' +
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
