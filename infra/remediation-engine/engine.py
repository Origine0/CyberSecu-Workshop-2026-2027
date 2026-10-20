"""Moteur de remédiation : reçoit les alertes du détecteur et lance le playbook Ansible adapté, sans intervention humaine.

POST /alerts  (jeton obligatoire)  -> décision -> file d'attente -> ansible-playbook (un à la fois)
GET  /health, /metrics, /status

Bibliothèque standard Python uniquement (image resilience/ansible-runner).
"""
import hmac
import json
import os
import queue
import re
import subprocess
import threading
import time
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8020"))
TOKEN = os.environ.get("REMEDIATION_TOKEN", "")
PLAYBOOKS = "/ansible/playbooks"
DOCKER_API_URL = os.environ.get("DOCKER_API_URL", "http://socket-proxy-remed:2375")
BLOCKLIST_DIR = os.environ.get("WAF_BLOCKLIST_DIR", "/blocklist")
COOLDOWN_S = int(os.environ.get("COOLDOWN_S", "90"))   # une action par service et par type sur cette durée
MAX_ACTIONS = int(os.environ.get("MAX_ACTIONS_10MIN", "3"))  # au-delà, on arrête d'agir (évite les boucles)
PLAYBOOK_TIMEOUT_S = 240

ALERT_TYPES = ("crash", "dos", "intrusion")
SERVICE_RE = re.compile(r"^[a-z][a-z0-9-]{1,30}$")
UA_RE = re.compile(r"^[A-Za-z0-9._/-]{3,40}$")
IP_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

jobs = queue.Queue()
lock = threading.Lock()
seen_alerts = deque(maxlen=500)        # alert_id déjà reçus
last_action = {}                       # (service, type) -> timestamp
recent_actions = deque(maxlen=50)      # pour /status
accepted_alerts = deque(maxlen=200)    # (timestamp, service) : limite d'alertes traitées sur 10 min
counters = {}                          # (action, service, result) -> nombre


log_lock = threading.Lock()  # plusieurs threads écrivent : une ligne JSON complète à la fois


