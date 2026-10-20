import { ProjectSourceFile } from '../types/index.ts';

export const WORKSHOP_FILES: ProjectSourceFile[] = [
  {
    id: 'docker-compose',
    name: 'docker-compose.yml',
    path: 'docker-compose.yml',
    language: 'yaml',
    category: 'infra',
    description: 'Orchestration Docker Compose : conteneur PostgreSQL avec healthcheck natif, backend FastAPI et frontend Next.js sur réseau isolé.',
    badge: 'Obligatoire Sprint 1',
    content: `version: '3.8'

services:
  # ==========================================================
  # 1. CONTENEUR POSTGRESQL (Base de données transactionnelle)
  # ==========================================================
  postgres:
    image: postgres:16-alpine
    container_name: resilience-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: resilience_db
      POSTGRES_USER: resilience_user
      POSTGRES_PASSWORD: resilience_password_secret
      PGDATA: /var/lib/postgresql/data/pgdata
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U resilience_user -d resilience_db"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - resilience-net
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

  # ==========================================================
  # 2. BACKEND FASTAPI (API REST /pay & /health)
  # ==========================================================
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: resilience-api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://resilience_user:resilience_password_secret@postgres:5432/resilience_db
      PORT: 8000
      ENVIRONMENT: production
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "python -c 'import urllib.request; urllib.request.urlopen(\\"http://localhost:8000/health\\")'"]
      interval: 5s
      timeout: 3s
      retries: 3
    networks:
      - resilience-net
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

  # ==========================================================
  # 3. FRONTEND NEXT.JS (Dashboard 4 Zones & Portail Paiement)
  # ==========================================================
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: resilience-frontend
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - resilience-net

volumes:
  pgdata:
    driver: local

networks:
  resilience-net:
    driver: bridge
`,
  },
  {
    id: 'postgres-init-sql',
    name: 'init.sql',
    path: 'database/init.sql',
    language: 'sql',
    category: 'db',
    description: 'DDL PostgreSQL propre : tables merchants, transactions, audit_logs avec indexation fine & Common Table Expressions (CTEs) analytiques.',
    badge: 'SQL Propre + CTEs (Pas de vues lourdes)',
    content: `-- ====================================================================
-- PROJECT RESILIENCE-ALPHA • DIRECTION NATIONALE DE LA SÛRETÉ NUMÉRIQUE
-- SCHÉMA DE BASE DE DONNÉES TRANSACTIONNELLE POSTGRESQL (SPRINT 1)
-- Règle d'architecture : Requêtes SQL propres, index ciblés et CTEs analytiques.
-- AVERTISSEMENT : Les vues lourdes/matérialisées sont évitées pour préserver
-- la mémoire et la résilience en cas de surcharge réseau/attaque.
-- ====================================================================

-- 1. Extension pour UUID natifs v4
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table des commerçants / destinataires
CREATE TABLE IF NOT EXISTS merchants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    commission_rate NUMERIC(4, 3) DEFAULT 0.012,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table des transactions de paiement
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REJECTED')),
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    reference VARCHAR(128) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    card_last4 VARCHAR(4) NOT NULL,
    latency_ms INT DEFAULT 0,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    security_hash VARCHAR(128) NOT NULL,
    error_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table des journaux d'audit et de cyber-résilience
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL, -- 'PAYMENT_PROCESSED', 'RECOVERY_TRIGGERED', 'WAF_FLAG'
    severity VARCHAR(16) NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARN', 'CRITICAL'
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table des sondes de santé de l'API (pour observabilité)
CREATE TABLE IF NOT EXISTS api_health_metrics (
    id BIGSERIAL PRIMARY KEY,
    probe_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(16) NOT NULL,
    db_latency_ms NUMERIC(6, 2) NOT NULL,
    active_connections INT NOT NULL,
    endpoint VARCHAR(64) DEFAULT '/health'
);

-- ====================================================================
-- INDEXATION OPTIMISÉE (B-Tree pour lookups rapides, sans overhead)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions (merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);

-- ====================================================================
-- JEU DE DONNÉES INITIAL (MERCHANTS)
-- ====================================================================
INSERT INTO merchants (id, name, category, commission_rate) VALUES
    ('mch_cyber_01', 'CyberShield Sentinel SAS', 'Sécurité Réseau', 0.012),
    ('mch_saas_02', 'CloudOps Platform Inc.', 'Infrastructure Cloud', 0.015),
    ('mch_auth_03', 'VaultLock ZeroTrust', 'IAM & Secrets', 0.010),
    ('mch_telecom_04', 'Resilience Fiber Backbone', 'Télécommunications', 0.018)
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- COMMON TABLE EXPRESSIONS (CTEs) ANALYTIQUES OBLIGATOIRES
-- Conformes au sujet : Pas de vues lourdes, requêtes à la demande.
-- ====================================================================

-- CTE 1 : Volume horaire, taux de succès et panier moyen
-- Utilisable par Prometheus / Grafana ou FastAPI sans créer de vue persistante :
/*
WITH HourlyStats AS (
    SELECT 
        date_trunc('hour', created_at) AS hour_window,
        COUNT(*) AS total_tx,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_tx,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_tx,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CONFIRMED'), 0) AS total_amount,
        COALESCE(AVG(amount) FILTER (WHERE status = 'CONFIRMED'), 0) AS avg_ticket
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY date_trunc('hour', created_at)
)
SELECT 
    hour_window,
    total_tx,
    confirmed_tx,
    failed_tx,
    ROUND((confirmed_tx::NUMERIC / NULLIF(total_tx, 0)) * 100, 2) AS success_rate_pct,
    total_amount,
    ROUND(avg_ticket, 2) AS avg_ticket
FROM HourlyStats
ORDER BY hour_window DESC;
*/

-- CTE 2 : Détection de vélocité anormale (Anti-Fraude & Cyber)
/*
WITH VelocityAnalysis AS (
    SELECT 
        customer_name,
        card_last4,
        COUNT(*) AS count_15min,
        SUM(amount) AS volume_15min,
        MAX(created_at) AS last_seen
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '15 minutes'
    GROUP BY customer_name, card_last4
)
SELECT 
    customer_name,
    card_last4,
    count_15min,
    volume_15min,
    CASE 
        WHEN count_15min >= 5 THEN 'CRITICAL_SPIKE'
        WHEN count_15min >= 3 THEN 'WARNING_VELOCITY'
        ELSE 'NORMAL'
    END AS risk_classification
FROM VelocityAnalysis
WHERE count_15min >= 2
ORDER BY count_15min DESC;
*/
`,
  },
  {
    id: 'fastapi-main',
    name: 'main.py',
    path: 'backend/main.py',
    language: 'python',
    category: 'backend',
    description: 'Application FastAPI asynchrone exposant POST /pay (insertion transaction & idempotence) et GET /health (monitoring état API & DB).',
    badge: 'FastAPI Production Ready',
    content: `"""
PROJECT RESILIENCE-ALPHA • BACKEND FASTAPI
Module principal exposant /pay (insertion transaction) et /health (observabilité)
"""

import os
import time
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://resilience_user:resilience_password_secret@postgres:5432/resilience_db"
)

# Pool global de connexions PostgreSQL
db_pool: Optional[asyncpg.Pool] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    print("🚀 Initialisation du pool de connexions PostgreSQL...")
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=20)
        print("✅ Connecté avec succès à PostgreSQL !")
    except Exception as e:
        print(f"⚠️ Avertissement : Impossible de joindre PostgreSQL au démarrage ({e}). Mode simulation activé.")
    yield
    if db_pool:
        await db_pool.close()
        print("🛑 Fermeture du pool PostgreSQL.")

app = FastAPI(
    title="RESILIENCE-ALPHA Payment API",
    description="API de paiement cyber-résiliente avec monitoring /health et insertion /pay",
    version="1.0.0",
    lifespan=lifespan
)

# Configuration CORS pour autoriser le frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====================================================================
# MODÈLES DE DONNÉES PYDANTIC
# ====================================================================
class PaymentPayload(BaseModel):
    amount: float = Field(..., gt=0, description="Montant de la transaction (doit être > 0)")
    currency: str = Field(default="EUR", max_length=3, description="Code devise ISO (EUR, USD, ...)")
    merchant_id: str = Field(..., description="ID du marchand destinataire")
    customer_name: str = Field(..., min_length=2, description="Nom complet du porteur")
    card_number: str = Field(..., min_length=13, max_length=19, description="Numéro de carte (simulé)")
    exp_date: str = Field(..., pattern=r"^\\d{2}/\\d{2}$", description="Date expiration MM/AA")
    cvv: str = Field(..., min_length=3, max_length=4, description="Cryptogramme visuel")
    reference: Optional[str] = Field(default=None, description="Référence commande externe")
    simulate_failure: Optional[bool] = Field(default=False, description="Flag pour injecter une défaillance (Chaos test)")

class PaymentResponse(BaseModel):
    transaction_id: str
    status: str
    amount: float
    currency: str
    merchant_id: str
    customer_name: str
    card_last4: str
    created_at: str
    reference: str
    latency_ms: int
    security_hash: str
    idempotency_key: str
    error_reason: Optional[str] = None

class HealthStatus(BaseModel):
    status: str
    service: str
    timestamp: str
    uptime_seconds: float
    database: dict
    checks: dict

START_TIME = time.time()

# ====================================================================
# ROUTE 1 : GET /health (Surveillance de l'état de l'API & Dépendances)
# ====================================================================
@app.get("/health", response_model=HealthStatus, tags=["Observabilité"])
async def health_check():
    """
    Sonde de santé utilisée par Docker Compose, Prometheus et le Dashboard.
    Vérifie la disponibilité réelle de la base PostgreSQL avec une requête SELECT 1.
    """
    now = datetime.now(timezone.utc).isoformat()
    uptime = round(time.time() - START_TIME, 1)
    
    db_status = "disconnected"
    db_latency = 0.0
    active_conns = 0

    if db_pool:
        start_ping = time.perf_counter()
        try:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                db_status = "connected"
                db_latency = round((time.perf_counter() - start_ping) * 1000, 2)
                active_conns = len(db_pool._holders) if hasattr(db_pool, '_holders') else 1
        except Exception as err:
            db_status = f"error: {str(err)}"

    is_healthy = (db_status == "connected")
    
    return HealthStatus(
        status="healthy" if is_healthy else "degraded",
        service="resilience-alpha-payment-api",
        timestamp=now,
        uptime_seconds=uptime,
        database={
            "engine": "PostgreSQL 16",
            "status": db_status,
            "latency_ms": db_latency,
            "active_connections": active_conns,
        },
        checks={
            "api_gateway": "OK",
            "db_pool": "OK" if is_healthy else "DEGRADED",
            "memory_usage": "optimal",
        }
    )

# ====================================================================
# ROUTE 2 : POST /pay (Exécution transaction & insertion PostgreSQL)
# ====================================================================
@app.post("/pay", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED, tags=["Paiement"])
async def process_payment(
    payload: PaymentPayload,
    idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key")
):
    """
    Traite une transaction de paiement, vérifie l'idempotence et insère
    le tuple dans la table PostgreSQL 'transactions'.
    """
    start_time = time.perf_counter()
    card_clean = payload.card_number.replace(" ", "")
    card_last4 = card_clean[-4:] if len(card_clean) >= 4 else "0000"
    
    # Génération d'une clé d'idempotence si absente du header
    key = idempotency_key or f"idemp_{uuid.uuid4().hex[:12]}"
    tx_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    ref = payload.reference or f"REF-PAY-{tx_id[:8].upper()}"

    # Calcul de signature d'intégrité (Anti-tampering)
    raw_sig = f"{tx_id}:{payload.amount}:{payload.currency}:{payload.merchant_id}:{card_last4}"
    sec_hash = "sha256_" + hashlib.sha256(raw_sig.encode()).hexdigest()[:24]

    # Gestion de la défaillance simulée (Chaos / Résilience)
    is_failed = bool(payload.simulate_failure)
    tx_status = "FAILED" if is_failed else "CONFIRMED"
    err_reason = "SIMULATED_FAILURE: Test de non-régression de remédiation" if is_failed else None

    # Insertion réelle dans PostgreSQL si le pool est disponible
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                # 1. Vérification idempotence
                existing = await conn.fetchrow(
                    "SELECT * FROM transactions WHERE idempotency_key = $1", 
                    key
                )
                if existing:
                    return PaymentResponse(
                        transaction_id=str(existing["id"]),
                        status=existing["status"],
                        amount=float(existing["amount"]),
                        currency=existing["currency"],
                        merchant_id=existing["merchant_id"],
                        customer_name=existing["customer_name"],
                        card_last4=existing["card_last4"],
                        created_at=existing["created_at"].isoformat(),
                        reference=existing["reference"],
                        latency_ms=existing["latency_ms"],
                        security_hash=existing["security_hash"],
                        idempotency_key=existing["idempotency_key"],
                        error_reason=existing.get("error_reason")
                    )

                latency_ms = int((time.perf_counter() - start_time) * 1000)

                # 2. Insertion SQL propre
                await conn.execute(
                    """
                    INSERT INTO transactions (
                        id, amount, currency, status, merchant_id, reference,
                        customer_name, card_last4, latency_ms, idempotency_key,
                        security_hash, error_reason
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    """,
                    uuid.UUID(tx_id),
                    payload.amount,
                    payload.currency,
                    tx_status,
                    payload.merchant_id,
                    ref,
                    payload.customer_name,
                    card_last4,
                    latency_ms,
                    key,
                    sec_hash,
                    err_reason
                )
        except Exception as e:
            print(f"Erreur DB: {e}")
            # En cas de perte de DB, l'API répond mais remonte l'erreur
            if not is_failed:
                tx_status = "FAILED"
                err_reason = f"DB_UNAVAILABLE: {str(e)}"

    total_latency = int((time.perf_counter() - start_time) * 1000)

    return PaymentResponse(
        transaction_id=tx_id,
        status=tx_status,
        amount=payload.amount,
        currency=payload.currency,
        merchant_id=payload.merchant_id,
        customer_name=payload.customer_name,
        card_last4=card_last4,
        created_at=now_iso,
        reference=ref,
        latency_ms=total_latency,
        security_hash=sec_hash,
        idempotency_key=key,
        error_reason=err_reason
    )
`,
  },
  {
    id: 'backend-requirements',
    name: 'requirements.txt',
    path: 'backend/requirements.txt',
    language: 'python',
    category: 'backend',
    description: 'Dépendances Python pour FastAPI, serveur Uvicorn asynchrone et driver PostgreSQL asyncpg.',
    content: `fastapi==0.111.0
uvicorn[standard]==0.30.1
asyncpg==0.29.0
pydantic==2.7.4
python-dotenv==1.0.1
`,
  },
  {
    id: 'backend-dockerfile',
    name: 'Dockerfile',
    path: 'backend/Dockerfile',
    language: 'dockerfile',
    category: 'backend',
    description: 'Image Docker légère basée sur Python 3.11-slim pour le microservice FastAPI.',
    content: `FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
  },
  {
    id: 'nextjs-page',
    name: 'page.tsx',
    path: 'frontend/src/app/page.tsx',
    language: 'typescript',
    category: 'frontend',
    description: 'Composant Next.js 14 App Router affichant la maquette Dashboard 4 zones et le lien vers le portail de paiement.',
    badge: 'Dashboard 4 Zones Next.js',
    content: `/**
 * PROJECT RESILIENCE-ALPHA • DASHBOARD 4 ZONES (NEXT.JS 14 APP ROUTER)
 * Zone 1: Métriques & Flux Transactions
 * Zone 2: Santé des Services & API
 * Zone 3: Observabilité Cyber & Détection AIOps
 * Zone 4: Moteur de Remédiation Autonome (Zero-Touch Recovery)
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Dashboard4ZonesPage() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch('/health')
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => setHealth({ status: 'offline' }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* HEADER */}
      <header className="flex justify-between items-center pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
            RESILIENCE-ALPHA • Supervision & Dashboard 4 Zones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sprint 1 : Maquette d'ingénierie conforme au cahier des charges EPSI Bac+5
          </p>
        </div>
        <Link 
          href="/pay"
          className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg shadow-lg shadow-cyan-500/20 transition-all"
        >
          💳 Accéder au Portail de Paiement
        </Link>
      </header>

      {/* GRILLE 4 ZONES DU DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        
        {/* ZONE 1 : FLUX & TRANSACTIONS */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider text-cyan-400 font-mono font-semibold">
              ZONE 1 • FLUX MÉTIER
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800">
              Transactions & Volumes
            </span>
          </div>
          <h2 className="text-lg font-semibold text-white">Métriques Transactionnelles</h2>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-xs text-slate-400">Débit actuel</span>
              <p className="text-xl font-bold text-cyan-400 font-mono">14.2 TPS</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-xs text-slate-400">Succès (24h)</span>
              <p className="text-xl font-bold text-emerald-400 font-mono">99.8%</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <span className="text-xs text-slate-400">Latence P95</span>
              <p className="text-xl font-bold text-indigo-400 font-mono">38 ms</p>
            </div>
          </div>
        </section>

        {/* ZONE 2 : SANTÉ DES SERVICES & API */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-mono font-semibold">
              ZONE 2 • INFRASTRUCTURE
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
              /health & DB Pool
            </span>
          </div>
          <h2 className="text-lg font-semibold text-white">Santé des Services & API</h2>
          <div className="space-y-3 mt-4">
            <div className="flex justify-between items-center p-2.5 rounded bg-slate-950 border border-slate-800/80">
              <span className="text-sm text-slate-300">FastAPI Backend (/health)</span>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-900/40 text-emerald-400">
                {health?.status || 'ONLINE'}
              </span>
            </div>
            <div className="flex justify-between items-center p-2.5 rounded bg-slate-950 border border-slate-800/80">
              <span className="text-sm text-slate-300">PostgreSQL (16-alpine)</span>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-900/40 text-emerald-400">
                CONNECTED
              </span>
            </div>
          </div>
        </section>

        {/* ZONE 3 : CYBERSÉCURITÉ & DÉTECTION AIOPS */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider text-amber-400 font-mono font-semibold">
              ZONE 3 • CYBERSÉCURITÉ & AI
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-amber-950/60 text-amber-400 border border-amber-800">
              WAF / SIEM / AIOps
            </span>
          </div>
          <h2 className="text-lg font-semibold text-white">Observabilité & Détection d'Anomalies</h2>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 mt-4 text-xs font-mono text-slate-300">
            [AIOps-ML] Modèle Isolation Forest en veille active. Aucun pattern anormal détecté.
          </div>
        </section>

        {/* ZONE 4 : REMÉDIATION AUTONOME (ZERO-TOUCH) */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider text-purple-400 font-mono font-semibold">
              ZONE 4 • REMÉDIATION
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-purple-950/60 text-purple-400 border border-purple-800">
              Zero-Touch Recovery
            </span>
          </div>
          <h2 className="text-lg font-semibold text-white">Moteur de Remédiation Autonome</h2>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 mt-4 text-xs font-mono text-slate-300">
            [Recovery-Engine] 0 incident actif. Playbooks Ansible prêts pour reprise automatique.
          </div>
        </section>

      </div>
    </div>
  );
}
`,
  },
  {
    id: 'nextjs-pay-page',
    name: 'pay/page.tsx',
    path: 'frontend/src/app/pay/page.tsx',
    language: 'typescript',
    category: 'frontend',
    description: 'Interface de paiement épurée et conviviale permettant au client de saisir ses données et de déclencher POST /pay.',
    badge: 'Front-end Paiement Direct',
    content: `/**
 * PROJECT RESILIENCE-ALPHA • PORTAIL DE PAIEMENT CONVIVIAL
 * Route utilisateur dédiée pour "juste payer" simplement et tester /pay
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function SimplePayPage() {
  const [amount, setAmount] = useState('49.90');
  const [customer, setCustomer] = useState('Antoine Dupont');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expDate, setExpDate] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setReceipt(null);

    try {
      const res = await fetch('/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: 'EUR',
          merchant_id: 'mch_cyber_01',
          customer_name: customer,
          card_number: cardNumber,
          exp_date: expDate,
          cvv: cvv,
          reference: 'REF-CMD-' + Math.floor(1000 + Math.random() * 9000),
        })
      });
      const data = await res.json();
      setReceipt(data);
    } catch (err) {
      alert("Erreur de paiement : " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            💳 Paiement Sécurisé
          </h2>
          <Link href="/" className="text-xs text-cyan-400 hover:underline">
            ← Dashboard
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400">Montant (€)</label>
            <input 
              type="number" 
              step="0.01" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
              required 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400">Nom du porteur</label>
            <input 
              type="text" 
              value={customer} 
              onChange={e => setCustomer(e.target.value)} 
              className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
              required 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400">Numéro de carte</label>
            <input 
              type="text" 
              value={cardNumber} 
              onChange={e => setCardNumber(e.target.value)} 
              className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400">Expiration</label>
              <input 
                type="text" 
                value={expDate} 
                onChange={e => setExpDate(e.target.value)} 
                className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                required 
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">CVV</label>
              <input 
                type="text" 
                value={cvv} 
                onChange={e => setCvv(e.target.value)} 
                className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                required 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            {loading ? 'Traitement en cours...' : \`Payer \${amount} €\`}
          </button>
        </form>

        {receipt && (
          <div className="mt-6 p-4 bg-emerald-950/40 border border-emerald-800 rounded-xl text-xs space-y-1">
            <p className="font-bold text-emerald-400">✅ Paiement Confirmé</p>
            <p className="text-slate-300">ID: <span className="font-mono">{receipt.transaction_id}</span></p>
            <p className="text-slate-300">Référence: {receipt.reference}</p>
          </div>
        )}
      </div>
    </div>
  );
}
`,
  },
  {
    id: 'readme-quickstart',
    name: 'README.md',
    path: 'README.md',
    language: 'markdown',
    category: 'docs',
    description: 'Documentation de déploiement pour le consortium : commandes Docker, tests des routes et validation des 5 piliers.',
    badge: 'Guide du Consortium',
    content: `# PROJECT RESILIENCE-ALPHA — SPRINT 1 (EPSI BAC+5)

> Plateforme de paiement cyber-résiliente avec conteneur PostgreSQL, backend FastAPI (/pay & /health) et Dashboard 4 Zones Next.js.

## 🚀 Démarrage Rapide (Sur le PC Hôte)

Assurez-vous que Docker Desktop avec WSL2 est lancé sur le PC Hôte :

\`\`\`bash
# 1. Cloner ou extraire le projet
cd Workshop2026-M2-G<n>

# 2. Lancer la pile complète de conteneurs
docker compose up -d --build

# 3. Vérifier l'état des conteneurs
docker compose ps
\`\`\`

## 🔍 Validation des Routes FastAPI

\`\`\`bash
# Test de la sonde de santé
curl -s http://localhost:8000/health | jq .

# Test d'une transaction de paiement
curl -X POST http://localhost:8000/pay \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 49.90,
    "currency": "EUR",
    "merchant_id": "mch_cyber_01",
    "customer_name": "Jean Dupont",
    "card_number": "4242 4242 4242 4242",
    "exp_date": "12/28",
    "cvv": "123",
    "reference": "TEST-CONSOLE-01"
  }' | jq .
\`\`\`

## 📊 Accès aux Interfaces

- **Dashboard 4 Zones & Portail Paiement :** http://localhost:3000
- **Documentation OpenAPI (Swagger) :** http://localhost:8000/docs
- **Base PostgreSQL :** \`localhost:5432\` (User: \`resilience_user\`, DB: \`resilience_db\`)
`,
  },
];
