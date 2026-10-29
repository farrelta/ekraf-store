"""Windows-compatible server lifecycle for the optional browser smoke check."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time

sys.stdout.reconfigure(errors='replace')
root = Path(__file__).resolve().parents[2]
node = shutil.which('node')
assert node and os.environ.get('TEST_DATABASE_URL'), 'Set TEST_DATABASE_URL and install Node first'
env = {**os.environ, 'DATABASE_URL': os.environ['TEST_DATABASE_URL'], 'API_PORT': '3000', 'FRONTEND_ORIGIN': 'http://localhost:5187', 'RECEIPT_STORAGE_DIR': 'storage/integration-receipts', 'TEST_BASE_URL': 'http://localhost:5187'}
flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
processes = []
logs = []
try:
    for args, cwd, port in [([node, 'dist/index.js'], root / 'api', 3000), ([node, str(root / 'node_modules/next/dist/bin/next'), 'start', '--port', '5187'], root / 'web', 5187)]:
        with socket.socket() as sock:
            assert sock.connect_ex(('127.0.0.1', port)) != 0, f'Test port {port} is already in use'
        log = tempfile.TemporaryFile()
        logs.append(log)
        proc = subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
        processes.append(proc)
        for attempt in range(120):
            if proc.poll() is not None:
                log.seek(0)
                raise RuntimeError(log.read().decode(errors='replace'))
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1', port)) == 0:
                    break
            time.sleep(0.25)
        else:
            raise RuntimeError(f'Test server {port} did not start')
    result = subprocess.run([sys.executable, str(root / 'web/test/smoke.py')], cwd=root, env=env)
    if result.returncode:
        for log in logs:
            log.seek(0)
            print(log.read().decode(errors='replace'))
    sys.exit(result.returncode)
finally:
    for proc in reversed(processes):
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    for log in logs:
        log.close()
