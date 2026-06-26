-- gift-shop Amazon prompt import helper
--
-- Run in the Supabase SQL editor if you want to install the Amazon import
-- helper manually. The Mission Control AMAZON SEARCH PROMPT also asks the
-- assistant to include this helper inline before the import call.
--
-- Amazon referral URL pattern:
--   https://www.amazon.com/dp/<ASIN>?tag=thegamebureau-20&ascsubtag=nolanatives-20&store=nolanatives-20
--
-- New rows are intentionally inserted with certified_at = NULL. That keeps
-- "Certify Today" unchecked in /mc/gs-shop.html and keeps the public /gifts/
-- page from showing the items until an admin reviews and certifies them.
-- Duplicate checks scan every gift_shop_items row, including archived/hidden
-- and uncertified rows, so hidden inventory is not recreated by later prompts.

alter table public.gift_shop_items
  add column if not exists certified_at timestamptz;

comment on column public.gift_shop_items.certified_at is
  'Last time the item was certified by an admin (Certify Today in /mc/gs-shop.html). NULL = never.';

create or replace function public.tgb_import_amazon_prompt_items(items jsonb)
returns table (
  action text,
  title text,
  item_id text,
  listings_added integer,
  note text
)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_title text;
  v_asin text;
  v_url text;
  v_image_url text;
  v_price_display text;
  v_description text;
  v_game_ids jsonb;
  v_game_id_text text;
  v_game_id public.games.id%type;
  v_item_id public.gift_shop_items.id%type;
  v_existing_item_id public.gift_shop_items.id%type;
  v_position integer;
  v_listings_added integer;
  v_rows integer;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of Amazon item objects.';
  end if;

  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_title := nullif(btrim(v_entry->>'title'), '');
    v_asin := upper(regexp_replace(
      coalesce(
        nullif(v_entry->>'asin', ''),
        substring(coalesce(v_entry->>'url', '') from '/dp/([A-Za-z0-9]{10})'),
        substring(coalesce(v_entry->>'url', '') from '/gp/product/([A-Za-z0-9]{10})'),
        ''
      ),
      '[^A-Z0-9]',
      '',
      'g'
    ));

    if v_title is null then
      return query select 'skipped'::text, null::text, null::text, 0, 'missing title'::text;
      continue;
    end if;

    if v_asin !~ '^[A-Z0-9]{10}$' then
      return query select 'skipped'::text, v_title, null::text, 0, 'missing 10-character ASIN'::text;
      continue;
    end if;

    if jsonb_typeof(v_entry->'game_ids') = 'array' then
      v_game_ids := v_entry->'game_ids';
    elsif nullif(v_entry->>'game_id', '') is not null then
      v_game_ids := jsonb_build_array(v_entry->>'game_id');
    else
      v_game_ids := '[]'::jsonb;
    end if;

    if jsonb_array_length(v_game_ids) = 0 then
      return query select 'skipped'::text, v_title, null::text, 0, 'missing game_ids'::text;
      continue;
    end if;

    v_url := 'https://www.amazon.com/dp/' || v_asin || '?tag=thegamebureau-20&ascsubtag=nolanatives-20&store=nolanatives-20';
    v_image_url := nullif(btrim(v_entry->>'image_url'), '');
    v_price_display := nullif(btrim(v_entry->>'price_display'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');

    if v_image_url is null then
      return query select 'skipped'::text, v_title, null::text, 0, 'missing image_url'::text;
      continue;
    end if;

    v_existing_item_id := null;
    -- Look across all item rows, not just public/certified ones. Hidden rows
    -- are still inventory and should keep future prompt imports from duplicating.
    select i.id
      into v_existing_item_id
      from public.gift_shop_items i
     where lower(btrim(coalesce(i.url, ''))) = lower(v_url)
        or coalesce(i.url, '') ilike '%/dp/' || v_asin || '%'
        or coalesce(i.url, '') ilike '%/gp/product/' || v_asin || '%'
        or lower(btrim(coalesce(i.title, ''))) = lower(v_title)
     limit 1;

    if v_existing_item_id is not null then
      return query select 'skipped'::text, v_title, v_existing_item_id::text, 0, 'existing title or ASIN'::text;
      continue;
    end if;

    insert into public.gift_shop_items (
      kind,
      title,
      url,
      image_url,
      image_focus,
      price_display,
      description,
      archived,
      certified_at
    )
    values (
      'amazon_link',
      v_title,
      v_url,
      v_image_url,
      '50% 50%',
      v_price_display,
      v_description,
      false,
      null
    )
    returning id into v_item_id;

    v_listings_added := 0;
    v_position := 0;

    for v_game_id_text in select value from jsonb_array_elements_text(v_game_ids)
    loop
      begin
        v_game_id := v_game_id_text;
      exception when others then
        continue;
      end;

      if not exists (
        select 1
          from public.games g
         where g.id = v_game_id
           and (g.archived is null or g.archived = '' or upper(g.archived) <> 'YES')
      ) then
        continue;
      end if;

      insert into public.gift_shop_listings (item_id, game_id, position, archived)
      select v_item_id, v_game_id, v_position, false
      where not exists (
        select 1
          from public.gift_shop_listings l
         where l.item_id = v_item_id
           and l.game_id = v_game_id
      );

      get diagnostics v_rows = row_count;
      v_listings_added := v_listings_added + v_rows;
      v_position := v_position + 1;
    end loop;

    if v_listings_added = 0 then
      delete from public.gift_shop_items where id = v_item_id;
      return query select 'skipped'::text, v_title, null::text, 0, 'no valid live game listings'::text;
    else
      return query select 'inserted'::text, v_title, v_item_id::text, v_listings_added, null::text;
    end if;
  end loop;
end;
$$;
