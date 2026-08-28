// spotify-lookup — POST { title, artist? } -> { matches: [...] } | { matches: [] , reason }
//
// Finds the Spotify track id for a title and artist, so a human filling the gap
// on a track row does not have to leave the Tape Room, search by hand, press
// Share and paste a link back.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// 198 of the catalogue's tracks carry no id. Each one is now a finding, and the
// work of clearing one is entirely mechanical: read the title and artist, find
// the track, copy 22 characters. That is the shape of thing a server should do.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
//
// **IT DOES NOT SAVE, AND IT DOES NOT PICK.** It returns candidates with the
// title, artist, album and year AS SPOTIFY HAS THEM, and a human decides. That
// is not caution for its own sake: this project's oldest rule about this field
// is verify-or-omit, because **a wrong 22-character id passes every check we
// have and then silently plays the wrong thing**. A lookup that filled the box
// and saved would be a machine guessing, at scale, into the one field nobody
// can proofread by reading it.
//
// So the button fills the box and shows what it matched. The save is a separate
// press, by a person who has looked.
//
// ── IT NEEDS A SPOTIFY APP, WHICH THIS PROJECT DID NOT HAVE ─────────────────
//
// Spotify's search endpoint needs a token, and a token needs a client id and
// secret from a free Spotify developer app. Two secrets, then a deploy:
//
//   supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
//   cd mc && supabase functions deploy spotify-lookup
//
// UNTIL BOTH ARE SET the function answers with a sentence naming what is
// missing rather than a stack trace, and the button says so. Nothing else
// breaks: the box is still typeable and a pasted share link still works.
//
// **CLIENT CREDENTIALS, NOT A USER TOKEN.** This reads the public catalogue and
// never touches an account, so there is no consent flow, nothing to expire that
// a human must renew, and no second expiring credential of the kind this
// project already carries one of in Threads.
//
// AUTH is the gate socials-post and scrape-og-image use: the caller's own JWT
// against is_photo_admin(). Not because a public catalogue search is secret,
// but because an open search proxy on our project is a thing other people find.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const CLIENT_ID     = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// THE TOKEN IS CACHED FOR THE LIFE OF THE WORKER. It lasts an hour and a
// clearing session is a run of lookups, so fetching one per press would be a
// round trip nobody needs. It is not persisted: a worker that goes away takes
// it with it, which is correct -- there is nothing here worth storing.
let cachedToken = '';
let cachedUntil = 0;

async function spotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Spotify refused the credentials (' + res.status + ')'
      + (detail ? ': ' + detail.slice(0, 160) : ''));
  }
  const data = await res.json();
  cachedToken = String(data.access_token ?? '');
  // A minute short of the stated expiry, so a token cannot go stale mid-request.
  cachedUntil = Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000;
  if (!cachedToken) throw new Error('Spotify returned no access token');
  return cachedToken;
}

// A FIELDED QUERY, NOT A BAG OF WORDS. `track:` and `artist:` make Spotify
// match the two separately, which is what stops "Glory" by one band returning
// forty covers by everybody else. Quotes around each keep a multi-word title
// from being split across the fields.
function queryFor(title: string, artist: string): string {
  const q = ['track:"' + title.replace(/"/g, '') + '"'];
  if (artist) q.push('artist:"' + artist.replace(/"/g, '') + '"');
  return q.join(' ');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'missing Authorization' });

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_photo_admin');
  if (adminErr) return json(500, { error: 'admin check failed: ' + adminErr.message });
  if (!isAdmin)  return json(403, { error: 'not authorized' });

  // THE MISSING SECRET IS NAMED, not reported as a failure to search. A
  // credential nobody has set is a thing somebody can act on; "search failed"
  // is not.
  const missing = [
    CLIENT_ID     ? '' : 'SPOTIFY_CLIENT_ID',
    CLIENT_SECRET ? '' : 'SPOTIFY_CLIENT_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    return json(200, {
      matches: [],
      reason: 'Spotify lookup is not configured yet: ' + missing.join(' and ')
        + (missing.length > 1 ? ' are not set.' : ' is not set.')
        + ' Make a free app at developer.spotify.com, then'
        + ' `supabase secrets set` both and redeploy spotify-lookup.',
    });
  }

  let body: { title?: string; artist?: string; limit?: number } = {};
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }

  const title  = String(body.title  ?? '').trim().slice(0, 200);
  const artist = String(body.artist ?? '').trim().slice(0, 200);
  if (!title) return json(400, { error: 'title is required' });

  // FIVE AT MOST. This is a shortlist a person reads, not a search results
  // page; past a handful nobody looks and the wrong one gets picked.
  const limit = Math.max(1, Math.min(Number(body.limit) || 5, 10));

  let token: string;
  try {
    token = await spotifyToken();
  } catch (err) {
    return json(200, { matches: [], reason: (err as Error).message });
  }

  const url = 'https://api.spotify.com/v1/search?type=track&limit=' + limit
    + '&q=' + encodeURIComponent(queryFor(title, artist));

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  } catch (err) {
    return json(200, { matches: [], reason: 'Could not reach Spotify: ' + (err as Error).message });
  }
  if (res.status === 429) {
    return json(200, { matches: [], reason: 'Spotify is rate-limiting us. Wait a moment and try again.' });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json(200, { matches: [], reason: 'Spotify answered ' + res.status
      + (detail ? ': ' + detail.slice(0, 160) : '') });
  }

  const data  = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.tracks?.items) ? data.tracks.items : [];

  // WHAT COMES BACK IS WHAT SPOTIFY SAYS, not what we asked for. The album and
  // the year are the two things that tell a live cut, a re-recording or a cover
  // from the record somebody meant, and they are the whole reason a human is
  // still in this loop.
  const matches = items.map((t: Record<string, unknown>) => ({
    id:       String(t.id ?? ''),
    title:    String(t.name ?? ''),
    artist:   (Array.isArray(t.artists) ? t.artists : [])
                .map((a: Record<string, unknown>) => String(a.name ?? '')).filter(Boolean).join(', '),
    album:    String((t.album as Record<string, unknown> | undefined)?.name ?? ''),
    year:     String((t.album as Record<string, unknown> | undefined)?.release_date ?? '').slice(0, 4),
    explicit: Boolean(t.explicit),
    url:      String((t.external_urls as Record<string, unknown> | undefined)?.spotify ?? ''),
  })).filter((m: { id: string }) => m.id);

  if (!matches.length) {
    // A SEARCH THAT FOUND NOTHING IS AN ANSWER, not an error. The likeliest
    // reason by far is that the title or artist on the row is wrong, which is
    // itself worth knowing.
    return json(200, {
      matches: [],
      reason: 'Spotify has nothing matching that title and artist. Check the '
        + 'spelling on the row, or the track may genuinely not be there.',
    });
  }

  return json(200, { matches });
});
