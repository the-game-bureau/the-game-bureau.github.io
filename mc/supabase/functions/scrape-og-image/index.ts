// scrape-og-image — POST { url } -> { image, from, title? } | { image: null, reason }
//
// Reads a page's own share image server-side and hands back the absolute URL.
//
// WHY THIS EXISTS. `socials.image` is the one field that changes where a story
// can go: Instagram's API refuses a text-only post, so a candidate with no image
// reaches two of our three accounts instead of three. Until now the only way to
// fill it was to ask an AI to read the `og:image` meta tag while it had the
// article open, and that works or does not depending entirely on which AI you
// used. A browsing tool that returns the page SOURCE finds the tag in a second;
// one that returns a cleaned, summarised article has stripped the head before
// the model ever sees it, so it cannot comply and quietly files nothing. Grok
// was the reported case; the prompt now carries a fallback ladder for it, but a
// prompt cannot fix a tool's output.
//
// THE PAGE CANNOT DO THIS ITSELF, which is the whole reason it is a function.
// /mc/socials/ is static HTML on GitHub Pages and CORS forbids it reading
// another origin's markup. A server has no such rule.
//
// AUTH is the same gate socials-post and upload-guide-image use: the caller's
// own JWT, checked against is_photo_admin(). Not because the answer is secret —
// it is somebody else's public meta tag — but because an open URL-fetching
// endpoint on our project is a thing other people will find and use to make
// requests that look like they came from us.
//
// IT READS METADATA AND NOTHING ELSE. og:image, then twitter:image, then
// <link rel="image_src">. It will NOT go hunting for the biggest <img> on the
// page: that is guessing, and the standing rule everywhere in this system is
// that a guessed image address is worse than an absence, because an absence is
// visible and a wrong address looks exactly like a right one until a post goes
// out wearing a tracking pixel. When there is no usable tag it answers
// { image: null, reason }, which is an answer rather than an error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// A page's head is in the first few hundred KB or it is not a page we want.
// Capped so a stray link to a video file cannot hold a worker open streaming it.
const MAX_BYTES   = 512 * 1024;
const TIMEOUT_MS  = 12_000;

// Some outlets serve a stripped page to anything that does not look like a
// browser, and the og:image is exactly what they strip. This is the same
// courtesy the waypoint backfill pays Nominatim: identify honestly, do not
// pretend to be Chrome.
const UA = 'TheGameBureau-OGImage/1.0 (+https://thegamebureau.com; admin tooling)';

// NO PRIVATE HOSTS. Without this the function is a server-side request forgery
// tool: anyone who gets past the admin gate could point it at 169.254.169.254
// or a 10.x address and read something that is not on the public internet. The
// admin gate makes that unlikely rather than impossible, and "unlikely" is not
// the standard for this class of bug.
function isPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; why: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, why: 'that is not a URL' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, why: 'only http and https are read' };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' || host === '::1' || host.endsWith('.localhost') ||
    host.endsWith('.internal') || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, why: 'that address is not on the public internet' };
  }
  return { ok: true, url };
}

// Reads at most MAX_BYTES of the body as text and stops. Most of a news page is
// script and comments below the head, and none of it is wanted.
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let out = '';
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    // The head is over; nothing below it can carry a meta tag.
    if (/<\/head>/i.test(out)) break;
  }
  try { await reader.cancel(); } catch { /* already closed */ }
  return out;
}

// Attribute order is not fixed in real HTML: `<meta content="..." property="og:image">`
// is as legal as the other way round, and plenty of CMSes emit it. Matching only
// one order is how a scraper "works on every site I tested".
function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1] && m[1].trim()) return m[1].trim();
    }
  }
  return '';
}

function linkHref(html: string, rel: string): string {
  const m = html.match(new RegExp(`<link[^>]+rel\\s*=\\s*["']${rel}["'][^>]*?href\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m && m[1] ? m[1].trim() : '';
}

// Entities appear in real meta content, most often &amp; in a query string. An
// unescaped one produces a URL that 404s while looking perfectly correct.
function decodeEntities(v: string): string {
  return v
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

// A masthead is worse than nothing: it makes five different stories look
// identical in the queue and on the feed. Same judgement the prompts ask a
// model to make, applied here where it can be applied consistently.
const JUNK = /(logo|sprite|placeholder|default[-_.]|fallback|blank|1x1|pixel|spacer|avatar|favicon)/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization' });

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_photo_admin');
  if (adminErr) return json(500, { error: 'admin check failed: ' + adminErr.message });
  if (!isAdmin)  return json(403, { error: 'not authorized' });

  let body: { url?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }

  const raw = String(body.url ?? '').trim();
  if (!raw) return json(400, { error: 'url is required' });

  const checked = isPublicHttpUrl(raw);
  if (!checked.ok) return json(400, { error: checked.why });

  let html = '';
  let finalUrl = checked.url.toString();
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(finalUrl, {
      redirect: 'follow',
      signal: control.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    // Redirects are followed, so the page that answered may not be the page we
    // asked for. Relative image paths must resolve against THAT one.
    finalUrl = res.url || finalUrl;
    if (!res.ok) {
      return json(200, { image: null, reason: `the page answered HTTP ${res.status}`, finalUrl });
    }
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type && !type.includes('html') && !type.includes('xml')) {
      return json(200, { image: null, reason: `that address is ${type.split(';')[0]}, not a web page`, finalUrl });
    }
    html = await readCapped(res);
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? `the page did not answer within ${TIMEOUT_MS / 1000}s`
      : (err as Error).message;
    return json(200, { image: null, reason: msg, finalUrl });
  } finally {
    clearTimeout(timer);
  }

  // IN ORDER, AND METADATA ONLY. og:image is what every platform reads, so it
  // is what our card should show; the other two are what a site publishes when
  // it has not set og:image.
  let from = 'og:image';
  let found = metaContent(html, ['og:image:secure_url', 'og:image:url', 'og:image']);
  if (!found) { found = metaContent(html, ['twitter:image', 'twitter:image:src']); from = 'twitter:image'; }
  if (!found) { found = linkHref(html, 'image_src'); from = 'link rel=image_src'; }

  if (!found) {
    return json(200, {
      image: null,
      // The distinction the prompt asks a model to make, made here for certain:
      // this page genuinely has no share image, rather than us being unable to
      // look. Nothing to fix by trying a different AI.
      reason: 'that page publishes no share image (no og:image, twitter:image or image_src)',
      finalUrl,
    });
  }

  found = decodeEntities(found);

  let abs: string;
  try {
    // Resolved against the page that ANSWERED. A /media/x.jpg on a site that
    // redirected www -> apex must not be rebuilt on the address we started from.
    abs = new URL(found, finalUrl).toString();
  } catch {
    return json(200, { image: null, reason: 'the share image address could not be resolved', finalUrl });
  }

  if (!/^https?:\/\//i.test(abs)) {
    return json(200, { image: null, reason: 'the share image is not an http address', finalUrl });
  }
  if (JUNK.test(abs)) {
    // Reported rather than silently dropped: it IS the page's og:image, and a
    // human looking at the picture can overrule this in the box.
    return json(200, {
      image: abs,
      from,
      suspect: 'that looks like a logo or a placeholder rather than the story\'s own photograph',
      title: metaContent(html, ['og:title', 'twitter:title']) || undefined,
      finalUrl,
    });
  }

  return json(200, {
    image: abs,
    from,
    title: metaContent(html, ['og:title', 'twitter:title']) || undefined,
    finalUrl,
  });
});
