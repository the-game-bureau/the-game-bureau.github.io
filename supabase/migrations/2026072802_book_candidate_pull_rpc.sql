-- Daily book pull: a narrow, anon-callable entry point for the scheduled agent.
--
-- Background. The nightly book pull used to run as a GitHub Action
-- (.github/workflows/shop-book-pull.yml + _dev/scripts/shop-book-pull.mjs),
-- authenticating with SUPABASE_SERVICE_KEY out of GitHub secrets. On 2026-07-28
-- it moved to a scheduled Claude Code cloud routine, which has no secret store —
-- a service-role key would have had to live in the routine's stored prompt in
-- plaintext, where it is visible in the routine UI and re-sent to the model on
-- every run.
--
-- Instead: this SECURITY DEFINER wrapper, granted to anon. The agent calls it
-- with the same public publishable key the website already ships, and no secret
-- exists anywhere.
--
-- What keeps that safe is how little this function can do. It is not a general
-- write path:
--
--   * It ONLY ever inserts rows that are archived = true and certified_at = null
--     — the Review queue. Nothing it creates is visible in the public shop until
--     an admin publishes it by hand.
--   * It cannot update or delete anything, or touch any other table beyond
--     adding gift_shop_listings rows for the item it just created.
--   * It re-derives the Bookshop URL and the cover image from the ISBN itself,
--     exactly like Auto Fill, so a caller cannot inject an arbitrary link or
--     image — the two fields worth attacking.
--   * The existing title/URL dedupe still applies, so it cannot be used to
--     flood the table with copies of one row.
--
-- Worst case for an abusive caller is therefore junk sitting in the Review
-- queue, which an admin deletes. That is a materially smaller blast radius than
-- a service-role key, which reads and writes every table and bypasses all RLS.
--
-- The admin-facing tgb_import_bookshop_prompt_items() is unchanged and stays
-- SECURITY INVOKER — the Mission Control SEARCH PROMPT flow runs as a signed-in
-- admin and does not need this.

create or replace function public.tgb_pull_book_candidates(items jsonb)
returns table (
  action text,
  title text,
  item_id text,
  listings_added integer,
  note text
)
language plpgsql
security definer
-- Pin the schema: a SECURITY DEFINER function without this can be hijacked by a
-- caller-controlled search_path.
set search_path = public, pg_temp
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
  v_count integer;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of book objects.';
  end if;

  -- Bound one call. The daily pull asks for 5; anything wildly larger is either
  -- a bug or abuse, and there is no reason to let one request write 500 rows.
  select jsonb_array_length(items) into v_count;
  if v_count > 25 then
    raise exception 'Too many items in one call (% > 25).', v_count;
  end if;

  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_title := nullif(btrim(v_entry->>'title'), '');
    v_isbn := upper(regexp_replace(coalesce(nullif(v_entry->>'isbn', ''), ''), '[^0-9Xx]', '', 'g'));

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

    -- Derived from the ISBN, never taken from the caller.
    v_url := 'https://bookshop.org/a/87073/' || v_isbn;
    v_image_url := 'https://images-us.bookshop.org/ingram/' || v_isbn || '.jpg';
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');

    v_existing_item_id := null;
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

    -- archived = true and certified_at = null are not negotiable here. They are
    -- what make this function safe to expose; do not add parameters for them.
    insert into public.gift_shop_items (
      kind, title, url, image_url, image_focus, description, archived, certified_at
    )
    values (
      'amazon_link', v_title, v_url, v_image_url, '50% 50%', v_description, true, null
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
        select 1 from public.gift_shop_listings l
         where l.item_id = v_item_id and l.city = v_city
      );

      get diagnostics v_rows = row_count;
      v_listings_added := v_listings_added + v_rows;
      v_position := v_position + 1;
    end loop;

    return query select 'inserted'::text, v_title, v_item_id::text, v_listings_added, null::text;
  end loop;
end;
$$;

comment on function public.tgb_pull_book_candidates(jsonb) is
  'Anon-callable, SECURITY DEFINER. Inserts Review-queue book candidates only '
  '(archived = true, certified_at = null); URL and cover are derived from the '
  'ISBN. Called by the daily book-pull Claude Code routine, which has no secret '
  'store. Max 25 items per call.';

revoke all on function public.tgb_pull_book_candidates(jsonb) from public;
grant execute on function public.tgb_pull_book_candidates(jsonb) to anon, authenticated;
