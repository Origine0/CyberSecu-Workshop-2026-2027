"""Exporteur Prometheus pour les stats des conteneurs du projet (CPU, RAM, réseau, santé, redémarrages).

Sous Docker Desktop cadvisor ne voit que le total de la VM, d'où ce petit exporteur.
Il interroge l'API Docker via socket-proxy-ro à chaque scrape.
"""
import http.client
import json
import os
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DOCKER_HOST = os.environ.get("DOCKER_PROXY_HOST", "socket-proxy-ro")
DOCKER_PORT = int(os.environ.get("DOCKER_PROXY_PORT", "2375"))
PROJECT = os.environ.get("COMPOSE_PROJECT", "cybersecu-workshop-2026-2027")
PORT = int(os.environ.get("PORT", "9105"))


def docker_get(path):
    conn = http.client.HTTPConnection(DOCKER_HOST, DOCKER_PORT, timeout=5)
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read()
        if resp.status != 200:
            raise OSError(f"API Docker {path} -> HTTP {resp.status}")
        return json.loads(body)
    finally:
        conn.close()


def list_containers():
    filters = urllib.parse.quote(json.dumps({"label": [f"com.docker.compose.project={PROJECT}"]}))
    return docker_get(f"/containers/json?all=1&filters={filters}")


def collect_one(c):
    """Mesures d'un conteneur (CPU et réseau sont des compteurs cumulés, à utiliser avec rate())."""
    cid = c["Id"]
    labels = {
        "name": c["Names"][0].lstrip("/"),
        "service": c["Labels"].get("com.docker.compose.service", ""),
    }
    status = c.get("Status", "")
    out = {
        "labels": labels,
        "running": 1 if c.get("State") == "running" else 0,
        # le statut ressemble à "Up 3 minutes (healthy)"
        "healthy": 1 if "(healthy)" in status else 0,
    }
    inspect = docker_get(f"/containers/{cid}/json")
    out["restarts"] = inspect.get("RestartCount", 0)
    # RestartCount ne compte pas les docker restart manuels, on expose donc aussi l'heure de démarrage
    started = inspect.get("State", {}).get("StartedAt", "")[:19]  # on ignore les fractions de seconde
    if started and not started.startswith("0001"):
        out["started_at"] = datetime.fromisoformat(started + "+00:00").timestamp()
    if out["running"]:
        # one-shot évite d'attendre 1 s par conteneur
        s = docker_get(f"/containers/{cid}/stats?stream=false&one-shot=true")
        out["cpu_seconds"] = s.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0) / 1e9
        mem = s.get("memory_stats", {})
        mstats = mem.get("stats", {})
        # même calcul que docker stats : usage moins le cache
        cache = mstats.get("total_inactive_file", mstats.get("inactive_file", 0))
        out["mem_bytes"] = max(mem.get("usage", 0) - cache, 0)
        out["mem_limit_bytes"] = mem.get("limit", 0)
        nets = s.get("networks", {}) or {}
        out["rx_bytes"] = sum(n.get("rx_bytes", 0) for n in nets.values())
        out["tx_bytes"] = sum(n.get("tx_bytes", 0) for n in nets.values())
    return out


METRICS = [
    # (clé, nom, type, description)
    ("running", "docker_container_running", "gauge", "1 si le conteneur est en cours d'exécution"),
    ("healthy", "docker_container_healthy", "gauge", "1 si le healthcheck Docker est healthy"),
    ("restarts", "docker_container_restart_count", "gauge", "Nombre de redémarrages automatiques par Docker"),
    ("started_at", "docker_container_started_at_seconds", "gauge", "Heure du dernier démarrage (epoch) ; changes() = nombre de redémarrages"),
    ("cpu_seconds", "docker_container_cpu_usage_seconds_total", "counter", "Temps CPU consommé (secondes cumulées)"),
    ("mem_bytes", "docker_container_memory_usage_bytes", "gauge", "Mémoire utilisée hors cache (octets)"),
    ("mem_limit_bytes", "docker_container_memory_limit_bytes", "gauge", "Limite mémoire du conteneur (octets)"),
    ("rx_bytes", "docker_container_network_receive_bytes_total", "counter", "Octets reçus (cumul)"),
    ("tx_bytes", "docker_container_network_transmit_bytes_total", "counter", "Octets émis (cumul)"),
]


def render():
    containers = list_containers()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(collect_one, containers))
    lines = []
    for key, name, mtype, help_text in METRICS:
        lines += [f"# HELP {name} {help_text}", f"# TYPE {name} {mtype}"]
        for r in results:
            if key in r:
                lbl = ",".join(f'{k}="{v}"' for k, v in r["labels"].items())
                lines.append(f"{name}{{{lbl}}} {r[key]}")
    lines += ["# HELP docker_stats_exporter_containers Conteneurs du projet vus par l'exporteur",
              "# TYPE docker_stats_exporter_containers gauge",
              f"docker_stats_exporter_containers {len(results)}"]
    return ("\n".join(lines) + "\n").encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path == "/metrics":
                body, code, ctype = render(), 200, "text/plain; version=0.0.4"
            elif self.path == "/health":
                docker_get("/version")  # vérifie que le proxy répond
                body, code, ctype = b'{"status":"UP"}', 200, "application/json"
            else:
                body, code, ctype = b"docker-stats-exporter : voir /metrics\n", 200, "text/plain; charset=utf-8"
        except (OSError, ValueError) as e:
            print(f"[docker-stats-exporter] erreur sur {self.path} : {e}", flush=True)
            body, code, ctype = f"erreur : {e}\n".encode(), 503, "text/plain; charset=utf-8"
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # pas de log pour les scrapes et healthchecks
        if self.path not in ("/health", "/metrics"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"[docker-stats-exporter] écoute sur :{PORT}, API Docker via {DOCKER_HOST}:{DOCKER_PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
