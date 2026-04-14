// Shared UI helpers used across views.
import { isFavorite, toggleFavorite } from '../data.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Build a list row: icon | title/subtitle | star
export function buildRow({ item, kind, subtitle, onOpen }) {
  const starred = isFavorite(kind, item.Id);
  const row = el('button', { class: 'row', type: 'button' }, [
    el('img', {
      class: 'row-icon',
      src: item.CdnUrl || '',
      alt: '',
      loading: 'lazy',
      onerror: (e) => { e.target.style.visibility = 'hidden'; },
    }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, item.Name || item.Id),
      el('div', { class: 'row-sub' }, subtitle || item.Group || ''),
    ]),
    el('span', {
      class: 'row-star' + (starred ? ' on' : ''),
      'aria-label': starred ? 'Unfavorite' : 'Favorite',
      onclick: (ev) => {
        ev.stopPropagation();
        const nowOn = toggleFavorite(kind, item.Id);
        ev.currentTarget.classList.toggle('on', nowOn);
        ev.currentTarget.textContent = nowOn ? '★' : '☆';
        window.dispatchEvent(new CustomEvent('nms:favorites-changed'));
      },
      html: starred ? '★' : '☆',
    }),
  ]);
  row.addEventListener('click', () => onOpen && onOpen(item));
  return row;
}

// Modal sheet. Returns a close() function.
export function openSheet(buildContent) {
  closeSheet();
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  sheet.appendChild(buildContent({ close }));
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });
  backdrop.addEventListener('click', close);

  function close() {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => { backdrop.remove(); sheet.remove(); }, 200);
  }
  openSheet._close = close;
  return close;
}

export function closeSheet() {
  if (openSheet._close) { openSheet._close(); openSheet._close = null; }
}

// Normalize a string for fuzzy search.
export function norm(s) {
  return (s || '').toString().toLowerCase();
}

// Extract unique Group values from a list of items, sorted alphabetically.
export function uniqueGroups(items) {
  const set = new Set();
  for (const it of items) if (it && it.Group) set.add(it.Group);
  return [...set];
}

// Build a category dropdown. `groups` = array of unique Group strings.
// onChange is called with the selected value or '' for "All".
export function buildCategorySelect(groups, onChange, selected = '') {
  const select = el('select', { 'aria-label': 'Filter by category' });
  select.appendChild(el('option', { value: '' }, `All categories (${groups.length})`));
  for (const g of [...groups].sort((a, b) => a.localeCompare(b))) {
    select.appendChild(el('option', { value: g }, g));
  }
  if (selected) select.value = selected;
  select.addEventListener('change', () => onChange(select.value));
  return el('div', { class: 'filterbar' }, [select]);
}
