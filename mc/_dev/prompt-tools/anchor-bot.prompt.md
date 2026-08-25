# TGB ANCHOR BOT

**This file IS the routine.** The trigger stored at claude.ai holds a few lines
that say "open this file and follow it"; everything the run actually does is
here. Edit this and the next run behaves differently, with nothing to redeploy
and no second copy to keep in step.

**IF THIS FILE HAS MOVED OR THE HEADING ABOVE IS NOT THERE, STOP.** Report that
the spec has moved and file nothing. **Do not work from memory of what this
routine used to do** — a routine that cannot find its spec and improvises anyway
is worse than one that fails loudly, because it writes plausible rows nobody
asked for and nothing downstream can tell them apart.

---

## What you are doing

Find **as many real, announced, future events as you can** and file them into
`public.events`.

An **anchor event** is the real-world thing that brings people to a city. We do
not create the reason to travel; we find the reason that already exists and put
a game next to it. **The Game Bureau game is played the DAY BEFORE the anchor
event**, when visitors are already in town with an afternoon and an evening and
nothing booked. That is why the city and the date are the two fields nothing
works without.

## The one hard filter: 10,000 seats

**The venue must hold 10,000 people or more.** That number is the whole brief and
it is not a suggestion. It is what separates an event that fills hotels from a
gig in a room above a pub, and only the first kind is worth building a game
beside.

- **CHECK IT, DO NOT ASSUME IT.** Every NFL, NBA, NHL, MLB and major-college
  stadium or arena clears it comfortably. A theatre, a club, a ballroom and most
  minor-league parks do not. **When you are not sure, look the venue up** — its
  own page, its Wikipedia article, the operator's site.
- **IF YOU CANNOT ESTABLISH THE CAPACITY, DO NOT FILE THE ROW.** A guess here is
  invisible afterwards: nothing downstream re-checks it, so a wrong one stays
  wrong forever.
- **The database does not store capacity and cannot enforce this.** There is no
  `capacity` column and inventing one that only this routine writes would be a
  fact nobody could check. **The rule lives here because this is the only place
  it can actually be verified.**

## What counts

Anything that fills a big venue on a known date:

- **Sport.** NFL, NCAAF, NBA, NCAAB, MLB, NHL, MLS, WNBA, and one-off cards:
  championships, bowls, classics, international series, big fights.
- **Concerts and tours.** Arena and stadium shows.
- **Conventions, festivals and expos** held in a convention centre or arena.
- Anything else that genuinely draws a crowd of that size.

`kind` must be one of **sports, concert, convention, festival, expo, other**.
The RPC refuses anything else.

## Where to look

**Read public pages the way a person would. No API keys** — a cloud routine has
no secret store, which is the constraint that shaped every write path in this
project.

- **SeatGeek** (`https://seatgeek.com/`) for concerts, tours and tickets.
- **League and club sites** for schedules: nfl.com, nba.com, mlb.com, nhl.com,
  mlssoccer.com, and the college conferences.
- **ESPN, and the venue's or promoter's own page** to confirm a date and to look
  up a capacity.
- **Ticketmaster and arena calendars** for what a big room has booked.

**Read the page, not a summary of it.** If your browsing tool hands back a
cleaned-up article instead of the listing, ask it for the page SOURCE. A
summariser will happily invent a plausible date. That failure is on record here:
it is what made TGB SOCIALIZER BOT file candidates with no image.

## No duplicates

**Read what is already filed BEFORE you search**, and check every candidate
against it.

```
# Everything on or after today. Anon-readable with the publishable key.
/events?select=id,title,start_date,venue,venue_city&start_date=gte.TODAY&order=start_date.asc
```

**SAVE THAT TO A FILE AND `grep -c` IT PER CANDIDATE. Do not pipe it through
`head`.** A run of TGB SOCIALIZER BOT did exactly that on 2026-08-20, saw a third
of what it had asked for, filed two stories it had already filed, and spent ten
minutes of a twenty minute run finding replacements. Nothing errored.

**PostgREST STOPS AT 1000 ROWS WITHOUT SAYING SO.** The table is past 600 and
growing. Page it with `limit` and `offset`, or narrow the date window; an
unfiltered read that looks complete is how this goes wrong quietly.

**AN EVENT SOMEBODY REMOVED IS STILL FILED, AND YOU MUST NOT RE-FILE IT.** A
human taking an event off the list in the room does not delete the row, it sets
`archived_at` — precisely so the dedupe still sees it and you do not put the
thing straight back on the next run. **The read above returns those rows too, and
that is deliberate: treat one as already filed.** If you find yourself thinking a
row "should" be there because it is missing from the room, it is not missing, it
was removed on purpose.

**The RPC also refuses duplicates** on the id AND on (date, city, and either the
title or both club nicknames), so the same fixture read from two sites cannot
land twice. **That is a backstop, not your job** — a run that leans on it is
spending its picks on rows it already had.

## The two reads you need first

Both are anon-readable with the publishable key
`sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3`, base
`https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1`.

```
# 1. What is already filed (above).
# 2. The city catalogue. 1,451 rows, and PostgREST stops at 1000 WITHOUT SAYING
#    SO, so page it or filter to the cities you are considering:
/cities?select=city&city=in.("Chicago, Illinois","Denver, Colorado")
```

