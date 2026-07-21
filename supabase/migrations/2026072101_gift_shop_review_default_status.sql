-- Gift shop status: Review is the default
-- ---------------------------------------------------------------------------
-- Status is derived from explicit markers only:
--   SHELVED = rejected_at is set
--   LIVE    = certified_at is set
--   REVIEW  = everything else
--
-- A shelved gift can now move directly to Review or Live. The UI clears
-- rejected_at for both transitions, so the old SHELVED -> LIVE guard is no
-- longer part of the workflow.

create or replace function public.tgb_gift_shop_item_status(
  p_certified_at timestamptz,
  p_archived text,
  p_rejected_at timestamptz
) returns text
language sql immutable as $$
  select case
    when p_rejected_at is not null then 'SHELVED'
    when p_certified_at is not null then 'LIVE'
    else 'REVIEW'
  end;
$$;

drop trigger if exists tgb_gift_shop_item_status_guard on public.gift_shop_items;
drop function if exists public.tgb_gift_shop_item_status_guard();