def log(**event):
    line = json.dumps({"event": "remediation", "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **event})
    with log_lock:
        print(line, flush=True)


def is_healthy(service):
    """Lit l'état du conteneur via le proxy Docker (lecture autorisée)."""
    try:
        with urllib.request.urlopen(f"{DOCKER_API_URL}/containers/resilience-{service}/json", timeout=5) as r:
            state = json.load(r)["State"]
        return bool(state.get("Running")) and state.get("Health", {}).get("Status") == "healthy"
    except (OSError, ValueError, KeyError):
        return False


def rule_exists(extra):
    """Règle de blocage déjà écrite ? (même nom de fichier que le rôle waf_blocklist)"""
    suffix = "" if extra["block_type"] == "ratelimit" else "-" + re.sub(r"[^A-Za-z0-9]", "_", extra["value"])
    return os.path.exists(f"{BLOCKLIST_DIR}/{extra['block_type']}{suffix}.conf")


def plan_for(alert):
    """Étapes (playbook, variables, seulement_si_le_service_est_KO) à lancer pour une alerte."""
    service, kind = alert["service"], alert["type"]
    if kind == "crash":
        # revérifié juste avant d'agir : un service revenu entre-temps n'est pas redémarré
        return [("restart_service", {"service": service}, True)]
    if kind == "dos":
        # confinement d'abord (limitation de débit dans le WAF), puis reprise du service s'il est tombé
        return [("block_source", {"block_type": "ratelimit"}, False), ("restart_service", {"service": service}, True)]
    # intrusion : bloquer la signature (ou l'IP), puis contrôler la base et relancer l'API
    steps = []
    ua, ip = alert.get("user_agent") or "", alert.get("source_ip") or ""
    if UA_RE.match(ua):
        steps.append(("block_source", {"block_type": "user_agent", "value": ua}, False))
    elif IP_RE.match(ip) and not ip.startswith(("10.77.", "127.")):
        steps.append(("block_source", {"block_type": "ip", "value": ip}, False))
    steps.append(("restore_database", {}, False))
    return steps


def run_playbook(name, extra_vars):
    start = time.monotonic()
    cmd = ["ansible-playbook", f"{PLAYBOOKS}/{name}.yml", "-e", json.dumps(extra_vars)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=PLAYBOOK_TIMEOUT_S)
        ok, tail = proc.returncode == 0, (proc.stdout + proc.stderr).strip().splitlines()[-3:]
    except subprocess.TimeoutExpired:
        ok, tail = False, ["timeout"]
    return ok, round(time.monotonic() - start, 1), tail


def worker():
    while True:
        alert = jobs.get()
        steps = plan_for(alert)
        # intrusion déjà confinée (signature bloquée) : l'attaquant reçoit des 403, inutile de tout refaire
        if alert["type"] == "intrusion" and steps[0][0] == "block_source" and rule_exists(steps[0][1]):
            log(alert_id=alert["alert_id"], step="skipped", action="all", reason="source déjà bloquée")
            continue
        acted = False
        for name, extra, only_if_down in steps:
            if only_if_down and is_healthy(alert["service"]):
                log(alert_id=alert["alert_id"], step="skipped", action=name, reason="service déjà healthy")
                continue
            if name == "block_source" and rule_exists(extra):
                log(alert_id=alert["alert_id"], step="skipped", action=name, reason="règle déjà en place")
                continue
            log(alert_id=alert["alert_id"], step="start", action=name, vars=extra)
            acted = True
            ok, duration, tail = run_playbook(name, extra)
            result = "success" if ok else "failure"
            with lock:
                key = (name, alert["service"], result)
                counters[key] = counters.get(key, 0) + 1
                recent_actions.append({"ts": time.time(), "alert_id": alert["alert_id"], "type": alert["type"],
                                       "service": alert["service"], "action": name, "result": result, "duration_s": duration})
            log(alert_id=alert["alert_id"], step="end", action=name, result=result, duration_s=duration, output=tail)
            if not ok:
                break  # on n'enchaîne pas sur une étape suivante si la précédente a échoué
        if not acted:
            # rien n'a été fait (service revenu entre-temps) : on ne bloque pas les alertes suivantes
            with lock:
                last_action.pop((alert["service"], alert["type"]), None)
                if accepted_alerts and accepted_alerts[-1][1] == alert["service"]:
                    accepted_alerts.pop()


def accept(alert):
    """Valide l'alerte et applique les garde-fous. Renvoie (code HTTP, message)."""
    if alert.get("type") not in ALERT_TYPES or not SERVICE_RE.match(str(alert.get("service", ""))):
        return 400, "type ou service invalide"
    alert_id = str(alert.get("alert_id", ""))[:80]
    if not alert_id:
        return 400, "alert_id manquant"
    now = time.time()
    with lock:
        if alert_id in seen_alerts:
            return 200, "déjà traitée"
        seen_alerts.append(alert_id)
        key = (alert["service"], alert["type"])
        if now - last_action.get(key, 0) < COOLDOWN_S:
            return 202, "ignorée : action déjà lancée récemment pour ce service"
        if sum(1 for ts, svc in accepted_alerts if svc == alert["service"] and now - ts < 600) >= MAX_ACTIONS:
            log(alert_id=alert_id, step="refused", reason="trop d'alertes traitées sur 10 min", service=alert["service"])
            return 429, "trop d'alertes traitées pour ce service en 10 min, le moteur n'agit plus"
        last_action[key] = now
        accepted_alerts.append((now, alert["service"]))
    jobs.put({**alert, "alert_id": alert_id})
    log(alert_id=alert_id, step="accepted", type=alert["type"], service=alert["service"], score=alert.get("score"))
    return 202, "action planifiée"


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, payload, ctype="application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"status": "UP", "queue": jobs.qsize()})
        if self.path == "/status":
            with lock:
                return self.reply(200, {"recent_actions": list(recent_actions)[-20:]})
        if self.path == "/metrics":
            with lock:
                lines = ["# TYPE remediation_actions_total counter"]
                lines += [f'remediation_actions_total{{action="{a}",service="{s}",result="{r}"}} {n}'
                          for (a, s, r), n in counters.items()]
                lines += ["# TYPE remediation_queue_size gauge", f"remediation_queue_size {jobs.qsize()}"]
            return self.reply(200, ("\n".join(lines) + "\n").encode(), "text/plain; version=0.0.4")
        self.reply(404, {"error": "inconnu"})

    def do_POST(self):
        if self.path != "/alerts":
            return self.reply(404, {"error": "inconnu"})
        auth = self.headers.get("Authorization", "")
        given = auth[7:] if auth.startswith("Bearer ") else self.headers.get("X-Remediation-Token", "")
        if not TOKEN or not hmac.compare_digest(given.encode(), TOKEN.encode()):
            log(step="refused", reason="jeton invalide", client=self.client_address[0])
            return self.reply(401, {"error": "jeton invalide"})
        try:
            alert = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 10000)) or b"{}")
        except (ValueError, TypeError):
            return self.reply(400, {"error": "JSON invalide"})
        code, message = accept(alert if isinstance(alert, dict) else {})
        self.reply(code, {"result": message})

    def log_message(self, fmt, *args):
        pass  # les requêtes sont déjà tracées en JSON par log()


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("REMEDIATION_TOKEN manquant")
    threading.Thread(target=worker, daemon=True).start()
    log(step="startup", port=PORT, cooldown_s=COOLDOWN_S, max_actions_10min=MAX_ACTIONS)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
