import io

p = 'mc/gifts/index.html'
s = io.open(p, encoding='utf-8').read()

# ── 1. Details keeps its .item-fields ancestor; nothing else gains it ───────
old = """          <fieldset class="item-details btn-fieldset">
            <legend>The gift</legend>"""
new = """          <!-- .item-fields IS AN ANCESTOR SELECTOR, not a layout box: eighteen
               rules style the inputs and labels through it, and it is
               display: contents so it adds no box of its own. It wraps THE GIFT
               and nothing else, deliberately. Put it on the whole column and
               `.item-fields select { height: 34px }` would flatten the Shops
               multi-select, which is a size="4" list. -->
          <div class="item-fields">
          <fieldset class="item-details btn-fieldset">
            <legend>The gift</legend>"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

old = """          </fieldset>

{SHOPS_MARK}"""
# close the wrapper right after the details fieldset
idx = s.index('<div class="item-fields">')
close = s.index('\n          </fieldset>\n', idx) + len('\n          </fieldset>\n')
s = s[:close] + '          </div>\n' + s[close:]

# ── 2. the card is two columns ──────────────────────────────────────────────
old = """    .item-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .item-focus-col,
    .item-fields { display: contents; }"""
new = """    /* TWO COLUMNS: what you LOOK AT on the left, what you TYPE on the right.
       The media column is fixed and narrow because a preview does not get more
       useful with more width, while the fields do. `align-items: start` keeps
       each column its own height instead of stretching the short one. */
    .item-body {
      display: grid;
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
      align-items: start;
      gap: 12px;
    }
    .item-col-media,
    .item-col-main {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
      gap: 12px;
    }
    /* Not a box: an ancestor hook for the field styling. See the markup. */
    .item-fields { display: contents; }"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

# ── 3. rules for boxes that no longer exist ─────────────────────────────────
dead = [
"""    /* SHOPS AND A SHORT STATUS ON ONE LINE, at the top of the card. The two
       questions you ask of a gift before anything else are WHERE does it sell
       and IS IT LIVE, so they sit together and above the fold. Shops takes the
       space and the status panel takes only what it needs. */
    .item-toprow {
      display: flex;
      /* NOWRAP, AND A ZERO BASIS ON SHOPS. With `wrap` and a 320px basis the two
         panels needed 320px plus the status panel's own width before they would
         sit together, which most card widths do not give them, so they broke
         onto separate lines and the row did nothing. A zero basis lets Shops
         take whatever is left after the status panel has taken what it needs,
         however narrow that is, and `min-inline-size: 0` is what allows it to
         go below its content width instead of pushing the row wider. */
      flex-wrap: nowrap;
      align-items: flex-start;
      gap: 12px;
    }
    .item-toprow > .item-listings { flex: 1 1 0; min-inline-size: 0; }
    .item-toprow > .item-status-panel--compact { flex: 0 0 auto; }

""",
"""    .item-save-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding-top: 10px;
      margin-top: 2px;
      border-top: 1px dashed var(--line);
    }
""",
"""      /* Stacked on a phone: side by side, Shops would be too narrow to search
         in and the status words would wrap inside their own buttons. */
      .item-toprow { flex-direction: column; }
      .item-toprow > .item-listings,
      .item-toprow > .item-status-panel--compact { flex: 1 1 100%; width: 100%; }
""",
]
for d in dead:
    assert s.count(d) == 1, ('dead-rule miss', d[:60], s.count(d))
    s = s.replace(d, '', 1)

# ── 4. one column on a phone ────────────────────────────────────────────────
old = """      .item-status-panel {
        flex: 1 1 100%;
        width: 100%;
      }"""
new = """      .item-status-panel {
        flex: 1 1 100%;
        width: 100%;
      }

      /* ONE COLUMN UNDER THE BREAKPOINT, in the same order: the preview first,
         then everything written about it. Two columns at phone width would make
         both of them too narrow to use. */
      .item-body { grid-template-columns: minmax(0, 1fr); }"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

# ── 5. the save actions sat in a row that has gone; give them its rule ──────
old = """    .item-save-actions {
      display: flex;"""
new = """    .item-save-actions {
      /* The dashed rule used to belong to .item-save-row, the box that held
         these two and the old TAGS panel. That box is gone; the line it drew is
         still worth keeping, because it separates the two things that act on
         the whole gift from the fields above them. */
      padding-top: 10px;
      margin-top: 2px;
      border-top: 1px dashed var(--line);
      display: flex;"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('css rebuilt')
