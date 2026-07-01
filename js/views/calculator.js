// Crafting calculator — pick a target item + quantity, see the raw materials to
// gather and the intermediate recipe steps. Reverse mode lists what an item is
// used to make. Everything is driven by the hash (#calc?target=<id>&qty=<n>) so
// it's back/shareable. Engine lives in ../craft.js.

import { getAllItems, getItemById } from '../data.js';
import { resolveCost, whatCanIMake } from '../craft.js';
import { searchField, searchInputEl } from './search.js';
import { el, imgOrPlaceholder, debounce, norm } from './ui.js';
import { toast } from '../app.js';

// prefs persist across a single render chain (recipe overrides per item id).
let prefs = {};

export async function renderCalculator(root, params = {}) {
  root.innerHTML = '';
  const targetId = params.target || '';
  const qty = Math.max(1, parseInt(params.qty, 10) || 1);
  const mode = params.mode === 'uses' ? 'uses' : 'cost';

  if (!targetId) { prefs = {}; return renderPicker(root, qty); }

  const target = await getItemById(targetId);
  if (!target) {
    root.appendChild(el('div', { class: 'empty' }, ['Item not found.', el('small', {}, targetId)]));
    return;
  }

  // Header: change target, icon/name, quantity stepper.
  root.appendChild(el('a', { class: 'cat-back', href: '#calc' }, [
    el('span', { class: 'cat-back-arrow', html: '‹' }), 'Change item',
  ]));
  root.appendChild(el('div', { class: 'profile-head calc-head' }, [
    imgOrPlaceholder(target, { class: 'profile-icon' }),
    el('div', { class: 'profile-head-text' }, [
      el('h1', { class: 'profile-title' }, target.Name || target.Id),
      el('p', { class: 'profile-group' }, target.Group || ''),
    ]),
  ]));

  // Cost | Uses toggle
  root.appendChild(el('div', { class: 'subtabs' }, [
    modeBtn('Cost to craft', 'cost', mode, targetId, qty),
    modeBtn('Used to make', 'uses', mode, targetId, qty),
  ]));

  const body = el('div');
  root.appendChild(body);

  if (mode === 'uses') return renderUses(body, targetId);

  // Quantity stepper
  const qtyVal = el('span', { class: 'qty-val' }, String(qty));
  const setQty = n => { location.hash = `#calc?target=${encodeURIComponent(targetId)}&qty=${Math.max(1, n)}`; };
  body.appendChild(el('div', { class: 'qty-row' }, [
    el('span', { class: 'qty-label' }, 'Quantity'),
    el('div', { class: 'qty' }, [
      stepBtn('−', () => setQty(qty - 1)),
      qtyVal,
      stepBtn('+', () => setQty(qty + 1)),
    ]),
  ]));

  const out = el('div');
  body.appendChild(out);
  await renderCost(out, targetId, qty);
}

function modeBtn(label, value, active, targetId, qty) {
  return el('a', {
    class: 'subtab' + (active === value ? ' active' : ''),
    href: `#calc?target=${encodeURIComponent(targetId)}&qty=${qty}${value === 'uses' ? '&mode=uses' : ''}`,
  }, label);
}

function stepBtn(sym, onClick) {
  const b = el('button', { class: 'qty-btn' }, sym);
  b.addEventListener('click', onClick);
  return b;
}

async function renderCost(out, targetId, qty) {
  out.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const { raws, tree, hadFraction } = await resolveCost(targetId, qty, prefs);
  out.innerHTML = '';

  // Raw materials (headline)
  const rawEntries = Object.entries(raws).sort((a, b) => b[1] - a[1]);
  out.appendChild(sectionTitle(`Raw materials${hadFraction ? ' ≈' : ''}`));
  if (rawEntries.length === 0) {
    out.appendChild(el('div', { class: 'empty' }, 'This item is a base resource — just gather it.'));
  } else {
    const list = el('div', { class: 'list' });
    for (const [id, q] of rawEntries) {
      const item = await getItemById(id);
      list.appendChild(costRow(item, id, Math.ceil(q)));
    }
    out.appendChild(list);
    if (hadFraction) out.appendChild(el('div', { class: 'calc-note' }, 'Rounded up — some refines yield in batches.'));
  }

  // Steps (intermediate crafts, deepest first)
  const steps = collectSteps(tree).filter(s => s.id !== undefined);
  if (steps.length) {
    out.appendChild(sectionTitle('Steps'));
    const list = el('div', { class: 'list' });
    for (const s of steps) list.appendChild(await stepRow(s, targetId, qty));
    out.appendChild(list);
  }

  // Add to project (Phase 2)
  const add = el('button', { class: 'btn', style: 'margin-top:14px;' }, 'Add to project');
  add.addEventListener('click', () => toast('Projects coming soon'));
  out.appendChild(add);
}

