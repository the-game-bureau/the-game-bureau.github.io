-- tgb_fill_waypoint_gaps(jsonb) -- lets a routine repair waypoints it did not create.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHY. 132 of 463 waypoints are missing an address, a point, a ZIP or a source.
-- Filling them from a browser means one person sitting there clicking, and
-- filling them all in one script means hammering Nominatim, which is exactly
-- what got this project rate-limited on 2026-08-18. A routine that repairs
-- fifteen rows twice a day clears the backlog in under a week and then keeps up
-- with it forever, at a request rate nobody notices.
--
-- THE SIXTH SECURITY DEFINER RPC, for the reason all five others exist: a cloud
-- routine has no secret store, so it authenticates with the ordinary public
-- publishable key, and writes to public.waypoints are `authenticated` only.
--
-- THIS ONE IS AN UPDATE, WHICH NONE OF THE OTHERS ARE, so it is the one that
-- needed the most care. The constants below are what make it safe to expose to
-- anon and MUST NOT become parameters:
--
--   * IT ONLY EVER FILLS A BLANK. Every column is written through
--     coalesce(existing, incoming), so a value a human typed always wins and
--     the function cannot be used to overwrite anything. Calling it twice
--     changes nothing the second time.
--   * IT CANNOT TOUCH name, city, state, description, walk_order or tour_id.
--     Those are either identity (a rename is how you lose track of a place) or
--     editorial (a description is written for a reader, not fetched). The four
--     it can write are the four that are looked up rather than decided.
--   * THE COORDINATE PAIR IS WRITTEN ONLY INTO A ROW THAT HAS NEITHER HALF, so
--     a pin somebody dragged into place is never moved, and it is refused
--     outright if it is out of range or 0,0. Null Island is in the Gulf of
--     Guinea and is never a walking-tour stop; it is what a failed parse looks
--     like when it comes back as a number.
--   * AT MOST 25 ROWS A CALL.
--
-- IT REPORTS PER ROW rather than raising, the same as tgb_pull_walking_tours:
-- one bad wpid in a batch of fifteen must not throw away the fourteen good
-- ones. The reply is { filled, results: [{ wpid, outcome, fields }] } where
-- outcome is `filled` | `nothing` | `unknown`.

create or replace function public.tgb_fill_waypoint_gaps(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
  v_row jsonb;
  v_wpid bigint;
  v_address text;
  v_zip text;
  v_source text;
  v_lat double precision;
  v_lon double precision;
  v_before public.waypoints%rowtype;
  v_after public.waypoints%rowtype;
  v_fields text[];
  v_results jsonb := '[]'::jsonb;
  v_filled integer := 0;
begin
  -- A bare array or { rows: [...] }, both accepted, because PostgREST names a
  -- top-level key after a PARAMETER over HTTP while a positional call in the
  -- SQL editor passes the array itself. Being right in one place and wrong in
  -- the other already cost this project a fortnight of silently failing
  -- statements in the Tape Room.
  if payload is null then
    raise exception 'Expected a JSON array of { wpid, address, zip, source_url, lat, lon }.';
  elsif jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' and jsonb_typeof(payload->'rows') = 'array' then
    v_rows := payload->'rows';
  else
    raise exception 'Expected a JSON array of { wpid, address, zip, source_url, lat, lon }.';
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('filled', 0, 'results', '[]'::jsonb);
  end if;
  if jsonb_array_length(v_rows) > 25 then
    raise exception 'At most 25 waypoints a call (got %).', jsonb_array_length(v_rows);
  end if;

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    begin
      v_wpid := (v_row->>'wpid')::bigint;
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wpid', v_row->>'wpid', 'outcome', 'unknown', 'fields', '[]'::jsonb));
      continue;
    end;

    select * into v_before from public.waypoints where wpid = v_wpid;
    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wpid', v_wpid, 'outcome', 'unknown', 'fields', '[]'::jsonb));
      continue;
    end if;

    v_address := nullif(btrim(coalesce(v_row->>'address', '')), '');
    v_zip     := nullif(btrim(coalesce(v_row->>'zip', '')), '');
    v_source  := nullif(btrim(coalesce(v_row->>'source_url', '')), '');

    -- A pair or nothing. A lat with no lon is not half a point.
    begin
      v_lat := nullif(btrim(coalesce(v_row->>'lat', '')), '')::double precision;
      v_lon := nullif(btrim(coalesce(v_row->>'lon', '')), '')::double precision;
    exception when others then
      v_lat := null; v_lon := null;
    end;
    if v_lat is null or v_lon is null
       or v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180
       or (v_lat = 0 and v_lon = 0) then
      v_lat := null; v_lon := null;
    end if;

    -- A source has to look like a source. Anything else is not worth the row it
    -- would sit in, and this column exists so a claim stays checkable.
    if v_source is not null and v_source !~* '^https?://\S+$' then
      v_source := null;
    end if;

    update public.waypoints w set
      address    = coalesce(w.address, v_address),
      zip        = coalesce(w.zip, v_zip),
      source_url = coalesce(w.source_url, v_source),
      lat        = case when w.lat is null and w.lon is null then v_lat else w.lat end,
      lon        = case when w.lat is null and w.lon is null then v_lon else w.lon end
    where w.wpid = v_wpid
    returning * into v_after;

    v_fields := array[]::text[];
    if v_before.address    is null and v_after.address    is not null then v_fields := v_fields || 'address'; end if;
    if v_before.zip        is null and v_after.zip        is not null then v_fields := v_fields || 'zip'; end if;
    if v_before.source_url is null and v_after.source_url is not null then v_fields := v_fields || 'source_url'; end if;
    if v_before.lat        is null and v_after.lat        is not null then v_fields := v_fields || 'coordinates'; end if;

    if array_length(v_fields, 1) is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wpid', v_wpid, 'outcome', 'nothing', 'fields', '[]'::jsonb));
    else
      v_filled := v_filled + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wpid', v_wpid, 'outcome', 'filled', 'fields', to_jsonb(v_fields)));
    end if;
  end loop;

  return jsonb_build_object('filled', v_filled, 'results', v_results);
end;
$$;

comment on function public.tgb_fill_waypoint_gaps(jsonb) is
  'Lets PATH BOT repair existing waypoints. SECURITY DEFINER, callable with the publishable key. FILLS BLANKS ONLY through coalesce, so it can never overwrite a value a human typed; touches address, zip, source_url, lat and lon and nothing else; writes a coordinate pair only into a row that has neither half. At most 25 rows a call. Those constants are what make it safe to expose to anon, so do not add parameters for them.';

revoke all on function public.tgb_fill_waypoint_gaps(jsonb) from public;
grant execute on function public.tgb_fill_waypoint_gaps(jsonb) to anon, authenticated;
