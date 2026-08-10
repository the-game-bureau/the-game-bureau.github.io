-- 2026081002_guides_clear_duplicate_images.sql
--
-- NOT A MIGRATION. Run once, by hand, in the Supabase SQL editor. Same reason
-- as 2026081001: it addresses content by id, and those ids do not exist in a
-- database rebuilt from migrations/ alone.
--
-- THREE PORTRAITS WERE ON TWO CARDS EACH. A byte-for-byte hash of all 39
-- images found 36 distinct pictures: three were shared by a pair of guides.
-- Looking at them settled which half of each pair is the mistake - in every
-- case the artwork matches the HIGHER id's background in detail, down to the
-- objects those characters are documented as carrying:
--
--   82 KB  silver hair in a navy anchor bandana, denim vest, copper anchor
--          pendant                  -> #60 Dee Pickens, not #37 Imani Greaves
--   64 KB  hi-vis over flannel, grey braid under a beanie, RIGGING SHACKLE
--                                   -> #61 Cap Compagno, not #39 Tamsin Rainier
--   62 KB  shaved head, silver chain, CARGO HOOK pendant
--                                   -> #58 Ironhead Miller, not #47 Isaiah Tolliver
--
-- So the copy is cleared from 37, 39 and 47, and the original is left alone on
-- 58, 60 and 61. Nulling both halves would have thrown away three good
-- portraits to fix three bad ones.
--
-- The three cleared rows then show as NO PORTRAIT in the Green Room, which is
-- what makes them reachable: PORTRAITS -> MISSING (3) builds one prompt that
-- draws all three, and the pictures come back through Upload Image.
--
-- HOW IT HAPPENED, worth knowing before it happens again: Upload Image writes
-- the instant a file is chosen - no Save, no confirmation, no undo - onto
-- whichever card was clicked. Three times, that was the card above or below
-- the intended one.

begin;

update public.guides
   set image = null,
       updated_at = now()
 where id in (37, 39, 47);

commit;

-- Check: should report 36 rows with a portrait, 3 without, and no shared
-- images left.
--
--   select count(*)                          as guides,
--          count(image)                      as with_portrait,
--          count(*) - count(image)           as without_portrait,
--          count(distinct md5(image))        as distinct_portraits
--   from public.guides;
