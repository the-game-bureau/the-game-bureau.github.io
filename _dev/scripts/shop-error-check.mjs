#!/usr/bin/env node
// Nightly gift-shop URL health check.
//
// Each run checks ONE SEVENTH of gift_shop_items — the slice keyed to the
// current weekday in America/Chicago (Monday = 1st seventh, Tuesday = 2nd, …,
// Sunday = 7th). Over a week every item is checked exactly once. For each item
// in the slice we test the product `url` and the `image_url`.
//
// Results are merged into a persistent per-item state embedded in
// shop/shoperrors.htm (so other days' results survive), the page is
// regenerated to show current errors, and a summary line is appended to
// shop/shoperrors.log.
//
// Reads only (anon publishable key). No secrets required.
//
// Env overrides (optional):
//   SUPABASE_URL, SUPABASE_KEY  — Supabase REST endpoint + key
//   SHOP_ERROR_SEGMENT          — force a segment 0..6 (testing)
//   SHOP_ERROR_TZ               — IANA tz for weekday/stamp (default America/Chicago)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTM_PATH = path.join(REPO_ROOT, 'shop', 'shoperrors.htm');
const LOG_PATH = path.join(REPO_ROOT, 'shop', 'shoperrors.log');

const SB_URL = (process.env.SUPABASE_URL || 'https://qmaafbncpzrdmqapkkgr.supabase.co').replace(/\/+$/, '');
// Prefer the service-role key (bypasses RLS so ARCHIVED items are checked too).
// Falls back to the public publishable key, which only sees non-archived rows.
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SB_PUBLISHABLE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const SB_KEY = SB_SERVICE_KEY || SB_PUBLISHABLE_KEY;
const USING_SERVICE_KEY = !!SB_SERVICE_KEY;
const TZ = process.env.SHOP_ERROR_TZ || 'America/Chicago';

const SEGMENTS = 7;
const CONCURRENCY = 6;
const TIMEOUT_MS = 15000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── helpers ────────────────────────────────────────────────────────────────

function weekdayInfo() {
  // Monday → 0 … Sunday → 6, evaluated in TZ.
  const now = new Date();
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(now);
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const idx = order.indexOf(wd);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { weekday: wd, segment: idx < 0 ? 0 : idx, date, time };
}

