---
name: nfl-game-maps
description: Every NFL game (380/384) has a 7-stop public.maps route built from its home-city waypoints; how the cluster is chosen.
metadata:
  type: project
---

As of 2026-06-23, **380 of 384 games** in `public.games` have a 7-stop map in `public.maps` (ord 1–7, `"end"`='YES' on the last). Built from the per-city waypoint catalog ([[nfl-tour-waypoint-catalog]]).

**How each game's 7 stops are chosen** (one tightest cluster per home metro, shared by all games in that metro):
1. Gather the metro's waypoints (match game `city` first comma-token to waypoint `city` first token, lowercased).
2. **downtownCandidates** — restrict to within 2.5 mi of the metro's *median* lat/lon. Median is robust to isolated outlier blobs, so this drops things like the **Jacksonville Zoo** (40 exhibits 5 mi north) and Mexico City's Chapultepec zoo, while keeping genuinely dense districts like the **New Orleans French Quarter** (which IS the landmark mass). Fallback to all points if the radius holds <7.
3. **dedupeNearby (40 m)** — collapse near-coincident rows (same place imported twice; memorials stacked at one coordinate) so the 7 are distinct.
4. **tightestCluster** — the 7 points with the smallest mutual diameter.
5. **routeOrder** — nearest-neighbor walk from the westmost point.

**Metro aliasing** (stadium-suburb game city → waypoint metro): Orchard Park→Buffalo, Miami Gardens→Miami, Glendale→Phoenix, Santa Clara→San Francisco. **Shared metros** cover both teams from one cluster: New York = Jets+Giants, Los Angeles = Chargers+Rams. `salno` (a New Orleans game with a blank city field) was given the New Orleans cluster directly.

**Known soft spots** (data-limited, left as-is unless asked): **Charlotte** anchors to a historic-residential marker district (old houses) not uptown; **Miami** spans ~2.4 mi (no 7 tight stops in one district after dedup); **Green Bay** ~2.5 mi (spread city). The **4 unmapped games** are test/placeholder rows with no city (COLOR TEST, DealerTire COMING SOON, Hollywood South, NAME GAME).

**How to apply / re-run:** the generator was a temp `_dev` script (deleted). To rebuild, re-create it from this recipe — read all waypoints + games via the Management API, write `delete from maps where game_id=… ; insert …` per game. It's idempotent (delete+insert), so re-running any metro is safe. Maps render in [mapper.html](mc/mapper.html) and the engines.
