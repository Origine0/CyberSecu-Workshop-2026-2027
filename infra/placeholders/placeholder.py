"""Service temporaire : répond /health et /metrics en attendant le vrai service."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NAME = os.environ.get("SERVICE_NAME", "placeholder")
OWNER = os.environ.get("OWNER", "son responsable")
PORT = int(os.environ.get("PORT", "8000"))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"status": "UP", "service": NAME, "placeholder": True}).encode()
            ctype = "application/json"
        elif self.path == "/metrics":
            body = f'placeholder_up{{service="{NAME}"}} 1\n'.encode()
            ctype = "text/plain; version=0.0.4"
        else:
            body = f"{NAME} : conteneur provisoire, à remplacer par {OWNER}\n".encode()
            ctype = "text/plain; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # on ne logue pas les healthchecks ni les scrapes prometheus
        if self.path not in ("/health", "/metrics"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"[placeholder] {NAME} écoute sur :{PORT} (à remplacer par {OWNER})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
