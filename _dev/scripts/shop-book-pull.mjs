// shop-book-pull.mjs — nightly candidate-book generator for the gift shop.
//
// Each run asks Claude (with web search, so the ISBNs are real, not
// hallucinated) for a handful of books tied to one of our shop cities, then
// inserts them as ARCHIVED, unpublished candidates via the same
// tgb_import_bookshop_prompt_items RPC the Mission Control SEARCH PROMPT uses.
// An admin later reviews each candidate and either unarchives+publishes it or
// rejects it. Rejected rows are kept (never deleted), and both the RPC's
// url/title dedupe AND the prompt's avoid-list below skip them — so a rejected
// book is never suggested again.
//
// Zero dependencies: raw fetch, matching shop-error-check.mjs. Run by the
// .github/workflows/shop-book-pull.yml nightly job.
//
// Env:
//   SUPABASE_URL           Supabase REST endpoint (defaults to prod)
//   SUPABASE_SERVICE_KEY   REQUIRED — service role; RLS blocks anon writes to gift_shop_items
//   ANTHROPIC_API_KEY      REQUIRED — Claude API key
//   BOOK_PULL_COUNT        how many books to request (default 5)
//   BOOK_PULL_MODEL        model id (default claude-opus-4-8)
//   BOOK_PULL_TOPIC        override the rotating city/topic (optional)

const SB_URL = (process.env.SUPABASE_URL || 'https://qmaafbncpzrdmqapkkgr.supabase.co').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const COUNT = Math.max(1, Math.min(20, Number(process.env.BOOK_PULL_COUNT) || 5));
const MODEL = process.env.BOOK_PULL_MODEL || 'claude-opus-4-8';

if (!SB_KEY) { console.error('SUPABASE_SERVICE_KEY is required (RLS blocks anon writes).'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('ANTHROPIC_API_KEY is required.'); process.exit(1); }

const sbHeaders = (extra) => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...extra });

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders({ Accept: 'application/json' }) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ── 1. Pick tonight's city/topic and gather the avoid-list ──────────────────
function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

async function pickTopic() {
  if (process.env.BOOK_PULL_TOPIC) return { topic: process.env.BOOK_PULL_TOPIC, city: null };
  try {
    const cities = await sbGet('gift_shop_cities?select=city,archived&order=city.asc');
    const active = (cities || []).filter((c) => !c.archived && c.city).map((c) => c.city);
    if (active.length) {
      const city = active[dayOfYear(new Date()) % active.length];
      return { topic: city, city };
    }
  } catch (e) { console.warn('city fetch failed, using generic topic:', e.message); }
  return { topic: 'a notable American city, region, or travel destination', city: null };
}

async function avoidTitles() {
  // Rejected titles first (must-avoid), then a sample of everything else so the
  // model doesn't re-pitch books we already carry. Capped to bound the prompt.
  const out = [];
  const seen = new Set();
  const add = (rows) => (rows || []).forEach((r) => {
    const t = String(r.title || '').trim();
    const k = t.toLowerCase();
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  });
  try { add(await sbGet('gift_shop_items?select=title&rejected_at=not.is.null&limit=400')); } catch (e) {}
  try { add(await sbGet('gift_shop_items?select=title&order=created_at.desc&limit=400')); } catch (e) {}
  return out.slice(0, 300);
}

// ── 2. Ask Claude (with web search) for real books + ISBNs ──────────────────
async function callAnthropic(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      // web_search_20260209 (dynamic filtering) needs no beta header on Opus 4.8.
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function extractText(content) {
  return (content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function getBooks(topic, avoid) {
  const avoidBlock = avoid.length
    ? `\n\nDo NOT suggest any of these — we already carry them or have rejected them:\n- ${avoid.join('\n- ')}`
    : '';
  const prompt =
`Find ${COUNT} real books, available on Bookshop.org, that a traveler would love as a gift connected to: ${topic}.
Use web search to VERIFY each book exists and to get its real ISBN-13 — do not guess ISBNs.
Prefer a mix: local history, fiction set there, food/culture, a kids' pick.${avoidBlock}

When done, output ONLY a JSON array (no prose, no code fence) of objects with exactly these keys:
[{"title": "Book Title", "isbn": "9780000000000", "description": "one short original gift-shop blurb", "cities": ["${topic}"]}]`;

  let messages = [{ role: 'user', content: prompt }];
  for (let i = 0; i < 6; i++) {
    const res = await callAnthropic(messages);
    if (res.stop_reason === 'pause_turn') {
      // Server tool loop hit its cap mid-turn — resend to resume.
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    const text = extractText(res.content);
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end < start) throw new Error('no JSON array in model output:\n' + text.slice(0, 500));
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error('web search kept pausing without a final answer');
}

// ── 3. Insert as archived candidates via the shared import RPC ──────────────
function normalizeBooks(raw, city) {
  const items = [];
  (Array.isArray(raw) ? raw : []).forEach((b) => {
    const title = String((b && b.title) || '').trim();
    const isbn = String((b && b.isbn) || '').replace(/[^0-9Xx]/g, '');
    if (!title || (isbn.length !== 10 && isbn.length !== 13)) return;
    const cities = Array.isArray(b.cities) && b.cities.length ? b.cities : (city ? [city] : []);
    items.push({
      title,
      isbn,
      description: String((b && b.description) || '').slice(0, 700),
      cities,
    });
  });
  return items;
}

async function importItems(items) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/tgb_import_bookshop_prompt_items`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`import RPC → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  const { topic, city } = await pickTopic();
  console.log(`Tonight's topic: ${topic}`);
  const avoid = await avoidTitles();
  console.log(`Avoid-list: ${avoid.length} title(s)`);

  const raw = await getBooks(topic, avoid);
  const items = normalizeBooks(raw, city);
  if (!items.length) { console.log('Model returned no usable books. Done.'); return; }
  console.log(`Requesting import of ${items.length} candidate(s): ${items.map((i) => i.title).join(' · ')}`);

  const results = await importItems(items);
  const inserted = (results || []).filter((r) => r.action === 'inserted');
  const skipped = (results || []).filter((r) => r.action === 'skipped');
  inserted.forEach((r) => console.log(`  + inserted (archived): ${r.title}`));
  skipped.forEach((r) => console.log(`  · skipped (${r.note}): ${r.title || '(no title)'}`));
  console.log(`Done: ${inserted.length} new archived candidate(s), ${skipped.length} skipped.`);
})().catch((err) => { console.error('shop-book-pull failed:', err.message); process.exit(1); });
