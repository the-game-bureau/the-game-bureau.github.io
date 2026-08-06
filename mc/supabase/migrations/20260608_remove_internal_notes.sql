-- Retire Mission Control's internal note-taking system.

drop table if exists public.game_notes;
drop table if exists public.bureau_notes;
drop table if exists public.bureau_todos;

alter table public.games
  drop column if exists builder_notes;
