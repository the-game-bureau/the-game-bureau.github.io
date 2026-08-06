-- Gift shop URL/image issue checker: per-item "ignore" list.
--
-- The nightly health check (mc/_dev/scripts/shop-error-check.mjs) refreshes
-- committed JSON every run, so an admin's "clear this issue" decision cannot
-- live in generated files (they would be overwritten) or in localStorage
-- (per-browser only). It lives here instead: Stock Room writes a row when an
-- admin clears an item, and the checker reads this table to keep ignored items
-- out of the issue counts for everyone.
--
-- Admin-only, same is_photo_admin() gate as game_instances / photo submissions.
-- The generator reads with the service-role key (bypasses RLS).

create table if not exists public.gift_shop_error_ignores (
  item_id     uuid primary key,
  ignored_at  timestamptz not null default now(),
  ignored_by  text
);

grant usage on schema public to anon, authenticated;
grant select, insert, delete on public.gift_shop_error_ignores to authenticated;

alter table public.gift_shop_error_ignores enable row level security;

-- Only admins may see, add, or remove ignores. (drop-then-create so this
-- migration is safe to re-run — create policy is not idempotent.)
drop policy if exists "Admins can read gift shop error ignores" on public.gift_shop_error_ignores;
create policy "Admins can read gift shop error ignores"
  on public.gift_shop_error_ignores for select to authenticated
  using (public.is_photo_admin());

drop policy if exists "Admins can add gift shop error ignores" on public.gift_shop_error_ignores;
create policy "Admins can add gift shop error ignores"
  on public.gift_shop_error_ignores for insert to authenticated
  with check (public.is_photo_admin());

drop policy if exists "Admins can remove gift shop error ignores" on public.gift_shop_error_ignores;
create policy "Admins can remove gift shop error ignores"
  on public.gift_shop_error_ignores for delete to authenticated
  using (public.is_photo_admin());
