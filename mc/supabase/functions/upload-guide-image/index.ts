// upload-guide-image — POST { url: string, gameId: string, bucket?: 'guides' | 'logos' }
//
// Fetches an image from an arbitrary URL server-side (no browser CORS limits),
// stores it in the given public bucket as `{gameId}.{ext}` (upsert), and
// returns its public URL. The mc/overview.html editor then records that URL in
// the matching games column (guide_image_url for 'guides', logo_url for
// 'logos') so the landing page / play-time engines / shop render it.
//
// `bucket` defaults to 'guides' so the original guide-image callers are
// unchanged; the logo uploader passes bucket: 'logos'. Both buckets are keyed
// by game id, so they must stay separate to avoid path collisions.
//
// Auth: requires the caller's JWT in the Authorization header AND that the JWT
// identifies a photo admin (via is_photo_admin()). The upload uses the service
// role internally.
//
// Setup:
//   1. Apply supabase/migrations/20260717_guides_bucket.sql (creates the bucket).
//   2. supabase functions deploy upload-guide-image
//
// Request body:
//   { "url": "https://…/portrait.png", "gameId": "chc2026atl" }
// Response:
//   { "url": "https://<project>.supabase.co/storage/v1/object/public/guides/chc2026atl.png?v=…",
//     "path": "chc2026atl.png" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_BUCKETS = ['guides', 'logos'];
const DEFAULT_BUCKET  = 'guides';
const MAX_BYTES    = 15 * 1024 * 1024; // 15 MB cap on source images
const FETCH_TIMEOUT_MS = 20000;

// content-type -> file extension for the images we accept.
const EXT_BY_MIME: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/gif':     'gif',
  'image/avif':    'avif',
  'image/svg+xml': 'svg',
  'image/x-icon':  'ico',
  'image/vnd.microsoft.icon': 'ico',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// gameId becomes part of a storage path; keep it to safe characters.
function sanitizeGameId(raw: string): string {
  return String(raw || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '').replace(/^\.+/, '').slice(0, 120);
}

// Pick an extension from the response content-type, falling back to the URL's
// own extension, then png.
function pickExtension(contentType: string, sourceUrl: string): string | null {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const urlExt = (sourceUrl.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  if (urlExt && Object.values(EXT_BY_MIME).includes(urlExt)) return urlExt;
  // Some CDNs serve images as application/octet-stream; allow if URL looked
  // like an image, otherwise reject.
  if (mime === 'application/octet-stream' && urlExt) return urlExt;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization header' });

  // Verify the caller is a photo admin (same gate as the other admin function).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_photo_admin');
  if (adminErr) return json(500, { error: 'admin check failed: ' + adminErr.message });
  if (!isAdmin)  return json(403, { error: 'not authorized' });

  let body: { url?: string; gameId?: string; bucket?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }

  const sourceUrl = String(body.url || '').trim();
  const gameId    = sanitizeGameId(body.gameId || '');
  const bucket    = String(body.bucket || DEFAULT_BUCKET).trim().toLowerCase();
  if (!sourceUrl)         return json(400, { error: 'missing url' });
  if (!gameId)            return json(400, { error: 'missing or invalid gameId' });
  if (!/^https?:\/\//i.test(sourceUrl)) return json(400, { error: 'url must be http(s)' });
  if (!ALLOWED_BUCKETS.includes(bucket)) return json(400, { error: 'bucket must be one of: ' + ALLOWED_BUCKETS.join(', ') });

  // --- Fetch the source image (server-side, so no browser CORS) -----------
  let sourceResp: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    sourceResp = await fetch(sourceUrl, { redirect: 'follow', signal: controller.signal });
  } catch (err) {
    return json(502, { error: 'could not fetch source url: ' + (err instanceof Error ? err.message : String(err)) });
  } finally {
    clearTimeout(timer);
  }
  if (!sourceResp.ok) return json(502, { error: 'source url returned ' + sourceResp.status });

  const contentType = sourceResp.headers.get('content-type') || '';
  const ext = pickExtension(contentType, sourceUrl);
  if (!ext) return json(415, { error: 'url is not a supported image (got "' + contentType + '")' });

  const buf = new Uint8Array(await sourceResp.arrayBuffer());
  if (!buf.length)            return json(502, { error: 'source url returned an empty body' });
  if (buf.length > MAX_BYTES) return json(413, { error: 'image is larger than 15 MB' });

  // --- Upload to the guides bucket with the service role ------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const path = `${gameId}.${ext}`;
  const uploadType = Object.keys(EXT_BY_MIME).find((m) => EXT_BY_MIME[m] === ext) || 'application/octet-stream';

  const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, {
    contentType: uploadType,
    upsert: true,
    cacheControl: '3600',
  });
  if (upErr) return json(500, { error: 'upload failed: ' + upErr.message });

  // Public URL + a cache-busting version param so replacing an existing image
  // isn't masked by a stale CDN copy.
  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
  const publicUrl = (pub?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`)
    + '?v=' + Date.now();

  return json(200, { url: publicUrl, path });
});
