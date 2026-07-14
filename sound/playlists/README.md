# Sound playlists — city playlist guide

The public page `../index.html` shows one cassette case per city, backed by 10 songs.
**Every song is a link that plays on Spotify.** The cards are generated (not hand-written)
and baked straight into `index.html`, so the page is fully static — no embeds, no API,
no JS fetch.

The generated cassette labels spell out the full location name (`City, Region`) in the
case title. The page script upgrades older generated markup to that same label shape and
removes the old region badge element before wiring up the cassette popup.

## Files

| File | Role |
| --- | --- |
| `song-playlists.json` | **Source of truth.** Per city: `slug`, `city`, `region`, and `songs` (each `title`, `artist`, `spotifyId`). This is what the page is built from. |
| `build-sound-page.js` | Generator. Reads the JSON (below) and rewrites the city cards in `../index.html`. Run: `node playlists/build-sound-page.js`. |
| `all-cities-spotify-import.csv` | The curated 10-songs-per-city list (`Playlist name`, `Track name`, `Artist name`). Titles/artists for the page come from here. |
| `city-playlists.json` | City metadata: `slug`, `city`, `region`, `playlistName`, optional `accent`/`secondary` card colors. |

`playlistName` (`{City}: The Game Bureau`) is only used to match a city to a Spotify export
file when refreshing IDs — see below.

## How a song becomes a playable link

- If the song has a `spotifyId`, it links to `https://open.spotify.com/track/<id>` — one tap, plays that exact track.
- If not, it links to a Spotify **search** for `artist title` — still plays, just one extra tap.

So the page always works; IDs just upgrade songs from a search to a direct link. Currently the
16 "tail" cities (Saint-Denis → Youngstown) use search links because they weren't in the last
export; the rest are direct.

## The 10-song recipe

Each city blends three buckets so it feels like the *place*, not a genre station:

- **Local / hometown artists** (Seattle → Nirvana, Pearl Jam).
- **Sports-team & stadium cues** — anthems, goal songs, fight songs (Philadelphia → *Fly, Eagles Fly*).
- **Songs that name the city** (Chicago → *My Kind of Town*).

International cities skip US-sports and lean on local scene + club anthems (Madrid → *Hala Madrid*).
Rules: exactly 10 real songs on Spotify, max 2 per artist.

## Add or edit a city

1. Add/edit the 10 rows in `all-cities-spotify-import.csv` (playlist name `{City}: The Game Bureau`).
2. Add a matching entry to `city-playlists.json` (`slug`, `city`, `region`, `playlistName`).
3. Add the same city to `song-playlists.json` with its 10 songs (`spotifyId: null` is fine —
   it'll use search links until you fill IDs).
4. Run `node playlists/build-sound-page.js`. The cards in `index.html` update; the city count too.

## Getting real Spotify track IDs (optional upgrade)

To turn a city's search links into direct track links, get the songs' Spotify IDs and put them
in `song-playlists.json`:

1. Export the playlists from your Spotify with **[exportify.net](https://exportify.net)** (log in,
   Export All). You get one CSV per playlist, each row containing a `Track URI`
   (`spotify:track:<id>`).
2. Drop those CSVs into a `playlists/exportify/` folder (filenames like
   `Seattle_The_Game_Bureau.csv` — Exportify names them from the playlist title automatically).
3. Run `node playlists/build-sound-page.js`. It matches each song by title, fills in the IDs,
   writes them back into `song-playlists.json` (so the export folder is only needed once), and
   rebuilds the page. You can delete `playlists/exportify/` afterward — the IDs persist in the JSON.

Note: Exportify only grabs your first ~50 playlists per pass, which is why the tail cities were
missing last time. Re-export / page through to capture the rest.

## Why not embed the Spotify playlists?

Embedding needs each playlist's ID, which requires the Spotify Web API — and that now requires
the app-owner account to have **Premium**, which this account doesn't. Per-song links via
`open.spotify.com/track/<id>` (and search) need none of that, and 62 lightweight lists load far
faster than 62 full playlist iframes.

## Currently published as Spotify playlists

- Dallas: <https://open.spotify.com/playlist/2sH2k1p1RB9OZAFh9VLtrX>
- New Orleans: <https://open.spotify.com/playlist/1jeexdy2NOKvxdvFFCIRmY>
- Pittsburgh: <https://open.spotify.com/playlist/0ws20uBk7rQQd91HAgc8Xk>
- Sacramento: <https://open.spotify.com/playlist/2Fc0bIRLb8XzBN2gTVTZKM>

(The site links individual tracks, so full playlists aren't required — but these exist if you
want to share a whole playlist. Watch for duplicates from re-importing the CSV over cities that
were already published.)
