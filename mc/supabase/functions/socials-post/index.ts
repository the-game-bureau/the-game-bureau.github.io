// socials-post — POST { id, platforms: ["facebook","instagram", ...] }
//
// Posts an approved social candidate to Meta, on a human's click in
// /mc/socials/. The page holds no credentials and never will: it is static HTML
// in a public repo, so a token in it is a published token. The tokens live here,
// as Supabase secrets, the same arrangement stripe-webhook and gs-send-code use.
//
// Auth: requires the caller's JWT AND that the JWT is a photo admin (via
// is_photo_admin()), the same gate upload-guide-image uses. The row is then read
// and written with the service role. A human decides; this only carries it out.
//
// WHAT IT WILL AND WILL NOT POST
//   facebook   POST /{page-id}/feed        link post, caption + url. Works with
//                                          a text-only candidate.
//   instagram  POST /{ig-user-id}/media    then /media_publish. REQUIRES an
//                                          image: the Content Publishing API
//                                          refuses text-only posts outright, so
//                                          a candidate with no `image` is
//                                          reported as skipped, not failed.
//   x          not handled here. Different API, different credentials, and it
//              is not part of the Meta Business setup.
//   youtube    never. The Data API uploads videos and Community posts have no
//              public API, so there is no text-post path to build.
//
// PARTIAL SUCCESS IS THE NORMAL CASE. Two platforms, two independent calls,
// either can fail on its own. The response therefore reports per platform and
// the caller records only what actually went out — a Facebook success is not
// rolled back because Instagram was refused.
//
// Setup (all in business.facebook.com + developers.facebook.com):
//   1. Meta Business Suite: have the Page, and an Instagram account converted to
//      Business/Creator and LINKED to that Page. Instagram will not publish via
//      API from a personal account.
//   2. developers.facebook.com: the app is "TGB Socials". Add use cases from
//      the CONTENT MANAGEMENT filter, not the Featured six -- none of those
//      is right. You need the Page-management use case (pages_manage_posts,
//      pages_read_engagement) AND the Instagram-publishing one
//      (instagram_basic, instagram_content_publish). Meta renames these
//      labels often; match on what they grant, not on the wording.
//      NOT Facebook Login -- that authenticates your visitors, which is a
//      different thing from posting as the brand.
//      These need App Review before they work for anyone but you.
//   3. Generate a PAGE access token (not a user token) and exchange it for a
//      long-lived one. A short-lived token expires in about an hour and this
//      function has no refresh flow.
//   4. supabase secrets set META_PAGE_ACCESS_TOKEN=...
//      That is the ONLY required secret. The Page id and the Instagram user
//      id are read back off the token (see metaIds below), because a
//      hand-copied numeric id that is wrong does not error -- it posts to the
//      wrong place or to nothing. META_PAGE_ID / META_IG_USER_ID remain as
//      overrides for pointing at a different Page, and are not needed.
//   5. supabase functions deploy socials-post
//
// Then flip facebook / instagram to true in PLATFORM_AUTOPOST in
// mc/socials/index.html. Until that flip the page keeps Post disabled, so this
// function being undeployed is never a broken button.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const META_PAGE_ID     = Deno.env.get('META_PAGE_ID') ?? '';
const META_PAGE_TOKEN  = Deno.env.get('META_PAGE_ACCESS_TOKEN') ?? '';
const META_IG_USER_ID  = Deno.env.get('META_IG_USER_ID') ?? '';

// Pinned rather than floating: Meta deprecates versions on a schedule, and a
// silent bump can change field behaviour under a working integration.
const GRAPH = 'https://graph.facebook.com/v21.0';

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── Page id and Instagram user id are DERIVED from the token ────────────────
// Both secrets are optional. A Page access token already knows which Page it is
// for, and a Page that has an Instagram account linked to it in Business Suite
// exposes that account's id as `instagram_business_account`. Asking a human to
// find two numeric ids and paste them correctly is two chances to be silently
// wrong -- a mistyped id does not error, it posts to the wrong place or to
// nothing. Setting META_PAGE_ID / META_IG_USER_ID still wins if you need to
// point at something other than the token's own Page.
//
// Resolved once per cold start and cached: these ids never change for a given
// token, and doing it per request would add two Graph round-trips to every post.
let resolved: { pageId: string; igUserId: string } | null = null;

