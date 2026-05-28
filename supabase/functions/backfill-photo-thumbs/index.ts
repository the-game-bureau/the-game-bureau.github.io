// backfill-photo-thumbs — POST { limit?: number, dry_run?: boolean }
//
// One-off / repeatable job that generates a small JPEG thumbnail next to
// every photo_submissions row that doesn't have one yet. New uploads get
// thumbnails generated client-side (see game/run/text and game/run/map
// engines); this function exists purely to fill in the gap for photos
// uploaded before that landed.
//
// Auth: requires the caller's JWT in the Authorization header AND that
// the JWT identifies a row in public.admin_users (via is_photo_admin()).
// Storage + DB writes use the service role internally.
//
// Behavior:
//   • Picks up to `limit` (default 50, max 200) rows where
//     thumb_storage_path is null, newest first.
//   • Downloads the original, decodes JPEG/PNG/GIF, resizes longest edge
//     to <= 600px, encodes JPEG at quality 75, uploads alongside the
//     original as `{stem}-thumb.jpg`, updates the row.
//   • Originals it can't decode (HEIC, WebP, corrupted) are reported in
//     `errors` and left alone — the reader already falls back to the
//     original for those rows.
//
// Setup:
//   supabase functions deploy backfill-photo-thumbs --no-verify-jwt
//
// Invocation (from a logged-in admin's browser console while on any
// page that holds a Supabase session):
//   const { data: { session } } = await supabaseClient.auth.getSession();
//   await fetch('https://<project>.supabase.co/functions/v1/backfill-photo-thumbs', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       Authorization: 'Bearer ' + session.access_token,
//       apikey: SUPABASE_ANON_OR_PUBLISHABLE_KEY
//     },
//     body: JSON.stringify({ limit: 100 })
//   }).then(r => r.json()).then(console.log);
//
// Call repeatedly until `scanned` comes back 0.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as decodeImage, Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const THUMB_MAX_EDGE  = 600;
const THUMB_QUALITY   = 75;
const DEFAULT_BATCH   = 50;
const MAX_BATCH       = 200;
const PHOTO_BUCKET    = 'game-photo-submissions';

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

function thumbPathFor(original: string): string {
  return String(original || '').replace(/\.[^./]+$/, '-thumb.jpg');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization header' });

  // Verify the caller is an admin. The user client forwards their JWT so
  // is_photo_admin() can read auth.jwt()->>'email' and check admin_users.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_photo_admin');
  if (adminErr) return json(500, { error: 'admin check failed: ' + adminErr.message });
  if (!isAdmin)  return json(403, { error: 'not authorized' });

  let body: { limit?: number; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const limit  = Math.max(1, Math.min(MAX_BATCH, Number(body.limit) || DEFAULT_BATCH));
  const dryRun = Boolean(body.dry_run);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rows, error: queryErr } = await admin
    .from('photo_submissions')
    .select('id, storage_bucket, storage_path, mime_type')
    .is('thumb_storage_path', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (queryErr) return json(500, { error: 'query failed: ' + queryErr.message });

  const result = {
    scanned:  rows?.length ?? 0,
    thumbed:  0,
    skipped:  0,
    failed:   0,
    dry_run:  dryRun,
    errors:   [] as { id: string; reason: string }[],
  };
  if (dryRun || !rows?.length) return json(200, result);

  for (const row of rows) {
    const id     = String(row.id);
    const bucket = row.storage_bucket || PHOTO_BUCKET;
    try {
      const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(row.storage_path);
      if (dlErr || !blob) throw new Error('download failed: ' + (dlErr?.message || 'no body'));

      const bytes = new Uint8Array(await blob.arrayBuffer());
      let image: Image;
      try {
        const decoded = await decodeImage(bytes);
        if (!(decoded instanceof Image)) throw new Error('not a still image');
        image = decoded;
      } catch (decodeErr) {
        result.skipped += 1;
        result.errors.push({
          id,
          reason: 'cannot decode (' + (row.mime_type || 'unknown') + '): '
                  + (decodeErr instanceof Error ? decodeErr.message : String(decodeErr)),
        });
        continue;
      }

      const longest = Math.max(image.width, image.height);
      if (longest > THUMB_MAX_EDGE) {
        const scale = THUMB_MAX_EDGE / longest;
        image.resize(Math.max(1, Math.round(image.width * scale)),
                     Math.max(1, Math.round(image.height * scale)));
      }
      const jpegBytes = await image.encodeJPEG(THUMB_QUALITY);

      const thumbPath = thumbPathFor(row.storage_path);
      const { error: upErr } = await admin.storage.from(bucket).upload(thumbPath, jpegBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (upErr) throw new Error('upload failed: ' + upErr.message);

      const { error: updErr } = await admin
        .from('photo_submissions')
        .update({ thumb_storage_path: thumbPath })
        .eq('id', id);
      if (updErr) throw new Error('row update failed: ' + updErr.message);

      result.thumbed += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return json(200, result);
});
