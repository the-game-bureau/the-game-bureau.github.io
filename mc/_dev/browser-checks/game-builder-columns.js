/* THE PAGE MAY NOT WRITE A COLUMN public.games DOES NOT HAVE.
   ---------------------------------------------------------------------------
   THE FAULT THIS IS FOR IS SILENT UNTIL IT IS NOT. `GAME_COLUMN_TO_NODE_FIELD`
   is the PATCH path: `serializeGameRow` walks it and emits every column whose
   value is not empty. A key for a dropped column therefore costs nothing while
   the value happens to be blank, and 400s the whole save the moment it holds
   something.

   IT HAD NINE OF THEM ON 2026-08-31. Six went with the start point earlier the
   same day and were left mapped; `country_code` and `country_name` went with the
   country picker; `waypoint_group` had not been a column for far longer. The
   country pair is the one that would have bitten: `syncGeoControlsToMeta` sets
   `countryCode` from the city on every keystroke, so the next save after typing
   a city would have sent it.

   THE COLUMN LIST IS COMMITTED HERE AND WILL GO STALE. That is the accepted
   cost: this check cannot reach the database, and a check that only compares
   the page against itself cannot see a column that has been dropped. Refresh it
   with the query at the foot of this file whenever a games migration lands --
   and note that a column ADDED to the table and missing from this list is
   reported too, which is a useful second signal rather than a false alarm. */
const fs = require('fs');

