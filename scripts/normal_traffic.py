#!/usr/bin/env python3
"""
normal_traffic.py
Générateur de trafic légitime (baseline saine) pour PROJECT RESILIENCE-ALPHA.
Conçu pour alimenter le modèle de Machine Learning (détection d'anomalies)
et vérifier la disponibilité nominale de l'API de paiement FastAPI.
"""

import os
import sys
import time
import uuid
import random
import argparse
import requests
from datetime import datetime, timezone

DEFAULT_URL = os.getenv("API_URL", "http://localhost:8082/api/pay")
REMOTE_DEFAULT = os.getenv("REMOTE_API_URL", "http://192.168.137.1:8082/api/pay")

MERCHANTS = ["MERCH_ALPHA", "MERCH_BETA", "MERCH_GAMMA"]
CURRENCIES = ["EUR", "EUR", "EUR", "USD"]  # 75% EUR, 25% USD


def parse_args():
    parser = argparse.ArgumentParser(description="Générateur de flux de transactions nominales")
    parser.add_argument(
        "--url", "-u",
        default=DEFAULT_URL,
        help=f"URL de l'endpoint /pay (défaut: {DEFAULT_URL})"
    )
    parser.add_argument(
        "--remote", "-r",
        action="store_true",
        help=f"Cibler le PC Hôte Windows ({REMOTE_DEFAULT})"
    )
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=0,
        help="Nombre de transactions à envoyer (0 = continu jusqu'à Ctrl+C)"
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=0.3,
        help="Délai minimum entre requêtes en secondes (défaut: 0.3)"
    )
    parser.add_argument(
        "--max-delay",
        type=float,
        default=1.0,
        help="Délai maximum entre requêtes en secondes (défaut: 1.0)"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    api_url = REMOTE_DEFAULT if args.remote else args.url

    print("=" * 65)
    print(" 🚀 RESILIENCE-ALPHA | GÉNÉRATEUR DE TRAFIC LÉGITIME (BASELINE)")
    print(f" Cible : {api_url}")
    print(f" Mode  : {'Continu (Ctrl+C pour stopper)' if args.count == 0 else f'{args.count} transactions'}")
    print("=" * 65)

    stats = {
        "sent": 0,
        "success_201": 0,
        "errors": 0,
        "total_latency_ms": 0.0,
    }

    try:
        while True:
            stats["sent"] += 1
            current_id = stats["sent"]

            amount = round(random.uniform(5.0, 250.0), 2)
            currency = random.choice(CURRENCIES)
            merchant = random.choice(MERCHANTS)
            idempotency_key = str(uuid.uuid4())

            payload = {
                "merchant_code": merchant,
                "amount": amount,
                "currency": currency,
                "idempotency_key": idempotency_key,
                "card_mock_number": "4111111111111111",
                "simulate_failure": False,
                "metadata": {
                    "source": "normal_traffic_generator",
                    "client_type": "legitimate_mobile_app",
                    "session_id": str(uuid.uuid4())[:8],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            }

            req_start = time.perf_counter()
            try:
                resp = requests.post(api_url, json=payload, timeout=3.0)
                elapsed_ms = round((time.perf_counter() - req_start) * 1000, 1)
                stats["total_latency_ms"] += elapsed_ms

                if resp.status_code == 201:
                    stats["success_201"] += 1
                    data = resp.json()
                    tx_id = data.get("transaction_id", "N/A")[:8]
                    ref = data.get("reference", "N/A")
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] [201 CREATED] #{current_id:04d} | Tx: {tx_id}.. ({ref}) | {amount:>6.2f} {currency} | Latence: {elapsed_ms:>5.1f}ms")
                else:
                    stats["errors"] += 1
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] [HTTP {resp.status_code}] #{current_id:04d} : {resp.text[:80]}")

            except requests.exceptions.RequestException as e:
                stats["errors"] += 1
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [CONN ERROR] #{current_id:04d} : {e}")

            if args.count > 0 and stats["sent"] >= args.count:
                break

            time.sleep(random.uniform(args.min_delay, args.max_delay))

    except KeyboardInterrupt:
        print("\n[!] Arrêt demandé par l'opérateur.")

    avg_latency = (
        stats["total_latency_ms"] / stats["success_201"]
        if stats["success_201"] > 0
        else 0.0
    )
    print("\n" + "=" * 65)
    print(" 📊 RÉCAPITULATIF TRAFIC NOMINAL")
    print(f" Envoyées       : {stats['sent']}")
    print(f" Succès (201)   : {stats['success_201']} ({stats['success_201']/max(1, stats['sent'])*100:.1f}%)")
    print(f" Erreurs        : {stats['errors']}")
    print(f" Latence moyenne: {avg_latency:.1f} ms")
    print("=" * 65)


if __name__ == "__main__":
    main()
