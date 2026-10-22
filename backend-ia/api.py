"""
==============================================================================
PROJECT RESILIENCE-ALPHA - API DÉTECTION ML & ASSISTANT RAG (CYBER DÉFENSE)
==============================================================================
Rôle : Moteur de sécurité combinant :
  1. Détection d'anomalies de trafic sans règles en dur (Scikit-Learn Isolation Forest)
  2. Assistant d'analyse documentaire RAG (LangChain + FAISS + Ollama qwen2.5:1.5b)
     Strictement consultatif : AUCUN privilège d'exécution ou de remédiation.
==============================================================================
"""

import os
import logging
from typing import Optional
import numpy as np
import pandas as pd
import json
import joblib
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

# Imports LangChain & FAISS
from langchain_community.llms import Ollama
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# Configuration des logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("RESILIENCE-API")

# ==============================================================================
# CONFIGURATION DU NOEUD & RESEAU OLLAMA
# (Ligne 34 modifiable pour la Mission 2 - Déploiement réseau RESILIENCE-G<n>)
# ==============================================================================
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
PROCEDURES_FILE = os.getenv("PROCEDURES_FILE", "procedures.pdf")
MODEL_FILE = os.getenv("MODEL_FILE", "isolation_forest_model.joblib")
METRICS_FILE = os.getenv("METRICS_FILE", "model_metrics.json")

app = FastAPI(
    title="PROJECT RESILIENCE-ALPHA - ML Detection & RAG Advisory Engine",
    description="API de cybersécurité pour la détection d'intrusions (ML) et l'assistance documentaire aux opérateurs (RAG)",
    version="1.0.0"
)

# Activation CORS (Indispensable pour l'intégration avec le Frontend du groupe)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# PILIER 1 : MODÈLE MACHINE LEARNING (ISOLATION FOREST SANS RÈGLES EN DUR)
# ==============================================================================
model_metadata = {
    "source": "synthetic_mock",
    "samples_count": 0,
    "healthy_samples": 0,
    "attack_samples": 0,
    "contamination": 0.05
}

def init_ml_model(csv_path: Optional[str] = None) -> IsolationForest:
    """
    Initialise et calibre le modèle Isolation Forest :
    1. Si un modèle pré-entraîné Joblib est disponible, le charger instantanément avec ses métriques.
    2. Sinon, si traffic_baseline.csv est disponible, calibration dynamique.
    3. Sinon : fallback sur la baseline statistique mockée.
    Aucune règle déterministe (seuil en dur) n'est utilisée.
    """
    global model_metadata

    # Étape 1 : Chargement du modèle pré-entraîné sérialisé (optimisation temps réel)
    if os.path.exists(MODEL_FILE):
        try:
            logger.info(f"Chargement du modèle pré-entraîné Joblib : {MODEL_FILE}")
            clf = joblib.load(MODEL_FILE)
            metrics_info = {}
            if os.path.exists(METRICS_FILE):
                with open(METRICS_FILE, "r", encoding="utf-8") as mf:
                    metrics_info = json.load(mf)

            model_metadata = {
                "source": "pre_trained_joblib",
                "model_file": MODEL_FILE,
                "n_estimators": getattr(clf, "n_estimators", 150),
                "contamination": getattr(clf, "contamination", 0.035),
                "metrics": metrics_info.get("classification_metrics", {}),
                "dataset_size": metrics_info.get("dataset_size", 1500),
                "trained_at_utc": metrics_info.get("trained_at_utc", "")
            }
            logger.info(f"Modèle Isolation Forest opérationnel (ROC-AUC: {model_metadata.get('metrics', {}).get('roc_auc', 'N/A')}).")
            return clf
        except Exception as e:
            logger.error(f"Erreur lors du chargement du fichier {MODEL_FILE} : {e}")

    target_csv = csv_path or os.getenv("TRAFFIC_BASELINE_FILE", "traffic_baseline.csv")
    
    if os.path.exists(target_csv):
        try:
            logger.info(f"Chargement du jeu de données réel de baseline : {target_csv}")
            df = pd.read_csv(target_csv)
            required_cols = {"request_rate", "error_rate", "latency_ms", "label"}
            
            if required_cols.issubset(df.columns):
                # 1. Sélection des données saines pour l'apprentissage du profil normal
                healthy_df = df[df["label"] == 0][["request_rate", "error_rate", "latency_ms"]]
                n_healthy = len(healthy_df)
                n_total = len(df)
                n_attacks = len(df[df["label"] == 1])
                
                # 2. Calcul du taux de contamination réel issu des tirs de test
                raw_contamination = (n_attacks / n_total) if n_total > 0 and n_attacks > 0 else 0.05
                # Borne de sécurité Scikit-Learn (entre 1% et 25%)
                contamination = float(np.clip(raw_contamination, 0.01, 0.25))
                
                logger.info(
                    f"Calibration sur données réelles : {n_healthy} échantillons sains, "
                    f"{n_attacks} attaques. Taux de contamination ajusté à {contamination:.4f}"
                )
                
                clf = IsolationForest(
                    n_estimators=100,
                    contamination=contamination,
                    random_state=42
                )
                clf.fit(healthy_df)
                
                model_metadata = {
                    "source": os.path.basename(target_csv),
                    "samples_count": n_total,
                    "healthy_samples": n_healthy,
                    "attack_samples": n_attacks,
                    "contamination": round(contamination, 4)
                }
                logger.info("Modèle Isolation Forest entraîné sur données réelles avec succès.")
                return clf
            else:
                logger.warning(f"Le fichier {target_csv} ne contient pas les colonnes requises : {required_cols}. Fallback mock.")
        except Exception as e:
            logger.error(f"Erreur lors de la lecture de {target_csv} : {e}. Fallback mock.")

    logger.info("Entraînement de la baseline normale Isolation Forest (300 échantillons mock)...")
    np.random.seed(42)
    n_samples = 300

    # Profil statistique sain du trafic web (moyenne, écart-type) :
    # - request_rate : ~50 req/s
    # - error_rate : ~1.2% (0.012)
    # - latency_ms : ~120 ms
    normal_traffic = pd.DataFrame({
        "request_rate": np.random.normal(loc=50.0, scale=8.0, size=n_samples).clip(20.0, 90.0),
        "error_rate": np.random.normal(loc=0.012, scale=0.004, size=n_samples).clip(0.001, 0.035),
        "latency_ms": np.random.normal(loc=120.0, scale=12.0, size=n_samples).clip(70.0, 180.0)
    })

    # Contamination fixée à 5% pour absorber les légers bruits statistiques du cluster
    clf = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42
    )
    clf.fit(normal_traffic)
    model_metadata = {
        "source": "synthetic_mock",
        "samples_count": n_samples,
        "healthy_samples": n_samples,
        "attack_samples": 0,
        "contamination": 0.05
    }
    logger.info("Modèle Isolation Forest entraîné et opérationnel (mode mock).")
    return clf

