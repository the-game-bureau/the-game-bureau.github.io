#!/usr/bin/env node
// Nightly gift-shop Link/Image health check.
//
// Each run checks ONE SEVENTH of gift_shop_items — the slice keyed to the
// current weekday in America/Chicago (Monday = 1st seventh, Tuesday = 2nd, …,
// Sunday = 7th). Over a week every item is checked exactly once. For each item
// in the slice we test the gift's Link (`url`) and Image (`image_url`).
//
// Results are merged into a persistent per-item JSON state file (so other
// days' results survive), a compact summary JSON is refreshed for Stock Room,
// and a summary line is appended to mc/gifts/giftshop-errors.log.
//
// Admins can clear an issue from Stock Room — that decision is stored in
// Supabase (public.gift_shop_error_ignores), NOT in these generated files.
// Each run reads that table and keeps cleared items out of the issue counts.
//
// Reads only (anon publishable key). No secrets required. (The service-role key
// is preferred so Review/Shelved gifts — and the admin-only ignore list — are read.)
//
// Env overrides (optional):
//   SUPABASE_URL, SUPABASE_KEY  — Supabase REST endpoint + key
//   SHOP_ERROR_SEGMENT          — force a segment 0..6 (testing)
//   SHOP_ERROR_TZ               — IANA tz for weekday/stamp (default America/Chicago)
//   SHOP_ERROR_RENDER_ONLY=1    — re-emit JSON summaries from existing state (no URL checks)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// mc/_dev/scripts/ is three levels below the repo root; it was two until the 2026-08-06 move of _dev/ under mc/.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ADMIN_DIR = path.join(REPO_ROOT, 'mc', 'gifts');
const STATE_PATH = path.join(ADMIN_DIR, 'giftshop-errors-state.json');
const LOG_PATH = path.join(ADMIN_DIR, 'giftshop-errors.log');
// Machine-readable summary the gift admin fetches to show the ISSUES badge/filter.
const JSON_PATH = path.join(ADMIN_DIR, 'giftshop-errors.json');

const SB_URL = (process.env.SUPABASE_URL || 'https://qmaafbncpzrdmqapkkgr.supabase.co').replace(/\/+$/, '');
// Prefer the service-role key (bypasses RLS so hidden Review/Shelved items are checked too).
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

// The admin "ignore" list (gift_shop_error_ignores). Read with whatever key we
// have: the CI service-role key bypasses RLS; a local publishable-key run is
// denied by RLS and simply yields no ignores (best-effort — never fatal).
async function fetchIgnoredIds() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/gift_shop_error_ignores?select=item_id`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) {
      console.warn(`[shop-error-check] could not read ignores (${res.status}); treating as none.`);
      return new Set();
    }
    const rows = await res.json();
    return new Set((rows || []).map((r) => String(r.item_id)));
  } catch (e) {
    console.warn('[shop-error-check] ignore read failed; treating as none:', e && e.message ? e.message : e);
    return new Set();
  }
}

// Persisted AI coherence verdicts (gift_shop_coherence). Written by the report
// page's "AI audit" (via the shop-coherence-check Edge Function); read here so
// they survive the nightly regeneration. Same key rules as the ignore list:
// the CI service-role key bypasses RLS; a local publishable-key run is denied
// and yields none (best-effort — never fatal). Returns Map(id → verdict).
async function fetchCoherence() {
  try {
    const cols = 'item_id,verdict,summary,issues,image_matches,title_matches_page,city_ok,checked_at';
    const res = await fetch(`${SB_URL}/rest/v1/gift_shop_coherence?select=${cols}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) {
      console.warn(`[shop-error-check] could not read coherence (${res.status}); treating as none.`);
      return new Map();
    }
    const rows = await res.json();
    const m = new Map();
    for (const r of rows || []) {
      m.set(String(r.item_id), {
        verdict: r.verdict || 'warn',
        summary: r.summary || '',
        issues: Array.isArray(r.issues) ? r.issues : [],
        imageMatches: r.image_matches,
        titleMatchesPage: r.title_matches_page,
        cityOk: r.city_ok,
        checkedAt: r.checked_at || '',
      });
    }
    return m;
  } catch (e) {
    console.warn('[shop-error-check] coherence read failed; treating as none:', e && e.message ? e.message : e);
    return new Map();
  }
}

// Fold stored verdicts onto the per-item state (and drop any that were cleared),
// so they're embedded in the page + rendered into the mismatch section.
function mergeCoherence(state, coherence) {
  for (const id of Object.keys(state.items)) {
    const v = coherence.get(id);
    if (v) state.items[id].coherence = v;
    else if (state.items[id].coherence) delete state.items[id].coherence;
  }
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
  if (!existsSync(STATE_PATH)) return { items: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.items ? parsed : { items: {} };
  } catch {
    return { items: {} };
  }
}

const HARD = new Set(['dead', 'error', 'notimage']); // counts as an error to fix

