/* PAIRED WITH TWO ROUTINES, and one of them reads this file as its live spec.
 *
 *   TGB WAYPOINTS BOT           trig_01Q5uCittJ3dT3M2xj8sKD3j  cron 45 11 UTC
 *     uses buildWaypointAiPrompt; commits mc/stops/nightly.json.
 *   TGB NFL Anchor Path Builder trig_01P6fMZjt4ZapaKVoiCUfGxw cron 0 9,21 UTC
 *     STEP 1 OF ITS STORED PROMPT IS "open this file and find
 *     buildTourPlacesWaypointPrompt; that function is the specification".
 *
 * So editing this file changes that routine on its next run, with nothing to
 * sync. The cost is the matching failure: RENAME OR MOVE
 * buildTourPlacesWaypointPrompt AND THE ROUTINE BREAKS SILENTLY, because an
 * agent that cannot find its spec will happily write a path from memory. Its
 * stored prompt now says to stop and report instead. If this file moves again,
 * update the trigger in the same commit.
 *
 * Map of every prompt and its routine: mc/_dev/prompt-tools/PROMPTS.md
 * Edit a routine from Claude Code with /schedule or the RemoteTrigger tool.
 */

/* waypoint-prompts.js — the AI pulls that fill public.waypoints.
 *
 * Five prompts and the SQL they lean on, lifted verbatim out of
 * mc/data/waypoints.html on 2026-08-09 when that page was folded into the
 * Path Builder. THE TEXT IS THE PRODUCT here: every clause in these prompts
 * was paid for by a bad run - the address rule, the do-not-repeat list, the
 * loop's five-minute finish, the commercial start and end, the description
 * voice. It is moved, not rewritten, and it should keep being moved rather
 * than rewritten.
 *
 *   TgbWaypointPrompts.useCatalogue(rows)   the waypoints we already hold
 *   TgbWaypointPrompts.buildWaypointAiPrompt(area, count, keywords, sourceUrl)
 *   TgbWaypointPrompts.buildNflWalkingTourPrompt(cities, perCity, keywords)
 *   TgbWaypointPrompts.buildOldBarsWaypointPrompt(focus, notes)
 *   TgbWaypointPrompts.buildTourPlacesWaypointPrompt(city, notes, forcedShape)
 *   TgbWaypointPrompts.buildNflSportsWaypointPrompt(count)
 *
 * READ THIS BEFORE RENAMING ANYTHING. buildTourPlacesWaypointPrompt is the
 * stored specification of the TGB NFL Tour Builder routine
 * (trig_01P6fMZjt4ZapaKVoiCUfGxw): step 1 of its prompt is to open this file,
 * find that function, and follow it. The routine has no prompt of its own by
 * design, so editing the text here changes what it does on the next run - and
 * renaming or moving it silently breaks it, with no error anywhere. Same for
 * WIKI_SOURCE_LINES and WALK_ORDER_RULE, which several prompts share so the
 * page and the routine cannot drift apart.
 */