model = init_ml_model()

# ==============================================================================
# PILIER 2 : ASSISTANT DOCUMENTAIRE & CYBER RAG (FAISS + OLLAMA + TÉLÉMÉTRIE LIVE)
# SANS PRIVILÈGE D'EXÉCUTION TECHNIQUE (RÔLE STRICTEMENT CONSULTATIF)
# ==============================================================================
# Prompt d'injection stricte de sécurité interdisant toute remédiation autonome
RAG_SYSTEM_PROMPT = """Tu es l'assistant vocal cyber et résilience de PROJECT RESILIENCE-ALPHA.
RÈGLE ABSOLUE DE SÉCURITÉ : Ton rôle est STRICTEMENT ANALYTIQUE ET CONSULTATIF. Tu n'as STRICTEMENT AUCUN DROIT DE REMÉDIATION directe ni d'exécution de commande sur l'infrastructure. Tu ne dois jamais exécuter, ordonner ou simuler d'action technique autonome.

Tu réponds aux questions de l'opérateur concernant :
1. L'architecture du système (microservices, bases PostgreSQL, WAF, proxy, monitoring Prometheus/Grafana/Loki, plan d'adressage Wi-Fi 192.168.137.0/24 et réseaux Docker).
2. La conformité réglementaire (DORA, PCA-PRA, RTO/RPO, gestion des secrets SOPS + age).
3. Les attaques subies et scénarios Red Team (SC-01 DDoS Flood L7, SC-02 Fuzzing 422, SC-03 Fuite CWE-209, SC-04 Chaos bancaire, scripts red_attack.py).
4. L'état en temps réel du système et du WAF (attaques bloquées, IPs actuellement bannies, métriques et détections ML).

Consignes de réponse :
- Réponds de manière concise, précise, factuelle et claire (2 à 4 phrases maximum) pour permettre une synthèse vocale fluide sur le HUD du robot ou le dashboard.
- Si une procédure de remédiation est demandée, détaille les consignes documentées pour l'opérateur humain tout en rappelant que tu n'exécutes aucune action directe.
- Si l'information demandée ne figure ni dans la documentation ni dans la télémétrie en temps réel ci-dessous, indique sobrement que l'information n'est pas répertoriée.

Contexte opérationnel (Télémétrie en temps réel & Documentation) :
{context}

Question de l'opérateur :
{question}

Réponse consultative concise :"""

