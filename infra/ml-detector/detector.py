"""Détection continue : toutes les INTERVAL_S secondes, mesure le trafic, le fait juger par le modèle
Isolation Forest (fichier entraîné dans backend-ia) et prévient le moteur de remédiation en cas d'anomalie.

Mesures (fenêtre WINDOW_S, vues côté client, donc valables même quand l'API est arrêtée) :
  request_rate : requêtes par seconde reçues par le waf
  error_rate   : part de réponses en erreur (max entre le waf et le générateur de trafic)
  latency_ms   : latence moyenne des paiements du générateur de trafic
Le modèle décide s'il y a anomalie ; la cause (crash, dos, intrusion) sert seulement à choisir la réponse.
"""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import warnings
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import joblib
import numpy as np

warnings.filterwarnings("ignore", category=UserWarning)  # noms de colonnes absents : sans effet sur la prédiction

MODEL_FILE = os.environ.get("MODEL_FILE", "/model/isolation_forest_model.joblib")
BASELINE_FILE = os.environ.get("BASELINE_FILE", "/model/traffic_baseline.csv")
FEATURES = ["request_rate", "error_rate", "latency_ms"]
LOKI_URL = os.environ.get("LOKI_URL", "http://loki:3100")
EXPORTER_URL = os.environ.get("EXPORTER_URL", "http://docker-stats-exporter:9105/metrics")
REMEDIATION_URL = os.environ.get("REMEDIATION_URL", "http://remediation:8020/alerts")
TOKEN = os.environ.get("REMEDIATION_TOKEN", "")
INTERVAL_S = float(os.environ.get("INTERVAL_S", "5"))
WINDOW_S = int(os.environ.get("WINDOW_S", "30"))
CONFIRMATIONS = int(os.environ.get("CONFIRMATIONS", "2"))  # anomalies consécutives avant d'alerter
WARMUP_S = int(os.environ.get("WARMUP_S", "25"))  # pas d'alerte juste après un démarrage de la stack
FORBIDDEN_MIN = int(os.environ.get("FORBIDDEN_MIN", "3"))  # refus 403 sans signature avant de parler d'intrusion
FLOOD_RPS = float(os.environ.get("FLOOD_RPS", "3"))  # paiements par seconde d'un même client (un utilisateur en fait moins de 0,1)
STARTED = time.time()
PORT = int(os.environ.get("PORT", "8010"))
HEARTBEAT = "/tmp/ml-detector.heartbeat"

# services que la remédiation sait redémarrer (même liste blanche que ansible/group_vars/all.yml)
WATCHED = ["payment-api", "waf", "auth", "frontend", "traffic-gen"]
SCANNER_UA = re.compile(r"sqlmap|nikto|nmap|gobuster|dirb|dirbuster|wfuzz|hydra|masscan|zgrab|nuclei", re.I)
ACCESS = re.compile(r'^(\S+) - \S+ \[[^\]]+\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"')

state = {"features": {}, "score": 0.0, "anomaly": False, "streak": 0, "alerts": Counter(), "last": {}}
lock = threading.Lock()


log_lock = threading.Lock()  # une ligne JSON complète à la fois


