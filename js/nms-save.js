// No Man's Sky save reader (client-side, offline). NMS has no player API, so the
// only way to see your real stuff is to read the local save. PC saves live at
// %APPDATA%/HelloGames/NMS/st_<id>/save.hg — a sequence of LZ4-compressed blocks
// whose decompressed payload is JSON with obfuscated (short) keys.
//
// We avoid needing the (huge, version-specific) key-mapping table: since we
// already know every item id, we just scan the decoded JSON for id strings that
// match our database. Everything runs in the browser; nothing is uploaded.

const NUL = String.fromCharCode(0);
const SAVE_MAGIC = 0xFEEDA1E5;

// --- LZ4 block decompression (pure JS; the format is small + well-defined) ---
export function lz4Decompress(src, outSize) {
  const dst = new Uint8Array(outSize);
  let s = 0, d = 0;
  const n = src.length;
  while (s < n) {
    const token = src[s++];
    let litLen = token >> 4;
    if (litLen === 15) { let b; do { b = src[s++]; litLen += b; } while (b === 255); }
    for (let i = 0; i < litLen; i++) dst[d++] = src[s++];
    if (s >= n) break;                      // last sequence is literals-only
    const offset = src[s++] | (src[s++] << 8);
    let matchLen = token & 0x0F;
    if (matchLen === 15) { let b; do { b = src[s++]; matchLen += b; } while (b === 255); }
    matchLen += 4;                          // minmatch
    let m = d - offset;
    if (offset === 0 || m < 0) throw new Error('Bad LZ4 stream');
    for (let i = 0; i < matchLen; i++) dst[d++] = dst[m++]; // overlap-safe, byte by byte
  }
  return dst.subarray(0, d);
}

// Trim padding: cut at the first NUL (block payloads are NUL-padded past the JSON).
function stripNul(s) {
  const cut = s.indexOf(NUL);
  return cut >= 0 ? s.slice(0, cut) : s;
}

// Decode a save.hg ArrayBuffer into its JSON object. Handles both plain-JSON
// saves and the LZ4 block container.
export function decodeSave(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // Plain JSON (skip whitespace / BOM)?
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d ||
         bytes[i] === 0x09 || bytes[i] === 0xEF || bytes[i] === 0xBB || bytes[i] === 0xBF)) i++;
  if (bytes[i] === 0x7B /* { */) {
    return JSON.parse(stripNul(new TextDecoder().decode(bytes)));
  }

  // LZ4 container — find the first magic, then walk 16-byte-header blocks.
  const dv = new DataView(arrayBuffer);
  let start = -1;
  for (let p = 0; p + 4 <= bytes.length; p++) {
    if (dv.getUint32(p, true) === SAVE_MAGIC) { start = p; break; }
  }
  if (start < 0) throw new Error('Unrecognised file — not a JSON or LZ4 NMS save.');

  const chunks = [];
  let p = start;
  while (p + 16 <= bytes.length && dv.getUint32(p, true) === SAVE_MAGIC) {
    const compSize = dv.getUint32(p + 4, true);
    const uncompSize = dv.getUint32(p + 8, true);
    p += 16;
    const comp = bytes.subarray(p, p + compSize);
    p += compSize;
    chunks.push(compSize === uncompSize ? comp.slice() : lz4Decompress(comp, uncompSize));
  }
  let total = 0; for (const c of chunks) total += c.length;
  const all = new Uint8Array(total);
  let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return JSON.parse(stripNul(new TextDecoder().decode(all)));
}

// Walk the decoded save and collect any string that matches a known item id
// (NMS ids are often "^"-prefixed). Amount is best-effort: the smallest positive
// integer sibling in the same slot object (MaxAmount/stack size tends to be
// larger). Returns a Map id -> { amount:number|null }.
export function extractInventory(root, knownIds) {
  const found = new Map();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const v of node) if (v && typeof v === 'object') stack.push(v);
      continue;
    }
    let id = null;
    const nums = [];
    for (const k in node) {
      const v = node[k];
      if (typeof v === 'string') {
        const cand = v.charCodeAt(0) === 94 /* ^ */ ? v.slice(1) : v;
        if (knownIds.has(cand)) id = cand;
      } else if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 100000000) {
        nums.push(v);
      } else if (v && typeof v === 'object') {
        stack.push(v);
      }
    }
    if (id) {
      const amount = nums.length ? Math.min(...nums) : null;
      const prev = found.get(id);
      const sum = (prev && prev.amount != null ? prev.amount : 0) + (amount != null ? amount : 0);
      found.set(id, { amount: (prev == null && amount == null) ? null : sum });
    }
  }
  return found;
}
