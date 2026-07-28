-- waypoints-prompt-import.sql
--
-- Import helper used by the Waypoints page's "With AI" prompt. An admin copies
-- the generated prompt into a web-capable AI; the AI researches real walking-
-- tour stops for a city and returns ONE Supabase SQL block: this helper's
-- setup, then a call passing the verified stops as a JSON array. The admin
-- pastes that block into the Supabase SQL editor and runs it.
--
-- The helper is idempotent to re-run (create or replace) and skips waypoints
-- that already exist (same name + city), so a re-paste never duplicates rows.
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
      return query select 'skipped'::text, v_name, v_existing::text, 'existing name + city'::text;
      continue;
    end if;

    insert into public.waypoints (name, city, state, zip, address, description)
    values (v_name, v_city, v_state, v_zip, v_address, v_description)
    returning wpid into v_wpid;

    return query select 'inserted'::text, v_name, v_wpid::text, null::text;
  end loop;
end;
$$;
