-- Rebuild gift-shop game listings from city-themed item text.
--
-- What this does:
-- 1. Finds each gift item city from the item title, description, or URL.
-- 2. Deletes that item's current gift_shop_listings rows.
-- 3. Re-adds only games whose name/title matches the item's city as:
--    - "{CITY} Fans ..." (fanbase/city-owner format), or
--    - any other title mention of the city that is NOT "... Takeover {CITY}".
--
-- City matching on the game side is based on games.name only. This intentionally
-- avoids adding a Baltimore gift to "Chicago Fans Takeover Baltimore"; that
-- title is a trip TO Baltimore, not a Baltimore-fan game.
--
-- Run in the Supabase SQL editor.

begin;

create or replace function pg_temp.tgb_gs_key(value text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g')), '');
$$;

create or replace function pg_temp.tgb_gs_text(value text)
returns text
language sql
immutable
as $$
  select ' ' || coalesce(pg_temp.tgb_gs_key(value), '') || ' ';
$$;

create or replace function pg_temp.tgb_gs_city_label(value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      case
        when coalesce(value, '') ~* 'd\.?[[:space:]]*c\.?$' then value
        else split_part(coalesce(value, ''), ',', 1)
      end
    ),
    ''
  );
$$;

with
target_items as (
  select i.id as item_id
    from public.gift_shop_items i
   where nullif(to_jsonb(i)->>'gift_card_game_id', '') is null
),
base_city_labels as (
  select distinct label
    from (
      select nullif(
               btrim(regexp_replace(g.name, '^[[:space:]]*(.*)[[:space:]]+[Ff][Aa][Nn][Ss].*$', '\1')),
               ''
             ) as label
        from public.games g
       where g.name ~* '^[[:space:]]*.+[[:space:]]+fans([[:space:]]|$)'
    ) labels
   where label is not null
     and pg_temp.tgb_gs_key(label) is not null
),
city_alias_keys as (
  select label, pg_temp.tgb_gs_key(label) as city_key
    from base_city_labels
  union
  select label, 'nola'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) = 'new orleans'
  union
  select label, 'big easy'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) = 'new orleans'
  union
  select label, 'charm city'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) = 'baltimore'
  union
  select label, 'washington'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) in ('washington', 'washington d c')
  union
  select label, 'd c'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) in ('washington', 'washington d c')
  union
  select label, 'dc'
    from base_city_labels
   where pg_temp.tgb_gs_key(label) in ('washington', 'washington d c')
),
city_terms as (
  select distinct item_key.label, item_key.city_key as item_key, game_key.city_key as game_key
    from city_alias_keys item_key
    join city_alias_keys game_key
      on game_key.label = item_key.label
),
item_cities as (
  select distinct ti.item_id, ct.label, ct.game_key
    from target_items ti
    join public.gift_shop_items i
      on i.id = ti.item_id
    join city_terms ct
      on pg_temp.tgb_gs_text(
           coalesce(i.title, '') || ' ' ||
           coalesce(i.description, '') || ' ' ||
           coalesce(i.url, '')
         ) like '% ' || ct.item_key || ' %'
),
matching_games as (
  select distinct ic.item_id, g.id as game_id, g.name
    from item_cities ic
    join public.games g
      on (g.archived is null or g.archived = '' or upper(g.archived) <> 'YES')
   where pg_temp.tgb_gs_text(g.name) not like '% takeover ' || ic.game_key || ' %'
     and (
       pg_temp.tgb_gs_text(g.name) like '% ' || ic.game_key || ' fans %'
       or pg_temp.tgb_gs_text(g.name) like '% ' || ic.game_key || ' %'
     )
),
numbered_games as (
  select item_id,
         game_id,
         row_number() over (
           partition by item_id
           order by name, game_id
         ) - 1 as position
    from matching_games
),
cleared_legacy_item_games as (
  update public.gift_shop_items i
     set game_id = null
    from target_items ti
   where i.id = ti.item_id
     and i.game_id is not null
   returning i.id
),
deleted_listings as (
  delete from public.gift_shop_listings l
   using target_items ti
   where l.item_id = ti.item_id
   returning l.item_id, l.game_id
),
inserted_listings as (
  insert into public.gift_shop_listings (item_id, game_id, position, archived)
  select item_id, game_id, position, false
    from numbered_games
   order by item_id, position
  returning item_id, game_id
)
select
  (select count(*) from target_items) as items_processed,
  (select count(*) from item_cities) as item_city_matches,
  (select count(*) from cleared_legacy_item_games) as legacy_item_game_ids_cleared,
  (select count(*) from deleted_listings) as listings_removed,
  (select count(*) from inserted_listings) as listings_added,
  (select count(distinct item_id) from inserted_listings) as items_with_new_listings,
  (select count(*) from target_items) - (select count(distinct item_id) from inserted_listings) as items_left_without_listings;

commit;
