import io, re

IG = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='20' x='2' y='2' rx='5'/%3E%3Cpath d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z'/%3E%3Cline x1='17.5' x2='17.51' y1='6.5' y2='6.5'/%3E%3C/svg%3E"

# ---------------------------------------------------------------- follow-reel
p = 'mc/js/follow-reel.js'
s = io.open(p, encoding='utf-8').read()

start = s.index('  var ACCOUNTS = [')
end   = s.index('  var STYLE_ID =')
old_block = s[start:end]

# keep the exact icon strings, just re-key them by name
icons = re.findall(r'    // (\w+)\n    "(%3Csvg.*?)"', old_block, re.S)
by_name = {n: i for n, i in icons}
assert set(by_name) == {'Instagram', 'Threads', 'X', 'Facebook', 'YouTube'}, sorted(by_name)

order = [
    ('Instagram', 'https://www.instagram.com/thegamebureau', '@thegamebureau', None),
    ('Facebook',  'https://www.facebook.com/thegamebureau',  'The Game Bureau', None),
    ('Threads',   'https://www.threads.com/@thegamebureau',  '@thegamebureau',
     '    // threads.COM, not .net: Meta moved the domain and the old one redirects\n'
     '    // rather than resolving, a hop worth not making.\n'),
    ('X',         'https://x.com/thegamebureau',             '@thegamebureau', None),
    ('YouTube',   'https://youtube.com/@thegamebureau',      '@thegamebureau', None),
]

lines = []
lines.append('''  // ONE ARRAY, NOT TWO. The url, the name, the handle and the icon were an
  // ACCOUNTS list and an ICONS list matched BY INDEX, which worked exactly
  // until the first reorder: moving Facebook up on 2026-08-20 would have left
  // every icon attached to the wrong account, silently, with nothing to
  // notice it but a person looking at the menu. Keyed together they cannot
  // drift.
  //
  // THE ORDER IS THE MENU ORDER, and Facebook sits under Instagram because
  // those two are one Page and one credential everywhere else in this project.
  var ACCOUNTS = [''')
for name, url, handle, note in order:
    if note:
        lines.append(note.rstrip('\n'))
    lines.append('    {')
    lines.append("      name: '%s'," % name)
    lines.append("      handle: '%s'," % handle)
    lines.append("      url: '%s'," % url)
    lines.append('      icon: "%s"' % by_name[name])
    lines.append('    },')
lines[-1] = lines[-1].rstrip(',')
lines.append('  ];')
lines.append('')
s = s[:start] + '\n'.join(lines) + '\n' + s[end:]

# every reader moves onto the objects
s = s.replace("""    ICONS.concat([ICONS[0]]).forEach(function (ic) {
      var tile = document.createElement('span');
      tile.className = 'tgb-reel-tile';
      tile.style.mask = 'url("data:image/svg+xml,' + ic + '") center / contain no-repeat';
      tile.style.webkitMask = 'url("data:image/svg+xml,' + ic + '") center / contain no-repeat';
      track.appendChild(tile);
    });""",
"""    ACCOUNTS.concat([ACCOUNTS[0]]).forEach(function (acct) {
      var tile = document.createElement('span');
      tile.className = 'tgb-reel-tile';
      tile.style.mask = 'url("data:image/svg+xml,' + acct.icon + '") center / contain no-repeat';
      tile.style.webkitMask = 'url("data:image/svg+xml,' + acct.icon + '") center / contain no-repeat';
      track.appendChild(tile);
    });""")

s = s.replace("""    ACCOUNTS.forEach(function (acct, i) {""", """    ACCOUNTS.forEach(function (acct) {""")
s = s.replace("""      a.href = acct[0];""", """      a.href = acct.url;""")
s = s.replace("""      ico.style.mask = 'url("data:image/svg+xml,' + ICONS[i] + '") center / contain no-repeat';
      ico.style.webkitMask = 'url("data:image/svg+xml,' + ICONS[i] + '") center / contain no-repeat';""",
"""      ico.style.mask = 'url("data:image/svg+xml,' + acct.icon + '") center / contain no-repeat';
      ico.style.webkitMask = 'url("data:image/svg+xml,' + acct.icon + '") center / contain no-repeat';""")
s = s.replace("      nm.textContent = acct[1];", "      nm.textContent = acct.name;")
s = s.replace("      hd.textContent = acct[2];", "      hd.textContent = acct.handle;")

assert not [l for l in s.split(chr(10)) if ('ICONS[' in l or 'ICONS.' in l or 'var ICONS' in l)]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('follow-reel.js: one array, Facebook under Instagram')

# ---------------------------------------------------------------- site-nav
p2 = 'shell/site-nav.js'
s2 = io.open(p2, encoding='utf-8').read()
i = s2.index('  var SOCIALS = [')
j = s2.index('\n  ];', i) + 4
blk = s2[i:j]

def entry(name):
    m = re.search(r"    \['[^']*'?[^\n]*'" + name + r"'[^\n]*\n(?:      \"[^\n]*\n)?", blk)
    return m

# pull each 2-line entry out whole and reorder
entries = re.findall(r"    \['.*?\],?\n      \"[^\n]*?\"\],?\n", blk, re.S)
assert len(entries) == 5, len(entries)
named = {}
for e in entries:
    for n in ('Instagram', 'Threads', 'X', 'Facebook', 'YouTube'):
        if "'" + n + "'" in e:
            named[n] = e
assert len(named) == 5, sorted(named)

new_order = ['Instagram', 'Facebook', 'Threads', 'X', 'YouTube']
body = ''.join(named[n] for n in new_order)
# the Threads note travels with its entry; re-add it above Threads
body = body.replace(named['Threads'],
    "    // threads.COM, not .net: Meta moved the domain and the old one redirects\n"
    "    // rather than resolving, a hop worth not making.\n" + named['Threads'])
# tidy trailing comma on the last entry
body = re.sub(r"\],\n$", "]\n", body)
s2 = s2[:i] + '  var SOCIALS = [\n' + body + '  ];\n' + s2[j:]
io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('site-nav.js reordered')
