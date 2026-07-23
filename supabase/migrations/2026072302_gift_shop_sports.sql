-- gift_shop_sports.sql
--
-- Adds a `sports` flag to gift_shop_items (TEXT 'YES' / null, same convention as
-- featured / games.featured) so sports/team merch can be denoted for future
-- filtering. The Stock Room admin has a per-gift "Sports" toggle; this migration
-- also takes a first pass at classifying the existing catalogue by keyword.
--
-- Re-runnable. Tune by hand afterward with the admin toggle — the heuristic is a
-- starting point, not gospel (e.g. a non-team "City by Junk Food" tee or a book
-- literally about cardinal birds could get caught).

alter table public.gift_shop_items
  add column if not exists sports text;

-- First-pass classification: leagues, licensed sports-apparel/accessory brands,
-- team-fan book patterns, sports nouns, and the pro-team nicknames (word-bounded
-- so "saints/bills/jets/eagles/lions/bears/giants/cardinals" match as teams, not
-- stray words). Matches against title + description + url.
update public.gift_shop_items
set sports = 'YES'
where coalesce(sports, '') <> 'YES'
  and (coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, '')) ~* (
        '\y(nfl|nba|mlb|nhl|mls|ncaa|wnba|pga)\y'
     || '|junk food|for bare feet|siskiyou|foco|aminco|fanatics'
     || '|fans should know|sideline|trivia (book|quiz)|\yjersey|\yfootball|\ybaseball|\ybasketball|\yhockey\y|\ysoccer\y|\ystadium\y'
     || '|\y(raiders|patriots|steelers|packers|cowboys|49ers|niners|seahawks|broncos|chiefs|ravens|bengals|browns|lions|vikings|falcons|panthers|buccaneers|chargers|dolphins|titans|colts|jaguars|texans|commanders|saints|bills|jets|giants|eagles|bears|cardinals|red sox|yankees|mets|dodgers|celtics|lakers|knicks|bruins)\y'
      );

-- How many got tagged (uncomment to eyeball after running):
-- select count(*) filter (where sports = 'YES') as sports,
--        count(*)                                as total
--   from public.gift_shop_items;
