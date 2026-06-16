-- Add a division column to public.teams — the sub-group within a conference,
-- stored WITHOUT the conference prefix (e.g. "North", "Central", "Pacific",
-- "Metropolitan"). conference stays its own column (AFC/NFC, Eastern/Western…).
-- Additive + nullable; editable metadata, NOT part of the team identity
-- (identity stays league + code → team_key).

alter table public.teams add column if not exists division text;

comment on column public.teams.division is
  'Division sub-group within the conference, no conference prefix (e.g. "North", "Central", "Pacific"). Editable metadata; not part of the team identity.';
