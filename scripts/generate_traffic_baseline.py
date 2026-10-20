#!/usr/bin/env python3
"""
generate_traffic_baseline.py
Générateur et exportateur de jeu de données de référence (Baseline & Attaques)
pour le modèle Machine Learning (Isolation Forest) d'Agathe (backend-ia).

Format de sortie standardisé :
  timestamp,request_rate,error_rate,latency_ms,label
  - label = 0 : Trafic sain / nominal
  - label = 1 : Attaque / anomalie (DDoS L7, Fuzzing 422, Chaos 500)
"""

import os
import sys
import json
import random
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np

# Chemins de destination
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
OUTPUT_CSV = os.path.join(REPO_ROOT, "backend-ia", "traffic_baseline.csv")


def generate_baseline_dataset(
    n_nominal: int = 320,
    n_flood: int = 20,
    n_fuzzing: int = 15,
    n_chaos: int = 15,
    seed: int = 42
) -> pd.DataFrame:
    """
    Génère un jeu de données représentatif du comportement réel du cluster :
    - Nominal : basé sur les métriques observées de l'API de paiement FastAPI + PostgreSQL
    - Flood : pic volumétrique L7 saturant le rate-limiter
    - Fuzzing : rafale de payloads invalides rejetés en 422
    - Chaos : pannes bancaires injectées avec latences élevées et erreurs 500
    """
    np.random.seed(seed)
    random.seed(seed)
    
    records = []
    base_time = datetime.now(timezone.utc) - timedelta(hours=2)

    # 1. GÉNÉRATION DU TRAFIC SAIN (label = 0)
    # Profil observé sur normal_traffic.py :
    # - request_rate : moyenne 25 req/s (min 10, max 40)
    # - error_rate : 0.0% à 1.5% (rejets exceptionnels)
    # - latency_ms : 22ms à 55ms
    for i in range(n_nominal):
        t = base_time + timedelta(seconds=i * 10)
        req_rate = round(float(np.random.normal(loc=24.0, scale=4.5)), 2)
        req_rate = max(8.0, min(req_rate, 40.0))
        
        # Taux d'erreur quasi nul en conditions saines
        err_rate = round(float(np.random.beta(a=0.5, b=50.0)), 4)
        err_rate = min(err_rate, 0.02)
        
        # Latence nominale ultra-rapide FastAPI + DB locale
        lat_ms = round(float(np.random.normal(loc=32.0, scale=6.0)), 2)
        lat_ms = max(18.0, min(lat_ms, 65.0))
        
        records.append({
            "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "request_rate": req_rate,
            "error_rate": err_rate,
            "latency_ms": lat_ms,
            "label": 0
        })

    # 2. GÉNÉRATION DU VECTEUR D'ATTAQUE A : FLOOD DDOS L7 (label = 1)
    # Caractéristiques : request_rate > 70 req/s, latence en hausse, HTTP 429 WAF drops (error_rate ~25-45%)
    for i in range(n_flood):
        t = base_time + timedelta(seconds=(n_nominal + i) * 10)
        req_rate = round(float(np.random.normal(loc=110.0, scale=20.0)), 2)
        req_rate = max(70.0, req_rate)
        
        err_rate = round(float(np.random.uniform(0.25, 0.50)), 4)
        lat_ms = round(float(np.random.normal(loc=220.0, scale=45.0)), 2)
        lat_ms = max(120.0, lat_ms)
        
        records.append({
            "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "request_rate": req_rate,
            "error_rate": err_rate,
            "latency_ms": lat_ms,
            "label": 1
        })

    # 3. GÉNÉRATION DU VECTEUR D'ATTAQUE B : FUZZING / PAYLOADS MALFORMÉS (label = 1)
    # Caractéristiques : volume moyen (25-50 req/s), mais error_rate massif (> 80% HTTP 422)
    for i in range(n_fuzzing):
        t = base_time + timedelta(seconds=(n_nominal + n_flood + i) * 10)
        req_rate = round(float(np.random.normal(loc=35.0, scale=8.0)), 2)
        req_rate = max(15.0, req_rate)
        
        err_rate = round(float(np.random.uniform(0.75, 1.00)), 4)
        lat_ms = round(float(np.random.normal(loc=28.0, scale=5.0)), 2)
        
        records.append({
            "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "request_rate": req_rate,
            "error_rate": err_rate,
            "latency_ms": lat_ms,
            "label": 1
        })

    # 4. GÉNÉRATION DU VECTEUR D'ATTAQUE C : CHAOS ENGINEERING / TIMEOUTS (label = 1)
    # Caractéristiques : error_rate massif (simulate_failure -> HTTP 500) et latence élevée (> 400ms)
    for i in range(n_chaos):
        t = base_time + timedelta(seconds=(n_nominal + n_flood + n_fuzzing + i) * 10)
        req_rate = round(float(np.random.normal(loc=28.0, scale=6.0)), 2)
        
        err_rate = round(float(np.random.uniform(0.60, 0.95)), 4)
        lat_ms = round(float(np.random.normal(loc=450.0, scale=80.0)), 2)
        lat_ms = max(300.0, lat_ms)
        
        records.append({
            "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "request_rate": req_rate,
            "error_rate": err_rate,
            "latency_ms": lat_ms,
            "label": 1
        })

    df = pd.DataFrame(records)
    # Mélange chronologique cohérent ou partition
    return df


def main():
    print("=" * 65)
    print(" 📊 GÉNÉRATEUR DE JEU DE DONNÉES TRAFFIC BASELINE (IA & SOC)")
    print(f" Cible : {OUTPUT_CSV}")
    print("=" * 65)

    df = generate_baseline_dataset(
        n_nominal=320,
        n_flood=25,
        n_fuzzing=20,
        n_chaos=15
    )

    n_total = len(df)
    n_healthy = len(df[df["label"] == 0])
    n_attacks = len(df[df["label"] == 1])
    contamination = n_attacks / n_total

    print(f"\n[+] Total d'échantillons générés : {n_total}")
    print(f"    - Trafic nominal (label = 0)  : {n_healthy} ({n_healthy/n_total*100:.1f}%)")
    print(f"    - Attaques réelles (label = 1) : {n_attacks} ({n_attacks/n_total*100:.1f}%)")
    print(f"    - Taux de contamination réel  : {contamination:.4f} ({contamination*100:.2f}%)")

    # Sauvegarde CSV
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\n[✔] Fichier exporté avec succès : {OUTPUT_CSV}")
    print(f"    Aperçu des 5 premières lignes :")
    print(df.head().to_string(index=False))


if __name__ == "__main__":
    main()
