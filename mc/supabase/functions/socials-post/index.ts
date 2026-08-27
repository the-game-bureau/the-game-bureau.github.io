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

// ── X IS A THIRD API, A THIRD CREDENTIAL, AND THE ONLY ONE THAT COSTS MONEY ──
//
// Restored on 2026-08-20. X and YouTube were both dropped from this page on
// 2026-08-07; YouTube stays dropped (a video there is its own kind of candidate,
// shared by hand, see the Socializer's YouTube filter) and X comes back as an
// ordinary posting destination alongside Facebook, Instagram and Threads.
//
//   supabase secrets set X_API_KEY=...
//   supabase secrets set X_API_SECRET=...
//   supabase secrets set X_ACCESS_TOKEN=...
//   supabase secrets set X_ACCESS_TOKEN_SECRET=...
//   supabase functions deploy socials-post
//
// All four from developer.x.com -> your project -> Keys and tokens. The access
// token pair must be generated with READ AND WRITE permission: the default is
// read-only, and a read-only token fails at post time with a 403 that says
// nothing about permissions. If you change the app's permission level you must
// REGENERATE the access token pair afterwards, because the old pair keeps the
// old scope.
//
// EVERY POST COSTS 20 CENTS, AND THAT IS NOT A TYPO.
//
// Checked against docs.x.com/x-api/getting-started/pricing on 2026-08-20, after
// an earlier version of this comment said "needs a paid tier" and was wrong in
// a way that mattered. There is no free tier and no subscription any more: the
// API is pay-per-use against credits bought up front, and posting is priced
//
//   $0.015  a plain post
//   $0.200  a post CONTAINING A URL
//
// A post that carries a link is THIRTEEN TIMES the price of one that does not,
// and every post this function makes carries a link: xText() is the caption, a
// blank line and the story url, the same shape as the other three platforms.
// So the rate that applies to us is always the expensive one.
//
// At five posts a day that is about $30 a month; at two, about $12. Cheap
// against a salary and expensive against the other three accounts here, which
// are free. THIS IS THE ONLY DESTINATION IN THIS FILE THAT COSTS MONEY PER
// POST, and it is worth re-reading that price before wiring anything that posts
// automatically. Nothing here does: a human presses the button.
//
// DROPPING THE LINK WOULD SAVE 92% AND IS NOT WORTH IT. A post with no link is
// a post nobody can follow, which is the whole job. Moving the link into a
// reply does not help either: a reply carrying a url is charged the same $0.200.
//
// OAUTH 1.0a, NOT OAUTH 2.0, AND THAT IS DELIBERATE. X's OAuth 2.0 user tokens
// expire in two hours and their refresh tokens ROTATE on every use, so a failed
// refresh locks the account out until somebody walks a browser consent flow by
// hand. OAuth 1.0a tokens do not expire at all. This project already carries one
// expiring credential (Threads) and the note above it says plainly that nothing
// else here needs renewing; adding a second, shorter-lived one with a manual
// recovery step is the opposite of what this file wants. The cost is the
// signing code below, which is fiddly but is written once and then never moves.
//
// TEXT AND A LINK ONLY. NO IMAGE. Uploading media to X means the v1.1
// media/upload endpoint, a different host, a chunked protocol and a second set
// of scopes; the post itself is one small JSON body. X unfurls the link into a
// card from the destination's own og:image, which is the same picture the
// candidate is carrying, so the post is not bare. If image upload is ever
// wanted it is a separate piece of work, not a flag.
const X_API        = 'https://api.x.com/2/tweets';
const X_API_KEY    = Deno.env.get('X_API_KEY') ?? '';
const X_API_SECRET = Deno.env.get('X_API_SECRET') ?? '';
const X_TOKEN      = Deno.env.get('X_ACCESS_TOKEN') ?? '';
const X_TOKEN_SEC  = Deno.env.get('X_ACCESS_TOKEN_SECRET') ?? '';

// X counts every link as 23 characters however long it is (t.co wraps them), so
// the real budget for the caption is 280 minus 23 minus the two newlines. The
// caption rule in both prompts is 200 characters, which fits with room to spare;
// this is the backstop for a hand-written candidate that ignored it.
const X_MAX_CHARS  = 280;
const X_LINK_COST  = 23;

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
function blurbFor(row: any, platform: string): string {
  const overrides = row && typeof row.captions === 'object' && row.captions ? row.captions : {};
  const own = String(overrides[platform] ?? '').trim();
  return own || String(row?.blurb ?? '').trim();
}

