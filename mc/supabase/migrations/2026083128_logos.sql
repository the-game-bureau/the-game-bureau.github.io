-- 2026083128  LOGOS ARE A TABLE, LIKE GUIDES
-- ===========================================================================
-- `games.logo_url` points at a file somewhere else, which is the scheme this
-- project has already watched fail once: 390 of 395 GUIDE image urls were 404
-- by the time anybody looked, and [2026080902] answered that by putting the
-- picture IN THE ROW. A logo is the same kind of object with the same failure
-- mode, so it gets the same shape.
--
--   public.logos          one row per logo: a name, a note, and the image.
--   public.games.logo_id  which logo a game wears.
--
-- EMPTY ON PURPOSE. No rows are seeded and nothing is backfilled from
-- `games.logo_url` -- asked for that way, and it is the right order anyway:
-- the urls are a mix of live paths and dead ones, and importing them would
-- fill a fresh table with the very rot this table exists to end.
--
-- THE IMAGE IS TEXT HOLDING A DATA URI, not bytea, exactly as `guides.image`
-- is: PostgREST hands base64 back as JSON either way, and a data URI drops
-- straight into `src` with nothing to decode.
--
-- ===========================================================================
-- WHAT IS DELIBERATELY *NOT* MIRRORED FROM GUIDES
-- ---------------------------------------------------------------------------
-- THERE IS NO `logos_sync_games` TRIGGER, and there must not be one.
-- `guides_sync_games` pushes the guide's TEXT onto every game pointing at it,
-- and this file's own notes record why the IMAGE half of that was frozen:
-- copying a 65 KB data URI onto hundreds of rows, inside a table both ENGINES
-- read with `select=*` at play time, is a page-load cost paid by a buyer.
-- A logo image is the same 65 KB and the same table. So:
--
--   games.logo_id   the pointer, which this room writes.
--   games.logo_url  the hosted copy the engines already read. UNTOUCHED, and
--                   NOT maintained from here.
--
-- When the engines are next opened, the fix is for them to read `logos.image`
-- through `games.logo_id` and stop reading `logo_url` at all -- the same
-- unfinished business `guide_image_url` has.
--
-- APPLY BY HAND, then read the Verify block rather than the absence of an
-- error.

begin;

create table if not exists public.logos (
  id          bigint generated always as identity primary key,
  name        text not null,
  notes       text,
  image       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.logos is
  'One row per logo. The image lives IN the row as a base64 data URI, for the '
  'reason guides.image does: a url pointing somewhere else rots, and 390 of '
  '395 guide urls were 404 before anybody noticed.';

comment on column public.logos.image is
  'The logo as a base64 data URI, downscaled to 512px on upload. Rendered '
  'directly by the Logo Studio. NOT synced to games: games.logo_url is the '
  'hosted copy the engines read and is not maintained from here.';

comment on column public.logos.notes is
  'Free text: where this logo is used, who made it, what it may not sit on. '
  'Never shown to a player.';

-- A NAME IS REQUIRED AND MAY NOT BE BLANK. The room lists logos by name, and a
-- row called nothing is a row nobody can pick out of a list.
alter table public.logos drop constraint if exists logos_name_present;
alter table public.logos add constraint logos_name_present
  check (btrim(name) <> '');

-- THE SAME CEILING GUIDES USE, and for the same reason: a quarter of a
-- megabyte of base64 is far past what any card here draws, and is the clear
-- sign something bypassed the uploader. Refusing it is kinder than a 100 MB
-- page load appearing weeks later with no obvious cause.
alter table public.logos drop constraint if exists logos_image_sane;
alter table public.logos add constraint logos_image_sane
  check (
    image is null
    or (image like 'data:image/%;base64,%' and length(image) <= 262144)
  );

create index if not exists logos_name_idx on public.logos (lower(name));

-- `updated_at` IS THE DATABASE CLOCK, never the client's.
create or replace function public.tgb_logos_touch()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists logos_touch_updated_at on public.logos;
create trigger logos_touch_updated_at
  before update on public.logos
  for each row execute function public.tgb_logos_touch();

alter table public.logos enable row level security;

-- READ IS PUBLIC, WRITE IS SIGNED IN -- the guides policy pair exactly. The
-- read is public because a logo is artwork a player sees, and the engines will
-- need it the day they stop reading `logo_url`.
drop policy if exists logos_read on public.logos;
create policy logos_read on public.logos for select to public using (true);

drop policy if exists logos_write on public.logos;
create policy logos_write on public.logos for all to authenticated
  using (true) with check (true);

grant select on public.logos to anon, authenticated;
grant insert, update, delete on public.logos to authenticated;

-- WHICH LOGO A GAME WEARS.
alter table public.games add column if not exists logo_id bigint;

comment on column public.games.logo_id is
  'The logo this game wears -> public.logos. `logo_url` is the older hosted '
  'copy the engines still read and is NOT maintained from this pointer.';

-- ON DELETE SET NULL, not restrict: deleting a logo must not make a game
-- undeletable, and a game with no logo is an ordinary state. It is the same
-- call `games.guide_id` makes.
alter table public.games drop constraint if exists games_logo_id_fkey;
alter table public.games add constraint games_logo_id_fkey
  foreign key (logo_id) references public.logos (id) on delete set null;

create index if not exists games_logo_id_idx on public.games (logo_id);

commit;

-- ===========================================================================
-- VERIFY. Expect 0 logos, 0 games pointing at one, and both constraints to
-- REFUSE -- an insert that returns without error proves nothing about a check.
--
--   select count(*) as logos from public.logos;
--   select count(*) filter (where logo_id is not null) as games_with_a_logo,
--          count(*) filter (where coalesce(btrim(logo_url),'') <> '') as games_with_a_url
--     from public.games;
--
--   -- both of these must FAIL:
--   insert into public.logos (name) values ('   ');                  -- 23514
--   insert into public.logos (name, image) values ('x', 'http://a');  -- 23514
--   -- and this must succeed, then be deleted:
--   insert into public.logos (name, image)
--        values ('probe', 'data:image/png;base64,AAAA') returning id;
