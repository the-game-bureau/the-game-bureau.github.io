import json, subprocess, collections, urllib.request, datetime

K = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'

# ESPN answers plain curl and refuses node and a Mozilla UA -- TLS fingerprint,
# measured 2026-09-02. So curl it is.
espn = []
for wk in range(1, 19):
    raw = subprocess.run(['curl', '-s', '--max-time', '25',
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
        '?dates=2026&seasontype=2&week=%d' % wk], capture_output=True, text=True).stdout
    d = json.loads(raw)
    for ev in d.get('events', []):
        c = (ev.get('competitions') or [{}])[0]
        t = {x.get('homeAway'): (x.get('team') or {}).get('name') for x in c.get('competitors', [])}
        v = c.get('venue') or {}
        ad = v.get('address') or {}
        if not (t.get('away') and t.get('home')):
            continue
        espn.append({
            'wk': wk, 'date': (ev.get('date') or '')[:10],
            'away': t['away'], 'home': t['home'],
            'venue': v.get('fullName'), 'city': ad.get('city'),
            'state': ad.get('state'), 'country': ad.get('country'),
            'neutral': bool(c.get('neutralSite'))
        })

req = urllib.request.Request(
    'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/events'
    '?league=eq.NFL&select=id,start_date,start_time,away_team_nickname,home_team_nickname,'
    'title,venue,venue_city,neutral_site,status&limit=600',
    headers={'apikey': K, 'Authorization': 'Bearer ' + K})
ours = json.load(urllib.request.urlopen(req))

def pair(a, h):
    a = (a or '').strip(); h = (h or '').strip()
    return '|'.join(sorted([a, h])) if a and h else None

def day(s):
    try: return datetime.date.fromisoformat((s or '')[:10])
    except Exception: return None

buckets = collections.defaultdict(list)
extra_rows = []
noclub = []
for r in ours:
    k = pair(r.get('away_team_nickname'), r.get('home_team_nickname'))
    if k: buckets[k].append(r)
    else: noclub.append(r)

missing, swapped, datebad, venuebad, neutralbad, matched = [], [], [], [], [], []

# TWO CLUBS MEET TWICE A SEASON, so a greedy walk in date order pairs ESPN's
# FIRST meeting with whichever of our rows is left and blames the wrong game.
# A first cut did exactly that: it called the Santa Clara row a 93-day date
# error and the Melbourne game correct, when the truth is the reverse.
# So within each club pair, match on the SMALLEST date gap first.
for k, rows in list(buckets.items()) + [(k, []) for k in
        {pair(g['away'], g['home']) for g in espn} - set(buckets)]:
    games = [g for g in espn if pair(g['away'], g['home']) == k]
    links = sorted(((abs((day(r['start_date']) - day(g['date'])).days), gi, ri)
                    for gi, g in enumerate(games)
                    for ri, r in enumerate(rows)
                    if day(r['start_date']) and day(g['date'])))
    tookg, tookr = set(), set()
    for off, gi, ri in links:
        if gi in tookg or ri in tookr:
            continue
        tookg.add(gi); tookr.add(ri)
        g, r = games[gi], rows[ri]
        matched.append((g, r))
        if off > 1:
            datebad.append((g, r, off))
        if (r.get('away_team_nickname') or '').strip() != g['away']:
            swapped.append((g, r))
        espn_city = (g['city'] or '')
        if espn_city and espn_city.split(',')[0].lower() not in (r.get('venue_city') or '').lower():
            venuebad.append((g, r))
        if bool(r.get('neutral_site')) != g['neutral']:
            neutralbad.append((g, r))
    for gi, g in enumerate(games):
        if gi not in tookg:
            missing.append(g)
    for ri, r in enumerate(rows):
        if ri not in tookr:
            extra_rows.append(r)

missing.sort(key=lambda g: g['date'])
swapped.sort(key=lambda x: x[0]['date'])
datebad.sort(key=lambda x: x[0]['date'])
venuebad.sort(key=lambda x: x[0]['date'])
neutralbad.sort(key=lambda x: x[0]['date'])

print('ESPN %d   ours %d   matched %d   missing %d' % (len(espn), len(ours), len(matched), len(missing)))
print()
print('=' * 74)
print('MISSING ENTIRELY (%d)' % len(missing))
print('=' * 74)
for g in missing:
    print('  wk%-3d %s  %-10s at %-10s' % (g['wk'], g['date'], g['away'], g['home']))
    print('        %s, %s%s' % (g['venue'], g['city'], ', ' + g['country'] if g['country'] not in ('USA',) else ''))

print()
print('=' * 74)
print('SIDES THE WRONG WAY ROUND (%d)' % len(swapped))
print('=' * 74)
for g, r in swapped:
    print('  %s  ESPN %-10s at %-10s   ours %-10s at %-10s   [%s]'
          % (g['date'], g['away'], g['home'],
             r['away_team_nickname'], r['home_team_nickname'], r['id']))
    print('        %s  |  ours: %s' % ((g['city'] or '') + ', ' + (g['country'] or ''), r['venue_city']))

print()
print('=' * 74)
print('DATE OFF BY MORE THAN A DAY (%d)' % len(datebad))
print('=' * 74)
for g, r, off in datebad:
    print('  ESPN %s  ours %s  (%d days)  %-10s at %-10s  [%s]'
          % (g['date'], r['start_date'], off, g['away'], g['home'], r['id']))

print()
print('=' * 74)
print('VENUE CITY DISAGREES (%d)' % len(venuebad))
print('=' * 74)
for g, r in venuebad:
    print('  %s  %-10s at %-10s' % (g['date'], g['away'], g['home']))
    print('        ESPN %s, %s  |  ours %s  [%s]' % (g['venue'], g['city'], r['venue_city'], r['id']))

print()
print('=' * 74)
print('NEUTRAL SITE FLAG DISAGREES (%d)' % len(neutralbad))
print('=' * 74)
for g, r in neutralbad:
    print('  %s  %-10s at %-10s   ESPN neutral=%s  ours neutral=%s  (%s)  [%s]'
          % (g['date'], g['away'], g['home'], g['neutral'], r.get('neutral_site'),
             r['venue_city'], r['id']))

print()
print('rows on file naming no clubs: %d' % len(noclub))
for r in noclub:
    print('  %s  %s  [%s]' % (r['start_date'], r['title'], r['id']))

extra = extra_rows
print()
print('rows on file that ESPN has no game for: %d' % len(extra))
for r in extra[:10]:
    print('  %s  %s at %s  [%s]' % (r['start_date'], r['away_team_nickname'], r['home_team_nickname'], r['id']))
