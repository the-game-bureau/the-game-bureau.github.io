#!/usr/bin/env node
// Generates supabase/migrations/seed_teams.sql from mc/data/teams.json.
// Run: node supabase/migrations/seed_teams_from_json.mjs
// Then paste the produced SQL into the Supabase SQL editor.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_PATH = resolve(ROOT, 'mc', 'data', 'teams.json');
const OUT_PATH  = resolve(ROOT, 'supabase', 'migrations', 'seed_teams.sql');

// NFL pinned first; other leagues alphabetical. Matches the editor / index ordering.
const LEAGUE_RANK = (name) => (name === 'NFL' ? 0 : 100);

function isTeamObj(value) {
  return !!value && typeof value === 'object' && (
    'fullName' in value || 'primary' in value || 'shell' in value
  );
}

function sqlText(value) {
  if (value === null || value === undefined) return "''";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function row({ league, conference, code, team, leagueSort, teamSort }) {
  const cols = [
    sqlText(league),
    sqlText(conference || ''),
    sqlText(code),
    sqlText(team.fullName || ''),
    sqlText(team.firstName || ''),
    sqlText(team.fanbase || ''),
    sqlText(team.mascot || ''),
    sqlText(team.sport || ''),
    sqlText(team.primary || team.primary_color || team.shell || ''),
    sqlText(team.secondary || team.secondary_color || team.stripe || ''),
    sqlText(team.tertiary || team.tertiary_color || team.mask || ''),
    String(leagueSort),
    String(teamSort)
  ];
  return '  (' + cols.join(', ') + ')';
}

function teamFromDbRow(source) {
  return {
    fullName: source.fullName || source.full_name || [source.GeoName, source.MascotName].filter(Boolean).join(' ') || '',
    firstName: source.firstName || source.first_name || source.GeoName || '',
    fanbase: source.fanbase || source.firstName || source.first_name || source.GeoName || '',
    mascot: source.mascot || source.MascotName || '',
    sport: source.sport || '',
    primary: source.primary || source.primary_color || source.shell || '',
    secondary: source.secondary || source.secondary_color || source.stripe || '',
    tertiary: source.tertiary || source.tertiary_color || source.mask || ''
  };
}

async function main() {
  const doc = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  if (Array.isArray(doc?.teams)) {
    const rows = [];
    const leagueOrder = new Map();
    const teamOrder = new Map();
    doc.teams.forEach((source) => {
      const league = source.League || source.league || '';
      const code = source.code || source.Code || source.EspnId || '';
      if (!league || !code) return;
      if (!leagueOrder.has(league)) leagueOrder.set(league, leagueOrder.size);
      const nextTeamSort = teamOrder.get(league) || 0;
      teamOrder.set(league, nextTeamSort + 1);
      const leagueSort = leagueOrder.get(league);
      rows.push(row({
        league,
        conference: source.conference || source.Conference || '',
        code,
        team: teamFromDbRow(source),
        leagueSort,
        teamSort: nextTeamSort
      }));
    });

    const sql = [
      '-- Generated from mc/data/teams.json by seed_teams_from_json.mjs',
      `-- ${rows.length} rows · ${leagueOrder.size} leagues`,
      '-- Safe to re-run: uses ON CONFLICT DO UPDATE.',
      '',
      'insert into public.teams',
      '  (league, conference, code, full_name, first_name, fanbase, mascot, sport, shell, stripe, mask, league_sort, team_sort)',
      'values',
      rows.join(',\n'),
      'on conflict (league, conference, code) do update set',
      '  full_name   = excluded.full_name,',
      '  first_name  = excluded.first_name,',
      '  fanbase     = excluded.fanbase,',
      '  mascot      = excluded.mascot,',
      '  sport       = excluded.sport,',
      '  shell       = excluded.shell,',
      '  stripe      = excluded.stripe,',
      '  mask        = excluded.mask,',
      '  league_sort = excluded.league_sort,',
      '  team_sort   = excluded.team_sort;',
      ''
    ].join('\n');

    await writeFile(OUT_PATH, sql, 'utf8');
    console.log(`Wrote ${OUT_PATH} (${rows.length} rows).`);
    return;
  }

  const leagues = doc?.leagues || {};
  const leagueNames = Object.keys(leagues).sort((a, b) => {
    const ra = LEAGUE_RANK(a);
    const rb = LEAGUE_RANK(b);
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });

  const rows = [];
  leagueNames.forEach((league, leagueIdx) => {
    const leagueSort = leagueIdx;
    const node = leagues[league];
    let teamSort = 0;
    // Flat teams first, in JSON order.
    for (const code of Object.keys(node)) {
      if (!isTeamObj(node[code])) continue;
      rows.push(row({ league, conference: '', code, team: node[code], leagueSort, teamSort }));
      teamSort++;
    }
    // Then each conference (nested group).
    for (const conferenceName of Object.keys(node)) {
      const group = node[conferenceName];
      if (isTeamObj(group) || !group || typeof group !== 'object') continue;
      for (const code of Object.keys(group)) {
        if (!isTeamObj(group[code])) continue;
        rows.push(row({
          league, conference: conferenceName, code, team: group[code], leagueSort, teamSort
        }));
        teamSort++;
      }
    }
  });

  const sql = [
    '-- Generated from mc/data/teams.json by seed_teams_from_json.mjs',
    `-- ${rows.length} rows · ${leagueNames.length} leagues`,
    '-- Safe to re-run: uses ON CONFLICT DO UPDATE.',
    '',
    'insert into public.teams',
    '  (league, conference, code, full_name, first_name, fanbase, mascot, sport, shell, stripe, mask, league_sort, team_sort)',
    'values',
    rows.join(',\n'),
    'on conflict (league, conference, code) do update set',
    '  full_name   = excluded.full_name,',
    '  first_name  = excluded.first_name,',
    '  fanbase     = excluded.fanbase,',
    '  mascot      = excluded.mascot,',
    '  sport       = excluded.sport,',
    '  shell       = excluded.shell,',
    '  stripe      = excluded.stripe,',
    '  mask        = excluded.mask,',
    '  league_sort = excluded.league_sort,',
    '  team_sort   = excluded.team_sort;',
    ''
  ].join('\n');

  await writeFile(OUT_PATH, sql, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${rows.length} rows).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
