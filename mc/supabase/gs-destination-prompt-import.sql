-- gift-shop Destination prompt import helper
--
-- Run in the Supabase SQL editor if you want to install the destination import
-- helper manually. The Mission Control CITY-GUIDE SEARCH PROMPT also asks the
-- assistant to include this helper inline before the import call.
--
-- "Destination" items are the shop's third source (alongside Bookshop.org books
-- and Amazon products): hand-picked links to OFFICIAL destination pages — city
-- visitor guides / request-a-guide pages, free walking tours, free local
-- experiences, park/landmark pages, official event calendars, etc. They are NOT
-- affiliate links and TGB does not process payment: the item may be free or paid
-- and that is handled entirely on the destination's own page. We only link out.
--
-- Each JSON object: title, url (the official destination page), cta_label (the
-- gift-shop button text, e.g. "Request Guide"), image_url (optional; NULL if
-- unknown — an admin can add it later), description, cities. url is required.
--
-- New rows start ARCHIVED and unpublished: archived = true and certified_at = null.
-- An admin reviews and publishes them in the gift-shop tool. Duplicate checks
-- scan every gift_shop_items row (including archived/hidden/unpublished) so
-- archived inventory is not recreated by later prompts.

alter table public.gift_shop_items
  add column if not exists certified_at timestamptz;

alter table public.gift_shop_items
  add column if not exists cta_label text;

comment on column public.gift_shop_items.cta_label is
  'Optional gift-shop button label. When null the public shop derives the label from the URL (Amazon/Bookshop) or falls back to "Visit Site". Used for hand-added destination links like visitor guides.';

create or replace function public.tgb_import_destination_prompt_items(items jsonb)
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
  v_url text;
  v_cta_label text;
  v_image_url text;
  v_description text;
  v_cities jsonb;
  v_city text;
  v_item_id public.gift_shop_items.id%type;
  v_existing_item_id public.gift_shop_items.id%type;
  v_position integer;
  v_listings_added integer;
  v_rows integer;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of destination item objects.';
  end if;

  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_title := nullif(btrim(v_entry->>'title'), '');
    v_url := nullif(btrim(v_entry->>'url'), '');
    v_cta_label := nullif(left(btrim(coalesce(v_entry->>'cta_label', '')), 40), '');
    v_image_url := nullif(btrim(v_entry->>'image_url'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');

    if v_title is null then
      return query select 'skipped'::text, null::text, null::text, 0, 'missing title'::text;
      continue;
    end if;

    if v_url is null or v_url !~* '^https?://' then
      return query select 'skipped'::text, v_title, null::text, 0, 'missing or invalid http(s) url'::text;
      continue;
    end if;

    if jsonb_typeof(v_entry->'cities') = 'array' then
      v_cities := v_entry->'cities';
    else
      v_cities := '[]'::jsonb;
    end if;

    v_existing_item_id := null;
    -- Hidden/archived and unpublished rows still count as existing inventory.
    select i.id
      into v_existing_item_id
      from public.gift_shop_items i
     where lower(btrim(coalesce(i.url, ''))) = lower(v_url)
        or lower(btrim(coalesce(i.title, ''))) = lower(v_title)
     limit 1;

    if v_existing_item_id is not null then
      return query select 'skipped'::text, v_title, v_existing_item_id::text, 0, 'existing title or url'::text;
      continue;
    end if;

    insert into public.gift_shop_items (
      kind, title, url, cta_label, image_url, image_focus,
      description, archived, certified_at
    )
    values (
      'destination_link',
      v_title,
      v_url,
      v_cta_label,
      v_image_url,
      '50% 50%',
      v_description,
      true,
      null
    )
    returning id into v_item_id;

    v_listings_added := 0;
    v_position := 0;

    for v_city in select btrim(value) from jsonb_array_elements_text(v_cities)
    loop
      if v_city is null or v_city = '' then
        continue;
      end if;

      insert into public.gift_shop_listings (item_id, city, position, archived)
      select v_item_id, v_city, v_position, false
      where not exists (
        select 1
          from public.gift_shop_listings l
         where l.item_id = v_item_id
           and l.city = v_city
      );

      get diagnostics v_rows = row_count;
      v_listings_added := v_listings_added + v_rows;
      v_position := v_position + 1;
    end loop;

    -- City assignment is optional: an item with no recognizable city is inserted
    -- unassigned (it just won't show under a city until an admin assigns one).
    return query select 'inserted'::text, v_title, v_item_id::text, v_listings_added, null::text;
  end loop;
end;
$$;
