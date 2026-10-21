# Détection continue : mêmes versions que l'image backend-ia, pour charger le modèle Isolation Forest à l'identique
FROM python:3.11.17-slim-bookworm

RUN pip install --no-cache-dir scikit-learn==1.9.1 numpy==1.26.4 scipy==1.17.1 joblib==1.6.0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER 65534:65534
WORKDIR /app