async function fetchAllItems() {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const select = 'id,title,url,image_url,archived,certified_at';
  const out = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const url = `${SB_URL}/rest/v1/gift_shop_items?select=${select}&order=id.asc`;
    const res = await fetch(url, { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Classify a single URL fetch.
//   ok        — 2xx (image checks also require an image content-type)
//   dead      — confirmed gone (404/410/451)
//   blocked   — likely anti-bot / rate limit (403/429/503); inconclusive
//   notimage  — 2xx but not an image (image checks only)
//   error     — other 4xx/5xx, network, timeout, DNS
async function checkUrl(rawUrl, expectImage) {
  const url = String(rawUrl || '').trim();
  if (!url) return null;
  let isImage = expectImage;
  const referer = /bookshop\.org/i.test(url) ? 'https://bookshop.org/'
    : /amazon\./i.test(url) ? 'https://www.amazon.com/' : undefined;
  const headers = { ...BROWSER_HEADERS };
  if (referer) headers.Referer = referer;
  if (isImage) {
    // The Sec-Fetch image headers are what get Bookshop's Ingram CDN to serve
    // covers instead of 403-ing a bare request (proven on a 90-item batch).
    headers.Accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
    headers['Sec-Fetch-Dest'] = 'image';
    headers['Sec-Fetch-Mode'] = 'no-cors';
    headers['Sec-Fetch-Site'] = 'cross-site';
  } else {
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Upgrade-Insecure-Requests'] = '1';
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers });
    const code = res.status;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (code >= 200 && code < 300) {
      if (isImage && !ct.startsWith('image/')) return { state: 'notimage', code, detail: ct || 'no content-type' };
      return { state: 'ok', code, detail: '' };
    }
    if (code === 404 || code === 410 || code === 451) return { state: 'dead', code, detail: '' };
    if (code === 403 || code === 429 || code === 503) return { state: 'blocked', code, detail: '' };
    return { state: 'error', code, detail: `HTTP ${code}` };
  } catch (e) {
    const name = e && (e.name || e.code) ? String(e.name || e.code) : 'fetch failed';
    return { state: 'error', code: 0, detail: name === 'AbortError' ? 'timeout' : name };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

function loadState() {
  if (!existsSync(HTM_PATH)) return { items: {} };
  try {
    const html = readFileSync(HTM_PATH, 'utf8');
    const m = html.match(/<script id="shoperrors-state" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return { items: {} };
    const parsed = JSON.parse(m[1]);
    return parsed && typeof parsed === 'object' && parsed.items ? parsed : { items: {} };
  } catch {
    return { items: {} };
  }
}

const HARD = new Set(['dead', 'error', 'notimage']); // counts as an error to fix

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildHtml(state, meta) {
  const items = Object.entries(state.items).map(([id, v]) => ({ id, ...v }));
  const errored = items.filter((it) =>
    HARD.has(it.urlState) || HARD.has(it.imageState));
  const blocked = items.filter((it) =>
    !HARD.has(it.urlState) && !HARD.has(it.imageState) &&
    (it.urlState === 'blocked' || it.imageState === 'blocked'));

  errored.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  blocked.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  const badgeFor = (field, st, code) => {
    if (!st || st === 'ok') return '';
    const label = st === 'dead' ? `${field} DEAD${code ? ' ' + code : ''}`
      : st === 'notimage' ? `${field} NOT-IMAGE`
      : st === 'blocked' ? `${field} blocked${code ? ' ' + code : ''}`
      : `${field} ERROR${code ? ' ' + code : ''}`;
    return `<span class="b b-${st}">${esc(label)}</span>`;
  };

  const rowFor = (it) => {
    const flags = [
      badgeFor('URL', it.urlState, it.urlCode),
      badgeFor('IMG', it.imageState, it.imageCode),
      it.urlDetail ? `<span class="dim">${esc(it.urlDetail)}</span>` : '',
      it.imageDetail ? `<span class="dim">${esc(it.imageDetail)}</span>` : '',
    ].filter(Boolean).join(' ');
    const links = [
      it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener nofollow">url</a>` : '',
      it.image_url ? `<a href="${esc(it.image_url)}" target="_blank" rel="noopener nofollow">img</a>` : '',
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td class="t">${esc(it.title || '(untitled)')}</td>
      <td>${flags}</td>
      <td class="l">${links}</td>
      <td class="dim">${esc(it.checkedAt || '')}</td>
    </tr>`;
  };

  const errorTable = errored.length
    ? `<table><thead><tr><th>Item</th><th>Problem</th><th>Links</th><th>Checked</th></tr></thead><tbody>${errored.map(rowFor).join('')}</tbody></table>`
    : `<p class="ok">No confirmed errors. 🎉</p>`;

  const blockedTable = blocked.length
    ? `<details><summary>${blocked.length} inconclusive (bot-blocked / rate-limited — not confirmed errors)</summary>
       <table><thead><tr><th>Item</th><th>Status</th><th>Links</th><th>Checked</th></tr></thead><tbody>${blocked.map(rowFor).join('')}</tbody></table></details>`
    : '';

  const checkedCount = items.filter((it) => it.checkedAt).length;
  const stateJson = JSON.stringify(state);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>Gift Shop · URL Error Report</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 14px/1.5 "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; background: #0b1018; color: #e8eef6; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .meta { color: #93a4ba; margin: 0 0 20px; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 22px; }
  .card { border: 1px solid #243044; border-radius: 8px; padding: 10px 14px; background: #111a27; }
  .card .n { font-size: 1.5rem; font-weight: 700; }
  .card .k { color: #93a4ba; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 22px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #1d2738; vertical-align: top; }
  th { color: #93a4ba; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
  td.t { font-weight: 600; max-width: 360px; }
  td.l a { color: #6db1ff; }
  .dim { color: #7f8ea3; font-size: 0.85em; }
  .ok { color: #66d088; font-weight: 700; }
  .b { display: inline-block; padding: 1px 7px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; margin: 1px 2px 1px 0; white-space: nowrap; }
  .b-dead, .b-notimage { background: #4a1620; color: #ff8e84; }
  .b-error { background: #4a3414; color: #ffc266; }
  .b-blocked { background: #1d2738; color: #93a4ba; }
  details summary { cursor: pointer; color: #93a4ba; margin: 8px 0; }
  a { color: #6db1ff; }
</style>
</head>
<body>
  <h1>Gift Shop · URL Error Report</h1>
  <p class="meta">Last run <strong>${esc(meta.date)} ${esc(meta.time)} ${esc(TZ)}</strong> ·
     checked the <strong>${meta.segment + 1}/7</strong> slice (${esc(meta.weekday)}) — ${meta.checkedThisRun} items.
     Each item is re-checked once a week. Coverage: <strong>${meta.fullCoverage ? 'full catalog' : 'published only (no service key — archived items skipped)'}</strong>.</p>
  <div class="cards">
    <div class="card"><div class="n">${errored.length}</div><div class="k">Errors</div></div>
    <div class="card"><div class="n">${blocked.length}</div><div class="k">Inconclusive</div></div>
    <div class="card"><div class="n">${checkedCount}</div><div class="k">Tracked</div></div>
  </div>
  ${errorTable}
  ${blockedTable}
  <p class="dim">DEAD = 404/410/451 · NOT-IMAGE = 200 but not an image · ERROR = other 4xx/5xx, timeout, DNS · blocked = 403/429/503 (anti-bot, inconclusive).</p>
  <script id="shoperrors-state" type="application/json">${stateJson}</script>
</body>
</html>
`;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const wk = weekdayInfo();
  const segment = process.env.SHOP_ERROR_SEGMENT != null && process.env.SHOP_ERROR_SEGMENT !== ''
    ? Math.max(0, Math.min(SEGMENTS - 1, parseInt(process.env.SHOP_ERROR_SEGMENT, 10)))
    : wk.segment;

  console.log(`[shop-error-check] ${wk.date} ${wk.time} ${TZ} — ${wk.weekday} → segment ${segment + 1}/7`);
  if (!USING_SERVICE_KEY) {
    console.warn('[shop-error-check] WARNING: no SUPABASE_SERVICE_KEY — using publishable key, which cannot see ARCHIVED items. Set the secret to check the whole catalog.');
  }

  const all = await fetchAllItems();
  all.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const N = all.length;
  const start = Math.floor((segment * N) / SEGMENTS);
  const end = Math.floor(((segment + 1) * N) / SEGMENTS);
  const slice = all.slice(start, end);
  console.log(`[shop-error-check] ${N} items total; checking ${slice.length} (rows ${start}..${end - 1}).`);

  const checkedAt = `${wk.date} ${wk.time}`;
  const state = loadState();

  await pool(slice, async (item) => {
    const [urlRes, imgRes] = await Promise.all([
      checkUrl(item.url, false),
      checkUrl(item.image_url, true),
    ]);
    state.items[item.id] = {
      title: item.title || '',
      url: item.url || '',
      image_url: item.image_url || '',
      archived: !!item.archived,
      urlState: urlRes ? urlRes.state : 'none',
      urlCode: urlRes ? urlRes.code : 0,
      urlDetail: urlRes ? urlRes.detail : '',
      imageState: imgRes ? imgRes.state : 'none',
      imageCode: imgRes ? imgRes.code : 0,
      imageDetail: imgRes ? imgRes.detail : '',
      checkedAt,
      segment,
    };
  }, CONCURRENCY);

  // Drop state for items that no longer exist in the catalog.
  const live = new Set(all.map((it) => String(it.id)));
  for (const id of Object.keys(state.items)) if (!live.has(id)) delete state.items[id];

  // Tally this run's slice.
  const runErrors = [];
  const runBlocked = [];
  for (const item of slice) {
    const s = state.items[item.id];
    if (!s) continue;
    const probs = [];
    if (HARD.has(s.urlState)) probs.push(`url ${s.urlState}${s.urlCode ? ' ' + s.urlCode : ''}${s.urlDetail ? ' (' + s.urlDetail + ')' : ''}`);
    if (HARD.has(s.imageState)) probs.push(`image ${s.imageState}${s.imageCode ? ' ' + s.imageCode : ''}${s.imageDetail ? ' (' + s.imageDetail + ')' : ''}`);
    if (probs.length) { runErrors.push({ title: s.title, probs, url: s.url, image_url: s.image_url }); continue; }
    if (s.urlState === 'blocked' || s.imageState === 'blocked') runBlocked.push(s.title);
  }

  const html = buildHtml(state, { ...wk, segment, checkedThisRun: slice.length, fullCoverage: USING_SERVICE_KEY });
  await writeFile(HTM_PATH, html, 'utf8');

  // Append a human-readable block to the log.
  const lines = [];
  lines.push(`=== ${wk.date} ${wk.time} ${TZ} · ${wk.weekday} · slice ${segment + 1}/7 · ${slice.length} items checked · coverage: ${USING_SERVICE_KEY ? 'full catalog' : 'published only'} ===`);
  lines.push(`errors: ${runErrors.length} · inconclusive(blocked): ${runBlocked.length} · ok: ${slice.length - runErrors.length - runBlocked.length}`);
  for (const e of runErrors) {
    lines.push(`  ! ${e.title || '(untitled)'}`);
    for (const p of e.probs) lines.push(`      ${p}`);
    if (e.url) lines.push(`      url:   ${e.url}`);
    if (e.image_url) lines.push(`      image: ${e.image_url}`);
  }
  if (runBlocked.length) lines.push(`  ~ blocked (inconclusive): ${runBlocked.join('; ')}`);
  lines.push('');
  const block = lines.join('\n') + '\n';
  const prev = existsSync(LOG_PATH) ? await readFile(LOG_PATH, 'utf8') : '# Gift Shop URL error log (newest first)\n\n';
  await writeFile(LOG_PATH, prev.split('\n', 1)[0].startsWith('#')
    ? prev.replace(/^(# .*\n\n)/, `$1${block}`)        // insert under the header (newest first)
    : block + prev, 'utf8');

  console.log(`[shop-error-check] done — ${runErrors.length} error(s), ${runBlocked.length} inconclusive this slice.`);
}

main().catch((e) => { console.error('[shop-error-check] FAILED:', e); process.exit(1); });
