// socials-post — POST { id, platforms: ["facebook","instagram", ...] }
//
// Posts an approved social candidate to Meta, on a human's click in
// /mc/socializer/. The page holds no credentials and never will: it is static HTML
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
//   instagram  POST /{ig-user-id}/media, WAIT for the container to finish,
//                                          then /media_publish. REQUIRES an
//                                          image: the Content Publishing API
//                                          refuses text-only posts outright, so
//                                          a candidate with no `image` is
//                                          reported as skipped, not failed.
//                                          The wait is not optional - see
//                                          waitForContainer.
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
// mc/socializer/index.html. Until that flip the page keeps Post disabled, so this
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

// THREADS IS A DIFFERENT API AND A DIFFERENT CREDENTIAL, which is the whole
// reason it is not folded in with the other two. It does not live on
// graph.facebook.com, a Page token cannot reach it, and the Instagram user id
// is not the Threads user id. It needs its own token, issued against the
// Threads scopes (threads_basic + threads_content_publish), and its own id.
//
//   supabase secrets set THREADS_USER_ID=...
//   supabase secrets set THREADS_ACCESS_TOKEN=...
//
// Get both from developers.facebook.com -> your app -> Use cases -> Threads
// API, with the Threads account linked. GET https://graph.threads.net/v1.0/me
// ?fields=id,username&access_token=... answers with the id and confirms the
// token reaches the right account before anything is posted.
//
// UNLIKE INSTAGRAM, THREADS TAKES TEXT-ONLY POSTS (media_type=TEXT), so a
// candidate with no image is a normal post here rather than a skip. With an
// image it posts media_type=IMAGE instead.
const THREADS       = 'https://graph.threads.net/v1.0';
const THREADS_USER  = Deno.env.get('THREADS_USER_ID') ?? '';
const THREADS_TOKEN = Deno.env.get('THREADS_ACCESS_TOKEN') ?? '';

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── THE THREADS TOKEN EXPIRES, AND NOTHING ELSE HERE DOES ───────────────────
// The Meta Page token is a System User token and lasts forever; Stripe's and
// Resend's keys never rotate. A Threads token is long-lived, which means 60
// DAYS. On day 61 Post fails, and the failure names an invalid token rather
// than an expiry, so the obvious reading is that something was misconfigured
// rather than that a clock ran out.
//
// Refreshing is a single GET that exchanges the current token for a new 60-day
// one. The awkward part is not the call, it is where the answer goes: an Edge
// Function cannot write its own secrets, so a refreshed token would be
// discarded at the end of the request and the next call would refresh the same
// dying token again. It is persisted to public.integration_tokens instead
// (2026080905), which the service role can write and nothing else can read.
//
// THE SECRET SEEDS THE ROW AND IS THEN IGNORED. Once a row exists it wins, so
// `supabase secrets set THREADS_ACCESS_TOKEN=...` alone will NOT take effect --
// delete the row first:
//   delete from public.integration_tokens where key = 'threads';
//
// TWO LIMITS OF THIS, BOTH DELIBERATE.
//   - It refreshes on POSTING, not on a schedule. Nothing here runs unattended,
//     so a token still dies if nobody posts for 60 days. That is the cheap
//     version and it fits the actual usage: the socials bot files candidates
//     twice a day and they get posted. If posting ever goes quiet for two
//     months, the fix is a cron, not more code here.
//   - Threads refuses to refresh a token less than 24 HOURS old. A freshly
//     seeded token therefore cannot be refreshed on its first day, which is why
//     a failed refresh is never fatal: it logs and carries on with the token it
//     has, and the next post tries again.
const THREADS_TOKEN_KEY = 'threads';
// Refresh with a week in hand. Wide enough that a quiet fortnight cannot strand
// it, narrow enough that a token is not being exchanged every single post.
const THREADS_REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
// What a Threads long-lived token is worth when it is issued. Used only to
// ESTIMATE the expiry of a token seeded from the secret, whose real issue date
// nobody recorded. An overestimate is the safe direction: it refreshes a little
// later than it might have, still weeks before the token actually dies.
const THREADS_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;

// Resolved once per cold start. Refreshing is idempotent but not free, and two
// posts in one request must not exchange the token twice.
let threadsTokenCache: string | null = null;

