-- WHAT THIS FANDOM IS KNOWN FOR. 2026-09-01.
--
-- `audiences.description`, free text. One or two sentences a person could read
-- aloud: the traditions, the chant, the thing they are famous for doing.
--
-- WHY THE TABLE NEEDED IT. An audience is not a sports team record -- it is a
-- FANDOM, and it can be a band's or an interest's as easily as a club's. Every
-- other column says what the club IS (its league, its colours, its town); none
-- of them says what its PEOPLE are like, which is the thing a game is pitched
-- at and the thing a writer needs in front of them.
--
-- IT IS NOT DERIVED AND CANNOT BE. There is no column, no view and no feed that
-- carries it -- ESPN, TheSportsDB and the rest all describe the club. This is
-- written, by a person or by a prompt.
--
-- FREE TEXT, NO CHECK. A fandom with nothing famous about it is an ordinary row
-- and a null is the honest answer; inventing a tradition would be worse than a
-- blank, which is this project's standing rule about anything unverified.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences add column if not exists description text;

comment on column public.audiences.description is
  'What this fandom is known for -- traditions, chants, the thing they are '
  'famous for doing. One or two sentences, written rather than derived: nothing '
  'in the database or in any public feed carries it. Null is an honest answer.';

commit;

-- Verify:
--   select count(*) as rows, count(description) as described from public.audiences;