def log(**event):
    line = json.dumps({"event": "ml_detector", "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **event})
    with log_lock:
        print(line, flush=True)


def load_model():
    """Modèle entraîné par backend-ia/train_model.py. S'il ne se charge pas (versions différentes de
    scikit-learn), on le ré-entraîne sur le même jeu de données avec les mêmes réglages."""
    try:
        return joblib.load(MODEL_FILE), "fichier " + os.path.basename(MODEL_FILE)
    except Exception as e:
        log(step="model_reload", reason=str(e)[:200])
    import csv
    from sklearn.ensemble import IsolationForest
    with open(BASELINE_FILE) as f:
        rows = list(csv.DictReader(f))
    x = np.array([[float(r[k]) for k in FEATURES] for r in rows])
    contamination = round(sum(r["label"] == "1" for r in rows) / len(rows), 4)
    model = IsolationForest(n_estimators=150, max_samples="auto", contamination=contamination, random_state=42)
    return model.fit(x), f"ré-entraîné sur {os.path.basename(BASELINE_FILE)} ({len(rows)} échantillons)"


def loki_lines(query):
    """Lignes de logs Loki sur la fenêtre."""
    now = time.time_ns()
    params = urllib.parse.urlencode({"query": query, "start": now - WINDOW_S * 10**9, "end": now, "limit": 5000})
    with urllib.request.urlopen(f"{LOKI_URL}/loki/api/v1/query_range?{params}", timeout=5) as r:
        data = json.load(r)["data"]["result"]
    return [line for stream in data for _, line in stream["values"]]


def measure():
    waf = [m.groups() for m in (ACCESS.match(l) for l in loki_lines('{service="waf"}')) if m]
    traffic = []
    for line in loki_lines('{service="traffic-gen"} |= "traffic_payment"'):
        try:
            traffic.append(json.loads(line))
        except ValueError:
            pass
    waf_errors = sum(1 for g in waf if int(g[3]) >= 400)
    tg_errors = sum(1 for t in traffic if t.get("tx_status") != "SUCCESS")
    features = {
        "request_rate": round(len(waf) / WINDOW_S, 3),
        "error_rate": round(max(waf_errors / len(waf) if waf else 0.0, tg_errors / len(traffic) if traffic else 0.0), 4),
        "latency_ms": round(sum(t.get("latency_ms", 0) for t in traffic) / len(traffic), 1) if traffic else 0.0,
    }
    return features, waf


def container_states():
    """Services de la liste surveillée qui ne sont pas running + healthy (lu sur l'exporteur, temps réel)."""
    with urllib.request.urlopen(EXPORTER_URL, timeout=5) as r:
        text = r.read().decode()
    values = {}
    for name in ("running", "healthy"):
        for svc, val in re.findall(rf'^docker_container_{name}\{{[^}}]*service="([^"]+)"[^}}]*\}} (\S+)$', text, re.M):
            values.setdefault(svc, {})[name] = float(val)
    return [s for s in WATCHED if values.get(s, {}).get("running", 0) < 1 or values.get(s, {}).get("healthy", 0) < 1]


def diagnose(waf):
    """Cause probable de l'anomalie, pour choisir la réponse. None = pas de cause sur laquelle agir
    (perturbation passagère, par exemple pendant un redéploiement) : on n'envoie pas d'alerte."""
    down = container_states()
    if down:
        return {"type": "crash", "service": down[0]}
    # les requêtes du réseau app (10.77.20.x) viennent de la plateforme elle-même : générateur de trafic et
    # vérifications de la remédiation. Les vrais clients arrivent par le réseau edge (10.77.10.x).
    waf = [g for g in waf if not g[0].startswith("10.77.20.")]
    # intrusion : un outil d'attaque reconnu, ou plusieurs refus du WAF (un 403 isolé, comme le test de
    # /api/docs de make check, n'en est pas une)
    signed = [g for g in waf if SCANNER_UA.search(g[4])]
    forbidden = [g for g in waf if g[3] == "403"]
    suspicious = signed + [g for g in forbidden if g not in signed]
    if signed or len(forbidden) >= FORBIDDEN_MIN:
        # signature = nom de l'outil d'attaque trouvé dans le User-Agent (ex. "sqlmap")
        tools = Counter(SCANNER_UA.search(g[4]).group(0).lower() for g in suspicious if SCANNER_UA.search(g[4]))
        ip = Counter(g[0] for g in suspicious).most_common(1)[0][0]
        return {"type": "intrusion", "service": "payment-api", "source_ip": ip,
                "user_agent": tools.most_common(1)[0][0] if tools else ""}
    # flood : un même client envoie bien plus de paiements qu'un utilisateur, même si l'API ne les refuse pas encore
    payments = Counter(g[0] for g in waf if g[1] == "POST" and g[2].startswith("/api/pay"))
    if payments and payments.most_common(1)[0][1] >= FLOOD_RPS * WINDOW_S:
        return {"type": "dos", "service": "payment-api", "source_ip": payments.most_common(1)[0][0]}
    # ou la majorité des erreurs sont des refus de limitation de débit (429 par l'API, 503 par le WAF)
    errors = [g for g in waf if int(g[3]) >= 400]
    throttled = [g for g in errors if g[3] in ("429", "503", "422")]
    if errors and len(throttled) * 2 >= len(errors):
        top_ip = Counter(g[0] for g in throttled).most_common(1)
        return {"type": "dos", "service": "payment-api", "source_ip": top_ip[0][0]}
    return None


def send_alert(alert):
    req = urllib.request.Request(REMEDIATION_URL, data=json.dumps(alert).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.load(r).get("result")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode(errors="replace")
    except OSError as e:
        return None, str(e)[:200]


def loop(model):
    while True:
        try:
            features, waf = measure()
            x = np.array([[features["request_rate"], features["error_rate"], features["latency_ms"]]])
            anomaly = bool(model.predict(x)[0] == -1)
            score = float(model.decision_function(x)[0])
            with lock:
                state.update(features=features, score=score, anomaly=anomaly)
                state["streak"] = state["streak"] + 1 if anomaly else 0
                confirmed = state["streak"] >= CONFIRMATIONS
            if anomaly:
                log(step="anomaly", score=round(score, 3), streak=state["streak"], **features)
            warming_up = time.time() - STARTED < WARMUP_S
            if confirmed and warming_up:
                log(step="no_action", reason="démarrage en cours, pas d'alerte pendant les premières secondes")
                confirmed = False
            cause = diagnose(waf) if confirmed else None
            if confirmed and cause is None:
                log(step="no_action", reason="anomalie sans cause sur laquelle agir (aucun service arrêté, ni flood, ni signature)")
            if cause:
                alert = {"alert_id": f"ml-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
                         "detected_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                         "score": round(score, 3), "details": features, **cause}
                code, result = send_alert(alert)
                log(step="alert_sent", alert_id=alert["alert_id"], type=cause["type"], service=cause["service"],
                    http=code, result=result)
                with lock:
                    state["alerts"][cause["type"]] += 1
                    state["last"] = {**alert, "response": result}
                    state["streak"] = 0  # on repart de zéro : le moteur applique ses propres délais
        except Exception as e:  # une mesure ratée ne doit jamais arrêter la détection
            log(step="error", error=str(e)[:200])
        with open(HEARTBEAT, "w") as f:
            f.write(str(time.time()))
        time.sleep(INTERVAL_S)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        with lock:
            if self.path == "/health":
                body, ctype = json.dumps({"status": "UP", "model": os.path.basename(MODEL_FILE)}), "application/json"
            elif self.path == "/metrics":
                f = state["features"]
                lines = ["# TYPE ml_anomaly_score gauge", f"ml_anomaly_score {state['score']}",
                         "# TYPE ml_anomaly gauge", f"ml_anomaly {int(state['anomaly'])}",
                         "# TYPE ml_feature gauge"] + [f'ml_feature{{name="{k}"}} {v}' for k, v in f.items()]
                lines += ["# TYPE ml_alerts_sent_total counter"] + [
                    f'ml_alerts_sent_total{{type="{t}"}} {n}' for t, n in state["alerts"].items()]
                body, ctype = "\n".join(lines) + "\n", "text/plain; version=0.0.4"
            elif self.path == "/status":
                body, ctype = json.dumps({k: v for k, v in state.items() if k != "alerts"}, default=str), "application/json"
            else:
                body, ctype = '{"error":"inconnu"}', "application/json"
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("REMEDIATION_TOKEN manquant")
    model, source = load_model()
    log(step="startup", model=source, interval_s=INTERVAL_S, window_s=WINDOW_S, confirmations=CONFIRMATIONS)
    threading.Thread(target=loop, args=(model,), daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
