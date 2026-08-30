-- HOW FAR A CHALLENGE TRAVELS IS FOUR ANSWERS, NOT TWO.
--
-- 2026082902 gave `scope` two values, portable and place, and the two-way split
-- was already carrying more than it could say. The real ladder, widest first:
--
--   portable  works in any city, in any fandom game        "sing the away side's fight song"
--   team      one club only, anywhere they travel          "28-3", "Deflategate", "Renegade"
--   city      one city only, whoever is visiting           "which lake do these sea horses face"
--   place     one waypoint only                            "whose house is this"
--
-- TEAM AND CITY ARE INDEPENDENT AXES, NOT DEGREES OF ONE THING, and that is why
-- neither is a narrowing of the other. A taunt about 28-3 travels to every city
-- the Falcons visit and belongs to no place. A question about Buckingham
-- Fountain belongs to Chicago and to nobody's fandom. Collapsing them would
-- make one of the two unaskable.
--
-- AND A SCOPE NEEDS A KEY, or it is a tag nothing can obey. `place` has been
-- label-only since it was written: a challenge marked place-bound named no
-- place, so nothing could ever offer it at the right stop and a human had to
-- remember. That was survivable at one row and is not at a library. Each of the
-- three narrow scopes now carries what it is bound TO, and the Route Builder
-- reads those keys to decide which challenges a stop may use.
--
-- THE KEYS ARE NULLABLE ON PURPOSE. Marking a challenge team-bound before you
-- have decided which club is a legitimate half-written row; the room draws it
-- as needing one rather than the database refusing it. What the CHECK does
-- enforce is the opposite mistake: a key that contradicts the scope, which is
-- the state no reader could interpret.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083002_challenge_scope_gains_city_and_team.sql

begin;

-- The old CHECK names two values and has to go before a row can hold a third.
alter table public.challenges drop constraint if exists challenges_scope_check;

alter table public.challenges
  add column if not exists scope_team  text,
  add column if not exists scope_city  text,
  add column if not exists scope_wpid  bigint;

alter table public.challenges
  add constraint challenges_scope_check
  check (scope in ('portable', 'team', 'city', 'place'));

-- A KEY THAT CONTRADICTS ITS SCOPE IS THE ONE STATE NOBODY COULD READ.
-- A portable challenge naming a city is either mis-scoped or mis-keyed, and
-- there is no way to tell which from the row. Refused outright.
alter table public.challenges
  drop constraint if exists challenges_scope_key_check;
alter table public.challenges
  add constraint challenges_scope_key_check check (
        (scope <> 'team'  or scope_city is null)
    and (scope <> 'city'  or scope_team is null)
    and (scope <> 'place' or (scope_team is null and scope_city is null))
    and (scope =  'place' or scope_wpid is null)
    and (scope <> 'portable' or (scope_team is null and scope_city is null and scope_wpid is null))
  );

-- scope_wpid points at a real place, and a deleted waypoint must not leave a
-- challenge claiming to belong to it. SET NULL rather than cascade: the words
-- somebody wrote are still worth keeping, and the room will draw the row as
-- place-bound with nothing named, which is exactly what it then is.
alter table public.challenges drop constraint if exists challenges_scope_wpid_fkey;
alter table public.challenges
  add constraint challenges_scope_wpid_fkey
  foreign key (scope_wpid) references public.waypoints(wpid) on delete set null;

create index if not exists challenges_scope_team_idx on public.challenges (scope_team) where scope_team is not null;
create index if not exists challenges_scope_city_idx on public.challenges (lower(scope_city)) where scope_city is not null;

comment on column public.challenges.scope is
  'How far this challenge travels. portable: any city, any fandom. team: one '
  'club only, wherever they play. city: one city only, whoever is visiting. '
  'place: one waypoint only. Team and city are independent axes, not degrees '
  'of one thing. STORED, never derived from whether the prompt carries a '
  'variable: a portable challenge need not use one.';

comment on column public.challenges.scope_team is
  'teams.team_key, e.g. NFL:CHI. Set only when scope is team. Not a foreign '
  'key: teams.team_key is generated from league and code, so a club that '
  'changes conference keeps its key, and a league we stop carrying should not '
  'silently null a challenge that is still perfectly good writing.';

comment on column public.challenges.scope_city is
  'The city as it is written on the waypoints and routes it applies to, bare, '
  'e.g. Chicago. Set only when scope is city. Matched case-insensitively.';

comment on column public.challenges.scope_wpid is
  'The one waypoint this challenge belongs at. Set only when scope is place.';

commit;

-- ---------------------------------------------------------------------------
-- THE SIX PLACE-BOUND ROWS ALREADY ON FILE NAME NO PLACE, and they were written
-- against waypoints we hold in Chicago. Point each at its real waypoint, so the
-- Route Builder can offer it where it belongs rather than leaving it stranded.
-- Matched on name, and each UPDATE reports what it touched: an update that
-- matches nothing succeeds silently, which is how a backfill looks like it ran.
-- ---------------------------------------------------------------------------
do $$
declare r record; n integer; total integer := 0; missed text := '';
begin
  for r in select * from (values
      ('Cloud Gate, by its real name',     '%cloud gate%'),
      ('Buckingham Fountain, four states', '%buckingham fountain%'),
      ('Ceres, and what she lacks',        '%board of trade%'),
      ('The Billy Goat, 1945',             '%billy goat%'),
      ('Marina City, count the floors',    '%marina city%')
    ) as v(cname, needle)
  loop
    update public.challenges c
       set scope_wpid = (
         select w.wpid from public.waypoints w
          where w.name ilike r.needle
            and lower(coalesce(w.city, '')) = 'chicago'
          order by w.wpid limit 1)
     where c.name = r.cname
       and c.scope = 'place'
       and c.scope_wpid is null;
    get diagnostics n = row_count;
    -- An UPDATE that matched nothing succeeds and says nothing, which is
    -- exactly what a backfill against a renamed row looks like.
    if n = 0 then missed := missed || r.cname || '; '; else total := total + n; end if;
  end loop;
  raise notice 'place-bound challenges pointed at a waypoint: %', total;
  if missed <> '' then raise notice 'NOT matched, point these by hand: %', missed; end if;
end $$;

-- VERIFY, and read the numbers rather than trusting the absence of an error:
--
--   select scope, count(*),
--          count(*) filter (where scope_team is not null) team_keyed,
--          count(*) filter (where scope_city is not null) city_keyed,
--          count(*) filter (where scope_wpid is not null) place_keyed
--     from public.challenges group by scope order by scope;
--
--   -- every contradiction the CHECK refuses, tried on purpose:
--   -- insert ... (scope, scope_city) values ('portable', 'Chicago');  -- must fail
--   -- insert ... (scope, scope_team) values ('city', 'NFL:CHI');      -- must fail
