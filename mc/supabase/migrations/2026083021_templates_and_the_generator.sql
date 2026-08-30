-- STEP SIX: TEMPLATES, AND THE FUNCTION THAT MINTS A GAME.
--
-- **A GAME HAS BEEN A STORED ROW PER MATCHUP.** That is why there are 395 of
-- them, why every combination had to be written out in advance, and why all 395
-- are archived. A template is the recipe instead: **the game is computed when
-- somebody asks for it.**
--
--   template  x  audience  x  occasion   ->  a playable game
--
-- **TWO OF THE THREE ARE OPTIONAL, and that is what makes room for a concert
-- walk and a history walk beside a fixture.** A takeover needs a visiting
-- fandom; Oswald's New Orleans needs neither an opponent nor a date.
--
-- ── THE COPY NAMES CITIES, NEVER NICKNAMES ────────────────────────────────
--
-- `{{away}}` is the visiting audience's HOME CITY, not its name. This is the
-- standing rule on `/games/`: a nickname is somebody else's trademark and the
-- visible page is a shop window, so a game is "Tampa Fans Takeover New Orleans"
-- and never "Buccaneers Fans Takeover New Orleans". **An audience with no home
-- falls back to its name**, because Taylor Swift is not a city and there is
-- nothing else to call her.
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
--
-- **It writes nothing to `public.games`.** That table is 395 archived legacy
-- rows read by both engines with `select=*`, and minting into it would tie the
-- new model to the shape being replaced. `tgb_build_game` RETURNS an assembled
-- game; where a purchased one is stored is the next decision, not this one.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083021_templates_and_the_generator.sql

begin;

create table if not exists public.game_templates (
  template_id bigint generated always as identity primary key,

  place_id text not null references public.places (id) on delete cascade,
  -- NULLABLE, AND THE COUNT OF NULLS IS A REAL NUMBER TO WATCH. A template with
  -- no route is a city we want to sell and have not walked yet; it is honest to
  -- record that rather than refuse the row.
  route_id text references public.routes (route_id) on delete set null,

  kind text not null default 'takeover',
  -- NULL MEANS ANY VISITING AUDIENCE, which is the whole generative move: one
  -- template serves every club that visits. A named audience pins it to one.
  audience_id text references public.audiences (id) on delete cascade,
  theme text,

  name_pattern    text not null default '{{away}} Fans Takeover {{place}}',
  tagline_pattern text,

  -- A takeover does not need a date; a game built around a concert does.
  needs_occasion boolean not null default false,
  active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint game_templates_kind check (kind in ('takeover', 'themed', 'occasion')),
  -- A THEMED GAME IS ABOUT SOMETHING, so it must say what. Without this a themed
  -- template is indistinguishable from a takeover that forgot its audience.
  constraint game_templates_themed_has_a_theme
    check (kind <> 'themed' or coalesce(btrim(theme), '') <> ''),
  -- A TAKEOVER IS PITCHED AT A VISITOR, so pinning one to the club that lives
  -- there is a contradiction rather than a preference.
  constraint game_templates_name_not_blank check (btrim(name_pattern) <> '')
);

comment on table public.game_templates is
  'The recipe, not the game. template x audience x occasion is computed when '
  'somebody asks, rather than stored once per matchup, which is why there were '
  '395 games and none of them live.';
comment on column public.game_templates.audience_id is
  'NULL means ANY visiting audience, which is the generative move: one template '
  'serves every club that visits. Name one to pin the template to a single '
  'fandom, an artist or an interest.';
comment on column public.game_templates.name_pattern is
  '{{place}} the host city, {{away}} the visiting audience''s HOME CITY (never '
  'its nickname, which is somebody else''s trademark), {{theme}}, {{occasion}}.';

create index if not exists game_templates_place_idx on public.game_templates (place_id);
create index if not exists game_templates_audience_idx on public.game_templates (audience_id);

alter table public.game_templates enable row level security;
drop policy if exists "templates are public" on public.game_templates;
create policy "templates are public" on public.game_templates for select using (true);
drop policy if exists "templates admin write" on public.game_templates;
create policy "templates admin write" on public.game_templates
  for all to authenticated using (is_photo_admin()) with check (is_photo_admin());
grant select on public.game_templates to anon, authenticated;
grant insert, update, delete on public.game_templates to authenticated;

-- ---------------------------------------------------------------------------
-- HOW AN AUDIENCE IS NAMED IN COPY. Its home CITY, or its own name when it has
-- no home. One function, so no page has to remember the trademark rule.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_audience_label(p_audience text)
returns text language sql stable as $$
  select case
    -- THE NAME IS A NICKNAME WHEN IT EQUALS THE MASCOT, which is true of every
    -- pro club and of none of the college ones. So the city stands in: "Tampa
    -- Fans Takeover New Orleans", never "Buccaneers Fans".
    when a.nickname is not null and a.name = a.nickname then coalesce(p.city, a.name)
    -- OTHERWISE THE NAME IS SAFE AND THE CITY IS WRONG. The first cut returned
    -- the city for everybody and produced **"Tuscaloosa Fans Takeover New
    -- Orleans"**, which nobody has ever said. A college audience is named for
    -- its SCHOOL, `Alabama` is a state rather than a mark, and it is what a fan
    -- actually calls themselves. An artist or an interest lands here too.
    else a.name
  end
    from public.audiences a
    left join public.places p on p.id = a.home_place_id
   where a.id = p_audience;
$$;

comment on function public.tgb_audience_label(text) is
  'What visible copy calls an audience. A pro club is named by its CITY, because '
  'its name is a nickname and a nickname is somebody else''s trademark. A college '
  'club, an artist and an interest are named by their own name: Alabama is a '
  'state, not a mark, and nobody says "Tuscaloosa fan".';

