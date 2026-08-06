// meta-page-token.mjs — turn a short-lived user token into a Page token that
// does not expire, then prove it works before you store it.
//
//   node mc/_dev/scripts/meta-page-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>
//
// WHY THIS EXISTS. The Page token's lifetime depends entirely on which token you
// called /me/accounts with -- long-lived user token gives a Page token that does
// not expire, short-lived gives one that dies in about an hour. Same endpoint,
// same response shape, no error either way until it stops working days later.
// Doing it by hand in a browser is three URLs where the middle one is easy to
// skip, so this does the sequence in the right order and checks the result.
//
// Nothing is written anywhere. It prints the token; you set it as a Supabase
// secret yourself. Run it in a terminal you are happy to have the values in --
// shell history included.
//
// Get the short-lived user token from Tools -> Graph API Explorer:
//   app "TGB Socials", User Token, with these five permissions granted --
//     pages_manage_posts        publish to the Page
//     pages_read_engagement     required alongside it
//     pages_show_list           makes /me/accounts return the Page
//     instagram_basic           identifies the linked IG account
//     instagram_content_publish publish to it
//   NOT the instagram_business_* pair; those are the other Instagram API.
//
// App ID and App Secret are in App settings -> Basic.

const GRAPH = 'https://graph.facebook.com/v21.0';

const [appId, appSecret, shortToken] = process.argv.slice(2);
if (!appId || !appSecret || !shortToken) {
  console.error('usage: node meta-page-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>');
  process.exit(1);
}

const mask = (t) => (t ? t.slice(0, 6) + '…' + t.slice(-4) + ` (${t.length} chars)` : '(none)');

async function graph(path, params) {
  const url = `${GRAPH}/${path}?` + new URLSearchParams(params);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

try {
  // 1. short-lived user token -> long-lived user token (~60 days).
  //    Skipping this is the mistake the whole script exists to prevent.
  console.log('1. exchanging for a long-lived USER token…');
  const ex = await graph('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  if (!ex.access_token) throw new Error('no access_token returned from the exchange');
  console.log('   got ' + mask(ex.access_token) +
              (ex.expires_in ? `, expires in ~${Math.round(ex.expires_in / 86400)} days` : ''));

  // 2. long-lived user token -> Page token. Derived this way it does not expire.
  console.log('2. reading /me/accounts for the Page token…');
  const accounts = await graph('me/accounts', { access_token: ex.access_token });
  const pages = accounts.data || [];
  if (!pages.length) {
    throw new Error('no Pages returned. Check pages_show_list was granted, and that ' +
                    'you approved the Page in the Graph API Explorer dialog.');
  }
  pages.forEach((p, i) => console.log(`   [${i}] ${p.name}  id=${p.id}`));
  const page = pages[0];
  if (pages.length > 1) console.log('   more than one Page; using [0]. Re-run and edit if wrong.');
  if (!page.access_token) throw new Error('the Page came back with no access_token');

  // 3. Prove it. This is the same call metaIds() makes at runtime, so if it
  //    passes here the function will resolve its ids on the first request.
  console.log('3. verifying the Page token…');
  const me = await graph('me', {
    fields: 'id,name,instagram_business_account{id,username}',
    access_token: page.access_token,
  });
  const ig = me.instagram_business_account;

  console.log('');
  console.log('   Page      : ' + me.name + '  (' + me.id + ')');
  console.log('   Instagram : ' + (ig ? '@' + ig.username + '  (' + ig.id + ')'
                                      : 'NOT LINKED — see below'));
  if (!ig) {
    console.log('');
    console.log('   No instagram_business_account. Either the IG account is not linked to');
    console.log('   this Page in business.facebook.com, or instagram_basic was not granted.');
    console.log('   Facebook posting will still work; Instagram will not.');
  }

  console.log('');
  console.log('── Page token ──────────────────────────────────────────────');
  console.log(page.access_token);
  console.log('────────────────────────────────────────────────────────────');
  console.log('');
  console.log('Then:  supabase secrets set META_PAGE_ACCESS_TOKEN=<the token above>');
  console.log('       cd mc && supabase functions deploy socials-post');
} catch (err) {
  console.error('');
  console.error('FAILED: ' + err.message);
  console.error('');
  console.error('Common causes:');
  console.error('  "Invalid OAuth access token"      the short-lived token already expired');
  console.error('                                    (they last ~1 hour) — generate a new one.');
  console.error('  "Invalid appsecret"               App Secret mistyped, or from another app.');
  console.error('  no Pages returned                 pages_show_list not granted, or the Page');
  console.error('                                    was not ticked in the Explorer dialog.');
  process.exit(1);
}
