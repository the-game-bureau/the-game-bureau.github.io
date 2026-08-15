-- Let a candidate exist with no url at all.
--
-- The Socializer's MANUAL ADD box is labelled Website, but what you actually
-- have in hand when you reach for it is sometimes a line of text and no link:
-- an idea, a thing somebody said, a note to write up later. As of 2026-08-15
-- that box keeps such a value as the CAPTION and files the row with url = ''.
--
-- socials_url_idx stopped that at the second one. It is a unique index on
-- lower(url) skipping our own gift urls (which are allowed to repeat, see
-- 2026081301), and url is NOT NULL -- so every text-only candidate carried the
-- same empty string and the second INSERT hit the index. The first note filed
-- fine, the second failed with a 23505 naming a url column the human never
-- filled in.
--
-- An empty url is not a duplicate of anything. Two notes are two notes. So the
-- predicate now also skips the blank, which leaves the rule it exists for
-- exactly as it was: a real story url is still filed once and once only.
--
-- (Nothing else needs to change. The page already treats url as optional --
-- postTargets() drops a platform that cannot take the candidate, and a card
-- with no destination simply has nothing to open.)

drop index if exists public.socials_url_idx;

create unique index socials_url_idx
  on public.socials (lower(url))
  where url <> ''
    and lower(url) not like '%/gifts/?item=%';

comment on index public.socials_url_idx is
  'One row per story url. Skips our own /gifts/?item= urls, which may be reposted, and skips the empty url, which means the candidate is a note with no destination.';
