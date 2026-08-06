-- 2026072406_gift_shop_sports_backfill.sql
--
-- Tags ten gifts that are sports items but were never flagged. The first-pass
-- classifier in 2026072302_gift_shop_sports.sql runs once, so anything added
-- afterwards arrives untagged (three of these were created 2026-07-24), and a
-- few older rows used vocabulary its keyword list didn't cover ("supersonics"
-- isn't in the nickname list; a bare "sports" isn't a keyword at all).
--
-- Same convention as featured / games.featured: TEXT 'YES', never boolean true.
-- Re-runnable — it only ever sets 'YES', and each row is matched on id AND a
-- title fragment, so a stale id can't quietly tag some other gift.

with targets (id, title_like) as (
  values
    -- NFL
    ('e9d5b6e7-7b0e-4320-8e2e-ccf0b0a25f87'::uuid, '%Saints Sideline%'),
    ('6c9d333f-ecc9-4e86-8ac0-951fc8e2fbe5'::uuid, 'Home Team: Coaching the Saints%'),
    ('8f68d2d1-77c1-4610-ae37-0cb22c84b8a5'::uuid, 'My Beloved Miami Dolphins%'),
    -- NBA merch (its two Sonics siblings were already tagged)
    ('b477a585-3335-44aa-92d7-9191894a86e8'::uuid, 'Seattle Supersonics Throwback%'),
    -- General sports apparel
    ('c7e85e83-f27a-4698-84ad-da2241cab722'::uuid, 'Distressed Vintage Boston%Sports%'),
    -- Motorsport
    ('4837faad-4a72-4833-bdba-991d557537c3'::uuid, 'Auto Racing in Charlotte%'),
    -- Athlete biography / sport reportage
    ('4ab27197-35be-442e-aa84-e56e27537718'::uuid, 'The Story of Arthur Ashe%'),
    ('bbdbabd7-7ddd-4cd2-87fe-d25353188201'::uuid, 'The Season: A Fan%'),
    -- Sports-centred fiction (judgement calls, tagged deliberately)
    ('286fbbf8-542e-400d-a795-d76d36f44e68'::uuid, 'Barracuda by Christos%'),
    ('1463ae76-cc99-4868-b8a3-2506b406b344'::uuid, 'The Art of Racing in the Rain%')
)
update public.gift_shop_items i
   set sports = 'YES'
  from targets t
 where i.id = t.id
   and i.title ilike t.title_like
   and coalesce(i.sports, '') <> 'YES';

-- Verify (expect 10 rows, all 'YES'):
-- select sports, title from public.gift_shop_items
--  where id in (
--    'e9d5b6e7-7b0e-4320-8e2e-ccf0b0a25f87','6c9d333f-ecc9-4e86-8ac0-951fc8e2fbe5',
--    '8f68d2d1-77c1-4610-ae37-0cb22c84b8a5','b477a585-3335-44aa-92d7-9191894a86e8',
--    'c7e85e83-f27a-4698-84ad-da2241cab722','4837faad-4a72-4833-bdba-991d557537c3',
--    '4ab27197-35be-442e-aa84-e56e27537718','bbdbabd7-7ddd-4cd2-87fe-d25353188201',
--    '286fbbf8-542e-400d-a795-d76d36f44e68','1463ae76-cc99-4868-b8a3-2506b406b344')
--  order by title;
