// Theme system — a small set of palettes selectable in Settings. Each theme is
// a set of CSS custom properties defined under [data-theme="…"] in main.css; here
// we only track the id, a label, and the browser theme-color for the status bar.
// The active theme id is applied to <html data-theme> and persisted in LocalStorage.
// (index.html also sets it inline on first paint to avoid a flash.)

export const THEMES = [
  { id: 'dark',   label: 'Deep Space',    color: '#0a0e1a' },
  { id: 'black',  label: 'AMOLED Black',  color: '#000000' },
  { id: 'nebula', label: 'Nebula',        color: '#0e0a1a' },
  { id: 'atlas',  label: 'Atlas Red',     color: '#140a0c' },
  { id: 'light',  label: 'Daylight',      color: '#eef1f7' },
  { id: 'paper',  label: 'Paper',         color: '#f5efe3' },
  { id: 'frost',  label: 'Frost',         color: '#eef3fa' },
  { id: 'sage',   label: 'Sage',          color: '#eef4ec' },
];

const KEY = 'nms:theme';
const DEFAULT = 'dark';

export function getTheme() {
  try { return localStorage.getItem(KEY) || DEFAULT; } catch { return DEFAULT; }
}

export function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.color);
  try { localStorage.setItem(KEY, theme.id); } catch { /* private mode */ }
  return theme.id;
}

export function initTheme() {
  applyTheme(getTheme());
}