-- ---------------------------------------------------------------------------
-- THE GENERATOR. Returns an assembled game; writes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_build_game(
  p_template bigint,
  p_audience text default null,
  p_event_id text default null
) returns table (
  template_id bigint,
  place_id    text,
  route_id    text,
  audience_id text,
  anti_audience_id text,
  event_id    text,
  name        text,
  tagline     text,
  stops       int,
  content_keys text[]
)
language sql stable as $$
  select
    t.template_id,
    t.place_id,
    t.route_id,
    coalesce(p_audience, t.audience_id) as audience_id,
    public.tgb_anti_audience(t.place_id, coalesce(p_audience, t.audience_id)) as anti_audience_id,
    p_event_id,
    -- THE SUBSTITUTION. Ordered longest token first so no token is a prefix of
    -- another; there are four today and the rule costs nothing to keep.
    replace(replace(replace(replace(t.name_pattern,
      '{{occasion}}', coalesce(e.title, '')),
      '{{theme}}',    coalesce(t.theme, '')),
      '{{away}}',     coalesce(public.tgb_audience_label(coalesce(p_audience, t.audience_id)), '')),
      '{{place}}',    pl.city) as name,
    replace(replace(replace(replace(coalesce(t.tagline_pattern, ''),
      '{{occasion}}', coalesce(e.title, '')),
      '{{theme}}',    coalesce(t.theme, '')),
      '{{away}}',     coalesce(public.tgb_audience_label(coalesce(p_audience, t.audience_id)), '')),
      '{{place}}',    pl.city) as tagline,
    (select count(*)::int from public.route_stops rs where rs.route_id = t.route_id) as stops,
    public.tgb_content_keys(t.place_id, coalesce(p_audience, t.audience_id)) as content_keys
  from public.game_templates t
  join public.places pl on pl.id = t.place_id
  left join public.events e on e.id = p_event_id
 where t.template_id = p_template
   and t.active;
$$;

comment on function public.tgb_build_game(bigint, text, text) is
  'Assembles a game from a template, a visiting audience and an occasion, and '
  'RETURNS it. Writes nothing: where a purchased game is stored is a separate '
  'decision from how one is composed.';

-- ---------------------------------------------------------------------------
-- WHAT THE CATALOGUE CAN PRODUCE. **A takeover cannot be pitched at the club
-- that lives there**, so the home fandoms are excluded rather than counted.
-- ---------------------------------------------------------------------------
create or replace view public.game_possibilities
with (security_invoker = true) as
select
  t.template_id,
  t.place_id,
  pl.city || ', ' || pl.state as place,
  t.kind,
  t.route_id is not null as walkable,
  case
    when t.audience_id is not null then 1
    else (select count(*)::int from public.audiences a
           where a.kind = 'fandom'
             and (a.home_place_id is distinct from t.place_id))
  end as audiences
  from public.game_templates t
  join public.places pl on pl.id = t.place_id
 where t.active;

comment on view public.game_possibilities is
  'How many games each template can produce. A takeover excludes the clubs at '
  'home in its own city, because a takeover is pitched at a visitor.';

grant select on public.game_possibilities to anon, authenticated;
grant execute on function public.tgb_audience_label(text) to anon, authenticated;
grant execute on function public.tgb_build_game(bigint, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ONE TAKEOVER TEMPLATE PER ROUTE WE ACTUALLY HOLD.
--
-- Seeded from `routes`, not from `places`: a template with no route is a city
-- we want to sell and have not walked, and there is no reason to create 95 of
-- those on day one. The count of walkable templates is then a real measure of
-- what could ship tomorrow.
-- ---------------------------------------------------------------------------
insert into public.game_templates (place_id, route_id, kind, name_pattern, tagline_pattern)
select r.place_id, r.route_id, 'takeover',
       '{{away}} Fans Takeover {{place}}',
       'A walk through {{place}}, written by people who live there.'
  from public.routes r
 where r.place_id is not null
   and not exists (
     select 1 from public.game_templates t
      where t.route_id = r.route_id and t.kind = 'takeover');

-- AND ONE THAT IS NOT A TAKEOVER, so the shape is proved by a row rather than
-- by an argument. **No audience pinned, no occasion, no opponent** -- it is the
-- history walk, and it names the place it is about.
insert into public.game_templates
  (place_id, kind, audience_id, theme, name_pattern, tagline_pattern, needs_occasion)
select 'new-orleans-la', 'themed', 'history-jfk', 'Oswald''s New Orleans',
       '{{theme}}', 'The summer of 1963, on foot, in {{place}}.', false
 where exists (select 1 from public.places where id = 'new-orleans-la')
   and exists (select 1 from public.audiences where id = 'history-jfk')
   and not exists (select 1 from public.game_templates where theme = 'Oswald''s New Orleans');

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by calls that make it do its job.
--
--   select count(*) from public.game_templates;
--   select sum(audiences) as games_the_catalogue_can_produce from public.game_possibilities;
--
--   -- a fixture, assembled:
--   select name, tagline, anti_audience_id, stops, array_length(content_keys, 1)
--     from public.tgb_build_game(
--       (select template_id from public.game_templates
--         where place_id = 'new-orleans-la' and kind = 'takeover' limit 1),
--       'nfl-bears');
--
--   -- and the history walk, which has no opponent and no date:
--   select name, tagline, audience_id, anti_audience_id
--     from public.tgb_build_game(
--       (select template_id from public.game_templates where kind = 'themed' limit 1));
--
--   -- the copy names cities, never nicknames:
--   select public.tgb_audience_label('nfl-buccaneers');   -- expect Tampa
--   select public.tgb_audience_label('history-jfk');      -- expect JFK
-- ---------------------------------------------------------------------------
