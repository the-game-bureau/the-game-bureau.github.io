import os
import subprocess
import sys
import threading
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PAGES = {
    "builder": "http://localhost:3000/play/private/builder.html",
    "builder_new": "http://localhost:3000/play/private/builder_new.html",
}

page = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "builder_new"
if page.endswith(".html"):
    page = page[:-5]

if page not in PAGES:
    print("Usage: python play/util/server_start.py [builder|builder_new]")
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

try:
    subprocess.run(["node", "server.js"], check=True)
except KeyboardInterrupt:
    pass
