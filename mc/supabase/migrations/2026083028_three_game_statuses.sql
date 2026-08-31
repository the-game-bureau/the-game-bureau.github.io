-- A GAME IS LIVE, ARCHIVED OR BUILDING.
--
-- `public.games` has carried its state in `archived`, a TEXT column where 'YES'
-- is the only true value and null means live. Two states in a flag that reads
-- like a boolean and is not. **BUILDING is the third: written, not finished,
-- and deliberately not on sale.**
--
-- ── `archived` IS KEPT AND KEPT IN STEP, NEVER REPLACED ───────────────────
--
-- **`public.games` is read by both engines with `select=*` and is the paid
-- product**, and `archived` is what `/games/`, `/gifts/` and `site-footer.js`
-- all filter on. So it stays, and a trigger makes the two agree in BOTH
-- directions:
--
--   status changed  ->  archived follows it
--   archived changed ->  status follows it
--
-- **The second direction is what keeps the existing writers working.** The
-- Archive button in this room PATCHes `archived` directly and knows nothing
-- about `status`; without the back-sync it would leave the two disagreeing,
-- which is the exact fault this file keeps recording.
--
-- ── BUILDING IS NOT ON SALE, AND THAT IS THE WHOLE POINT ──────────────────
--
-- `archived` is 'YES' for BOTH `archived` and `building`, so **only `live`
-- reaches a buyer**. A third state that quietly appeared in the shop window
-- would be worse than no third state.
--
-- ── WHAT THIS COSTS TODAY, SAID PLAINLY ───────────────────────────────────
--
-- **31 GAMES ARE LIVE ON `/games/` RIGHT NOW AND ALL OF THEM BECOME BUILDING**,
-- so the public shop window goes to zero. That was asked for, and the 31 ids
-- are written out below so putting them back is one statement:
--
--   44110 alno atl2026nor bal2026nor car2026nor chi2026nor cin2026nor
--   dealertire det2026nor jf2026 mnola nolaofficetour2000 nolapass nor2026ari
--   nor2026atl nor2026car1 nor2026cle nor2026gnb nor2026lvr nor2026min
--   nor2026pit nor2026tam northtxnola nyg2026nor nyk2026nop oswald
--   rockandrollneworleans salno sano smissno tam2026nor
--
--   -- to restore exactly what was live before this migration:
--   -- update public.games set status = 'live' where id in ('44110', 'alno', ...);
--
-- **`erased` IS UNTOUCHED and is still a second, separate flag.** Two of the 395
-- are erased, and anything counting live games has to ask both -- which this
-- file has now recorded from three directions.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083028_three_game_statuses.sql

begin;

alter table public.games add column if not exists status text;

update public.games
   set status = case when archived = 'YES' then 'archived' else 'live' end
 where status is null;

alter table public.games alter column status set default 'building';
alter table public.games alter column status set not null;

alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('live', 'archived', 'building'));

comment on column public.games.status is
  'live, archived or building. BUILDING is written but not finished and is not '
  'on sale. `archived` is kept in step by tgb_games_sync_status in both '
  'directions, and is ''YES'' for archived AND building, so only `live` reaches '
  'a buyer. `erased` is a separate flag and is not this.';

create or replace function public.tgb_games_sync_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.archived = 'YES' then 'archived' else 'building' end;
    end if;
    new.archived := case when new.status = 'live' then null else 'YES' end;
    return new;
  end if;

  -- WHICHEVER ONE THE WRITER TOUCHED IS THE ONE THAT WINS. A caller that knows
  -- about `status` sets it; the Archive button, which does not, sets `archived`
  -- and the status follows. If BOTH moved in one statement, `status` is the
  -- newer idea and leads.
  if new.status is distinct from old.status then
    new.archived := case when new.status = 'live' then null else 'YES' end;
  elsif new.archived is distinct from old.archived then
    new.status := case when new.archived = 'YES' then 'archived' else 'live' end;
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_games_sync_status_trg on public.games;
create trigger tgb_games_sync_status_trg
  before insert or update on public.games
  for each row execute function public.tgb_games_sync_status();

create index if not exists games_status_idx on public.games (status);

-- AND EVERYTHING IS BUILDING, as asked. The trigger takes `archived` with it,
-- so the 31 that were live leave the shop window in the same statement.
update public.games set status = 'building';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select status, coalesce(archived,'(null)'), count(*) from public.games
--    group by 1,2 order by 3 desc;          -- expect building/YES = 395
--   -- the two stay in step, both ways round:
--   update public.games set status = 'live' where id = '<one>';
--   select status, archived from public.games where id = '<one>';   -- live / null
--   update public.games set archived = 'YES' where id = '<one>';
--   select status, archived from public.games where id = '<one>';   -- archived / YES
--   -- and nothing outside the three is accepted:
--   update public.games set status = 'nearly' where id = '<one>';   -- 23514
-- ---------------------------------------------------------------------------
