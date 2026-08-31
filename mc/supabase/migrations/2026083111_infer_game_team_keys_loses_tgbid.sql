-- 2026-08-31  infer_game_team_keys stopped compiling, and every game save died
-- ---------------------------------------------------------------------------
-- REPORTED AS a status radio answering
--   {"code":"42703","message":"column team.tgbid does not exist"}
-- and it was never about the status: `infer_game_team_keys` is a BEFORE trigger
-- on public.games, so EVERY WRITE TO EVERY GAME had been failing since
-- 2026083025 dropped `tgbid`. Saving a game, archiving one, duplicating one --
-- all of it, with the same message.
--
-- A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT RUNTIME, so dropping a
-- column out from under a function raises nothing at drop time and nothing at
-- deploy time. It waits for a caller. This project has now been bitten by that
-- exact property FOUR times: tgb_resolve_soundtrack_finding after a table
-- rename, tgb_pull_walking_tours after waypoints.archived was dropped,
-- tgb_pull_concert_tours after the anchor_events rename, and this.
--   THE RULE THIS FILE ALREADY CARRIES IS THE ONE THAT WOULD HAVE CAUGHT IT:
--   "when you drop a column, grep the other migrations for its name before you
--   run the drop." 2026083025 swept the pages and the jerseys and did not sweep
--   the trigger functions.
--
-- WHAT THIS CHANGES: the tgbid half of the function goes, and only that half.
-- The key inference -- league from the id or the tags, matchup codes from the
-- id, then public.infer_team_key -- is untouched, because that is the half that
-- still does something: `away_team_key` and `home_team_key` are live columns
-- read by both engines through team-palette.js.
--
-- THE FOUR TGBID LOOKUPS ARE NOT REPLACED BY ANYTHING, deliberately. They kept
-- `*_team_key` and `*_team_tgbid` paired, and 2026083025 retired both tgbid
-- columns in place: nothing reads them, so filling one in would be maintaining
-- a second copy of a fact nobody asks for -- which is what tgbid WAS.
--
-- REWRITTEN FROM THE LIVE DEFINITION, one half removed, never re-typed from
-- memory: a create-or-replace written afresh rewrites the whole body, and this
-- project has already silently lost a column that way (socials.confidence, five
-- days).
--
-- APPLY BY HAND. Remote migration history has drifted; supabase db push is
-- refused. This one is safe to run with `supabase db query --linked --file`.

begin;

create or replace function public.infer_game_team_keys()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  inferred_league text;
  matchup_codes text[];
begin
  inferred_league := case
    when new.id ~* '^nfl' then 'NFL'
    when new.id ~* '^mlb' then 'MLB'
    when new.id ~* '^nba' then 'NBA'
    when new.id ~* '^nhl' then 'NHL'
    when new.tags @> '["NFL"]'::jsonb then 'NFL'
    when new.tags @> '["NCAAF"]'::jsonb then 'NCAAF'
    when new.tags @> '["MLB"]'::jsonb then 'MLB'
    when new.tags @> '["NBA"]'::jsonb then 'NBA'
    when new.tags @> '["NHL"]'::jsonb then 'NHL'
    when lower(coalesce(new.category_icon, '')) = 'baseball' then 'MLB'
    when lower(coalesce(new.category_icon, '')) = 'basketball' then 'NBA'
    when lower(coalesce(new.category_icon, '')) = 'hockey' then 'NHL'
    else null
  end;

  matchup_codes := regexp_match(
    lower(new.id),
    '^(?:nfl|mlb|nba|nhl)[0-9]*-[0-9]{8}-([a-z0-9]+)-([a-z0-9]+)-'
  );

  -- ONLY A BLANK IS FILLED IN. A key somebody set by hand, or one the anchor
  -- event prefilled, always wins.
  if new.away_team_key is null then
    new.away_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[1],
      new.away_team_city,
      new.away_team_mascot
    );
  end if;

  if new.home_team_key is null then
    new.home_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[2],
      new.home_team_city,
      new.home_team_mascot
    );
  end if;

  return new;
end;
$function$;

commit;

-- Verify -------------------------------------------------------------------
-- APPLY IT, THEN PROVE IT, and prove it with a write rather than by the absence
-- of an error: this function only fails when something calls it.
--
--   -- 1. no function anywhere still names a column that is gone
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and pg_get_functiondef(p.oid) ilike '%teams%tgbid%';
--   -- expect: 0 rows
--
--   -- 2. a real update goes through (the thing that was failing)
--   update public.games set updated_at = updated_at where id = 'nor2026pit';
--   -- expect: UPDATE 1
--
--   -- 3. and the key inference still infers
--   select id, away_team_key, home_team_key
--     from public.games where id = 'nor2026pit';
