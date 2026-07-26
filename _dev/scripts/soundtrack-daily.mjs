// soundtrack-daily.mjs
//
// Daily soundtrack generator for /sound/.
// - Picks one active Supabase city that has no soundtrack yet.
// - Picks one active existing soundtrack with 1-14 songs and tops it up to 15.
// - Asks a model with web search for real Spotify-backed tracks.
// - Updates sound/soundtracks.json, which is the public soundtrack source.

import fs from 'node:fs/promises';

const ROOT_JSON = 'sound/soundtracks.json';
const SB_URL = (process.env.SUPABASE_URL || 'https://qmaafbncpzrdmqapkkgr.supabase.co').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.SOUNDTRACK_MODEL || process.env.BOOK_PULL_MODEL || process.env.OPENAI_MODEL || (ANTHROPIC_KEY ? 'claude-opus-4-8' : 'gpt-5');
const CITY_OVERRIDE = clean(process.env.SOUNDTRACK_CITY_SLUG);
const TOP_UP_OVERRIDE = clean(process.env.SOUNDTRACK_TOP_UP_SLUG);
const DRY_RUN = /^(1|true|yes)$/i.test(String(process.env.SOUNDTRACK_DRY_RUN || ''));

if (!ANTHROPIC_KEY && !OPENAI_KEY) {
  console.error('ANTHROPIC_API_KEY or OPENAI_API_KEY is required.');
  process.exit(1);
}

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  Accept: 'application/json',
};

