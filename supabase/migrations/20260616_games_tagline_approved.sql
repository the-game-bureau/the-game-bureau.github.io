-- games.tagline_approved — admin sign-off that a game's tagline is final.
-- Toggled by the "Approved" checkbox in /mc/taglines.html, which PATCHes the
-- new value immediately. Explicitly BOOLEAN (not the TEXT 'YES'/null flag
-- convention used by featured/archived) so the checkbox maps directly to
-- true/false with no string-coercion footgun. Default false. Safe to re-run.

alter table public.games
  add column if not exists tagline_approved boolean not null default false;

comment on column public.games.tagline_approved is
  'Admin sign-off that the tagline is final (Approved checkbox in /mc/taglines.html). Default false.';