const SRC = fs.readFileSync('mc/games/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* REFRESHED 2026-09-06: `map` was a typo for `map_id` (the live column), and
   `target_id` / `rival_id` arrive with 2026090601. Read from public.games on
   2026-09-02, AFTER THE TABLE WAS CUT FROM 71 COLUMNS TO 31. That is why this list is worth refreshing rather than
   trusting: 35 of the 62 names the page was asking for stopped existing, and
   PostgREST refuses the WHOLE request on one unknown column, so a single stale
   name took every read down and no game could be opened at all.
   REFRESH IT FROM THE TABLE rather than editing a name by hand:
     select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
      where table_schema='public' and table_name='games'; */
const REAL = new Set(('accept_any,anchor_event_id,anytime,body,button_url,category_icon,'
  + 'checkout_url,city,created_at,currency,default_emoji,engine,'
  + 'featured,guide_id,home_team_tgbid,id,link_url,logo_id,map_id,name,'
  + 'price,price_cents,primary_tag,rival,rival_id,state_name,status,tagline,'
  + 'tags,target,target_id,tgb_date,updated_at,var_name'
  ).split(','));

/* THE THREE PLACES A COLUMN NAME APPEARS ON THE WRITE PATH. */
function keysIn(startNeedle, endNeedle, indent) {
  const a = SRC.indexOf(startNeedle);
  if (a === -1) throw new Error('could not find ' + startNeedle);
  const b = SRC.indexOf(endNeedle, a);
  const re = new RegExp('^\\s{' + indent + '}([a-z0-9_]+):', 'gm');
  return [...new Set([...SRC.slice(a, b).matchAll(re)].map((m) => m[1]))];
}

const mapped = keysIn('const GAME_COLUMN_TO_NODE_FIELD', '};', 2);

/* THE SCHEMA MAP'S JOB IS TO NAME DEAD COLUMNS (2026-09-02), so "it names
   nothing the table lacks" is exactly backwards for it now. `emitColumn` skips
   anything set false and `buildGamesSelectColumns` filters the select through
   the same map, so ONE entry takes a dropped column out of the read and out of
   the PATCH at once -- which is what let 35 of them be switched off in one
   place after the table was cut from 71 columns to 31.
     SO THE RULE IS ABOUT THE VALUE, NOT THE KEY. A dropped column set to false
   is the fix. A dropped column set to TRUE is the fault: it reaches the select,
   and PostgREST refuses the whole request on it. */
const schemaEntries = [...SRC.slice(SRC.indexOf('const SUPABASE_GAMES_SCHEMA'),
                                   SRC.indexOf('};', SRC.indexOf('const SUPABASE_GAMES_SCHEMA')))
  .matchAll(/^\s{2}([a-z0-9_]+):\s*(true|false),?$/gm)].map((m) => ({ col: m[1], on: m[2] === 'true' }));

/* `nodes` and `links` were never columns on the table -- they came from
   games_with_graph_and_teams, the view the page used to read. They are in the
   map set to false, which is the only thing keeping them out of the select now
   that the reads go to public.games directly. Exempt by NAME; anything else
   stray is still a real finding. */
const NOT_COLUMNS = ['nodes', 'links'];

const liveButUnreal = schemaEntries
  .filter((e) => e.on && !REAL.has(e.col) && NOT_COLUMNS.indexOf(e.col) === -1)
  .map((e) => e.col);
t('no column is switched ON that the table lacks', liveButUnreal.length === 0,
  liveButUnreal.join(', '));

/* AND EVERY DEAD KEY ON THE WRITE PATH MUST BE GATED. This is the original
   fault restated for the world the page is in: a key in
   GAME_COLUMN_TO_NODE_FIELD for a column that no longer exists costs nothing
   while the schema map has it false, and 400s the save the moment it does not.
   Removing the key would work too; gating it is what is actually relied on. */
/* `schema` is what the page actually ASKS FOR -- the columns switched on --
   which is what the dropped-column checks below want to test against. A name
   present but set to false is the gate doing its job, not a regression. */
const schema = schemaEntries.filter((e) => e.on).map((e) => e.col);

const off = new Set(schemaEntries.filter((e) => !e.on).map((e) => e.col));
const ungated = mapped.filter((c) => !REAL.has(c) && !off.has(c));
t('every dead column on the write path is gated off', ungated.length === 0,
  ungated.join(', '));

/* A DUPLICATE KEY IS SILENT AND THE LAST ONE WINS. Two entries for one column
   is how `venue_name: false` was undone by a `venue_name: true` further down
   the same object, leaving the read 400ing on a column the map plainly said to
   skip. */
const seen = {}, dupes = [];
schemaEntries.forEach((e) => { if (seen[e.col]) dupes.push(e.col); seen[e.col] = 1; });
t('the schema map has no duplicate keys', dupes.length === 0, dupes.join(', '));

/* THE NINE BY NAME, so a regression says which one came back rather than only
   that the count moved. */
const DROPPED = ['country_code', 'country_name', 'starting_location_name',
                 'starting_location_address', 'starting_location_plus_code',
                 'starting_location_lat', 'starting_location_lon', 'location_based',
                 'waypoint_group'];
const back = DROPPED.filter((c) => mapped.indexOf(c) !== -1 || schema.indexOf(c) !== -1);
t('and none of the nine dropped on 2026-08-31 is back', back.length === 0, back.join(', '));

/* THE COUNTRY IS STILL DERIVED, which is what makes dropping the columns safe:
   `composeGeo` needs a country code to build the canonical city string, so the
   value is still computed -- it is simply never persisted. */
t('the country is still derived from the city',
  /const countryCode = parsedCity\.countryCode/.test(SRC));
t('and the picker that could disagree with it is gone',
  SRC.indexOf('nodeCountryInput') === -1);
/* AND SO ARE THE TWO BOXES THAT WROTE TO NOTHING. They outlived their columns
   by a day: inputs that look like they save and do not. */
t('the Start Name and Start Address boxes are gone',
  SRC.indexOf('nodeStartNameInput') === -1 && SRC.indexOf('nodeStartAddressInput') === -1);

console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');

/* ----------------------------------------------------------------------------
   REFRESH THE LIST WITH:

     cd mc && supabase db query --linked \
       "select string_agg(column_name, ',' order by column_name)
          from information_schema.columns
         where table_schema = 'public' and table_name = 'games';"
   -------------------------------------------------------------------------- */
