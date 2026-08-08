-- waypoints-prompt-import.sql
--
-- Import helper used by the Waypoints page's "With AI" prompt. An admin copies
-- the generated prompt into a web-capable AI; the AI researches real walking-
-- tour stops for a city and returns ONE Supabase SQL block: this helper's
-- setup, then a call passing the verified stops as a JSON array. The admin
-- pastes that block into the Supabase SQL editor and runs it.
--
-- The helper is idempotent to re-run (create or replace) and skips waypoints
-- that already exist (same name + city), including archived tombstone rows, so
-- a re-paste never duplicates rows and archived stops are not rescraped.
-- wpid is the table's own identity/default — never supplied by the JSON.
--
-- Mirrors the gift shop's supabase/gs-destination-prompt-import.sql pattern.

create or replace function public.tgb_import_waypoints_prompt_items(items jsonb)
returns table (
  action text,
  name text,
  wpid text,
  note text
)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text;
  v_city text;
  v_state text;
  v_zip text;
  v_address text;
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
    -- Which AI produced this stop, in its own words. Trimmed to the column's
    -- 120 rather than rejected: a model that answers with a paragraph should
    -- still be recorded, and a failed paste of twelve stops over a long
    -- self-description would be a poor trade.
    v_ai_model := nullif(left(btrim(coalesce(v_entry->>'ai_model', '')), 120), '');
    -- Advisory position in the city's walk. Anything outside 1..999 is a
    -- mistake (a wpid, a year, a 0) and is dropped rather than rejected: an
    -- unsequenced stop is a small loss, a failed paste of twelve is not.
    v_walk_order := nullif(btrim(v_entry->>'walk_order'), '')::int;
    if v_walk_order is not null and (v_walk_order < 1 or v_walk_order > 999) then
      v_walk_order := null;
    end if;

    if v_name is null then
      return query select 'skipped'::text, null::text, null::text, 'missing name'::text;
      continue;
    end if;

    v_existing := null;
    select w.wpid
      into v_existing
      from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.city, ''))) = lower(coalesce(v_city, ''))
     limit 1;

    if v_existing is not null then
      return query select 'skipped'::text, v_name, v_existing::text, 'existing name + city (active or archived)'::text;
      continue;
    end if;

    insert into public.waypoints as w (name, city, state, zip, address, description, source_url, walk_order, ai_model)
    values (v_name, v_city, v_state, v_zip, v_address, v_description, v_source_url, v_walk_order, v_ai_model)
    returning w.wpid into v_wpid;

    return query select 'inserted'::text, v_name, v_wpid::text, null::text;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- tgb_import_waypoints_sports_items — the "With AI (sports)" variant
-- ---------------------------------------------------------------------------
-- Same JSON shape as the importer above, one deliberate difference: a stop that
-- already exists (same name + city) is NOT skipped — its new sentence is
-- APPENDED to the existing description.
--
-- That inversion is the whole point of the sports pull. It searches for places
-- tied to an NFL team, player, coach, or moment that sit in a city OTHER than
-- that team's home — a player's hometown church, a coach's grave, the hotel
-- where a franchise move was signed. Those places are usually already in the
-- catalog for some unrelated local reason; what is new is the football fact
-- about them. Skipping the row would discard the only thing the run produced.
--
-- Rules that keep a re-paste safe:
--   * the append is skipped when the sentence is already present, so running
--     the same SQL twice does not stutter;
--   * archived rows are appended to but NEVER un-archived — archived is a
--     do-not-rescrape tombstone and this must not resurrect one. The returned
--     note says when that happened;
--   * null state / zip / address / source_url are backfilled, but a value that
--     is already there is left alone. The AI does not overwrite a human.
--
-- Keep in sync with buildWaypointSportsImportHelperSql() in mc/data/waypoints.html,
-- which inlines this function into the generated prompt.

create or replace function public.tgb_import_waypoints_sports_items(items jsonb)
returns table (
  action text,
  name text,
  wpid text,
  note text
)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text;
  v_city text;
  v_state text;
  v_zip text;
  v_address text;
  v_description text;
  v_source_url text;
  v_ai_model text;
  v_walk_order int;
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
    -- Which AI produced this stop, in its own words. Trimmed to the column's
    -- 120 rather than rejected: a model that answers with a paragraph should
    -- still be recorded, and a failed paste of twelve stops over a long
    -- self-description would be a poor trade.
    v_ai_model := nullif(left(btrim(coalesce(v_entry->>'ai_model', '')), 120), '');

    if v_name is null then
      return query select 'skipped'::text, null::text, null::text, 'missing name'::text;
      continue;
    end if;

    v_row := null;
    select w.*
      into v_row
      from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.city, ''))) = lower(coalesce(v_city, ''))
     limit 1;

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
      return query select 'unchanged'::text, v_name, v_row.wpid::text, 'exists, nothing new to add'::text;
      continue;
    end if;

    if position(lower(v_description) in lower(coalesce(v_row.description, ''))) > 0 then
      return query select 'unchanged'::text, v_name, v_row.wpid::text, 'already says this'::text;
      continue;
    end if;

    v_merged := left(btrim(coalesce(nullif(btrim(v_row.description), '') || ' ', '') || v_description), 1200);

    update public.waypoints w
       set description = v_merged,
           state       = coalesce(w.state, v_state),
           zip         = coalesce(w.zip, v_zip),
           address     = coalesce(w.address, v_address),
           source_url  = coalesce(w.source_url, v_source_url),
           -- Blanks-only, like the four above. A row already credited to one
           -- model must not be re-credited to whichever model happened to append
           -- a football sentence years later; the first writer is the one whose
           -- research a wrong address would send you back to. When it was blank,
           -- this append IS the only AI that has touched the row, so record it.
           ai_model    = coalesce(w.ai_model, v_ai_model)
     where w.wpid = v_row.wpid;

    return query select 'appended'::text, v_name, v_row.wpid::text,
      case when v_row.archived then 'appended to an ARCHIVED row; still archived' else null end;
  end loop;
end;
$$;
