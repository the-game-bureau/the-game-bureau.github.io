import subprocess, os, webbrowser, threading

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Kill any process already on port 3000
subprocess.run(
    'for /f "tokens=5" %p in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do taskkill /PID %p /F',
    shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)

URL = 'http://localhost:3000/private/builder.html'
threading.Timer(0.8, lambda: webbrowser.open(URL)).start()

try:
    subprocess.run(["node", "server.js"], check=True)
except KeyboardInterrupt:
    pass
