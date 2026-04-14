// Sync script — finds NMS items whose AssistantNMS CDN icon is missing/404,
// resolves each to a Fandom-hosted icon, and writes data/icon-overrides.json.
//
// Run on GitHub Actions weekly (see .github/workflows/sync-icons.yml).
// Node 20+. Uses only built-ins (fetch, fs/promises).

import { writeFile, readFile } from 'node:fs/promises';

const DATA_BASE = 'https://cdn.jsdelivr.net/gh/bradhave94/nms@main/src/data';
const DATA_FILES = [
  'RawMaterials', 'Products', 'ConstructedTechnology',
  'Technology', 'Curiosities', 'Others', 'Trade',
];
const WIKI_API = 'https://nomanssky.fandom.com/api.php';
const WIKI_FILE_BASE = 'https://static.wikia.nocookie.net/nomanssky_gamepedia';

// Files that are NEVER the item's primary icon — remove them from candidate lists.
const EXCLUDE_REGEX = [
  /\.gif$/i,
  /^Units\.png$/i,
  /Icon\.?stub/i,
  /^\d/,                  // screenshots start with a date
  /_Info_Panel/i,
  /\s+Info\s+panel/i,
  /\s+Info\s+Panel/i,
  /Planetary_Deposit/i,
  /Planetary Deposit/i,
  /Companions_Info/i,
  /Companions Info/i,
  /Site-logo/i,
  /Site-favicon/i,
  /Site-background/i,
  /Site-community-image/i,
  /IconEchoes/i,
  /IconWorlds/i,
  /IconNextGen/i,
  /\.jpg$/i,              // icons are always .png; screenshots are .jpg
];

// Files MATCHING these are highly likely to be the item's primary icon.
const PREFER_REGEX = [
  /^SUBSTANCE\./i,
  /^PRODUCT\./i,
  /^TECH\./i,
  /^BUILD\./i,
  /^UPGRADE\./i,
  /^GAS\./i,
  /^NANITE\./i,
  /^CURIOSITY\./i,
  /^TRADE\./i,
];

const NORMALIZE = s => (s || '').toLowerCase();

function pickCandidate(pageImages, itemName) {
  const normalized = pageImages.map(i => i.title.replace(/^File:/, ''));
  const kept = normalized.filter(f => !EXCLUDE_REGEX.some(re => re.test(f)));
  const preferred = kept.filter(f => PREFER_REGEX.some(re => re.test(f)));
  const pool = preferred.length ? preferred : kept;
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  // Tiebreak: filename containing a word from Name wins.
  const words = NORMALIZE(itemName).split(/\W+/).filter(w => w.length >= 4);
  for (const w of words) {
    const hit = pool.find(f => NORMALIZE(f).includes(w));
    if (hit) return hit;
  }
  return null; // ambiguous — resolve via infobox fetch
}

