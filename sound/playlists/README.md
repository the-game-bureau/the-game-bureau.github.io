# Sound playlist publishing packet

This folder is the source of truth for the first three city playlists:

- `Dallas: The Game Bureau`
- `New Orleans: The Game Bureau`
- `Pittsburgh: The Game Bureau`

The public sound page is now Spotify-only. Each city card should show one embedded Spotify playlist.
Cap every playlist at 10 songs.
Name each playlist `{City}: The Game Bureau`, for example `Chicago: The Game Bureau`.
If no custom description is needed, use `{City} local artists, sports-team cues, and songs that mention {City}. Curated by The Game Bureau.`
Use `/sound/admin.html` to choose the city from Supabase `gift_shop_cities` and choose one or more teams from Supabase `teams`. The admin stores selected teams in `city-playlists.json`.
Tracks are generated from the admin's Track Prompt. Build the prompt, paste it into an AI tool, then paste the returned `Artist - Title | reason` lines into Tracks before generating CSVs.

## Files

- `city-playlists.json` - canonical playlist metadata and ordered tracks.
- `tracks.csv` - copy/import sheet for manual playlist builds or transfer tools.
- `dallas-import.txt` - simple `Artist - Title` import list.
- `new-orleans-import.txt` - simple `Artist - Title` import list.
- `pittsburgh-import.txt` - simple `Artist - Title` import list.
- `platform-playlists.csv` - Spotify publishing checklist and public URLs.
- `playlist-teams.csv` - selected team metadata for each playlist.

## Status

- Dallas is published on Spotify: https://open.spotify.com/playlist/2sH2k1p1RB9OZAFh9VLtrX
- New Orleans is published on Spotify: https://open.spotify.com/playlist/1jeexdy2NOKvxdvFFCIRmY
- Pittsburgh is published on Spotify: https://open.spotify.com/playlist/0ws20uBk7rQQd91HAgc8Xk

## Future cities

1. Use `/sound/admin.html` to pick the city and teams, then build the Track Prompt.
2. Paste the prompt into an AI tool and paste the returned 10 lines into Tracks.
3. Add an `Artist - Title` import text file.
4. Create the Spotify playlist.
5. Add the public Spotify URL to `city-playlists.json` or `platform-playlists.csv`.
6. Add the city card and Spotify embed to `../index.html`, keeping city cards alphabetized by city name.

## Public contributions

Spotify collaboration is controlled inside the playlist owner's Spotify account, not by the website embed. To let people contribute, open each playlist in Spotify, choose the three-dot menu, then select `Invite collaborators`.

Spotify says collaborators can add, remove, and reorder tracks, and the generated collaborator link is valid for 7 days. Because those links expire, do not hardcode them into `../index.html` as permanent public links. For a durable public contribution flow, collect song suggestions separately and add approved tracks to the Spotify playlists.

Spotify playlist creation through the Web API requires OAuth scopes such as `playlist-modify-public` or `playlist-modify-private`: https://developer.spotify.com/documentation/web-api/reference/create-playlist
