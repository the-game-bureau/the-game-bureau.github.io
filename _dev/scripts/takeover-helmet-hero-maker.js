#!/usr/bin/env node
// Generates a helmet hero PNG (large away helmet + small home helmet) for every
// NFL Takeover game whose name explicitly mentions the home team. Skips
// neutral-site games whose name uses a city (London, Mexico City, etc.) instead
// of a team short label, except for custom one-off neutral visuals below.
//
// Files are written to site/assets/games/takeover-hero/{game-id}.png and each game's
// logo_url is patched in Supabase to the new URL.
//
// Usage:
//   node _dev/scripts/takeover-helmet-hero-maker.js           # generate + update DB
//   node _dev/scripts/takeover-helmet-hero-maker.js --dry-run # generate, no DB write
//   node _dev/scripts/takeover-helmet-hero-maker.js --only=<game-id>

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { helmetSVGString } = require('../../site/assets/games/helmets/helmet.js');

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const USER_AGENT = 'TGB Takeover Hero Maker/1.0';

const ASSET_DIR = path.resolve(__dirname, '..', '..', 'site', 'assets', 'games', 'takeover-hero');
// Domain-relative URL: resolves to localhost during local dev and to
// thegamebureau.com in production -- one stored value, works in both contexts.
const ASSET_URL_BASE = '/site/assets/games/takeover-hero';

const SPECIAL_HEROES = {
  'nfl2026-20261025-pit-no-no-saint-denis': {
    fanCode: 'NO',
    composer: 'helmet-eiffel',
  },
};

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_ARG = process.argv.find((arg) => arg.startsWith('--only='));
const ONLY_ID = ONLY_ARG ? ONLY_ARG.slice('--only='.length) : null;

// Hero PNG is consumed by .hero in game/run/index.html and library cards via
// object-fit:cover. 1200x800 (1.5:1) keeps cropping minimal. Helmets are
// centered as a pair with a clear visible gap between facemasks.
//
// Background is a medium gray rather than near-black so both helmet halves
// stay visible -- many teams have black stripes/shells (Raiders, Saints, etc.)
// which disappeared on dark; many have white facemasks which disappeared on
// light. Medium gray contrasts both.
const HERO_W = 1200;
const HERO_H = 800;
const BG_RGB = [0x55, 0x55, 0x58];

// Large helmet (away/fan): 16 * 38 = 608, faces right
const LARGE_SCALE = 38;
const LARGE_OX = 75;
const LARGE_OY = 96;

// Small helmet (home): 16 * 24 = 384, mirrored to face left. Positioned so
// there is a ~120px visible gap between the helmets' facemask fronts at the
// image's horizontal center. Vertically aligned by bounding-box center.
const SMALL_SCALE = 24;
const SMALL_OX = 741;
const SMALL_OY = 208;

