-- walking-tour-prompt-import.sql
--
-- Imports a WHOLE WALKING TOUR as rows in public.waypoints. One tour is a set
-- of rows sharing a tour_id; the row IS the stop.
--
-- (No backticks in this file. mc/data/waypoints.html pastes it verbatim into a
--  String.raw template literal, and one backtick ends the template.)
--
-- HOW THIS DIFFERS FROM tgb_import_waypoints_prompt_items, and why both exist.
-- That helper imports LOOSE waypoints and SKIPS a name+city it already holds,
-- because a second copy of a place nobody asked for is just clutter. This one
-- INSERTS EVERY STOP AS ITS OWN ROW, even when the same place is already in the
-- table on another tour. That is deliberate:
--
--   * the order differs between tours,
--   * the sentence differs - what you say at a stop on a music walk is not what
--     you say about it on a football walk,
--   * and editing a stop on one tour must not silently edit another.
--
-- So on this path a duplicate is the point. Use the other helper for loose
-- waypoints; use this one for a tour.
--
-- SECURITY INVOKER: a human runs it under their own admin session. Waypoint
-- writes are gated behind the authenticated role, so nothing here is callable by anon
-- and no cloud routine can invoke it - the routines commit SQL for a human.
--
-- Re-running creates a SECOND tour with a new tour_id, which is visible and easy
-- to delete, rather than half-merging into the first.

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
  v_ai_model text;
  v_wpid public.waypoints.wpid%type;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Expected a JSON object: { city, state, title, shape, ai_model, stops: [...] }';
  end if;

  v_city  := nullif(btrim(payload->>'city'), '');
  v_state := nullif(btrim(payload->>'state'), '');
  v_title := nullif(btrim(payload->>'title'), '');
  v_shape := nullif(btrim(lower(payload->>'shape')), '');
  -- One tour is the work of ONE model, so this is a property of the tour and
  -- not of a stop. A per-stop value would invite ten different answers to the
  -- same question. Trimmed to the column's 120 rather than rejected.
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The tour needs a city.'; end if;
  if v_title is null then raise exception 'The tour needs a title.'; end if;
  if v_shape is null or v_shape not in ('loop', 'out_and_back', 'point_to_point') then
    raise exception 'shape must be loop, out_and_back or point_to_point (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The tour needs a non-empty stops array.';
  end if;

  -- Readable and unique without a sequence: the city, the shape and the minute.
  -- A human scanning the table can tell what a tour_id is without a join.
  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MI');

  -- NO SYNTHETIC HEADER ROW. This used to emit a leading row with action 'tour'
  -- and a null ord, which read like a stop that had failed to get a number - and
  -- every caller then had to filter it back out before counting stops. The tour's
  -- title and id ride on the note of STOP 1 instead, which is where a reader
  -- looks anyway: stop 1 is the start of the walk, so the walk's name belongs on
  -- it. Every row this function returns is now a real waypoint row.

  -- Stops are taken IN ARRAY ORDER. Any walk_order the model supplied on a stop
  -- is ignored: the array is the sequence, and trusting one over the other when
  -- they disagree is how a tour ends up with two stop 4s.
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

    insert into public.waypoints as w
      (name, city, state, zip, address, description, source_url,
       tour_id, tour_title, tour_shape, walk_order, ai_model)
    values
      (v_name, v_stop_city, v_stop_state, v_zip, v_address, v_description, v_source_url,
       v_tour_id, v_title, v_shape, v_ord, v_ai_model)
    returning w.wpid into v_wpid;

    return query select 'stop'::text, v_ord, v_name, v_wpid::text,
      case when v_ord = 1 then v_title || ' - ' || v_tour_id else null end;
  end loop;
end;
$$;
