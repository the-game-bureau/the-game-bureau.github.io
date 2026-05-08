"""Dump every exposed Supabase table to backups/supabase-<table>-YYYY-MM-DD.json.

Run from anywhere:
    python admin/backup.py

Prunes backup files older than RETENTION_DAYS. Does NOT commit — that's on you.

For a complete backup (including RLS-restricted tables like admin_users),
set SUPABASE_SERVICE_KEY in the environment or in .env (which is gitignored).
Without it, the script falls back to the publishable key and RLS-restricted
tables will back up as empty arrays.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SUPABASE_URL = "https://qmaafbncpzrdmqapkkgr.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3"

TABLES = [
    "admin_users",
    "builder_documents",
    "game_notes",
    "games",
    "games_bu",
    "photo_submissions",
    "tags",
]

RETENTION_DAYS = 30

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = REPO_ROOT / "backups"


def load_dotenv(path: Path) -> None:
    """Minimal .env loader: sets os.environ for keys not already set."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$", line, re.IGNORECASE)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        os.environ.setdefault(key, val)


def fetch_table(table: str, key: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not isinstance(data, list):
        raise ValueError("response was not a JSON array")
    return data


def prune_old_backups(today: datetime) -> list[str]:
    if not BACKUP_DIR.exists():
        return []
    cutoff = today - timedelta(days=RETENTION_DAYS)
    pattern = re.compile(r"^supabase-.+-(\d{4}-\d{2}-\d{2})\.json$")
    deleted = []
    for entry in BACKUP_DIR.iterdir():
        m = pattern.match(entry.name)
        if not m:
            continue
        file_date = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
        if file_date < cutoff:
            entry.unlink()
            deleted.append(entry.name)
    return deleted


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    key = service_key or PUBLISHABLE_KEY

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc)
    date_str = today.strftime("%Y-%m-%d")

    results = []
    for table in TABLES:
        try:
            rows = fetch_table(table, key)
            payload = json.dumps(rows, indent=2)
            out = BACKUP_DIR / f"supabase-{table}-{date_str}.json"
            out.write_text(payload, encoding="utf-8")
            results.append((table, len(rows), len(payload.encode("utf-8")), None))
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, json.JSONDecodeError) as err:
            results.append((table, None, None, str(err)))

    deleted = prune_old_backups(today)

    key_label = "service_role" if service_key else "publishable (RLS-limited)"
    print(f"\nBackup summary ({date_str} UTC, key={key_label}):")
    for table, rows, size, err in results:
        if err:
            print(f"  {table:<20} FAILED  {err}")
        else:
            print(f"  {table:<20} {rows:>5} rows   {size:>8} bytes")

    print(f"\nPruned (>{RETENTION_DAYS}d): {', '.join(deleted) if deleted else 'none'}")
    print(f"\nBackups at: {BACKUP_DIR}")
    return 0 if all(err is None for *_, err in results) else 1


if __name__ == "__main__":
    sys.exit(main())
