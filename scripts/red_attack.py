#!/usr/bin/env python3
"""
red_attack.py
Script d'attaque Red Team multi-vecteurs pour PROJECT RESILIENCE-ALPHA.
Conçu pour éprouver la résilience de l'API de paiement FastAPI via le WAF (:8082/api/pay),
déclencher les alertes Prometheus/Loki, alimenter l'IA de détection d'anomalies (ml-detector),
et démontrer la reprise autonome (remediation + Ansible).

Modes disponibles :
  - flood    : Flood applicatif multi-threadé (DDoS applicatif L7 -> trigger playbook block_source ratelimit)
  - malformed: Injection de payloads malformés + signature scanner (HTTP 422 -> trigger playbook block_source user_agent + restore_database)
  - chaos    : Chaos engineering / pannes bancaires injectées (simulate_failure=True)
  - full     : Vague combinée simultanée (Flood + Malformed + Chaos)
  - chrono   : Séquence de démonstration chronométrée < 60s pour le Clip Chrono (Axe 3)
"""

import os
import sys
import time
import uuid
import random
import argparse
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

DEFAULT_URL = os.getenv("API_URL", "http://localhost:8082/api/pay")
REMOTE_DEFAULT = os.getenv("REMOTE_API_URL", "http://192.168.137.1:8082/api/pay")


def send_flood_request(url: str, request_id: int):
    """Envoie une requête de paiement valide à haute cadence pour saturer les ressources."""
    payload = {
        "merchant_code": "MERCH_ALPHA",
        "amount": round(random.uniform(10.0, 50.0), 2),
        "currency": "EUR",
        "idempotency_key": str(uuid.uuid4()),
        "card_mock_number": "4111111111111111",
        "simulate_failure": False,
        "metadata": {
            "source": "red_team_flood",
            "bot_id": f"bot_{request_id % 10}",
            "attack_id": "DDOS_L7"
        }
    }
    headers = {"User-Agent": "RedTeam-FloodBot/1.0"}
    t0 = time.perf_counter()
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=2.0)
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, r.status_code, dt, "FLOOD")
    except requests.exceptions.RequestException as e:
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, 0, dt, f"DROP: {e.__class__.__name__}")


def send_malformed_request(url: str, request_id: int, use_scanner_ua: bool = False):
    """Envoie des payloads malformés violant le schéma Pydantic (montant <= 0, SQLi, types invalides)."""
    malformed_variants = [
        {"merchant_code": "MERCH_ALPHA", "amount": -99999.0, "currency": "MALFORMED"},
        {"merchant_code": "MERCH_ALPHA", "amount": 0.0, "currency": "EUR"},
        {"merchant_code": "' OR 1=1 --", "amount": -10.0, "currency": "EUR"},
        {"client_id": "EXPLOIT_BOT", "amount": -500.0, "currency": "EUR"},
        {"merchant_code": "MERCH_UNKNOWN_9999", "amount": -42.0, "currency": "TOOLONG_CURRENCY"}
    ]
    payload = random.choice(malformed_variants)
    headers = {"User-Agent": "sqlmap/1.8.4" if use_scanner_ua else "RedTeam-Fuzzer/1.0"}
    t0 = time.perf_counter()
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=2.0)
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, r.status_code, dt, "MALFORMED")
    except requests.exceptions.RequestException as e:
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, 0, dt, f"DROP: {e.__class__.__name__}")


def send_chaos_request(url: str, request_id: int):
    """Envoie une requête avec le flag simulate_failure=True pour déclencher des erreurs métier."""
    payload = {
        "merchant_code": "MERCH_ALPHA",
        "amount": round(random.uniform(50.0, 200.0), 2),
        "currency": "EUR",
        "idempotency_key": str(uuid.uuid4()),
        "card_mock_number": "4111111111111111",
        "simulate_failure": True,
        "metadata": {
            "source": "chaos_injection",
            "injection_id": f"fault_{request_id}"
        }
    }
    headers = {"User-Agent": "RedTeam-Chaos/1.0"}
    t0 = time.perf_counter()
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=2.0)
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, r.status_code, dt, "CHAOS_FAIL")
    except requests.exceptions.RequestException as e:
        dt = (time.perf_counter() - t0) * 1000
        return (request_id, 0, dt, f"DROP: {e.__class__.__name__}")


