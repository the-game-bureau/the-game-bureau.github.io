-- North Carolina Wesleyan Battling Bishops: navy and gold.
--
-- IT CARRIED THE PLACEHOLDER, not wrong colours: #000000 / #FFFFFF / #FFFFFF,
-- which **211 of the 638 club rows still carry**. So this is one row out of a
-- gap, not a correction -- and the other 210 are the same job.
--
-- THE COLOURS ARE FROM RECOLLECTION, NOT A CHECKED SOURCE, and that is said
-- plainly because this project's own rule is that a plausible wrong value looks
-- exactly like a right one. Navy and gold is my best reading of NC Wesleyan
-- (Rocky Mount, NC); it is four click-to-edit cells in the Audience Queue if it
-- is wrong. **Do not take this file as evidence the palette was verified.**
--
-- MEASURED, which is the half that is not recollection:
--
--     derived ink on primary  #FFFFFF   14.68
--     secondary on primary               6.06
--     secondary vs tertiary              2.42
--
-- The gold and the white are separated in LIGHTNESS as well as hue -- the
-- cassette fault is two colours a greyscale reader cannot tell apart.
--
-- `text` STAYS #FFFFFF, as on every other row, and is read by nothing:
-- team-palette.js derives readable ink from `primary` by luminance.
--
-- `primary` IS A RESERVED WORD and must be double-quoted in hand-written SQL.

update public.audiences
   set "primary" = '#12284B',   -- navy
       secondary = '#C5A253',   -- gold
       tertiary  = '#FFFFFF'
 where id = 'north-carolina-wesleyan-battling-bishops';

-- Verify. Expect one row, and no leftover placeholder on it.
select id, full_name, "primary", secondary, tertiary, text
  from public.audiences
 where id = 'north-carolina-wesleyan-battling-bishops';
