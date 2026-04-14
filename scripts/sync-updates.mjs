// Sync script — pulls Hello Games' announcements for No Man's Sky (appid 275850)
// and writes data/updates.json with rich HTML (paragraphs, images, YouTube).
//
// Uses Steam's "ajaxgetadjacentpartnerevents" endpoint, which returns events in
// their native BBCode form (much richer than ISteamNews/GetNewsForApp). We
// translate BBCode to sanitized HTML at build time so the app can render it
// directly without runtime parsing.
//
// Run on GitHub Actions daily (see .github/workflows/sync-updates.yml).

import { writeFile } from 'node:fs/promises';

const APPID = 275850;
const COUNT = 30;
const EVENTS_API = `https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/?appid=${APPID}&count_before=0&count_after=${COUNT}`;

// Steam uses `{STEAM_CLAN_IMAGE}` as a template placeholder. Real URL base:
const CLAN_IMAGE_BASE = 'https://clan.fastly.steamstatic.com/images/';

// Tags we emit after BBCode translation. Anything else is stripped by sanitize().
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u',
  'a', 'img', 'iframe',
  'ul', 'ol', 'li',
  'h2', 'h3', 'h4',
  'blockquote', 'hr',
  'figure', 'figcaption',
]);
const ALLOWED_ATTRS = {
  a:      new Set(['href', 'title', 'target', 'rel']),
  img:    new Set(['src', 'alt', 'title']),
  iframe: new Set(['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title']),
};

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Translate Steam BBCode to HTML. Operations are applied in order.
function bbcodeToHtml(bb) {
  if (!bb) return '';
  let s = bb;

  // Resolve the {STEAM_CLAN_IMAGE} placeholder everywhere.
  s = s.replace(/\{STEAM_CLAN_IMAGE\}/g, CLAN_IMAGE_BASE);

  // Images: [img src="URL"] (no closing tag).
  s = s.replace(/\[img\s+src=["']([^"']+)["']\s*\]/gi,
    (_, url) => `<figure><img src="${escapeHtml(url)}" alt="" loading="lazy"></figure>`);
  // Images without attribute syntax: [img]URL[/img]
  s = s.replace(/\[img\]([^\[]+)\[\/img\]/gi,
    (_, url) => `<figure><img src="${escapeHtml(url.trim())}" alt="" loading="lazy"></figure>`);

  // YouTube preview blocks: [previewyoutube=ID;full] or [previewyoutube="ID;full"] … [/previewyoutube]
  s = s.replace(/\[previewyoutube=?["']?([A-Za-z0-9_-]+);?[^"'\]]*["']?\][\s\S]*?\[\/previewyoutube\]/gi,
    (_, id) => `<figure class="yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></figure>`);

  // Links: [url=URL]text[/url]
  s = s.replace(/\[url=["']?([^"'\]]+)["']?\]([\s\S]*?)\[\/url\]/gi,
    (_, href, text) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  // Bare url: [url]URL[/url]
  s = s.replace(/\[url\]([^\[]+)\[\/url\]/gi,
    (_, href) => `<a href="${escapeHtml(href.trim())}" target="_blank" rel="noopener noreferrer">${escapeHtml(href.trim())}</a>`);

  // Lists: [list] … [/list] with [*] bullets.
  s = s.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).slice(1).map(li => `<li>${li.trim()}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  s = s.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).slice(1).map(li => `<li>${li.trim()}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Headings.
  s = s.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, '<h2>$1</h2>'); // demote h1 → h2
  s = s.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<h2>$1</h2>');
  s = s.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, '<h3>$1</h3>');
  s = s.replace(/\[h4\]([\s\S]*?)\[\/h4\]/gi, '<h4>$1</h4>');

  // Text formatting.
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>');
  s = s.replace(/\[hr\s*\/?\s*\]/gi, '<hr>');

  // Paragraphs: [p]…[/p]. Empty [p][/p] becomes a spacer.
  s = s.replace(/\[p\]\s*\[\/p\]/gi, '');
  s = s.replace(/\[p\]([\s\S]*?)\[\/p\]/gi, '<p>$1</p>');

  // Drop any unknown BBCode tags we didn't handle.
  s = s.replace(/\[\/?[a-z][^\]]*\]/gi, '');

  return s;
}

// Light sanitizer — whitelist tag + attribute names, force http(s) on URLs,
// restrict iframes to YouTube hosts.
function sanitize(html) {
  if (!html) return '';
  html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (full, slash, tag, attrs) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (slash) return `</${name}>`;
    const allowed = ALLOWED_ATTRS[name] || new Set();
    let out = '';
    for (const m of attrs.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g)) {
      const key = m[1].toLowerCase();
      const val = m[3] ?? m[4] ?? m[5] ?? '';
      if (!allowed.has(key)) continue;
      if ((key === 'href' || key === 'src') && !/^https?:\/\//i.test(val)) continue;
      if (name === 'iframe' && key === 'src') {
        if (!/^https?:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(val)) continue;
      }
      out += ` ${key}="${val.replace(/"/g, '&quot;')}"`;
    }
    if (name === 'iframe') out += ' loading="lazy"';
    return `<${name}${out}>`;
  });
}

function excerpt(html, maxChars = 240) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
}

function firstImage(html) {
  const m = html.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
  return m ? m[1] : null;
}

// Safely parse Steam's jsondata string. It's JSON nested inside JSON.
function parseJsondata(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function heroImageFrom(event) {
  const jd = parseJsondata(event.jsondata);
  const arr = jd.localized_title_image || [];
  const filename = arr.find(x => x) || null;
  if (!filename) return null;
  const clanid = event.announcement_body?.clanid || event.clan_steamid;
  return clanid ? `${CLAN_IMAGE_BASE}${clanid}/${filename}` : null;
}

async function main() {
  console.log('Fetching Steam events…');
  const res = await fetch(EVENTS_API, {
    headers: {
      'User-Agent': 'nms-companion-sync/1.0',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
  });
  if (!res.ok) throw new Error(`Steam events HTTP ${res.status}`);
  const data = await res.json();
  const events = data?.events || [];
  console.log(`Raw events: ${events.length}`);

  // Keep only announcement-type events that have a body. event_type 14 =
  // community announcement; 28 = crosspost. Both have announcement_body.
  const announcements = events.filter(e =>
    e.announcement_body && e.announcement_body.body
  );
  console.log(`Announcements: ${announcements.length}`);

  const updates = announcements.map(e => {
    const bodyHtml = sanitize(bbcodeToHtml(e.announcement_body.body));
    const hero = heroImageFrom(e);
    const thumbnail = hero || firstImage(bodyHtml);
    const announcementGid = e.announcement_body.gid;
    return {
      id: announcementGid,
      title: e.event_name,
      url: `https://store.steampowered.com/news/app/${APPID}/view/${e.gid}`,
      date: e.rtime32_start_time * 1000,
      feedlabel: 'Community Announcements',
      thumbnail,
      excerpt: excerpt(bodyHtml),
      body: bodyHtml,
    };
  });

  updates.sort((a, b) => b.date - a.date);

  await writeFile('data/updates.json', JSON.stringify(updates, null, 2) + '\n');
  console.log(`Wrote ${updates.length} updates to data/updates.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