/** Caption + blank line + link, with the per-account caption where there is one.
 *
 *  `blurb` is the caption. `captions` holds OVERRIDES ONLY, keyed by platform,
 *  for the accounts somebody decided need different words: X counts a link as
 *  23 characters of 280, Instagram's caption link is not clickable, Facebook
 *  unfurls the destination and its own headline. An absent or blank key means
 *  use the shared one, so every row filed before the column existed is already
 *  right with a null and nothing had to be backfilled.
 *
 *  THE FALLBACK IS DELIBERATE AND MUST STAY. If an override could mean "post
 *  nothing here", a stray empty string would silently publish a bare link. */
function captionFor(row: { blurb?: string; url?: string }, platform: string): string {
  return [blurbFor(row, platform), String(row.url ?? '').trim()]
    .filter(Boolean)
    .join('\n\n');
}

/** Instagram's caption, with the one line that makes the link reachable.
 *
 *  INSTAGRAM IS THE ONLY ACCOUNT WHERE A CAPTION URL DOES NOTHING. It is not
 *  clickable, not selectable in the app, and not copyable without a fight, so
 *  every story posted there has been a thing you can see and cannot reach.
 *  /linkinbio/ is the answer and this sentence is the signpost to it: without
 *  it the bio link is an address nobody is told about.
 *
 *  ONLY WHEN THERE IS SOMETHING TO SEE. A candidate with no url never reaches
 *  the bio page -- that page refuses a row it cannot send anybody to -- so
 *  promising a link there would be sending somebody to look for nothing.
 *
 *  AND ONLY ONCE. A human writing an Instagram-specific caption may well end it
 *  this way themselves, and the machine repeating it underneath is the kind of
 *  small sloppiness that reads as automated.
 */
const IG_BIO_LINE = 'See link in bio.';

function instagramCaption(row: any): string {
  // blurbFor, NOT captionFor: the caption alone, WITHOUT the url.
  //
  // captionFor appends the link, which is right for the three accounts where a
  // link does something and self-contradicting here. A dead address sitting
  // directly above "See link in bio." asks the reader which link is meant, and
  // answers with the one thing on the post they cannot use. The bio link is the
  // route now, so the url has a home and does not need a second dead one.
  const base = blurbFor(row, 'instagram');
  const url = String(row?.url ?? '').trim();
  if (!url) return base;
  if (/see\s+link\s+in\s+bio/i.test(base)) return base;
  return base ? base + "\n\n" + IG_BIO_LINE : IG_BIO_LINE;
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
        caption: captionFor(row, 'facebook'),
        access_token: META_PAGE_TOKEN,
      });
      // A photo post answers with the photo id and the feed post's id; the
      // feed one is the thing a human would open.
      return { platform: 'facebook', ok: true, id: out?.post_id || out?.id };
    }

    // `link` gives the native preview card; `message` is the caption above it.
    const params: Record<string, string> = {
      message: blurbFor(row, 'facebook'),
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
      caption: instagramCaption(row),
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
      text: captionFor(row, 'threads'),
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

// ── OAUTH 1.0a SIGNING ───────────────────────────────────────────────────────
//
// Every one of these steps is load-bearing and a mistake in any of them
// produces the same unhelpful 401. In order:
//
//   1. Percent-encoding is RFC 3986, which is NOT encodeURIComponent: that
//      leaves ! * ' ( ) alone and X rejects the signature if they are not
//      encoded. Hence xEncode below.
//   2. The signature base includes the oauth_* parameters and any QUERY
//      parameters, and deliberately NOT the JSON body. A JSON-bodied request is
//      signed as though it had no body at all.
//   3. Parameters are sorted by encoded key, joined with &, and the whole
//      string is encoded again into the base.
//   4. The signing key is the two secrets, each encoded, joined by &. The
//      trailing & matters even when a secret is empty.
function xEncode(v: string): string {
  return encodeURIComponent(v).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function xAuthHeader(method: string, url: string): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: X_API_KEY,
    // A nonce only has to be unique per timestamp per token. Random hex is
    // plenty and needs no state.
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: X_TOKEN,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${xEncode(k)}=${xEncode(oauth[k])}`)
    .join('&');

  const base = [method.toUpperCase(), xEncode(url), xEncode(paramString)].join('&');
  const key  = `${xEncode(X_API_SECRET)}&${xEncode(X_TOKEN_SEC)}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(base));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const header = { ...oauth, oauth_signature: signature };
  return 'OAuth ' + Object.keys(header)
    .sort()
    .map((k) => `${xEncode(k)}="${xEncode(header[k])}"`)
    .join(', ');
}