async function readStoredThreadsToken(): Promise<{ token: string; expiresAt: number } | null> {
  // A missing table is not an error. The migration may not have been applied on
  // whichever project this is deployed to, and the honest fallback is exactly
  // the behaviour that existed before this code: use the secret, do not refresh.
  const { data, error } = await supa
    .from('integration_tokens')
    .select('token,expires_at')
    .eq('key', THREADS_TOKEN_KEY)
    .maybeSingle();
  if (error || !data?.token) return null;
  return {
    token: String(data.token),
    expiresAt: data.expires_at ? Date.parse(String(data.expires_at)) : 0,
  };
}

async function storeThreadsToken(token: string, expiresAt: number): Promise<void> {
  const { error } = await supa.from('integration_tokens').upsert({
    key: THREADS_TOKEN_KEY,
    token,
    expires_at: new Date(expiresAt).toISOString(),
    refreshed_at: new Date().toISOString(),
  });
  // Worth saying loudly: a token that refreshed but did not save means the same
  // exchange runs again next time. It still posts, so it is not fatal.
  if (error) console.error('threads: refreshed but could not store token:', error.message);
}

/** Exchange a long-lived token for a new one. Returns null if Threads refuses —
 *  most often because the token is under 24 hours old, which is normal. */
async function refreshThreadsToken(token: string): Promise<{ token: string; expiresAt: number } | null> {
  try {
    const qs = new URLSearchParams({ grant_type: 'th_refresh_token', access_token: token });
    const res  = await fetch(`https://graph.threads.net/refresh_access_token?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      console.error('threads: refresh declined:', data?.error?.message || `HTTP ${res.status}`);
      return null;
    }
    // expires_in is seconds. Trust it over the 60-day constant when given.
    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : THREADS_TOKEN_LIFETIME_MS;
    return { token: String(data.access_token), expiresAt: Date.now() + ttl };
  } catch (err) {
    console.error('threads: refresh failed:', (err as Error).message);
    return null;
  }
}

/** The token to post with, refreshed if it is close to dying. Never throws for
 *  a refresh problem — a token that could not be renewed today is still a token
 *  that works today. */
async function threadsToken(): Promise<string> {
  if (threadsTokenCache) return threadsTokenCache;

  const stored = await readStoredThreadsToken();
  let token = stored?.token || THREADS_TOKEN;
  let expiresAt = stored?.expiresAt ?? 0;

  if (!token) return '';

  if (!stored) {
    // First run against this project: adopt the secret and give it an estimated
    // expiry so the refresh has something to compare against. Without this the
    // row would sit with a null expiry and never be judged due.
    expiresAt = Date.now() + THREADS_TOKEN_LIFETIME_MS;
    await storeThreadsToken(token, expiresAt);
  }

  if (expiresAt && expiresAt - Date.now() < THREADS_REFRESH_WITHIN_MS) {
    const fresh = await refreshThreadsToken(token);
    if (fresh) {
      token = fresh.token;
      await storeThreadsToken(fresh.token, fresh.expiresAt);
    }
  }

  threadsTokenCache = token;
  return token;
}

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
// authHeaders() in /mc/socializer/ sends apikey, Authorization and Accept; Accept
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

// ── AMAZON SERVES 1500px AND META TAKES 1440 ────────────────────────────────
// Every image on an Amazon-sourced gift is 1500px on its longest side. That is
// not a coincidence, it is Amazon's own CDN token: `_SL1500_` means "scaled
// longest side 1500", and it is in the filename of all 109 of them. Meta's
// published cap for the Instagram and Threads publishing endpoints is 1440px,
// so those are the only images in the catalogue that sit over the line.
// Bookshop (498 gifts) tops out at 1200 and OpenLibrary at 500.
//
// The token is also the fix: Amazon will serve any size from the same path, so
// asking for _SL1200_ gets the same photograph inside the limit. `_AC_SL1500_`
// and the bare `_SL1500_` both appear, and both are handled.
//
// APPLIED AT THE POINT OF USE, NOT STORED. gift_shop_items.image_url is the
// address the shop shows and the address a human pasted; rewriting the column
// would edit the catalogue to work around one API's limit. This only touches
// the value on its way to Meta.
//
// SCOPED TO m.media-amazon.com. A width token is Amazon's convention and means
// nothing anywhere else, and a blind regex would mangle a url that happened to
// contain the same characters.
//
// If Threads or Instagram ever raises the cap this becomes harmless rather than
// wrong: a 1200px product photo is still a good product photo.
const META_MAX_EDGE = 1440;

function metaSafeImage(url: string): string {
  if (!/(^|\.)media-amazon\.com\//i.test(url)) return url;
  return url.replace(/_SL(\d{3,5})_/i, (whole, size) =>
    Number(size) > META_MAX_EDGE ? '_SL1200_' : whole
  );
}

// ── OUR OWN LINKS PREVIEW WRONG, AND ONLY OURS ──────────────────────────────
// A Facebook link post carries no image of its own: Meta scrapes the target
// page and uses its og:image. For a news story that is exactly right — the
// article's own share image is the one we recorded in `row.image` anyway.
//
// It is wrong for precisely one kind of candidate: the daily gift, whose url is
// https://thegamebureau.com/gifts/?item=<id>. /gifts/ is static HTML that fills
// itself in from Supabase after load, so every item shares one set of meta tags
// and every gift post came out wearing shop_banner.png instead of the item's
// own photograph. The query string cannot change that on GitHub Pages, and
// Graph dropped the `picture` override in v3.3, so the preview cannot be
// corrected from here — the post has to stop being a link post.
//
// Scoped to our host deliberately. Anywhere else the scraped preview beats
// anything we could substitute, and a link post's clickable card is worth more
// than a caption URL.
function previewIsOurs(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'thegamebureau.com';
  } catch {
    return false;
  }
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

// A GET against the Graph API, for reading a container's status.
async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const qs  = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.type || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// WAIT FOR THE CONTAINER, and this is the whole reason "Media ID is not
// available" happens.
//
// Creating an Instagram container does not upload anything: it tells Meta to go
// and FETCH image_url, which it does on its own schedule. Publishing a
// container that is still IN_PROGRESS is rejected with exactly that message -
// nothing is wrong with the token, the account or the caption, the picture
// simply has not arrived yet. This code published in the same breath as it
// created, so it lost that race whenever Meta was slow or the image was large,
// and reported a permissions-shaped error for a timing problem.
//
// The other half is just as useful: a container that ends in ERROR carries the
// REASON - the URL 404s, the file is a WEBP, the aspect ratio is outside
// 4:5-1.91:1 - and these candidates carry someone else's og:image, so all
// three are ordinary. Reporting that beats reporting "not available".
const IG_POLL_TRIES = 12;
const IG_POLL_MS    = 2500;

async function waitForContainer(containerId: string): Promise<void> {
  let last = '';
  for (let i = 0; i < IG_POLL_TRIES; i += 1) {
    const status = await graphGet(containerId, {
      fields: 'status_code,status',
      access_token: META_PAGE_TOKEN,
    });
    const code = String(status?.status_code ?? '');
    last = String(status?.status ?? code);
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(
        `Instagram could not use that image (${code}): ${last}. ` +
        'These candidates carry the article\'s own og:image, so the usual causes are ' +
        'a URL that needs a login, a PNG or WEBP where Instagram wants JPEG, or an ' +
        'aspect ratio outside 4:5 to 1.91:1.'
      );
    }
    await new Promise((r) => setTimeout(r, IG_POLL_MS));
  }
  throw new Error(
    `Instagram was still fetching the image after ${(IG_POLL_TRIES * IG_POLL_MS) / 1000}s ` +
    `(last status: ${last || 'unknown'}). Nothing is wrong with the post - press Post ` +
    'again in a minute and the container will be ready.'
  );
}

async function postFacebook(row: any): Promise<Outcome> {
  try {
    const { pageId } = await metaIds();
    const url   = String(row.url ?? '').trim();
    const image = metaSafeImage(String(row.image ?? '').trim());

    // A gift (or anything else pointing at our own site) posts as a PHOTO, so
    // the picture is the one we chose rather than the one /gifts/ hands the
    // scraper. See previewIsOurs. The link moves into the caption, where
    // Facebook still linkifies it.
    if (image && url && previewIsOurs(url)) {
      const out = await graph(`${pageId}/photos`, {
        url: image,
        caption: captionFor(row),
        access_token: META_PAGE_TOKEN,
      });
      // A photo post answers with the photo id and the feed post's id; the
      // feed one is the thing a human would open.
      return { platform: 'facebook', ok: true, id: out?.post_id || out?.id };
    }

    // `link` gives the native preview card; `message` is the caption above it.
    const params: Record<string, string> = {
      message: String(row.blurb ?? '').trim(),
      access_token: META_PAGE_TOKEN,
    };
    if (url) params.link = url;
    const out = await graph(`${pageId}/feed`, params);
    return { platform: 'facebook', ok: true, id: out?.id };
  } catch (err) {
    return { platform: 'facebook', ok: false, error: (err as Error).message };
  }
}

async function postInstagram(row: any): Promise<Outcome> {
  const image = metaSafeImage(String(row.image ?? '').trim());
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
    // Meta fetches image_url asynchronously; publishing before it has finished
    // is what returns "Media ID is not available".
    await waitForContainer(String(container.id));
    const out = await graph(`${igUserId}/media_publish`, {
      creation_id: String(container.id),
      access_token: META_PAGE_TOKEN,
    });
    return { platform: 'instagram', ok: true, id: out?.id };
  } catch (err) {
    return { platform: 'instagram', ok: false, error: (err as Error).message };
  }
}

// Threads posts the same way Instagram does - create a container, then publish
// it - so it inherits the same lesson: the container is not ready the instant
// it is created, and publishing early fails. Its status field is `status`
// (IN_PROGRESS / FINISHED / ERROR) rather than Instagram's status_code, and it
// carries error_message when it goes wrong.
async function waitForThreadsContainer(containerId: string, token: string): Promise<void> {
  let last = '';
  for (let i = 0; i < IG_POLL_TRIES; i += 1) {
    const qs = new URLSearchParams({
      fields: 'status,error_message',
      access_token: token,
    });
    const res  = await fetch(`${THREADS}/${containerId}?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const status = String(data?.status ?? '');
    last = String(data?.error_message ?? status);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Threads rejected the post (${status}): ${last}`);
    }
    await new Promise((r) => setTimeout(r, IG_POLL_MS));
  }
  throw new Error(
    `Threads was still preparing the post after ${(IG_POLL_TRIES * IG_POLL_MS) / 1000}s ` +
    `(last: ${last || 'unknown'}). Press Post again in a minute.`
  );
}

async function postThreads(row: any): Promise<Outcome> {
  // Only the USER ID is checked against the secret. The token deliberately is
  // not: once it has been seeded into integration_tokens it rotates there, and
  // the secret is free to be stale or cleared without breaking posting. Testing
  // the secret here would refuse a perfectly good stored token.
  if (!THREADS_USER) {
    return {
      platform: 'threads',
      ok: false,
      error: 'THREADS_USER_ID is not set on this project. Threads needs its own ' +
             'credential - a Page token cannot reach it.',
    };
  }
  try {
    // Not the secret directly: this is the stored token, refreshed if it is
    // within a week of expiring. See threadsToken().
    const token = await threadsToken();
    if (!token) {
      throw new Error(
        'no Threads token available: THREADS_ACCESS_TOKEN is unset and nothing is ' +
        'stored in integration_tokens.'
      );
    }

    const image = metaSafeImage(String(row.image ?? '').trim());
    const create: Record<string, string> = {
      // Text-only is legal here, which is the difference from Instagram.
      media_type: image ? 'IMAGE' : 'TEXT',
      text: captionFor(row),
      access_token: token,
    };
    if (image) create.image_url = image;

    const body = new URLSearchParams(create);
    const res  = await fetch(`${THREADS}/${THREADS_USER}/threads`, { method: 'POST', body });
    const container = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(container?.error?.message || `HTTP ${res.status}`);
    if (!container?.id) throw new Error('no container id returned');

    await waitForThreadsContainer(String(container.id), token);

    const pubBody = new URLSearchParams({
      creation_id: String(container.id),
      access_token: token,
    });
    const pubRes = await fetch(`${THREADS}/${THREADS_USER}/threads_publish`, { method: 'POST', body: pubBody });
    const out = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok) throw new Error(out?.error?.message || `HTTP ${pubRes.status}`);
    return { platform: 'threads', ok: true, id: out?.id };
  } catch (err) {
    return { platform: 'threads', ok: false, error: (err as Error).message };
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
    .filter((p) => p === 'facebook' || p === 'instagram' || p === 'threads');
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
  if (wanted.includes('threads'))   results.push(await postThreads(row));

  const posted = results.filter((r) => r.ok).map((r) => r.platform);

  // The row is stamped here, by the service role, so the receipt cannot
  // disagree with what actually happened -- the client never decides this.
  if (posted.length) {
    // A LOOKUP, NOT A TERNARY. This was `p === 'facebook' ? 'Facebook' :
    // 'Instagram'` back when those were the only two, so the day Threads went
    // live every Threads post would have been filed on the row as Instagram --
    // a receipt that names the wrong account, which is the one kind of wrong
    // this table cannot survive being. A map has no default to be wrong.
    const PLATFORM_LABEL: Record<string, string> = {
      facebook:  'Facebook',
      instagram: 'Instagram',
      threads:   'Threads',
    };
    const labels = posted.map((p) => PLATFORM_LABEL[p] ?? p);
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
