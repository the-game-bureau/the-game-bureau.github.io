Spotify playlist import export

Source: sound\soundtracks.json
Playlists: 61
Tracks: 624
Tracks missing Spotify IDs: 0

Files:
- playlist-index.csv: overview of every generated playlist file.
- all-playlists.csv: all tracks in one spreadsheet-style file, with a Playlist column.
- csv/: one CSV per playlist, with title, artist, Spotify URI, and Spotify URL.
- spotify-uri-lists/: one plain-text Spotify URI list per playlist.
- m3u8/: one M3U8 playlist file per city using Spotify track URLs.
- spotify-api-playlists.json: playlist names and ordered Spotify URI arrays for scripts using the Spotify API.

Spotify import note:
The regular Spotify app usually does not provide a direct CSV upload flow. These files are designed for playlist import tools, spreadsheet-based importers, or a Spotify API script. For best matching, prefer the Spotify URI list or the CSV Spotify URI column because every source track already has a Spotify track ID.
