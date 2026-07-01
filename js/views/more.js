// More — a small menu hosting the secondary destinations (Updates, Settings)
// and app info, keeping the primary tab bar focused on the companion tools.

import { el } from './ui.js';

const ROWS = [
  { label: 'Updates', sub: 'Latest No Man\'s Sky announcements', href: '#updates', icon: 'M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm1 1v9h9a10 10 0 0 0-9-9z' },
  { label: 'Settings', sub: 'Theme, data & storage', href: '#settings', icon: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.02 7.02 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.02 7.02 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z' },
];

export function renderMore(root) {
  root.innerHTML = '';
  const list = el('div', { class: 'list' });
  for (const r of ROWS) {
    list.appendChild(el('a', { class: 'row', href: r.href }, [
      el('span', { class: 'more-icon', html: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="${r.icon}"/></svg>` }),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, r.label),
        el('div', { class: 'row-sub' }, r.sub),
      ]),
      el('span', { class: 'row-chevron', html: '›' }),
    ]));
  }
  root.appendChild(list);
  root.appendChild(el('div', { class: 'more-about' },
    'NMS Companion · fan-made, not affiliated with Hello Games. Data from the No Man\'s Sky community.'));
}
