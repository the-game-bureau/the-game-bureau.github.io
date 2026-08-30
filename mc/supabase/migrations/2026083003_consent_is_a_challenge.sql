-- THE WAIVER IS A CHALLENGE, AND REPLYING "AGREE" IS THE SIGNATURE.
--
-- Kevin's call, and it is a good one because it needs almost nothing new: the
-- machinery that shows a team some words at a stop and records what they typed
-- back already exists, is already append-only, and already knows who they are.
--
-- WHY `game_responses` IS ACTUALLY A DECENT SIGNATURE RECORD, which is the part
-- worth writing down rather than assuming:
--
--   * RLS grants `anon` INSERT and nothing else. A team cannot edit or delete a
--     reply once it is in, and neither can the page.
--   * `tgb_link_game_instance_identity` folds the buyer's Stripe email onto the
--     instance server-side, from `gift_codes`, so the client never asserts who
--     signed. The chain is Stripe -> gift_codes -> game_instances ->
--     game_responses.
--   * `created_at` is the database's clock, not the phone's.
--
-- So the row says: this person, at this moment, replied this. That is what a
-- click-to-agree signature is.
--
-- WHAT THIS MIGRATION DOES NOT SETTLE, said once and plainly: whether a
-- click-through waiver is ENFORCEABLE where we operate is a question for an
-- attorney, and it varies by state and by what is being waived. This builds the
-- mechanism and the record. It does not make the words below legally sound, and
-- the seeded row says so in its own name so nobody can ship it by accident.
--
-- A FIFTH KIND NEEDS A MIGRATION, unlike events.kind: challenges.kind carries a
-- CHECK. `consent` earns one rather than being filed as a `question` with the
-- answer "agree", for three reasons:
--
--   1. THE ENGINE MUST TREAT IT DIFFERENTLY. A question can be got wrong and
--      walked past. A waiver cannot be skipped, cannot be wrong, and gates
--      everything after it.
--   2. "WHICH ROWS ARE WAIVERS" HAS TO BE A QUERY, not a match on a name
--      somebody might rename.
--   3. THE CHECKS DIFFER. `no-answer` fires on a question with no answer, which
--      is right; a consent row is marked against agreement, not an answer.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083003_consent_is_a_challenge.sql

begin;

alter table public.challenges drop constraint if exists challenges_kind_check;
alter table public.challenges
  add constraint challenges_kind_check
  check (kind in ('question', 'minigame', 'photo', 'freeform', 'consent'));

comment on column public.challenges.kind is
  'question: marked against an answer. minigame / photo / freeform: judged by '
  'the team. consent: a waiver. A consent challenge gates the route, cannot be '
  'skipped, and its reply is the signature -- so the engine stores the PROMPT '
  'TEXT VERBATIM in game_responses.response_value, never just the word agree.';

-- ---------------------------------------------------------------------------
-- THE SIGNATURE MUST CARRY ITS OWN CONTRACT.
--
-- This is the one rule that is easy to get wrong and impossible to repair
-- afterwards. `challenges.prompt` is editable, by design, in a room built for
-- editing. If a reply records only the word "agree", then every past signature
-- points at whatever the prompt says TODAY -- so a later edit silently rewrites
-- what a thousand people agreed to, and nothing anywhere would show it.
--
-- So the engine writes the whole prompt into response_value at the moment of
-- agreeing. The record is then self-contained and a later edit cannot reach
-- backwards into it. There is no column to add: response_value is text.
-- ---------------------------------------------------------------------------
comment on column public.game_responses.response_value is
  'What the team typed or chose. FOR A CONSENT STOP THIS IS THE FULL WAIVER '
  'TEXT AS SHOWN, verbatim, not the word agree: challenges.prompt is editable, '
  'so a record naming only the assent would point at whatever the prompt says '
  'later. A signature has to carry its own contract.';

commit;

-- ---------------------------------------------------------------------------
-- THE ROW. Scope portable: one waiver serves every game in every city, which is
-- exactly what the portable scope is for, and it is the row that most needs to
-- be one row rather than four hundred copies.
--
-- ITS NAME SAYS IT IS A DRAFT because the room lists rows by name, and this is
-- the one row where shipping the wrong words costs something that cannot be
-- undone by editing them later.
-- ---------------------------------------------------------------------------
insert into public.challenges (name, kind, scope, prompt, answer, tags)
select
  'The waiver (DRAFT, not reviewed by an attorney)',
  'consent',
  'portable',
  'Before you set off, the part we have to say out loud.'
  || chr(10) || chr(10) ||
  'This game is played on public streets. You are walking, crossing roads, and '
  || 'deciding for yourselves where to go and how fast. Traffic, weather, other '
  || 'people and the ground under your feet are not ours to control, and we are '
  || 'not with you.'
  || chr(10) || chr(10) ||
  'So: look after each other. Obey traffic signals. Do not trespass, do not '
  || 'climb anything, and do not enter anywhere that is closed. Nothing in this '
  || 'game is ever worth being hurt for, and no challenge is worth more than '
  || 'your judgement about whether it is safe to attempt. Skip anything that '
  || 'does not feel right.'
  || chr(10) || chr(10) ||
  'You play at your own risk, and you take responsibility for yourself and for '
  || 'anyone in your team who is under 18.'
  || chr(10) || chr(10) ||
  'Every player has to agree, whether or not they paid. Type AGREE to sign for '
  || 'your team.',
  'agree',
  array['waiver', 'legal', 'gate', 'draft']
where not exists (select 1 from public.challenges where kind = 'consent');

-- VERIFY:
--
--   select id, name, kind, scope, answer from public.challenges where kind='consent';
--   -- expect exactly one row, scope portable
--
--   -- the fifth kind is accepted and a sixth is still refused:
--   -- insert ... (name, kind) values ('x','consent');  -- must succeed
--   -- insert ... (name, kind) values ('x','waiver');   -- must fail