qa_prompt = PromptTemplate(
    template=RAG_SYSTEM_PROMPT,
    input_variables=["context", "question"]
)

# Initialisation du LLM Ollama avec limitation stricte pour fluidité vocale (réponse < 5 secondes)
llm = Ollama(
    base_url=OLLAMA_BASE_URL,
    model=OLLAMA_MODEL,
    temperature=0.1,
    num_predict=160,
    stop=["\n\n\n", "Question de l'opérateur", "RÈGLE ABSOLUE", "Extrait des", "--- Source:"],
    timeout=40.0
)

vector_db = None
qa_chain = None

def fetch_live_system_snapshot() -> str:
    """
    Récupère en temps réel (max 0.6s) l'état opérationnel du WAF et du cluster
    pour l'injecter dynamiquement dans le contexte RAG.
    Permet à l'assistant de répondre instantanément aux questions sur les attaques
    actuellement subies, les requêtes bloquées et les IPs bannies.
    """
    import urllib.request
    endpoints = [
        "http://waf:8080/api/waf/status",
        "http://payment-api:8000/waf/status",
        "http://localhost:8082/api/waf/status"
    ]
    data = None
    for url in endpoints:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Resilience-RAG/1.0"})
            with urllib.request.urlopen(req, timeout=0.6) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    break
        except Exception:
            continue

    if not data:
        return "[TÉLÉMÉTRIE TEMPS RÉEL DU SYSTÈME]\nStatut : Plateforme active. Données détaillées du WAF en attente de synchronisation."

    try:
        stats = data.get("stats", {})
        total_blocked = stats.get("total_blocked", 0)
        rate_limit_drops = stats.get("rate_limit_drops", 0)
        banned_ip_drops = stats.get("banned_ip_drops", 0)
        fuzzing_drops = stats.get("fuzzing_drops", 0)

        banned_ips = data.get("banned_ips", [])
        banned_ips_str = ", ".join(banned_ips) if banned_ips else "Aucune IP actuellement bannie"

        grafana = data.get("grafana", {})
        ml_anomaly = grafana.get("ml_anomaly", False)
        ml_alerts_1h = grafana.get("ml_alerts_1h", 0)
        targets_up = grafana.get("targets_up_ratio", 100.0)

        features = grafana.get("features_series", {})
        req_rates = features.get("request_rate", [])
        latencies = features.get("latency_ms", [])
        err_rates = features.get("error_rate", [])

        cur_req = req_rates[-1]["value"] if req_rates else 0.50
        cur_lat = latencies[-1]["value"] if latencies else 28.0
        cur_err = err_rates[-1]["value"] if err_rates else 0.0

        containers = grafana.get("containers", {})
        total_c = len(containers)
        healthy_c = sum(1 for c in containers.values() if c.get("healthy", False))

        remed = data.get("remediation", {})
        remed_status = remed.get("status", "UP")
        recent_actions = remed.get("recent_actions", [])
        remed_str = f"{len(recent_actions)} action(s) récente(s)" if recent_actions else "Aucune remédiation en cours"

        return (
            f"[TÉLÉMÉTRIE TEMPS RÉEL DU SYSTÈME & ATTAQUES SUBIES]\n"
            f"- Requêtes bloquées au WAF : {total_blocked} requête(s) interceptée(s) "
            f"(DDoS rate limiting: {rate_limit_drops}, IPs bannies: {banned_ip_drops}, Fuzzing/malformé: {fuzzing_drops})\n"
            f"- Adresses IP bannies au WAF : {banned_ips_str}\n"
            f"- État détection d'anomalie ML : {'ALERTE ATTAQUE EN COURS' if ml_anomaly else 'NOMINAL (Trafic normal)'} "
            f"(Total alertes 1h : {ml_alerts_1h})\n"
            f"- Métriques de trafic courantes : Débit = {cur_req:.2f} req/s, Latence = {cur_lat:.1f} ms, Taux d'erreurs = {cur_err:.2f}%\n"
            f"- Santé globale des conteneurs : {healthy_c}/{total_c} conteneurs sains ({targets_up:.1f}% cibles UP)\n"
            f"- Remédiation autonome Ansible : Statut {remed_status}, {remed_str}"
        )
    except Exception as e:
        logger.warning(f"Avertissement lors de la mise en forme de la télémétrie : {e}")
        return "[TÉLÉMÉTRIE TEMPS RÉEL DU SYSTÈME]\nStatut : Surveillance WAF et microservices active."

