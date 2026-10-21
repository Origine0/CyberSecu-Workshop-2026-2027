# ==============================================================================
# PROJECT RESILIENCE-ALPHA - Dockerfile Sécurisé CPU & 100% Hors-Ligne (Non-Root)
# ==============================================================================
FROM python:3.11-slim

# Configuration de l'environnement Python & Désactivation stricte d'Internet pour HuggingFace
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1

WORKDIR /app

# Dépendances système requises pour FAISS (OpenMP / libgomp1) et utilitaires réseau
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Création de l'utilisateur non-privilégié (Conformité Durcissement Sécurité & EBIOS RM)
RUN useradd -u 10001 -m -s /bin/sh appuser

# Étape 1 : Pré-installation stricte de PyTorch en version CPU pure
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Étape 2 : Installation des dépendances applicatives
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Étape 3 : Copie de l'API, des modèles, de la documentation et du jeu de données
COPY api.py .
COPY procedures.pdf .
COPY traffic_baseline.csv* .
COPY isolation_forest_model.joblib* .
COPY model_metrics.json* .
COPY train_model.py* .
COPY knowledge/ ./knowledge/
COPY models/ ./models/

# Droits stricts pour l'utilisateur non-root
RUN chown -R appuser:appuser /app

# Basculement sur l'utilisateur non-root
USER 10001

# Exposition du port FastAPI
EXPOSE 8000

# Commande de démarrage du serveur Uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