(function (global) {
  'use strict';

  var cleanText = function (value) { return String(value == null ? '' : value).trim(); };

  // The waypoints already in the table. The prompts need them for two very
  // different jobs: a DO-NOT-REPEAT list, and a count of what each city holds.
  // Given by the page rather than fetched here - this module makes text, it
  // does not talk to Supabase.
  var catalogue = [];
  function useCatalogue(rows) { catalogue = Array.isArray(rows) ? rows : []; }

  function stateAbbrOf(value) {
    var geo = global.TgbWaypointGeo;
    // Shared with waypoint-geo.js rather than carrying a second state map.
    if (geo && typeof geo.stateAbbrOf === 'function') return geo.stateAbbrOf(value);
    return '';
  }

  // An archived waypoint is a do-not-rescrape tombstone, so it counts for
  // NEITHER job: it must not appear in a do-not-repeat list (the AI would take
  // that as "this place is covered" when the truth is "we decided against it"),
  // and it must not count towards a city's total, or a city whose stops were
  // all rejected reads as well covered.
  function truthyFlag(value) {
    if (value === true) return true;
    if (value === false || value == null) return false;
    var v = String(value).trim().toLowerCase();
    return !!v && ['false', 'f', 'no', 'n', '0'].indexOf(v) === -1;
  }
  function isArchived(row) { return truthyFlag(row && row.archived); }

  function parseLocation(loc) {
    const parts = cleanText(loc).split(',').map((s) => s.trim()).filter(Boolean);
    const city = parts[0] || '';
    let region = parts[1] || '';
    region = stateAbbrOf(region) || region;
    return { city: city, region: region };
  }

/* ==== the table, as the AI must be told it ==== */
    const WAYPOINTS_TABLE_DOC = [
      'THE TABLE YOU ARE WRITING: public.waypoints. Every stop is one row. These are its columns, and there are no others:',
      '',
      '  wpid        bigint   PRIMARY KEY. NEVER SUPPLY IT. A trigger assigns the lowest free id, reusing gaps left by deletes. Any wpid you write is ignored at best and an error at worst.',
      '  name        text     The place, by the name a local would say. Required.',
      '  city        text     City only, no state and no country. "New Orleans", never "New Orleans, LA".',
      '  state       text     2-letter code for US places: "LA", "NY". The country name for anywhere else.',
      '  address     text     Street number and street ONLY - "800 Ocean Dr". No city, no state, no zip repeated here; those have their own columns. A bare street name with no number is not an address and is worse than null: it geocodes to whichever city on earth also has that street.',
      '  zip         text     Postal code, as text. Leading zeros matter: "02035" is not 2035.',
      '  description text     One sentence, read aloud at the stop. Max 700 characters.',
      '  source_url  text     The page you verified this from. Never a search-results page.',
      '  lat, lon    float8   Coordinates. LEAVE THEM NULL - the page geocodes the address itself and writes them back. Never guess a coordinate.',
      '  archived    boolean  A do-not-rescrape tombstone. LEAVE IT ALONE. Never write true.',
      '  walk_order  integer  An advisory per-CITY order, not a path position. LEAVE IT NULL - a path orders its stops in public.path_stops.ord.',
      '',
      'A PATH IS NOT ON THIS TABLE. Two more tables hold it, and the helper below writes all three:',
      '',
      '  public.paths       tour_id (PK), title, shape, city. One row per path.',
      '  public.path_stops  tour_id, wpid, ord. NOTHING BUT IDS AND A POSITION.',
      '',
      'So a place that is on two paths is ONE waypoint row with TWO path_stops rows. Do not repeat a place to put it on a second path, and do not invent tour_id / tour_title / tour_shape columns on waypoints - they were retired on 2026-08-08.',
      '  ai_model    text     WHICH AI YOU ARE. Your make and model, as you would say it: "Anthropic Claude Opus 5", "OpenAI GPT-5", "Google Gemini 3 Pro". Max 120 characters. Do not write "AI", "assistant", or the name of this prompt.',
      '',
      'The order of a path is path_stops.ord: 1 is the START, the highest is the END. Most waypoints are on no path at all - a waypoint is a place first.'
    ].join('\n');


/* ==== schema+walkorder ==== */
    function buildWaypointsSchemaSql() {
      return String.raw`
create table if not exists public.waypoints (
  wpid        bigint primary key,
  city        text,
  state       text,
  address     text,
  name        text,
  description text
);

alter table public.waypoints add column if not exists zip         text;
alter table public.waypoints add column if not exists source_url  text;
alter table public.waypoints add column if not exists archived    boolean not null default false;
alter table public.waypoints add column if not exists lat         double precision;
alter table public.waypoints add column if not exists lon         double precision;
alter table public.waypoints add column if not exists walk_order  integer;
alter table public.waypoints add column if not exists tour_id     text;
alter table public.waypoints add column if not exists tour_title  text;
alter table public.waypoints add column if not exists tour_shape  text;
alter table public.waypoints add column if not exists ai_model    text;

create or replace function public.waypoints_assign_wpid()
returns trigger language plpgsql as $wp$
begin
  if new.wpid is null then
    perform pg_advisory_xact_lock(hashtext('public.waypoints.wpid'));
    select coalesce(min(s), 1) into new.wpid
      from generate_series(1, coalesce((select max(wpid) from public.waypoints), 0) + 1) s
     where not exists (select 1 from public.waypoints w where w.wpid = s);
  end if;
  return new;
end;
$wp$;

drop trigger if exists waypoints_assign_wpid_trg on public.waypoints;
create trigger waypoints_assign_wpid_trg
  before insert on public.waypoints
  for each row execute function public.waypoints_assign_wpid();

alter table public.waypoints drop constraint if exists waypoints_tour_shape_known;
alter table public.waypoints add constraint waypoints_tour_shape_known
  check (tour_shape is null or tour_shape in ('loop', 'out_and_back', 'point_to_point')) not valid;

alter table public.waypoints drop constraint if exists waypoints_walk_order_sane;
alter table public.waypoints add constraint waypoints_walk_order_sane
  check (walk_order is null or (walk_order >= 1 and walk_order <= 999)) not valid;

create index if not exists waypoints_tour_idx
  on public.waypoints (tour_id, walk_order) where tour_id is not null;`.trim();
    }

    // Canonical source of the waypoint import helper inlined below:
    //   mc/supabase/waypoints-prompt-import.sql  - KEEP THE TWO IN SYNC.
    // It used to be a constant the prompts printed. They no longer name any
    // repo path, because the AI reading a pasted prompt cannot open one.
    const SUPABASE_SQL_URL = 'https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/sql/';

    // The tgb_import_waypoints_prompt_items helper, inlined into the AI prompt so
    // the SQL the model returns is self-contained (the DB may not have it yet).
    // Keep in sync with supabase/waypoints-prompt-import.sql.
    // One rule, four prompts. Shared for the same reason WIKI_SOURCE_LINES is:
    // a rule restated in four places drifts in three of them.
    //
    // WHY ASK THE MODEL AT ALL, when the page can solve a shorter walk from the
    // coordinates? Because it is answering a different question. The solver
    // minimises metres and knows nothing else; a model that has just researched
    // twelve places in one downtown knows which two share a block, which side
    // of the river you end up on, and where a visitor plausibly starts. That
    // judgement is free at research time and expensive to recover afterwards.
    // Both are advisory and either can be replaced by the other — the Suggest
    // order button recomputes from geometry whenever the sequence looks wrong.
    // Every prompt asks the model to sign its work. Shared for the same reason
    // WALK_ORDER_RULE and WIKI_SOURCE_LINES are: five prompts, one wording, no
    // drift. These prompts are deliberately run against whatever chat AI is
    // open, and they do not fail the same way - one invents street numbers,
    // another returns eight stops when asked for ten. Recording which one wrote
    // a row is what turns "some of these addresses are wrong" into a question
    // with an answer.
    const AI_MODEL_RULE = '- ai_model: the make and model of the AI writing this, exactly as you would name yourself - '
      + '"Anthropic Claude Opus 5", "OpenAI GPT-5", "Google Gemini 3 Pro", "xAI Grok 4". Same value on every row. '
      + 'Give the specific model, not the family, and not "AI" or "assistant". If you genuinely do not know which model you are, leave it out rather than guessing.';

    // NO EM DASHES, shared for the same reason as the two rules below it: five
    // prompts, one wording, no drift. A description written here is read aloud
    // at a stop and shown on a public page, so a machine tell in it is a machine
    // tell in the product. Note this file's own prompt STRINGS carry none
    // either; the comments around them are for humans and are exempt.
    const NO_EM_DASH_RULE = 'NO EM DASHES anywhere in what you return: not in a description, not in a name, '
      + 'not in any note you write around the SQL, and not as the `&mdash;` entity. Use a comma, a colon, a '
      + 'semicolon, a full stop or brackets; one of them always fits. An em dash is the single clearest tell '
      + 'that a machine wrote the line, and these descriptions are read aloud at the stop.';

    const WALK_ORDER_RULE = '- walk_order: 1, 2, 3 ... over the stops YOU are returning in this city, '
      + 'in the order a person would actually walk them. Sequence them so the walk flows: nearest neighbour, '
      + 'no doubling back, no crossing the city and coming back for one thing. Start where a visitor plausibly '
      + 'starts (a transit stop, a main square, the biggest landmark) and end somewhere worth ending. '
      + 'Numbers are scoped to the CITY and restart at 1 for each city you return. It is a SUGGESTION, not a '
      + 'path - a human re-orders it in the Stop Builder - so a sensible order is useful and a wrong one is '
      + 'cheap. Omit it only if you genuinely cannot tell where the places sit relative to each other.';


/* ==== importHelpers ==== */
    function buildWaypointImportHelperSql() {
      return String.raw`
create or replace function public.tgb_import_waypoints_prompt_items(items jsonb)
returns table (action text, name text, wpid text, note text)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text; v_city text; v_state text; v_zip text; v_address text;
  v_description text;
  v_source_url text;
  v_ai_model text;
  v_walk_order int;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of waypoint objects.';
  end if;
  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_name := nullif(btrim(v_entry->>'name'), '');
    v_city := nullif(btrim(v_entry->>'city'), '');
    v_state := nullif(btrim(v_entry->>'state'), '');
    v_zip := nullif(btrim(v_entry->>'zip'), '');
    v_address := nullif(btrim(v_entry->>'address'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
    -- The page this stop was extracted from, if the importer was given one.
    v_source_url := nullif(btrim(v_entry->>'source_url'), '');
    -- Trimmed to the column's 120 rather than rejected: a model that answers
    -- with a paragraph should still be recorded.
    v_ai_model := nullif(left(btrim(coalesce(v_entry->>'ai_model', '')), 120), '');
    -- Advisory position in the city's walk; out-of-range is dropped, not fatal.
    v_walk_order := nullif(btrim(v_entry->>'walk_order'), '')::int;
    if v_walk_order is not null and (v_walk_order < 1 or v_walk_order > 999) then v_walk_order := null; end if;
    if v_name is null then
      return query select 'skipped'::text, null::text, null::text, 'missing name'::text; continue;
    end if;
    v_existing := null;
    select w.wpid into v_existing from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.city, ''))) = lower(coalesce(v_city, '')) limit 1;
    if v_existing is not null then
      return query select 'skipped'::text, v_name, v_existing::text, 'existing name + city (active or archived)'::text; continue;
    end if;
    insert into public.waypoints as w (name, city, state, zip, address, description, source_url, walk_order, ai_model)
    values (v_name, v_city, v_state, v_zip, v_address, v_description, v_source_url, v_walk_order, v_ai_model)
    returning w.wpid into v_wpid;
    return query select 'inserted'::text, v_name, v_wpid::text, null::text;
  end loop;
end;
$$;`.trim();
    }

    // The sports variant of the helper above. Same JSON shape, one deliberate
    // difference: a stop that already exists (same name + city) is NOT skipped —
    // its new sentence is APPENDED to the description. That is the whole point of
    // the sports pull. The places it finds are mostly places we already have for
    // another reason (a hometown square, a college chapel, a cemetery); what is
    // new is the football fact about them, and throwing that away because the row
    // exists would discard the only thing the run produced.
    //
    // Rules that keep a re-paste safe:
    //   * the append is skipped when the sentence is already in the description,
    //     so running the same SQL twice does not stutter;
    //   * archived rows are appended to but NEVER un-archived — archived is a
    //     do-not-rescrape tombstone and this must not resurrect one;
    //   * null state / zip / address / source_url are backfilled, but a value
    //     that is already there is left alone. The AI does not overwrite a human.
    // Keep in sync with supabase/waypoints-prompt-import.sql.
    function buildWaypointSportsImportHelperSql() {
      return String.raw`
create or replace function public.tgb_import_waypoints_sports_items(items jsonb)
returns table (action text, name text, wpid text, note text)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text; v_city text; v_state text; v_zip text; v_address text;
  v_description text;
  v_source_url text;
  v_ai_model text;
  v_wpid public.waypoints.wpid%type;
  v_row public.waypoints%rowtype;
  v_merged text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of waypoint objects.';
  end if;
  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_name := nullif(btrim(v_entry->>'name'), '');
    v_city := nullif(btrim(v_entry->>'city'), '');
    v_state := nullif(btrim(v_entry->>'state'), '');
    v_zip := nullif(btrim(v_entry->>'zip'), '');
    v_address := nullif(btrim(v_entry->>'address'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
    v_source_url := nullif(btrim(v_entry->>'source_url'), '');
    -- Trimmed to the column's 120 rather than rejected: a model that answers
    -- with a paragraph should still be recorded.
    v_ai_model := nullif(left(btrim(coalesce(v_entry->>'ai_model', '')), 120), '');
    if v_name is null then
      return query select 'skipped'::text, null::text, null::text, 'missing name'::text; continue;
    end if;
    v_row := null;
    select w.* into v_row from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.city, ''))) = lower(coalesce(v_city, '')) limit 1;

    if v_row.wpid is null then
      insert into public.waypoints as w (name, city, state, zip, address, description, source_url, ai_model)
      values (v_name, v_city, v_state, v_zip, v_address, v_description, v_source_url, v_ai_model)
      returning w.wpid into v_wpid;
      return query select 'inserted'::text, v_name, v_wpid::text, null::text;
      continue;
    end if;

    -- Already here. Fold the football fact into the description rather than
    -- dropping it, and fill in whatever fields are still blank.
    if v_description is null then
      return query select 'unchanged'::text, v_name, v_row.wpid::text, 'exists, nothing new to add'::text; continue;
    end if;
    if position(lower(v_description) in lower(coalesce(v_row.description, ''))) > 0 then
      return query select 'unchanged'::text, v_name, v_row.wpid::text, 'already says this'::text; continue;
    end if;
    v_merged := left(btrim(coalesce(nullif(btrim(v_row.description), '') || ' ', '') || v_description), 1200);
    update public.waypoints w
       set description = v_merged,
           state       = coalesce(w.state, v_state),
           zip         = coalesce(w.zip, v_zip),
           address     = coalesce(w.address, v_address),
           source_url  = coalesce(w.source_url, v_source_url),
           -- Blanks-only, like the four above: a row already credited to one
           -- model must not be re-credited to whichever model appended later.
           ai_model    = coalesce(w.ai_model, v_ai_model)
     where w.wpid = v_row.wpid;
    return query select 'appended'::text, v_name, v_row.wpid::text,
      case when v_row.archived then 'appended to an ARCHIVED row; still archived' else null end;
  end loop;
end;
$$;`.trim();
    }

    // Existing waypoint names in the target city, so the AI won't re-suggest them.

/* ==== existingNamesFor+aiPrompt ==== */
    function existingWaypointNamesFor(area) {
      const city = (parseLocation(area).city || '').toLowerCase();
      if (!city) return [];
      const seen = new Set();
      const out = [];
      catalogue.forEach((r) => {
        if (cleanText(r.city).toLowerCase() !== city) return;
        const n = cleanText(r.name);
        if (!n || seen.has(n.toLowerCase())) return;
        seen.add(n.toLowerCase());
        out.push(n);
      });
      return out.slice(0, 400);
    }

    // The "With AI" prompt: the model researches real stops and returns ONE
    // Supabase SQL block (helper setup + a call with the verified stops as JSON)
    // that the admin pastes into the Supabase SQL editor. Mirrors the gift shop's
    // buildDestinationSearchPrompt flow.
    function buildWaypointAiPrompt(area, count, keywords, sourceUrl) {
      const n = Math.max(1, Math.min(100, parseInt(count, 10) || 20));
      const kw = cleanText(keywords);
      const p = parseLocation(area);
      const region = p.region || '';
      const existing = existingWaypointNamesFor(area);
      const url = cleanText(sourceUrl);

      // With a source URL the job changes from open research to extraction: read
      // that page first and take its stops, then verify each one independently
      // (pages list closed venues and wrong addresses, so the page is the source
      // of WHICH stops, never of the facts about them).
      const taskLine = url
        ? 'Task: read ' + url + ' and extract the real, publicly accessible walking-tour stops it names in or immediately around ' + area + ', then return a Supabase SQL import for up to ' + n + ' of them.' + (kw ? ' Bias toward: ' + kw + '.' : '')
        : 'Task: find real, publicly accessible walking-tour stops in or immediately around ' + area + ' on Wikipedia and Wikimedia: places with coordinates or a street address, and return a Supabase SQL import for up to ' + n + ' NEW stops.' + (kw ? ' Bias toward: ' + kw + '.' : '');
      const researchLines = url
        ? [
            'Source page instructions:',
            '- Start by fetching ' + url + ' and working through what it actually lists. If you cannot open it, say so plainly and stop rather than inventing stops.',
            '- Take the stops FROM that page. Do not substitute your own picks for the ones it names.',
            '- The page decides WHICH stops; it does not decide the facts. Verify every name and address against an independent source, and correct or drop anything stale, closed, renamed, or wrong.',
            '- If the page yields fewer than ' + n + ' usable stops, return the smaller set. Only add stops of your own if the page has fewer than 3, and say which ones you added.',
            '- Ignore navigation, ads, and unrelated listings; a stop must be a real place a person can stand in front of.',
            '- Record the page in source_url on every stop you take from it, so a human can go back later and see where the batch came from. If you follow a link OFF that page and take a stop from somewhere else, put THAT page in its source_url instead.'
          ]
        : [
            ...WIKI_SOURCE_LINES,
            '',
            'Research instructions:',
            '- Do the research yourself with your web browsing/search tools. Do not ask me for a dataset; the deliverable is the finished SQL.',
            '- Open the list articles and the individual articles; do not answer from memory of what the city contains.',
            '- Goal: ' + n + ' verified stops, but a smaller verified batch is fine. Never fabricate a place or address to hit the number.',
            '- Give the most specific street address you can. Verify it against a real source.'
          ];
      const sqlExample = [
        buildWaypointsSchemaSql(),
        '',
        buildWaypointImportHelperSql(),
        '',
        'select *',
        'from public.tgb_import_waypoints_prompt_items($tgb$',
        '[',
        '  {',
        '    "name": "Cafe du Monde",',
        '    "city": "New Orleans",',
        '    "state": "LA",',
        '    "zip": "70116",',
        '    "address": "800 Decatur St",',
        '    "description": "One original tour-guide sentence: a fact or what makes it a stop.",',
        '    "source_url": ' + (url ? JSON.stringify(url) : '"https://en.wikipedia.org/wiki/Caf%C3%A9_du_Monde"') + ',',
        '    "walk_order": 1,',
        '    "ai_model": "Anthropic Claude Opus 5"',
        '  }',
        ']',
        '$tgb$::jsonb);'
      ].join('\n');

      return [
        'You are a local walking-tour expert helping The Game Bureau build a catalog of real walking-tour stops for a location-based game.',
        '',
        taskLine,
        '',
        'What makes a good stop (best-known, most-visited first, then strong additional candidates):',
        '- Places notable enough to be documented and pinned to a spot, the kind that carry a Wikipedia article with coordinates, a historical marker, or a place on a published tour.',
        '- Within a comfortable ~1-mile loop of one another; interesting and photogenic (historic sites and markers, landmarks, monuments/memorials, public art and murals, notable architecture, parks and plazas, museums, iconic local businesses).',
        '- Publicly accessible and safe to stand in front of.',
        '',
        ...researchLines,
        '',
        WAYPOINTS_TABLE_DOC,
        '',
        'Hard requirements for each JSON object:',
        '- name: the place name (e.g. "Cafe du Monde"). Required.',
        '- city: the city as a plain string (e.g. "' + (p.city || 'New Orleans') + '").',
        '- state: the 2-letter code for US places (e.g. "' + (region || 'LA') + '"), otherwise the country name.',
        '- zip: the postal/ZIP code as a string. REQUIRED whenever you have a street address. A ZIP is a lookup from a known street address, not a guess, so the never-invent rule that governs the address does NOT excuse leaving this null. Wikipedia and NRHP rows almost never print the ZIP, so plan on one extra step per stop: take the verified street address plus city and look the postal code up (USPS ZIP lookup, the the venue contact page, or a map service). Use null only when the stop genuinely has no street address, or the country has no postal codes.',
        '- address: the STREET ONLY: house number and street name, e.g. "800 Decatur St". Never repeat the city, state, ZIP, or country here; they have their own fields. Null if you do not know the street.',
        '- description: ONE original, concise tour-guide sentence (a fact, or what makes it a stop). No marketing copy.',
        (url
          ? '- source_url: "' + url + '" on EVERY object: the page you took the stop from. Copy it exactly, the same value on each one.'
          : '- source_url: REQUIRED on every object: the full URL of the stop\'s own Wikipedia article (e.g. "https://en.wikipedia.org/wiki/Willis_Tower"), or the list article it is a row in when it has no article of its own. A Wikimedia Commons category URL only when there is no Wikipedia page at all. Never a search-results page, never the place\'s own website.'),
        WALK_ORDER_RULE,
        AI_MODEL_RULE,
        NO_EM_DASH_RULE,
        '- Do NOT include a wpid or id; the database assigns it.',
        '- Do not include any stop already in the "existing" list below. Avoid duplicate names.',
        '- The JSON array may contain 1 to ' + n + ' objects. Do not pad with unverifiable entries.',
        '- Do not put the literal sequence $tgb$ inside any JSON string value.',
        '- Output the COMPLETE script as ONE copy-pasteable block: a single fenced ```sql code block (or a code artifact/canvas with a copy button). Do NOT split it across multiple blocks.',
        '- CRITICAL for copy-paste: use ONLY plain ASCII characters. Straight apostrophes and straight double-quotes only; never smart/curly quotes, en/em dashes, non-breaking spaces, or other Unicode punctuation. Do not hard-wrap or reflow long lines. Those silently corrupt the SQL (especially the $tgb$ dollar-quoted JSON).',
        '- The block must contain ONLY SQL: no prose, headings, or commentary before, after, or inside it.',
        '',
        'Put one self-contained Supabase SQL script in that single block. It must begin with the helper setup below, then call the helper with the verified-stop JSON array. Do not omit the helper setup; the database may not have it yet. Use this exact SQL shape:',
        sqlExample,
        '',
        'Everything you need is in this prompt. You have no access to our repository or our database, so do not refer to a file, do not ask for a schema, and do not assume anything already exists - the block you return must create what it needs and then use it.',
        '',
        'Existing waypoints in this city to exclude (active and archived; do not re-suggest any of these names):',
        JSON.stringify(existing, null, 2)
      ].join('\n');
    }


/* ==== wikiLines+counts+nflPrompt ==== */
    const WIKI_SOURCE_LINES = [
      'Where the stops come from, Wikipedia and Wikimedia rather than general web search:',
      '- Every stop must have an English Wikipedia article (or, failing that, a Wikimedia Commons category) AND either coordinates on that page or a street address. No coordinates and no address means it is not a candidate, however famous it is.',
      '- The richest sources are the list articles, because they carry an address AND coordinates for every row:',
      '  * "National Register of Historic Places listings in <county> County, <State>": address column, coordinates, and a photo per row.',
      '  * "List of National Historic Landmarks in <State>".',
      '  * "List of public art in <city>", "List of tallest buildings in <city>", "List of parks in <city>", "List of museums in <city>".',
      '  * The city article\'s own Landmarks / Architecture / Culture sections, and "Category:Buildings and structures in <city>", "Category:Monuments and memorials in <city>", "Category:Tourist attractions in <city>".',
      '- Wikipedia GeoSearch enumerates everything geotagged near a point and is the fastest way to sweep a downtown core (swap in the city\'s coordinates):',
      '  https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=LAT%7CLON&ggsradius=10000&ggslimit=200&prop=coordinates%7Cdescription&format=json',
      '- Wikimedia Commons is the photo check: a geocoded Commons category or image confirms the thing is still standing and visible from the street.',
      '- NOT candidates: a disambiguation page, a list or category page itself, an article about an event/person/company rather than a place, a demolished or destroyed structure (read the article; it will say), or anything whose article has neither coordinates nor an address.',
      '- Wikipedia decides WHICH stops. It does not decide the street address: articles are often missing one or list a mailing address. Get the street address from the NRHP row or another independent source, and leave address null rather than guessing. Never convert coordinates into a made-up street address.',
      '- ZIP is the one field you are expected to go and fetch. Wikipedia and NRHP rows carry the street address but almost never the postal code, so a stop with an address and a null zip means the lookup was skipped, not that the ZIP is unknowable. Look it up from the verified street address; a ZIP derived from a real address is a lookup, not an invention.'
    ];

    // Rows already filed under a city string like "Chicago, IL".
    function waypointCountForCity(cityStr) {
      const city = (parseLocation(cityStr).city || '').toLowerCase();
      if (!city) return 0;
      let n = 0;
      catalogue.forEach((r) => {
        if (isArchived(r)) return;
        if (cleanText(r.city).toLowerCase() === city) n += 1;
      });
      return n;
    }

    // Every NFL host city, thinnest coverage first — the order you would work in.
    function nflCitiesByNeed() {
      return NFL_US_CITIES.concat(NFL_INTL_CITIES)
        .map((city) => ({ city: city, count: waypointCountForCity(city) }))
        .sort((a, b) => (a.count - b.count) || a.city.localeCompare(b.city, undefined, { sensitivity: 'base' }));
    }

    function buildNflWalkingTourPrompt(cities, perCity, keywords) {
      const n = Math.max(1, Math.min(100, parseInt(perCity, 10) || 20));
      const kw = cleanText(keywords);
      const list = (Array.isArray(cities) ? cities : []).map(cleanText).filter(Boolean);
      // Per-city exclusions, trimmed harder than the single-city prompt: thirty
      // cities' worth of full lists would bury the instructions.
      const existing = {};
      list.forEach((city) => {
        const names = existingWaypointNamesFor(city).slice(0, 60);
        if (names.length) existing[city] = names;
      });

      const sqlExample = [
        buildWaypointsSchemaSql(),
        '',
        buildWaypointImportHelperSql(),
        '',
        'select *',
        'from public.tgb_import_waypoints_prompt_items($tgb$',
        '[',
        '  {',
        '    "name": "Cafe du Monde",',
        '    "city": "New Orleans",',
        '    "state": "LA",',
        '    "zip": "70116",',
        '    "address": "800 Decatur St",',
        '    "description": "One original tour-guide sentence: a fact or what makes it a stop.",',
        '    "source_url": "https://en.wikipedia.org/wiki/Caf%C3%A9_du_Monde",',
        '    "walk_order": 1,',
        '    "ai_model": "Anthropic Claude Opus 5"',
        '  }',
        ']',
        '$tgb$::jsonb);'
      ].join('\n');

      return [
        'You are a researcher helping The Game Bureau build a catalog of real walking-tour stops for a location-based game played in NFL host cities. You work from Wikipedia and Wikimedia.',
        '',
        'Task: for EACH city listed below, find geotagged or street-addressed places on Wikipedia and Wikimedia, then return them as ONE Supabase SQL import covering every city. Up to ' + n + ' NEW stops per city.'
          + (kw ? ' Bias toward: ' + kw + '.' : ''),
        '',
        'Cities (' + list.length + '):',
        list.map((c) => '- ' + c).join('\n'),
        '',
        ...WIKI_SOURCE_LINES,
        '',
        'What makes a good stop, among the geotagged candidates:',
        '- Interesting and photogenic: historic sites and markers, landmarks, monuments and memorials, public art and murals, notable architecture, parks and plazas, museums, iconic local businesses.',
        '- Publicly accessible and safe to stand in front of: a player will physically stand there.',
        '- Stops within a city should form a walkable cluster (roughly a 1-mile loop) in or near the downtown/historic core, not scatter across the metro. A visiting fan on foot is the player.',
        '',
        'Research instructions:',
        '- Do the research yourself with your web browsing/search tools. Do not ask me for a dataset; the deliverable is the finished SQL.',
        '- Work city by city. Open the list articles and the individual articles; do not answer from memory of what a city contains.',
        '- Read enough of each article to be sure the place still exists and is still where the article says. Drop anything demolished, relocated, closed permanently, or unverifiable.',
        '- If a city yields fewer than ' + n + ' verified stops, return the smaller set for that city. Never fabricate a place, an address, or a Wikipedia URL.',
        '- Skip a city entirely rather than inventing one for it, and say which cities you skipped and why AFTER the SQL block.',
        '',
        WAYPOINTS_TABLE_DOC,
        '',
        'Hard requirements for each JSON object:',
        '- name: the place name (e.g. "Cafe du Monde"). Required.',
        '- city: the city as a plain string, exactly as spelled in the list above but WITHOUT the state/country (e.g. "New Orleans", not "New Orleans, LA").',
        '- state: the 2-letter code for US places (e.g. "LA"), otherwise the country name (e.g. "England").',
        '- zip: the postal/ZIP code as a string. REQUIRED whenever you have a street address. A ZIP is a lookup from a known street address, not a guess, so the never-invent rule that governs the address does NOT excuse leaving this null. Wikipedia and NRHP rows almost never print the ZIP, so plan on one extra step per stop: take the verified street address plus city and look the postal code up (USPS ZIP lookup, the the venue contact page, or a map service). Use null only when the stop genuinely has no street address, or the country has no postal codes.',
        '- address: the STREET ONLY: house number and street name, e.g. "800 Decatur St". Never repeat the city, state, ZIP, or country here; they have their own fields. Null if you do not know the street.',
        '- description: ONE original, concise tour-guide sentence (a fact, or what makes it a stop). Your own words; do not paste a sentence out of the article.',
        '- source_url: REQUIRED on every object: the full URL of the stop\'s own Wikipedia article (e.g. "https://en.wikipedia.org/wiki/Willis_Tower"). If the place has no article of its own but appears as a row in a list article with an address and coordinates, use that list article\'s URL. A Wikimedia Commons category URL is acceptable only when there is no Wikipedia page at all. Never a search-results page, never a link to the place\'s own website.',
        WALK_ORDER_RULE,
        AI_MODEL_RULE,
        NO_EM_DASH_RULE,
        '- Do NOT include a wpid or id; the database assigns it.',
        '- Do not include any stop already in the "existing" list below for that city. Avoid duplicate names.',
        '- Do not put the literal sequence $tgb$ inside any JSON string value.',
        '- Output the COMPLETE script as ONE copy-pasteable block: a single fenced ```sql code block (or a code artifact/canvas with a copy button). Do NOT split it across multiple blocks or one block per city.',
        '- CRITICAL for copy-paste: use ONLY plain ASCII characters. Straight apostrophes and straight double-quotes only; never smart/curly quotes, en/em dashes, non-breaking spaces, or other Unicode punctuation. Do not hard-wrap or reflow long lines. Those silently corrupt the SQL (especially the $tgb$ dollar-quoted JSON).',
        '- The block must contain ONLY SQL: no prose, headings, or commentary before, after, or inside it. Put your notes about skipped cities after the block.',
        '',
        'Put one self-contained Supabase SQL script in that single block. It must begin with the helper setup below, then call the helper once with every verified stop from every city in a single JSON array. Do not omit the helper setup; the database may not have it yet. Use this exact SQL shape:',
        sqlExample,
        '',
        'Everything you need is in this prompt. You have no access to our repository or our database, so do not refer to a file, do not ask for a schema, and do not assume anything already exists - the block you return must create what it needs and then use it.',
        '',
        'Existing waypoints to exclude, by city (active and archived; do not re-suggest any of these names):',
        JSON.stringify(existing, null, 2)
      ].join('\n');
    }


/* ==== sample+oldBars ==== */
    function existingWaypointSample(limit) {
      const cap = Math.max(1, parseInt(limit, 10) || 500);
      const seen = new Set();
      const out = [];
      catalogue.forEach((r) => {
        const n = cleanText(r.name);
        const c = cleanText(r.city);
        if (!n) return;
        const key = (n + '|' + c).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(n + (c ? ', ' + c : ''));
      });
      out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return out.slice(0, cap);
    }

    function buildOldBarsWaypointPrompt(focus, notes) {
      const target = cleanText(focus) || 'major cities in the United States';
      const extra = cleanText(notes);
      const existing = existingWaypointSample(800);
      const sqlExample = [
        buildWaypointsSchemaSql(),
        '',
        buildWaypointImportHelperSql(),
        '',
        'select *',
        'from public.tgb_import_waypoints_prompt_items($tgb$',
        '[',
        '  {',
        '    "name": "Lafitte\'s Blacksmith Shop Bar",',
        '    "city": "New Orleans",',
        '    "state": "LA",',
        '    "zip": "70116",',
        '    "address": "941 Bourbon St",',
        '    "description": "Often promoted as one of the oldest bars in the United States, this 18th-century Bourbon Street building carries disputed but memorable tavern lore.",',
        '    "source_url": "https://www.lafittesblacksmithshop.com/",',
        '    "walk_order": 1,',
        '    "ai_model": "Anthropic Claude Opus 5"',
        '  }',
        ']',
        '$tgb$::jsonb);'
      ].join('\n');

      return [
        'You are a meticulous local-history researcher helping The Game Bureau add oldest-bar waypoints to a location-based walking game.',
        '',
        'Task: for EACH location described in the focus below, identify the single oldest continuously operating bar, tavern, saloon, pub, or equivalent drinking establishment in that location, verify that it is still open, and return it as one Supabase SQL import for the waypoints table.',
        '',
        'Focus: ' + target,
        extra ? 'Extra direction: ' + extra : '',
        '',
        'If the focus names a region, list, league slate, colony group, country, or other group, resolve it into the individual cities or places and return one result per location. If the focus names one city, return one result.',
        '',
        'Research rules derived from the old Oldest Bar research prompt:',
        '- Verified facts only. If an establishment date, continuity claim, or oldest-bar status is disputed, say so in the description rather than smoothing it over.',
        '- Prefer the oldest continuously operating bar/tavern in the location. If the strongest claim is "oldest building used as a bar" or "oldest restaurant/bar", explain that nuance in the description.',
        '- It must still be open to the public as a place a player can stand in front of or visit. Drop permanently closed places and private clubs unless the public can access the building.',
        '- Use multiple sources when the claim is contested: official history pages, local historical societies, newspaper/local-history articles, or the venue page. Do not rely on listicle titles alone.',
        '- Never fabricate an establishment year, address, ZIP/postal code, or source URL. A smaller verified batch is better than a padded one.',
        '',
        WAYPOINTS_TABLE_DOC,
        '',
        'Hard requirements for each JSON object:',
        '- name: the establishment name. Required.',
        '- city: the city as a plain string without state/country.',
        '- state: the 2-letter code for US places, otherwise the country/province/region name.',
        '- zip: the postal/ZIP code as a string. Required whenever you have a street address. Use null only when the place genuinely has no postal code or you cannot verify one.',
        '- address: the street address only. Never repeat city, state, ZIP, or country here.',
        '- description: ONE original tour-guide sentence. Include the establishment year or claimed year and any continuity/oldest-claim caveat when relevant.',
        '- source_url: REQUIRED. Use the best source proving the oldest-bar claim or the venue history page. Never a search-results page.',
        WALK_ORDER_RULE,
        AI_MODEL_RULE,
        NO_EM_DASH_RULE,
        '- Do NOT include a wpid or id. The database assigns it.',
        '- Do not include any place already in the existing-waypoints list below when it is the same name + city.',
        '- Do not put the literal sequence $tgb$ inside any JSON string value.',
        '- Output the COMPLETE script as ONE copy-pasteable block: a single fenced ```sql code block or code artifact with a copy button. Do NOT split it across multiple blocks.',
        '- CRITICAL for copy-paste: use ONLY plain ASCII characters. Straight apostrophes and straight double-quotes only; never smart/curly quotes, en/em dashes, non-breaking spaces, or other Unicode punctuation. Do not hard-wrap or reflow long lines.',
        '- The block must contain ONLY SQL - no prose, headings, or commentary before, after, or inside it.',
        '',
        'Put one self-contained Supabase SQL script in that single block. It must begin with the helper setup below, then call the helper with your verified oldest-bar JSON array. Do not omit the helper setup; the database may not have it yet. Use this exact SQL shape:',
        sqlExample,
        '',
        'Everything you need is in this prompt. You have no access to our repository or our database, so do not refer to a file, do not ask for a schema, and do not assume anything already exists - the block you return must create what it needs and then use it.',
        '',
        'Existing waypoints to avoid when name + city match:',
        JSON.stringify(existing, null, 2)
      ].filter(Boolean).join('\n');
    }


/* ==== anchors+tourSql ==== */
    function existingWaypointAnchors(focus, limit) {
      const cap = Math.max(1, parseInt(limit, 10) || 120);
      const hint = cleanText(focus).toLowerCase();
      const out = [];
      catalogue.forEach((r) => {
        const name = cleanText(r.name);
        const city = cleanText(r.city);
        if (!name || !city) return;
        // Loose match on purpose: the focus box takes "Savannah", "Savannah, GA"
        // or a list of cities, and a row only has to be plausibly in one of them.
        if (hint && hint.indexOf(city.toLowerCase()) === -1) return;
        const where = [cleanText(r.address), city, cleanText(r.state)].filter(Boolean).join(', ');
        out.push(name + (where ? ', ' + where : ''));
      });
      out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return out.slice(0, cap);
    }

    // The whole-tour import helper, inlined into the prompt so the SQL a model
    // returns runs against a database that has never seen it. Keep in sync with
    // mc/supabase/walking-tour-prompt-import.sql — the standing rule for this
    // pair, same as the waypoint importer above.
    // The whole-tour importer, inlined so the SQL a model returns runs against
    // a database that has never seen it. Generated from
    // mc/supabase/walking-tour-prompt-import.sql — KEEP THE TWO IN SYNC, the
    // standing rule for this pair.
    // The whole-tour importer, inlined so the SQL a model returns runs against
    // a database that has never seen it. Generated from
    // mc/supabase/walking-tour-prompt-import.sql - KEEP THE TWO IN SYNC, the
    // standing rule for this pair. That file must contain no backticks: it is
    // pasted verbatim into the String.raw template below.
    // The COLUMNS the helper writes into, generated from
    // mc/supabase/migrations/2026080801_waypoints_tour_columns.sql with its comments
    // stripped. Inlined for one reason: THE AI READING THIS PROMPT HAS NO
    // ACCESS TO THIS REPO. It is a chat window with a pasted block of text,
    // so anything it needs has to be IN the text - a reference to a file
    // path is worth nothing to it, and the human pasting the result into the
    // SQL editor may be running against a database that has never had these
    // tables. Every statement is create-if-not-exists, so pasting it twice
    // costs nothing.
    function buildWalkingTourSchemaSql() {
      return String.raw`
create table if not exists public.paths (
  tour_id    text primary key,
  title      text,
  shape      text,
  city       text,
  created_at timestamptz not null default now()
);

-- Seven shapes since 2026080805. This block DROPS and re-adds the constraint,
-- so a stale copy here would quietly narrow it again the next time somebody
-- pastes this helper - keep it in step with the migration.
alter table public.paths drop constraint if exists paths_shape_known;
alter table public.paths add constraint paths_shape_known
  check (shape is null or shape in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  )) not valid;

create table if not exists public.path_stops (
  tour_id text   not null references public.paths(tour_id) on delete cascade,
  wpid    bigint not null references public.waypoints(wpid) on delete cascade,
  ord     integer not null,
  primary key (tour_id, wpid)
);

create index if not exists path_stops_order_idx on public.path_stops (tour_id, ord);
create index if not exists path_stops_wpid_idx  on public.path_stops (wpid);

alter table public.paths      enable row level security;
alter table public.path_stops enable row level security;

drop policy if exists "paths readable by anyone" on public.paths;
create policy "paths readable by anyone" on public.paths for select using (true);
drop policy if exists "paths write by authenticated" on public.paths;
create policy "paths write by authenticated" on public.paths for all
  to authenticated using (true) with check (true);

drop policy if exists "path_stops readable by anyone" on public.path_stops;
create policy "path_stops readable by anyone" on public.path_stops for select using (true);
drop policy if exists "path_stops write by authenticated" on public.path_stops;
create policy "path_stops write by authenticated" on public.path_stops for all
  to authenticated using (true) with check (true);

grant select on public.paths, public.path_stops to anon, authenticated;
grant insert, update, delete on public.paths, public.path_stops to authenticated;`.trim();
    }

    function buildWalkingTourImportHelperSql() {
      return String.raw`
create or replace function public.tgb_import_walking_tour(payload jsonb)
returns table (
  action text,
  ord integer,
  name text,
  wpid text,
  note text
)
language plpgsql
as $$
declare
  v_city text;
  v_state text;
  v_title text;
  v_shape text;
  v_ai_model text;
  v_tour_id text;
  v_entry jsonb;
  v_ord integer := 0;
  v_name text;
  v_stop_city text;
  v_stop_state text;
  v_zip text;
  v_address text;
  v_description text;
  v_source_url text;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Expected a JSON object: { city, state, title, shape, ai_model, stops: [...] }';
  end if;

  v_city  := nullif(btrim(payload->>'city'), '');
  v_state := nullif(btrim(payload->>'state'), '');
  v_title := nullif(btrim(payload->>'title'), '');
  v_shape := nullif(btrim(lower(payload->>'shape')), '');
  -- One path is the work of ONE model, so this belongs to the path, not a stop.
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The path needs a city.'; end if;
  if v_title is null then raise exception 'The path needs a title.'; end if;
  -- The seven of paths_shape_known (2026080805). Checked here so a bad shape
  -- comes back as a sentence rather than as a constraint name.
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The path needs a non-empty stops array.';
  end if;

  -- Readable and unique without a sequence: the city, the shape and the second.
  -- SECONDS, not minutes. To the minute, two imports of the same city and shape
  -- inside one minute produce the SAME id - so the second path does not fail,
  -- it silently merges into the first and you get one twenty-stop walk. That has
  -- already happened once in this table.
  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.paths (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'path'::text, null::integer, v_title, v_tour_id, v_shape;

  -- Stops are taken IN ARRAY ORDER. Any walk_order supplied on a stop is
  -- ignored: the array is the sequence, and trusting one over the other when
  -- they disagree is how a path ends up with two stop 4s.
  for v_entry in select value from jsonb_array_elements(payload->'stops')
  loop
    v_name        := nullif(btrim(v_entry->>'name'), '');
    v_stop_city   := coalesce(nullif(btrim(v_entry->>'city'), ''), v_city);
    v_stop_state  := coalesce(nullif(btrim(v_entry->>'state'), ''), v_state);
    v_zip         := nullif(btrim(v_entry->>'zip'), '');
    v_address     := nullif(btrim(v_entry->>'address'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
    v_source_url  := nullif(btrim(v_entry->>'source_url'), '');

    if v_name is null then
      return query select 'skipped'::text, null::integer, null::text, null::text, 'missing name'::text;
      continue;
    end if;

    v_ord := v_ord + 1;
    v_existing := null;

    -- Do we already hold this place? Name AND address, both lowercased. An
    -- archived row counts as held: archived is a do-not-rescrape tombstone, and
    -- re-inserting the place under a new wpid would defeat it entirely.
    if v_address is not null then
      select w.wpid into v_existing
        from public.waypoints w
       where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
         and lower(btrim(coalesce(w.address, ''))) = lower(v_address)
       order by w.wpid
       limit 1;
    end if;

    if v_existing is not null then
      v_wpid := v_existing;
      -- Fill blanks only. Never overwrite a value somebody entered, and never
      -- touch the description - see the header.
      update public.waypoints w set
        city       = coalesce(w.city, v_stop_city),
        state      = coalesce(w.state, v_stop_state),
        zip        = coalesce(w.zip, v_zip),
        source_url = coalesce(w.source_url, v_source_url),
        ai_model   = coalesce(w.ai_model, v_ai_model)
      where w.wpid = v_wpid;
    else
      insert into public.waypoints as w
        (name, city, state, zip, address, description, source_url, ai_model)
      values
        (v_name, v_stop_city, v_stop_state, v_zip, v_address, v_description, v_source_url, v_ai_model)
      returning w.wpid into v_wpid;
    end if;

    -- A place appears at most once per path. A loop FINISHES NEAR its first
    -- stop, it does not list it again, so a repeat is a mistake in the payload
    -- rather than something to store - and the primary key would reject it.
    -- on conflict ON CONSTRAINT, not on (tour_id, wpid): this function's
    -- RETURNS TABLE declares output columns called wpid and ord, and inside an
    -- index-inference clause plpgsql cannot tell those from the table's own
    -- columns - it raises "column reference wpid is ambiguous". Naming the
    -- primary key sidesteps the resolution entirely.
    insert into public.path_stops (tour_id, wpid, ord)
    values (v_tour_id, v_wpid, v_ord)
    on conflict on constraint path_stops_pkey do nothing;

    return query select 'waypoint'::text, v_ord, v_name, v_wpid::text,
      case when v_existing is not null
           then 'reused an existing waypoint; its description was left alone'
           else null end;
  end loop;
end;
$$;`.trim();
    }

    // Canonical sources of the two blocks inlined above:
    //   mc/supabase/migrations/2026080801_waypoints_tour_columns.sql  (the columns)
    //   mc/supabase/walking-tour-prompt-import.sql            (the helper)
    // KEEP THEM IN SYNC. Neither path is printed into a prompt any more.

    // TWO SHAPES, PICKED AT RANDOM, and the pair is deliberate.
    //
    // A ten-stop loop and a six-stop point-to-point are different products, not
    // two sizes of one. The loop suits somebody with an afternoon who came by
    // car and has to get back to it; the point-to-point suits somebody walking
    // between two places they were going anyway, and it can use a one-way street
    // grid or a riverfront that a loop has to fight. Building only one shape
    // would quietly limit which cities work at all.
    //
    // The choice is made HERE rather than left to the model, because a model
    // asked to "pick a shape" picks the loop nearly every time — it is the safer
    // answer — and the catalogue would fill with one shape.
    const TOUR_SHAPES = [
      {
        shape: 'loop',
        stops: 10,
        label: 'ten-stop LOOP',
        rules: [
          'SHAPE: LOOP, 10 stops. The walk ENDS WHERE IT BEGAN.',
          '- The last stop must be within a FIVE MINUTE WALK of the first - close enough that whoever parked, got off the train or left a car at the start collects it without a second thought.',
          '- Do not retrace the outbound pavement. Go out along one set of streets and come back along another; the return half has to show people something new or it is dead time.',
          '- Ten stops in two hours means the stops are close together: five to eight minutes between consecutive ones, and no more than 1.5 miles of walking in total.'
        ]
      },
      {
        shape: 'out_and_back',
        stops: 10,
        label: 'ten-stop OUT AND BACK',
        rules: [
          'SHAPE: OUT AND BACK, 10 stops. The walk goes out along a spine and returns to the same end.',
          '- The last stop must be within a FIVE MINUTE WALK of the first.',
          '- This is the shape for a city with one strong axis - a riverfront, a main street, a park edge, a waterfront promenade. Use that axis: stops 1 to 5 head out along it, stops 6 to 10 come back on the parallel street one block over.',
          '- If the city has no such spine, do not force it. Say so at the end and build the best loop you can instead, and set shape to loop.',
          '- Five to eight minutes between consecutive stops, no more than 1.5 miles total.'
        ]
      },
      {
        shape: 'point_to_point',
        stops: 6,
        label: 'six-stop POINT TO POINT',
        rules: [
          'SHAPE: POINT TO POINT, 6 stops. The walk STARTS ONE PLACE AND FINISHES ANOTHER - what a trail map would call a one-way or thru path. It does NOT come back.',
          '- The two ends must be genuinely different places, and the last stop must NOT be within walking distance of the first - if it is, you have built a loop and should say so and set shape to loop.',
          '- Because nobody returns to the start, BOTH ends have to work on their own: the first stop needs transit or parking nearby, and the LAST stop needs a way to leave - a station, a stop, a rank, a busy street where a car can be called.',
          '- Six stops is a shorter, denser walk: aim for well under two hours and no more than a mile, and make every stop earn its place.'
        ]
      }
    ];

    // A SELLABLE SELF-GUIDED WALK, not a pile of places. That is the whole
    // difference from the "With AI" city sweep next door: this prompt is asked
    // for one product — a shape, a stop count, a start, an end — built from
    // places published tours already visit, and carrying both a sports stop and
    // a music stop because that is what a Game Bureau walk is about.
    //
    // The constraints are ordered by what actually breaks a tour. Relaxing the
    // wrong one produces a plausible list that cannot be walked: a stop three
    // miles out, an address that will not geocode, a "district" instead of a
    // door. Each rule below says what it protects.

/* ==== tourPlacesPrompt ==== */
    function buildTourPlacesWaypointPrompt(city, notes, forcedShape) {
      const target = cleanText(city) || 'a US city';
      const cityOnly = target.split(',')[0].trim();
      const angle = cleanText(notes);
      const existing = existingWaypointSample(800);

      // Random unless the caller pinned one (the routine does, so its choice is
      // recorded in the committed file).
      const pick = TOUR_SHAPES.find((s) => s.shape === forcedShape)
        || TOUR_SHAPES[Math.floor(Math.random() * TOUR_SHAPES.length)];

      const sqlExample = [
        buildWaypointsSchemaSql(),
        '',
        buildWalkingTourSchemaSql(),
        '',
        buildWalkingTourImportHelperSql(),
        '',
        'select *',
        'from public.tgb_import_walking_tour($tgb$',
        '{',
        '  "city": "' + cityOnly + '",',
        '  "state": "LA",',
        '  "title": "Brass, Bourbon and the Black and Gold",',
        '  "shape": "' + pick.shape + '",',
        '  "blurb": "Two hours through the Quarter, from a coffee counter to a jazz room, by way of the corner where the Saints were born.",',
        '  "ai_model": "Anthropic Claude Opus 5",',
        '  "stops": [',
        '    {',
        '      "name": "Cafe du Monde",',
        '      "address": "800 Decatur St",',
        '      "zip": "70116",',
        '      "description": "The 1862 coffee stand that never closes; get the coffee, find your group, and leave when you are ready.",',
        '      "source_url": "https://www.neworleans.com/listing/cafe-du-monde/"',
        '    }',
        '  ]',
        '}',
        '$tgb$::jsonb);'
      ].join('\n');

      return [
        'You are building ONE self-guided walking tour of ' + target + ' for The Game Bureau, which sells walks people follow on their own phone. Your output is that tour, as a Supabase SQL import.',
        '',
        'THE SHAPE YOU HAVE BEEN GIVEN IS A ' + pick.label + '. This is not a preference and not yours to change unless the city genuinely cannot support it, in which case say so plainly after the SQL and set the shape field to what you actually built.',
        ...pick.rules,
        '',
        angle ? 'Angle to build it around: ' + angle + '. Honour it if the city can support it; if it cannot, build the best walk it can and say so at the end.' : null,
        angle ? '' : null,
        'THE PRODUCT, and every rule below serves it:',
        '- TWO HOURS OR LESS including time spent standing at each stop.',
        '- Consecutive stops must be a SHORT WALK APART - five to eight minutes, ideally three. If two stops are twenty minutes apart the tour is broken, however good they both are. Proximity beats prestige here: drop a famous place that sits alone and keep the ordinary one that is on the way.',
        '- The whole set must fit inside ONE walkable district. If the best sports stop is a stadium four miles from the centre, it is NOT on this tour.',
        '- It MUST include at least one SPORTS stop and at least one MUSIC stop. Not a stadium you can only see from a car: a bar where the team is watched, the corner a franchise was founded, a statue, a hall of fame, a club, a studio, a venue, a plaque, a record shop, a street named for a musician. Somewhere a person can physically stand.',
        '- START AND END AT A COMMERCIAL PLACE, preferably food or drink: a bar, a cafe, a diner, a bakery, a market, a brewery. Somewhere open to the public with a door, a name and normal opening hours. This is not decoration - it is what makes the walk work. The first stop has to be somewhere strangers can find each other, wait indoors, buy a coffee and start late without ruining anything; the last has to be somewhere they want to sit down, spend money and stay. A tour that begins at a statue and ends at a plaque leaves people standing on a corner wondering what to do next.',
        '- The rest should mix history, architecture, food and oddity so the time has some shape to it. A tour of nine plaques is not worth paying for.',
        '',
        'ORDER IS THE ARRAY ORDER. The first object in "stops" is the START and the last is the END. Nothing else marks them - do not write "start" or "end" into a name or a description, because the description is read aloud at the stop and has one job.',
        '',
        'ALL STOPS IN THIS TOUR MUST BE DISTINCT PLACES: different addresses, different names, different things to look at. Not two entrances to one building, not "Union Station" and "the Union Station clock". A place may appear on OTHER tours we hold - that is allowed and expected - but never twice in this one.',
        '',
        'WHERE THE STOPS COME FROM. Start from walking tours that ALREADY EXIST for this city - published self-guided paths, guided-tour itineraries, visitor-bureau walks, historical-society trails, museum walking guides, audio tours. Somebody has already decided these places are worth stopping at and written it down, and that published decision is the evidence you are borrowing. Do not invent a path off a map. If a place appears on no published tour but is genuinely unmissable and sits on the line of the walk, you may include it - name which ones in the notes after the SQL.',
        '',
        'FIELDS on the tour object:',
        '- city: "' + cityOnly + '", spelled exactly like that. state: the 2-letter code.',
        '- title: what this walk is called when it is sold. Specific and a bit alive - not "Downtown Walking Tour".',
        '- shape: "' + pick.shape + '" unless you had to change it, in which case use what you built.',
        '- blurb: one or two sentences for the listing page. Not read aloud.',
        '',
        WAYPOINTS_TABLE_DOC,
        '',
        'FIELDS on every stop:',
        '- name: the exact common name of the place.',
        '- address: a REAL STREET ADDRESS - number and street - precise enough to drop a pin on. This is the most important field here and the one most often fudged. "The French Quarter" is not an address. "Corner of Bourbon and St Peter" is not an address. If you cannot find a street number, use the address of the building the thing is attached to, or leave the place out. A stop we cannot geocode cannot be sold.',
        '- zip: the postal code.',
        '- description: this is the ONLY sentence stored per stop, so make it carry both jobs - what the place is, and what to do here on this walk. "The 1862 coffee stand that never closes; get the coffee, find your group, leave when you are ready." One sentence, read aloud, no second field to fall back on.',
        '- source_url: the published tour or venue page you took it from. Never a search-results page.',
        '',
        'ON THE TOUR OBJECT, not on a stop:',
        AI_MODEL_RULE,
        NO_EM_DASH_RULE,
        '',
        existing.length
          ? [
              'ALREADY IN OUR WAYPOINT CATALOG FOR THIS CITY:',
              JSON.stringify(existing, null, 2),
              '',
              'You MAY reuse any of these - the importer links an existing place to this tour rather than duplicating it, and a good place belongs on more than one walk. Do not treat them as anchors, do not path the walk to pass them, and do not assume any of them is good: this catalog was accumulated from sources of uneven quality and is not trusted stop by stop. If the best stops in this city are none of them, that is the correct answer.'
            ].join('\n')
          : 'We hold nothing in this city yet. Design the walk from scratch.',
        '',
        'Do not include: anywhere ticketed and slow enough to eat the two hours (a full museum visit), anywhere closed to the public, private property, a "district" or "neighborhood" as a stop, or anything that is really a driving destination.',
        '',
        'OUTPUT',
        '- Do NOT include a wpid or an id anywhere. The database assigns them.',
        '- Do not put the literal sequence $tgb$ inside any JSON string value.',
        '- Output the COMPLETE script as ONE copy-pasteable block: a single fenced ```sql code block. Do NOT split it across multiple blocks.',
        '- CRITICAL for copy-paste: use ONLY plain ASCII. Straight apostrophes and straight double-quotes only; never smart/curly quotes, en/em dashes, non-breaking spaces, or other Unicode punctuation. Do not hard-wrap or reflow long lines.',
        '- The block must contain ONLY SQL - no prose, headings, or commentary before, after, or inside it.',
        '',
        'Put one self-contained Supabase SQL script in that single block. It must begin with the helper setup below, then ONE call to public.tgb_import_walking_tour with the whole tour. Do not omit the helper setup; the database may not have it yet. Use this exact SQL shape, with your ' + pick.stops + ' stops in place of the single example stop:',
        sqlExample,
        '',
        'Everything you need is in this prompt. You have no access to our repository or our database, so do not refer to a file, do not ask for a schema, and do not assume anything already exists - the block you return must create what it needs and then use it.',
        '',
        'AFTER the SQL block, in plain prose and nothing else: the shape you actually built and why if it differs, total walking distance and rough time, which stop is the sports one and which is the music one, which two are the commercial ends, the published tours you drew from, and anything you had to stretch or could not verify.'
      ].filter((line) => line !== null).join('\n');
    }


/* ==== sportsPrompt ==== */
    function buildNflSportsWaypointPrompt(count) {
      const n = Math.max(1, Math.min(100, parseInt(count, 10) || 10));
      const existing = existingWaypointSample(500);
      const teamCities = NFL_US_CITIES.map((c) => cleanText(parseLocation(c).city)).filter(Boolean);

      const sqlExample = [
        buildWaypointsSchemaSql(),
        '',
        buildWaypointSportsImportHelperSql(),
        '',
        'select *',
        'from public.tgb_import_waypoints_sports_items($tgb$',
        '[',
        '  {',
        '    "name": "St. Peter Catholic Church",',
        '    "city": "Charleston",',
        '    "state": "SC",',
        '    "zip": "29403",',
        '    "address": "100 Example St",',
        '    "description": "Green Bay Packers linebacker Jane Doe married here in 1998, four states from Lambeau Field.",',
        '    "source_url": "https://en.wikipedia.org/wiki/Example_Church"',
        '  }',
        ']',
        '$tgb$::jsonb);'
      ].join('\n');

      return [
        'You are a football historian helping The Game Bureau build a catalog of real, standable places for a location-based game played in NFL cities.',
        '',
        'Task: find up to ' + n + ' places in North America (United States, Canada, or Mexico) that carry a real, documented connection to American football: the NFL, its teams, players, coaches, owners, broadcasters, or league history.',
        '',
        'THE CATCH, and it is the entire point of this request:',
        '- The place must be in a city that is NOT the home city of the NFL team it connects to. A Steelers site in Pittsburgh is worthless here; a Steelers site in Mobile, Alabama is exactly what I want.',
        '- Example of a good find: a famous player who spent his career with the Seattle Seahawks got married in a particular church in New York City. The church is in New York; the football is Seattle\'s. That is the shape.',
        '- Other shapes that work: the hometown, birthplace, childhood home, high school, or college field of a player who went on to play elsewhere; the cemetery or grave of a coach or owner; the hotel, hospital, or courthouse where a famous trade, signing, draft, lawsuit, injury, or franchise move happened; the site of a barnstorming or exhibition game; a birthplace-of-the-league or rule-change marker; a bar, diner, or statue that a team\'s fan diaspora adopted far from home.',
        '- If the connection is to a team in that same city, DROP IT, however good the place is. There is no partial credit and no "well, he also played for...". If a plausible reading puts the team in that town, leave the stop out.',
        '- The 30 NFL home cities, for the avoidance of doubt: ' + teamCities.join(', ') + '. (Arizona = Phoenix, Carolina = Charlotte, New England = Boston, and both New York teams play in East Rutherford, NJ, so treat New York and East Rutherford as the same market.)',
        '',
        ...WIKI_SOURCE_LINES,
        '',
        'How the sourcing rules bend for this job, and how they do not:',
        '- The PERSON\'s or EVENT\'s Wikipedia article is where the football connection gets established. That is allowed and expected: an article about a person is not a candidate stop, but it is a fine source for the claim.',
        '- The PLACE still has to be a place: something a person can walk up to and stand in front of, with a street address or coordinates you verified. A house someone was born in that has been demolished is not a stop. Say so and move on.',
        '- Where a place has no Wikipedia article of its own, the Historical Marker Database (hmdb.org), the Pro Football Hall of Fame, a college or diocese site, or a local newspaper archive is an acceptable source_url, but the football claim must be sourced, not remembered.',
        '- Do not use a private residence that is still lived in. A birthplace museum is fine; a stranger\'s current home is not.',
        '',
        'Research instructions:',
        '- Do the research yourself with your web browsing/search tools. Do not ask me for a dataset; the deliverable is the finished SQL.',
        '- Work from the football end, not the map end: pick players, coaches, and league events first, then find where they physically happened, then check the city against the team.',
        '- Spread the picks across different teams and different eras. ' + n + ' stops about one franchise is a worse answer than ' + n + ' stops about ' + n + ' franchises.',
        '- Never fabricate a place, an address, a date, or a connection. A smaller verified batch is the correct answer when the research does not support ' + n + '.',
        '',
        WAYPOINTS_TABLE_DOC,
        '',
        'Hard requirements for each JSON object:',
        '- name: the place name. Required.',
        '- city: the city the PLACE is in, as a plain string without the state (e.g. "Charleston"). This is the place\'s city, never the team\'s.',
        '- state: the 2-letter code for US places, otherwise the country name (e.g. "Canada").',
        '- zip: the postal/ZIP code as a string. REQUIRED whenever you have a street address. A ZIP is a lookup from a known street address, not a guess. Use null only when the stop genuinely has no street address.',
        '- address: the STREET ONLY: house number and street name, e.g. "100 Example St". Never repeat the city, state, ZIP, or country here. Null if you do not know the street.',
        '- description: ONE original sentence that states the football connection plainly and NAMES THE TEAM, so a reader can see at a glance why a place in this city is on that team\'s map. This sentence is the entire value of the row, so write it as though the place itself is already known and only the football is news.',
        '- source_url: REQUIRED on every object - the page that establishes the connection or the place.',
        AI_MODEL_RULE,
        NO_EM_DASH_RULE,
        '- Do NOT include a wpid or id; the database assigns it.',
        '- The JSON array may contain 1 to ' + n + ' objects. Do not pad with unverifiable entries.',
        '- Do not put the literal sequence $tgb$ inside any JSON string value.',
        '- Output the COMPLETE script as ONE copy-pasteable block: a single fenced ```sql code block (or a code artifact/canvas with a copy button). Do NOT split it across multiple blocks.',
        '- CRITICAL for copy-paste: use ONLY plain ASCII characters. Straight apostrophes and straight double-quotes only; never smart/curly quotes, en/em dashes, non-breaking spaces, or other Unicode punctuation. Do not hard-wrap or reflow long lines. Those silently corrupt the SQL (especially the $tgb$ dollar-quoted JSON).',
        '- The block must contain ONLY SQL: no prose, headings, or commentary before, after, or inside it. Put any notes after the block.',
        '',
        'Put one self-contained Supabase SQL script in that single block. It must begin with the helper setup below, then call the helper with your verified stops. Note this is tgb_import_waypoints_sports_items, NOT the plain waypoints importer; do not substitute the other one. Do not omit the helper setup; the database may not have it yet. Use this exact SQL shape:',
        sqlExample,
        '',
        'About places we already have (the list below):',
        '- Prefer places that are NOT on it. A new stop is worth more than a new sentence.',
        '- But do NOT discard a great football connection just because the place is already in the list. Return it with its football sentence anyway: the importer matches on name + city and APPENDS your sentence to the existing description rather than skipping the row. That is deliberate: the place was already known, the football fact was not.',
        '- Match the spelling of the name and city exactly as they appear below when you are returning an existing place, or the append will not find it.',
        '',
        'Places already in the catalog (name, city; a sample, not necessarily complete):',
        JSON.stringify(existing, null, 2)
      ].join('\n');
    }


/* ==== nflCities ==== */
    const NFL_US_CITIES = [
      'Atlanta, GA',
      'Baltimore, MD',
      'Boston, MA',
      'Buffalo, NY',
      'Charlotte, NC',
      'Chicago, IL',
      'Cincinnati, OH',
      'Cleveland, OH',
      'Dallas, TX',
      'Denver, CO',
      'Detroit, MI',
      'Green Bay, WI',
      'Houston, TX',
      'Indianapolis, IN',
      'Jacksonville, FL',
      'Kansas City, MO',
      'Las Vegas, NV',
      'Los Angeles, CA',
      'Miami, FL',
      'Minneapolis, MN',
      'Nashville, TN',
      'New Orleans, LA',
      'New York, NY',
      'Philadelphia, PA',
      'Phoenix, AZ',
      'Pittsburgh, PA',
      'San Francisco, CA',
      'Seattle, WA',
      'Tampa, FL',
      'Washington, DC'
    ];

    // NFL international host cities (upcoming season + recently announced). The
    // exact slate changes year to year — add or correct any with "Save to my list".
    const NFL_INTL_CITIES = [
      'London, England',
      'Dublin, Ireland',
      'Madrid, Spain',
      'Saint-Denis, France',
      'Munich, Germany',
      'Frankfurt, Germany',
      'Berlin, Germany',
      'São Paulo, Brazil',
      'Rio de Janeiro, Brazil',
      'Mexico City, Mexico',
      'Melbourne, Australia'
    ];

  global.TgbWaypointPrompts = {
    useCatalogue: useCatalogue,
    parseLocation: parseLocation,
    NFL_US_CITIES: NFL_US_CITIES,
    NFL_INTL_CITIES: NFL_INTL_CITIES,
    WIKI_SOURCE_LINES: WIKI_SOURCE_LINES,
    WALK_ORDER_RULE: WALK_ORDER_RULE,
    NO_EM_DASH_RULE: NO_EM_DASH_RULE,
    waypointCountForCity: waypointCountForCity,
    nflCitiesByNeed: nflCitiesByNeed,
    buildWaypointsSchemaSql: buildWaypointsSchemaSql,
    buildWaypointImportHelperSql: buildWaypointImportHelperSql,
    buildWaypointSportsImportHelperSql: buildWaypointSportsImportHelperSql,
    buildWalkingTourSchemaSql: buildWalkingTourSchemaSql,
    buildWalkingTourImportHelperSql: buildWalkingTourImportHelperSql,
    buildWaypointAiPrompt: buildWaypointAiPrompt,
    buildNflWalkingTourPrompt: buildNflWalkingTourPrompt,
    buildOldBarsWaypointPrompt: buildOldBarsWaypointPrompt,
    buildTourPlacesWaypointPrompt: buildTourPlacesWaypointPrompt,
    buildNflSportsWaypointPrompt: buildNflSportsWaypointPrompt
  };
}(window));
