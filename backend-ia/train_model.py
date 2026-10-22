#!/usr/bin/env python3
"""
==============================================================================
PROJECT RESILIENCE-ALPHA — Pipeline d'Apprentissage & Calibration IA (AIOps)
==============================================================================
Auteure : Agathe (Lead Développeuse IA & Data)
Spécialité : Détection d'anomalies de trafic sans règles en dur (M2 Cybersécurité)
Algorithme : Isolation Forest (Scikit-Learn 1.9.1 / NumPy 1.26.4)
Calibration : Trafic opérationnel réel (0.5 req/s nominal) vs Attaques Red Team L7
==============================================================================
"""

import os
import sys
import json
import time
import argparse
from typing import Dict, Any, Tuple
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    confusion_matrix,
    classification_report,
    roc_auc_score,
    precision_recall_fscore_support,
    average_precision_score
)

# Chemins de référence
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.getenv("OUTPUT_DIR", BASE_DIR)
DATASET_FILE = os.path.join(OUT_DIR, "traffic_baseline.csv")
MODEL_OUTPUT = os.path.join(OUT_DIR, "isolation_forest_model.joblib")
METRICS_OUTPUT = os.path.join(OUT_DIR, "model_metrics.json")

FEATURES = ["request_rate", "error_rate", "latency_ms"]


