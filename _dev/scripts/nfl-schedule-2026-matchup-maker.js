const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const SEASON = 2026;
const ESPN_DATE_RANGE = '20260901-20270115';
const ARCHIVED_VALUE = 'YES';
const USER_AGENT = 'TGB NFL Schedule 2026 Matchup Maker/1.0';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const DRY_RUN = process.argv.includes('--dry-run');

const TEAM_METADATA = {
  ARI: {
    code: 'ARI',
    espnAbbr: 'ari',
    slug: 'arizona-cardinals',
    fullName: 'Arizona Cardinals',
    shortLabel: 'Arizona',
    mascot: 'Cardinals',
    primary: '#97233F',
    secondary: '#FFB612',
    tertiary: '#002868',
    quaternary: '#FFFFFF',
    homeVenue: 'State Farm Stadium',
  },
  ATL: {
    code: 'ATL',
    espnAbbr: 'atl',
    slug: 'atlanta-falcons',
    fullName: 'Atlanta Falcons',
    shortLabel: 'Atlanta',
    mascot: 'Falcons',
    primary: '#A71930',
    secondary: '#000000',
    tertiary: '#A5ACAF',
    quaternary: '#FFFFFF',
    homeVenue: 'Mercedes-Benz Stadium',
  },
  BAL: {
    code: 'BAL',
    espnAbbr: 'bal',
    slug: 'baltimore-ravens',
    fullName: 'Baltimore Ravens',
    shortLabel: 'Baltimore',
    mascot: 'Ravens',
    primary: '#241773',
    secondary: '#000000',
    tertiary: '#9E7C0C',
    quaternary: '#FFFFFF',
    homeVenue: 'M&T Bank Stadium',
  },
  BUF: {
    code: 'BUF',
    espnAbbr: 'buf',
    slug: 'buffalo-bills',
    fullName: 'Buffalo Bills',
    shortLabel: 'Buffalo',
    mascot: 'Bills',
    primary: '#00338D',
    secondary: '#C60C30',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Highmark Stadium',
  },
  CAR: {
    code: 'CAR',
    espnAbbr: 'car',
    slug: 'carolina-panthers',
    fullName: 'Carolina Panthers',
    shortLabel: 'Carolina',
    mascot: 'Panthers',
    primary: '#0085CA',
    secondary: '#101820',
    tertiary: '#BFC0BF',
    quaternary: '#FFFFFF',
    homeVenue: 'Bank of America Stadium',
  },
  CHI: {
    code: 'CHI',
    espnAbbr: 'chi',
    slug: 'chicago-bears',
    fullName: 'Chicago Bears',
    shortLabel: 'Chicago',
    mascot: 'Bears',
    primary: '#0B162A',
    secondary: '#C83803',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Soldier Field',
  },
  CIN: {
    code: 'CIN',
    espnAbbr: 'cin',
    slug: 'cincinnati-bengals',
    fullName: 'Cincinnati Bengals',
    shortLabel: 'Cincinnati',
    mascot: 'Bengals',
    primary: '#FB4F14',
    secondary: '#000000',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Paycor Stadium',
  },
  CLE: {
    code: 'CLE',
    espnAbbr: 'cle',
    slug: 'cleveland-browns',
    fullName: 'Cleveland Browns',
    shortLabel: 'Cleveland',
    mascot: 'Browns',
    primary: '#311D00',
    secondary: '#FF3C00',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Huntington Bank Field',
  },
  DAL: {
    code: 'DAL',
    espnAbbr: 'dal',
    slug: 'dallas-cowboys',
    fullName: 'Dallas Cowboys',
    shortLabel: 'Dallas',
    mascot: 'Cowboys',
    primary: '#041E42',
    secondary: '#869397',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'AT&T Stadium',
  },
  DEN: {
    code: 'DEN',
    espnAbbr: 'den',
    slug: 'denver-broncos',
    fullName: 'Denver Broncos',
    shortLabel: 'Denver',
    mascot: 'Broncos',
    primary: '#FB4F14',
    secondary: '#002244',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Empower Field at Mile High',
  },
  DET: {
    code: 'DET',
    espnAbbr: 'det',
    slug: 'detroit-lions',
    fullName: 'Detroit Lions',
    shortLabel: 'Detroit',
    mascot: 'Lions',
    primary: '#0076B6',
    secondary: '#B0B7BC',
    tertiary: '#000000',
    quaternary: '#FFFFFF',
    homeVenue: 'Ford Field',
  },
  GB: {
    code: 'GB',
    espnAbbr: 'gb',
    slug: 'green-bay-packers',
    fullName: 'Green Bay Packers',
    shortLabel: 'Green Bay',
    mascot: 'Packers',
    primary: '#203731',
    secondary: '#FFB612',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Lambeau Field',
  },
  HOU: {
    code: 'HOU',
    espnAbbr: 'hou',
    slug: 'houston-texans',
    fullName: 'Houston Texans',
    shortLabel: 'Houston',
    mascot: 'Texans',
    primary: '#03202F',
    secondary: '#A71930',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'NRG Stadium',
  },
  IND: {
    code: 'IND',
    espnAbbr: 'ind',
    slug: 'indianapolis-colts',
    fullName: 'Indianapolis Colts',
    shortLabel: 'Indianapolis',
    mascot: 'Colts',
    primary: '#002C5F',
    secondary: '#A2AAAD',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Lucas Oil Stadium',
  },
  JAX: {
    code: 'JAX',
    espnAbbr: 'jax',
    slug: 'jacksonville-jaguars',
    fullName: 'Jacksonville Jaguars',
    shortLabel: 'Jacksonville',
    mascot: 'Jaguars',
    primary: '#006778',
    secondary: '#9F792C',
    tertiary: '#101820',
    quaternary: '#FFFFFF',
    homeVenue: 'EverBank Stadium',
  },
  KC: {
    code: 'KC',
    espnAbbr: 'kc',
    slug: 'kansas-city-chiefs',
    fullName: 'Kansas City Chiefs',
    shortLabel: 'Kansas City',
    mascot: 'Chiefs',
    primary: '#E31837',
    secondary: '#FFB81C',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'GEHA Field at Arrowhead Stadium',
  },
  LV: {
    code: 'LV',
    espnAbbr: 'lv',
    slug: 'las-vegas-raiders',
    fullName: 'Las Vegas Raiders',
    shortLabel: 'Las Vegas',
    mascot: 'Raiders',
    primary: '#000000',
    secondary: '#A5ACAF',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Allegiant Stadium',
  },
  LAC: {
    code: 'LAC',
    espnAbbr: 'lac',
    slug: 'los-angeles-chargers',
    fullName: 'Los Angeles Chargers',
    shortLabel: 'Los Angeles',
    mascot: 'Chargers',
    primary: '#0080C6',
    secondary: '#FFC20E',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'SoFi Stadium',
  },
  LAR: {
    code: 'LAR',
    espnAbbr: 'lar',
    slug: 'los-angeles-rams',
    fullName: 'Los Angeles Rams',
    shortLabel: 'Los Angeles',
    mascot: 'Rams',
    primary: '#003594',
    secondary: '#FFD100',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'SoFi Stadium',
  },
  MIA: {
    code: 'MIA',
    espnAbbr: 'mia',
    slug: 'miami-dolphins',
    fullName: 'Miami Dolphins',
    shortLabel: 'Miami',
    mascot: 'Dolphins',
    primary: '#008E97',
    secondary: '#FC4C02',
    tertiary: '#005778',
    quaternary: '#FFFFFF',
    homeVenue: 'Hard Rock Stadium',
  },
  MIN: {
    code: 'MIN',
    espnAbbr: 'min',
    slug: 'minnesota-vikings',
    fullName: 'Minnesota Vikings',
    shortLabel: 'Minnesota',
    mascot: 'Vikings',
    primary: '#4F2683',
    secondary: '#FFC62F',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'U.S. Bank Stadium',
  },
  NE: {
    code: 'NE',
    espnAbbr: 'ne',
    slug: 'new-england-patriots',
    fullName: 'New England Patriots',
    shortLabel: 'New England',
    mascot: 'Patriots',
    primary: '#002244',
    secondary: '#C60C30',
    tertiary: '#B0B7BC',
    quaternary: '#FFFFFF',
    homeVenue: 'Gillette Stadium',
  },
  NO: {
    code: 'NO',
    espnAbbr: 'no',
    slug: 'new-orleans-saints',
    fullName: 'New Orleans Saints',
    shortLabel: 'New Orleans',
    mascot: 'Saints',
    primary: '#D3BC8D',
    secondary: '#101820',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Caesars Superdome',
  },
  NYG: {
    code: 'NYG',
    espnAbbr: 'nyg',
    slug: 'new-york-giants',
    fullName: 'New York Giants',
    shortLabel: 'New York',
    mascot: 'Giants',
    primary: '#0B2265',
    secondary: '#A71930',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'MetLife Stadium',
  },
  NYJ: {
    code: 'NYJ',
    espnAbbr: 'nyj',
    slug: 'new-york-jets',
    fullName: 'New York Jets',
    shortLabel: 'New York',
    mascot: 'Jets',
    primary: '#125740',
    secondary: '#000000',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'MetLife Stadium',
  },
  PHI: {
    code: 'PHI',
    espnAbbr: 'phi',
    slug: 'philadelphia-eagles',
    fullName: 'Philadelphia Eagles',
    shortLabel: 'Philadelphia',
    mascot: 'Eagles',
    primary: '#004C54',
    secondary: '#A5ACAF',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Lincoln Financial Field',
  },
  PIT: {
    code: 'PIT',
    espnAbbr: 'pit',
    slug: 'pittsburgh-steelers',
    fullName: 'Pittsburgh Steelers',
    shortLabel: 'Pittsburgh',
    mascot: 'Steelers',
    primary: '#FFB612',
    secondary: '#101820',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Acrisure Stadium',
  },
  SF: {
    code: 'SF',
    espnAbbr: 'sf',
    slug: 'san-francisco-49ers',
    fullName: 'San Francisco 49ers',
    shortLabel: 'San Francisco',
    mascot: '49ers',
    primary: '#AA0000',
    secondary: '#B3995D',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: "Levi's Stadium",
  },
  SEA: {
    code: 'SEA',
    espnAbbr: 'sea',
    slug: 'seattle-seahawks',
    fullName: 'Seattle Seahawks',
    shortLabel: 'Seattle',
    mascot: 'Seahawks',
    primary: '#002244',
    secondary: '#69BE28',
    tertiary: '#A5ACAF',
    quaternary: '#FFFFFF',
    homeVenue: 'Lumen Field',
  },
  TB: {
    code: 'TB',
    espnAbbr: 'tb',
    slug: 'tampa-bay-buccaneers',
    fullName: 'Tampa Bay Buccaneers',
    shortLabel: 'Tampa Bay',
    mascot: 'Buccaneers',
    primary: '#D50A0A',
    secondary: '#FF7900',
    tertiary: '#34302B',
    quaternary: '#FFFFFF',
    homeVenue: 'Raymond James Stadium',
  },
  TEN: {
    code: 'TEN',
    espnAbbr: 'ten',
    slug: 'tennessee-titans',
    fullName: 'Tennessee Titans',
    shortLabel: 'Tennessee',
    mascot: 'Titans',
    primary: '#0C2340',
    secondary: '#4B92DB',
    tertiary: '#C8102E',
    quaternary: '#FFFFFF',
    homeVenue: 'Nissan Stadium',
  },
  WSH: {
    code: 'WSH',
    espnAbbr: 'wsh',
    slug: 'washington-commanders',
    fullName: 'Washington Commanders',
    shortLabel: 'Washington',
    mascot: 'Commanders',
    primary: '#5A1414',
    secondary: '#FFB612',
    tertiary: '#FFFFFF',
    quaternary: '#FFFFFF',
    homeVenue: 'Northwest Stadium',
  },
};

