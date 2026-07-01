// Save Import (experimental) — read a local NMS save.hg to see what you own.
// Fully client-side: the file is decoded in the browser, never uploaded.

import { getAllItems } from '../data.js';
import { decodeSave, extractInventory } from '../nms-save.js';
import { el, imgOrPlaceholder } from './ui.js';

const UPLOAD_SVG = '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M12 3l4 4h-3v6h-2V7H8l4-4zM5 18v-3H3v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3h-2v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/></svg>';

export async function renderSaveImport(root) {
  root.innerHTML = '';
  root.appendChild(el('h1', { class: 'calc-title' }, 'Import game save'));
  root.appendChild(el('p', { class: 'calc-sub' },
    'See what you own by reading your No Man’s Sky save. It’s decoded on your device — nothing is uploaded.'));
  root.appendChild(el('div', { class: 'save-note' },
    'Experimental · PC saves (save.hg). NMS has no live API, so this reads the local file.'));

  const fileInput = el('input', { type: 'file', accept: '.hg,.json', style: 'display:none' });
  const drop = el('button', { class: 'save-drop' }, [
    el('div', { class: 'save-drop-icon', html: UPLOAD_SVG }),
    el('div', { class: 'save-drop-title' }, 'Choose your save.hg'),
    el('div', { class: 'save-drop-sub' }, 'or drag it here · %APPDATA%\\HelloGames\\NMS\\st_…'),
  ]);
  const out = el('div');
  root.appendChild(fileInput);
  root.appendChild(drop);
  root.appendChild(out);

  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  async function handleFile(file) {
    out.innerHTML = '<div class="spinner" aria-label="Reading"></div>';
    try {
      const buf = await file.arrayBuffer();
      const save = decodeSave(buf);
      const all = await getAllItems();
      const ids = new Set(all.map(i => i.Id));
      const byId = new Map(all.map(i => [i.Id, i]));
      const inv = extractInventory(save, ids);
      renderResult(out, inv, byId, file.name);
    } catch (err) {
      out.innerHTML = '';
      out.appendChild(el('div', { class: 'empty' }, [
        'Couldn’t read that file.',
        el('small', {}, err.message),
      ]));
    }
  }
}

function renderResult(out, inv, byId, filename) {
  out.innerHTML = '';
  const entries = [...inv.entries()]
    .map(([id, v]) => ({ id, amount: v.amount, item: byId.get(id) }))
    .sort((a, b) => (b.amount || 0) - (a.amount || 0));

  out.appendChild(el('div', { class: 'save-note ok' },
    `Read ${filename} — found ${entries.length} known item${entries.length === 1 ? '' : 's'}.`));

  if (!entries.length) {
    out.appendChild(el('div', { class: 'empty' }, 'No recognisable items found in this save.'));
    return;
  }

  const list = el('div', { class: 'list' });
  for (const e of entries) {
    list.appendChild(el('a', { class: 'row', href: `#item/${encodeURIComponent(e.id)}` }, [
      imgOrPlaceholder(e.item || { Name: e.id }, { class: 'row-icon' }),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, e.amount != null ? `${e.amount}× ${e.item?.Name || e.id}` : (e.item?.Name || e.id)),
        el('div', { class: 'row-sub' }, e.item?.Group || ''),
      ]),
      el('span', { class: 'row-chevron', html: '›' }),
    ]));
  }
  out.appendChild(list);
  out.appendChild(el('div', { class: 'calc-note' },
    'Amounts are best-effort. If the list looks off, share a save and I’ll calibrate the reader.'));
}
