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
def init_ml_model() -> IsolationForest:
    """
    Initialise et calibre le modèle Isolation Forest sur une baseline statistique
    de trafic nominal web simulé (requêtes, erreurs, latence).
    Aucune règle déterministe (seuil en dur) n'est utilisée.
    """
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
    logger.info("Modèle Isolation Forest entraîné et opérationnel.")
    return clf

model = init_ml_model()

# ==============================================================================
# PILIER 2 : ASSISTANT DOCUMENTAIRE RAG (FAISS + OLLAMA) SANS DROIT DE REMÉDIATION
# ==============================================================================
# Prompt d'injection stricte de sécurité interdisant toute remédiation autonome
RAG_SYSTEM_PROMPT = """Tu es l'assistant documentaire cyber de PROJECT RESILIENCE-ALPHA.
RÈGLE ABSOLUE DE SÉCURITÉ : Ton rôle est STRICTEMENT ANALYTIQUE ET CONSULTATIF. Tu n'as STRICTEMENT AUCUN DROIT DE REMÉDIATION ni d'exécution de commande.
Tu ne dois jamais exécuter, ordonner ou simuler d'action technique autonome sur l'infrastructure.
Réponds exclusivement à partir des procédures fournies dans le contexte ci-dessous.
Si une procédure de remédiation est demandée, détaille les consignes documentées pour l'opérateur humain tout en rappelant que tu n'exécutes aucune action directe.
Si l'information demandée n'est pas présente dans le document, indique simplement que la documentation disponible ne contient pas cette information.

Extrait des procédures de sécurité :
{context}

Question de l'opérateur :
{question}

Réponse consultative :"""

qa_prompt = PromptTemplate(
    template=RAG_SYSTEM_PROMPT,
    input_variables=["context", "question"]
)

# Initialisation du LLM Ollama
llm = Ollama(
    base_url=OLLAMA_BASE_URL,
    model=OLLAMA_MODEL,
    temperature=0.1
)

vector_db = None
qa_chain = None

def init_vector_store():
    """Charge procedures.pdf, calcule les embeddings CPU et instancie la base FAISS."""
    global vector_db, qa_chain
    if os.path.exists(PROCEDURES_FILE):
        try:
            logger.info(f"Chargement de la documentation : {PROCEDURES_FILE}...")
            loader = PyPDFLoader(PROCEDURES_FILE)
            documents = loader.load()

            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=500,
                chunk_overlap=50
            )
            chunks = text_splitter.split_documents(documents)
            logger.info(f"{len(chunks)} chunks extraits du PDF.")

            embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            vector_db = FAISS.from_documents(chunks, embeddings)

            qa_chain = RetrievalQA.from_chain_type(
                llm=llm,
                chain_type="stuff",
                retriever=vector_db.as_retriever(search_kwargs={"k": 3}),
                chain_type_kwargs={"prompt": qa_prompt}
            )
            logger.info("Base vectorielle FAISS et chaîne RAG initialisées avec succès.")
        except Exception as e:
            logger.error(f"Erreur lors du chargement de FAISS / HuggingFace: {e}")
    else:
        logger.warning(f"Fichier {PROCEDURES_FILE} introuvable à la racine. Le RAG est en attente d'indexation.")

init_vector_store()

# ==============================================================================
# SCHÉMAS PYDANTIC (ENTRÉES / SORTIES)
# ==============================================================================
class MetricPayload(BaseModel):
    timestamp: str = Field(..., example="2026-10-20T10:00:00Z")
    request_rate: float = Field(..., ge=0.0, description="Requêtes par seconde", example=52.5)
    error_rate: float = Field(..., ge=0.0, le=1.0, description="Taux d'erreurs HTTP (0.0 à 1.0)", example=0.015)
    latency_ms: float = Field(..., ge=0.0, description="Latence moyenne en ms", example=118.0)

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
    """Healthcheck général du conteneur."""
    return {
        "service": "PROJECT RESILIENCE-ALPHA Engine",
        "status": "OPERATIONAL",
        "ml_model_loaded": model is not None,
        "rag_vector_db_loaded": vector_db is not None,
        "ollama_endpoint": OLLAMA_BASE_URL,
        "ollama_model": OLLAMA_MODEL
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
    Interroge l'assistant RAG sur les procédures de sécurité.
    L'assistant n'exécute aucune remédiation et fournit un rôle exclusivement consultatif.
    """
    if not qa_chain:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Base documentaire non disponible. Vérifiez la présence de {PROCEDURES_FILE}."
        )

    try:
        logger.info(f"Question RAG reçue : '{payload.query}'")
        res = qa_chain.invoke({"query": payload.query})
        answer = res.get("result", "")
        return {
            "query": payload.query,
            "response": answer,
            "status": "SUCCESS",
            "advisory_role": "READ_ONLY_NO_REMEDIATION"
        }
    except Exception as e:
        logger.error(f"Erreur lors de l'appel au LLM Ollama ({OLLAMA_BASE_URL}) : {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Échec de communication avec Ollama sur {OLLAMA_BASE_URL}. Vérifiez qu'Ollama est démarré et que le modèle {OLLAMA_MODEL} est présent."
        )