def run_flood(url: str, total_requests: int = 200, concurrency: int = 20):
    print(f"\n[!] 🌊 Lancement du FLOOD applicatif ({total_requests} requêtes, {concurrency} threads)...")
    start = time.perf_counter()
    results = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(send_flood_request, url, i) for i in range(1, total_requests + 1)]
        for f in as_completed(futures):
            req_id, status_code, latency, tag = f.result()
            results.append((status_code, latency))
            tag_color = "[HTTP 201]" if status_code == 201 else f"[HTTP {status_code}]"
            print(f"  {tag_color} #{req_id:04d} | Latence: {latency:5.1f}ms | Mode: {tag}")

    total_time = time.perf_counter() - start
    print_summary("FLOOD APPLICATIF", results, total_time)


def run_malformed(url: str, count: int = 50, delay: float = 0.05):
    print(f"\n[!] 💥 Lancement d'injections de PAYLOADS MALFORMÉS + signature sqlmap ({count} requêtes)...")
    start = time.perf_counter()
    results = []

    for i in range(1, count + 1):
        req_id, status_code, latency, tag = send_malformed_request(url, i, use_scanner_ua=True)
        results.append((status_code, latency))
        label = (
            "Validation Rejetée (422)"
            if status_code == 422
            else "Bloqué par WAF (403)"
            if status_code == 403
            else "Autre"
        )
        print(f"  [MALFORMED #{i:03d}] Code HTTP: {status_code} ({label}) | Latence: {latency:.1f}ms")
        time.sleep(delay)

    total_time = time.perf_counter() - start
    print_summary("PAYLOADS MALFORMÉS (INTRUSION)", results, total_time)


def run_chaos(url: str, count: int = 30, delay: float = 0.1):
    print(f"\n[!] ⚡ Lancement de tests CHAOS ENGINEERING / PANNES INJECTÉES ({count} requêtes)...")
    start = time.perf_counter()
    results = []

    for i in range(1, count + 1):
        req_id, status_code, latency, tag = send_chaos_request(url, i)
        results.append((status_code, latency))
        print(f"  [CHAOS #{i:03d}] Code HTTP: {status_code} | Latence: {latency:.1f}ms")
        time.sleep(delay)

    total_time = time.perf_counter() - start
    print_summary("CHAOS SIMULATED FAILURES", results, total_time)


def run_full(url: str, total_requests: int = 250, concurrency: int = 25):
    print(f"\n[!] 🚨 Lancement de la VAGUE D'ATTAQUE COMBINÉE (Flood + 422 + Chaos)...")
    start = time.perf_counter()
    results = []

    def dispatch(i):
        roll = random.random()
        if roll < 0.50:
            return send_flood_request(url, i)
        elif roll < 0.80:
            return send_malformed_request(url, i, use_scanner_ua=False)
        else:
            return send_chaos_request(url, i)

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(dispatch, i) for i in range(1, total_requests + 1)]
        for f in as_completed(futures):
            req_id, status_code, latency, tag = f.result()
            results.append((status_code, latency))
            print(f"  [ATTACK #{req_id:04d}] HTTP {status_code:<3} | {latency:5.1f}ms | {tag}")

    total_time = time.perf_counter() - start
    print_summary("ATTAQUE COMBINÉE", results, total_time)