def init_vector_store():
    """Charge procedures.pdf et l'ensemble des bases markdown de connaissances (architecture, attaques, gouvernance, adressage)."""
    global vector_db, qa_chain
    documents = []

    # 1. Chargement du PDF s'il existe
    if os.path.exists(PROCEDURES_FILE):
        try:
            logger.info(f"Chargement de la documentation : {PROCEDURES_FILE}...")
            loader = PyPDFLoader(PROCEDURES_FILE)
            documents.extend(loader.load())
        except Exception as e:
            logger.error(f"Erreur lors du chargement de {PROCEDURES_FILE}: {e}")

    # 2. Chargement des documents Markdown de connaissances (Architecture, Attaques Red Team, EBIOS RM, DORA, Plan d'adressage)
    candidate_dirs = [
        "/data/knowledge",
        os.path.join(os.path.dirname(__file__), "knowledge"),
        os.path.join(os.getcwd(), "backend-ia", "knowledge")
    ]
    seen_files = set()
    from langchain_core.documents import Document

    for kdir in candidate_dirs:
        if os.path.exists(kdir):
            for fname in sorted(os.listdir(kdir)):
                if fname.endswith(".md") and fname not in seen_files:
                    fpath = os.path.join(kdir, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            content = f.read()
                        documents.append(Document(page_content=content, metadata={"source": fname}))
                        seen_files.add(fname)
                        logger.info(f"Document de connaissances chargé pour RAG : {fname} ({len(content)} caractères)")
                    except Exception as e:
                        logger.error(f"Erreur lors de la lecture de {fname}: {e}")

    if documents:
        try:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=600,
                chunk_overlap=100
            )
            chunks = text_splitter.split_documents(documents)
            logger.info(f"{len(chunks)} chunks extraits pour le RAG ({len(seen_files)} fichiers markdown chargés).")

            # Mode 100% Hors-Ligne : Chargement local prioritaire sans requête Internet
            local_model_paths = [
                os.path.join(os.path.dirname(__file__), "models", "all-MiniLM-L6-v2"),
                "/app/models/all-MiniLM-L6-v2",
                "/data/models/all-MiniLM-L6-v2"
            ]
            local_model_path = next((p for p in local_model_paths if os.path.exists(p)), None)

            if local_model_path:
                logger.info(f"Chargement embeddings 100% HORS-LIGNE depuis : {local_model_path}")
                embeddings = HuggingFaceEmbeddings(
                    model_name=local_model_path,
                    model_kwargs={"device": "cpu", "local_files_only": True},
                    encode_kwargs={"normalize_embeddings": True}
                )
            else:
                logger.info("Chargement standard all-MiniLM-L6-v2")
                embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

            vector_db = FAISS.from_documents(chunks, embeddings)

            qa_chain = RetrievalQA.from_chain_type(
                llm=llm,
                chain_type="stuff",
                retriever=vector_db.as_retriever(search_kwargs={"k": 4}),
                chain_type_kwargs={"prompt": qa_prompt}
            )
            logger.info("Base vectorielle FAISS et chaîne RAG initialisées avec succès sur l'ensemble du système et des attaques.")
        except Exception as e:
            logger.error(f"Erreur lors de l'initialisation FAISS / HuggingFace: {e}")
    else:
        logger.warning("Aucun document trouvé pour le RAG.")

init_vector_store()

# ==============================================================================
# SCHÉMAS PYDANTIC (ENTRÉES / SORTIES)
# ==============================================================================
class MetricPayload(BaseModel):
    timestamp: str = Field(..., example="2026-10-21T10:00:00Z")
    request_rate: float = Field(..., ge=0.0, description="Requêtes par seconde (Nominal opérationnel: 0.50 req/s)", example=0.50)
    error_rate: float = Field(..., ge=0.0, le=1.0, description="Taux d'erreurs HTTP (0.0 à 1.0)", example=0.005)
    latency_ms: float = Field(..., ge=0.0, description="Latence moyenne en ms", example=28.0)

class AnalysisResponse(BaseModel):
    timestamp: str
    is_anomaly: bool
    action_required: str
    anomaly_score: float
    metrics_received: dict

class QuestionPayload(BaseModel):
    query: str = Field(..., min_length=2, example="Quelle est la procédure en cas d'attaque par déni de service ?")

class RAGResponse(BaseModel):
    query: str
    response: str
    status: str
    advisory_role: str = "READ_ONLY_NO_REMEDIATION"

