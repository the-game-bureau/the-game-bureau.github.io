---
name: nfl-tour-waypoint-catalog
description: The public.waypoints table now has walking-tour stops for all 32 NFL team cities; how they were ingested and which city represents each team.
metadata:
  type: project
---

As of 2026-06-23 the Supabase `public.waypoints` table holds curated walking-tour stops (~15–22 each) for **all 32 NFL team cities + Las Vegas**, ingested division by division. Each row has name, city, state (2-letter), zip, street-only address, a one-sentence tour description, and Google-geocoded lat/lon.

**Team → tour-city mapping** (the city that represents each team for tours is the nearest major downtown, NOT the suburban stadium town):
- Cowboys → Dallas (not Arlington); 49ers → San Francisco (not Santa Clara); Commanders → Washington, DC (not Landover); Cardinals → Phoenix (not Glendale); Patriots → Boston (not Foxborough); Bills → Buffalo; Giants/Jets → New York; Rams/Chargers → Los Angeles; Raiders → Las Vegas.
- One city per team's downtown; spread-out cities (Green Bay, LA, Miami, Houston) span multiple tour districts and build as mini-loops, not one 1-mile loop.

**Import recipe** (temp `_dev/import-*.mjs`, run then deleted — same pattern as the coord backfill in [[supabase-mgmt-api-token]] style): geocode each `name, address, city, state zip` via the Google Geocoding API (key in the backfill scripts; no rate limits), **dedupe by name+city** against existing rows, **flag any geocode > N miles from a per-city center** for manual review (caught the Las Vegas "Golden Nugget" mis-geocode → fixed to 36.1706,-115.1437), then bulk INSERT via the Supabase Management API (`/v1/projects/{ref}/database/query`) using the token from Windows Credential Manager (`Supabase CLI:supabase`, UTF-8 blob → `.access_token`).

**Why:** several cities were already partly populated from earlier sessions (Jacksonville, Seattle, Buffalo, Baltimore, Indianapolis, Nashville, Denver, plus Mexico City / Saint-Denis and the 32 NFL stadiums), so the name+city dedupe is essential to avoid doubles — e.g. NYC already had 9 Lower-Manhattan icons; stadium rows (Ford Field, Lambeau, U.S. Bank Stadium, etc.) were skipped.

**How to apply:** to add more cities, reuse the same script shape; keep street-only addresses (matches the cleaned-address convention) and always re-run the >N-mile flag check before trusting coords. Routes are built from these in [mapper.html](mc/mapper.html).
