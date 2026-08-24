# TGB CONCERT BOT — the specification

**This file IS the routine.** The trigger stored at claude.ai holds four lines
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

Find **10 announced concert tour dates** and file them into
`public.anchor_events` as anchor events.

An **anchor event** is the real-world thing that brings people to a city. We do
not create the reason to travel; we find the reason that already exists and put
a game next to it. **The Game Bureau game is played the DAY BEFORE the anchor
event**, when visitors are already in town with an afternoon and an evening and
nothing booked. That is why a concert date matters to us and why the city and
the date are the two fields nothing works without.

## Where they come from

**SeatGeek.** `https://seatgeek.com/` — browse it. Their concert and tour
listings are public pages; read them the way a person would.

- **No API key, and do not go looking for one.** A cloud routine has no secret
  store, which is the same constraint that shaped every write path in this
  project. The public pages are enough.
- **Read the page, not a summary of it.** If your browsing tool hands back a
  cleaned-up article instead of the listing, ask it for the page source. A
  summariser will happily invent a plausible date.
- **Prefer a tour's own date list** over a single event page: one tour gives you
  several cities, and several cities is what we want.

## The ten

Ten rows a call, and the RPC refuses an eleventh. **Ten of anything is not the
goal — ten USABLE dates is.** If you can only find six that clear the rules
below, file six and say so in the summary. A padded row costs more than a
missing one, because somebody has to notice it is wrong.

**SPREAD THEM ACROSS CITIES AND ACTS.** Ten dates of one tour in one week is a
worse run than ten different cities, because a game is built per city and a
second date in a city we already have adds almost nothing.

**PREFER DATES FAR ENOUGH OUT TO BUILD FOR.** A concert three days from now
cannot have a game built around it. Two months out and beyond is the useful
range; inside three weeks, only take it if it is genuinely notable.

## The rules each row must clear

1. **A real, announced date.** Not a rumour, not an on-sale date, not a
   "coming soon". If the page does not state the day, skip it.
2. **A future date.** The RPC refuses a past one, which is the sign you have
   scraped an archive page.
3. **A city that is already in `public.cities`.** Read the catalogue first (see
   below). **The RPC refuses a city it does not know**, and that refusal is not
   a bug to work around: the catalogue is the one city list the whole site
   reads, and a tour date in a town nothing else knows about cannot be shopped,
   soundtracked or built on. Report the ones you had to drop for this reason and
   name the towns, so a human can add them and the next run picks them up.
4. **The canonical city string, verbatim from the catalogue.** `"Chicago,
   Illinois"`, never `"Chicago, IL"` and never `"Chicago"`. Match on the city
   name, then copy the catalogue's spelling exactly.
5. **THE FANBASE CITY, NEVER THE VENUE SUBURB** — the standing rule across this
   project. If the venue is in a suburb the catalogue holds separately, use the
   town the catalogue actually has. Nobody sells a walking tour of a car park.
6. **A title a person would say.** `"Olivia Rodrigo — GUTS World Tour"` is the
   shape; the act, then the tour if it has a name. **No em dash** — use a comma,
   a colon or brackets. That ban is site-wide and it covers everything you
   write here.
7. **No duplicates of what is already filed.** Read the table first (below).

## Read these two before you search

Both are anon-readable with the publishable key
`sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3`, base
`https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1`.

```
# The concert dates already filed, so you do not spend a pick on one we have.
/anchor_events?select=id,title,city,event_date&kind=eq.concert&order=event_date.asc

# The city catalogue. 1,451 rows, and PostgREST STOPS AT 1000 WITHOUT SAYING SO
# -- an unfiltered read hands you the alphabet to about M and looks complete.
# Page it with Range headers, or filter to the cities you are considering:
/cities?select=city&city=in.("Chicago, Illinois","Denver, Colorado")
```

**SAVE THE FILED LIST TO A FILE AND GREP IT.** Do not pipe it through `head`.
A run of TGB SOCIALIZER BOT did exactly that on 2026-08-20, saw a third of what
it had asked for, filed two stories it had already filed, and spent ten minutes
of a twenty minute run finding replacements. Nothing errored.

## Filing them

One call, ten rows, to the SECURITY DEFINER doorway:

```
POST /rest/v1/rpc/tgb_pull_concert_tours
Content-Type: application/json
apikey / Authorization: the publishable key

{"payload": [ {…}, {…} ]}
```

**`{"payload": [...]}`, not a bare array.** Over HTTP PostgREST matches a
top-level key to a parameter NAME. (The function also accepts `{"events": [...]}`
and a bare array, so a hand-run call in the SQL editor works too — but posting
the wrapper is the correct HTTP form.)

Each row:

| key | notes |
|---|---|
| `id` | **Permanent, and yours to compose.** `CONCERT-YYYY-MM-DD-ACT-CITY3`, upper case, no spaces: `CONCERT-2027-03-14-RODRIGO-CHI`. A game will point at it, so it can never be renamed. |
| `title` | The act, then the tour. |
| `city` | The catalogue's exact string. |
| `venue_name` | The hall. Optional but fill it. |
| `event_date` | `YYYY-MM-DD`. |
| `start_time` | `HH:MM`, **venue-local** — the clock a person standing outside the door reads, not a listing's own timezone. Omit it rather than guess. |
| `url` | The SeatGeek page for that date. |
| `description` | One or two plain sentences. What the tour is, why somebody would travel for it. |

**`kind`, `status`, `end_date` and `source` are NOT yours to send.** The function
hardcodes them (`concert` / `scheduled` / same as `event_date` / `SeatGeek`) and
those constants are what make it safe to expose without a key. Sending them does
nothing; asking for them to become parameters is the one change to refuse.

## Read the reply — it tells you the fate of every row

```
{"inserted": 7, "skipped": 3,
 "results": [{"id": "...", "outcome": "inserted", "reason": null}, …]}
```

`outcome` is `inserted`, `duplicate`, `invalid` or `unknown_city`.

- **`duplicate` is fine and expected.** A tour announced last week is still
  announced this week.
- **`invalid` means you sent something the row could not be built from** — no
  title, no usable date, a date already gone. Say which in the summary.
- **`unknown_city` is the one to report by name**, every time. It is the only
  outcome a human can act on, and acting on it makes the next run better.

**IF THE CALL COMES BACK `PGRST202`, the function is not installed.** Say so,
name the file — `mc/supabase/migrations/2026082401_concert_tour_pull_rpc.sql` —
and file nothing. Do not fall back to writing SQL to a file or committing
anything: this repo has deleted four routines whose output was a file nobody
read.

## The summary you finish with

Plain prose, no em dashes, and it must carry:

- how many you filed, and out of how many you looked at;
- the cities and acts, so it reads as a list of what arrived;
- **every `unknown_city`, named**, with the town, so somebody can add it;
- anything you had to drop and why;
- **if you filed fewer than ten, why** — that is a fact about the source or the
  rules, and it is the most useful line in the report.

## Nothing is committed

This routine writes to the database and to nothing else. No files, no branches,
no commits. If you find yourself wanting to write one, the answer is that the
RPC above is the write path and the summary is the report.