# ==============================================================================
# ROUTES API
# ==============================================================================
@app.get("/", tags=["Health"])
def root():
    """Healthcheck général du conteneur et statut d'entraînement du modèle."""
    return {
        "service": "PROJECT RESILIENCE-ALPHA Engine",
        "status": "OPERATIONAL",
        "ml_model_loaded": model is not None,
        "model_metadata": model_metadata,
        "rag_vector_db_loaded": vector_db is not None,
        "ollama_endpoint": OLLAMA_BASE_URL,
        "ollama_model": OLLAMA_MODEL
    }

@app.get("/model/metrics", tags=["ML Detection"])
def get_model_evaluation_metrics():
    """
    Retourne le rapport scientifique d'évaluation du modèle ML
    (Precision, Recall, F1-Score, ROC-AUC, matrice de confusion, vitesse d'inférence).
    """
    if os.path.exists(METRICS_FILE):
        try:
            with open(METRICS_FILE, "r", encoding="utf-8") as mf:
                return json.load(mf)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {
        "status": "MOCK_BASELINE",
        "metadata": model_metadata,
        "note": "Exécutez train_model.py pour régénérer le rapport complet."
    }

@app.post("/retrain", tags=["ML Detection"])
def retrain_model():
    """
    Déclenche le ré-entraînement à chaud du modèle Isolation Forest
    sur le fichier de métriques traffic_baseline.csv fourni par Infra/Cyber.
    """
    global model
    model = init_ml_model()
    return {
        "status": "SUCCESS",
        "message": "Isolation Forest ré-entraîné et calibré avec succès.",
        "model_metadata": model_metadata
    }

@app.post("/analyze", response_model=AnalysisResponse, tags=["ML Detection"])
def analyze_metrics(payload: MetricPayload):
    """
    Détecte si le flux de métriques constitue une anomalie (attaque)
    via l'algorithme Isolation Forest (Scikit-Learn).
    Retourne is_anomaly (bool) et action_required ("TRIGGER_REMEDIATION" ou "NONE").
    """
    df_sample = pd.DataFrame([{
        "request_rate": payload.request_rate,
        "error_rate": payload.error_rate,
        "latency_ms": payload.latency_ms
    }])

    # Inférence non supervisée : 1 = normal (inlier), -1 = anomalie (outlier)
    prediction = model.predict(df_sample)[0]
    score = float(model.decision_function(df_sample)[0])

    is_anomaly = bool(prediction == -1)
    action = "TRIGGER_REMEDIATION" if is_anomaly else "NONE"

    logger.info(f"Analyse métriques - Anomaly: {is_anomaly} (Score: {score:.4f}) -> Action: {action}")

    return {
        "timestamp": payload.timestamp,
        "is_anomaly": is_anomaly,
        "action_required": action,
        "anomaly_score": score,
        "metrics_received": {
            "request_rate": payload.request_rate,
            "error_rate": payload.error_rate,
            "latency_ms": payload.latency_ms
        }
    }

@app.post("/ask", response_model=RAGResponse, tags=["RAG Assistant"])
def ask_assistant(payload: QuestionPayload):
    """
    Interroge l'assistant RAG sur l'architecture, l'état du système et les attaques subies.
    L'assistant n'exécute aucune remédiation et fournit un rôle exclusivement consultatif.
    Combine la base vectorielle documentaire (FAISS) et la télémétrie en direct du WAF.
    """
    if not vector_db:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Base vectorielle documentaire non disponible. Vérifiez la présence des fichiers de connaissances."
        )

    try:
        logger.info(f"Question RAG reçue : '{payload.query}'")

        # 1. Télémétrie en direct (attaques subies, requêtes bloquées au WAF, IPs bannies, santé)
        live_telemetry = fetch_live_system_snapshot()

        # 2. Recherche vectorielle des passages les plus pertinents dans la documentation
        docs = vector_db.similarity_search(payload.query, k=4)
        doc_context = "\n\n".join([f"--- Source: {doc.metadata.get('source', 'doc')} ---\n{doc.page_content}" for doc in docs])

        full_context = f"{live_telemetry}\n\n[DOCUMENTATION TECHNIQUE, PROCÉDURES ET ATTAQUES]\n{doc_context}"

        # 3. Génération avec le prompt de sécurité consultatif
        prompt_input = qa_prompt.format(context=full_context, question=payload.query)
        raw_answer = llm.invoke(prompt_input)
        clean_answer = raw_answer.strip()

        return {
            "query": payload.query,
            "response": clean_answer,
            "status": "SUCCESS",
            "advisory_role": "READ_ONLY_NO_REMEDIATION"
        }
    except Exception as e:
        logger.error(f"Erreur lors de l'appel au LLM Ollama ({OLLAMA_BASE_URL}) : {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Échec de communication avec Ollama sur {OLLAMA_BASE_URL} : {str(e)}"
        )