def generate_extended_dataset(n_samples: int = 1500, seed: int = 42) -> pd.DataFrame:
    """
    Génère un jeu de données rigoureusement calibré sur le démonstrateur réel :
    1. Trafic Nominal (82%) :
       - Heures creuses : 0.2 - 0.4 req/s, 0.0% erreurs, 18-28 ms
       - Régime nominal standard : 0.4 - 0.7 req/s (moyenne 0.5 req/s, 1 tx/2s), 22-38 ms
       - Pic d'activité légitime : 0.8 - 1.8 req/s, erreurs < 1.5%, 30-55 ms
    2. Vecteurs d'Attaques Red Team (18%) :
       - Flood L7 (DDoS de Clara) : 12 à 60+ req/s (25x à 120x le nominal !), latence 350-2500 ms
       - Fuzzing 422 : 1 à 4 req/s, rejets massifs HTTP 422 (> 60%)
       - Chaos 500 / Timeout : latences extrêmes (> 500 ms) et erreurs 500 (> 50%)
       - Furtif / Low-and-Slow : micro-dérives (2.5 à 5 req/s, latence 90-160 ms)
    """
    np.random.seed(seed)
    records = []
    
    n_nominal = int(n_samples * 0.82)
    n_attacks = n_samples - n_nominal
    n_flood = int(n_attacks * 0.40)
    n_fuzzing = int(n_attacks * 0.25)
    n_chaos = int(n_attacks * 0.20)
    n_stealth = n_attacks - (n_flood + n_fuzzing + n_chaos)
    
    # 1. NOMINAL (label = 0)
    for _ in range(n_nominal):
        profile = np.random.choice(["quiet", "regular", "busy"], p=[0.25, 0.55, 0.20])
        if profile == "quiet":
            req_rate = float(np.random.normal(loc=0.32, scale=0.06))
            err_rate = float(np.random.beta(0.2, 90.0)) * 0.005
            lat_ms = float(np.random.normal(loc=22.0, scale=3.0))
        elif profile == "regular":
            # Conforme au trafic_gen réel (1 requête toutes les 2 secondes = 0.50 req/s)
            req_rate = float(np.random.normal(loc=0.50, scale=0.10))
            err_rate = float(np.random.beta(0.5, 70.0)) * 0.008
            lat_ms = float(np.random.normal(loc=28.0, scale=4.5))
        else: # busy (affluence légitime)
            req_rate = float(np.random.normal(loc=1.15, scale=0.25))
            err_rate = float(np.random.beta(0.8, 50.0)) * 0.015
            lat_ms = float(np.random.normal(loc=38.0, scale=6.0))
            
        records.append({
            "request_rate": max(0.10, min(round(req_rate, 3), 1.95)),
            "error_rate": max(0.0, min(round(err_rate, 4), 0.020)),
            "latency_ms": max(15.0, min(round(lat_ms, 2), 65.0)),
            "attack_type": "NOMINAL",
            "label": 0
        })

    # 2. VECTEUR A : FLOOD L7 (DDoS de Clara)
    for _ in range(n_flood):
        req_rate = float(np.random.normal(loc=28.0, scale=8.0))
        err_rate = float(np.random.uniform(0.25, 0.85))
        lat_ms = float(np.random.normal(loc=550.0, scale=180.0))
        records.append({
            "request_rate": max(8.0, round(req_rate, 2)),
            "error_rate": round(err_rate, 4),
            "latency_ms": max(120.0, round(lat_ms, 2)),
            "attack_type": "DDOS_L7_FLOOD",
            "label": 1
        })

    # 3. VECTEUR B : FUZZING / PAYLOADS MALFORMÉS (422)
    for _ in range(n_fuzzing):
        req_rate = float(np.random.normal(loc=1.8, scale=0.5))
        err_rate = float(np.random.uniform(0.60, 0.99))
        lat_ms = float(np.random.normal(loc=32.0, scale=5.0))
        records.append({
            "request_rate": max(0.6, min(round(req_rate, 2), 4.5)),
            "error_rate": round(err_rate, 4),
            "latency_ms": max(18.0, min(round(lat_ms, 2), 55.0)),
            "attack_type": "FUZZING_422",
            "label": 1
        })

    # 4. VECTEUR C : CHAOS ENGINEERING / DB TIMEOUT (500)
    for _ in range(n_chaos):
        req_rate = float(np.random.normal(loc=0.8, scale=0.3))
        err_rate = float(np.random.uniform(0.45, 0.95))
        lat_ms = float(np.random.normal(loc=1100.0, scale=300.0))
        records.append({
            "request_rate": max(0.2, round(req_rate, 2)),
            "error_rate": round(err_rate, 4),
            "latency_ms": max(400.0, round(lat_ms, 2)),
            "attack_type": "CHAOS_TIMEOUT_500",
            "label": 1
        })

    # 5. VECTEUR D : LOW-AND-SLOW (Attaque furtive)
    for _ in range(n_stealth):
        req_rate = float(np.random.normal(loc=3.2, scale=0.6))
        err_rate = float(np.random.uniform(0.06, 0.18))
        lat_ms = float(np.random.normal(loc=115.0, scale=20.0))
        records.append({
            "request_rate": max(2.2, round(req_rate, 2)),
            "error_rate": round(err_rate, 4),
            "latency_ms": max(75.0, round(lat_ms, 2)),
            "attack_type": "STEALTH_INTRUSION",
            "label": 1
        })

    df = pd.DataFrame(records)
    return df.sample(frac=1.0, random_state=seed).reset_index(drop=True)


