-- Allow renaming a games.id by cascading updates to every table that
-- references it. Run once in the Supabase SQL editor.

-- photo_submissions.game_id
alter table public.photo_submissions
  drop constraint if exists photo_submissions_game_id_fkey;
alter table public.photo_submissions
  add constraint photo_submissions_game_id_fkey
  foreign key (game_id) references public.games(id)
  on delete cascade on update cascade;

-- anytime_replies.game_id
alter table public.anytime_replies
  drop constraint if exists anytime_replies_game_id_fkey;
alter table public.anytime_replies
  add constraint anytime_replies_game_id_fkey
  foreign key (game_id) references public.games(id)
  on delete cascade on update cascade;

-- game_notes.game_id (if present)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'game_notes'
      and constraint_type = 'FOREIGN KEY'
  ) then
    alter table public.game_notes
      drop constraint if exists game_notes_game_id_fkey;
    alter table public.game_notes
      add constraint game_notes_game_id_fkey
      foreign key (game_id) references public.games(id)
      on delete cascade on update cascade;
  end if;
end
$$;
