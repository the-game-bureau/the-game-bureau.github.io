// Reset every game's guide_image_url to the canonical assets/guides/{gameId}.png
// (the guide avatar is always keyed off the game id now). Backs up current
// values, dry-run unless --apply.
const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const BASE = 'https://thegamebureau.com/assets/guides/';
const APPLY = process.argv.includes('--apply');
const fs = require('fs');

function api(path, opts) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json', ...(opts && opts.headers) },
  });
}
const canonical = (id) => BASE + encodeURIComponent(id) + '.png';

(async () => {
  const rows = await (await api('games?select=id,guide_image_url&order=id.asc')).json();
  fs.writeFileSync(__dirname + '/../backups/guide-image-url-prereset-backup.json', JSON.stringify(rows, null, 2));
  const changes = rows.filter((r) => r.id && (r.guide_image_url || '') !== canonical(r.id));
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | total ${rows.length} | to change ${changes.length} | already canonical ${rows.length - changes.length}`);
  changes.slice(0, 15).forEach((r) => console.log(`  ${r.id}: ${r.guide_image_url || '(null)'} -> ${canonical(r.id)}`));
  if (changes.length > 15) console.log(`  …and ${changes.length - 15} more`);
  if (!APPLY) { console.log('\n(dry-run — no writes)'); return; }

  let ok = 0, fail = 0;
  for (const r of changes) {
    const resp = await api(`games?id=eq.${encodeURIComponent(r.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ guide_image_url: canonical(r.id) }),
    });
    if (resp.ok) { ok++; if (ok % 50 === 0) console.log(`  …${ok}/${changes.length}`); }
    else { fail++; console.log(`  FAIL ${r.id} ${resp.status}: ${await resp.text()}`); }
  }
  console.log(`\nDone. updated=${ok} failed=${fail}`);
})();
