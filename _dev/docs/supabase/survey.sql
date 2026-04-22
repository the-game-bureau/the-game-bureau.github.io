-- Post-game survey responses for the public /survey page.
--
-- Run this in the Supabase SQL editor for the same project used by the
-- games table. Anon users can insert; only authenticated admins can read.

create table if not exists public.survey (
  id uuid primary key default gen_random_uuid(),
  game_id text,
  player_name text,
  team_color text,
  rating_overall smallint check (rating_overall between 1 and 5),
  rating_fun smallint check (rating_fun between 1 and 5),
  rating_difficulty smallint check (rating_difficulty between 1 and 5),
  favorite_moment text,
  suggestions text,
  would_recommend boolean,
  page_url text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists survey_game_created_idx
on public.survey (game_id, created_at desc);

create index if not exists survey_created_idx
on public.survey (created_at desc);

alter table public.survey enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on public.survey to anon, authenticated;
grant select, update, delete on public.survey to authenticated;

drop policy if exists "Anyone can submit a survey" on public.survey;
create policy "Anyone can submit a survey"
on public.survey
for insert
to anon, authenticated
with check (
  rating_overall is not null
  and length(coalesce(favorite_moment, '')) <= 4000
  and length(coalesce(suggestions, '')) <= 4000
);

drop policy if exists "Authenticated can read surveys" on public.survey;
create policy "Authenticated can read surveys"
on public.survey
for select
to authenticated
using (public.is_photo_admin());

drop policy if exists "Authenticated can update surveys" on public.survey;
create policy "Authenticated can update surveys"
on public.survey
for update
to authenticated
using (public.is_photo_admin())
with check (public.is_photo_admin());

drop policy if exists "Authenticated can delete surveys" on public.survey;
create policy "Authenticated can delete surveys"
on public.survey
for delete
to authenticated
using (public.is_photo_admin());
