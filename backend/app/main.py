import time
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request, Response, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.database import get_db, check_database_health
from app.schemas import PaymentRequest, PaymentResponse, HealthResponse
from app.services import process_payment
from app.models import Transaction

# Suivi du temps de démarrage pour l'uptime de supervision
START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrage de l'exposition des métriques Prometheus
    instrumentator.expose(app, endpoint="/metrics")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Microservice de paiement résilient pour le projet RESILIENCE-ALPHA (EPSI Workshop Bac+5)",
    lifespan=lifespan
)

# Configuration CORS pour autoriser le Dashboard Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En lab/démonstration, autorise le frontend Next.js
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instrumentation Prometheus pour l'Axe 2 (Observabilité Prometheus/Grafana)
instrumentator = Instrumentator().instrument(app)


@app.get("/", tags=["System"])
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "endpoints": {
            "pay": "POST /pay",
            "health": "GET /health",
            "transactions": "GET /transactions",
            "metrics": "GET /metrics"
        }
    }


@app.post(
    "/pay",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initier et insérer une transaction de paiement",
    tags=["Payment Core"]
)
async def create_payment(
    request: PaymentRequest,
    req: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Route principale du service de paiement :
    - Valide la requête et contrôle l'idempotence
    - Simule l'autorisation bancaire sécurisée
    - Insère la transaction en base PostgreSQL
    - Enregistre la trace d'audit
    """
    client_ip = req.client.host if req.client else "127.0.0.1"
    user_agent = req.headers.get("user-agent", "Unknown")
    
    response = await process_payment(
        db=db,
        request=request,
        client_ip=client_ip,
        user_agent=user_agent
    )
    return response


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Surveiller l'état de l'API et de la base de données",
    tags=["System"]
)
async def health_check(response: Response):
    """
    Route de supervision et observabilité :
    - Teste activement la connectivité à PostgreSQL
    - Calcule l'uptime du microservice
    - Renvoie HTTP 200 si nominal, HTTP 503 en cas de rupture de dépendance
    """
    is_db_healthy = await check_database_health()
    uptime = round(time.time() - START_TIME, 2)
    now = datetime.utcnow()

    if not is_db_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            status="DOWN",
            service="payment-api",
            database="unreachable",
            version=settings.VERSION,
            uptime_seconds=uptime,
            timestamp=now
        )

    return HealthResponse(
        status="UP",
        service="payment-api",
        database="healthy",
        version=settings.VERSION,
        uptime_seconds=uptime,
        timestamp=now
    )


@app.get(
    "/transactions",
    summary="Lister les transactions récentes pour le flux en direct du Dashboard",
    tags=["Monitoring"]
)
async def list_recent_transactions(
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Fournit les dernières transactions au Dashboard de supervision (Zone 2).
    """
    stmt = (
        select(Transaction)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    txs = result.scalars().all()
    
    return [
        {
            "id": str(tx.id),
            "reference": tx.reference,
            "amount": float(tx.amount),
            "currency": tx.currency,
            "status": tx.status,
            "latency_ms": tx.latency_ms,
            "error_code": tx.error_code,
            "created_at": tx.created_at.isoformat() if tx.created_at else None
        }
        for tx in txs
    ]
