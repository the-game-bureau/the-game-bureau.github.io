// meta-page-token.mjs — turn a short-lived user token into a Page token that
// does not expire, then prove it works before you store it.
//
//   node mc/_dev/scripts/meta-page-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>
//   node mc/_dev/scripts/meta-page-token.mjs --system <SYSTEM_USER_TOKEN>
//   ...add --page "The Game Bureau" when the token can see more than one Page.
//
// TWO WAYS IN, and --system is the better one for this.
//   default   Graph API Explorer user token. Needs the App ID/Secret exchange
//             below, and on a use-case app the Explorer may refuse to issue one
//             at all until a Facebook Login for Business configuration exists.
//   --system  A System User token from business.facebook.com -> Business
//             settings -> Users -> System users. Assign the Page and the
//             Instagram account as assets, then Generate New Token against the
//             TGB Socials app. System user tokens do not expire, so there is
//             nothing to exchange and nothing to renew -- this is what Meta
//             intends for server-to-server posting, which is what our Edge
//             Function is. Skips step 1 entirely.
//
// Either way the OUTPUT is the same: a Page token off /me/accounts. Derived
// from a system user token it never expires; derived from a long-lived user
// token it also does not expire; derived from a SHORT-lived user token it dies
// in about an hour, which is the whole reason step 1 is not optional.
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

const argvAll = process.argv.slice(2);
// --page <name or id> picks which Page to use when the token can see several.
let wantPage = null;
const pageAt = argvAll.indexOf('--page');
if (pageAt !== -1) { wantPage = argvAll[pageAt + 1] || null; argvAll.splice(pageAt, 2); }
const argv = argvAll;
const isSystem = argv[0] === '--system';
const [appId, appSecret, shortToken] = isSystem ? [null, null, argv[1]] : argv;
if ((isSystem && !shortToken) || (!isSystem && (!appId || !appSecret || !shortToken))) {
  console.error('usage: node meta-page-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>');
  console.error('   or: node meta-page-token.mjs --system <SYSTEM_USER_TOKEN>');
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
  //    Skipped for a system user token: it already does not expire, and the
  //    fb_exchange_token grant would reject it anyway.
  let userToken = shortToken;
  if (isSystem) {
    console.log('1. system user token — no exchange needed (these do not expire)');
  } else {
    console.log('1. exchanging for a long-lived USER token…');
    const ex = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    });
    if (!ex.access_token) throw new Error('no access_token returned from the exchange');
    userToken = ex.access_token;
    console.log('   got ' + mask(userToken) +
                (ex.expires_in ? `, expires in ~${Math.round(ex.expires_in / 86400)} days` : ''));
  }

  // 2. user token -> Page token, UNLESS the token is already a Page token.
  //    The Graph API Explorer's "User or Page" control can hand you either, and
  //    they are indistinguishable by looking at them. The tell is this call: a
  //    user has an `accounts` edge listing their Pages, a Page does not, so a
  //    Page token fails with "(#100) Tried accessing nonexisting field
  //    (accounts)". That is not an error to report -- it means the caller
  //    already has what this step exists to produce.
  console.log('2. reading /me/accounts for the Page token…');
  let page;
  try {
    const accounts = await graph('me/accounts', { access_token: userToken });
    const pages = accounts.data || [];
    if (!pages.length) {
      // Empty is ambiguous on its own -- it means either "the permission was not
      // granted" or "it was, and no Page was approved". Those need different
      // fixes, so ask the token what it actually carries rather than guessing.
      let granted = [], declined = [];
      try {
        const perms = await graph('me/permissions', { access_token: userToken });
        (perms.data || []).forEach((x) => {
          (x.status === 'granted' ? granted : declined).push(x.permission);
        });
      } catch { /* the diagnosis is best-effort; the failure below still stands */ }

      console.log('');
      console.log('   granted : ' + (granted.join(', ') || '(none)'));
      if (declined.length) console.log('   DECLINED: ' + declined.join(', '));
      console.log('');
      const missing = ['pages_show_list', 'pages_manage_posts', 'instagram_basic']
        .filter((n) => !granted.includes(n));
      throw new Error(
        missing.length
          ? `these permissions are missing from the token: ${missing.join(', ')}. ` +
            `Re-add them in the Explorer and generate again.`
          : `the permissions are all granted, but no Page was approved. In the ` +
            `consent dialog choose "Opt in to all Pages" -- if The Game Bureau is ` +
            `not offered there, it is owned by a Business portfolio rather than by you.`
      );
    }
    pages.forEach((p, i) => console.log(`   [${i}] ${p.name}  id=${p.id}`));

    // NEVER silently pick when there is a choice. Taking pages[0] is how a
    // token for the wrong Page gets stored, and the symptom is invisible: posts
    // succeed, return real ids, and appear on a Page nobody is looking at.
    if (wantPage) {
      const want = String(wantPage).toLowerCase();
      page = pages.find((p) => String(p.id) === wantPage ||
                               String(p.name || '').toLowerCase().includes(want));
      if (!page) throw new Error(`no Page matching "${wantPage}". Names above.`);
      console.log(`   selected: ${page.name}`);
    } else if (pages.length > 1) {
      throw new Error(
        `this token can see ${pages.length} Pages, so which one is not obvious. ` +
        `Re-run with --page "<name or id>" from the list above. Picking one for ` +
        `you is how a token for the wrong Page gets stored.`
      );
    } else {
      page = pages[0];
    }
    if (!page.access_token) throw new Error('the Page came back with no access_token');
  } catch (err) {
    if (!/nonexisting field \(accounts\)/i.test(err.message)) throw err;
    console.log('   no accounts edge — this is ALREADY a Page token, using it as-is.');
    page = { access_token: userToken };
  }

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
  console.error('                                    With --system: the Page was not added as');
  console.error('                                    an ASSET to the system user.');
  process.exit(1);
}
