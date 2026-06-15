#!/usr/bin/env node
/**
 * mlb_matchup_maker.js — build MLB "Fans Takeover" games from the live ESPN MLB
 * schedule and write them to mc/data/mlb.jsonl (one JSON game payload per line).
 *
 * It does NOT touch Supabase. It only writes the .jsonl file for you to review
 * and import later. Each line is a complete `games` row payload (fandom_game,
 * nodes graph, colors, away/home team fields, etc.).
 *
 * SCOPE IS REQUIRED via switches (a full MLB season is ~2,430 games):
 *   --team CODE            only games involving this team (e.g. NYM, BOS, LAD)
 *   --start YYYY-MM-DD     start date (inclusive)
 *   --end   YYYY-MM-DD     end date (inclusive)
 *   (give at least one of --team or a --start/--end range)
 *
 * OTHER SWITCHES:
 *   --season YYYY          season year (default: current year)
 *   --fan-side away|home|both   whose fanbase's takeover to build (default: away)
 *   --weekends             only Fri/Sat/Sun games
 *   --limit N              cap the number of games written
 *   --out PATH             output file (default: mc/data/mlb.jsonl)
 *   --append               append instead of overwriting the file
 *   --archived true|false  archived value on each row (default: true — review first)
 *   --dry-run              print a summary, write nothing
 *   --help                 show this help
 *
 * EXAMPLES:
 *   node mlb_matchup_maker.js --team NYM
 *   node mlb_matchup_maker.js --start 2026-07-01 --end 2026-07-07
 *   node mlb_matchup_maker.js --team BOS --weekends --fan-side both
 *
 * CAVEAT: shared-city teams (Yankees/Mets, Cubs/White Sox, Dodgers/Angels) all
 * resolve to the same "<City> Fans Takeover …" name — the rows differ by id and
 * mascot. Disambiguate later (e.g. a color/qualifier) the same way the NFL set
 * handles Giants/Jets.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const USER_AGENT = 'TGB MLB Matchup Maker/1.0';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
// All game start_times are normalized to Central time. The landing page reads
// start_time as Central and converts it to each player's device clock.
const START_TIME_TZ = 'America/Chicago';

// ── Teams ────────────────────────────────────────────────────────────────────
const TEAM_METADATA = {
  ARI: { code:'ARI', espnAbbr:'ari', slug:'arizona-diamondbacks', fullName:'Arizona Diamondbacks', shortLabel:'Phoenix', mascot:'Diamondbacks', primary:'#A71930', secondary:'#E3D4AD', homeVenue:'Chase Field', cityState:'Phoenix, Arizona' },
  ATL: { code:'ATL', espnAbbr:'atl', slug:'atlanta-braves', fullName:'Atlanta Braves', shortLabel:'Atlanta', mascot:'Braves', primary:'#CE1141', secondary:'#13274F', homeVenue:'Truist Park', cityState:'Atlanta, Georgia' },
  BAL: { code:'BAL', espnAbbr:'bal', slug:'baltimore-orioles', fullName:'Baltimore Orioles', shortLabel:'Baltimore', mascot:'Orioles', primary:'#DF4601', secondary:'#000000', homeVenue:'Oriole Park at Camden Yards', cityState:'Baltimore, Maryland' },
  BOS: { code:'BOS', espnAbbr:'bos', slug:'boston-red-sox', fullName:'Boston Red Sox', shortLabel:'Boston', mascot:'Red Sox', primary:'#BD3039', secondary:'#0C2340', homeVenue:'Fenway Park', cityState:'Boston, Massachusetts' },
  CHC: { code:'CHC', espnAbbr:'chc', slug:'chicago-cubs', fullName:'Chicago Cubs', shortLabel:'Chicago', mascot:'Cubs', primary:'#0E3386', secondary:'#CC3433', homeVenue:'Wrigley Field', cityState:'Chicago, Illinois' },
  CWS: { code:'CWS', espnAbbr:'chw', slug:'chicago-white-sox', fullName:'Chicago White Sox', shortLabel:'Chicago', mascot:'White Sox', primary:'#27251F', secondary:'#C4CED4', homeVenue:'Rate Field', cityState:'Chicago, Illinois' },
  CIN: { code:'CIN', espnAbbr:'cin', slug:'cincinnati-reds', fullName:'Cincinnati Reds', shortLabel:'Cincinnati', mascot:'Reds', primary:'#C6011F', secondary:'#000000', homeVenue:'Great American Ball Park', cityState:'Cincinnati, Ohio' },
  CLE: { code:'CLE', espnAbbr:'cle', slug:'cleveland-guardians', fullName:'Cleveland Guardians', shortLabel:'Cleveland', mascot:'Guardians', primary:'#00385D', secondary:'#E50022', homeVenue:'Progressive Field', cityState:'Cleveland, Ohio' },
  COL: { code:'COL', espnAbbr:'col', slug:'colorado-rockies', fullName:'Colorado Rockies', shortLabel:'Denver', mascot:'Rockies', primary:'#33006F', secondary:'#C4CED4', homeVenue:'Coors Field', cityState:'Denver, Colorado' },
  DET: { code:'DET', espnAbbr:'det', slug:'detroit-tigers', fullName:'Detroit Tigers', shortLabel:'Detroit', mascot:'Tigers', primary:'#0C2340', secondary:'#FA4616', homeVenue:'Comerica Park', cityState:'Detroit, Michigan' },
  HOU: { code:'HOU', espnAbbr:'hou', slug:'houston-astros', fullName:'Houston Astros', shortLabel:'Houston', mascot:'Astros', primary:'#002D62', secondary:'#EB6E1F', homeVenue:'Daikin Park', cityState:'Houston, Texas' },
  KC:  { code:'KC',  espnAbbr:'kc',  slug:'kansas-city-royals', fullName:'Kansas City Royals', shortLabel:'Kansas City', mascot:'Royals', primary:'#004687', secondary:'#BD9B60', homeVenue:'Kauffman Stadium', cityState:'Kansas City, Missouri' },
  LAA: { code:'LAA', espnAbbr:'laa', slug:'los-angeles-angels', fullName:'Los Angeles Angels', shortLabel:'Los Angeles', mascot:'Angels', primary:'#003263', secondary:'#BA0021', homeVenue:'Angel Stadium', cityState:'Los Angeles, California' },
  LAD: { code:'LAD', espnAbbr:'lad', slug:'los-angeles-dodgers', fullName:'Los Angeles Dodgers', shortLabel:'Los Angeles', mascot:'Dodgers', primary:'#005A9C', secondary:'#EF3E42', homeVenue:'Dodger Stadium', cityState:'Los Angeles, California' },
  MIA: { code:'MIA', espnAbbr:'mia', slug:'miami-marlins', fullName:'Miami Marlins', shortLabel:'Miami', mascot:'Marlins', primary:'#00A3E0', secondary:'#000000', homeVenue:'loanDepot park', cityState:'Miami, Florida' },
  MIL: { code:'MIL', espnAbbr:'mil', slug:'milwaukee-brewers', fullName:'Milwaukee Brewers', shortLabel:'Milwaukee', mascot:'Brewers', primary:'#12284B', secondary:'#FFC52F', homeVenue:'American Family Field', cityState:'Milwaukee, Wisconsin' },
  MIN: { code:'MIN', espnAbbr:'min', slug:'minnesota-twins', fullName:'Minnesota Twins', shortLabel:'Minneapolis', mascot:'Twins', primary:'#002B5C', secondary:'#D31145', homeVenue:'Target Field', cityState:'Minneapolis, Minnesota' },
  NYM: { code:'NYM', espnAbbr:'nym', slug:'new-york-mets', fullName:'New York Mets', shortLabel:'New York', mascot:'Mets', primary:'#002D72', secondary:'#FF5910', homeVenue:'Citi Field', cityState:'New York, New York' },
  NYY: { code:'NYY', espnAbbr:'nyy', slug:'new-york-yankees', fullName:'New York Yankees', shortLabel:'New York', mascot:'Yankees', primary:'#0C2340', secondary:'#C4CED4', homeVenue:'Yankee Stadium', cityState:'New York, New York' },
  ATH: { code:'ATH', espnAbbr:'ath', slug:'athletics', fullName:'Athletics', shortLabel:'Sacramento', mascot:'Athletics', primary:'#003831', secondary:'#EFB21E', homeVenue:'Sutter Health Park', cityState:'Sacramento, California' },
  PHI: { code:'PHI', espnAbbr:'phi', slug:'philadelphia-phillies', fullName:'Philadelphia Phillies', shortLabel:'Philadelphia', mascot:'Phillies', primary:'#E81828', secondary:'#002D72', homeVenue:'Citizens Bank Park', cityState:'Philadelphia, Pennsylvania' },
  PIT: { code:'PIT', espnAbbr:'pit', slug:'pittsburgh-pirates', fullName:'Pittsburgh Pirates', shortLabel:'Pittsburgh', mascot:'Pirates', primary:'#27251F', secondary:'#FDB827', homeVenue:'PNC Park', cityState:'Pittsburgh, Pennsylvania' },
  SD:  { code:'SD',  espnAbbr:'sd',  slug:'san-diego-padres', fullName:'San Diego Padres', shortLabel:'San Diego', mascot:'Padres', primary:'#2F241D', secondary:'#FFC425', homeVenue:'Petco Park', cityState:'San Diego, California' },
  SEA: { code:'SEA', espnAbbr:'sea', slug:'seattle-mariners', fullName:'Seattle Mariners', shortLabel:'Seattle', mascot:'Mariners', primary:'#0C2C56', secondary:'#005C5C', homeVenue:'T-Mobile Park', cityState:'Seattle, Washington' },
  SF:  { code:'SF',  espnAbbr:'sf',  slug:'san-francisco-giants', fullName:'San Francisco Giants', shortLabel:'San Francisco', mascot:'Giants', primary:'#FD5A1E', secondary:'#27251F', homeVenue:'Oracle Park', cityState:'San Francisco, California' },
  STL: { code:'STL', espnAbbr:'stl', slug:'st-louis-cardinals', fullName:'St. Louis Cardinals', shortLabel:'St. Louis', mascot:'Cardinals', primary:'#C41E3A', secondary:'#0C2340', homeVenue:'Busch Stadium', cityState:'St. Louis, Missouri' },
  TB:  { code:'TB',  espnAbbr:'tb',  slug:'tampa-bay-rays', fullName:'Tampa Bay Rays', shortLabel:'Tampa Bay', mascot:'Rays', primary:'#092C5C', secondary:'#8FBCE6', homeVenue:'Tropicana Field', cityState:'Tampa Bay, Florida' },
  TEX: { code:'TEX', espnAbbr:'tex', slug:'texas-rangers', fullName:'Texas Rangers', shortLabel:'Dallas', mascot:'Rangers', primary:'#003278', secondary:'#C0111F', homeVenue:'Globe Life Field', cityState:'Dallas, Texas' },
  TOR: { code:'TOR', espnAbbr:'tor', slug:'toronto-blue-jays', fullName:'Toronto Blue Jays', shortLabel:'Toronto', mascot:'Blue Jays', primary:'#134A8E', secondary:'#1D2D5C', homeVenue:'Rogers Centre', cityState:'Toronto, Ontario' },
  WSH: { code:'WSH', espnAbbr:'wsh', slug:'washington-nationals', fullName:'Washington Nationals', shortLabel:'Washington', mascot:'Nationals', primary:'#AB0003', secondary:'#14225A', homeVenue:'Nationals Park', cityState:'Washington, D.C.' },
};

// ── Ballparks ────────────────────────────────────────────────────────────────
const VENUE_OVERRIDES = {
  'Chase Field':                    { name:'Chase Field', city:'Phoenix', region:'Arizona', country:'USA', lat:33.4455, lon:-112.0667, timezone:'America/Phoenix' },
  'Truist Park':                    { name:'Truist Park', city:'Atlanta', region:'Georgia', country:'USA', lat:33.8907, lon:-84.4677, timezone:'America/New_York' },
  'Oriole Park at Camden Yards':    { name:'Oriole Park at Camden Yards', city:'Baltimore', region:'Maryland', country:'USA', lat:39.2839, lon:-76.6217, timezone:'America/New_York' },
  'Fenway Park':                    { name:'Fenway Park', city:'Boston', region:'Massachusetts', country:'USA', lat:42.3467, lon:-71.0972, timezone:'America/New_York' },
  'Wrigley Field':                  { name:'Wrigley Field', city:'Chicago', region:'Illinois', country:'USA', lat:41.9484, lon:-87.6553, timezone:'America/Chicago' },
  'Rate Field':                     { name:'Rate Field', city:'Chicago', region:'Illinois', country:'USA', lat:41.8299, lon:-87.6338, timezone:'America/Chicago', aliases:['Guaranteed Rate Field'] },
  'Great American Ball Park':       { name:'Great American Ball Park', city:'Cincinnati', region:'Ohio', country:'USA', lat:39.0975, lon:-84.5066, timezone:'America/New_York' },
  'Progressive Field':              { name:'Progressive Field', city:'Cleveland', region:'Ohio', country:'USA', lat:41.4962, lon:-81.6852, timezone:'America/New_York' },
  'Coors Field':                    { name:'Coors Field', city:'Denver', region:'Colorado', country:'USA', lat:39.7559, lon:-104.9942, timezone:'America/Denver' },
  'Comerica Park':                  { name:'Comerica Park', city:'Detroit', region:'Michigan', country:'USA', lat:42.3390, lon:-83.0485, timezone:'America/New_York' },
  'Daikin Park':                    { name:'Daikin Park', city:'Houston', region:'Texas', country:'USA', lat:29.7572, lon:-95.3556, timezone:'America/Chicago', aliases:['Minute Maid Park'] },
  'Kauffman Stadium':               { name:'Kauffman Stadium', city:'Kansas City', region:'Missouri', country:'USA', lat:39.0517, lon:-94.4803, timezone:'America/Chicago' },
  'Angel Stadium':                  { name:'Angel Stadium', city:'Anaheim', region:'California', country:'USA', lat:33.8003, lon:-117.8827, timezone:'America/Los_Angeles' },
  'Dodger Stadium':                 { name:'Dodger Stadium', city:'Los Angeles', region:'California', country:'USA', lat:34.0739, lon:-118.2400, timezone:'America/Los_Angeles' },
  'loanDepot park':                 { name:'loanDepot park', city:'Miami', region:'Florida', country:'USA', lat:25.7781, lon:-80.2197, timezone:'America/New_York' },
  'American Family Field':          { name:'American Family Field', city:'Milwaukee', region:'Wisconsin', country:'USA', lat:43.0280, lon:-87.9712, timezone:'America/Chicago' },
  'Target Field':                   { name:'Target Field', city:'Minneapolis', region:'Minnesota', country:'USA', lat:44.9817, lon:-93.2776, timezone:'America/Chicago' },
  'Citi Field':                     { name:'Citi Field', city:'New York', region:'New York', country:'USA', lat:40.7571, lon:-73.8458, timezone:'America/New_York' },
  'Yankee Stadium':                 { name:'Yankee Stadium', city:'New York', region:'New York', country:'USA', lat:40.8296, lon:-73.9262, timezone:'America/New_York' },
  'Sutter Health Park':             { name:'Sutter Health Park', city:'Sacramento', region:'California', country:'USA', lat:38.5800, lon:-121.5130, timezone:'America/Los_Angeles' },
  'Citizens Bank Park':             { name:'Citizens Bank Park', city:'Philadelphia', region:'Pennsylvania', country:'USA', lat:39.9061, lon:-75.1665, timezone:'America/New_York' },
  'PNC Park':                       { name:'PNC Park', city:'Pittsburgh', region:'Pennsylvania', country:'USA', lat:40.4469, lon:-80.0057, timezone:'America/New_York' },
  'Petco Park':                     { name:'Petco Park', city:'San Diego', region:'California', country:'USA', lat:32.7073, lon:-117.1566, timezone:'America/Los_Angeles' },
  'T-Mobile Park':                  { name:'T-Mobile Park', city:'Seattle', region:'Washington', country:'USA', lat:47.5914, lon:-122.3325, timezone:'America/Los_Angeles' },
  'Oracle Park':                    { name:'Oracle Park', city:'San Francisco', region:'California', country:'USA', lat:37.7786, lon:-122.3893, timezone:'America/Los_Angeles' },
  'Busch Stadium':                  { name:'Busch Stadium', city:'St. Louis', region:'Missouri', country:'USA', lat:38.6226, lon:-90.1928, timezone:'America/Chicago' },
  'Tropicana Field':                { name:'Tropicana Field', city:'St. Petersburg', region:'Florida', country:'USA', lat:27.7682, lon:-82.6534, timezone:'America/New_York' },
  'Globe Life Field':               { name:'Globe Life Field', city:'Arlington', region:'Texas', country:'USA', lat:32.7473, lon:-97.0838, timezone:'America/Chicago' },
  'Rogers Centre':                  { name:'Rogers Centre', city:'Toronto', region:'Ontario', country:'Canada', lat:43.6414, lon:-79.3894, timezone:'America/Toronto' },
  'Nationals Park':                 { name:'Nationals Park', city:'Washington', region:'D.C.', country:'USA', lat:38.8730, lon:-77.0074, timezone:'America/New_York' },
};

const VENUE_ALIAS_LOOKUP = buildVenueAliasLookup(VENUE_OVERRIDES);

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { fanSide: 'away', archived: 'YES' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--append') args.append = true;
    else if (a === '--weekends') args.weekends = true;
    else if (a === '--team') args.team = String(next() || '').toUpperCase();
    else if (a === '--start') args.start = next();
    else if (a === '--end') args.end = next();
    else if (a === '--season') args.season = Number(next());
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--out') args.out = next();
    else if (a === '--fan-side') args.fanSide = String(next() || 'away').toLowerCase();
    else if (a === '--archived') args.archived = /^(true|yes|1)$/i.test(String(next())) ? 'YES' : null;
  }
  return args;
}

function printHelp() {
  console.log(String(require('fs').readFileSync(__filename, 'utf8')).split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
}

main().catch((err) => { console.error(err && err.stack ? err.stack : String(err)); process.exit(1); });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const season = args.season || new Date().getFullYear();
  if (args.team && !TEAM_METADATA[args.team]) {
    console.error(`Unknown team code: ${args.team}. Valid: ${Object.keys(TEAM_METADATA).join(', ')}`);
    process.exit(1);
  }
  if (!args.team && !(args.start || args.end)) {
    console.error('Give a scope: --team CODE and/or --start/--end. (Full season = ~2,430 games.)\nRun with --help for details.');
    process.exit(1);
  }
  if (!['away', 'home', 'both'].includes(args.fanSide)) {
    console.error("--fan-side must be away | home | both");
    process.exit(1);
  }

  const start = args.start || `${season}-03-15`;
  const end = args.end || `${season}-11-15`;
  const outPath = args.out
    ? path.resolve(process.cwd(), args.out)
    : path.resolve(__dirname, '..', '..', 'mc', 'data', 'mlb.jsonl');

  console.log(`MLB matchup maker — season ${season}, ${start} → ${end}` +
    (args.team ? `, team ${args.team}` : '') + (args.weekends ? ', weekends only' : '') +
    `, fan-side ${args.fanSide}${args.dryRun ? ' [dry-run]' : ''}`);

  const matchups = await fetchMlbSchedule(start, end);
  console.log(`Fetched ${matchups.length} scheduled games from ESPN.`);

  let filtered = matchups;
  if (args.team) filtered = filtered.filter((m) => m.awayCode === args.team || m.homeCode === args.team);
  if (args.weekends) filtered = filtered.filter((m) => [5, 6, 0].includes(new Date(m.kickoffUtc).getUTCDay()));
  console.log(`After filters: ${filtered.length} games.`);

  const payloads = [];
  const seenIds = new Set();
  for (const m of filtered) {
    const sides = args.fanSide === 'both' ? ['away', 'home'] : [args.fanSide];
    for (const side of sides) {
      const p = buildPayloadForFanSide(m, side, args.archived);
      if (!p || seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      payloads.push(p);
      if (args.limit && payloads.length >= args.limit) break;
    }
    if (args.limit && payloads.length >= args.limit) break;
  }

  console.log(`Built ${payloads.length} takeover game(s).`);
  for (const p of payloads.slice(0, 12)) console.log(`  ${p.name}  (${p.game_date})`);
  if (payloads.length > 12) console.log(`  … +${payloads.length - 12} more`);

  if (args.dryRun) { console.log('[dry-run] nothing written.'); return; }
  if (!payloads.length) { console.log('Nothing to write.'); return; }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = payloads.map((p) => JSON.stringify(p)).join('\n') + '\n';
  if (args.append) fs.appendFileSync(outPath, lines); else fs.writeFileSync(outPath, lines);
  console.log(`${args.append ? 'Appended' : 'Wrote'} ${payloads.length} line(s) to ${outPath}`);
}

// ── ESPN MLB schedule ────────────────────────────────────────────────────────
async function fetchMlbSchedule(startISO, endISO) {
  const out = [];
  const seen = new Set();
  // ESPN caps results per request, so walk the range in ~10-day windows.
  let cursor = new Date(startISO + 'T00:00:00Z');
  const endDate = new Date(endISO + 'T00:00:00Z');
  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor.getTime());
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 9);
    const a = ymd(cursor), b = ymd(chunkEnd > endDate ? endDate : chunkEnd);
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${a}-${b}&limit=1000`;
    const data = await fetchJson(url, { tolerateNotFound: true });
    const events = data && Array.isArray(data.events) ? data.events : [];
    for (const ev of events) {
      const row = parseEvent(ev);
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 10);
  }
  return out;
}

function parseEvent(ev) {
  const comp = Array.isArray(ev.competitions) ? ev.competitions[0] : null;
  if (!comp || !Array.isArray(comp.competitors)) return null;
  const home = comp.competitors.find((c) => c && c.homeAway === 'home');
  const away = comp.competitors.find((c) => c && c.homeAway === 'away');
  if (!home || !away || !home.team || !away.team) return null;
  const homeCode = normalizeCode(home.team.abbreviation);
  const awayCode = normalizeCode(away.team.abbreviation);
  if (!TEAM_METADATA[homeCode] || !TEAM_METADATA[awayCode]) return null;
  const kickoffUtc = ev.date || comp.date || null;
  if (!kickoffUtc) return null;
  const venueName = comp.venue && comp.venue.fullName ? String(comp.venue.fullName) : TEAM_METADATA[homeCode].homeVenue;
  const venueInfo = resolveVenueInfo({ venueName, homeCode, neutralSite: comp.neutralSite });
  return {
    id: String(ev.id || ''),
    awayCode, homeCode,
    venueInfo,
    neutral: !!(comp.neutralSite || venueInfo.neutral),
    kickoffUtc: new Date(kickoffUtc).toISOString(),
    localGameDate: formatDateParts(getZonedParts(kickoffUtc, venueInfo.timezone)),
    awayColor: espnColor(away.team.color, TEAM_METADATA[awayCode].primary),
    awayAltColor: espnColor(away.team.alternateColor, TEAM_METADATA[awayCode].secondary),
    homeColor: espnColor(home.team.color, TEAM_METADATA[homeCode].primary),
    homeAltColor: espnColor(home.team.alternateColor, TEAM_METADATA[homeCode].secondary),
  };
}

// ── Payload builder (baseball-flavored clone of the NFL maker) ────────────────
function buildPayloadForFanSide(matchup, fanSide, archivedValue) {
  const venueInfo = matchup.venueInfo;
  const fanCode = fanSide === 'home' ? matchup.homeCode : matchup.awayCode;
  const oppCode = fanSide === 'home' ? matchup.awayCode : matchup.homeCode;
  const fanTeam = TEAM_METADATA[fanCode];
  const oppTeam = TEAM_METADATA[oppCode];
  const titleTarget = venueInfo.neutral ? venueInfo.city : TEAM_METADATA[matchup.homeCode].shortLabel;
  const name = `${fanTeam.shortLabel} Fans Takeover ${titleTarget}`;
  // Window times are written in Central (START_TIME_TZ), not venue-local.
  const kickoffLocal = getZonedParts(matchup.kickoffUtc, START_TIME_TZ);
  const win = buildTgbWindow(kickoffLocal);
  const colors = buildColors(matchup, fanTeam);
  const teams = buildTeamSuggestions(fanTeam, venueInfo);
  const guideBio = `Your guide is ready to rally ${fanTeam.shortLabel} fans before first pitch.`;
  const logoUrl = `https://a.espncdn.com/i/teamlogos/mlb/500/${fanTeam.espnAbbr}.png`;
  const body = buildBody(matchup, fanTeam, oppTeam, venueInfo);
  const tagline = buildTagline(matchup, fanTeam, venueInfo);
  const startingLocation = `https://maps.google.com/?q=${venueInfo.lat},${venueInfo.lon}`;
  const cityLabel = `${venueInfo.city}, ${venueInfo.region}${venueInfo.country && venueInfo.country !== 'USA' ? `, ${venueInfo.country}` : ''}`;
  const id = `mlb${matchup.localGameDate.replace(/-/g, '')}-${matchup.awayCode.toLowerCase()}-${matchup.homeCode.toLowerCase()}-${fanCode.toLowerCase()}-${slugify(titleTarget)}`;

  const nodes = buildNodes({
    name, cityLabel, body, teams, logoUrl, tagline, guideBio,
    startTime: win.startTime, endTime: win.endTime, gameDate: win.gameDate,
    tertiaryColor: colors.tertiary, quaternaryColor: colors.quaternary,
    startingLocation, lat: venueInfo.lat, lon: venueInfo.lon,
    venueName: venueInfo.name, fanShortLabel: fanTeam.shortLabel,
    opponentShortLabel: oppTeam.shortLabel, titleTarget,
  });

  return {
    id, name, tagline, city: cityLabel,
    primary_color: colors.primary, secondary_color: colors.secondary,
    tertiary_color: colors.tertiary, quaternary_color: colors.quaternary,
    logo_url: logoUrl, guide_name: 'Mission Control', guide_bio: guideBio,
    guide_image_url: logoUrl, body, price: 'Free To Start / In App Purchases',
    default_emoji: '⚾', starting_location: startingLocation,
    starting_location_lat: venueInfo.lat, starting_location_lon: venueInfo.lon,
    location_based: true, fandom_game: true, engine: 'text',
    game_date: win.gameDate, start_time: win.startTime, end_time: win.endTime,
    archived: archivedValue,
    venue_name: venueInfo.name,
    venue_city: venueInfo.city,
    away_team_city: fanSide === 'home' ? oppTeam.cityState : fanTeam.cityState,
    away_team_mascot: fanSide === 'home' ? oppTeam.mascot : fanTeam.mascot,
    home_team_city: fanSide === 'home' ? fanTeam.cityState : oppTeam.cityState,
    home_team_mascot: fanSide === 'home' ? fanTeam.mascot : oppTeam.mascot,
    tags: ['Sports', 'MLB', 'Baseball', 'Scavenger Hunt', venueInfo.city, fanTeam.shortLabel].filter(Boolean).slice(0, 8),
    teams,
    team01: teams[0] || null, team02: teams[1] || null, team03: teams[2] || null, team04: teams[3] || null,
    team05: teams[4] || null, team06: teams[5] || null, team07: teams[6] || null, team08: teams[7] || null,
    nodes, links: buildLinks(id),
  };
}

function buildColors(matchup, fanTeam) {
  const isAway = fanTeam.code === matchup.awayCode;
  return {
    primary: normalizeColor((isAway ? matchup.awayColor : matchup.homeColor) || fanTeam.primary),
    secondary: normalizeColor((isAway ? matchup.awayAltColor : matchup.homeAltColor) || fanTeam.secondary),
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
  };
}

function buildTeamSuggestions(fanTeam, venueInfo) {
  return [
    `${fanTeam.shortLabel} Road Crew`,
    `${fanTeam.shortLabel} Takeover Squad`,
    `${fanTeam.shortLabel} Bleacher Brigade`,
    `${fanTeam.shortLabel} Night Shift`,
    `${fanTeam.shortLabel} Final Inning`,
    `${fanTeam.shortLabel} Loudhouse`,
    `${venueInfo.city} Bound`,
    `${fanTeam.shortLabel} Clue Club`,
  ];
}

function buildTagline(matchup, fanTeam, venueInfo) {
  const target = venueInfo.neutral ? venueInfo.city : TEAM_METADATA[matchup.homeCode].shortLabel;
  const patterns = [
    `${fanTeam.shortLabel} fans, take over ${target} before first pitch.`,
    `One day early, ${fanTeam.shortLabel} turns ${target} into a pregame playground.`,
    `${fanTeam.shortLabel} rolls in early for a clue-led run through ${venueInfo.city}.`,
    `${fanTeam.shortLabel} gets the city first. First pitch comes tomorrow.`,
  ];
  return patterns[Math.abs(hashString(`${matchup.localGameDate}-${fanTeam.code}`)) % patterns.length];
}

function buildBody(matchup, fanTeam, oppTeam, venueInfo) {
  const local = getZonedParts(matchup.kickoffUtc, venueInfo.timezone);
  const first = formatReadableLocalKickoff(local, venueInfo.timezone);
  const lead = venueInfo.neutral
    ? `${fanTeam.fullName} fans get their own ${venueInfo.city} takeover the day before the neutral-site game with the ${oppTeam.fullName}.`
    : `${fanTeam.fullName} fans are in town a day early for the road series date with the ${oppTeam.fullName}.`;
  const flavor = [
    `This two-hour route starts near ${venueInfo.name} and turns the surrounding area into your pregame game board.`,
    `Rally your crew, name your squad, and work the city around ${venueInfo.name} before first pitch.`,
    `It is built as a fast pregame warm-up with scavenger-hunt movement, ballpark energy, and plenty of bragging rights.`,
    `First pitch is ${first}, so this is your chance to own the city first.`,
  ];
  return `${lead} ${flavor.join(' ')}`;
}

function buildNodes(c) {
  const suggestionBody = `Here are some suggestions:\n\n-%team01%\n-%team02%\n-%team03%\n-%team04%\n-%team05%\n-%team06%\n-%team07%\n-%team08%`;
  const introBody = `${c.fanShortLabel} fans, you are live in ${c.cityLabel}. This two-hour takeover starts near ${c.venueName} and runs the day before first pitch against ${c.opponentShortLabel}.`;
  const blank = (over, x, y, id, extra) => Object.assign({
    x, y, id, body: '', city: '', kind: '', tags: [], type: 'stop', price: '', teams: Array(8).fill(''),
    title: '', width: 250, height: 92, team01: '', team02: '', team03: '', team04: '', team05: '', team06: '',
    team07: '', team08: '', anytime: false, endTime: '', linkUrl: '', logoUrl: '', tagline: '', varName: '',
    featured: '', gameDate: '', guideBio: '', rotation: 0, acceptAny: false, buttonUrl: '', guideName: '',
    howToPlay: '', startTime: '', orderIndex: over, defaultEmoji: '', anytimePairId: '', guideImageUrl: '',
    locationBased: 'NO', tertiaryColor: '#000000', stopGroup: '', answerResponses: [], quaternaryColor: '#FFFFFF',
    startingLocation: '', startingLocationLat: null, startingLocationLon: null,
  }, extra);
  return [
    {
      x: 0, y: -72, id: 'gm-01', body: c.body, city: c.cityLabel, kind: '', tags: [], type: 'game',
      price: 'Free To Start / In App Purchases', teams: c.teams, title: c.name, width: 184, engine: 'text', height: 318,
      team01: c.teams[0] || '', team02: c.teams[1] || '', team03: c.teams[2] || '', team04: c.teams[3] || '',
      team05: c.teams[4] || '', team06: c.teams[5] || '', team07: c.teams[6] || '', team08: c.teams[7] || '',
      anytime: false, endTime: c.endTime, linkUrl: '', logoUrl: c.logoUrl, tagline: c.tagline, varName: '', featured: '',
      gameDate: c.gameDate, guideBio: c.guideBio, rotation: 0, acceptAny: false, buttonUrl: '', guideName: 'Mission Control',
      howToPlay: '', startTime: c.startTime, orderIndex: 100, defaultEmoji: '⚾', anytimePairId: '', guideImageUrl: c.logoUrl,
      locationBased: true, tertiaryColor: c.tertiaryColor, stopGroup: '', answerResponses: [], quaternaryColor: c.quaternaryColor,
      startingLocation: c.startingLocation, startingLocationLat: c.lat, startingLocationLon: c.lon,
    },
    blank(200, 24, 252, 'st-01', { type: 'stop', title: 'TEAM NAME', width: 236, height: 90 }),
    blank(300, 24, 300, 'gd-01', { type: 'bubble', kind: 'text', body: introBody }),
    blank(400, 24, 384, 'gd-02', { type: 'bubble', kind: 'text', body: suggestionBody }),
    blank(500, 288, 468, 'pl-01', { type: 'reply', width: 230, height: 88, varName: 'team', acceptAny: true }),
    blank(600, 24, 576, 'gd-03', { type: 'bubble', kind: 'text', body: `All right %team%! ${c.fanShortLabel} takes over ${c.titleTarget} now.` }),
  ];
}

function buildLinks(gameId) {
  return [
    { id: `${gameId}-link-1`, from: 'st-01', to: 'gd-01', fromPort: 'out-right' },
    { id: `${gameId}-link-2`, from: 'gd-01', to: 'gd-02', fromPort: 'out-right' },
    { id: `${gameId}-link-3`, from: 'gd-02', to: 'pl-01', fromPort: 'out-right' },
    { id: `${gameId}-link-4`, from: 'pl-01', to: 'gd-03', fromPort: 'out-right' },
  ];
}

// ── Shared helpers (mirrors nfl-schedule-2026-matchup-maker.js) ───────────────
function buildVenueAliasLookup(venues) {
  const lookup = {};
  for (const [n, info] of Object.entries(venues)) {
    lookup[normVenue(n)] = info;
    for (const alias of info.aliases || []) lookup[normVenue(alias)] = info;
  }
  return lookup;
}
function resolveVenueInfo(input) {
  const v = input && input.venueName ? VENUE_ALIAS_LOOKUP[normVenue(input.venueName)] : null;
  if (v) return Object.assign({ neutral: !!(input && input.neutralSite) }, v);
  if (input && input.homeCode && TEAM_METADATA[input.homeCode]) {
    const fb = VENUE_OVERRIDES[TEAM_METADATA[input.homeCode].homeVenue];
    if (fb) return Object.assign({ neutral: !!(input && input.neutralSite) }, fb);
  }
  return { name: (input && input.venueName) || 'Unknown', city: 'Unknown City', region: '', country: 'USA', lat: 0, lon: 0, timezone: 'America/New_York', neutral: !!(input && input.neutralSite) };
}
function buildTgbWindow(local) {
  const base = new Date(Date.UTC(+local.year, +local.month - 1, +local.day, +local.hour, +local.minute, 0));
  base.setUTCDate(base.getUTCDate() - 1);
  const end = new Date(base.getTime() + TWO_HOURS_MS);
  return {
    gameDate: `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`,
    startTime: `${pad2(base.getUTCHours())}:${pad2(base.getUTCMinutes())}:00`,
    endTime: `${pad2(end.getUTCHours())}:${pad2(end.getUTCMinutes())}:00`,
  };
}
async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!r.ok) { if (opts.tolerateNotFound && r.status === 404) return null; throw new Error(`Request failed ${url}: ${r.status}`); }
  return r.json();
}
function getZonedParts(iso, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const out = {};
  for (const p of f.formatToParts(new Date(iso))) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}
function formatDateParts(p) { return `${p.year}-${p.month}-${p.day}`; }
function formatReadableLocalKickoff(p, tz) {
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, 0));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d) + ` local (${tz})`;
}
function normalizeCode(code) {
  const u = String(code || '').toUpperCase();
  if (u === 'OAK' || u === 'ATH') return 'ATH';
  if (u === 'CHW') return 'CWS';
  if (u === 'SFG') return 'SF';
  if (u === 'SDP') return 'SD';
  if (u === 'TBR') return 'TB';
  if (u === 'KCR') return 'KC';
  if (u === 'WAS') return 'WSH';
  return u;
}
function espnColor(v, fb) { return v ? `#${String(v).replace(/^#/, '')}` : fb; }
function normalizeColor(v) { if (!v) return '#FFFFFF'; const s = String(v).trim(); return s.startsWith('#') ? s : `#${s}`; }
function normVenue(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function slugify(v) { return String(v || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase(); }
function hashString(v) { let h = 0; const t = String(v || ''); for (let i = 0; i < t.length; i++) { h = ((h << 5) - h) + t.charCodeAt(i); h |= 0; } return h; }
function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`; }