/** The caption X will actually accept: 280 with the link counted as 23. */
function xText(row: any): string {
  const caption = blurbFor(row, 'x');
  const link    = String(row.url ?? '').trim();
  const budget  = X_MAX_CHARS - (link ? X_LINK_COST + 2 : 0);
  // Trimmed rather than refused. A candidate over the limit is a caption that
  // broke a rule both prompts state, and losing the tail of a sentence is a
  // smaller failure than a post that does not go out at all. The ellipsis is
  // what tells a reader it happened.
  const text = caption.length > budget ? caption.slice(0, Math.max(0, budget - 1)).trimEnd() + '\u2026' : caption;
  return [text, link].filter(Boolean).join('\n\n');
}

async function postX(row: any): Promise<Outcome> {
  // Named individually, because "X is not configured" sends somebody to look at
  // all four and the one that is missing is usually the token pair: those are
  // generated separately from the API key pair and are the ones that have to be
  // regenerated after a permission change.
  const missing = [
    !X_API_KEY    && 'X_API_KEY',
    !X_API_SECRET && 'X_API_SECRET',
    !X_TOKEN      && 'X_ACCESS_TOKEN',
    !X_TOKEN_SEC  && 'X_ACCESS_TOKEN_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    return {
      platform: 'x',
      ok: false,
      error: `not set on this project: ${missing.join(', ')}. X needs its own ` +
             'credential; no Meta or Threads token can reach it.',
    };
  }

  try {
    const auth = await xAuthHeader('POST', X_API);
    const res  = await fetch(X_API, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: xText(row) }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      // X puts its reason in three different places depending on the failure,
      // and the bare status is the least useful of them. 403 on a
      // correct-looking call is nearly always a read-only access token or an
      // unpaid tier; say so rather than making somebody guess.
      const detail = out?.detail || out?.title || out?.errors?.[0]?.message || `HTTP ${res.status}`;
      const hint = res.status === 403
        ? ' (a 403 here usually means the access token is read-only, or the ' +
          'project is on a tier that cannot post; regenerate the token pair ' +
          'after changing app permissions)'
        : '';
      throw new Error(detail + hint);
    }
    return { platform: 'x', ok: true, id: out?.data?.id };
  } catch (err) {
    return { platform: 'x', ok: false, error: (err as Error).message };
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ── THE SWEEP ───────────────────────────────────────────────────────────────
//
// Claims what is due and sends it down the SAME path a human press takes, so a
// scheduled post and a pressed one cannot behave differently. The claim is one
// SQL statement (`tgb_claim_due_socials`), which is what stops two overlapping
// sweeps posting the same candidate twice -- and a post that goes out twice
// cannot be taken back.
async function runSweep(): Promise<Response> {
  const { data: due, error: claimErr } = await supa.rpc('tgb_claim_due_socials', { p_limit: 5 });
  if (claimErr) return json(500, { error: 'claim failed: ' + claimErr.message });
  const rows: Array<{ id: string; platforms: string[] | null }> = Array.isArray(due) ? due : [];
  if (!rows.length) return json(200, { sweep: true, claimed: 0 });

  const done: unknown[] = [];
  for (const claimed of rows) {
    // WHAT WAS AGREED AT SCHEDULING TIME, not re-derived now. A candidate that
    // gains an image between then and now must not silently acquire Instagram.
    const wanted = (Array.isArray(claimed.platforms) ? claimed.platforms : [])
      .map((p) => String(p).toLowerCase().trim())
      .filter((p) => p === 'facebook' || p === 'instagram' || p === 'threads' || p === 'x');

    if (!wanted.length) {
      await supa.from('socials').update({
        scheduled_state: 'failed',
        scheduled_error: 'no machine account was recorded when this was scheduled',
      }).eq('id', claimed.id);
      done.push({ id: claimed.id, posted: [], error: 'no platforms' });
      continue;
    }

    const { data: row, error: rowErr } = await supa
      .from('socials').select('*').eq('id', claimed.id).maybeSingle();
    if (rowErr || !row) {
      await supa.from('socials').update({
        scheduled_state: 'failed',
        scheduled_error: 'the candidate could not be read: ' + (rowErr?.message ?? 'not found'),
      }).eq('id', claimed.id);
      done.push({ id: claimed.id, posted: [], error: 'lookup failed' });
      continue;
    }

    const results: Outcome[] = [];
    if (wanted.includes('facebook'))  results.push(await postFacebook(row));
    if (wanted.includes('instagram')) results.push(await postInstagram(row));
    if (wanted.includes('threads'))   results.push(await postThreads(row));
    if (wanted.includes('x'))         results.push(await postX(row));

    const posted = results.filter((r) => r.ok).map((r) => r.platform);
    const PLATFORM_LABEL: Record<string, string> = {
      facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', x: 'X',
    };

    if (posted.length) {
      const existing: string[] = Array.isArray(row.posted_platforms) ? row.posted_platforms : [];
      const merged = Array.from(new Set([...existing, ...posted.map((p) => PLATFORM_LABEL[p] ?? p)]));
      await supa.from('socials').update({
        status: 'posted',
        posted_platforms: merged,
        // THE SCHEDULE IS SPENT, so the state goes back to null rather than to
        // a fourth value. `status = posted` is the record that it went.
        scheduled_state: null,
        scheduled_error: null,
      }).eq('id', claimed.id);
    } else {
      // FAILED, NOT RETRIED. Every failure here is a credential or a refusal
      // from the platform, and a sweep that retries every minute turns one bad
      // token into a thousand refused requests. It waits for a person.
      await supa.from('socials').update({
        scheduled_state: 'failed',
        scheduled_error: results.map((r) => r.platform + ': ' + (r.error ?? 'refused')).join('; ').slice(0, 500),
      }).eq('id', claimed.id);
    }
    done.push({ id: claimed.id, posted, results });
  }

  return json(200, { sweep: true, claimed: rows.length, done });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization' });

  // ── THE SECOND DOOR: THE SCHEDULER ────────────────────────────────────
  //
  // `pg_cron` has no JWT, so the admin gate below is unreachable to it. A
  // shared secret in `x-tgb-scheduler` lets the sweep in and NOTHING ELSE:
  // this branch takes no id, no platform list and no body worth speaking of,
  // so it cannot be used to post an arbitrary payload to our accounts. What it
  // can do is exactly what a due row already says.
  //
  // THE SECRET IS COMPARED IN CONSTANT TIME. A timing oracle on a 64-character
  // hex string is not a realistic attack here, but the comparison costs
  // nothing and the alternative is a footnote explaining why it is fine.
  const schedHeader = req.headers.get('x-tgb-scheduler') ?? '';
  const schedSecret = Deno.env.get('TGB_SCHEDULER_SECRET') ?? '';
  const isScheduler = !!schedSecret && !!schedHeader && timingSafeEqual(schedHeader, schedSecret);

  if (isScheduler) return await runSweep();

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

  // { diagnose: true } -- CHECK EVERY CREDENTIAL AND POST NOTHING.
  //
  // It began as a Meta-only probe, for a failure with no outward symptom: a
  // post can succeed, return a real id, and still be invisible on the Page you
  // are looking at, because if the stored token is a USER token /me resolves to
  // the person and the post lands on their own feed. From the outside that is
  // indistinguishable from a post that failed silently.
  //
  // It now answers for all three, because the same argument applies to the
  // others in different ways: a Threads token EXPIRES and nothing tells you
  // until a post fails, and X has four secrets of which the token pair is
  // usually the one missing. The reply is one object per destination, shaped
  // the same, so the page can render them without knowing which is which:
  //
  //   { configured, ok, detail, needsAttention, expiresInDays? }
  //
  // NO SECRET IS EVER RETURNED, only what it points at.
  if (body.diagnose) {
    const out: Record<string, unknown> = { diagnose: true };

    // ── Meta ────────────────────────────────────────────────────────────────
    try {
      if (!META_PAGE_TOKEN) {
        out.meta = {
          configured: false, ok: false, needsAttention: true,
          detail: 'META_PAGE_ACCESS_TOKEN is not set on this project.',
        };
      } else {
        const probe = await fetch(
          `${GRAPH}/me?fields=id,name,category,instagram_business_account{id,username}` +
          `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`
        );
        const d = await probe.json().catch(() => ({}));
        if (!probe.ok) {
          out.meta = {
            configured: true, ok: false, needsAttention: true,
            detail: d?.error?.message || `HTTP ${probe.status}`,
          };
        } else {
          // A Page has a category; a user does not. This is the tell.
          const isPage = !!d?.category;
          out.meta = {
            configured: true,
            ok: isPage,
            needsAttention: !isPage,
            detail: isPage
              ? `Page token for "${d?.name ?? '?'}"` +
                (d?.instagram_business_account
                  ? `, Instagram @${d.instagram_business_account.username}`
                  : ', but NO Instagram account is linked to it')
              : 'This is a USER token, not a PAGE token: posts will land on a ' +
                'personal feed rather than the Page. See the setup notes.',
            id: d?.id ?? null,
            name: d?.name ?? null,
            instagram: d?.instagram_business_account
              ? { id: d.instagram_business_account.id, username: d.instagram_business_account.username }
              : null,
          };
        }
      }
    } catch (err) {
      out.meta = { configured: !!META_PAGE_TOKEN, ok: false, needsAttention: true, detail: (err as Error).message };
    }

    // ── Threads: the only credential here that expires ──────────────────────
    try {
      if (!THREADS_USER) {
        out.threads = {
          configured: false, ok: false, needsAttention: true,
          detail: 'THREADS_USER_ID is not set on this project.',
        };
      } else {
        // THE EXISTING READER, NOT A SECOND ONE. An earlier version of this
        // block declared its own readStoredThreadsToken() a few lines below the
        // real one, which shadowed it and handed `threadsToken()` a row with no
        // `expiresAt` on it -- so the refresh logic silently stopped seeing an
        // expiry at all. The function it needed was already there.
        const stored = await readStoredThreadsToken();
        const token  = await threadsToken();
        // Days from the STORED expiry, which is the number that matters: the
        // function only refreshes when it posts, so a quiet fortnight is how
        // this dies. Reported even when the probe passes, because a token that
        // works today and expires on Thursday still needs attention.
        // expiresAt is a millisecond timestamp and 0 means "not known".
        const expiresInDays = stored && stored.expiresAt
          ? Math.floor((stored.expiresAt - Date.now()) / 86400000)
          : null;
        if (!token) {
          out.threads = {
            configured: true, ok: false, needsAttention: true, expiresInDays,
            detail: 'No Threads token available: THREADS_ACCESS_TOKEN is unset and ' +
                    'nothing is stored in integration_tokens.',
          };
        } else {
          const probe = await fetch(
            `${THREADS}/me?fields=id,username&access_token=${encodeURIComponent(token)}`
          );
          const d = await probe.json().catch(() => ({}));
          const live = probe.ok && !!d?.id;
          // 14 days is two weeks of not posting, which has happened, against a
          // 60 day token that only refreshes on a post.
          const expiringSoon = expiresInDays !== null && expiresInDays <= 14;
          out.threads = {
            configured: true,
            ok: live,
            needsAttention: !live || expiringSoon,
            expiresInDays,
            detail: !live
              ? (d?.error?.message || `HTTP ${probe.status}`)
              : expiringSoon
                ? `Token for @${d.username} works, but expires in ${expiresInDays} day(s). ` +
                  'It only refreshes when something is POSTED, so a quiet fortnight ' +
                  'will kill it. Post something, or reissue the token.'
                : `Token for @${d.username}, ${expiresInDays === null ? 'expiry unknown' : expiresInDays + ' days left'}.`,
          };
        }
      }
    } catch (err) {
      out.threads = { configured: !!THREADS_USER, ok: false, needsAttention: true, detail: (err as Error).message };
    }

    // ── X: SECRETS ONLY, DELIBERATELY NO LIVE CALL ──────────────────────────
    // Every other probe here is a free read. X is metered and pay-per-use, so a
    // health check that called it would spend real money every time somebody
    // opened the page. Reporting which of the four secrets are present catches
    // the failure that actually happens (a half-finished setup) and costs
    // nothing; a wrong-but-present credential is found the first time a human
    // presses Post, which is also the first time it matters.
    const xMissing = [
      !X_API_KEY    && 'X_API_KEY',
      !X_API_SECRET && 'X_API_SECRET',
      !X_TOKEN      && 'X_ACCESS_TOKEN',
      !X_TOKEN_SEC  && 'X_ACCESS_TOKEN_SECRET',
    ].filter(Boolean) as string[];
    out.x = {
      configured: xMissing.length === 0,
      ok: xMissing.length === 0,
      // NOT an alarm when unset. X is posted by hand on purpose (its API
      // charges 20 cents for a post carrying a link), so missing secrets are
      // the expected state rather than a fault.
      needsAttention: false,
      detail: xMissing.length
        ? 'Not set: ' + xMissing.join(', ') + '. X is posted by hand, so this is ' +
          'expected unless you have turned machine posting on.'
        : 'All four secrets are set. Not live-checked: an X API call costs money.',
      unchecked: true,
    };

    return json(200, out);
  }

  const id = String(body.id ?? '').trim();
  if (!id) return json(400, { error: 'id is required' });

  const wanted = (Array.isArray(body.platforms) ? body.platforms : [])
    .map((p) => String(p).toLowerCase().trim())
    .filter((p) => p === 'facebook' || p === 'instagram' || p === 'threads' || p === 'x');
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
  if (wanted.includes('x'))         results.push(await postX(row));

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