def run_chrono_demo(url: str):
    """
    Scénario chronométré spécialement taillé pour le Clip Chrono (Axe 3 - 60s max)
    et la démonstration en direct (Axe 1 & 2) :
      Phase 1 [00s - 06s] : État sain nominal (baseline)
      Phase 2 [06s - 18s] : Déclenchement de l'attaque Red Team en 2 salves (garantit 2 cycles ML de 5s)
      Phase 3 [18s - 34s] : Détection ML + exécution du playbook Ansible + vérification /api/health
      Phase 4 [34s - 40s] : Vérification de la reprise et transaction de preuve rétablie (HTTP 201)
    """
    print("\n" + "🎬" * 30)
    print(" ⏱️  SCÉNARIO DE DÉMONSTRATION CHRONO (SPÉCIAL CLIP 60 SECONDES)")
    print(" Objectif : Prouver la détection ML et la reprise autonome sans coupe humaine")
    print("🎬" * 30 + "\n")

    chrono_start = time.perf_counter()
    health_url = url.replace("/pay", "/health")

    def elapsed():
        return f"[{time.perf_counter() - chrono_start:04.1f}s]"

    # Phase 1 : Trafic sain
    print(f"{elapsed()} 🟢 PHASE 1 : État nominal pré-incident (transactions de référence)...")
    for i in range(1, 4):
        payload_ok = {
            "merchant_code": "MERCH_ALPHA",
            "amount": round(25.0 + i * 10.0, 2),
            "currency": "EUR",
            "idempotency_key": str(uuid.uuid4()),
            "card_mock_number": "4111111111111111",
            "simulate_failure": False,
            "metadata": {"source": "nominal_pre_incident", "customer_name": f"Client Nominal #{i}"}
        }
        try:
            t0 = time.perf_counter()
            r = requests.post(url, json=payload_ok, headers={"User-Agent": "Legitimate-Client/1.0"}, timeout=3.0)
            dt = (time.perf_counter() - t0) * 1000
            print(f"  {elapsed()} Nominal #{i} -> HTTP {r.status_code} ({dt:.1f}ms)")
        except requests.exceptions.RequestException as e:
            print(f"  {elapsed()} Nominal #{i} -> Erreur ({e})")
        time.sleep(1.2)

    # Phase 2 : Attaque Red Team en 2 salves espacées de 5s (couvre 2 fenêtres de détection de ml-detector)
    print(f"\n{elapsed()} 🔴 PHASE 2 : DÉCLENCHEMENT DE L'ATTAQUE RED TEAM DEPUIS LE PC ATTAQUANT !")
    print(f"  {elapsed()} Injection massive : Flood concurrent (429) + Payloads invalides (422) + Chaos")

    for wave in (1, 2):
        print(f"  {elapsed()} Salve offensive #{wave}/2 en cours...")
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = []
            for i in range(1, 85):
                roll = random.random()
                if roll < 0.60:
                    futures.append(executor.submit(send_flood_request, url, i))
                elif roll < 0.85:
                    futures.append(executor.submit(send_malformed_request, url, i, False))
                else:
                    futures.append(executor.submit(send_chaos_request, url, i))

            for f in as_completed(futures):
                req_id, code, dt, tag = f.result()
                print(f"  {elapsed()} [ATTAQUE S{wave}] #{req_id:03d} -> HTTP {code:<3} ({tag})", end="\r")
        if wave == 1:
            time.sleep(4.5)

    print(f"\n{elapsed()} ⚠️  Charge maximale appliquée. Le détecteur ML (Isolation Forest) identifie l'anomalie !")

    # Phase 3 : Attente et observation de la remédiation autonome (Ansible)
    print(f"\n{elapsed()} 🟡 PHASE 3 : Remédiation automatique (Zero-Touch : ml-detector -> remediation -> Ansible)...")
    for remaining in range(12, 0, -2):
        print(f"  {elapsed()} Exécution du playbook Ansible en cours... ({remaining}s restantes)", end="\r")
        time.sleep(2.0)

    # S'assurer que le WAF a terminé son rechargement avant le tir de preuve
    for _ in range(6):
        try:
            hr = requests.get(health_url, headers={"User-Agent": "Legitimate-Client/1.0"}, timeout=2.0)
            if hr.status_code == 200:
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(1.0)

    # Phase 4 : Preuve de rétablissement du service (Condition clé du sujet EPSI)
    print(f"\n\n{elapsed()} 🏁 PHASE 4 : VÉRIFICATION POST-REPRISE (TEST DE RÉSILIENCE FINAL)")
    payload_proof = {
        "merchant_code": "MERCH_ALPHA",
        "amount": 77.77,
        "currency": "EUR",
        "idempotency_key": str(uuid.uuid4()),
        "card_mock_number": "4111111111111111",
        "simulate_failure": False,
        "metadata": {
            "source": "clip_chrono_post_remediation_proof",
            "customer_name": "Preuve Post-Reprise (Live)",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    }

    for attempt in range(1, 4):
        try:
            t0 = time.perf_counter()
            resp = requests.post(
                url,
                json=payload_proof,
                headers={"User-Agent": "Legitimate-Client/1.0"},
                timeout=3.0
            )
            dt = (time.perf_counter() - t0) * 1000
            if resp.status_code == 201:
                data = resp.json()
                print(f"  {elapsed()} ✅ SUCCÈS TOTAL ! Transaction post-remédiation validée en HTTP 201 !")
                print(f"  {elapsed()}    ID: {data.get('transaction_id')}")
                print(f"  {elapsed()}    Réf: {data.get('reference')}")
                print(f"  {elapsed()}    Montant: {data.get('amount')} {data.get('currency')} (Latence: {dt:.1f}ms)")
                break
            else:
                if attempt < 3:
                    time.sleep(1.5)
                else:
                    print(f"  {elapsed()} ❌ Échec : Code inattendu {resp.status_code} ({resp.text[:80]})")
        except Exception as e:
            if attempt < 3:
                time.sleep(1.5)
            else:
                print(f"  {elapsed()} ❌ Échec de connexion : {e}")

    total_sec = time.perf_counter() - chrono_start
    print(f"\n[+] Séquence terminée en {total_sec:.1f} secondes. Parfait pour le Clip Chrono 60s !")


def print_summary(title: str, results: list, total_time: float):
    total = len(results)
    if total == 0:
        return
    status_counts = {}
    latencies = []
    for code, dt in results:
        status_counts[code] = status_counts.get(code, 0) + 1
        latencies.append(dt)

    avg_lat = sum(latencies) / len(latencies)
    rps = total / total_time if total_time > 0 else 0

    print("\n" + "=" * 65)
    print(f" 🎯 BILAN DE L'ATTAQUE : {title}")
    print(f" Requêtes totales : {total} en {total_time:.2f}s ({rps:.1f} req/s)")
    print(f" Latence moyenne  : {avg_lat:.1f} ms (Min: {min(latencies):.1f}ms, Max: {max(latencies):.1f}ms)")
    print(" Répartition des codes HTTP :")
    for code, count in sorted(status_counts.items(), key=lambda x: str(x[0])):
        label = "CONN DROP / TIMEOUT" if code == 0 else f"HTTP {code}"
        pct = (count / total) * 100
        print(f"   - {label:<22} : {count:>4} ({pct:5.1f}%)")
    print("=" * 65 + "\n")


def parse_args():
    parser = argparse.ArgumentParser(description="Script d'attaque Red Team - PROJECT RESILIENCE-ALPHA")
    parser.add_argument(
        "--url", "-u",
        default=DEFAULT_URL,
        help=f"URL cible de l'endpoint /api/pay (défaut: {DEFAULT_URL})"
    )
    parser.add_argument(
        "--remote", "-r",
        action="store_true",
        help=f"Cibler le PC Hôte Windows via le WAF ({REMOTE_DEFAULT})"
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["flood", "malformed", "chaos", "full", "chrono"],
        default="full",
        help="Mode d'attaque (flood, malformed, chaos, full, chrono) - défaut: full"
    )
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=150,
        help="Nombre total de requêtes (défaut: 150)"
    )
    parser.add_argument(
        "--concurrency", "-c",
        type=int,
        default=20,
        help="Nombre de threads concurrents pour le flood (défaut: 20)"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    target_url = REMOTE_DEFAULT if args.remote else args.url

    print("=" * 65)
    print(" 🛡️  RED TEAM EXPLOITATION TOOLKIT | RESILIENCE-ALPHA")
    print(f" Cible  : {target_url}")
    print(f" Vecteur: {args.mode.upper()}")
    print("=" * 65)

    if args.mode == "flood":
        run_flood(target_url, total_requests=args.count, concurrency=args.concurrency)
    elif args.mode == "malformed":
        run_malformed(target_url, count=args.count)
    elif args.mode == "chaos":
        run_chaos(target_url, count=args.count)
    elif args.mode == "full":
        run_full(target_url, total_requests=args.count, concurrency=args.concurrency)
    elif args.mode == "chrono":
        run_chrono_demo(target_url)


if __name__ == "__main__":
    main()
