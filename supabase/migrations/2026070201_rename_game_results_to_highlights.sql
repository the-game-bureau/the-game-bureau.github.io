-- Rename the public scoreline table from game_results to highlights.
--
-- The public Highlights page now reads public.highlights. A compatibility
-- public.game_results view remains so older deployed clients can still read
-- during rollout.

do $$
begin
  if to_regclass('public.highlights') is null
     and to_regclass('public.game_results') is not null then
    alter table public.game_results rename to highlights;
  end if;
end $$;

do $$
begin
  if to_regclass('public.highlights') is not null then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_pkey'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_pkey'
    ) then
      alter table public.highlights rename constraint game_results_pkey to highlights_pkey;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_tgb_score_nonnegative'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_tgb_score_nonnegative'
    ) then
      alter table public.highlights rename constraint game_results_tgb_score_nonnegative to highlights_tgb_score_nonnegative;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_opponent_score_nonnegative'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_opponent_score_nonnegative'
    ) then
      alter table public.highlights rename constraint game_results_opponent_score_nonnegative to highlights_opponent_score_nonnegative;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_gameid_filled'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_gameid_filled'
    ) then
      alter table public.highlights rename constraint game_results_gameid_filled to highlights_gameid_filled;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_instanceid_filled'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_instanceid_filled'
    ) then
      alter table public.highlights rename constraint game_results_instanceid_filled to highlights_instanceid_filled;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_tgbteamname_filled'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_tgbteamname_filled'
    ) then
      alter table public.highlights rename constraint game_results_tgbteamname_filled to highlights_tgbteamname_filled;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_opponentname_filled'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_opponentname_filled'
    ) then
      alter table public.highlights rename constraint game_results_opponentname_filled to highlights_opponentname_filled;
    end if;

    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'game_results_winnername_filled'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.highlights'::regclass
        and conname = 'highlights_winnername_filled'
    ) then
      alter table public.highlights rename constraint game_results_winnername_filled to highlights_winnername_filled;
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.game_results_game_created_idx') is not null
     and to_regclass('public.highlights_game_created_idx') is null then
    alter index public.game_results_game_created_idx rename to highlights_game_created_idx;
  end if;

  if to_regclass('public.game_results_created_idx') is not null
     and to_regclass('public.highlights_created_idx') is null then
    alter index public.game_results_created_idx rename to highlights_created_idx;
  end if;
end $$;

create index if not exists highlights_game_created_idx
  on public.highlights (gameid, created_at desc);

create index if not exists highlights_created_idx
  on public.highlights (created_at desc);

do $$
begin
  if to_regclass('public.highlights') is not null then
    if exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Public can read game results'
    ) and not exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Public can read highlights'
    ) then
      alter policy "Public can read game results" on public.highlights rename to "Public can read highlights";
    end if;

    if exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can insert game results'
    ) and not exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can insert highlights'
    ) then
      alter policy "Admins can insert game results" on public.highlights rename to "Admins can insert highlights";
    end if;

    if exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can update game results'
    ) and not exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can update highlights'
    ) then
      alter policy "Admins can update game results" on public.highlights rename to "Admins can update highlights";
    end if;

    if exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can delete game results'
    ) and not exists (
      select 1 from pg_policy
      where polrelid = 'public.highlights'::regclass
        and polname = 'Admins can delete highlights'
    ) then
      alter policy "Admins can delete game results" on public.highlights rename to "Admins can delete highlights";
    end if;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.highlights to anon, authenticated;
grant insert, update, delete on public.highlights to authenticated;

alter table public.highlights enable row level security;

comment on table public.highlights is
  'Public Highlights scoreline rows for TGB-vs-opponent game instances.';
comment on column public.highlights.gameid is
  'The public games.id value this highlight belongs to.';
comment on column public.highlights.instanceid is
  'The playthrough or matchup instance identifier. One highlight row per instance.';
comment on column public.highlights.tgbteamname is
  'The Game Bureau team name shown on the Highlights scoreboard.';
comment on column public.highlights.tgbteamscore is
  'The Game Bureau team score.';
comment on column public.highlights.opponentname is
  'Opponent name shown on the Highlights scoreboard.';
comment on column public.highlights.opponentscore is
  'Opponent score.';
comment on column public.highlights.winnername is
  'Winning team name for this highlight.';

do $$
declare
  legacy_relkind "char";
begin
  select c.relkind
    into legacy_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'game_results';

  if legacy_relkind = 'v' then
    drop view public.game_results;
    legacy_relkind := null;
  end if;

  if legacy_relkind is null and to_regclass('public.highlights') is not null then
    create view public.game_results
    with (security_invoker = true)
    as
    select
      gameid,
      instanceid,
      tgbteamname,
      tgbteamscore,
      opponentname,
      opponentscore,
      winnername,
      created_at
    from public.highlights;
  end if;
end $$;

grant select on public.game_results to anon, authenticated;
grant insert, update, delete on public.game_results to authenticated;

comment on view public.game_results is
  'Compatibility view for clients deployed before public.game_results was renamed to public.highlights.';

notify pgrst, 'reload schema';
