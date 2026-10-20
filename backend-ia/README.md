# Pilier IA & Data — Détection ML & Assistant RAG (PROJECT RESILIENCE-ALPHA)

Ce microservice constitue le pilier d'intelligence artificielle et de cyber-défense du projet **PROJECT RESILIENCE-ALPHA** (Workshop Cybersécurité Bac+5).

---

## 🎯 Rôles & Responsabilités

1. **Détection d'Anomalies & Attaques (AIOps / ML) :**
   - Modèle **Isolation Forest** (Scikit-Learn) calibré sur métriques (`request_rate`, `error_rate`, `latency_ms`).
   - Décision purement statistique basée sur l'hyperplan de partitionnement — **aucune règle ni seuil codé en dur**.
   - Sortie : `is_anomaly` (bool) et `action_required` (`TRIGGER_REMEDIATION` ou `NONE`).

2. **Assistant Documentaire RAG (LangChain + FAISS + Ollama) :**
   - Indexation vectorielle du corpus `procedures.pdf` via **FAISS** (CPU-friendly) et embeddings `all-MiniLM-L6-v2`.
   - Modèle LLM quantifié `< 8B` (`qwen2.5:1.5b`) orchestré par **Ollama**.
   - **Règle stricte de sécurité :** Rôle exclusivement **consultatif**. L'assistant n'a **aucun droit de remédiation** autonome.

---

## 📡 Contrat d'Interface API (FastAPI)

- **Swagger interactif :** `http://localhost:8001/docs` (ou port 8000 en standalone)

### 1. Inférence ML : `POST /analyze`
**Payload d'entrée :**
```json
{
  "timestamp": "2026-10-20T10:00:00Z",
  "request_rate": 52.5,
  "error_rate": 0.015,
  "latency_ms": 118.0
}
```
**Réponse :**
```json
{
  "timestamp": "2026-10-20T10:00:00Z",
  "is_anomaly": false,
  "action_required": "NONE",
  "anomaly_score": 0.1678,
  "metrics_received": {
    "request_rate": 52.5,
    "error_rate": 0.015,
    "latency_ms": 118.0
  }
}
```
*(Si une attaque est injectée, `is_anomaly` passe à `true` et `action_required` devient `TRIGGER_REMEDIATION`).*

### 2. Assistant RAG : `POST /ask`
**Payload d'entrée :**
```json
{
  "query": "Quelle est la procédure à suivre en cas d'attaque par déni de service ?"
}
```
**Réponse :**
```json
{
  "query": "Quelle est la procédure à suivre en cas d'attaque par déni de service ?",
  "response": "Selon les procédures de sécurité...",
  "status": "SUCCESS",
  "advisory_role": "READ_ONLY_NO_REMEDIATION"
}
```

---

## 🚀 Exécution Standalone (Docker)

```bash
# Build optimisé CPU (PyTorch CPU sans dépendances CUDA)
docker build -t resilience-ai-api .

# Démarrage avec résolution vers le démon Ollama de la machine hôte
docker run -d -p 8001:8000 --name resilience-ai-api --add-host=host.docker.internal:host-gateway resilience-ai-api
```
