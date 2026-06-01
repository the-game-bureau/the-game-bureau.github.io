-- Fix swapped away-team columns on a single fandom game.
--
-- "Tennessee Fans Takeover New York" had the HOME team (New York / Jets) stored
-- in its away-team columns instead of the traveling fan team (Tennessee /
-- Titans). The By-Fandom directory buckets each game by away_team_city +
-- away_team_mascot, so this row was incorrectly filed under New York (Jets)
-- instead of Tennessee (Titans). Every other "Tennessee Fans Takeover ___" row
-- already carries Tennessee / Titans correctly.

update public.games
   set away_team_city = 'Tennessee',
       away_team_mascot = 'Titans'
 where name = 'Tennessee Fans Takeover New York'
   and away_team_city = 'New York'
   and away_team_mascot = 'Jets';
