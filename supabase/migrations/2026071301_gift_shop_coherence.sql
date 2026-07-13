-- Gift shop AI field-coherence verdicts (persisted).
--
-- The "AI audit" on the URL error report (shop/admin/giftshop-errors.htm) asks
-- Claude whether each gift's fields line up — image vs title, title vs the
-- linked product page, city. Those verdicts used to be browser-only and vanished
-- on reload. They live here instead so they persist across devices AND survive
-- the nightly regeneration: the shop-coherence-check Edge Function upserts a row
-- per item as it's audited, and the generator (_dev/scripts/shop-error-check.mjs)
-- reads this table to render a persistent "Field mismatches (AI)" section.
--
-- Admin-only, same is_photo_admin() gate as gift_shop_error_ignores. The
-- generator reads with the service-role key (bypasses RLS).

create table if not exists public.gift_shop_coherence (
  item_id            uuid primary key,
  verdict            text not null,            -- 'ok' | 'warn' | 'mismatch' | 'error'
  summary            text,
  issues             jsonb not null default '[]'::jsonb,
  image_matches      boolean,
  title_matches_page boolean,
  city_ok            boolean,
  checked_at         timestamptz not null default now(),
  checked_by         text
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.gift_shop_coherence to authenticated;

alter table public.gift_shop_coherence enable row level security;

-- Only admins may see or write coherence verdicts. drop-then-create so the
-- migration is safe to re-run (create policy is not idempotent).
drop policy if exists "Admins can read gift shop coherence" on public.gift_shop_coherence;
create policy "Admins can read gift shop coherence"
  on public.gift_shop_coherence for select to authenticated
  using (public.is_photo_admin());

drop policy if exists "Admins can add gift shop coherence" on public.gift_shop_coherence;
create policy "Admins can add gift shop coherence"
  on public.gift_shop_coherence for insert to authenticated
  with check (public.is_photo_admin());

-- UPDATE is needed because the Edge Function upserts (on_conflict=item_id).
drop policy if exists "Admins can update gift shop coherence" on public.gift_shop_coherence;
create policy "Admins can update gift shop coherence"
  on public.gift_shop_coherence for update to authenticated
  using (public.is_photo_admin())
  with check (public.is_photo_admin());

drop policy if exists "Admins can remove gift shop coherence" on public.gift_shop_coherence;
create policy "Admins can remove gift shop coherence"
  on public.gift_shop_coherence for delete to authenticated
  using (public.is_photo_admin());
