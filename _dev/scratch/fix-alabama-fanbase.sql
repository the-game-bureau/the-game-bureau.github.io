-- Fix the BY TEAM rail label for the Alabama Crimson Tide.
-- Its fanbase was the bare state name "Alabama", so the scrolling team
-- directory showed "Alabama" instead of the city. Set it to the city,
-- matching the convention used by other schools (e.g. South Alabama = "Mobile").
-- Run in the Supabase SQL editor (service-role); the anon key cannot UPDATE teams.
update public.teams
set fanbase = 'Tuscaloosa'
where team_key = 'NCAAF:ALA';   -- Alabama Crimson Tide (tgbid 505)
