-- Publish every gift-shop item now.
--
-- Published means:
--   gift_shop_items.certified_at is stamped
--   gift_shop_items.archived is false
--
-- Archive/unpublish later with the admin "Save & Archive" button, which sets
-- certified_at = null and archived = true.

begin;

alter table public.gift_shop_items
  add column if not exists certified_at timestamptz;

update public.gift_shop_items
   set certified_at = now(),
       archived = false,
       updated_at = now();

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'gift_shop_items'
       and column_name = 'hidden'
  ) then
    execute 'update public.gift_shop_items set hidden = false';
  end if;
end
$$;

update public.gift_shop_listings
   set archived = false,
       updated_at = now();

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'gift_shop_listings'
       and column_name = 'live'
  ) then
    execute 'update public.gift_shop_listings set live = true';
  end if;
end
$$;

select
  (select count(*) from public.gift_shop_items) as items_published,
  (select count(*) from public.gift_shop_items where certified_at is not null and archived = false) as public_item_count,
  (select count(*) from public.gift_shop_listings where archived = false) as active_listing_count;

commit;
