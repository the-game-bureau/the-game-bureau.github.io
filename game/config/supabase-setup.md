# Supabase Setup

Project URL:
`https://qmaafbncpzrdmqapkkgr.supabase.co`

Direct connection string:
`postgresql://postgres:[YOUR-PASSWORD]@db.qmaafbncpzrdmqapkkgr.supabase.co:5432/postgres`

CLI commands:
```powershell
supabase login
supabase init
supabase link --project-ref qmaafbncpzrdmqapkkgr
```

Browser config:
Edit [supabase-config.js](/c:/Code/the-game-bureau/play/data/supabase-config.js) and paste your Supabase publishable key into `publishableKey`.

SQL bootstrap:
Run the SQL in [supabase.sql](/c:/Code/the-game-bureau/play/data/supabase.sql) in the Supabase SQL editor.

What this setup does:
- Creates a row-based `games` table for the builder index page
- Renames an older `builder_games` table to `games` if it already exists
- Stores each game as its own Supabase row with direct columns for name/colors plus `nodes` and `links` JSONB payloads
- Uses the same `games` table for the builder index and the builder editor
- Lets you inspect and edit builder rows directly in Supabase Table Editor

Current security shape:
- The included SQL is a shared public-write setup for the `games` table
- Anyone who can load the app and has the publishable key can edit the shared builder data
- If you want per-user auth and private projects, the next step is replacing these policies with authenticated owner-based ones
