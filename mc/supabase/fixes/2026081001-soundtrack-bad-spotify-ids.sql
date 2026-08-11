-- Soundtrack audit 2026-08-10 — bad spotify_id values found on live tapes.
--
-- Run this in the Supabase SQL editor, or press Edit on each track in the Tape
-- Room (/mc/soundtracks/admin/) — the same findings are already filed in
-- public.soundtrack_issues with these replacement ids in `suggestion`.
--
-- The daily routine CANNOT apply these itself. It holds only the publishable
-- key, and a PATCH to soundtrack_songs with that key returns HTTP 200 with an
-- empty array — RLS matches zero rows rather than refusing — so the write
-- silently does nothing. Song edits are `authenticated` only, by design.
--
-- Every replacement id below was verified by opening its open.spotify.com/track
-- page and reading the og:title / og:description meta tags.

begin;

-- ── Broken: the id resolves to a KARAOKE recording ──────────────────────────
-- These three play a karaoke backing track to a visitor right now.

-- Phoenix · The Authority Song · Jimmy Eat World
-- was 52pPS7bDAom79aFTBJ96KF = "The Authority Song (Karaoke Version)
--     [In the Style of Jimmy Eat World]" — The Karaoke Universe, 2013
-- now 7gAw3OKcrfeRWOFxWs7wgK = Jimmy Eat World · Bleed American · 2001
update public.soundtrack_songs
   set spotify_id = '7gAw3OKcrfeRWOFxWs7wgK'
 where id = 657
   and spotify_id = '52pPS7bDAom79aFTBJ96KF';

-- Phoenix · Until I Fall Away · Gin Blossoms
-- was 0inWbEhjkxP4RcrTxuiy4F = "Until I Fall Away (Originally Performed by
--     Gin Blossoms) [Karaoke Version]" — The Karaoke Channel, 2015
-- now 6Ob6cQBH0I7ZzpLFye2yJs = Gin Blossoms · New Miserable Experience · 1992
update public.soundtrack_songs
   set spotify_id = '6Ob6cQBH0I7ZzpLFye2yJs'
 where id = 658
   and spotify_id = '0inWbEhjkxP4RcrTxuiy4F';

-- Pittsburgh · Send Me On My Way · Rusted Root
-- was 5iknYAzFPLeeKZRbZpWhKm = "Send Me on My Way (Karaoke Version)
--     [Originally Performed By Rusted Root]" — Zoom Karaoke, 2015
-- now 6XK6Zw6JkFsHXzAcMWNiIr = Rusted Root · When I Woke · 1994
update public.soundtrack_songs
   set spotify_id = '6XK6Zw6JkFsHXzAcMWNiIr'
 where id = 670
   and spotify_id = '5iknYAzFPLeeKZRbZpWhKm';

-- ── Broken: the id resolves to a DIFFERENT BAND, and the song may not exist ──
--
-- Pittsburgh · "Mr. Smiley" · The Clarks (song id 669)
--
-- Its id 12GEszobr92vUXs4LCdwjK is "Mr. Smiley" by MUSTARD PLUG, a Michigan ska
-- band with no Pittsburgh tie at all. Worse, The Clarks do not appear to have a
-- song by this title: searching Spotify for "Mr. Smiley" returns only Mustard
-- Plug, Poison and Rickey Smiley. The row looks invented, so there is no id to
-- swap in — this needs a human decision, not an UPDATE.
--
-- Two options, both deliberate:
--
--   (a) Replace it with a real Clarks song. "Better Off Without You"
--       (3z3mNxkc5he3Ug576z0DEw, The Clarks · Let It Go · 2000) is verified.
--       Uncomment to take this route:
--
-- update public.soundtrack_songs
--    set title      = 'Better Off Without You',
--        spotify_id = '3z3mNxkc5he3Ug576z0DEw',
--        blurb      = 'Pittsburgh bar-rock mainstays, three decades of them'
--  where id = 669;
--
--   (b) Shelve it in the Tape Room. That keeps the row as a do-not-rescrape
--       tombstone so the routine never proposes it for Pittsburgh again — which
--       is the better answer if the title really is fabricated. Do this with the
--       Shelve button rather than SQL, so `archived` and the two stamps stay in
--       step (setTrackStatus is the only writer that guarantees that).

-- ── Wrong recording: plays, but not what the title claims ───────────────────
-- Left as UPDATEs to a null id rather than a guess. Clearing spotify_id is
-- always safe: the player falls back to a Spotify search for artist + title.
-- Swap in a verified studio id instead if you would rather pin one.

-- Phoenix · Landslide · Stevie Nicks — id 5fprEY6WEN1wvFXkgfb22C is a Rock and
-- Roll Hall of Fame live compilation credited to Stevie Nicks and Lindsey
-- Buckingham, not the familiar studio recording.
update public.soundtrack_songs set spotify_id = null where id = 655;

-- Pittsburgh · Pumping Iron · Joe Grushecky and The Houserockers — id
-- 4DEiYlGCQ1qKMKbNyGTEqh is "Pumping Iron - Live" featuring Bruce Springsteen,
-- from the 2021 American Babylon anniversary edition.
update public.soundtrack_songs set spotify_id = null where id = 663;

-- Portland · Down By The Water · The Decemberists — id 4atBpHq4SRRRqrXQVriyz6
-- is the live version from "We All Raise Our Voices To The Air", not the studio
-- track from The King Is Dead.
update public.soundtrack_songs set spotify_id = null where id = 675;

commit;

-- After running: the matching rows in public.soundtrack_issues are still `open`.
-- Press "Clear issue" on each in the Tape Room. Clearing does not silence
-- anything — if the next audit still sees the problem it files it again, which
-- is the only real check that the fix landed.
