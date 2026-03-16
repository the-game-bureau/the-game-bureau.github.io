import subprocess, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
subprocess.run(["node", "server.js"], check=True)
