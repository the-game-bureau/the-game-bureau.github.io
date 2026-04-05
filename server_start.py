import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(ROOT_DIR, "archive", "game", "lib")
ENV_PATH = Path(ROOT_DIR) / ".env"

PAGES = {
    "builder": "http://localhost:3000/builder",
    "builder_editor": "http://localhost:3000/builder",
    "classic": "http://localhost:3000/archive/index_old.html",
    "builder_archive": "http://localhost:3000/play/private/builder_archive.html",
    "builder_new": "http://localhost:3000/play/private/builder_new.html",
}

PAGE_ALIASES = {
    "builder": "builder",
    "index.html": "builder",
    "index_old.html": "classic",
    "builder_editor": "builder",
    "editor": "builder",
    "builder.html": "builder",
    "builder_archive": "builder_archive",
    "builder_archive.html": "builder_archive",
    "legacy": "classic",
    "classic": "classic",
    "builder_new": "builder_new",
    "builder_new.html": "builder_new",
    "new": "builder_new",
    "builder_phoneanalogy": "builder",
    "builder_phoneanalogy.html": "builder",
    "phone": "builder",
    "phoneanalogy": "builder",
}

def is_server_ready(test_url):
    try:
        with urllib.request.urlopen(test_url, timeout=1.5) as response:
            return 200 <= int(getattr(response, "status", 200)) < 400
    except urllib.error.HTTPError as error:
        return 200 <= int(error.code) < 400
    except Exception:
        return False


def open_when_ready(process, target_url, timeout_seconds=25):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if process.poll() is not None:
            print(f"Local server exited early with code {process.returncode}.")
            return
        if is_server_ready(target_url):
            print("Server is ready. Opening builder...")
            webbrowser.open(target_url)
            return
        time.sleep(0.25)
    print(f"Server did not become ready within {timeout_seconds} seconds.")


def read_openai_key_status():
    if not ENV_PATH.exists():
        return ".env not found at repo root."
    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("OPENAI_API_KEY="):
            value = line.split("=", 1)[1].strip()
            if not value or value == "your_openai_api_key_here":
                return "OPENAI_API_KEY is still the placeholder in .env."
            if len(value) <= 12:
                masked = "*" * len(value)
            else:
                masked = value[:6] + "..." + value[-4:]
            return f"OPENAI_API_KEY loaded from .env: {masked}"
    return "OPENAI_API_KEY entry not found in .env."

def main():
    page_arg = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "builder"
    page = PAGE_ALIASES.get(page_arg, page_arg)

    if page.endswith(".html"):
        page = page[:-5]

    if page not in PAGES:
        print("Usage: python server_start.py [builder|classic|builder_archive|builder_new|phone]")
        sys.exit(1)

    url = PAGES[page]

    print("Starting local server on http://localhost:3000")
    print("Working directory:", SERVER_DIR)
    print(read_openai_key_status())
    print("Will open when ready:", url)
    print("Also available:")
    print("  http://localhost:3000/")
    print("  http://localhost:3000/builder")
    print("  http://localhost:3000/archive/index_old.html")
    print("Shortcuts:")
    print("  python server_start.py builder")
    print("  python server_start.py classic")
    print("  python server_start.py editor")
    print("  python server_start.py builder_archive")
    print("  python server_start.py new")
    print("  python server_start.py phone")

    try:
        # Kill any process already on port 3000
        subprocess.run(
            'for /f "tokens=5" %p in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do taskkill /PID %p /F',
            shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        server_process = subprocess.Popen(["node", "server.js"], cwd=SERVER_DIR)
        opener_thread = threading.Thread(target=open_when_ready, args=(server_process, url), daemon=True)
        opener_thread.start()
        server_process.wait()
    except KeyboardInterrupt:
        if 'server_process' in locals() and server_process.poll() is None:
            server_process.terminate()


if __name__ == "__main__":
    main()