// Post-order collect of non-leaf nodes, deduped by id (summed qty) — the order
// you'd actually craft them (intermediates before the final item).
function collectSteps(tree) {
  const map = new Map();
  (function post(n) {
    if (n.leaf) return;
    for (const c of n.children) post(c);
    const e = map.get(n.id) || { id: n.id, name: n.name, item: n.item, qty: 0, recipe: n.recipe, alt: n.alt };
    e.qty += n.qty;
    map.set(n.id, e);
  })(tree);
  return [...map.values()];
}

function costRow(item, id, qty) {
  return el('a', { class: 'row', href: `#item/${encodeURIComponent(id)}` }, [
    imgOrPlaceholder(item || { Name: id }, { class: 'row-icon' }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, `${qty}× ${item?.Name || id}`),
      el('div', { class: 'row-sub' }, item?.Group || ''),
    ]),
  ]);
}

async function stepRow(step, targetId, qty) {
  const inputs = step.recipe?.inputs || [];
  const names = [];
  for (const inp of inputs) {
    const it = await getItemById(inp.id);
    names.push(`${inp.qty}× ${it?.Name || inp.id}`);
  }
  const row = el('div', { class: 'row step-row' }, [
    imgOrPlaceholder(step.item || { Name: step.name }, { class: 'row-icon' }),
    el('div', { class: 'row-body' }, [
      el('div', { class: 'row-title' }, `${Math.ceil(step.qty)}× ${step.name}`),
      el('div', { class: 'row-sub' }, `${step.recipe?.label || 'Make'}: ${names.join(', ')}`),
    ]),
  ]);
  if (step.alt > 1) {
    const swap = el('button', { class: 'alt-btn', 'aria-label': 'Other recipe', title: `${step.alt} recipes` }, '⇄');
    swap.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      prefs[step.id] = ((prefs[step.id] == null ? 0 : prefs[step.id]) + 1) % step.alt;
      // prefs is module-level; re-run the router to re-resolve with the new choice.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    row.appendChild(swap);
  }
  return row;
}

async function renderUses(body, id) {
  body.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const outs = await whatCanIMake(id);
  body.innerHTML = '';
  if (!outs.length) {
    body.appendChild(el('div', { class: 'empty' }, 'Not used in any recipe.'));
    return;
  }
  // dedupe by output id
  const seen = new Set();
  const list = el('div', { class: 'list' });
  for (const o of outs) {
    if (!o.outId || seen.has(o.outId)) continue;
    seen.add(o.outId);
    const item = await getItemById(o.outId);
    if (!item) continue;
    list.appendChild(el('a', { class: 'row', href: `#calc?target=${encodeURIComponent(o.outId)}&qty=1` }, [
      imgOrPlaceholder(item, { class: 'row-icon' }),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, item.Name || o.outId),
        el('div', { class: 'row-sub' }, item.Group || ''),
      ]),
      el('span', { class: 'row-chevron', html: '›' }),
    ]));
  }
  body.appendChild(list);
}

function renderPicker(root, qty) {
  root.appendChild(el('h1', { class: 'calc-title' }, 'Crafting calculator'));
  root.appendChild(el('p', { class: 'calc-sub' }, 'Pick an item to see the raw materials you need.'));
  const input = searchInputEl('Search for an item…');
  const results = el('div', { class: 'list' });
  root.appendChild(searchField(input));
  root.appendChild(results);

  let all = null;
  const run = debounce(async () => {
    const q = norm(input.value);
    results.innerHTML = '';
    if (!q) return;
    if (!all) { results.innerHTML = '<div class="spinner"></div>'; all = await getAllItems(); }
    if (norm(input.value) !== q) return;
    const list = all.filter(it => norm(it.Name).includes(q)).slice(0, 40);
    results.innerHTML = '';
    if (!list.length) { results.appendChild(el('div', { class: 'empty' }, 'No matches.')); return; }
    for (const item of list) {
      results.appendChild(el('a', {
        class: 'row', href: `#calc?target=${encodeURIComponent(item.Id)}&qty=${qty}`,
      }, [
        imgOrPlaceholder(item, { class: 'row-icon' }),
        el('div', { class: 'row-body' }, [
          el('div', { class: 'row-title' }, item.Name || item.Id),
          el('div', { class: 'row-sub' }, item.Group || ''),
        ]),
        el('span', { class: 'row-chevron', html: '›' }),
      ]));
    }
  }, 140);
  input.addEventListener('input', run);
}

function sectionTitle(t) {
  return el('div', { class: 'profile-section-title', style: 'margin-top:16px;' }, t);
}
