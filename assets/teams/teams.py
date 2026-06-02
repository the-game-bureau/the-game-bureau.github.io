#!/usr/bin/env python3
"""
teams.py — look up a team's colors and update db/teams.json.

Run:
    python teams.py

Prompts for sport/league and a team name (any of full name, mascot,
location, or abbreviation), looks the team up via ESPN's public team
API, and writes the resulting palette into db/teams.json.

ESPN exposes two colors per team (primary + alternate). Tertiary defaults
to #FFFFFF; edit db/teams.json by hand if you need custom values.
"""
import json
import re
import sys
import urllib.error
import urllib.request
from difflib import get_close_matches
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
JSON_PATH = REPO_ROOT / 'db' / 'teams.json'
HEX_RE = re.compile(r'^#?([0-9A-Fa-f]{6})$')
ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/{path}/teams?limit=900'

LEAGUE_PATHS = {
    'NFL': 'football/nfl',
    'NCAAF': 'football/college-football',
    'CFB': 'football/college-football',
    'NBA': 'basketball/nba',
    'WNBA': 'basketball/wnba',
    'NCAAM': 'basketball/mens-college-basketball',
    'NCAAW': 'basketball/womens-college-basketball',
    'MLB': 'baseball/mlb',
    'NHL': 'hockey/nhl',
    'MLS': 'soccer/usa.1',
    'EPL': 'soccer/eng.1',
    'PREMIER LEAGUE': 'soccer/eng.1',
    'BUNDESLIGA': 'soccer/ger.1',
    'LA LIGA': 'soccer/esp.1',
    'SERIE A': 'soccer/ita.1',
    'LIGUE 1': 'soccer/fra.1',
}


def ask(prompt, *, default=None, required=True):
    suffix = f' [{default}]' if default else ''
    while True:
        value = input(f'{prompt}{suffix}: ').strip()
        if not value and default is not None:
            return default
        if value or not required:
            return value
        print('  (required)')


