-- Confidence scores for the 30 candidates seeded by 2026080502.
--
-- WHOSE JUDGEMENT THIS IS, because it matters for a column whose whole value is
-- that you can trust the number.
--
-- These were scored by Claude Code on 2026-08-07 against the same rubric the
-- bot is given, reading each row's headline, topics, media, image and the
-- agent's own `why` out of the seed migration. That is a real judgement, not a
-- formula over the columns -- but it is a DIFFERENT agent scoring after the
-- fact, and it never opened the links. A score here means "this reads like a
-- 74"; a score the bot writes means "I found this and I am 74 sure of it".
-- Close enough to sort by, not the same claim.
--
-- ROWS FILED AFTER THE SEED ARE LEFT NULL. public.socials is admin-read only,
-- so anything the bot filed on 2026-08-06 or 07 could not be read from here to
-- be scored. Null is the honest value for them -- it means "not scored", which
-- is exactly true -- and /mc/socials/ renders nothing rather than a 0%.
--
-- HOW THEY WERE SCORED. Up: our own genre (hunts, puzzles, geocaching, ARGs), a
-- place a player could go and stand in, a photograph that carries a post on its
-- own, a story nobody else had picked up. Down: no image (Instagram is closed
-- to it entirely), a third trail-reopening in one batch, an evergreen page filed
-- as news, a beat we barely cover, anything brushing the press-release line.
--
-- The spread runs 42 to 88 with a mean near 69, which is the point: the bot is
-- told not to bunch, and a backfill that put everything at 70 would have made
-- the column decorative on its first day.

update public.socials as s
   set confidence = v.score
  from (values
    -- 80+ : would post without thinking
    ('2026-08-05-1500-4', 88),  -- walk from Detroit into Canada, opened that morning; our brief, literally
    ('2026-08-05-3',      86),  -- fans doing real cryptanalysis on an Avengers promo: an ARG with a studio budget
    ('2026-08-05-1',      84),  -- Hanging Lake trail rebuilt; a real walk, and the lake carries the photo
    ('2026-08-05-1500-2', 83),  -- Hungry Hungry Hippos world record: a board game taken seriously enough to be a sport
    ('2026-08-05-0411-1', 82),  -- cardboard boat regatta, with a Titanic Award for best sinking
    ('2026-08-05-1255-5', 81),  -- dogs surfing, judged, 10th annual; the photo does all the work
    ('2026-08-04-4',      80),  -- 100-metre torta, Guinness, 600,000-person fair
    ('2026-08-05-1224-4', 80),  -- CBC bracketing a province's roadside attractions, which is a scavenger hunt with a ballot

    -- 60-79 : solid, on-beat
    ('2026-08-05-0411-3', 79),  -- 11 hours inside SFO on purpose; first-person travel, deadpan
    ('2026-08-04-3',      78),  -- library book out of a fireplace after 150 years
    ('2026-08-04-5',      76),  -- message in a bottle with an ending, not a punchline
    ('2026-08-05-2',      74),  -- Jimothy the raccoon: civic proclamation, two Mariners nights
    ('2026-08-05-4',      72),  -- the Peachoid; perfect roadside, but an evergreen page filed as news
    ('2026-08-05-1224-5', 72),  -- Bakunawa, six records, a ride you can go and queue for
    ('2026-08-05-1500-3', 71),  -- an escape room shipping a music video instead of a trailer; our industry, niche source
    ('2026-08-05-5',      70),  -- 200 years of the Union Oyster House, a real Freedom Trail stop
    ('2026-08-05-0411-2', 70),  -- Gen Con's roof gave way and 72,000 people set a record anyway; thin source
    ('2026-08-05-1255-3', 68),  -- 1,500 geocaches in one town: our genre exactly, but no image, so Facebook only
    ('2026-08-04-2',      68),  -- Sunset Marquis: six decades of rock in a building you can stand outside
    ('2026-08-05-1224-2', 66),  -- 60,000-piece speed puzzling; our genre, but two weeks old when it was filed
    ('2026-08-04-1',      62),  -- bughouse championship; on-beat, but it happens on a screen
    ('2026-08-05-1224-3', 62),  -- Appalachian Trail reopens; real, and the second trail story in the batch
    ('2026-08-05-1500-1', 60),  -- minor-league promo roundup: great material, listicle shape

    -- 40-59 : fine, nothing special
    ('2026-08-05-1255-4', 58),  -- Crystal Cave; the second Roadside America evergreen in the same run
    ('2026-08-05-1500-5', 57),  -- Michelin at 100; well covered everywhere else
    ('2026-08-05-1255-1', 55),  -- DCI championships, but the piece is a schedule
    ('2026-08-05-0411-4', 48),  -- Traitors cast reveal; the format is ours, the article is publicity
    ('2026-08-05-1255-2', 45),  -- Eugene's new 2.5 miles: the THIRD trail reopening, and hyperlocal
    ('2026-08-05-1224-1', 44),  -- hot dog record explainer; no image, and nobody needs us to tell them
    ('2026-08-05-0411-5', 42)   -- bicentennial trail reroute; text only, hyperlocal, nothing to look at
  ) as v(id, score)
 where s.id = v.id
   -- Never overwrite a real score. This is what makes the file safe to re-run,
   -- and it means a row the bot rescores later keeps the bot's number.
   and s.confidence is null;