def train_and_evaluate_isolation_forest(
    df: pd.DataFrame,
    n_estimators: int = 150,
    random_state: int = 42
) -> Tuple[IsolationForest, Dict[str, Any]]:
    """
    Entraîne l'Isolation Forest sans règles en dur et calcule les métriques d'évaluation.
    """
    X = df[FEATURES]
    y_true = df["label"].values
    
    contamination_rate = float(y_true.sum() / len(y_true))
    
    # Instanciation de l'Isolation Forest
    iso_forest = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination_rate,
        random_state=random_state,
        n_jobs=-1
    )
    
    start_time = time.perf_counter()
    iso_forest.fit(X)
    training_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    # Inférence : 1 = inlier (nominal 0), -1 = outlier (anomalie 1)
    raw_preds = iso_forest.predict(X)
    y_pred = np.where(raw_preds == -1, 1, 0)
    
    anomaly_scores = -iso_forest.score_samples(X)
    
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="binary")
    roc_auc = roc_auc_score(y_true, anomaly_scores)
    pr_auc = average_precision_score(y_true, anomaly_scores)
    
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
    
    # Mesure de latence d'inférence (1000 échantillons)
    sample_bench = X.iloc[:1000]
    bench_start = time.perf_counter()
    _ = iso_forest.predict(sample_bench)
    bench_duration = time.perf_counter() - bench_start
    latency_per_sample_us = round((bench_duration / len(sample_bench)) * 1_000_000, 2)
    
    metrics = {
        "dataset_summary": {
            "total_samples": len(df),
            "nominal_samples": int((y_true == 0).sum()),
            "attack_samples": int((y_true == 1).sum()),
            "nominal_request_rate_mean": round(float(df[df["label"] == 0]["request_rate"].mean()), 3),
            "contamination_rate": round(contamination_rate, 4),
            "features": FEATURES
        },
        "performance_metrics": {
            "accuracy": round(float((tp + tn) / len(y_true)), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1_score": round(float(f1), 4),
            "roc_auc": round(float(roc_auc), 4),
            "pr_auc": round(float(pr_auc), 4),
            "false_positive_rate": round(fpr, 4),
            "false_negative_rate": round(fnr, 4)
        },
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp)
        },
        "benchmarks": {
            "training_time_ms": training_time_ms,
            "inference_latency_per_sample_us": latency_per_sample_us,
            "n_estimators": n_estimators,
            "runtime_environment": {
                "scikit_learn_version": joblib.__name__,
                "algorithm": "IsolationForest"
            }
        },
        "operational_thresholds": {
            "nominal_rate_expected": 0.5,
            "attack_flood_detected_min_rate": 8.0,
            "action_trigger": "TRIGGER_REMEDIATION"
        }
    }
    
    return iso_forest, metrics


def main():
    parser = argparse.ArgumentParser(description="Pipeline d'entraînement Isolation Forest calibré")
    parser.add_argument("--samples", type=int, default=1500, help="Nombre total d'échantillons télémétriques")
    parser.add_argument("--estimators", type=int, default=150, help="Nombre d'arbres d'isolation")
    args = parser.parse_args()
    
    print("=" * 70)
    print(" 🚀 RESILIENCE-ALPHA — APPRENTISSAGE SCIENTIFIQUE ISOLATION FOREST")
    print(f" Calibration : Trafic Nominal Réel 0.5 req/s • Volume : {args.samples} obs.")
    print("=" * 70)
    
    print("[1/4] Génération du jeu de données télémétrique opérationnel...")
    df = generate_extended_dataset(n_samples=args.samples)
    df.to_csv(DATASET_FILE, index=False)
    print(f"      ✓ Dataset sauvegardé : {DATASET_FILE} ({len(df)} lignes)")
    
    print("[2/4] Entraînement de l'ensemble d'arbres d'isolation...")
    model, metrics = train_and_evaluate_isolation_forest(df, n_estimators=args.estimators)
    
    print("[3/4] Sérialisation de l'artefact Joblib...")
    joblib.dump(model, MODEL_OUTPUT)
    print(f"      ✓ Modèle sérialisé : {MODEL_OUTPUT}")
    
    print("[4/4] Sauvegarde du rapport d'évaluation scientifique JSON...")
    with open(METRICS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(f"      ✓ Métriques enregistrées : {METRICS_OUTPUT}")
    
    print("\n" + "=" * 70)
    print(" 📊 BILAN DES PERFORMANCES DU MODÈLE CALIBRÉ (0.5 req/s) :")
    print(f" - ROC-AUC Score : {metrics['performance_metrics']['roc_auc']:.4f}")
    print(f" - F1-Score      : {metrics['performance_metrics']['f1_score']:.4f}")
    print(f" - Recall        : {metrics['performance_metrics']['recall']:.4f}")
    print(f" - Precision     : {metrics['performance_metrics']['precision']:.4f}")
    print(f" - Taux Faux Positif : {metrics['performance_metrics']['false_positive_rate'] * 100:.2f}%")
    print(f" - Latence d'inférence : {metrics['benchmarks']['inference_latency_per_sample_us']} µs / observation")
    print("=" * 70)


if __name__ == "__main__":
    main()
