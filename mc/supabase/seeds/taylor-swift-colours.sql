-- Taylor Swift: the four colour columns, which were all NULL.
--
-- WHAT THEY ARE. primary is the ground a game wears (the helmet, in the fandom
-- vocabulary these columns were built for), secondary the stripe, tertiary the
-- facemask. `text` is #FFFFFF on all 639 other rows and is READ BY NOTHING --
-- team-palette.js derives readable ink from `primary` by luminance on purpose,
-- because a brand's own text colour can be white on its own white ground. It is
-- set here only so this row matches the rest of the table.
--
-- AN EDITORIAL CHOICE, NOT AN OFFICIAL BRAND PALETTE. There is no single
-- published palette to copy: hers is era-specific and changes. Midnight navy,
-- pale lavender and antique gold is a defensible reading of the visual world
-- most people would recognise. It is one UPDATE and four click-to-edit cells in
-- the Audience Queue if somebody wants different ones.
--
-- MEASURED BEFORE IT WAS WRITTEN, which is the half that is not a matter of
-- taste. The first pairing put the lavender and the gold at the same lightness:
--
--     secondary vs tertiary   1.01
--
-- which is the cassette fault exactly -- two colours told apart by hue alone,
-- identical in greyscale, in print, and to a viewer who cannot separate those
-- hues. The pair is separated now:
--
--     derived ink on primary  #FFFFFF   16.57
--     secondary on primary              10.75
--     tertiary  on primary               4.67
--     secondary vs tertiary              2.30
--
-- `primary` IS A RESERVED WORD and must be double-quoted in hand-written SQL.

update public.audiences
   set "primary" = '#1C1B3A',   -- midnight navy
       secondary = '#D8CBE8',   -- pale lavender
       tertiary  = '#A8823C',   -- antique gold
       text      = '#FFFFFF'
 where id = 'taylor-swift';

-- Verify. Expect one row carrying all four.
select id, full_name, "primary", secondary, tertiary, text
  from public.audiences
 where id = 'taylor-swift';
