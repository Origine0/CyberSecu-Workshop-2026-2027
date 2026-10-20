"""Génère du trafic normal : un paiement fictif toutes les INTERVAL_S secondes, via le waf.

Chaque résultat est écrit en JSON sur stdout (récupéré ensuite par promtail / Loki).
"""
import json
import os
import random
import time
import urllib.error
import urllib.request
import uuid

TARGET_URL = os.environ.get("TARGET_URL", "http://waf:8080/api/pay")
INTERVAL_S = float(os.environ.get("INTERVAL_S", "2"))
MERCHANTS = ["MERCH_ALPHA", "MERCH_FINTECH"]  # créés par database/init.sql
HEARTBEAT = "/tmp/traffic-gen.heartbeat"  # utilisé par le healthcheck


def send_payment():
    payload = {
        "merchant_code": random.choice(MERCHANTS),
        "amount": round(random.uniform(5, 150), 2),
        "currency": "EUR",
        "idempotency_key": f"TRAFFIC-{uuid.uuid4()}",
    }
    req = urllib.request.Request(
        TARGET_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "resilience-traffic-gen/1.0"},
        method="POST",
    )
    start = time.monotonic()
    result = {"event": "traffic_payment", "merchant": payload["merchant_code"], "amount": payload["amount"]}
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read() or b"{}")
            # /pay renvoie 201 même si la transaction est refusée, il faut regarder status
            result.update(http=resp.status, tx_status=body.get("status"), reference=body.get("reference"))
    except urllib.error.HTTPError as e:
        result.update(http=e.code, tx_status="HTTP_ERROR")
    except (urllib.error.URLError, OSError, ValueError) as e:
        result.update(http=None, tx_status="UNREACHABLE", error=str(e)[:200])
    result["latency_ms"] = round((time.monotonic() - start) * 1000)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    print(json.dumps({"event": "traffic_start", "target": TARGET_URL, "interval_s": INTERVAL_S}), flush=True)
    while True:
        send_payment()
        with open(HEARTBEAT, "w") as f:
            f.write(str(time.time()))
        time.sleep(INTERVAL_S)
