/* games-prefetch.js — kicks off Supabase fetches during <head> parse so
   the scrolling directory has data in flight long before the giant
   IIFE at the bottom of /games/ finishes parsing. The page-script's
   fetchGames / fetchTeamColorsFromSupabase reuse these in-flight
   responses (via window.__tgbPrefetch) instead of issuing fresh
   requests. Net effect on first load: roughly the time it takes to
   parse and execute /games/'s body script ahead of network.

   Cheap-and-safe: if anything throws here the IIFE simply falls back
   to its own fetch path. The promises resolve to a Response object
   (the raw fetch result); the consumer is expected to call .json()
   itself, matching the existing flow. */
(function () {
  if (window.__tgbPrefetch) return;
  var SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var SB_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
  var headers = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json'
  };
  var gamesUrl = SB_URL + '/rest/v1/games_with_teams'
    + '?apikey=' + SB_KEY
    + '&select=*'
    + '&order=name.asc';
  var teamsUrl = SB_URL + '/rest/v1/teams'
    + '?select=tgbid,team_key,league,conference,division,code,full_name,first_name,fanbase,mascot,sport,shell,stripe,mask,text_color,game_city,venue_city,timezone'
    + '&order=league_sort.asc&order=team_sort.asc';
  window.__tgbPrefetch = {
    games: fetch(gamesUrl, { headers: headers, cache: 'no-store' })
      .catch(function () { return null; }),
    teams: fetch(teamsUrl, { headers: headers, cache: 'no-store' })
      .catch(function () { return null; })
  };
}());
