alter table public.games
  add column if not exists starting_location_plus_code text;

alter table public.games
  drop constraint if exists games_starting_location_plus_code_long_chk;

alter table public.games
  add constraint games_starting_location_plus_code_long_chk
  check (
    starting_location_plus_code is null
    or starting_location_plus_code ~ '^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{3}$'
  );

comment on column public.games.starting_location_plus_code is
  'Canonical long/global Google Plus Code for the rendezvous point. starting_location_lat/lon are decoded compatibility fields.';
