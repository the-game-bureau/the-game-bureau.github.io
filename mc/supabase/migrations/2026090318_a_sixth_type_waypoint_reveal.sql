-- A SIXTH CHALLENGE TYPE: `waypoint_reveal` (2026-09-03)
--
-- WHY THE UNDERSCORE. The value is used as a CSS class in the room (`is-` +
-- type) to colour its badge, and a space in a class name is two selectors
-- rather than one. `type_answer` and `multiple_choice` both carry one for the
-- same reason. **THE ROOM DRAWS UNDERSCORES AS SPACES**, so the badge reads
-- WAYPOINT REVEAL.
--
-- IT NEEDS A MIGRATION, unlike `events.kind`, and that was checked rather than
-- assumed: `challenges.type` carries `challenges_type_check`, so a new value is
-- refused until the array names it. `events.kind` is free text and a new kind
-- there is one constant.
--
-- NOTHING ELSE HAS TO CHANGE, and the reason is worth stating because it is
-- what makes a sixth type cheap:
--   * The five `challenges_mc_*` rules are written `type <> 'multiple_choice'
--     OR <rule>`, so a new type passes them vacuously. That is correct: a
--     waypoint reveal has no options, and requiring it to carry an answer or a
--     four-option list would be inventing a rule nobody asked for.
--   * `challenges_ladder_key_belongs_to_type` requires `ladder_key IS NULL` on
--     everything that is not multiple choice, so a waypoint reveal must carry
--     none. Also correct: the ladder key is how a question is tied to a club or
--     a city, and a reveal is tied to the stop it sits at.
--   * `challenges_answer_is_a_choice` and `challenges_choices_enough` are
--     guarded on `choices IS NULL`, so they are silent on a row with none.
--
-- SO THE ONE THING TO WATCH is that the room's `KIND_VALUES` gains it in the
-- same commit. A value the CHECK accepts and the picker does not offer is
-- unreachable; a value the picker offers and the CHECK refuses is a save that
-- fails with a constraint name. **`freeform` was the second of those for a few
-- hours this morning**, which is why the checks now assert both directions.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090318_a_sixth_type_waypoint_reveal.sql

begin;

alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['type_answer', 'minigame', 'photo',
                           'operations', 'multiple_choice', 'waypoint_reveal']));

commit;

-- VERIFY ---------------------------------------------------------------------
--   -- A CHECK IS ONLY PROVED BY MAKING IT ACCEPT AND REFUSE. A `create` that
--   -- returns without error says nothing about either.
--   begin;
--     insert into public.challenges (type, name, prompt)
--     values ('waypoint_reveal', 'probe', 'Walk to the next stop.')
--     returning id, type;                      -- expect it to be accepted
--     insert into public.challenges (type, name, prompt)
--     values ('not_a_type', 'probe2', 'x');    -- expect 23514
--   rollback;
--
--   select type, count(*) from public.challenges group by type order by 2 desc;
