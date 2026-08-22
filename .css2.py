import io

p = 'mc/gifts/index.html'
s = io.open(p, encoding='utf-8').read()

def cut(a_mark, b_mark, label):
    """Remove from a_mark up to (not including) b_mark."""
    global s
    a = s.index(a_mark)
    b = s.index(b_mark, a)
    n = s[a:b].count('\n')
    s = s[:a] + s[b:]
    print('  cut %-34s %3d lines' % (label, n))

def sub(old, new, label):
    global s
    assert s.count(old) == 1, ('miss', label, s.count(old))
    s = s.replace(old, new, 1)
    print('  set %s' % label)

# ── 1. Details keeps its .item-fields ancestor ──────────────────────────────
sub("""          <fieldset class="item-details btn-fieldset">
            <legend>The gift</legend>""",
    """          <!-- .item-fields IS AN ANCESTOR SELECTOR, NOT A LAYOUT BOX: eighteen
               rules style the inputs and labels through it, and it is
               display: contents so it adds no box of its own. It wraps THE GIFT
               and nothing else, deliberately. Put it on the whole column and
               `.item-fields select { height: 34px }` would flatten the Shops
               multi-select, which is a size="4" list. -->
          <div class="item-fields">
          <fieldset class="item-details btn-fieldset">
            <legend>The gift</legend>""", 'item-fields wrapper opens')

idx = s.index('<div class="item-fields">')
close = s.index('\n          </fieldset>\n', idx) + len('\n          </fieldset>\n')
s = s[:close] + '          </div>\n' + s[close:]
print('  set item-fields wrapper closes')

# ── 2. two columns ──────────────────────────────────────────────────────────
sub("""    .item-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .item-focus-col,
    .item-fields { display: contents; }""",
    """    /* TWO COLUMNS: what you LOOK AT on the left, what you TYPE on the right.
       The media column is fixed and narrow because a preview does not get more
       useful with more width, while the fields do. `align-items: start` keeps
       each column its own height rather than stretching the shorter one. */
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
    .item-fields { display: contents; }""", 'two-column grid')

# ── 3. rules for boxes that no longer exist ─────────────────────────────────
cut('    /* SHOPS AND A SHORT STATUS ON ONE LINE', '    .item-listings {', '.item-toprow')
cut('    .item-save-row {', '    .item-save-actions {', '.item-save-row')
cut('      /* Stacked on a phone: side by side, Shops', '      .item-status-choices', '.item-toprow (phone)')

# ── 4. one column on a phone ────────────────────────────────────────────────
sub("""      .item-status-panel {
        flex: 1 1 100%;
        width: 100%;
      }""",
    """      .item-status-panel {
        flex: 1 1 100%;
        width: 100%;
      }

      /* ONE COLUMN UNDER THE BREAKPOINT, in the same order: the preview first,
         then everything written about it. Two columns at phone width would
         leave both too narrow to use. */
      .item-body { grid-template-columns: minmax(0, 1fr); }""", 'phone: single column')

# ── 5. the save actions inherit the rule the old row drew ───────────────────
sub("""    .item-save-actions {
      display: flex;""",
    """    .item-save-actions {
      /* The dashed rule belonged to .item-save-row, the box that held these two
         and the old TAGS panel. That box has gone; the line is worth keeping,
         because it separates the two things that act on the whole gift from the
         fields above them. */
      padding-top: 10px;
      margin-top: 2px;
      border-top: 1px dashed var(--line);
      display: flex;""", 'save actions keep the rule')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('written')
