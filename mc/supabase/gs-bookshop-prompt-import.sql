-- gift-shop Bookshop prompt import helper
--
-- Run once in the Supabase SQL editor. The Mission Control SEARCH PROMPT
-- button asks a web-capable assistant to return SQL that calls this helper:
--
--   select *
--   from public.tgb_import_bookshop_prompt_items($tgb$
--   [
--     {
--       "title": "Example Book",
--       "isbn": "9780000000000",
--       "url": "https://bookshop.org/a/87073/9780000000000",
--       "image_url": "https://images-us.bookshop.org/ingram/9780000000000.jpg",
--       "description": "Short original gift-shop blurb.",
--       "cities": ["City, State"]
--     }
--   ]
--   $tgb$::jsonb);
--
-- New rows start ARCHIVED and unpublished: archived = true and certified_at = null.
-- An admin reviews and publishes them in the gift-shop tool.
-- Duplicate checks scan every gift_shop_items row, including archived/hidden
-- and unpublished rows, so archived inventory is not recreated by later prompts.

alter table public.gift_shop_items
  add column if not exists certified_at timestamptz;

comment on column public.gift_shop_items.certified_at is
  'Last time the item was published by an admin. NULL = unpublished.';

create or replace function public.tgb_import_bookshop_prompt_items(items jsonb)
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
  v_isbn text;
  v_url text;
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
    raise exception 'Expected a JSON array of Bookshop item objects.';
  end if;

  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_title := nullif(btrim(v_entry->>'title'), '');
    v_isbn := upper(regexp_replace(
      coalesce(
        nullif(v_entry->>'isbn', ''),
        substring(coalesce(v_entry->>'url', '') from '/a/87073/([0-9Xx-]+)'),
        ''
      ),
      '[^0-9Xx]',
      '',
      'g'
    ));

    if v_title is null then
      return query select 'skipped'::text, null::text, null::text, 0, 'missing title'::text;
      continue;
    end if;

    if length(v_isbn) not in (10, 13) then
      return query select 'skipped'::text, v_title, null::text, 0, 'missing ISBN-10/ISBN-13'::text;
      continue;
    end if;

    if jsonb_typeof(v_entry->'cities') = 'array' then
      v_cities := v_entry->'cities';
    else
      v_cities := '[]'::jsonb;
    end if;

    -- Link and cover are BOTH derived from the ISBN (same as Auto Fill), never
    -- trusted from the model — that's what kept them accurate.
    v_url := 'https://bookshop.org/a/87073/' || v_isbn;
    v_image_url := 'https://images-us.bookshop.org/ingram/' || v_isbn || '.jpg';
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');

    v_existing_item_id := null;
    -- Look across all item rows, not just public/certified ones. Hidden rows
    -- are still inventory and should keep future prompt imports from duplicating.
    select i.id
      into v_existing_item_id
      from public.gift_shop_items i
     where lower(btrim(coalesce(i.url, ''))) = lower(v_url)
        or lower(btrim(coalesce(i.title, ''))) = lower(v_title)
     limit 1;

    if v_existing_item_id is not null then
      return query select 'skipped'::text, v_title, v_existing_item_id::text, 0, 'existing title or URL'::text;
      continue;
    end if;

    insert into public.gift_shop_items (
      kind,
      title,
      url,
      image_url,
      image_focus,
      description,
      archived,
      certified_at
    )
    values (
      'amazon_link', -- compatibility kind for all outbound affiliate items
      v_title,
      v_url,
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

    -- City assignment is optional: items with no recognizable city are inserted
    -- unassigned (they just won't show under a city until an admin assigns one).
    return query select 'inserted'::text, v_title, v_item_id::text, v_listings_added, null::text;
  end loop;
end;
$$;
