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
//   0. THE THING THAT COST A WHOLE DAY: the app and the Page must live in the
//      SAME business portfolio. They did not.
//        The Game Bureau Page   business_id 2149033605346629, page_id 332940318805
//        "TGB Social Bot" app   business_id  274906455556188
//      A system user can only be granted assets inside its own portfolio, so no
//      combination of permissions or token types can bridge that gap. The
//      symptoms never said so: /me/accounts returned 15 personally-owned Pages
//      and simply omitted this one, every permission showed as granted, and a
//      post to the wrong Page succeeded with a real id.
//      The Page also has commerce enabled, which locks it to its portfolio --
//      "Commerce accounts must connect to a business account" when you try to
//      move it. So the app moves to the Page, never the reverse: create the app
//      from INSIDE portfolio 2149033605346629 and build the system user there.
//
//   1. Meta Business Suite: have the Page, and an Instagram account converted to
//      Business/Creator and LINKED to that Page. Instagram will not publish via
//      API from a personal account.
//   2. developers.facebook.com: the app is "TGB Social Bot", App ID
//      4578203955831555, type Business, left in Development mode. (Two earlier
//      attempts, "TGB Socials" and one unnamed, were abandoned -- the first on a
//      chain of console gates, the second after its token turned out to be for
//      the wrong Page. Neither is in use.) Under the CONTENT MANAGEMENT filter
//      -- not the Featured six, none of which is right -- add BOTH:
//        "Manage everything on your Page"          -> pages_manage_posts,
//                                                     pages_read_engagement
//        "Manage messaging & content on Instagram" -> instagram_basic,
//                                                     instagram_content_publish
//      pages_show_list is also required: it is what makes /me/accounts list the
//      Page, and it is easy to miss because it does not sound like posting.
//
//      TWO INSTAGRAM APIS EXIST and that use case lists permissions for both in
//      one alphabetical run, so instagram_basic and instagram_business_basic sit
//      a few rows apart looking interchangeable. Take the Facebook-login pair:
//        instagram_basic + instagram_content_publish   <- Page token,
//            graph.facebook.com. This is what this function implements.
//        instagram_business_basic + instagram_business_content_publish
//            <- Instagram-login flavour, separate token, graph.instagram.com.
//            Different code entirely; do not add these.
//      Same fork in the use case's left nav: pick "API setup with Facebook
//      login", not "...with Instagram login".
//
//      NOT "Authenticate and request data from users with Facebook Login" from
//      the Featured list: that logs OUR VISITORS into OUR app, a different thing
//      from posting as the brand, and it grants none of the five.
//
//      Development mode is enough to post to our OWN Page and Instagram. App
//      Review governs acting on someone else's accounts, which we never do.
//   3. Get a PAGE token that does not expire. The ORDER is the whole trick --
//      the same /me/accounts call yields a token that lasts an hour or one
//      that lasts indefinitely, depending only on which token you call it
//      with. Do not shortcut it.
//        a. Graph API Explorer, app 28060607810255562, tick the five permissions,
//           Generate Access Token  -> SHORT-LIVED USER token.
//        b. Exchange it for a LONG-LIVED USER token (App ID + App Secret are
//           in App settings -> Basic):
//             GET /oauth/access_token?grant_type=fb_exchange_token
//               &client_id=<APP_ID>&client_secret=<APP_SECRET>
//               &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>
//        c. GET /me/accounts?access_token=<LONG_LIVED_USER_TOKEN> and take the
//           access_token on the Page. Derived from a long-lived user token it
//           does not expire; derived from a short-lived one it dies in about
//           an hour, with no error until it does.
//        d. Verify before storing -- this must return the IG account too:
//             GET /me?fields=id,name,instagram_business_account{id,username}
//           A missing instagram_business_account means you have a USER token,
//           not a Page token. metaIds() below makes the same check at runtime.
//      Neither "Become a Tech Provider" nor publishing the app is needed: both
//      are about acting on OTHER businesses accounts. Development mode already
//      posts to our own Page and Instagram.
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

  // `me` on a PAGE token is the Page itself. On a user token it is the user.
  const url = `${GRAPH}/me?fields=id,name,instagram_business_account{id,username}` +
              `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `token check failed: HTTP ${res.status}`);
  if (!data?.id) throw new Error('token resolved to no id');

  // A MISSING INSTAGRAM ACCOUNT IS NOT AN ERROR HERE. This used to throw, which
  // meant a Page with no reachable Instagram could not post to FACEBOOK either
  // -- the two are independent, and Facebook needs nothing from this field. The
  // absence is recorded as an empty igUserId and reported by postInstagram, so
  // one broken destination cannot take the working one down with it.
  //
  // Three things produce an empty value and they are not distinguishable here:
  //   - the token is a user token, not a Page token
  //   - the Instagram account is not linked to this Page
  //   - instagram_basic was not granted, so the field is simply not returned
  // Guessing between them in an error message sends people to the wrong screen,
  // so postInstagram names all three and postFacebook proceeds regardless.
  resolved = {
    pageId: META_PAGE_ID || String(data.id),
    igUserId: META_IG_USER_ID || String(data?.instagram_business_account?.id ?? ''),
  };
  return resolved;
}

// `apikey` is the one that matters and the one that is easy to miss: it is NOT
// a CORS-safelisted header, so if it is absent from this list the browser fails
// the preflight and the request never leaves the page. The symptom is a bare
// "Failed to fetch" with no status and nothing in the function's logs, which
// reads like the function is down rather than like a header problem.
// authHeaders() in /mc/socials/ sends apikey, Authorization and Accept; Accept
// is safelisted, the other two are not. x-client-info is included because the
// Supabase JS client adds it and a future caller may go through that.
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
    if (!igUserId) {
      throw new Error(
        'no Instagram account resolved from this token. Check, in order: ' +
        'instagram_basic was granted when the token was generated; the Instagram ' +
        'account is linked to this Page in business.facebook.com; the token is a ' +
        'PAGE token, not a user token.'
      );
    }
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

  let body: { id?: string; platforms?: string[]; diagnose?: boolean } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }

  // { diagnose: true } -- answer "what does this token actually point at?" and
  // post nothing. Added because a post can succeed, return a real id, and still
  // be invisible on the Page you are looking at: if the stored token is a USER
  // token, /me resolves to the person rather than the Page, and the post lands
  // on their own feed. From the outside that is indistinguishable from a post
  // that failed silently. Returns no secret -- an id, a name, and a type.
  if (body.diagnose) {
    try {
      const probe = await fetch(
        `${GRAPH}/me?fields=id,name,category,instagram_business_account{id,username}` +
        `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`
      );
      const d = await probe.json().catch(() => ({}));
      if (!probe.ok) return json(200, { diagnose: true, error: d?.error?.message || `HTTP ${probe.status}` });
      return json(200, {
        diagnose: true,
        id: d?.id ?? null,
        name: d?.name ?? null,
        // A Page has a category; a user does not. This is the tell.
        looksLike: d?.category ? 'PAGE token' : 'USER token (wrong -- see setup notes)',
        category: d?.category ?? null,
        instagram: d?.instagram_business_account
          ? { id: d.instagram_business_account.id, username: d.instagram_business_account.username }
          : null,
        tokenSet: !!META_PAGE_TOKEN,
      });
    } catch (err) {
      return json(200, { diagnose: true, error: (err as Error).message });
    }
  }

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
