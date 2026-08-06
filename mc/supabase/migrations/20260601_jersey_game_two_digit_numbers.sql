alter table public.jersey_game
  drop constraint if exists jersey_game_player_nums_two_digit_check;

alter table public.jersey_game
  add constraint jersey_game_player_nums_two_digit_check
  check (
    player1num between 0 and 99
    and player2num between 0 and 99
    and player3num between 0 and 99
  );