function clean(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validSongs(soundtrack) {
  return ((soundtrack && Array.isArray(soundtrack.songs)) ? soundtrack.songs : [])
    .filter((song) => song && (song.spotifyId || song.title || song.artist || song.href));
}

function songKey(song) {
  return clean(song && song.title).toLowerCase() + '|' + clean(song && song.artist).toLowerCase();
}

function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

function pickRotating(list, salt = 0) {
  if (!list.length) return null;
  return list[(dayOfYear(new Date()) + salt) % list.length];
}

async function fetchCities() {
  const res = await fetch(`${SB_URL}/rest/v1/cities?select=*&order=city.asc`, {
    headers: sbHeaders,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`cities fetch ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function readSoundtracks() {
  return JSON.parse(await fs.readFile(ROOT_JSON, 'utf8'));
}

function findNewCity(activeCities, soundtracks) {
  const existing = new Set(
    soundtracks
      .filter((tracklist) => validSongs(tracklist).length > 0)
      .map((tracklist) => slugify(tracklist.city_slug))
      .filter(Boolean)
  );
  const missing = activeCities
    .map((row) => ({ row, slug: slugify(row.slug || row.city_name || row.city), city: row.city || row.city_name || row.slug }))
    .filter((entry) => entry.slug && !existing.has(entry.slug))
    .sort((a, b) => String(a.city).localeCompare(String(b.city), undefined, { sensitivity: 'base', numeric: true }));

  if (CITY_OVERRIDE) {
    const picked = missing.find((entry) => entry.slug === CITY_OVERRIDE);
    if (!picked) throw new Error(`SOUNDTRACK_CITY_SLUG=${CITY_OVERRIDE} is not an active missing city.`);
    return { picked, missing };
  }
  const picked = pickRotating(missing);
  if (!picked) throw new Error('No active Supabase city is missing a soundtrack.');
  return { picked, missing };
}

function assertNoHiddenSoundtracks(soundtracks, hiddenCitySlugs) {
  const hiddenSoundtracks = soundtracks
    .map((tracklist) => ({ slug: slugify(tracklist.city_slug), count: validSongs(tracklist).length }))
    .filter((entry) => entry.slug && entry.count > 0 && hiddenCitySlugs.has(entry.slug))
    .map((entry) => entry.slug);

  if (hiddenSoundtracks.length) {
    throw new Error(`Hidden/venue-only cities cannot have soundtracks: ${hiddenSoundtracks.join(', ')}. Merge or remove them first.`);
  }
}

function findTopUp(soundtracks, newCitySlug, activeCitySlugs) {
  const candidates = soundtracks
    .map((tracklist) => ({ tracklist, slug: slugify(tracklist.city_slug), count: validSongs(tracklist).length }))
    .filter((entry) => entry.slug && activeCitySlugs.has(entry.slug) && entry.slug !== newCitySlug && entry.count > 0 && entry.count < 15)
    .sort((a, b) => a.slug.localeCompare(b.slug, undefined, { sensitivity: 'base', numeric: true }));

  if (TOP_UP_OVERRIDE) {
    const picked = candidates.find((entry) => entry.slug === TOP_UP_OVERRIDE);
    if (!picked) throw new Error(`SOUNDTRACK_TOP_UP_SLUG=${TOP_UP_OVERRIDE} is not an active underfilled soundtrack.`);
    return { picked, candidates };
  }
  return { picked: pickRotating(candidates, 17), candidates };
}

async function callAnthropic(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 25 }],
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 12000,
      tools: [{ type: 'web_search_preview' }],
      input: prompt,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

function extractText(content) {
  return (content || [])
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function extractOpenAIText(response) {
  const chunks = [];
  for (const item of response.output || []) {
    for (const block of item.content || []) {
      if (block && (block.type === 'output_text' || block.type === 'text') && block.text) {
        chunks.push(block.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model output:\n' + text.slice(0, 700));
  return JSON.parse(text.slice(start, end + 1));
}

async function askForSoundtracks(newCity, topUp) {
  const topUpSongs = topUp
    ? validSongs(topUp.tracklist).map((song) => ({
        title: song.title,
        artist: song.artist,
        spotifyId: song.spotifyId || '',
        explicit: song.explicit === true,
      }))
    : [];

  const prompt = `Generate soundtrack JSON for The Game Bureau.

New city:
- city: ${newCity.city}
- city_slug: ${newCity.slug}

Top-up target:
${topUp ? `- city_slug: ${topUp.slug}
- current_song_count: ${topUp.count}
- songs_needed: ${15 - topUp.count}
- existing_songs: ${JSON.stringify(topUpSongs)}` : '- none; every existing soundtrack already has 15 songs'}

Rules:
- Use web search to verify real open.spotify.com/track pages for Spotify IDs.
- Do not guess Spotify IDs. If a Spotify ID cannot be confidently verified from an official Spotify track page, omit spotifyId.
- New city soundtrack must contain exactly 15 songs.
- Top-up songs must contain exactly the number needed to make the target reach 15. Preserve existing songs; only return additions.
- Max 2 songs per artist for the new city.
- Do not duplicate existing title/artist pairs for the top-up target.
- Do not add top-up songs that push an artist over 2 total tracks.
- Prefer songs that name the city, hometown artists, local labels or studios, stadium/game-day traditions, neighborhood references, and regional anthems.
- Use real commercially available tracks, not karaoke, tribute, sped-up, slowed, or re-recorded versions.
- Set "explicit": true only if Spotify marks the track explicit. Omit false explicit values.
- Blurbs must be 6 to 10 words and city-specific.
- Pick a concise spine_tag for the new city.

Return ONLY a JSON object with this exact shape:
{
  "newSoundtrack": {
    "city_slug": "${newCity.slug}",
    "spine_tag": "Soundtrack",
    "songs": [
      {
        "title": "Song Title",
        "artist": "Artist Name",
        "spotifyId": "22CharacterSpotifyTrackId",
        "blurb": "Short reason this belongs here"
      }
    ]
  },
  "topUp": ${topUp ? `{
    "city_slug": "${topUp.slug}",
    "songs": []
  }` : 'null'}
}`;

  if (!ANTHROPIC_KEY && OPENAI_KEY) {
    return extractJsonObject(extractOpenAIText(await callOpenAI(prompt)));
  }

  let messages = [{ role: 'user', content: prompt }];
  for (let i = 0; i < 8; i += 1) {
    const res = await callAnthropic(messages);
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    return extractJsonObject(extractText(res.content));
  }
  throw new Error('Claude web search kept pausing without a final answer.');
}

function normalizeSong(song) {
  const out = {
    title: clean(song && song.title),
    artist: clean(song && song.artist),
    blurb: clean(song && song.blurb),
  };
  const spotifyId = clean(song && song.spotifyId);
  if (spotifyId) out.spotifyId = spotifyId;
  if (song && song.explicit === true) out.explicit = true;
  return out;
}

function normalizeTracklist(tracklist) {
  const out = {
    city_slug: slugify(tracklist && tracklist.city_slug),
    spine_tag: clean(tracklist && tracklist.spine_tag) || 'Soundtrack',
    songs: ((tracklist && Array.isArray(tracklist.songs)) ? tracklist.songs : []).map(normalizeSong),
  };
  const position = clean(tracklist && tracklist.spine_tag_position).toLowerCase();
  if (position === 'before') out.spine_tag_position = 'before';
  return out;
}

function assertSpotifyId(song, context) {
  if (!song.spotifyId) return;
  if (!/^[A-Za-z0-9]{22}$/.test(song.spotifyId)) {
    throw new Error(`${context}: invalid spotifyId for ${song.title} - ${song.artist}`);
  }
}

function assertSongs(songs, context) {
  const seen = new Set();
  songs.forEach((song, index) => {
    if (!song.title || !song.artist || !song.blurb) throw new Error(`${context}: song ${index + 1} is missing title, artist, or blurb.`);
    assertSpotifyId(song, context);
    const key = songKey(song);
    if (seen.has(key)) throw new Error(`${context}: duplicate title/artist pair ${key}`);
    seen.add(key);
  });
}

function assertMaxTwoArtists(songs, context) {
  const counts = new Map();
  songs.forEach((song) => {
    const artist = clean(song.artist).toLowerCase();
    counts.set(artist, (counts.get(artist) || 0) + 1);
  });
  for (const [artist, count] of counts) {
    if (count > 2) throw new Error(`${context}: artist exceeds 2 tracks: ${artist}`);
  }
}

function validateModelPayload(payload, newCity, topUp) {
  const newSoundtrack = normalizeTracklist(payload && payload.newSoundtrack);
  if (newSoundtrack.city_slug !== newCity.slug) throw new Error(`newSoundtrack.city_slug must be ${newCity.slug}`);
  if (newSoundtrack.songs.length !== 15) throw new Error(`newSoundtrack must have 15 songs; got ${newSoundtrack.songs.length}`);
  assertSongs(newSoundtrack.songs, `new ${newCity.slug}`);
  assertMaxTwoArtists(newSoundtrack.songs, `new ${newCity.slug}`);

  let additions = [];
  if (topUp) {
    if (!payload || !payload.topUp) throw new Error(`topUp payload is required for ${topUp.slug}`);
    const topUpSlug = slugify(payload.topUp.city_slug);
    if (topUpSlug !== topUp.slug) throw new Error(`topUp.city_slug must be ${topUp.slug}`);
    additions = ((Array.isArray(payload.topUp.songs)) ? payload.topUp.songs : []).map(normalizeSong);
    const needed = 15 - topUp.count;
    if (additions.length !== needed) throw new Error(`topUp needs ${needed} songs; got ${additions.length}`);
    assertSongs(additions, `top-up ${topUp.slug}`);

    const existingKeys = new Set(validSongs(topUp.tracklist).map(songKey));
    additions.forEach((song) => {
      const key = songKey(song);
      if (existingKeys.has(key)) throw new Error(`top-up ${topUp.slug}: duplicate existing title/artist pair ${key}`);
    });
    assertMaxTwoArtists([...validSongs(topUp.tracklist), ...additions], `top-up ${topUp.slug}`);
  }

  return { newSoundtrack, additions };
}

function insertAlphabetically(soundtracks, entry) {
  const slug = slugify(entry.city_slug);
  if (soundtracks.some((tracklist) => slugify(tracklist.city_slug) === slug)) {
    throw new Error(`Refusing to insert duplicate soundtrack slug ${slug}`);
  }
  const index = soundtracks.findIndex((tracklist) => slugify(tracklist.city_slug).localeCompare(slug) > 0);
  if (index === -1) soundtracks.push(entry);
  else soundtracks.splice(index, 0, entry);
}

async function assertNoSoundtrackTable() {
  for (const table of ['soundtracks', 'city_soundtracks', 'soundtrack_songs']) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*&limit=1`, { headers: sbHeaders, cache: 'no-store' });
    if (res.status !== 404) {
      throw new Error(`A possible Supabase soundtrack table exists (${table}, status ${res.status}). Verify schema before using this script.`);
    }
  }
}

(async () => {
  await assertNoSoundtrackTable();

  const data = await readSoundtracks();
  const soundtracks = Array.isArray(data.soundtracks) ? data.soundtracks : [];
  const beforeCount = soundtracks.length;

  const cityRows = await fetchCities();
  const cities = Array.isArray(cityRows) ? cityRows : [];
  const activeCities = cities.filter((row) => row && row.ignored !== true);
  const activeCitySlugs = new Set(activeCities.map((row) => slugify(row.slug || row.city_name || row.city)).filter(Boolean));
  const hiddenCitySlugs = new Set(cities.filter((row) => row && row.ignored === true).map((row) => slugify(row.slug || row.city_name || row.city)).filter(Boolean));
  assertNoHiddenSoundtracks(soundtracks, hiddenCitySlugs);
  const { picked: newCity, missing } = findNewCity(activeCities, soundtracks);
  const { picked: topUp, candidates } = findTopUp(soundtracks, newCity.slug, activeCitySlugs);

  console.log(`Active cities: ${activeCities.length}`);
  console.log(`Missing soundtrack cities: ${missing.length}`);
  console.log(`Selected new city: ${newCity.city} (${newCity.slug})`);
  if (topUp) console.log(`Selected top-up: ${topUp.slug} (${topUp.count} -> 15)`);
  else console.log(`No underfilled soundtrack found among ${candidates.length} candidate(s).`);

  const payload = await askForSoundtracks(newCity, topUp);
  const { newSoundtrack, additions } = validateModelPayload(payload, newCity, topUp);

  insertAlphabetically(soundtracks, newSoundtrack);
  if (topUp && additions.length) topUp.tracklist.songs.push(...additions);

  if (soundtracks.length !== beforeCount + 1) throw new Error('Soundtrack count did not increase by 1.');
  if (validSongs(newSoundtrack).length !== 15) throw new Error('New soundtrack did not end at 15 songs.');
  if (topUp && validSongs(topUp.tracklist).length !== 15) throw new Error('Top-up soundtrack did not end at 15 songs.');

  const output = JSON.stringify(data, null, 2) + '\n';
  JSON.parse(output);
  if (DRY_RUN) {
    console.log('Dry run: not writing sound/soundtracks.json.');
  } else {
    await fs.writeFile(ROOT_JSON, output, 'utf8');
  }

  console.log(`Added ${newSoundtrack.city_slug}: ${newSoundtrack.songs.map((song) => song.title).join(' | ')}`);
  if (topUp) console.log(`Topped up ${topUp.slug}: ${additions.map((song) => song.title).join(' | ')}`);
  console.log(`Done. Soundtrack count: ${beforeCount} -> ${soundtracks.length}`);
})().catch((err) => {
  console.error('soundtrack-daily failed:', err.message);
  process.exit(1);
});