async function metaIds(): Promise<{ pageId: string; igUserId: string }> {
  if (resolved) return resolved;
  if (META_PAGE_ID && META_IG_USER_ID) {
    resolved = { pageId: META_PAGE_ID, igUserId: META_IG_USER_ID };
    return resolved;
  }
  if (!META_PAGE_TOKEN) throw new Error('META_PAGE_ACCESS_TOKEN is not set');

  // `me` on a PAGE token is the Page itself. On a user token it is the user,
  // which is why the error below names the distinction -- it is the single most
  // common setup mistake and the symptom is otherwise baffling.
  const url = `${GRAPH}/me?fields=id,name,instagram_business_account{id,username}` +
              `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `token check failed: HTTP ${res.status}`);
  if (!data?.id) throw new Error('token resolved to no id');
  if (data.instagram_business_account === undefined && !META_IG_USER_ID) {
    // A user token answers here too, just with no Page fields -- so say what to
    // check rather than reporting a missing Instagram link that may not be the
    // real problem.
    throw new Error(
      'no instagram_business_account on this token. Either it is a USER token ' +
      '(you need a PAGE token), or the Instagram account is not linked to the Page.'
    );
  }
  resolved = {
    pageId: META_PAGE_ID || String(data.id),
    igUserId: META_IG_USER_ID || String(data?.instagram_business_account?.id ?? ''),
  };
  return resolved;
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

type Outcome = { platform: string; ok: boolean; id?: string; error?: string; skipped?: boolean };

/** Caption + blank line + link — the same shape the admin puts on the clipboard,
 *  so what goes out by machine reads identically to what goes out by hand. */
function captionFor(row: { blurb?: string; url?: string }): string {
  return [String(row.blurb ?? '').trim(), String(row.url ?? '').trim()]
    .filter(Boolean)
    .join('\n\n');
}

async function graph(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params);
  const res  = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Meta nests the useful part; surface it rather than a bare status.
    const msg = data?.error?.message || data?.error?.type || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function postFacebook(row: any): Promise<Outcome> {
  try {
    const { pageId } = await metaIds();
    // `link` gives the native preview card; `message` is the caption above it.
    const params: Record<string, string> = {
      message: String(row.blurb ?? '').trim(),
      access_token: META_PAGE_TOKEN,
    };
    const url = String(row.url ?? '').trim();
    if (url) params.link = url;
    const out = await graph(`${pageId}/feed`, params);
    return { platform: 'facebook', ok: true, id: out?.id };
  } catch (err) {
    return { platform: 'facebook', ok: false, error: (err as Error).message };
  }
}

async function postInstagram(row: any): Promise<Outcome> {
  const image = String(row.image ?? '').trim();
  if (!image) {
    // Not a failure — a fact about the candidate. IG cannot take a text-only
    // post, so this one has to go out by hand or not at all.
    return {
      platform: 'instagram',
      ok: false,
      skipped: true,
      error: 'no image on this candidate; Instagram cannot post text-only',
    };
  }
  try {
    const { igUserId } = await metaIds();
    if (!igUserId) throw new Error('no Instagram account linked to this Page');
    // Two steps, always: create an unpublished container, then publish it.
    const container = await graph(`${igUserId}/media`, {
      image_url: image,
      caption: captionFor(row),
      access_token: META_PAGE_TOKEN,
    });
    if (!container?.id) throw new Error('no container id returned');
    const out = await graph(`${igUserId}/media_publish`, {
      creation_id: String(container.id),
      access_token: META_PAGE_TOKEN,
    });
    return { platform: 'instagram', ok: true, id: out?.id };
  } catch (err) {
    return { platform: 'instagram', ok: false, error: (err as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization' });

  // Admin gate, same shape as upload-guide-image: the caller's own JWT is used
  // for the check so the answer is about them, not about the service role.
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_photo_admin');
  if (adminErr) return json(500, { error: 'admin check failed: ' + adminErr.message });
  if (!isAdmin)  return json(403, { error: 'not authorized' });

  let body: { id?: string; platforms?: string[] } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }

  const id = String(body.id ?? '').trim();
  if (!id) return json(400, { error: 'id is required' });

  const wanted = (Array.isArray(body.platforms) ? body.platforms : [])
    .map((p) => String(p).toLowerCase().trim())
    .filter((p) => p === 'facebook' || p === 'instagram');
  if (!wanted.length) return json(400, { error: 'no supported platform requested' });

  const { data: row, error: rowErr } = await supa
    .from('socials').select('*').eq('id', id).maybeSingle();
  if (rowErr) return json(500, { error: 'lookup failed: ' + rowErr.message });
  if (!row)   return json(404, { error: 'candidate not found' });

  // Sequential, not Promise.all: two writes to the same brand seconds apart is
  // enough for Meta to rate-limit, and a partial result is easier to read when
  // the order is deterministic.
  const results: Outcome[] = [];
  if (wanted.includes('facebook'))  results.push(await postFacebook(row));
  if (wanted.includes('instagram')) results.push(await postInstagram(row));

  const posted = results.filter((r) => r.ok).map((r) => r.platform);

  // The row is stamped here, by the service role, so the receipt cannot
  // disagree with what actually happened -- the client never decides this.
  if (posted.length) {
    const labels = posted.map((p) => (p === 'facebook' ? 'Facebook' : 'Instagram'));
    const existing: string[] = Array.isArray(row.posted_platforms) ? row.posted_platforms : [];
    const merged = Array.from(new Set([...existing, ...labels]));
    const { error: upErr } = await supa
      .from('socials')
      .update({ status: 'posted', posted_platforms: merged })
      .eq('id', id);
    if (upErr) {
      // It genuinely went out; say so, and say the bookkeeping failed.
      return json(207, { posted, results, warning: 'posted, but marking the row failed: ' + upErr.message });
    }
  }

  // 200 even on a total failure: the call itself succeeded and the body says
  // what happened per platform. The caller decides what to show.
  return json(200, { posted, results });
});
