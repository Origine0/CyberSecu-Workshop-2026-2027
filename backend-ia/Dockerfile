# ==============================================================================
# PROJECT RESILIENCE-ALPHA - Dockerfile Optimisé CPU (FastAPI + ML + RAG)
# ==============================================================================
FROM python:3.11-slim

# Configuration de l'environnement Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Dépendances système requises pour FAISS (OpenMP / libgomp1) et utilitaires réseau
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Étape 1 : Pré-installation stricte de PyTorch en version CPU pure
# Empêche sentence-transformers de télécharger les binaires GPU/CUDA (~2.5 Go économisés)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Étape 2 : Installation des dépendances applicatives
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Étape 3 : Copie de l'API et de la base documentaire
COPY api.py .
COPY procedures.pdf .

# Exposition du port FastAPI
EXPOSE 8000

# Commande de démarrage du serveur Uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
