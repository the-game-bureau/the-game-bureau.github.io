import os
import subprocess
import sys
import threading
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PAGES = {
    "builder": "http://localhost:3000/play/private/builder.html",
    "builder_new": "http://localhost:3000/play/private/builder_new.html",
    "builder_phoneanalogy": "http://localhost:3000/play/private/builder_phoneanalogy.html",
}

PAGE_ALIASES = {
    "builder": "builder",
    "builder.html": "builder",
    "classic": "builder",
    "builder_new": "builder_new",
    "builder_new.html": "builder_new",
    "new": "builder_new",
    "builder_phoneanalogy": "builder_phoneanalogy",
    "builder_phoneanalogy.html": "builder_phoneanalogy",
    "phone": "builder_phoneanalogy",
    "phoneanalogy": "builder_phoneanalogy",
}

page_arg = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "builder_phoneanalogy"
page = PAGE_ALIASES.get(page_arg, page_arg)

if page.endswith(".html"):
    page = page[:-5]

if page not in PAGES:
    print("Usage: python play/util/server_start.py [builder|builder_new|builder_phoneanalogy|phone]")
    sys.exit(1)

# Kill any process already on port 3000
subprocess.run(
    'for /f "tokens=5" %p in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do taskkill /PID %p /F',
    shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)

URL = PAGES[page]
threading.Timer(0.8, lambda: webbrowser.open(URL)).start()

print("Starting local server on http://localhost:3000")
print("Opening:", URL)
print("Also available:")
print("  http://localhost:3000/play/private/builder.html")
print("  http://localhost:3000/play/private/builder_new.html")
print("  http://localhost:3000/play/private/builder_phoneanalogy.html")
print("Shortcuts:")
print("  python play/util/server_start.py builder")
print("  python play/util/server_start.py new")
print("  python play/util/server_start.py phone")

try:
    subprocess.run(["node", "server.js"], check=True)
except KeyboardInterrupt:
    pass
