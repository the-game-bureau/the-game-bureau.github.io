-- APPLIED 2026-08-30. Kept as the record of what was changed and why.
--
-- "The day before" was a SUGGESTION WRITTEN AS A RULE, and it had spread until
-- the whole site read as though a game could be played in one window only. The
-- truth is narrower and better: the game is built around whatever brought you
-- to town, it is yours to start when you like, and the suggested start time
-- exists so several teams are out at once and finish at roughly the same
-- moment. That last part is the whole reason the suggestion is worth making,
-- and it had never been said on a page.
--
-- ONLY THE TWO MECHANICALLY SAFE REMOVALS ARE HERE. 329 distinct phrasings
-- carried the idea; these two are formulaic enough that deleting the clause
-- leaves a whole sentence. The rest need REWRITING, which is the Taglines
-- room's job with a corrected prompt, not a regex.
--
-- WHAT IT DID, counted before and after rather than assumed:
--   taglines  70 -> 44      bodies  353 -> 18
--   LIVE taglines 70 -> 0   LIVE bodies 353 -> 0
-- The 44 that remain are all on ARCHIVED rows, so nothing a visitor reads
-- carries it. They are a content backlog, not a page fault.
--
-- A third statement, run separately, fixed the one live row the patterns below
-- could not reach:
--   update public.games set body = replace(body,
--     'takeover the day before the neutral-site matchup',
--     'takeover built around the neutral-site matchup') where id = 'nor2026pit';

-- THE DAY-BEFORE FRAMING WAS A SUGGESTION WRITTEN AS A RULE.
-- Two mechanically safe removals only. The rest of the phrasings need
-- REWRITING rather than deleting, and that is the Taglines room's job.
begin;

-- A. The leading "One day early, " on a tagline. Removing it leaves a whole
--    sentence, so the first letter is re-capitalised.
update public.games
   set tagline = upper(left(substring(tagline from 16), 1)) || substring(tagline from 17)
 where tagline like 'One day early, %';

-- B. The formulaic body opener. " a day early" comes out and the sentence is
--    otherwise untouched, which is why this one is safe and the others are not.
update public.games
   set body = replace(body, 'are in town a day early for', 'are in town for')
 where body like '%are in town a day early for%';

commit;

select 'taglines still saying it'  as k, count(*)::text v from public.games
 where tagline ~* '(day before|day early|night before)'
union all
select 'bodies still saying it', count(*)::text from public.games
 where body ~* '(day before|day early|night before)'
union all
select 'LIVE taglines still saying it', count(*)::text from public.games
 where coalesce(archived,'') <> 'YES' and coalesce(erased,'') <> 'YES'
   and tagline ~* '(day before|day early|night before)'
union all
select 'LIVE bodies still saying it', count(*)::text from public.games
 where coalesce(archived,'') <> 'YES' and coalesce(erased,'') <> 'YES'
   and body ~* '(day before|day early|night before)';
