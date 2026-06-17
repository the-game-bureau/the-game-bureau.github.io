(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TgbTeamPalette = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEAM_SELECT = [
    'team_key',
    'tgbid',
    'espn_id',
    'league',
    'conference',
    'division',
    'code',
    'full_name',
    'first_name',
    'fanbase',
    'mascot',
    'sport',
    'shell',
    'stripe',
    'mask',
    'text_color',
    'game_city',
    'venue_city',
    'timezone'
  ].join(',');
  const LEGACY_TEAM_SELECT = TEAM_SELECT
    .split(',')
    .filter((column) => !['team_key', 'tgbid', 'espn_id', 'division', 'text_color'].includes(column))
    .join(',');
  const loadCache = new Map();

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeIdentity(value) {
    return clean(value)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeTeamKey(value) {
    const match = clean(value).toUpperCase().match(/^([^:]+):([^:]+)$/);
    return match ? `${match[1].trim()}:${match[2].trim()}` : '';
  }

  function normalizeTgbid(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function teamTgbid(team) {
    return normalizeTgbid(team && (team.tgbid || team.team_tgbid || team.teamTgbid));
  }

  function teamKey(team) {
    return normalizeTeamKey(team && (team.team_key || team.teamKey))
      || normalizeTeamKey(`${clean(team && team.league)}:${clean(team && team.code)}`);
  }

  function normalizeHex(value, fallback = '') {
    const match = clean(value).match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : fallback;
  }

  // Pick black or white for maximum readability against a background color.
  // Used for the font (quaternary) color so text never vanishes on a team's
  // helmet color, regardless of what the team's own text_color happens to be.
  function readableTextColor(value, fallback = '#FFFFFF') {
    const match = clean(value).match(/^#?([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const hex = match[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // Perceived luminance (ITU-R BT.601). Light backgrounds get black text.
    const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
    return luminance > 140 ? '#000000' : '#FFFFFF';
  }

  function isTrueish(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = clean(value).toLowerCase();
    return !!normalized && !['false', '0', 'no', 'off', 'null'].includes(normalized);
  }

  function isFandomGame(game) {
    if (!game || typeof game !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(game, 'fandom_game')) return isTrueish(game.fandom_game);
    return !!(clean(game.away_team_city || game.awayTeamCity) && clean(game.away_team_mascot || game.awayTeamMascot));
  }

  function inferLeague(game) {
    const tags = Array.isArray(game && game.tags) ? game.tags.map((tag) => clean(tag).toUpperCase()) : [];
    const known = ['NFL', 'NCAAF', 'CFB', 'MLB', 'NBA', 'WNBA', 'NHL', 'MLS'];
    const tagged = known.find((league) => tags.includes(league));
    if (tagged) return tagged === 'CFB' ? 'NCAAF' : tagged;

    const id = clean(game && game.id).toUpperCase();
    const prefixed = known.find((league) => id.startsWith(league));
    if (prefixed) return prefixed === 'CFB' ? 'NCAAF' : prefixed;

    const icon = clean(game && (game.category_icon || game.categoryIcon)).toLowerCase();
    return { baseball: 'MLB', basketball: 'NBA', hockey: 'NHL' }[icon] || '';
  }

  function inferMatchupCodes(game) {
    const match = clean(game && game.id).toLowerCase().match(
      /^(?:nfl|mlb|nba|nhl)[0-9]*-[0-9]{8}-([a-z0-9&]+)-([a-z0-9&]+)-/
    );
    return match ? { away: match[1].toUpperCase(), home: match[2].toUpperCase() } : {};
  }

  function sideReference(game, side) {
    const prefix = side === 'home' ? 'home' : 'away';
    const matchupCodes = inferMatchupCodes(game);
    return {
      tgbid: game && (game[`${prefix}_team_tgbid`] || game[`${prefix}TeamTgbid`]),
      key: game && (game[`${prefix}_team_key`] || game[`${prefix}TeamKey`]),
      league: inferLeague(game),
      code: matchupCodes[prefix],
      city: game && (game[`${prefix}_team_city`] || game[`${prefix}TeamCity`]),
      mascot: game && (game[`${prefix}_team_mascot`] || game[`${prefix}TeamMascot`])
    };
  }

  function scoreTeam(team, reference) {
    const requestedTgbid = normalizeTgbid(reference && reference.tgbid);
    const candidateTgbid = teamTgbid(team);
    if (requestedTgbid && candidateTgbid === requestedTgbid) return 20000;

    const requestedKey = normalizeTeamKey(reference && reference.key);
    const candidateKey = teamKey(team);
    if (requestedKey && candidateKey === requestedKey) return 10000;

    const league = clean(reference && reference.league).toUpperCase();
    const code = clean(reference && reference.code).toUpperCase();
    const mascot = normalizeIdentity(reference && reference.mascot);
    const city = normalizeIdentity(reference && reference.city);
    let score = 0;

    if (league) score += clean(team && team.league).toUpperCase() === league ? 100 : -30;
    if (code && clean(team && team.code).toUpperCase() === code) score += 300;
    if (mascot) {
      const mascotFields = [team && team.mascot, team && team.full_name].map(normalizeIdentity);
      if (mascotFields.includes(mascot)) score += 160;
    }
    if (city) {
      const cityFields = [
        team && team.fanbase,
        team && team.first_name,
        team && team.game_city,
        team && team.venue_city,
        team && team.full_name
      ].map(normalizeIdentity).filter(Boolean);
      if (cityFields.includes(city)) score += 120;
      else if (cityFields.some((value) => value.includes(city) || city.includes(value))) score += 50;
    }
    return score;
  }

  function inferTeam(teams, reference) {
    const rows = Array.isArray(teams) ? teams : [];
    const requestedTgbid = normalizeTgbid(reference && reference.tgbid);
    if (requestedTgbid) {
      const keyedByTgbid = rows.find((team) => teamTgbid(team) === requestedTgbid);
      if (keyedByTgbid) return keyedByTgbid;
    }

    const requestedKey = normalizeTeamKey(reference && reference.key);
    if (requestedKey) {
      const keyed = rows.find((team) => teamKey(team) === requestedKey);
      if (keyed) return keyed;
    }

    const ranked = rows
      .map((team) => ({ team, score: scoreTeam(team, reference || {}) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length || ranked[0].score < 100) return null;
    if (ranked[1] && ranked[1].score === ranked[0].score && teamKey(ranked[1].team) !== teamKey(ranked[0].team)) {
      return null;
    }
    return ranked[0].team;
  }

  function joinedGameTeam(game, side) {
    if (!game || typeof game !== 'object') return null;
    const prefix = side === 'home' ? 'home' : 'away';
    const joined = game[`${prefix}_team`] || game[`${prefix}Team`];
    return joined && typeof joined === 'object' && (teamTgbid(joined) || teamKey(joined)) ? joined : null;
  }

  function inferGameTeam(teams, game, side = 'away') {
    const joined = joinedGameTeam(game, side);
    if (joined) return joined;
    return inferTeam(teams, sideReference(game, side));
  }

  function teamPalette(team, fallback = {}) {
    const primary = normalizeHex(team && (team.shell || team.primary || team.primary_color), normalizeHex(fallback.primary, '#33E6E6'));
    const secondary = normalizeHex(team && (team.stripe || team.secondary || team.secondary_color), normalizeHex(fallback.secondary, '#243256'));
    const tertiary = normalizeHex(team && (team.mask || team.tertiary || team.tertiary_color), normalizeHex(fallback.tertiary, '#FFFFFF'));
    // Font color: when derived from a TEAM (helmet=primary, stripe=secondary,
    // mask=tertiary), the team's own text_color is a brand color that can be
    // unreadable against the helmet — so auto-pick black/white for contrast.
    // When acting as the generic game-color resolver (team == null), preserve
    // the game's authored quaternary instead.
    const quaternary = team
      ? readableTextColor(primary, normalizeHex(fallback.quaternary, '#FFFFFF'))
      : normalizeHex(fallback.quaternary, '#FFFFFF');
    return { primary, secondary, tertiary, quaternary };
  }

  function gamePalette(game) {
    return teamPalette(null, {
      primary: game && (game.primary_color || game.primaryColor),
      secondary: game && (game.secondary_color || game.secondaryColor),
      tertiary: game && (game.tertiary_color || game.tertiaryColor),
      quaternary: game && (game.quaternary_color || game.quaternaryColor)
    });
  }

  function resolveGamePalette(teams, game, side = 'away') {
    const fallback = gamePalette(game);
    if (!isFandomGame(game)) return { team: null, key: '', palette: fallback };
    const team = inferGameTeam(teams, game, side);
    return {
      team,
      key: teamKey(team),
      palette: team ? teamPalette(team, fallback) : fallback
    };
  }

  function dedupeTeams(rows) {
    const byKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = teamKey(row);
      if (!key) return;
      const normalized = { ...row, team_key: key };
      const current = byKey.get(key);
      if (!current || (!clean(current.conference) && clean(normalized.conference))) byKey.set(key, normalized);
    });
    return Array.from(byKey.values());
  }

  async function fetchTeamRows(config, select) {
    const base = clean(config && config.url).replace(/\/+$/, '');
    const key = clean(config && config.key);
    if (!base || !key) return [];
    const url = new URL(`${base}/rest/v1/teams`);
    url.searchParams.set('select', select);
    url.searchParams.set('order', 'league_sort.asc,team_sort.asc');
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`teams ${response.status}`);
    return response.json();
  }

  async function loadTeams(config = {}) {
    const cacheKey = `${clean(config.url)}|${clean(config.key)}`;
    if (loadCache.has(cacheKey)) return loadCache.get(cacheKey);
    const promise = (async () => {
      try {
        return dedupeTeams(await fetchTeamRows(config, TEAM_SELECT));
      } catch (error) {
        return dedupeTeams(await fetchTeamRows(config, LEGACY_TEAM_SELECT));
      }
    })();
    loadCache.set(cacheKey, promise);
    try {
      return await promise;
    } catch (error) {
      loadCache.delete(cacheKey);
      throw error;
    }
  }

  return {
    TEAM_SELECT,
    LEGACY_TEAM_SELECT,
    normalizeIdentity,
    normalizeTeamKey,
    normalizeTgbid,
    teamTgbid,
    teamKey,
    isFandomGame,
    inferLeague,
    inferMatchupCodes,
    sideReference,
    joinedGameTeam,
    inferTeam,
    inferGameTeam,
    teamPalette,
    gamePalette,
    resolveGamePalette,
    loadTeams
  };
}));