const VENUE_OVERRIDES = {
  'State Farm Stadium': {
    name: 'State Farm Stadium',
    city: 'Glendale',
    region: 'Arizona',
    country: 'USA',
    lat: 33.5275,
    lon: -112.2626,
    timezone: 'America/Phoenix',
    neutral: false,
  },
  'Mercedes-Benz Stadium': {
    name: 'Mercedes-Benz Stadium',
    city: 'Atlanta',
    region: 'Georgia',
    country: 'USA',
    lat: 33.7554,
    lon: -84.4008,
    timezone: 'America/New_York',
    neutral: false,
  },
  'M&T Bank Stadium': {
    name: 'M&T Bank Stadium',
    city: 'Baltimore',
    region: 'Maryland',
    country: 'USA',
    lat: 39.2779,
    lon: -76.6227,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Highmark Stadium': {
    name: 'Highmark Stadium',
    city: 'Orchard Park',
    region: 'New York',
    country: 'USA',
    lat: 42.7738,
    lon: -78.7868,
    timezone: 'America/New_York',
    neutral: false,
    aliases: ['Highmark Stadium (Old)'],
  },
  'Bank of America Stadium': {
    name: 'Bank of America Stadium',
    city: 'Charlotte',
    region: 'North Carolina',
    country: 'USA',
    lat: 35.2258,
    lon: -80.8528,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Soldier Field': {
    name: 'Soldier Field',
    city: 'Chicago',
    region: 'Illinois',
    country: 'USA',
    lat: 41.8625,
    lon: -87.6166,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'Paycor Stadium': {
    name: 'Paycor Stadium',
    city: 'Cincinnati',
    region: 'Ohio',
    country: 'USA',
    lat: 39.0954,
    lon: -84.516,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Huntington Bank Field': {
    name: 'Huntington Bank Field',
    city: 'Cleveland',
    region: 'Ohio',
    country: 'USA',
    lat: 41.5061,
    lon: -81.6995,
    timezone: 'America/New_York',
    neutral: false,
  },
  'AT&T Stadium': {
    name: 'AT&T Stadium',
    city: 'Arlington',
    region: 'Texas',
    country: 'USA',
    lat: 32.7473,
    lon: -97.0945,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'Empower Field at Mile High': {
    name: 'Empower Field at Mile High',
    city: 'Denver',
    region: 'Colorado',
    country: 'USA',
    lat: 39.7439,
    lon: -105.0201,
    timezone: 'America/Denver',
    neutral: false,
  },
  'Ford Field': {
    name: 'Ford Field',
    city: 'Detroit',
    region: 'Michigan',
    country: 'USA',
    lat: 42.3400,
    lon: -83.0456,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Lambeau Field': {
    name: 'Lambeau Field',
    city: 'Green Bay',
    region: 'Wisconsin',
    country: 'USA',
    lat: 44.5013,
    lon: -88.0622,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'NRG Stadium': {
    name: 'NRG Stadium',
    city: 'Houston',
    region: 'Texas',
    country: 'USA',
    lat: 29.6847,
    lon: -95.4107,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'Lucas Oil Stadium': {
    name: 'Lucas Oil Stadium',
    city: 'Indianapolis',
    region: 'Indiana',
    country: 'USA',
    lat: 39.7601,
    lon: -86.1639,
    timezone: 'America/Indiana/Indianapolis',
    neutral: false,
  },
  'EverBank Stadium': {
    name: 'EverBank Stadium',
    city: 'Jacksonville',
    region: 'Florida',
    country: 'USA',
    lat: 30.3239,
    lon: -81.6373,
    timezone: 'America/New_York',
    neutral: false,
  },
  'GEHA Field at Arrowhead Stadium': {
    name: 'GEHA Field at Arrowhead Stadium',
    city: 'Kansas City',
    region: 'Missouri',
    country: 'USA',
    lat: 39.0489,
    lon: -94.4839,
    timezone: 'America/Chicago',
    neutral: false,
    aliases: ['GEHA Field'],
  },
  'Allegiant Stadium': {
    name: 'Allegiant Stadium',
    city: 'Las Vegas',
    region: 'Nevada',
    country: 'USA',
    lat: 36.0908,
    lon: -115.1830,
    timezone: 'America/Los_Angeles',
    neutral: false,
  },
  'SoFi Stadium': {
    name: 'SoFi Stadium',
    city: 'Inglewood',
    region: 'California',
    country: 'USA',
    lat: 33.9535,
    lon: -118.3392,
    timezone: 'America/Los_Angeles',
    neutral: false,
  },
  'Hard Rock Stadium': {
    name: 'Hard Rock Stadium',
    city: 'Miami Gardens',
    region: 'Florida',
    country: 'USA',
    lat: 25.9580,
    lon: -80.2389,
    timezone: 'America/New_York',
    neutral: false,
  },
  'U.S. Bank Stadium': {
    name: 'U.S. Bank Stadium',
    city: 'Minneapolis',
    region: 'Minnesota',
    country: 'USA',
    lat: 44.9737,
    lon: -93.2575,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'Gillette Stadium': {
    name: 'Gillette Stadium',
    city: 'Foxborough',
    region: 'Massachusetts',
    country: 'USA',
    lat: 42.0909,
    lon: -71.2643,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Caesars Superdome': {
    name: 'Caesars Superdome',
    city: 'New Orleans',
    region: 'Louisiana',
    country: 'USA',
    lat: 29.9509,
    lon: -90.0813,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'MetLife Stadium': {
    name: 'MetLife Stadium',
    city: 'East Rutherford',
    region: 'New Jersey',
    country: 'USA',
    lat: 40.8135,
    lon: -74.0745,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Lincoln Financial Field': {
    name: 'Lincoln Financial Field',
    city: 'Philadelphia',
    region: 'Pennsylvania',
    country: 'USA',
    lat: 39.9008,
    lon: -75.1675,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Acrisure Stadium': {
    name: 'Acrisure Stadium',
    city: 'Pittsburgh',
    region: 'Pennsylvania',
    country: 'USA',
    lat: 40.4468,
    lon: -80.0158,
    timezone: 'America/New_York',
    neutral: false,
  },
  "Levi's Stadium": {
    name: "Levi's Stadium",
    city: 'Santa Clara',
    region: 'California',
    country: 'USA',
    lat: 37.4030,
    lon: -121.9700,
    timezone: 'America/Los_Angeles',
    neutral: false,
  },
  'Lumen Field': {
    name: 'Lumen Field',
    city: 'Seattle',
    region: 'Washington',
    country: 'USA',
    lat: 47.5952,
    lon: -122.3316,
    timezone: 'America/Los_Angeles',
    neutral: false,
  },
  'Raymond James Stadium': {
    name: 'Raymond James Stadium',
    city: 'Tampa',
    region: 'Florida',
    country: 'USA',
    lat: 27.9759,
    lon: -82.5033,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Nissan Stadium': {
    name: 'Nissan Stadium',
    city: 'Nashville',
    region: 'Tennessee',
    country: 'USA',
    lat: 36.1665,
    lon: -86.7713,
    timezone: 'America/Chicago',
    neutral: false,
  },
  'Northwest Stadium': {
    name: 'Northwest Stadium',
    city: 'Landover',
    region: 'Maryland',
    country: 'USA',
    lat: 38.9078,
    lon: -76.8644,
    timezone: 'America/New_York',
    neutral: false,
  },
  'Melbourne Cricket Ground': {
    name: 'Melbourne Cricket Ground',
    city: 'Melbourne',
    region: 'Victoria',
    country: 'Australia',
    lat: -37.8199,
    lon: 144.9834,
    timezone: 'Australia/Melbourne',
    neutral: true,
  },
  'Maracanã Stadium': {
    name: 'Maracanã Stadium',
    city: 'Rio de Janeiro',
    region: 'Rio de Janeiro',
    country: 'Brazil',
    lat: -22.9121,
    lon: -43.2302,
    timezone: 'America/Sao_Paulo',
    neutral: true,
    aliases: ['Maracana Stadium'],
  },
  'Tottenham Hotspur Stadium': {
    name: 'Tottenham Hotspur Stadium',
    city: 'London',
    region: 'England',
    country: 'United Kingdom',
    lat: 51.6043,
    lon: -0.0664,
    timezone: 'Europe/London',
    neutral: true,
  },
  'Wembley Stadium': {
    name: 'Wembley Stadium',
    city: 'London',
    region: 'England',
    country: 'United Kingdom',
    lat: 51.5560,
    lon: -0.2796,
    timezone: 'Europe/London',
    neutral: true,
  },
  'Stade De France': {
    name: 'Stade De France',
    city: 'Saint-Denis',
    region: 'France',
    country: 'France',
    lat: 48.9244,
    lon: 2.3601,
    timezone: 'Europe/Paris',
    neutral: true,
  },
  'Bernabéu Stadium': {
    name: 'Bernabéu Stadium',
    city: 'Madrid',
    region: 'Spain',
    country: 'Spain',
    lat: 40.4531,
    lon: -3.6883,
    timezone: 'Europe/Madrid',
    neutral: true,
    aliases: ['Bernabeu Stadium'],
  },
  'FC Bayern Munich Stadium': {
    name: 'FC Bayern Munich Stadium',
    city: 'Munich',
    region: 'Germany',
    country: 'Germany',
    lat: 48.2188,
    lon: 11.6247,
    timezone: 'Europe/Berlin',
    neutral: true,
  },
  'Estadio Banorte': {
    name: 'Estadio Banorte',
    city: 'Mexico City',
    region: 'Mexico City',
    country: 'Mexico',
    lat: 19.3029,
    lon: -99.1505,
    timezone: 'America/Mexico_City',
    neutral: true,
  },
};

const VENUE_ALIAS_LOOKUP = buildVenueAliasLookup(VENUE_OVERRIDES);
const FULL_NAME_TO_CODE = Object.fromEntries(
  Object.values(TEAM_METADATA).map((team) => [team.fullName, team.code])
);
const SLUG_TO_CODE = Object.fromEntries(
  Object.values(TEAM_METADATA).map((team) => [team.slug, team.code])
);
const SHORT_LABEL_TO_CODES = Object.values(TEAM_METADATA).reduce((acc, team) => {
  const key = team.shortLabel.toLowerCase();
  if (!acc[key]) acc[key] = [];
  acc[key].push(team.code);
  return acc;
}, {});

const TEAM_NAME_PATTERN = Object.keys(FULL_NAME_TO_CODE)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');
const NFL_VENUE_PATTERN = Object.keys(VENUE_OVERRIDES)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  console.log(`NFL ${SEASON} matchup maker${DRY_RUN ? ' [dry-run]' : ''}`);

  const [existingRows, templateRows, nflRows, espnRows, ptsRows] = await Promise.all([
    fetchExistingTakeoverRows(),
    fetchTakeoverTemplateRows(),
    fetchNflReleaseMatchups(),
    fetchEspnMatchups(),
    fetchPlainTextSportsMatchups(),
  ]);

  console.log(`Existing Takeover rows: ${existingRows.length}`);
  console.log(`Template Takeover rows: ${templateRows.length}`);
  console.log(`NFL.com rows: ${nflRows.length}`);
  console.log(`ESPN rows: ${espnRows.length}`);
  console.log(`Plain Text Sports rows: ${ptsRows.length}`);

  const templatesByTeam = buildTemplatesByTeam(templateRows);
  const mergedMatchups = mergeMatchups([nflRows, espnRows, ptsRows]);
  console.log(`Merged schedule rows: ${mergedMatchups.length}`);

  const existingNames = new Set(existingRows.map((row) => String(row.name || '').trim().toLowerCase()).filter(Boolean));
  const existingIds = new Set(existingRows.map((row) => String(row.id || '').trim()).filter(Boolean));

  const pending = [];
  const skipped = [];

  // NOTE: dedupe by ID and name. Caveat — the Giants and Jets share the short
  // label "New York", so a Giants takeover whose name matches an existing Jets
  // game (or vice versa) gets skipped here even though its ID is unique. When
  // that happens, add by ID with a targeted filter instead of a broad run.
  for (const matchup of mergedMatchups) {
    const payloads = buildPayloadsForMatchup(matchup, templatesByTeam);
    for (const payload of payloads) {
      const normalizedName = payload.name.trim().toLowerCase();
      if (existingIds.has(payload.id) || existingNames.has(normalizedName)) {
        skipped.push(payload.name);
        continue;
      }
      pending.push(payload);
      existingIds.add(payload.id);
      existingNames.add(normalizedName);
    }
  }

  console.log(`Pending inserts: ${pending.length}`);
  if (pending.length === 0) {
    console.log('Nothing new to add.');
    return;
  }

  for (const row of pending) {
    console.log(`  ${row.name} (${row.game_date} ${row.start_time}-${row.end_time})`);
  }

  if (skipped.length) {
    console.log(`Skipped existing: ${skipped.length}`);
  }

  if (DRY_RUN) return;

  await insertGames(pending);
  console.log(`Inserted ${pending.length} archived Takeover game(s).`);
}

function buildVenueAliasLookup(venues) {
  const lookup = {};
  for (const [name, info] of Object.entries(venues)) {
    lookup[normalizeVenueName(name)] = info;
    for (const alias of info.aliases || []) {
      lookup[normalizeVenueName(alias)] = info;
    }
  }
  return lookup;
}

async function fetchExistingTakeoverRows() {
  return fetchSupabaseRows(
    "games?name=ilike.*Takeover*&select=id,name"
  );
}

async function fetchTakeoverTemplateRows() {
  return fetchSupabaseRows(
    "games?name=ilike.*Takeover*&select=id,name,tagline,city,primary_color,secondary_color,tertiary_color,quaternary_color,logo_url,guide_name,guide_bio,guide_image_url,body,price,starting_location,starting_location_lat,starting_location_lon,location_based,engine,game_date,start_time,end_time,archived,tags,teams,team01,team02&order=name.asc"
  );
}

async function fetchSupabaseRows(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function fetchNflReleaseMatchups() {
  const html = await fetchText('https://www.nfl.com/nfl-schedule-release/');
  if (!html) return [];
  const text = decodeHtmlEntities(stripHtml(html));
  const regex = new RegExp(
    `WEEK\\s+(\\d+)\\s+([A-Z]{3})\\s+(\\d{2})\\/(\\d{2})\\s+(${TEAM_NAME_PATTERN})\\s+(\\d{1,2}:\\d{2})\\s+(AM|PM)\\s+(EDT|EST)\\s+@\\s+(${TEAM_NAME_PATTERN})[\\s\\S]*?(?:Learn More|Tickets)\\s+(${NFL_VENUE_PATTERN})`,
    'g'
  );

  const rows = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const [, week, dayCode, month, day, awayName, kickoffTime, meridiem, etZone, homeName, venueName] = match;
    let awayCode = FULL_NAME_TO_CODE[awayName];
    let homeCode = FULL_NAME_TO_CODE[homeName];
    if (!awayCode || !homeCode) continue;
    const venueInfo = resolveVenueInfo({ venueName, homeCode });
    if (!venueInfo.neutral && venueMatchesTeamHomeVenue(venueInfo.name, awayCode) && !venueMatchesTeamHomeVenue(venueInfo.name, homeCode)) {
      const swap = awayCode;
      awayCode = homeCode;
      homeCode = swap;
    }
    const kickoffUtc = etDateToUtc(SEASON, Number(month), Number(day), kickoffTime, meridiem, etZone);
    const localParts = getZonedParts(kickoffUtc, venueInfo.timezone);
    rows.push({
      source: 'nfl',
      priority: 1,
      week: Number(week),
      dayCode,
      awayCode,
      homeCode,
      awayName: TEAM_METADATA[awayCode].fullName,
      homeName: TEAM_METADATA[homeCode].fullName,
      venueName: venueInfo.name,
      venueCity: venueInfo.city,
      venueRegion: venueInfo.region,
      venueCountry: venueInfo.country,
      venueTimezone: venueInfo.timezone,
      neutralSite: !!venueInfo.neutral,
      kickoffUtc,
      localGameDate: formatDateParts(localParts),
    });
  }
  return dedupeMatchups(rows);
}

async function fetchEspnMatchups() {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ESPN_DATE_RANGE}&limit=1000`;
  const data = await fetchJsonWithRetry(url);
  const events = Array.isArray(data && data.events) ? data.events : [];
  const rows = [];

  for (const event of events) {
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : null;
    if (!competition || !Array.isArray(competition.competitors)) continue;
    const home = competition.competitors.find((item) => item && item.homeAway === 'home');
    const away = competition.competitors.find((item) => item && item.homeAway === 'away');
    if (!home || !away || !home.team || !away.team) continue;
    const homeCode = normalizeEspnTeamCode(home.team.abbreviation);
    const awayCode = normalizeEspnTeamCode(away.team.abbreviation);
    if (!homeCode || !awayCode) continue;

    const venueName = competition.venue && competition.venue.fullName
      ? decodeHtmlEntities(String(competition.venue.fullName))
      : TEAM_METADATA[homeCode].homeVenue;
    const venueInfo = resolveVenueInfo({
      venueName,
      homeCode,
      venueCity: competition.venue && competition.venue.address && competition.venue.address.city,
      venueState: competition.venue && competition.venue.address && competition.venue.address.state,
      venueCountry: competition.venue && competition.venue.address && competition.venue.address.country,
      neutralSite: competition.neutralSite,
    });
    const kickoffUtc = event.date || competition.date || competition.startDate || null;
    if (!kickoffUtc) continue;
    const localParts = getZonedParts(kickoffUtc, venueInfo.timezone);

    rows.push({
      source: 'espn',
      priority: 3,
      week: event.week && Number(event.week.number),
      awayCode,
      homeCode,
      awayName: TEAM_METADATA[awayCode].fullName,
      homeName: TEAM_METADATA[homeCode].fullName,
      venueName: venueInfo.name,
      venueCity: venueInfo.city,
      venueRegion: venueInfo.region,
      venueCountry: venueInfo.country,
      venueTimezone: venueInfo.timezone,
      neutralSite: !!(competition.neutralSite || venueInfo.neutral),
      kickoffUtc: new Date(kickoffUtc).toISOString(),
      localGameDate: formatDateParts(localParts),
      awayColor: normalizeColor(homeAwayColor(away.team.color, TEAM_METADATA[awayCode].primary)),
      awayAltColor: normalizeColor(homeAwayColor(away.team.alternateColor, TEAM_METADATA[awayCode].secondary)),
      homeColor: normalizeColor(homeAwayColor(home.team.color, TEAM_METADATA[homeCode].primary)),
      homeAltColor: normalizeColor(homeAwayColor(home.team.alternateColor, TEAM_METADATA[homeCode].secondary)),
      awayLogo: homeAwayLogo(away.team.logo, TEAM_METADATA[awayCode].espnAbbr),
      homeLogo: homeAwayLogo(home.team.logo, TEAM_METADATA[homeCode].espnAbbr),
    });
  }

  return dedupeMatchups(rows);
}

async function fetchPlainTextSportsMatchups() {
  const html = await fetchText(`https://plaintextsports.com/nfl/${SEASON}/schedule`, { tolerateNotFound: true });
  if (!html || !html.includes(`${SEASON} NFL Schedule`)) return [];

  const regularMatch = html.match(/Regular Season Schedule([\s\S]*?)(?:Preseason Week 1|<\/body>)/i);
  if (!regularMatch) return [];
  const regularHtml = regularMatch[1];
  const rows = [];

  const dateBlockRegex = /<div><b>\s*([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}):\s*<\/b>([\s\S]*?)<\/div>/g;
  let dateBlock;
  while ((dateBlock = dateBlockRegex.exec(regularHtml)) !== null) {
    const [, dateText, blockHtml] = dateBlock;
    const gameRegex = /href="\/nfl\/\d{4}\/teams\/([^"]+)">[^<]+<\/a>[\s\S]*?@\s*<a[^>]+href="\/nfl\/\d{4}\/teams\/([^"]+)">[^<]+<\/a>/g;
    const localGameDate = parseLongDate(dateText);
    let gameMatch;
    while ((gameMatch = gameRegex.exec(blockHtml)) !== null) {
      const [, awaySlug, homeSlug] = gameMatch;
      const awayCode = SLUG_TO_CODE[awaySlug];
      const homeCode = SLUG_TO_CODE[homeSlug];
      if (!awayCode || !homeCode || !localGameDate) continue;
      rows.push({
        source: 'pts',
        priority: 2,
        awayCode,
        homeCode,
        awayName: TEAM_METADATA[awayCode].fullName,
        homeName: TEAM_METADATA[homeCode].fullName,
        localGameDate,
      });
    }
  }

  return dedupeMatchups(rows);
}

function mergeMatchups(matchupLists) {
  const merged = new Map();
  for (const list of matchupLists) {
    for (const row of list) {
      const key = matchupKey(row);
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...row });
        continue;
      }
      const winner = row.priority > existing.priority ? row : existing;
      const loser = row.priority > existing.priority ? existing : row;
      merged.set(key, mergeObjectsPreservingDefined(winner, loser));
    }
  }
  return Array.from(merged.values()).sort((a, b) => {
    if (a.localGameDate !== b.localGameDate) return a.localGameDate.localeCompare(b.localGameDate);
    if ((a.kickoffUtc || '') !== (b.kickoffUtc || '')) return String(a.kickoffUtc || '').localeCompare(String(b.kickoffUtc || ''));
    return `${a.awayCode}${a.homeCode}`.localeCompare(`${b.awayCode}${b.homeCode}`);
  });
}

function buildTemplatesByTeam(rows) {
  const templates = new Map();
  for (const row of rows) {
    const name = String(row && row.name || '').trim();
    const match = name.match(/^(.+?) Fans Takeover /i);
    if (!match) continue;
    const shortLabel = match[1].trim().toLowerCase();
    const candidateCodes = SHORT_LABEL_TO_CODES[shortLabel] || [];
    if (candidateCodes.length !== 1) continue;
    const code = candidateCodes[0];
    const current = templates.get(code);
    const score = templateScore(row);
    if (!current || score > current.score) {
      templates.set(code, {
        score,
        row,
      });
    }
  }
  return templates;
}

function templateScore(row) {
  let score = 0;
  if (row && row.guide_name) score += 4;
  if (row && row.guide_image_url) score += 4;
  if (row && row.logo_url) score += 3;
  if (row && row.body) score += 2;
  if (row && row.how_to_play) score += 2;
  if (Array.isArray(row && row.tags) && row.tags.length) score += 2;
  if (Array.isArray(row && row.teams) && row.teams.filter(Boolean).length) score += 3;
  if (row && row.price) score += 1;
  if (row && row.city) score += 1;
  if (row && !/copy/i.test(String(row.name || ''))) score += 3;
  return score;
}

function buildPayloadsForMatchup(matchup, templatesByTeam) {
  const venueInfo = resolveVenueInfo(matchup);
  const fanSides = venueInfo.neutral ? ['away', 'home'] : ['away'];
  return fanSides.map((fanSide) => buildPayloadForFanSide(matchup, venueInfo, fanSide, templatesByTeam));
}

function buildPayloadForFanSide(matchup, venueInfo, fanSide, templatesByTeam) {
  const fanCode = fanSide === 'home' ? matchup.homeCode : matchup.awayCode;
  const opponentCode = fanSide === 'home' ? matchup.awayCode : matchup.homeCode;
  const fanTeam = TEAM_METADATA[fanCode];
  const opponentTeam = TEAM_METADATA[opponentCode];
  const template = templatesByTeam.get(fanCode) && templatesByTeam.get(fanCode).row;
  const titleTarget = venueInfo.neutral ? venueInfo.city : TEAM_METADATA[matchup.homeCode].shortLabel;
  const name = `${fanTeam.shortLabel} Fans Takeover ${titleTarget}`;
  const kickoffLocal = getZonedParts(matchup.kickoffUtc, venueInfo.timezone);
  const tgbWindow = buildTgbWindow(kickoffLocal);
  const tags = buildTags(template, venueInfo, fanTeam);
  const suggestions = buildTeamSuggestions(template, fanTeam, venueInfo);
  const colors = buildColors(matchup, fanTeam, template);
  const guide = buildGuide(template, fanTeam);
  const body = buildBody(matchup, fanTeam, opponentTeam, venueInfo, fanSide);
  const tagline = buildTagline(matchup, fanTeam, venueInfo, fanSide);
  const howToPlay = normalizeNonEmpty(template && template.how_to_play)
    || `Meet at the starting point, name your squad, and play this two-hour takeover route the day before kickoff. One person can unlock the route for the whole crew.`;
  const startingLocation = `https://maps.google.com/?q=${venueInfo.lat},${venueInfo.lon}`;
  const cityLabel = `${venueInfo.city}, ${venueInfo.region}${venueInfo.country && venueInfo.country !== 'USA' ? `, ${venueInfo.country}` : ''}`;
  const id = buildGameId({
    date: matchup.localGameDate,
    awayCode: matchup.awayCode,
    homeCode: matchup.homeCode,
    fanCode,
    venueInfo,
  });

  const nodes = buildNodes({
    name,
    cityLabel,
    body,
    price: normalizeNonEmpty(template && template.price) || 'Free To Start / In App Purchases',
    teams: suggestions,
    logoUrl: guide.logoUrl,
    tagline,
    guideBio: guide.bio,
    guideName: guide.name,
    guideImageUrl: guide.imageUrl,
    howToPlay,
    startTime: tgbWindow.startTime,
    endTime: tgbWindow.endTime,
    gameDate: tgbWindow.gameDate,
    tertiaryColor: colors.tertiary,
    quaternaryColor: colors.quaternary,
    locationBased: true,
    startingLocation,
    startingLocationLat: venueInfo.lat,
    startingLocationLon: venueInfo.lon,
    emoji: '🏈',
    venueName: venueInfo.name,
    fanShortLabel: fanTeam.shortLabel,
    opponentShortLabel: opponentTeam.shortLabel,
    titleTarget,
  });

  return {
    id,
    name,
    tagline,
    city: cityLabel,
    primary_color: colors.primary,
    secondary_color: colors.secondary,
    tertiary_color: colors.tertiary,
    quaternary_color: colors.quaternary,
    logo_url: guide.logoUrl,
    guide_name: guide.name,
    guide_bio: guide.bio,
    guide_image_url: guide.imageUrl,
    body,
    price: normalizeNonEmpty(template && template.price) || 'Free To Start / In App Purchases',
    default_emoji: '🏈',
    starting_location: startingLocation,
    starting_location_lat: venueInfo.lat,
    starting_location_lon: venueInfo.lon,
    location_based: true,
    fandom_game: true,
    engine: 'text',
    game_date: tgbWindow.gameDate,
    start_time: tgbWindow.startTime,
    end_time: tgbWindow.endTime,
    archived: ARCHIVED_VALUE,
    tags,
    teams: suggestions,
    team01: suggestions[0] || null,
    team02: suggestions[1] || null,
    team03: suggestions[2] || null,
    team04: suggestions[3] || null,
    team05: suggestions[4] || null,
    team06: suggestions[5] || null,
    team07: suggestions[6] || null,
    team08: suggestions[7] || null,
    nodes,
    links: buildLinks(id),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildTags(template, venueInfo, fanTeam) {
  const tags = new Set();
  const templateTags = Array.isArray(template && template.tags) ? template.tags.filter(Boolean) : [];
  for (const tag of templateTags) tags.add(String(tag).trim());
  tags.add('Sports');
  tags.add('NFL');
  tags.add('Football');
  tags.add('Scavenger Hunt');
  tags.add(venueInfo.city);
  tags.add(fanTeam.shortLabel);
  return Array.from(tags).filter(Boolean).slice(0, 8);
}

function buildTeamSuggestions(template, fanTeam, venueInfo) {
  const fromTemplate = Array.isArray(template && template.teams)
    ? template.teams.filter(Boolean).slice(0, 8)
    : [];
  if (fromTemplate.length >= 4) {
    while (fromTemplate.length < 8) fromTemplate.push(`${fanTeam.shortLabel} Road Crew ${fromTemplate.length + 1}`);
    return fromTemplate.slice(0, 8);
  }

  return [
    `${fanTeam.shortLabel} Road Crew`,
    `${fanTeam.shortLabel} Takeover Squad`,
    `${fanTeam.shortLabel} First String`,
    `${fanTeam.shortLabel} Night Shift`,
    `${fanTeam.shortLabel} Final Drive`,
    `${fanTeam.shortLabel} Loudhouse`,
    `${venueInfo.city} Bound`,
    `${fanTeam.shortLabel} Clue Club`,
  ];
}

function buildColors(matchup, fanTeam, template) {
  const fromEspnPrimary = fanTeam.code === matchup.awayCode ? matchup.awayColor : matchup.homeColor;
  const fromEspnSecondary = fanTeam.code === matchup.awayCode ? matchup.awayAltColor : matchup.homeAltColor;
  return {
    primary: normalizeColor(fromEspnPrimary || (template && template.primary_color) || fanTeam.primary),
    secondary: normalizeColor(fromEspnSecondary || (template && template.secondary_color) || fanTeam.secondary),
    tertiary: normalizeColor((template && template.tertiary_color) || fanTeam.tertiary || '#000000'),
    quaternary: normalizeColor((template && template.quaternary_color) || fanTeam.quaternary || '#FFFFFF'),
  };
}

function buildGuide(template, fanTeam) {
  const defaultLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${fanTeam.espnAbbr}.png`;
  return {
    name: normalizeNonEmpty(template && template.guide_name) || 'Mission Control',
    bio: normalizeNonEmpty(template && template.guide_bio) || `Your guide is ready to rally ${fanTeam.shortLabel} fans before kickoff.`,
    imageUrl: normalizeNonEmpty(template && template.guide_image_url)
      || normalizeNonEmpty(template && template.logo_url)
      || defaultLogo,
    logoUrl: normalizeNonEmpty(template && template.logo_url) || defaultLogo,
  };
}

function buildTagline(matchup, fanTeam, venueInfo, fanSide) {
  const patterns = [
    `${fanTeam.shortLabel} fans, take over ${venueInfo.neutral ? venueInfo.city : TEAM_METADATA[matchup.homeCode].shortLabel} before kickoff.`,
    `One night early, ${fanTeam.shortLabel} turns ${venueInfo.neutral ? venueInfo.city : TEAM_METADATA[matchup.homeCode].shortLabel} into a pregame playground.`,
    `${fanTeam.shortLabel} rolls in a day early for a clue-led run through ${venueInfo.city}.`,
    `${fanTeam.shortLabel} gets the city first. Kickoff comes tomorrow.`,
  ];
  const index = Math.abs(hashString(`${matchup.localGameDate}-${fanTeam.code}-${fanSide}`)) % patterns.length;
  return patterns[index];
}

function buildBody(matchup, fanTeam, opponentTeam, venueInfo, fanSide) {
  const localKickoff = getZonedParts(matchup.kickoffUtc, venueInfo.timezone);
  const kickoffLabel = formatReadableLocalKickoff(localKickoff, venueInfo.timezone);
  const neutralText = venueInfo.neutral
    ? `${fanTeam.fullName} fans get their own ${venueInfo.city} takeover the day before the neutral-site matchup with the ${opponentTeam.fullName}.`
    : `${fanTeam.fullName} fans are in town a day early for the road date with the ${opponentTeam.fullName}.`;
  const flavor = [
    `This two-hour route starts near ${venueInfo.name} and turns the surrounding area into your pregame game board.`,
    `Rally your crew, name your squad, and work the city around ${venueInfo.name} before kickoff.`,
    `It is built as a fast pregame warm-up with scavenger-hunt movement, football energy, and plenty of bragging rights.`,
    `Kickoff is ${kickoffLabel}, so this is your chance to own the city first.`,
  ];
  return `${neutralText} ${flavor.join(' ')}`;
}

function buildNodes(config) {
  const suggestionBody = `Here are some suggestions:\n\n-%team01%\n-%team02%\n-%team03%\n-%team04%\n-%team05%\n-%team06%\n-%team07%\n-%team08%`;
  const introBody = `${config.fanShortLabel} fans, you are live in ${config.cityLabel}. This two-hour takeover starts near ${config.venueName} and runs the day before kickoff against ${config.opponentShortLabel}.`;
  return [
    {
      x: 0,
      y: -72,
      id: 'gm-01',
      body: config.body,
      city: config.cityLabel,
      kind: '',
      tags: [],
      type: 'game',
      price: config.price,
      teams: config.teams,
      title: config.name,
      width: 184,
      engine: 'text',
      height: 318,
      team01: config.teams[0] || '',
      team02: config.teams[1] || '',
      team03: config.teams[2] || '',
      team04: config.teams[3] || '',
      team05: config.teams[4] || '',
      team06: config.teams[5] || '',
      team07: config.teams[6] || '',
      team08: config.teams[7] || '',
      anytime: false,
      endTime: config.endTime,
      linkUrl: '',
      logoUrl: config.logoUrl,
      tagline: config.tagline,
      varName: '',
      featured: '',
      gameDate: config.gameDate,
      guideBio: config.guideBio,
      rotation: 0,
      acceptAny: false,
      buttonUrl: '',
      guideName: config.guideName,
      howToPlay: config.howToPlay,
      startTime: config.startTime,
      orderIndex: 100,
      defaultEmoji: config.emoji,
      anytimePairId: '',
      guideImageUrl: config.guideImageUrl,
      locationBased: true,
      tertiaryColor: config.tertiaryColor,
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: config.quaternaryColor,
      startingLocation: config.startingLocation,
      startingLocationLat: config.startingLocationLat,
      startingLocationLon: config.startingLocationLon,
    },
    {
      x: 24,
      y: 252,
      id: 'st-01',
      body: '',
      city: '',
      kind: '',
      tags: [],
      type: 'stop',
      price: '',
      teams: Array(8).fill(''),
      title: 'TEAM NAME',
      width: 236,
      height: 90,
      team01: '',
      team02: '',
      team03: '',
      team04: '',
      team05: '',
      team06: '',
      team07: '',
      team08: '',
      anytime: false,
      endTime: '',
      linkUrl: '',
      logoUrl: '',
      tagline: '',
      varName: '',
      featured: '',
      gameDate: '',
      guideBio: '',
      rotation: 0,
      acceptAny: false,
      buttonUrl: '',
      guideName: '',
      howToPlay: '',
      startTime: '',
      orderIndex: 200,
      defaultEmoji: '',
      anytimePairId: '',
      guideImageUrl: '',
      locationBased: 'NO',
      tertiaryColor: '#000000',
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: '#FFFFFF',
      startingLocation: '',
      startingLocationLat: null,
      startingLocationLon: null,
    },
    {
      x: 24,
      y: 300,
      id: 'gd-01',
      body: introBody,
      city: '',
      kind: 'text',
      tags: [],
      type: 'bubble',
      price: '',
      teams: Array(8).fill(''),
      title: '',
      width: 250,
      height: 92,
      team01: '',
      team02: '',
      team03: '',
      team04: '',
      team05: '',
      team06: '',
      team07: '',
      team08: '',
      anytime: false,
      endTime: '',
      linkUrl: '',
      logoUrl: '',
      tagline: '',
      varName: '',
      featured: '',
      gameDate: '',
      guideBio: '',
      rotation: 0,
      acceptAny: false,
      buttonUrl: '',
      guideName: '',
      howToPlay: '',
      startTime: '',
      orderIndex: 300,
      defaultEmoji: '',
      anytimePairId: '',
      guideImageUrl: '',
      locationBased: 'NO',
      tertiaryColor: '#000000',
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: '#FFFFFF',
      startingLocation: '',
      startingLocationLat: null,
      startingLocationLon: null,
    },
    {
      x: 24,
      y: 384,
      id: 'gd-02',
      body: suggestionBody,
      city: '',
      kind: 'text',
      tags: [],
      type: 'bubble',
      price: '',
      teams: Array(8).fill(''),
      title: '',
      width: 250,
      height: 92,
      team01: '',
      team02: '',
      team03: '',
      team04: '',
      team05: '',
      team06: '',
      team07: '',
      team08: '',
      anytime: false,
      endTime: '',
      linkUrl: '',
      logoUrl: '',
      tagline: '',
      varName: '',
      featured: '',
      gameDate: '',
      guideBio: '',
      rotation: 0,
      acceptAny: false,
      buttonUrl: '',
      guideName: '',
      howToPlay: '',
      startTime: '',
      orderIndex: 400,
      defaultEmoji: '',
      anytimePairId: '',
      guideImageUrl: '',
      locationBased: 'NO',
      tertiaryColor: '#000000',
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: '#FFFFFF',
      startingLocation: '',
      startingLocationLat: null,
      startingLocationLon: null,
    },
    {
      x: 288,
      y: 468,
      id: 'pl-01',
      body: '',
      city: '',
      kind: '',
      tags: [],
      type: 'reply',
      price: '',
      teams: Array(8).fill(''),
      title: '',
      width: 230,
      height: 88,
      team01: '',
      team02: '',
      team03: '',
      team04: '',
      team05: '',
      team06: '',
      team07: '',
      team08: '',
      anytime: false,
      endTime: '',
      linkUrl: '',
      logoUrl: '',
      tagline: '',
      varName: 'team',
      featured: '',
      gameDate: '',
      guideBio: '',
      rotation: 0,
      acceptAny: true,
      buttonUrl: '',
      guideName: '',
      howToPlay: '',
      startTime: '',
      orderIndex: 500,
      defaultEmoji: '',
      anytimePairId: '',
      guideImageUrl: '',
      locationBased: 'NO',
      tertiaryColor: '#000000',
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: '#FFFFFF',
      startingLocation: '',
      startingLocationLat: null,
      startingLocationLon: null,
    },
    {
      x: 24,
      y: 576,
      id: 'gd-03',
      body: `All right %team%! ${config.fanShortLabel} takes over ${config.titleTarget} now.`,
      city: '',
      kind: 'text',
      tags: [],
      type: 'bubble',
      price: '',
      teams: Array(8).fill(''),
      title: '',
      width: 250,
      height: 92,
      team01: '',
      team02: '',
      team03: '',
      team04: '',
      team05: '',
      team06: '',
      team07: '',
      team08: '',
      anytime: false,
      endTime: '',
      linkUrl: '',
      logoUrl: '',
      tagline: '',
      varName: '',
      featured: '',
      gameDate: '',
      guideBio: '',
      rotation: 0,
      acceptAny: false,
      buttonUrl: '',
      guideName: '',
      howToPlay: '',
      startTime: '',
      orderIndex: 600,
      defaultEmoji: '',
      anytimePairId: '',
      guideImageUrl: '',
      locationBased: 'NO',
      tertiaryColor: '#000000',
      stopGroup: '',
      answerResponses: [],
      quaternaryColor: '#FFFFFF',
      startingLocation: '',
      startingLocationLat: null,
      startingLocationLon: null,
    },
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

function buildGameId({ date, awayCode, homeCode, fanCode, venueInfo }) {
  const venuePart = slugify(venueInfo.neutral ? venueInfo.city : TEAM_METADATA[homeCode].shortLabel);
  return `nfl${SEASON}-${date.replace(/-/g, '')}-${awayCode.toLowerCase()}-${homeCode.toLowerCase()}-${fanCode.toLowerCase()}-${venuePart}`;
}

function buildTgbWindow(localKickoffParts) {
  const base = new Date(Date.UTC(
    Number(localKickoffParts.year),
    Number(localKickoffParts.month) - 1,
    Number(localKickoffParts.day),
    Number(localKickoffParts.hour),
    Number(localKickoffParts.minute),
    0
  ));
  base.setUTCDate(base.getUTCDate() - 1);
  const end = new Date(base.getTime() + TWO_HOURS_MS);
  return {
    gameDate: `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`,
    startTime: `${pad2(base.getUTCHours())}:${pad2(base.getUTCMinutes())}:00`,
    endTime: `${pad2(end.getUTCHours())}:${pad2(end.getUTCMinutes())}:00`,
  };
}

function resolveVenueInfo(input) {
  const explicitVenue = input && input.venueName ? VENUE_ALIAS_LOOKUP[normalizeVenueName(input.venueName)] : null;
  if (explicitVenue) return explicitVenue;

  if (input && input.homeCode && TEAM_METADATA[input.homeCode]) {
    const fallback = VENUE_OVERRIDES[TEAM_METADATA[input.homeCode].homeVenue];
    if (fallback) return fallback;
  }

  return {
    name: input && input.venueName ? String(input.venueName) : 'Unknown Venue',
    city: input && input.venueCity ? String(input.venueCity) : 'Unknown City',
    region: input && input.venueState ? String(input.venueState) : '',
    country: input && input.venueCountry ? String(input.venueCountry) : 'USA',
    lat: 0,
    lon: 0,
    timezone: 'America/New_York',
    neutral: !!(input && input.neutralSite),
  };
}

function venueMatchesTeamHomeVenue(venueName, teamCode) {
  if (!venueName || !teamCode || !TEAM_METADATA[teamCode]) return false;
  return normalizeVenueName(venueName) === normalizeVenueName(TEAM_METADATA[teamCode].homeVenue);
}

function matchupKey(row) {
  if (!row || !row.awayCode || !row.homeCode || !row.localGameDate) return '';
  return `${row.localGameDate}|${row.awayCode}|${row.homeCode}`;
}

function dedupeMatchups(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = matchupKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function mergeObjectsPreservingDefined(primary, secondary) {
  const merged = { ...secondary, ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value;
      }
    }
  }
  return merged;
}

async function insertGames(rows) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/games`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`Supabase insert failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    if (options.tolerateNotFound && response.status === 404) return null;
    throw new Error(`Request failed for ${url}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function fetchJsonWithRetry(url, { attempts = 4, minEvents = 100, delayMs = 800 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchJson(url);
    const count = last && Array.isArray(last.events) ? last.events.length : 0;
    if (count >= minEvents) return last;
    console.log(`[retry] ESPN returned ${count} events on attempt ${i + 1}/${attempts}; retrying in ${delayMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    if (options.tolerateNotFound && response.status === 404) return '';
    throw new Error(`Request failed for ${url}: ${response.status} ${await response.text()}`);
  }
  return response.text();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  const named = {
    amp: '&',
    apos: "'",
    quot: '"',
    nbsp: ' ',
    lt: '<',
    gt: '>',
  };
  return String(text || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, value) => {
    if (value[0] === '#') {
      const isHex = value[1] === 'x' || value[1] === 'X';
      const num = parseInt(value.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    }
    return Object.prototype.hasOwnProperty.call(named, value) ? named[value] : _;
  });
}

function etDateToUtc(year, month, day, time, meridiem, etZone) {
  const [hh, mm] = String(time).split(':').map(Number);
  let hour = hh % 12;
  if (String(meridiem).toUpperCase() === 'PM') hour += 12;
  const offsetHours = String(etZone).toUpperCase() === 'EDT' ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, hour + offsetHours, mm, 0)).toISOString();
}

function getZonedParts(isoString, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(isoString));
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function formatDateParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseLongDate(dateText) {
  const parsed = new Date(`${dateText} UTC`);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

function formatReadableLocalKickoff(parts, timezone) {
  const date = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    0
  ));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date) + ` local (${timezone})`;
}

function normalizeEspnTeamCode(code) {
  if (!code) return '';
  const upper = String(code).toUpperCase();
  return upper === 'WSH' ? 'WSH' : upper;
}

function homeAwayColor(value, fallback) {
  if (!value) return fallback;
  return `#${String(value).replace(/^#/, '')}`;
}

function homeAwayLogo(value, espnAbbr) {
  return value || `https://a.espncdn.com/i/teamlogos/nfl/500/${espnAbbr}.png`;
}

function normalizeColor(value) {
  if (!value) return '#FFFFFF';
  const raw = String(value).trim();
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function normalizeVenueName(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/\s*\(Old\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeNonEmpty(value) {
  const text = value == null ? '' : String(value).trim();
  return text || '';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashString(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
