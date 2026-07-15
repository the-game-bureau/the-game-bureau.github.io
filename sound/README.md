# Sound

The public page `index.html` renders one cassette case per city soundtrack.
City identity is not stored in this folder anymore:

- City names, labels, sort order, geo badge fields, tape colors, and Spotify playlist ids come from `public.cities`.
- Track lists and cassette-spine phrase tags live in `soundtracks.json`, keyed by `city_slug`.
- The page fetches both at runtime and renders the cassette grid, city rail, and search from those sources.

Run `supabase/migrations/2026071501_cities_soundtracks.sql` before deploying the updated page. Without the `public.cities` table, `/sound/` will show the loading failure state.

## Files

| File | Role |
| --- | --- |
| `index.html` | Public soundtracks page and cassette player. |
| `soundtracks.json` | Runtime soundtrack data: `city_slug`, optional `spine_tag` / `spine_tag_position`, plus `songs[]` (`title`, `artist`, `spotifyId`, `blurb`, optional `explicit`). |
| `soundtrack_hero.jpg` | Hero/social image used by the page. |

## Add Or Edit A Soundtrack

1. Add or update the city row in `public.cities`.
   Required fields for `/sound/`: `slug`, `city`, `label`, `sort_order`, and structured geo fields where available.
   Optional sound fields: `sound_playlist_id`, `sound_accent`, `sound_secondary`.
2. Add or update the matching `soundtracks.json` entry using the same `city_slug` as `public.cities.slug`.
   Use `spine_tag` for extra cassette-spine copy like `Soundtrack`, `Jams`, or `Mix Tape`; set `spine_tag_position` to `before` only for phrases like `Sounds of`.
3. Keep `spotifyId` filled when possible. If it is empty, the page falls back to a Spotify search for `artist title`.

The 10-song recipe is still: local artists, sports/stadium cues, and songs that name the place. Aim for exactly 10 real Spotify tracks and max 2 per artist.