const TEAM_METADATA = {
  ARI: { shortLabel: 'Arizona',       primary: '#97233F', secondary: '#FFB612', tertiary: '#002868' },
  ATL: { shortLabel: 'Atlanta',       primary: '#A71930', secondary: '#000000', tertiary: '#A5ACAF' },
  BAL: { shortLabel: 'Baltimore',     primary: '#241773', secondary: '#000000', tertiary: '#9E7C0C' },
  BUF: { shortLabel: 'Buffalo',       primary: '#00338D', secondary: '#C60C30', tertiary: '#FFFFFF' },
  CAR: { shortLabel: 'Carolina',      primary: '#0085CA', secondary: '#101820', tertiary: '#BFC0BF' },
  CHI: { shortLabel: 'Chicago',       primary: '#0B162A', secondary: '#C83803', tertiary: '#FFFFFF' },
  CIN: { shortLabel: 'Cincinnati',    primary: '#FB4F14', secondary: '#000000', tertiary: '#FFFFFF' },
  CLE: { shortLabel: 'Cleveland',     primary: '#311D00', secondary: '#FF3C00', tertiary: '#FFFFFF' },
  DAL: { shortLabel: 'Dallas',        primary: '#869397', secondary: '#041E42', tertiary: '#FFFFFF' },
  DEN: { shortLabel: 'Denver',        primary: '#FB4F14', secondary: '#002244', tertiary: '#FFFFFF' },
  DET: { shortLabel: 'Detroit',       primary: '#0076B6', secondary: '#B0B7BC', tertiary: '#000000' },
  GB:  { shortLabel: 'Green Bay',     primary: '#203731', secondary: '#FFB612', tertiary: '#FFFFFF' },
  HOU: { shortLabel: 'Houston',       primary: '#03202F', secondary: '#A71930', tertiary: '#FFFFFF' },
  IND: { shortLabel: 'Indianapolis',  primary: '#002C5F', secondary: '#A2AAAD', tertiary: '#FFFFFF' },
  JAX: { shortLabel: 'Jacksonville',  primary: '#006778', secondary: '#9F792C', tertiary: '#101820' },
  KC:  { shortLabel: 'Kansas City',   primary: '#E31837', secondary: '#FFB81C', tertiary: '#FFFFFF' },
  LV:  { shortLabel: 'Las Vegas',     primary: '#000000', secondary: '#A5ACAF', tertiary: '#FFFFFF' },
  LAC: { shortLabel: 'Los Angeles',   primary: '#0080C6', secondary: '#FFC20E', tertiary: '#FFFFFF' },
  LAR: { shortLabel: 'Los Angeles',   primary: '#003594', secondary: '#FFD100', tertiary: '#FFFFFF' },
  MIA: { shortLabel: 'Miami',         primary: '#008E97', secondary: '#FC4C02', tertiary: '#005778' },
  MIN: { shortLabel: 'Minnesota',     primary: '#4F2683', secondary: '#FFC62F', tertiary: '#FFFFFF' },
  NE:  { shortLabel: 'New England',   primary: '#002244', secondary: '#C60C30', tertiary: '#B0B7BC' },
  NO:  { shortLabel: 'New Orleans',   primary: '#D3BC8D', secondary: '#101820', tertiary: '#FFFFFF' },
  NYG: { shortLabel: 'New York',      primary: '#0B2265', secondary: '#A71930', tertiary: '#FFFFFF' },
  NYJ: { shortLabel: 'New York',      primary: '#125740', secondary: '#000000', tertiary: '#FFFFFF' },
  PHI: { shortLabel: 'Philadelphia',  primary: '#004C54', secondary: '#A5ACAF', tertiary: '#FFFFFF' },
  PIT: { shortLabel: 'Pittsburgh',    primary: '#FFB612', secondary: '#101820', tertiary: '#FFFFFF' },
  SF:  { shortLabel: 'San Francisco', primary: '#AA0000', secondary: '#B3995D', tertiary: '#FFFFFF' },
  SEA: { shortLabel: 'Seattle',       primary: '#002244', secondary: '#69BE28', tertiary: '#A5ACAF' },
  TB:  { shortLabel: 'Tampa Bay',     primary: '#D50A0A', secondary: '#FF7900', tertiary: '#34302B' },
  TEN: { shortLabel: 'Tennessee',     primary: '#0C2340', secondary: '#4B92DB', tertiary: '#C8102E' },
  WSH: { shortLabel: 'Washington',    primary: '#5A1414', secondary: '#FFB612', tertiary: '#FFFFFF' },
};

const HELMET_GRID = parseHelmetGrid();

async function main() {
  console.log(`Takeover helmet hero maker${DRY_RUN ? ' [dry-run]' : ''}`);

  fs.mkdirSync(ASSET_DIR, { recursive: true });

  const games = await fetchTakeoverGames();
  console.log(`Found ${games.length} Takeover game(s)`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const game of games) {
    if (ONLY_ID && game.id !== ONLY_ID) continue;
    try {
      const parsed = SPECIAL_HEROES[game.id] || parseGame(game);
      if (!parsed) {
        console.log(`  skip: ${game.name} (no home team in name)`);
        skipped++;
        continue;
      }
      const png = composeGameHero(game, parsed);

      const filename = `${game.id}.png`;
      const filepath = path.join(ASSET_DIR, filename);
      const newUrl = `${ASSET_URL_BASE}/${filename}`;

      fs.writeFileSync(filepath, png);
      if (DRY_RUN) {
        console.log(`  dry: ${game.name} -> ${filename} (${png.length} bytes)`);
      } else {
        await patchGameLogo(game.id, newUrl);
        console.log(`  ok:  ${game.name} -> ${filename}`);
      }
      processed++;
    } catch (error) {
      console.error(`  err: ${game.id} ${game.name} -- ${error.message}`);
      errors++;
    }
  }

  console.log(`Processed: ${processed}  Skipped: ${skipped}  Errors: ${errors}`);
}

