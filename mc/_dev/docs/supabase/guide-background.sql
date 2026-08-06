-- Guide background: internal development notes for game guides.
--
-- Run in the Supabase SQL editor for the project that owns public.games.
-- Safe to re-run.

alter table public.games
  add column if not exists guide_background text;