// Extract first File: reference from the intro HTML (includes infobox).
async function fromInfobox(pageTitle) {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&section=0&format=json&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'nms-companion-sync/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  const html = data?.parse?.text?.['*'] || '';
  const matches = [...html.matchAll(/\/([A-Z][A-Z0-9_.\- ]+\.png)\//g)].map(m => m[1]);
  for (const f of matches) {
    if (!EXCLUDE_REGEX.some(re => re.test(f)) && PREFER_REGEX.some(re => re.test(f))) {
      return f;
    }
  }
  return null;
}

async function pageImages(titles) {
  // Batch up to 50 titles per call.
  const titleParam = titles.map(t => t.replace(/ /g, '_')).join('|');
  const url = `${WIKI_API}?action=query&titles=${encodeURIComponent(titleParam)}&prop=images&imlimit=500&format=json&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'nms-companion-sync/1.0' } });
  if (!res.ok) throw new Error(`pageImages HTTP ${res.status}`);
  const data = await res.json();
  const byTitle = {};
  const normalized = data?.query?.normalized || [];
  const redirects = data?.query?.redirects || [];
  const titleMap = {};
  for (const n of normalized) titleMap[n.from] = n.to;
  for (const r of redirects) titleMap[r.from] = r.to;
  for (const page of Object.values(data?.query?.pages || {})) {
    if (page.missing !== undefined) continue;
    byTitle[page.title] = page.images || [];
  }
  // Map original titles back to results.
  const out = {};
  for (const t of titles) {
    const resolved = titleMap[t.replace(/ /g, '_')] || titleMap[t] || t;
    out[t] = byTitle[resolved] || byTitle[t] || [];
  }
  return out;
}

async function resolveFileUrls(filenames) {
  // Batch imageinfo for up to 50 files at a time.
  const out = {};
  const chunks = [];
  for (let i = 0; i < filenames.length; i += 50) chunks.push(filenames.slice(i, i + 50));
  for (const batch of chunks) {
    const titleParam = batch.map(f => `File:${f}`).join('|');
    const url = `${WIKI_API}?action=query&titles=${encodeURIComponent(titleParam)}&prop=imageinfo&iiprop=url&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'nms-companion-sync/1.0' } });
    if (!res.ok) continue;
    const data = await res.json();
    for (const page of Object.values(data?.query?.pages || {})) {
      if (!page.imageinfo?.[0]?.url) continue;
      const filename = (page.title || '').replace(/^File:/, '');
      out[filename] = page.imageinfo[0].url;
    }
  }
  return out;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function main() {
  console.log('Loading data files…');
  const allItems = [];
  for (const name of DATA_FILES) {
    const items = await fetchJson(`${DATA_BASE}/${name}.json`);
    for (const it of items) {
      if (!it.CdnUrl && it.Icon) {
        it.CdnUrl = `https://cdn.nmsassistant.com/${it.Icon}`;
      }
      allItems.push(it);
    }
  }
  console.log(`Total items: ${allItems.length}`);

  // HEAD-check each CdnUrl. Parallel in batches of 40.
  console.log('Probing CDN URLs…');
  const missing = [];
  for (let i = 0; i < allItems.length; i += 40) {
    const slice = allItems.slice(i, i + 40);
    const results = await Promise.all(slice.map(async it => {
      if (!it.CdnUrl) return [it, false];
      return [it, await headOk(it.CdnUrl)];
    }));
    for (const [it, ok] of results) if (!ok) missing.push(it);
  }
  console.log(`Missing icons: ${missing.length}`);

  // Deduplicate by Name — some items share names.
  // For each missing item, query wiki.
  const overrides = {};
  const ambiguous = []; // items needing infobox fetch

  // Batch page-images queries, 40 names per call.
  const names = missing.map(it => it.Name).filter(Boolean);
  const uniqueNames = [...new Set(names)];
  const nameToImages = {};
  console.log(`Querying Fandom for ${uniqueNames.length} pages…`);
  for (let i = 0; i < uniqueNames.length; i += 40) {
    const batch = uniqueNames.slice(i, i + 40);
    try {
      const res = await pageImages(batch);
      Object.assign(nameToImages, res);
    } catch (e) {
      console.error('pageImages batch failed:', e.message);
    }
  }

  // Pick candidate per item.
  const fileToItems = {}; // filename -> [item,...] for URL resolution
  for (const it of missing) {
    const imgs = nameToImages[it.Name] || [];
    if (imgs.length === 0) continue;
    const picked = pickCandidate(imgs, it.Name);
    if (picked) {
      (fileToItems[picked] ||= []).push(it);
    } else {
      ambiguous.push(it);
    }
  }
  console.log(`Resolved directly: ${Object.values(fileToItems).flat().length}, ambiguous: ${ambiguous.length}`);

  // Fallback: fetch infobox for ambiguous items.
  for (const it of ambiguous) {
    try {
      const picked = await fromInfobox(it.Name);
      if (picked) (fileToItems[picked] ||= []).push(it);
    } catch (e) {
      // swallow
    }
  }

  // Resolve all chosen filenames to URLs.
  const allFiles = Object.keys(fileToItems);
  console.log(`Resolving ${allFiles.length} file URLs…`);
  const fileUrls = await resolveFileUrls(allFiles);

  for (const [filename, items] of Object.entries(fileToItems)) {
    const url = fileUrls[filename];
    if (!url) continue;
    for (const it of items) overrides[it.Id] = url;
  }

  console.log(`Final override count: ${Object.keys(overrides).length}`);

  // Load existing file to preserve manual additions (keys not in this run).
  let existing = {};
  try {
    existing = JSON.parse(await readFile('data/icon-overrides.json', 'utf8'));
  } catch {}
  const merged = { ...existing, ...overrides };

  // Deterministic output: sorted keys, two-space indent + trailing newline.
  const sorted = Object.fromEntries(Object.keys(merged).sort().map(k => [k, merged[k]]));
  await writeFile('data/icon-overrides.json', JSON.stringify(sorted, null, 2) + '\n');
  console.log('Wrote data/icon-overrides.json');
}

main().catch(e => { console.error(e); process.exit(1); });
