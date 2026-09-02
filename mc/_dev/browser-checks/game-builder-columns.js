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

/* Read from public.games on 2026-09-02, after 2026090204 renamed
   target_audience_id -> target and rival_audience_id -> rival. 71 columns.
   REFRESH IT FROM THE TABLE rather than editing a name by hand:
     select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
      where table_schema='public' and table_name='games'; */
const REAL = new Set(('accept_any,anchor_event_id,anytime,anytime_pair_id,archived,'
  + 'away_team_city,away_team_key,away_team_mascot,away_team_tgbid,body,'
  + 'button_url,category_icon,checkout_url,city,city_name,created_at,currency,'
  + 'default_emoji,end_time,engine,erased,fandom_game,featured,game_date,'
  + 'guide_background,guide_bio,guide_id,guide_image_url,guide_name,'
  + 'home_team_city,home_team_key,home_team_mascot,home_team_tgbid,id,kind,'
  + 'link_url,logo_id,logo_url,map_id,name,price,price_cents,primary_color,'
  + 'primary_tag,quaternary_color,rival,secondary_color,start_time,state_code,'
  + 'state_name,status,stop_group,tagline,tagline_approved,tags,target,team01,'
  + 'team02,team03,team04,team05,team06,team07,team08,teams,tertiary_color,'
  + 'timezone,updated_at,var_name,venue_city,venue_name'
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
const schema = keysIn('const SUPABASE_GAMES_SCHEMA', '};', 2);

const strayMap = mapped.filter((c) => !REAL.has(c));
const straySchema = schema.filter((c) => !REAL.has(c));

t('the column map writes nothing the table lacks', strayMap.length === 0, strayMap.join(', '));
t('and the schema map names nothing the table lacks', straySchema.length === 0, straySchema.join(', '));

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
