-- Gift shop item status machine: block SHELVED -> LIVE
-- ---------------------------------------------------------------------------
-- A gift_shop_items row's status is DERIVED (there is no status column):
--     SHELVED  = rejected_at is set          (we passed on it; keep the record)
--     REVIEW   = archived is truthy          (needs a human decision)
--     LIVE     = certified_at is set         (visible in the online shop)
--   (DRAFT     = none of the above — a brand-new row before a decision)
-- Precedence rejected_at > archived > certified_at, matching the app's hide
-- logic (a shelved row is also archived, so rejected_at wins).
--
-- Allowed transitions: LIVE<->REVIEW, LIVE->SHELVED, REVIEW->SHELVED,
-- SHELVED->REVIEW. BLOCKED: SHELVED -> LIVE (a shelved item must go back
-- through REVIEW before it can go live again). Same-status edits and
-- DRAFT->anything are always allowed. This trigger is the authoritative guard —
-- it fires for the admin UI, bulk saves, importers, and any direct SQL.
--
-- `archived` is cast via lower(::text) so the guard works whether the column is
-- boolean (true/false) or text ('YES'); anything but a known falsy token counts
-- as archived.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

create or replace function public.tgb_gift_shop_item_status(
  p_certified_at timestamptz,
  p_archived text,
  p_rejected_at timestamptz
) returns text
language sql immutable as $$
  select case
    when p_rejected_at is not null then 'SHELVED'
    when lower(coalesce(p_archived, '')) not in ('', 'false', 'f', 'no', 'n', '0') then 'REVIEW'
    when p_certified_at is not null then 'LIVE'
    else 'DRAFT'
  end;
$$;

create or replace function public.tgb_gift_shop_item_status_guard()
returns trigger
language plpgsql as $$
declare
  old_state text := public.tgb_gift_shop_item_status(old.certified_at, old.archived::text, old.rejected_at);
  new_state text := public.tgb_gift_shop_item_status(new.certified_at, new.archived::text, new.rejected_at);
begin
  if old_state = 'SHELVED' and new_state = 'LIVE' then
    raise exception
      'Blocked status transition SHELVED -> LIVE on gift_shop_items %; a shelved item must return to REVIEW before it can go live.',
      new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_gift_shop_item_status_guard on public.gift_shop_items;
create trigger tgb_gift_shop_item_status_guard
  before update on public.gift_shop_items
  for each row execute function public.tgb_gift_shop_item_status_guard();

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- drop trigger if exists tgb_gift_shop_item_status_guard on public.gift_shop_items;
-- drop function if exists public.tgb_gift_shop_item_status_guard();
-- drop function if exists public.tgb_gift_shop_item_status(timestamptz, text, timestamptz);