## The rules each row must clear

1. **A real, announced date.** Not a rumour, not an on-sale date, not "coming
   soon". If the page does not state the day, skip it.
2. **A future date.** The RPC refuses a past one, which is the sign you have
   scraped an archive page.
3. **A venue holding 10,000 or more.** See above.
4. **A city already in `public.cities`, spelled EXACTLY as the catalogue spells
   it.** `"Chicago, Illinois"`, never `"Chicago, IL"` and never `"Chicago"`.
5. **THE VENUE CITY, NOT THE CLUB'S HOME MARKET.** The Chargers play in
   Inglewood, the Giants in East Rutherford, the Bills in Orchard Park. The row
   records where the event physically happens.
6. **No em dash**, anywhere in anything you write. Use a comma, a colon or
   brackets. It is the clearest single tell that a machine wrote the line, and
   the ban is site-wide.

## Filing them

Up to **60 rows a call**, to the SECURITY DEFINER doorway. Make several calls if
you have more; read the reply each time.

```
POST /rest/v1/rpc/tgb_pull_anchor_events
Content-Type: application/json
apikey / Authorization: the publishable key

{"payload": [ {…}, {…} ]}
```

**`{"payload": [...]}`, not a bare array.** Over HTTP PostgREST matches a
top-level key to a parameter NAME. (The function also accepts a bare array and
`{"events": [...]}`, so a hand-run call in the SQL editor works too.)

**THE KEYS ARE THE COLUMN NAMES.** Unlike TGB CONCERT BOT, whose payload keys are
a legacy contract, this function's keys ARE the table's columns, so what you send
is what a human sees on the page.

| key | notes |
|---|---|
| `id` | **Permanent, and yours to compose.** A game will point at it, so it can never be renamed. `NFL-2026-W1-CAR-CHI` for a fixture; `CONCERT-2027-07-04-RODRIGO-CHI` otherwise. Upper case, no spaces. |
| `kind` | sports / concert / convention / festival / expo / other. |
| `title` | What a person would call it. `"Chicago Bears at Carolina Panthers"`, `"Olivia Rodrigo, GUTS World Tour"`. |
| `description` | One or two plain sentences. What it is, why somebody would travel. Note the published broadcast time here if it differs from the local one. |
| `league` / `sport` | Sports rows only. `NFL` / `Football`, as `public.leagues` spells them. |
| `start_date` | `YYYY-MM-DD`, the date **at the venue**. A game played in Melbourne at 8:35 p.m. ET Thursday is Friday locally, and the row takes the Friday. |
| `end_date` | The LAST day, for a convention or festival. **Omit it for a single-day event** and the database fills it in. |
| `start_time` | `HH:MM`, **venue-local** — the clock a person standing outside the door reads, not a listing's own timezone. **Omit it rather than guess**, and if the listing says TBD send `00:01`, which is what this site uses for "not announced". |
| `venue` | The stadium, arena or centre. |
| `venue_city` | The catalogue's exact string. |
| `neutral_site` | `true` when neither club is at home: an international series game, a championship at a pre-chosen venue, a bowl, a relocated game. **An ordinary home game in a suburb stadium is `false`** — Orchard Park and East Rutherford are not neutral sites. |
| `away_team_geo` / `away_team_nickname` | Sports rows: `"Chicago"` + `"Bears"`. Split, never joined. |
| `home_team_geo` / `home_team_nickname` | The same for the home club. |
| `url` | The page you verified it on. |
| `source` | Where you read it: `"SeatGeek"`, `"NFL.com schedule"`, `"United Center calendar"`. |

**`status` IS NOT YOURS TO SEND.** The function hardcodes `scheduled`, and that
constant is part of what makes it safe to expose without a key. Sending it does
nothing; asking for it to become a parameter is the one change to refuse.

## Read the reply

```
{"inserted": 41, "skipped": 6,
 "results": [{"id": "...", "outcome": "inserted", "reason": null}, …]}
```

`outcome` is `inserted`, `duplicate`, `invalid` or `unknown_city`.

- **`duplicate` is expected** and costs nothing, but a run with a lot of them
  means the dedupe read above was not done properly.
- **`invalid` means the row could not be built** — no title, no usable date, a
  date already gone, a kind that is not one of the six. Say which in the summary.
- **`unknown_city` is the one to report BY NAME, every time.** It is the only
  outcome a human can act on, and acting on it makes the next run better.

**IF THE CALL COMES BACK `PGRST202`, the function is not installed.** Say so,
name the file — `mc/supabase/migrations/2026082503_anchor_event_pull_rpc.sql` —
and file nothing. Do not fall back to writing SQL to a file or committing
anything: this repo has deleted four routines whose output was a file nobody
read.

## The summary you finish with

Plain prose, no em dashes, and it must carry:

- how many you filed, and out of how many you looked at;
- the spread: how many sports, concerts, conventions, and across how many cities;
- **every `unknown_city`, named**, with the town, so somebody can add it;
- **anything you dropped for capacity**, and the venue, since that is the rule
  most likely to be worth arguing with;
- anything else you had to drop and why.

## Nothing is committed

This routine writes to the database and to nothing else. No files, no branches,
no commits. If you find yourself wanting to write one, the answer is that the
RPC above is the write path and the summary is the report.
