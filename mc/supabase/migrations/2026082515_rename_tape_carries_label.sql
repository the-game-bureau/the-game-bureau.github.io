-- `tgb_rename_tape` CARRIES THE CITY LABEL TOO.
--
-- With the tie to `public.cities` cut, `city` lives on the row, so moving a
-- tape to another city has to move its label as well. Without this a moved tape
-- would keep the OLD city's name on every row, which is worse than a wrong slug
-- because it is the half a human actually reads.
--
-- `p_new_label` is optional: null leaves the label alone, which is what an
-- ordinary rename of the tape wants.
--
-- APPLIED 2026-08-25.

create or replace function public.tgb_rename_tape(
  p_city text, p_tape text, p_new_city text, p_new_tape text,
  p_label_position text default null, p_new_label text default null,
  p_state_code text default null, p_state_name text default null,
  p_country_code text default null, p_country_name text default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  update public.soundtrack
     set city_slug = coalesce(nullif(btrim(p_new_city), ''), city_slug),
         tape      = coalesce(nullif(btrim(p_new_tape), ''), tape),
         tape_label_position = coalesce(p_label_position, tape_label_position),
         city         = coalesce(nullif(btrim(p_new_label), ''), city),
         -- THE GEO PARTS FOLLOW THE CITY, NOT THE LABEL. Moving to another city
         -- must not leave the old state and country on the row, so a move with
         -- no parts supplied CLEARS them rather than keeping a lie.
         state_code   = case when nullif(btrim(p_new_city), '') is null then state_code
                             else nullif(btrim(p_state_code), '') end,
         state_name   = case when nullif(btrim(p_new_city), '') is null then state_name
                             else nullif(btrim(p_state_name), '') end,
         country_code = case when nullif(btrim(p_new_city), '') is null then country_code
                             else nullif(btrim(p_country_code), '') end,
         country_name = case when nullif(btrim(p_new_city), '') is null then country_name
                             else nullif(btrim(p_country_name), '') end
   where city_slug = p_city and tape = p_tape;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.tgb_rename_tape(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- THE OLD FIVE-ARGUMENT SIGNATURE IS DROPPED, not left beside this one.
-- PostgREST matches an RPC by the NAMES it is sent, and two overloads that both
-- accept the same five would make it refuse to choose, with a 300 that reads
-- like the function is missing.
drop function if exists public.tgb_rename_tape(text, text, text, text, text);