// Preserve the previous run stamp during render-only regeneration instead of
// stamping a re-render as if it were a fresh slice check.
function readExistingMeta() {
  if (!existsSync(JSON_PATH)) return null;
  try {
    const summary = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    if (!summary || typeof summary !== 'object') return null;
    return {
      date: summary.date || '',
      time: summary.time || '',
      segment: Number.isFinite(Number(summary.segment)) ? Number(summary.segment) : 0,
      weekday: summary.weekday || '',
      checkedThisRun: Number.isFinite(Number(summary.checkedThisRun)) ? Number(summary.checkedThisRun) : 0,
      fullCoverage: !!summary.fullCoverage,
      full: !!summary.full,
    };
  } catch {
    return null;
  }
}
// Counts for the gift admin summary JSON.
function summarize(state, ignoredIds, meta) {
  const ignoreSet = ignoredIds instanceof Set ? ignoredIds : new Set(ignoredIds || []);
  const items = Object.entries(state.items).map(([id, v]) => ({ id, ...v }));
  const isError = (it) => HARD.has(it.urlState) || HARD.has(it.imageState);
  const isBlocked = (it) => !isError(it) && (it.urlState === 'blocked' || it.imageState === 'blocked');
  const flagged = items.filter((it) => isError(it) || isBlocked(it));
  const notIgnored = (it) => !ignoreSet.has(String(it.id));
  const errorItems = flagged.filter((it) => isError(it) && notIgnored(it));
  return {
    // The ids too, so the Stock Room's ISSUES badge can re-check this snapshot
    // against live data instead of quoting a number that is a day old.
    errorIds:     errorItems.map((it) => String(it.id)),
    errors:       errorItems.length,
    inconclusive: flagged.filter((it) => isBlocked(it) && notIgnored(it)).length,
    ignored:      flagged.filter((it) => ignoreSet.has(String(it.id))).length,
    mismatches:   items.filter((it) => it.coherence && it.coherence.verdict && it.coherence.verdict !== 'ok').length,
    tracked:      items.length,
    date:         (meta && meta.date) || '',
    time:         (meta && meta.time) || '',
    tz:           TZ,
    segment:      meta && Number.isFinite(Number(meta.segment)) ? Number(meta.segment) : 0,
    weekday:      (meta && meta.weekday) || '',
    checkedThisRun: meta && Number.isFinite(Number(meta.checkedThisRun)) ? Number(meta.checkedThisRun) : 0,
    fullCoverage: !!(meta && meta.fullCoverage),
    full:         !!(meta && meta.full),
  };
}

async function writeState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function writeSummary(state, ignoredIds, meta) {
  await writeFile(JSON_PATH, JSON.stringify(summarize(state, ignoredIds, meta), null, 2) + '\n', 'utf8');
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const wk = weekdayInfo();

  // Render-only: re-emit JSON from the existing state (+ current ignore list)
  // WITHOUT hitting gift Links or re-fetching all gifts. Used after summary
  // format changes. `node ...` with SHOP_ERROR_RENDER_ONLY=1.
  if (process.env.SHOP_ERROR_RENDER_ONLY === '1') {
    const state = loadState();
    const ignoredIds = await fetchIgnoredIds();
    mergeCoherence(state, await fetchCoherence());
    const checkedCount = Object.values(state.items).filter((it) => it.checkedAt).length;
    // Preserve the real run stamp; a re-render did not check anything.
    const meta = readExistingMeta() || { ...wk, segment: wk.segment, checkedThisRun: 0, fullCoverage: USING_SERVICE_KEY };
    await writeState(state);
    await writeSummary(state, ignoredIds, meta);
    console.log(`[shop-error-check] render-only - rewrote ${STATE_PATH} and ${JSON_PATH} (${checkedCount} tracked, ${ignoredIds.size} ignored).`);
    return;
  }

  const segment = process.env.SHOP_ERROR_SEGMENT != null && process.env.SHOP_ERROR_SEGMENT !== ''
    ? Math.max(0, Math.min(SEGMENTS - 1, parseInt(process.env.SHOP_ERROR_SEGMENT, 10)))
    : wk.segment;
  // Manual "full recheck" (from the report's Run-check button / workflow_dispatch
  // input): sweep ALL gifts this run instead of today's 1/7 slice.
  const runFull = /^(1|true|yes)$/i.test(String(process.env.SHOP_ERROR_FULL || ''));

  console.log(`[shop-error-check] ${wk.date} ${wk.time} ${TZ} — ${runFull ? 'FULL manual recheck' : wk.weekday + ' → segment ' + (segment + 1) + '/7'}`);
  if (!USING_SERVICE_KEY) {
    console.warn('[shop-error-check] WARNING: no SUPABASE_SERVICE_KEY — using publishable key, which cannot see Review/Shelved gifts. Set the secret to check all gifts.');
  }

  const all = await fetchAllItems();
  all.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const N = all.length;
  const start = Math.floor((segment * N) / SEGMENTS);
  const end = Math.floor(((segment + 1) * N) / SEGMENTS);
  const slice = runFull ? all : all.slice(start, end);
  console.log(`[shop-error-check] ${N} gifts total; checking ${slice.length}${runFull ? ' (all gifts)' : ` (rows ${start}..${end - 1})`}.`);

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

  // Drop state for gifts that no longer exist.
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

  const ignoredIds = await fetchIgnoredIds();
  mergeCoherence(state, await fetchCoherence());
  const runMeta = { ...wk, segment, checkedThisRun: slice.length, fullCoverage: USING_SERVICE_KEY, full: runFull };
  await writeState(state);
  await writeSummary(state, ignoredIds, runMeta);

  // Append a human-readable block to the log.
  const lines = [];
  lines.push(`=== ${wk.date} ${wk.time} ${TZ} · ${runFull ? 'FULL manual recheck' : wk.weekday + ' · slice ' + (segment + 1) + '/7'} · ${slice.length} gifts checked · coverage: ${USING_SERVICE_KEY ? 'all gifts' : 'Live gifts only'} ===`);
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