async function fetchTakeoverGames() {
  // Fetch all takeover games so older flag/photo/mascot art can be normalized
  // to the current helmet hero treatment too. parseGame still limits normal
  // generation to NFL-team-vs-NFL-team titles.
  const url = `${SUPABASE_URL}/rest/v1/games?name=ilike.*Takeover*&select=id,name,logo_url,primary_color,secondary_color,tertiary_color&order=name.asc`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase fetch failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function composeGameHero(game, parsed) {
  if (parsed.composer === 'helmet-eiffel') {
    return composeHelmetEiffelHero(resolveColors(game, parsed.fanCode));
  }

  const { awayCode, homeCode } = parsed;
  const awayColors = resolveColors(game, awayCode);
  const homeColors = resolveColors(null, homeCode);
  return composeHero(awayColors, homeColors);
}

async function patchGameLogo(gameId, logoUrl) {
  const url = `${SUPABASE_URL}/rest/v1/games?id=eq.${encodeURIComponent(gameId)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ logo_url: logoUrl }),
  });
  if (!response.ok) {
    throw new Error(`Supabase patch failed: ${response.status} ${await response.text()}`);
  }
}

function parseGame(game) {
  const idMatch = String(game.id || '').match(/^nfl\d{4}-\d{8}-([a-z]+)-([a-z]+)-[a-z]+-(.+)$/);
  if (idMatch) {
    const awayCode = normalizeTeamCode(idMatch[1].toUpperCase());
    const homeCode = normalizeTeamCode(idMatch[2].toUpperCase());
    if (!TEAM_METADATA[awayCode] || !TEAM_METADATA[homeCode]) return null;
    const titleTarget = extractTitleTarget(game.name);
    if (!titleTarget) return null;
    if (titleTarget.toLowerCase() !== TEAM_METADATA[homeCode].shortLabel.toLowerCase()) return null;
    return { awayCode, homeCode };
  }
  // Fallback: parse the name only.
  const nameMatch = String(game.name || '').match(/^(.+?) Fans Takeover (.+)$/i);
  if (!nameMatch) return null;
  const fanCodes = labelToCodes(nameMatch[1]);
  const homeCodes = labelToCodes(nameMatch[2]);
  if (fanCodes.length !== 1 || homeCodes.length !== 1) return null;
  return { awayCode: fanCodes[0], homeCode: homeCodes[0] };
}

function extractTitleTarget(name) {
  const match = String(name || '').match(/Fans Takeover (.+)$/i);
  return match ? match[1].trim() : '';
}

function labelToCodes(label) {
  const norm = String(label || '').trim().toLowerCase();
  if (!norm) return [];
  return Object.entries(TEAM_METADATA)
    .filter(([, meta]) => meta.shortLabel.toLowerCase() === norm)
    .map(([code]) => code);
}

function normalizeTeamCode(code) {
  // ESPN sometimes uses WSH/WAS interchangeably; this script uses WSH.
  if (code === 'WAS') return 'WSH';
  return code;
}

function resolveColors(game, code) {
  const meta = TEAM_METADATA[code] || {};
  const primary = pickColor(game && game.primary_color, meta.primary, '#000000');
  const secondary = pickColor(game && game.secondary_color, meta.secondary, '#ffffff');
  let tertiary = pickColor(game && game.tertiary_color, meta.tertiary, '#aaaaaa');
  if (expand(tertiary) === '#000000') tertiary = '#ffffff'; // helmet.js black-mask swap
  return { primary, secondary, tertiary };
}

function pickColor(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = String(candidate).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return expand(value);
  }
  return '#000000';
}

function expand(hex) {
  let value = String(hex || '').replace('#', '').toLowerCase();
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (value.length === 8) value = value.slice(0, 6);
  if (value.length !== 6) value = '000000';
  return '#' + value;
}

function composeHero(awayColors, homeColors) {
  const buf = Buffer.alloc(HERO_W * HERO_H * 3);
  for (let i = 0; i < HERO_W * HERO_H; i++) {
    buf[i * 3] = BG_RGB[0];
    buf[i * 3 + 1] = BG_RGB[1];
    buf[i * 3 + 2] = BG_RGB[2];
  }
  // Draw home (small) first, then away (large) on top so the larger helmet wins
  // the overlap zone -- reads as "fan team in front, opponent behind".
  drawHelmet(buf, HERO_W, HERO_H, homeColors, SMALL_OX, SMALL_OY, SMALL_SCALE, true);
  drawHelmet(buf, HERO_W, HERO_H, awayColors, LARGE_OX, LARGE_OY, LARGE_SCALE, false);
  return encodePNG(HERO_W, HERO_H, buf);
}

function composeHelmetEiffelHero(fanColors) {
  const bg = [0x52, 0x51, 0x4c];
  const buf = Buffer.alloc(HERO_W * HERO_H * 3);
  for (let i = 0; i < HERO_W * HERO_H; i++) {
    const x = i % HERO_W;
    const y = Math.floor(i / HERO_W);
    const glow = Math.max(0, 1 - Math.hypot((x - 840) / 640, (y - 350) / 520));
    buf[i * 3] = clampByte(bg[0] + glow * 22);
    buf[i * 3 + 1] = clampByte(bg[1] + glow * 18);
    buf[i * 3 + 2] = clampByte(bg[2] + glow * 8);
  }

  drawPixelGrid(buf, HERO_W, HERO_H, [
    '00000000200000000',
    '00000002220000000',
    '00000000200000000',
    '00000001110000000',
    '00000001110000000',
    '00000001110000000',
    '00000001110000000',
    '00000001110000000',
    '00000001110000000',
    '00000001110000000',
    '00022222222220000',
    '00000001110000000',
    '00000001110000000',
    '00000011111000000',
    '00000111011100000',
    '00001110001110000',
    '00011100000111000',
    '00022222222222000',
    '00011100000111000',
    '00111000000011100',
    '00110000000001100',
    '01110000000001110',
    '01100000000000110',
    '11100000000000111',
    '11000000000000011',
  ], 750, 92, 18, {
    '1': '#90918a',
    '2': '#2c2c25',
  });

  drawHelmet(buf, HERO_W, HERO_H, fanColors, 88, 126, 35, false);
  return encodePNG(HERO_W, HERO_H, buf);
}

function drawPixelGrid(buf, stride, height, rows, ox, oy, scale, palette) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const color = palette[line[col]];
      if (!color) continue;
      drawPixelRect(buf, stride, height, ox + col * scale, oy + row * scale, scale, scale, color);
    }
  }
}

function drawPixelRect(buf, stride, height, x, y, w, h, color) {
  const rgb = hexToRgb(color);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(stride, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const off = (py * stride + px) * 3;
      buf[off] = rgb[0];
      buf[off + 1] = rgb[1];
      buf[off + 2] = rgb[2];
    }
  }
}

function drawBlockLine(buf, stride, height, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(4, thickness * 0.55)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    drawPixelRect(buf, stride, height, x - thickness / 2, y - thickness / 2, thickness, thickness, color);
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function drawHelmet(buf, stride, height, colors, ox, oy, scale, mirror) {
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const code = HELMET_GRID[row][col];
      let color;
      if (code === 'S') color = colors.primary;
      else if (code === 'K') color = colors.secondary;
      else if (code === 'M') color = colors.tertiary;
      else if (code === 'W') color = '#ffffff';
      else continue; // 'O' or null: background shows through
      const rgb = hexToRgb(color);
      const cx = mirror ? 15 - col : col;
      for (let dy = 0; dy < scale; dy++) {
        const py = oy + row * scale + dy;
        if (py < 0 || py >= height) continue;
        for (let dx = 0; dx < scale; dx++) {
          const px = ox + cx * scale + dx;
          if (px < 0 || px >= stride) continue;
          const off = (py * stride + px) * 3;
          buf[off] = rgb[0];
          buf[off + 1] = rgb[1];
          buf[off + 2] = rgb[2];
        }
      }
    }
  }
}

function hexToRgb(hex) {
  const value = expand(hex).slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function parseHelmetGrid() {
  const PRIMARY = '#a1b2c3';
  const SECONDARY = '#d4e5f6';
  const TERTIARY = '#234567';
  const svg = helmetSVGString(PRIMARY, SECONDARY, TERTIARY);
  const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  const rectRe = /<rect x="(\d+)" y="(\d+)" width="\d+" height="\d+" fill="([^"]+)"\/>/g;
  let match;
  while ((match = rectRe.exec(svg)) !== null) {
    const col = Number(match[1]) / 25;
    const row = Number(match[2]) / 25;
    const fill = match[3].toLowerCase();
    if (!Number.isInteger(col) || !Number.isInteger(row)) continue;
    if (col < 0 || col >= 16 || row < 0 || row >= 16) continue;
    let code = 'O';
    if (fill === PRIMARY) code = 'S';
    else if (fill === SECONDARY) code = 'K';
    else if (fill === TERTIARY) code = 'M';
    else if (fill === '#ffffff') code = 'W';
    grid[row][col] = code;
  }
  return grid;
}

// Minimal PNG encoder (RGB, 8-bit, filter 0).
function encodePNG(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0;
    rgb.copy(raw, (stride + 1) * y + 1, stride * y, stride * (y + 1));
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
