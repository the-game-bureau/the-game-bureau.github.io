-- One table for the socials candidates: content AND decision, together.
--
-- WHAT THIS REPLACES
--
-- Until now a candidate was split across two places. mc/socials/socials.json
-- held the content and was committed by TGB SOCIAL BOT twice a day;
-- public.socials_post_state held the human decision and any edits, keyed back
-- to the JSON id. That split was the problem: neither half told you what was
-- true on its own, the file grew forever with no sign that most of it had been
-- dealt with, and "can we delete the json" had a dangerous answer, because the
-- file was still the only copy of the content.
--
-- Now there is one row per candidate carrying everything. The JSON file and
-- socials_post_state are both retired by this migration.
--
-- HOW EACH SIDE WRITES
--
--   The admin page   /mc/socializer/ under an admin session. Reads and writes
--                    directly: status, edits, everything.
--   TGB SOCIAL BOT   through tgb_pull_socials_candidates() below. A cloud
--                    routine has no secret store, so it calls a SECURITY
--                    DEFINER function with the ordinary publishable key -- the
--                    same constraint and the same answer as
--                    tgb_pull_book_candidates and tgb_pull_soundtrack_songs.
--                    It can only INSERT, and only at status 'review'.
--
-- The bot no longer commits anything. Its output reaches the page through the
-- database, exactly as the gift shop and soundtracks already do.