def fetch_teams(league_path):
    url = ESPN_URL.format(path=league_path)
    req = urllib.request.Request(url, headers={'User-Agent': 'TGB add_colors/1.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    teams = []
    for sport in data.get('sports') or []:
        for league in sport.get('leagues') or []:
            for entry in league.get('teams') or []:
                team = entry.get('team') or entry
                if team:
                    teams.append(team)
    return teams


def match_team(teams, query):
    q = query.lower().strip()
    fields = ('displayName', 'name', 'shortDisplayName',
              'abbreviation', 'nickname', 'location')
    exact = [t for t in teams if any((t.get(f) or '').lower() == q for f in fields)]
    if exact:
        return exact
    contains = [t for t in teams if any(q in (t.get(f) or '').lower() for f in fields)]
    if contains:
        return contains
    names = [t.get('displayName') or '' for t in teams]
    close_names = set(get_close_matches(query, names, n=5, cutoff=0.5))
    return [t for t in teams if (t.get('displayName') or '') in close_names]


def select_team(matches):
    if len(matches) == 1:
        return matches[0]
    print(f'\n{len(matches)} possible matches:')
    for i, t in enumerate(matches, 1):
        print(f'  {i}. {t.get("displayName")} ({t.get("abbreviation") or "?"})')
    while True:
        choice = input(f'Pick 1–{len(matches)} (blank to cancel): ').strip()
        if not choice:
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(matches):
            return matches[int(choice) - 1]
        print('  invalid pick')


def normalize_hex(value, *, default):
    if not value:
        return default
    raw = value.strip()
    candidate = raw if raw.startswith('#') else '#' + raw
    match = HEX_RE.match(candidate)
    return '#' + match.group(1).upper() if match else default


def load_doc():
    if not JSON_PATH.exists():
        return {
            '_comment': 'Team color palettes by sport/league.',
            'leagues': {}
        }
    with JSON_PATH.open('r', encoding='utf-8') as f:
        doc = json.load(f)
    if isinstance(doc.get('teams'), list):
        return doc
    if 'leagues' not in doc:
        legacy_league = doc.get('league')
        legacy_teams = doc.get('teams', {}) or {}
        migrated = {
            '_comment': doc.get('_comment', 'Team color palettes by sport/league.'),
            'leagues': {}
        }
        if legacy_league and legacy_teams:
            migrated['leagues'][legacy_league] = legacy_teams
        doc = migrated
    return doc


def save_doc(doc):
    with JSON_PATH.open('w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write('\n')


def update_db_team(doc, league, abbreviation, display_name, first_name, mascot, primary, secondary, tertiary, espn_id):
    rows = doc.get('teams')
    if not isinstance(rows, list):
        return False
    league = league.upper()
    espn_id = str(espn_id or '').strip()
    mascot_key = mascot.lower().strip()
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get('League', '')).upper() != league:
            continue
        row_espn_id = str(row.get('EspnId', '')).strip()
        row_mascot = str(row.get('MascotName') or row.get('mascot') or '').lower().strip()
        if (espn_id and row_espn_id == espn_id) or (mascot_key and row_mascot == mascot_key):
            row['code'] = abbreviation
            row['fullName'] = display_name
            row['firstName'] = first_name
            row['fanbase'] = row.get('fanbase') or first_name
            row['mascot'] = mascot
            row['sport'] = row.get('sport') or {
                'NFL': 'football',
                'NBA': 'basketball',
                'NHL': 'hockey',
                'MLB': 'baseball'
            }.get(league, '')
            row['primary'] = primary
            row['secondary'] = secondary
            row['tertiary'] = tertiary
            row.pop('shell', None)
            row.pop('stripe', None)
            row.pop('mask', None)
            row['paletteSource'] = 'espn'
            return True
    return False


def main():
    print(f'add_colors → {JSON_PATH}')
    league_input = ask('Sport / league (NFL, NBA, MLB, NHL, NCAAF, NCAAM, MLS, EPL, ...)').upper()
    league_path = LEAGUE_PATHS.get(league_input)
    if not league_path:
        print(f'Unknown league: {league_input!r}')
        print('Known:', ', '.join(sorted(LEAGUE_PATHS)))
        return 1

    team_query = ask('Team name (full name, mascot, city, or abbreviation)')

    print(f'Looking up "{team_query}" in {league_input}…')
    try:
        teams = fetch_teams(league_path)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        print(f'Fetch failed: {exc}')
        return 1
    if not teams:
        print('ESPN returned no teams for that league.')
        return 1

    matches = match_team(teams, team_query)
    if not matches:
        print(f'No teams matched "{team_query}" in {league_input}.')
        return 1

    team = select_team(matches)
    if not team:
        print('Cancelled.')
        return 1

    abbreviation = (team.get('abbreviation') or '').upper()
    if not abbreviation:
        abbreviation = ask('Team code (ESPN had none)').upper()

    display_name = team.get('displayName') or team.get('name') or team_query
    first_name = team.get('location') or display_name.rsplit(' ', 1)[0]
    fanbase = first_name
    mascot = team.get('name') or team.get('nickname') or display_name.rsplit(' ', 1)[-1]

    primary = normalize_hex(team.get('color'), default='#000000')
    secondary = normalize_hex(team.get('alternateColor'), default='#FFFFFF')
    tertiary = '#FFFFFF'

    print(f'\nMatched: {display_name} ({abbreviation})')
    print(f'  primary:   {primary}')
    print(f'  secondary: {secondary}')
    print(f'  tertiary:  {tertiary}    (ESPN gives only 2 colors; edit by hand if needed)')

    doc = load_doc()
    if isinstance(doc.get('teams'), list):
        if not update_db_team(
            doc,
            league_input,
            abbreviation,
            display_name,
            first_name,
            mascot,
            primary,
            secondary,
            tertiary,
            team.get('id')
        ):
            print('\nNo matching canonical db/teams.json row found.')
            print('Add the franchise identity fields there first, then rerun this palette update.')
            return 1
        save_doc(doc)
        print(f'\nUpdated db/teams.json / {league_input} / {abbreviation} ({display_name}).')
        return 0

    league_teams = doc['leagues'].setdefault(league_input, {})
    if abbreviation in league_teams:
        confirm = input(f'\n{league_input} / {abbreviation} already exists. Overwrite? [y/N] ').strip().lower()
        if confirm not in ('y', 'yes'):
            print('Aborted.')
            return 1

    league_teams[abbreviation] = {
        'fullName': display_name,
        'firstName': first_name,
        'fanbase': fanbase,
        'mascot': mascot,
        'primary': primary,
        'secondary': secondary,
        'tertiary': tertiary
    }
    save_doc(doc)
    print(f'\nSaved {league_input} / {abbreviation} ({display_name}).')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled.')
        sys.exit(1)
