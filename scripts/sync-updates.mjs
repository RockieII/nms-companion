// Sync script — pulls the latest Hello Games announcements from Steam for
// No Man's Sky (appid 275850), sanitizes HTML, and writes data/updates.json.
//
// Run on GitHub Actions daily (see .github/workflows/sync-updates.yml).
// Node 20+. Uses only built-ins.

import { writeFile } from 'node:fs/promises';

const APPID = 275850;
const COUNT = 30;     // keep the latest 30 announcements
const MAXLEN = 20000; // per-item body cap — Steam already truncates but guard anyway
const API = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${APPID}&count=${COUNT}&maxlength=${MAXLEN}&format=json`;

// Tags we keep when sanitizing (everything else gets stripped). Closing tags
// are handled by the same regex run.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u',
  'a', 'img', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4',
  'blockquote', 'hr',
]);

// Allowed attributes per tag. Anything else is dropped.
const ALLOWED_ATTRS = {
  a:   new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
};

function sanitize(html) {
  if (!html) return '';
  // Drop scripts + styles entirely (along with their contents).
  html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Strip BBCode remnants that Steam sometimes leaves behind.
  html = html.replace(/\[\/?(?:b|i|u|url|img|quote|list|\*|h\d)[^\]]*\]/gi, '');
  // Walk every tag and rewrite.
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (full, slash, tag, attrs) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (slash) return `</${name}>`;
    const allowed = ALLOWED_ATTRS[name] || new Set();
    let safeAttrs = '';
    for (const m of attrs.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g)) {
      const key = m[1].toLowerCase();
      const val = m[3] ?? m[4] ?? m[5] ?? '';
      if (!allowed.has(key)) continue;
      // Only allow http(s) URLs in href/src.
      if ((key === 'href' || key === 'src') && !/^https?:\/\//i.test(val)) continue;
      const escaped = val.replace(/"/g, '&quot;');
      safeAttrs += ` ${key}="${escaped}"`;
    }
    return `<${name}${safeAttrs}>`;
  });
}

function firstImage(html) {
  const m = html.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
  return m ? m[1] : null;
}

function excerpt(html, maxChars = 220) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
}

async function main() {
  console.log('Fetching Steam news…');
  const res = await fetch(API, { headers: { 'User-Agent': 'nms-companion-sync/1.0' } });
  if (!res.ok) throw new Error(`Steam API HTTP ${res.status}`);
  const data = await res.json();
  const all = data?.appnews?.newsitems || [];
  console.log(`Raw items: ${all.length}`);

  // Keep only official Steam community announcements from Hello Games.
  // feed_type 1 = Steam community announcements.
  // feedname 'steam_community_announcements' is the official marker.
  const official = all.filter(n =>
    n.feed_type === 1 || n.feedname === 'steam_community_announcements'
  );
  console.log(`Official announcements: ${official.length}`);

  const updates = official.map(n => {
    const body = sanitize(n.contents || '');
    return {
      id: n.gid,
      title: n.title,
      url: n.url,
      date: n.date * 1000, // Steam returns seconds; store ms for JS Date
      feedlabel: n.feedlabel || 'Community Announcement',
      thumbnail: firstImage(body),
      excerpt: excerpt(body),
      body,
    };
  });

  // Sort newest-first (Steam already does this, but be explicit).
  updates.sort((a, b) => b.date - a.date);

  await writeFile('data/updates.json', JSON.stringify(updates, null, 2) + '\n');
  console.log(`Wrote ${updates.length} updates to data/updates.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
