-- 2026090208  the tgb_date backfill matched months inside words
--
-- 2026090207 built the date from two INDEPENDENT searches of the same body: one
-- for "Mon DD" to get the day, and a second for a bare month to decide the
-- year. They are free to find different months, and they did.
--
-- THE ALTERNATION WAS NOT WORD-ANCHORED, which is the whole fault:
--
--     "Rio de Janeiro"  contains  Jan   -> dal2026bal  "Kickoff is Sep 27"
--                                          was stored as 2027-09-27
--     "Miami Marlins"   contains  Mar   -> nine rows counted as March games
--                                          that are nothing of the kind
--
-- So two rows landed a year out, and a month that does not exist in this table
-- appeared to. **A wrong date looks exactly like a right one**, which is why
-- this is a correction rather than a tidy-up.
--
-- THE FIX IS ONE MATCH, ANCHORED ON THE PHRASE. Every body says "First pitch
-- is Jul 10," or "Kickoff is Jan 3," or "Tip-off is ...", so anchoring on
-- "is " and the trailing comma pins the month to a real date and the year is
-- taken from THE SAME match rather than a second search. It needs no word
-- boundary, which would have meant a backslash, which this project has lost
-- files to.
--
-- IT RECOMPUTES EVERY ROW rather than repairing the two that are visibly wrong:
-- the old pattern could pick a different month wherever a club or a city name
-- happens to contain one, and enumerating those is guesswork where recomputing
-- is not.

begin;

update public.games g
   set tgb_date = case
         when m.md is null then null
         else to_date(
                m.md || ' ' || case when left(m.md, 3) in ('Jan', 'Feb')
                                    then '2027' else '2026' end,
                'Mon DD YYYY')
       end
  from (select id,
               substring(body from
                 'is ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{1,2}),') as md
          from public.games) m
 where m.id = g.id;

commit;

-- Verify. The absence of an error proves nothing; these numbers do.
--
--   select count(*) as games, count(tgb_date) as dated,
--          min(tgb_date) as first, max(tgb_date) as last from public.games;
--   -- expect 394 / 352 / 2026-06-.. / 2027-01-..   and NOTHING in 2027-09
--
--   select to_char(tgb_date,'YYYY-MM') as ym, count(*) from public.games
--    where tgb_date is not null group by 1 order by 1;
--   -- expect Jun..Dec 2026 and Jan 2027, and no March at all
--
--   -- THE YEAR RULE'S OWN GUARD. Baseball runs inside one calendar year and
--   -- football crosses one, so the month alone can decide the year ONLY while
--   -- no baseball game falls in January or February. If this is ever non-zero
--   -- the rule is wrong and those rows want re-checking by sport.
--   select count(*) from public.games
--    where body ~ 'First pitch is' and body ~ 'is (Jan|Feb) [0-9]{1,2},';   -- 0