create table if not exists public.socials (
  -- The run-stamped id the bot generates: <YYYY-MM-DD>-<HHMM-UTC>-<n>.
  id text primary key,

  headline text not null,
  url text not null,
  source text,
  -- Text on purpose: the bot occasionally reports an approximate date, and a
  -- malformed value must not cost us the whole candidate.
  published text,
  -- The caption we would publish. Column is `blurb` because that is what the
  -- bot has always called it; every piece of visible copy says caption.
  blurb text not null,
  -- Internal note for the human. NEVER posted, and the reason this table is
  -- not publicly readable.
  why text,
  topics text[],
  media text,
  -- Absolute og:image URL captured while the bot had the article open. The
  -- admin is static HTML and cannot read another origin's markup itself, so
  -- this is the only way a thumbnail ever gets here.
  image text,
  -- [{ "name": "X", "why": "link preview does the work" }, ...]
  platforms jsonb,

  -- The decision. Every candidate starts at 'review'.
  status text not null default 'review'
    check (status in ('review', 'posted', 'skipped')),
  -- Stamped by the trigger below, never by the client, so they cannot drift.
  posted_at timestamptz,
  posted_platforms text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.socials is
  'Social post candidates: content and decision in one row. Written by the '
  'admin page under an admin session, and by TGB SOCIAL BOT through '
  'tgb_pull_socials_candidates(). Replaced mc/socials/socials.json and '
  'socials_post_state on 2026-08-05.';
comment on column public.socials.blurb is
  'The caption we would publish. Called caption everywhere in the UI.';
comment on column public.socials.why is
  'Internal note. Never posted; the reason this table is admin-read only.';

-- One candidate per story. Case-insensitive so a re-pitch with a differently
-- cased url cannot slip in; the pull RPC leans on this to dedupe.
create unique index if not exists socials_url_idx on public.socials (lower(url));
create index if not exists socials_status_idx on public.socials (status, created_at desc);

create or replace function public.tgb_touch_socials()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists socials_touch_updated_at on public.socials;
create trigger socials_touch_updated_at
before update on public.socials
for each row execute function public.tgb_touch_socials();

-- posted_at follows status, in the database so the rule holds for psql and the
-- table editor too. Leaving 'posted' clears the stamp AND the platform list: a
-- candidate moved back to review has not been posted, and a stale timestamp
-- would claim it had.
create or replace function public.tgb_stamp_socials_posted()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'INSERT' then
    if new.status = 'posted' and new.posted_at is null then
      new.posted_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'posted' then
      new.posted_at := coalesce(new.posted_at, now());
    else
      new.posted_at := null;
      new.posted_platforms := null;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists socials_stamp_posted on public.socials;
create trigger socials_stamp_posted
before insert or update on public.socials
for each row execute function public.tgb_stamp_socials_posted();

alter table public.socials enable row level security;

-- Admin-only, both ways. `why` is an internal note about what we are about to
-- say publicly, and the review queue is not something to serve to anyone who
-- asks. The bot needs no SELECT: the RPC dedupes server-side.
drop policy if exists "Admins can read socials" on public.socials;
create policy "Admins can read socials"
  on public.socials for select to authenticated using (true);

drop policy if exists "Admins can manage socials" on public.socials;
create policy "Admins can manage socials"
  on public.socials for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.socials to authenticated;

-- ---------------------------------------------------------------------------
-- The bot's write path.
--
-- SECURITY DEFINER and callable with the publishable key, because a cloud
-- routine has no secret store. Safe because it cannot express anything
-- dangerous: INSERT only, status always 'review', never an update or delete,
-- capped per call, and a url already present is skipped rather than raising --
-- one repeat must not throw away the rest of the run.
--
-- DO NOT add a `status` parameter. That constant is what makes this safe to
-- expose to anon, exactly as with the book and soundtrack pulls.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_pull_socials_candidates(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_items jsonb;
  v_item jsonb;
  v_id text;
  v_url text;
  v_topics text[];
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  v_items := payload -> 'posts';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'Expected { "posts": [ ... ] }.';
  end if;

  -- Well above an honest run of five, far below "flood the table".
  if jsonb_array_length(v_items) > 25 then
    raise exception 'Too many candidates in one call (% > 25).', jsonb_array_length(v_items);
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_id  := nullif(btrim(v_item ->> 'id'), '');
    v_url := nullif(btrim(v_item ->> 'url'), '');

    -- A malformed entry is skipped, not raised: one bad row must not cost the
    -- run its other four.
    if v_id is null or v_url is null
       or nullif(btrim(v_item ->> 'headline'), '') is null
       or nullif(btrim(v_item ->> 'blurb'), '') is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if jsonb_typeof(v_item -> 'topics') = 'array' then
      select array_agg(lower(btrim(t)))
        into v_topics
        from jsonb_array_elements_text(v_item -> 'topics') t
       where nullif(btrim(t), '') is not null;
    else
      v_topics := null;
    end if;

    insert into public.socials (
      id, headline, url, source, published, blurb, why, topics, media, image,
      platforms, status
    )
    values (
      v_id,
      btrim(v_item ->> 'headline'),
      v_url,
      nullif(btrim(v_item ->> 'source'), ''),
      nullif(btrim(v_item ->> 'published'), ''),
      btrim(v_item ->> 'blurb'),
      nullif(btrim(v_item ->> 'why'), ''),
      v_topics,
      nullif(btrim(v_item ->> 'media'), ''),
      -- A fabricated or relative image path is dropped rather than stored.
      case when (v_item ->> 'image') ~* '^https?://' then btrim(v_item ->> 'image') else null end,
      case when jsonb_typeof(v_item -> 'platforms') = 'array' then v_item -> 'platforms' else null end,
      'review'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$fn$;

comment on function public.tgb_pull_socials_candidates(jsonb) is
  'Insert-only candidate pull for TGB SOCIAL BOT. Always status review; skips a '
  'url already present. Callable with the publishable key.';

grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: the 30 candidates that were in mc/socials/socials.json when this
-- migration was written, so the move loses nothing. All land at 'review' --
-- the decisions made before this point lived in one browser's localStorage and
-- are not recoverable here.
-- ---------------------------------------------------------------------------
insert into public.socials
  (id, headline, url, source, published, blurb, why, topics, media, image, platforms)
values
  ('2026-08-04-1', 'Chess.com Bughouse Championship To Start On August 3', 'https://www.chess.com/news/view/announcing-chesscom-bughouse-championship-2026', 'Chess.com', '2026-07-29', 'This week''s Chess.com Bughouse Championship pairs teammates on separate boards: capture a piece and it doesn''t vanish, it goes into your partner''s hand to drop back onto their board.', 'A chess variant most people have never seen, chaotic and team-based, run as a real $5,000 championship this week.', array['games', 'competition']::text[], 'photo', 'https://images.chesscomfiles.com/uploads/v1/news/2091007.68bc5101.5000x5000o.8a2747d5f966.png', '[{"name": "X", "why": "the chess crowd lives here, the format explanation is the whole hook"}, {"name": "Facebook", "why": "bughouse''s rules need a sentence of setup before the link earns the click"}]'::jsonb),
  ('2026-08-04-2', 'Documentary Chronicles Sunset Marquis Hotel''s Six Decades as Rock Music Refuge', 'https://wmgk.com/2026/07/30/documentary-chronicles-sunset-marquis-hotels-six-decades-as-rock-music-refuge/', '102.9 WMGK', '2026-07-30', 'A new documentary premiering August 14 traces how West Hollywood''s Sunset Marquis, a motel turned hotel with its own recording studio, sheltered touring rock stars for six decades.', 'A real place you could book a room in, with six decades of rock history behind the front desk.', array['music', 'tv']::text[], 'photo', 'https://wmgk.com/uploads/2026/07/GettyImages-84843500-e1785446489662.jpg?auto=webp', '[{"name": "Instagram", "why": "the hotel''s rock-and-roll mystique carries a feed post on its own"}, {"name": "YouTube", "why": "a documentary premiere is a natural Community post pointing at the trailer"}]'::jsonb),
  ('2026-08-04-3', 'A Library Book Hidden in an Australian Fireplace Has Been Returned After 150 Years', 'https://www.zmescience.com/science/news-science/a-library-book-hidden-in-an-australian-fireplace-has-been-returned-after-150-years/', 'ZME Science', '2026-07-31', 'A Kiama, Australia man renovating his house found an 1858 library book bricked into his fireplace, 150 years overdue and owing a theoretical A$28,000 in fees nobody plans to collect.', 'A perfect little mystery object with a real payoff, exactly the kind of find our players chase on purpose.', array['history', 'weird']::text[], 'photo', 'https://cdn.zmescience.com/wp-content/uploads/2026/07/old-book-scaled.jpg', '[{"name": "Instagram", "why": "the water-damaged 1858 book and library photos carry a feed post"}, {"name": "X", "why": "a 150-year overdue fine is a quick, shareable fact, link preview does the rest"}]'::jsonb),
  ('2026-08-04-4', 'A 1.5-tonne torta sets a new world record at Mexico City''s Torta Fair', 'https://mexiconewsdaily.com/culture/1-5-tonne-torta-new-world-record-mexico-citys-torta-fair/', 'Mexico News Daily', '2026-07-30', 'More than 100 torta makers in Mexico City assembled a single 100-meter sandwich this week, fifty-some fillings from mole to wild boar, for a new Guinness record at the city''s Torta Fair.', 'Competition and food collide at absurd scale, and it happened this week at a real 600,000-person festival.', array['food', 'competition']::text[], 'photo', 'https://mexiconewsdaily.com/wp-content/uploads/2026/07/759101977_4438799916335564_5216712599220964783_n.png.jpeg', '[{"name": "Instagram", "why": "a 100-meter sandwich assembled on tables is a strong feed photo"}, {"name": "X", "why": "a fresh Guinness record is a quick, shareable fact, link preview does the work"}]'::jsonb),
  ('2026-08-04-5', '53-year-old message in a bottle leads to bittersweet discovery from Laurie Blair', 'https://abc11.com/story/53-year-old-message-bottle-leads-bittersweet-discovery-laurie-blair/19591317/', 'ABC11 Raleigh-Durham', '2026-07-28', 'A New Jersey wetlands cleanup turned up a bottle a 9-year-old tossed into the ocean in 1973, claiming she''d been kidnapped by sponge fishermen, a joke that reached her family 53 years late.', 'A message-in-a-bottle story with a real, unexpectedly moving ending instead of a punchline.', array['weird', 'history']::text[], 'photo', 'https://cdn.abcotvs.com/dip/images/19585250_072426-wpvi-MESSAGEINBOTTLE-thumb.jpg?w=1600', '[{"name": "Facebook", "why": "the bittersweet ending needs a sentence of setup before the link earns the click"}, {"name": "X", "why": "a decades-old note washing up is a quick, shareable oddity"}]'::jsonb),
  ('2026-08-05-1', 'The Partnership That Rebuilt Colorado''s Iconic Hanging Lake Trail', 'https://unofficialnetworks.com/2026/08/02/hanging-lake-trail-rebuilt/', 'Unofficial Networks', '2026-07-28', 'Colorado''s Hanging Lake trail reopens after wildfire and mudslides wiped it out three years ago, rebuilt with seven new bridges and a thousand hand-set stone steps meant to outlast a century.', 'A real trail our players could actually walk, with a three-year rebuild story behind every step of it.', array['travel', 'tourism']::text[], 'photo', 'https://unofficialnetworks.com/wp-content/uploads/2026/07/Screenshot-2026-07-28-at-2.28.17-PM-scaled.jpg', '[{"name": "Instagram", "why": "the turquoise lake and rebuilt boardwalk carry a feed post on their own"}, {"name": "Facebook", "why": "the wildfire-to-reopening arc needs a sentence of setup before the link earns the click"}]'::jsonb),
  ('2026-08-05-2', 'The summer of Jimothy: Why we''re still talking about the viral raccoon', 'https://www.yahoo.com/news/us/article/the-summer-of-jimothy-why-were-still-talking-about-the-viral-raccoon-192810986.html', 'Yahoo News', '2026-07-31', 'A Seattle raccoon named Jimothy, born with a spinal deformity, went viral in July and now has a city council proclamation, two Mariners theme nights, and a fan base getting tattoos of him.', 'Sports and weird collide when a stadium builds a whole promotion night around a real neighborhood raccoon.', array['sports', 'weird']::text[], 'photo', 'https://s.yimg.com/lo/mysterio/api/986c149eb465eeaf8654f0e23e1ec2334818df7d31ebb9fd391e99cb3340c940/lightyear_networkapi/resizefill_w1200%3Bquality_80%3Bformat_jpg/https%3A%2F%2Fd29szjachogqwa.cloudfront.net%2Fimages%2Fuser-uploaded%2Fthumb-jimothy_9045.jpg', '[{"name": "X", "why": "a viral raccoon turned civic mascot is a quick, shareable oddity, link preview does the work"}, {"name": "Instagram", "why": "fans holding Jimothy signs at the ballpark carry a feed post"}]'::jsonb),
  ('2026-08-05-3', 'Prelude to Doomsday: Are We Getting an Avengers ARG?', 'https://www.argn.com/2026/08/prelude_to_doomsday_are_we_getting_an_avengers_arg/', 'ARGNet', '2026-08-02', 'Robert Downey Jr''s Comic-Con jacket was covered in a runic alphabet, and Marvel fans have already cracked most of it, tracing the code back to a coffee pop-up planted months earlier at SXSW London.', 'Real fans doing real cryptanalysis on a movie promo, which is just an ARG with better production value.', array['games']::text[], 'photo', 'https://www.argn.com/images/avengers-doomsday_doctor-doom-latverian-cipher-suit.jpg', '[{"name": "X", "why": "puzzle fans tracking a live cipher is exactly the crowd here, link preview does the work"}, {"name": "Instagram", "why": "the decoded rune alphabet and jacket close-ups carry a feed post for puzzle-minded followers"}]'::jsonb),
  ('2026-08-05-4', 'Peachoid Water Tower, Gaffney, South Carolina', 'https://www.roadsideamerica.com/story/2213', 'Roadside America', '2026-08-03', 'Gaffney, South Carolina keeps a one-million-gallon water tower painted like a peach beside the interstate, repainted once in the 90s because it looked a little too much like something else.', 'The platonic ideal of a roadside attraction: absurd, visible from the highway, and worth the detour.', array['weird', 'tourism']::text[], 'gallery', 'https://www.roadsideamerica.com/attract/images/sc/SCGAFpeach_leeandpaul2.jpg', '[{"name": "Instagram", "why": "the bright orange peach tower by day and lit up at night is a strong feed pair"}, {"name": "X", "why": "a giant peach-shaped water tower on the interstate is a quick, shareable oddity"}]'::jsonb),
  ('2026-08-05-5', 'Union Oyster House Marks 200 Years as Nation''s Oldest Operating Restaurant', 'https://wror.com/2026/08/04/union-oyster-house-marks-200-years-as-nations-oldest-operating-restaurant/', '105.7 WROR', '2026-08-04', 'Boston''s Union Oyster House turns 200 this year, the country''s oldest restaurant still serving the clam chowder and stuffed clams it fed to JFK, FDR, and a young Queen Elizabeth II.', 'A real stop on the Freedom Trail with two centuries of continuous history behind the same seafood.', array['food', 'history']::text[], 'photo', 'https://wror.com/uploads/2026/08/GettyImages-1216877769.jpg?auto=webp', '[{"name": "Facebook", "why": "two centuries of presidents and clam chowder needs a sentence of setup before the link earns the click"}, {"name": "X", "why": "a 200th anniversary is a quick, shareable historical fact"}]'::jsonb),
  ('2026-08-05-0411-1', 'Cardboard boats race — and sink — in Riverhead: photos and results', 'https://riverheadlocal.com/2026/08/02/cardboard-boat-races-riverhead/', 'RiverheadLOCAL', '2026-08-02', 'Riverhead''s Peconic riverfront turns into a demolition derby every August: boats built from cardboard and duct tape, a ''Titanic Award'' for best sinking, and trophies for the ones that actually float.', 'A real, silly, low-stakes competition with a photo gallery of boats sinking, exactly the spectacle our players love.', array['competition', 'weird']::text[], 'gallery', 'https://riverheadlocal.com/wp-content/uploads/2026/08/2026_0801_cardboard_boat_races-34.jpeg', '[{"name": "Instagram", "why": "photo gallery of boats sinking and floating carries a feed post"}, {"name": "X", "why": "a shareable hyperlocal oddity, link preview does the work"}]'::jsonb),
  ('2026-08-05-0411-2', 'Gen Con''s Roof Failed Mid-Convention, And Vendors Are Still Adding Up The Damage', 'https://www.fandompulse.com/p/gen-cons-roof-failed-mid-convention', 'Fandom Pulse', '2026-08-04', 'Rain broke through the roof of Gen Con''s main hall mid-convention this year, and 72,000 board gamers barely noticed, setting a third straight attendance record anyway.', 'The world''s biggest tabletop gaming convention hit its third straight attendance record, told through the one story that isn''t a press release.', array['games', 'weird']::text[], 'photo', 'https://substackcdn.com/image/fetch/$s_!Xm7_!,w_1200,h_675,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F131e92fa-c2ba-4970-8f1c-fa7d24f42a9e_1252x792.png', '[{"name": "X", "why": "quick, shareable oddity from the world''s biggest tabletop con, link preview does the work"}, {"name": "Instagram", "why": "the water-damage photo works as a Story with a link sticker"}]'::jsonb),
  ('2026-08-05-0411-3', 'SFO wants you to visit for fun. Of the 31 people I asked, only one agreed', 'https://sfstandard.com/2026/08/02/sfo-airport-tourism-gate-explorer/', 'The San Francisco Standard', '2026-08-02', 'A reporter spent 11 hours inside SFO on a program that lets you tour the terminals without a boarding pass, then asked 31 strangers if they''d come back for fun. One said yes.', 'First-person immersion in a genuinely weird travel product, exactly the kind of thing our players do without meaning to.', array['travel']::text[], 'photo', 'https://assets.sfstandard.com/image/994911177489/image_6vff9gjfnp6m1cesjq1h94d753/-C100.00%25x78.71%25%2C0.00%25%2C16.80%25-S1200x630-FPNG', '[{"name": "Facebook", "why": "the deadpan 11-hour experiment needs a sentence of setup before the link earns the click"}, {"name": "X", "why": "a reporter''s stunt premise is the payload, link preview does the work"}]'::jsonb),
  ('2026-08-05-0411-4', 'EXCLUSIVE: The 2026 Traitors Australia cast tease ''stressful'' surprises that will leave you ''terrified''', 'https://www.who.com.au/entertainment/reality-tv/the-traitors-australia-cast-2026/', 'WHO Magazine (Australia)', '2026-07-29', 'The Traitors Australia returns with a new host and a fresh cast of reality veterans, playing the same brutal parlor game of trust and betrayal that keeps recruiting bigger stars each season.', 'A hit reality show that''s basically a live-action social deduction game with a camera crew attached, our genre with a bigger budget.', array['games', 'tv']::text[], 'photo', 'https://api.photon.aremedia.net.au/wp-content/uploads/sites/15/2025/10/untitled-design-2026-07-29t130802.139-6a696e9ba3baa.png?resize=1200%2C630&format=auto', '[{"name": "X", "why": "cast reveal and premiere news, link preview does the work"}, {"name": "Instagram", "why": "25-plus cast photos work as a Story with a link sticker"}]'::jsonb),
  ('2026-08-05-0411-5', 'ORA Trails reopens bicentennial trail after completing reroute project', 'https://www.weau.com/2026/08/04/ora-trails-reopens-bicentennial-trail-after-completing-reroute-project/', 'WEAU 13 News', '2026-08-04', 'Volunteers in La Crosse, Wisconsin spent seven weeks rebuilding the steepest, most eroded stretch of Hixon Forest''s Bicentennial Trail into safer switchbacks, funded entirely by local donations.', 'A real trail our hiking-minded players can go walk, rebuilt switchback by switchback on local donations.', array['tourism']::text[], 'text', 'https://gray-weau-prod.gtv-cdn.com/resizer/v2/5ER2NDSGL5BYNOFQQPLYGJDC6I.jpg?auth=ed796019e49d14f09b1c51c8a2d6972be49d70e85e5f746869d14e44184f0734&width=1200&height=600&smart=true', '[{"name": "Facebook", "why": "a volunteer-funded trail rebuild needs a sentence of setup before the link earns the click"}, {"name": "X", "why": "a trail reopening is a quick, shareable local fact"}]'::jsonb),
  ('2026-08-05-1224-1', 'What''s the Record for Hot Dog Eating? Inside the Contest Dominated by Joey Chestnut', 'https://www.guinnessworldrecords.com/news/2026/8/whats-the-record-for-hot-dog-eating-inside-famous-contest-dominated-by-joey-chestnut', 'Guinness World Records', '2026-08-04', 'At Coney Island, Joey Chestnut ate 66 hot dogs in ten minutes for his 18th Mustard Belt, still short of the 76 he once ate to set the record himself.', 'A real world record with a real defending champion, competitive eating played dead straight.', array['competition', 'food']::text[], 'photo', null, '[{"name": "X", "why": "a record explainer with a famous name is a quick, shareable fact, link preview does the work"}, {"name": "Instagram", "why": "the belt ceremony and the sheer number of hot dogs carry a feed post"}]'::jsonb),
  ('2026-08-05-1224-2', 'Local Event to Feature World''s Largest Puzzle', 'https://fortworthbusiness.com/entertainment/local-event-to-feature-worlds-largest-puzzle/', 'Fort Worth Business', '2026-07-22', 'Fort Worth''s third annual Speed Puzzle Showdown raced competitors against a 60,000-piece puzzle the size of a billboard, in a hobby now dominated by women.', 'Our own genre exactly: competitive speed puzzling with a real community and a world-record-sized prop.', array['games']::text[], 'photo', 'https://fortworthbusiness.com/media/2026/07/attachment1784134423123.jpeg', '[{"name": "Instagram", "why": "an 8-foot-tall, 29-foot-wide puzzle is a strong feed photo on its own"}, {"name": "X", "why": "puzzle-community trivia and a shareable record, link preview does the work"}]'::jsonb),
  ('2026-08-05-1224-3', 'Section of Appalachian Trail Reopens Nearly 2 Years After Helene Damage', 'https://wlos.com/news/local/appalachian-trail-helene-reopens-north-carolina-tennessee-iron-mountain-gap-area', 'WLOS', '2026-07-30', 'A 5.5-mile stretch of the Appalachian Trail at Iron Mountain Gap has reopened, nearly two years after Hurricane Helene buried it under fallen trees.', 'A real trail our players could walk again, with a storm-recovery story behind every mile of it.', array['travel', 'tourism']::text[], 'photo', 'https://wlos.com/resources/media2/16x9/1280/1174/center/80/5f42b55f-6d4a-477c-b10a-e3b2b3994c17-VABIRTHDAYHIKEVO_frame_605.jpeg', '[{"name": "Facebook", "why": "a two-year storm-recovery arc needs a sentence of setup before the link earns the click"}, {"name": "Instagram", "why": "a reopened trail photo carries a feed post for hikers"}]'::jsonb),
  ('2026-08-05-1224-4', 'Search for B.C.''s Best Roadside Attraction: Round 1, Southwest B.C.', 'https://www.cbc.ca/news/canada/british-columbia/bc-roadside-attraction-round-1-9.7295443', 'CBC News', '2026-08-04', 'CBC is running a month-long bracket to crown British Columbia''s best roadside attraction, pitting a chainsaw-carved Rambo statue in Hope against 31 rivals.', 'A whole newsroom turned a province''s roadside kitsch into a bracket, which is just a scavenger hunt with a ballot.', array['games', 'weird']::text[], 'gallery', 'https://i.cbc.ca/ais/a8176db7-6474-428d-b451-55a30d2f3400,1785854367790/full/max/0/default.jpg?im=Crop%2Crect%3D%280%2C0%2C1920%2C1080%29%3BResize%3D620', '[{"name": "X", "why": "a bracket vote is a quick, shareable game, link preview does the work"}, {"name": "Instagram", "why": "the chainsaw-carved Rambo statue and rival roadside stops carry a feed post"}]'::jsonb),
  ('2026-08-05-1224-5', 'Six Flags Great Adventure Unveils Bakunawa, the World''s Tallest and Fastest Spinning Launch Coaster', 'https://amusementtoday.com/2026/07/six-flags-great-adventure-unveils-bakunawa-the-worlds-tallest-and-fastest-spinning-launch-coaster/', 'Amusement Today', '2026-07-29', 'Six Flags Great Adventure''s new coaster Bakunawa, named for a moon-eating dragon from Philippine myth, will hold six world records including fastest spinning coaster on earth.', 'A real destination ride with a real mythology behind it and six Guinness-grade superlatives to boot.', array['weird', 'travel']::text[], 'photo', 'https://amusementtoday.com/wp-content/uploads/2026/07/Bakunawa-Image-13-1024x663.jpg', '[{"name": "Instagram", "why": "the coaster''s dragon-scale trains and drop carry a feed post"}, {"name": "X", "why": "six world records in one ride is a quick, shareable fact"}]'::jsonb),
  ('2026-08-05-1255-1', 'Day-by-Day Guide to the 2026 DCI World Championships', 'https://www.dci.org/news/day-by-day-guide-to-the-2026-dci-world-championships/', 'Drum Corps International', '2026-07-29', 'Forty-six drum and bugle corps march for a title this week at Lucas Oil Stadium, the 17th straight year Indianapolis has hosted marching music''s biggest championship.', 'Marching band as elite sport, staged in a stadium most fans have never thought to visit for music.', array['music', 'competition']::text[], 'photo', 'https://images.dci.org/wp-content/uploads/2026/07/2026-world-champs-day-by-day-lead-scaled.jpg', '[{"name": "Instagram", "why": "a massed corps on the field at Lucas Oil Stadium is a strong feed photo"}, {"name": "X", "why": "a championship schedule and quick scale fact, link preview does the work"}]'::jsonb),
  ('2026-08-05-1255-2', 'New Trail Open for Hiking and Cycling Expands Eugene''s Ridgeline Trail System', 'https://lookouteugene-springfield.com/story/outdoors/2026/07/30/new-trail-open-for-hiking-and-cycling-expands-eugenes-ridgeline-trail-system/', 'Lookout Eugene-Springfield', '2026-07-30', 'Eugene just opened a new 2.5-mile trail through 194 acres of oak savanna and prairie, closing a 3.8-mile loop between Blanton Ridge Park and a new trailhead on Willamette Street.', 'A real new trail our hiking-minded players could walk this weekend, finished mid-project this summer.', array['travel', 'tourism']::text[], 'photo', 'https://i0.wp.com/lookouteugene-springfield.com/wp-content/uploads/759479848_1471528108338117_6533747667994853263_n.jpg?fit=1440%2C1440&ssl=1', '[{"name": "Instagram", "why": "the new prairie trail and trailhead carry a feed post on their own"}, {"name": "Facebook", "why": "the loop''s connection to the wider trail system needs a sentence of setup before the link earns the click"}]'::jsonb),
  ('2026-08-05-1255-3', 'L&A County MEGA Geocache Event Returns Aug. 12 to 16', 'https://napaneebeaver.ca/la-county-mega-geocache-event-returs-aug-12-to-16/', 'Napanee Beaver', '2026-07-28', 'Napanee, Ontario hides more than 1,500 geocaches around town this month for Canada''s only recurring mega geocaching event, an 11th edition built around a history-and-mystery theme.', 'Our own genre exactly: a real town turning itself into a 1,500-cache hunt for one week a year.', array['games']::text[], 'text', null, '[{"name": "X", "why": "a 1,500-cache count is a quick, shareable fact, link preview does the work"}, {"name": "Facebook", "why": "the small-town, history-and-mystery angle needs a sentence of setup before the link earns the click"}]'::jsonb),
  ('2026-08-05-1255-4', 'Crystal Cave, Kutztown, Pennsylvania', 'https://www.roadsideamerica.com/story/12021', 'Roadside America', '2026-07-27', 'Crystal Cave near Kutztown, PA opened in 1873 as Pennsylvania''s first commercial cave, its limestone twisted into formations nicknamed things like the Upside-Down Ice Cream Cone.', 'A genuinely old roadside attraction with formations that reward close looking, exactly our kind of detour.', array['weird', 'history']::text[], 'photo', 'https://www.roadsideamerica.com/attract/images/pa/PAKUTcrystal_well_dk2.jpg', '[{"name": "Instagram", "why": "the cave''s whimsical rock formations carry a feed post"}, {"name": "Facebook", "why": "150-plus years of cave history needs a sentence of setup before the link earns the click"}]'::jsonb),
  ('2026-08-05-1255-5', 'Poised Pooches Ride the Waves in World Dog Surfing Championships', 'https://www.upi.com/Odd_News/2026/08/03/World-Dog-Surfing-Championships-Linda-Del-Mar-Beach-Pacifica/1341785777091/', 'UPI', '2026-08-03', 'A mixed breed named Bradley "Shortboard" Cooper won the small-dog division at Pacifica''s 10th annual World Dog Surfing Championships, where 14 dogs rode real waves for medals and towel robes.', 'Real dogs competing at a real judged sport on a real beach, our kind of spectacle exactly.', array['competition', 'weird']::text[], 'photo', 'https://cdnph.upi.com/ph/st/th/1341785777091/2026/i/17857775643349/v1.5/Poised-pooches-ride-the-waves-in-World-Dog-Surfing-Championships.jpg?lg=5', '[{"name": "Instagram", "why": "a dog mid-ride on a surfboard is a strong feed photo"}, {"name": "X", "why": "a judged dog-surfing contest is a quick, shareable oddity, link preview does the work"}]'::jsonb),
  ('2026-08-05-1500-1', 'Minor League promotions for August 2026', 'https://www.mlb.com/news/minor-league-promotions-august-2026', 'MLB.com', '2026-07-31', 'A giant bubble once floated onto the field in Spartanburg and delayed a game. There is now a bubblehead. August in the minors also brings a pudding-versus-mayonnaise blind taste test.', 'Minor league promo nights are the closest thing pro sports has to our design brief: make the place itself the game.', array['sports', 'weird']::text[], 'photo', 'https://img.mlbstatic.com/mlb-images/image/upload/t_2x1/t_w1536/mlb/tr6f32rlyop8eashqf2d.jpg', '[{"name": "X", "why": "a list of absurdities where the link preview does the work"}, {"name": "Facebook", "why": "minor league towns are local pride, and the roundup rewards a scroll"}]'::jsonb),
  ('2026-08-05-1500-2', 'Watch: Idaho family breaks world record for Hungry Hungry Hippos', 'https://www.upi.com/Odd_News/2026/08/03/Guinness-World-Records-David-Rush-Hungry-Hungry-Hippos/2001785770970/', 'UPI', '2026-08-03', 'David Rush and his family cleared a Hungry Hungry Hippos board in 3.75 seconds, one finger each, no swapping. It was his 200th Guinness title held at once, the third person ever to get there.', 'A board game taken seriously enough to become a world record is exactly our overlap of games and competition.', array['games', 'competition']::text[], 'video', 'https://cdnph.upi.com/ph/st/th/2001785770970/2026/i/17857711151175/v1.5/Idaho-family-breaks-world-record-for-Hungry-Hungry-Hippos.jpg?lg=5', '[{"name": "X", "why": "one number and one board game, the link is the whole payload"}, {"name": "Instagram", "why": "Story with a link sticker; the board reads instantly at thumb size"}]'::jsonb),
  ('2026-08-05-1500-3', 'An Escape Room Music Video From Lockhill', 'https://roomescapeartist.com/2026/08/01/an-escape-room-music-video-from-lockhill/', 'Room Escape Artist', '2026-08-01', 'An Athens escape room hired a composer, a vocalist and a videographer and put out a music video instead of a trailer. The format barely exists yet, and Lockhill got there first.', 'Game makers reaching for a new promo language is our own industry thinking out loud.', array['games', 'music']::text[], 'video', 'https://roomescapeartist.com/wp-content/uploads/2026/07/House-on-the-Hill-music-video-woman.jpg', '[{"name": "YouTube", "why": "the story is a music video, so the video is the post"}, {"name": "X", "why": "a format nobody has tried before travels well as a link"}]'::jsonb),
  ('2026-08-05-1500-4', 'First cyclists and pedestrians ''excited,'' ''overwhelmed'' to cross Gordie Howe International Bridge', 'https://www.cbc.ca/news/canada/windsor/gordie-howe-bridge-active-transportation-opening-9.7296030', 'CBC News', '2026-08-05', 'As of eight this morning you can walk from Detroit into Canada. The Gordie Howe bridge opened its free path to bikes and feet, about 45 minutes across, passport waiting at the far end.', 'A brand new international walk is the literal version of what our games ask people to do: go there on foot.', array['travel', 'tourism']::text[], 'photo', 'https://i.cbc.ca/ais/ba19cc81-24a4-46e3-9420-3c2c7c370d98,1785938565603/full/max/0/default.jpg?im=Crop%2Crect%3D%280%2C152%2C1600%2C900%29%3BResize%3D620', '[{"name": "Instagram", "why": "feed post; the shot of riders passing mid-span carries it"}, {"name": "Facebook", "why": "a Detroit and Windsor hometown story that wants a sentence of setup"}, {"name": "X", "why": "opened this morning, so the link is the news"}]'::jsonb),
  ('2026-08-05-1500-5', 'The Michelin Guide has awarded stars for 100 years. These dishes tell its story', 'https://www.cnn.com/travel/michelin-star-restaurant-dishes', 'CNN', '2026-07-30', 'A tire company printed a guidebook in 1900 so drivers could find a garage. A century of stars later, the mandarin on the plate at Heston Blumenthal turns out to be chicken liver.', 'Michelin started as a road trip tool, which is a nice reminder that travel infrastructure becomes culture.', array['food', 'history']::text[], 'gallery', 'https://media.cnn.com/api/v1/images/stellar/prod/mandarin-oriental-hyde-park-london-meat-fruit-at-dinner-by-heston-blumenthal.jpg?c=16x9&q=w_800,c_fill', '[{"name": "Facebook", "why": "the long read of the batch, and the caption can breathe"}, {"name": "Instagram", "why": "feed post; it is a gallery of plated dishes and they do the talking"}]'::jsonb)
on conflict (id) do nothing;

-- The overlay table this replaces. Created earlier the same day, it only ever
-- held decisions; the content it pointed at now lives here.
drop table if exists public.socials_post_state;
