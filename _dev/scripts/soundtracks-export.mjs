#!/usr/bin/env node
// Regenerate sound/soundtracks.json from Supabase.
//
// The tapes live in public.soundtracks + public.soundtrack_songs. That file is
// the offline fallback /sound/ reads when the Supabase fetch fails, so it has to
// be refreshed after anything is written to the tables or it quietly serves a
// stale catalog on the one day it is needed.
//
// This exists as a committed script rather than instructions in the daily
// routine's prompt because the output has to be byte-stable: key order, which
// optional fields are omitted, 2-space indent, one trailing newline. Prose
// re-derived every morning would drift, and every drift is a whole-file diff.
//
// Run it, then commit if anything changed:
//
//   node _dev/scripts/soundtracks-export.mjs
//   git diff --quiet sound/soundtracks.json || git commit -m "..." sound/soundtracks.json
//
// Reads only, with the publishable key the public page already ships — no secret
// and no write path. Safe to run any time, by anyone.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'sound', 'soundtracks.json'
);

const COMMENT =
  'Offline fallback for /sound/. Source of truth is public.soundtracks + ' +
  'public.soundtrack_songs; regenerate this file from the Tape Room. City identity, ' +
  'labels, ordering, and badges still come from public.cities via city_slug.';

// PostgREST returns at most 1000 rows and truncates silently, so every read that
// expects a whole table pages with Range. soundtrack_songs passed 900 in July
// 2026 -- assuming one response is a bug that hides its own tail.
async function fetchAll(pathAndQuery) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
        Range: `${from}-${from + PAGE - 1}`
      }
    });
    if (!res.ok) {
      throw new Error(`Supabase ${res.status} for ${pathAndQuery}: ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`Unexpected response for ${pathAndQuery}`);
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const [tapes, songs] = await Promise.all([
  fetchAll('soundtracks?select=*&order=city_slug.asc'),
  fetchAll('soundtrack_songs?select=*&order=city_slug.asc,position.asc,id.asc')
]);

if (!tapes.length) throw new Error('No tapes came back -- refusing to write an empty file.');

// Key order below is the file's historical shape and is load-bearing for the
// diff staying small: title, artist, spotifyId, blurb, then the two flags. False
// flags are omitted rather than written, same as when a human maintained it.
const byTape = new Map();
const out = tapes.map((tape) => {
  const entry = { city_slug: tape.city_slug, spine_tag: tape.spine_tag || '' };
  if (tape.spine_tag_position) entry.spine_tag_position = tape.spine_tag_position;
  if (tape.archived) entry.archived = true;
  entry.songs = [];
  byTape.set(tape.city_slug, entry);
  return entry;
});

let orphans = 0;
for (const row of songs) {
  const entry = byTape.get(row.city_slug);
  if (!entry) { orphans += 1; continue; }
  const song = { title: row.title, artist: row.artist };
  if (row.spotify_id) song.spotifyId = row.spotify_id;
  song.blurb = row.blurb || '';
  if (row.explicit) song.explicit = true;
  if (row.archived) song.archived = true;
  entry.songs.push(song);
}
// A song whose city_slug has no tape row cannot happen -- there is a foreign key
// -- so if it ever does, say so rather than dropping it silently.
if (orphans) console.warn(`WARNING: ${orphans} song row(s) had no matching tape and were skipped.`);

await writeFile(
  OUT,
  JSON.stringify({ _comment: COMMENT, soundtracks: out }, null, 2) + '\n',
  'utf8'
);

const active = songs.filter((row) => !row.archived).length;
console.log(
  `Wrote sound/soundtracks.json -- ${out.length} tapes, ${songs.length} songs ` +
  `(${active} active, ${songs.length - active} archived).`
);
