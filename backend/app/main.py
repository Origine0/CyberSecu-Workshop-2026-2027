import time
import uuid
import logging
import traceback
from datetime import datetime, timezone
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request, Response, status, Query, HTTPException, Header
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.database import get_db, check_database_health
from app.schemas import PaymentRequest, PaymentResponse, HealthResponse
from app.services import process_payment
from app.models import Transaction
from app.auth import get_claims

# Logger dédié à la sécurité et à la traçabilité des incidents (SOC / SIEM)
security_logger = logging.getLogger("security.audit")

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

from app.waf import WAFMiddleware, waf_state

# Configuration CORS pour autoriser le Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En lab/démonstration, autorise le frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Activation du Pare-Feu Applicatif (WAF) & Rate Limiting
app.add_middleware(WAFMiddleware)

# Instrumentation Prometheus pour l'Axe 2 (Observabilité Prometheus/Grafana)
instrumentator = Instrumentator().instrument(app)


# ==============================================================================
# GESTIONNAIRES D'EXCEPTIONS SÉCURISÉS (ANTI-FUITE D'INFORMATIONS / CWE-209)
# ==============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Gestionnaire global d'exceptions non gérées (Fail-Safe) :
    - Enregistre la stack trace complète dans les logs sécurisés du serveur (Loki/Grafana)
    - Masque TOUTE information système/chemin de fichier vis-à-vis du client externe
    - Génère un incident_id unique pour corrélation SOC / SIEM
    """
    incident_id = f"SEC-ERR-{uuid.uuid4().hex[:8].upper()}"
    client_ip = request.client.host if request.client else "unknown"
    
    security_logger.error(
        f"[INCIDENT {incident_id}] Erreur non gérée sur {request.method} {request.url.path} "
        f"depuis IP {client_ip}: {str(exc)}\n{traceback.format_exc()}"
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "Une défaillance interne est survenue. L'incident a été consigné pour analyse SOC.",
            "incident_id": incident_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Gestionnaire des erreurs de validation Pydantic (HTTP 422) :
    - Trace les payloads suspects ou malformés injectés (ex: fuzzing Red Team)
    - Renvoie une réponse standardisée sans révéler d'arborescence interne
    """
    client_ip = request.client.host if request.client else "unknown"
    security_logger.warning(
        f"[SECURITY-AUDIT] Payload invalide rejeté (HTTP 422) sur {request.url.path} "
        f"depuis IP {client_ip} : {len(exc.errors())} violation(s) de schéma."
    )
    
    cleaned_errors = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", []) if x != "body"]
        cleaned_errors.append({
            "field": ".".join(loc) if loc else "root",
            "reason": err.get("msg", "Format invalide"),
            "type": err.get("type", "value_error")
        })
        
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "VALIDATION_FAILED",
            "message": "Le format de la requête enfreint les règles de sécurité et de conformité métier.",
            "violations": cleaned_errors,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Gestionnaire standardisé des exceptions HTTP métier."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": f"HTTP_{exc.status_code}",
            "message": exc.detail,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


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
        user_agent=user_agent,
        claims=get_claims(req)
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
    now = datetime.now(timezone.utc)

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
            "error_message": tx.error_message,
            "ip_address": tx.ip_address,
            "idempotency_key": tx.idempotency_key,
            "metadata": tx.metadata_ or {},
            "created_at": tx.created_at.isoformat() if tx.created_at else None
        }
        for tx in txs
    ]


# ==============================================================================
# ROUTES PARE-FEU APPLICATIF (WAF) & REMÉDIATION AUTONOME (AXE 1 & AXE 4)
# ==============================================================================

@app.get(
    "/waf/status",
    summary="Consulter l'état du WAF et les métriques de blocage",
    tags=["WAF & Remediation"]
)
async def get_waf_status():
    """Fournit les statistiques de menaces bloquées, les IP bannies, l'historique Ansible et les séries Prometheus/Grafana."""
    import asyncio
    import json as _json
    import urllib.parse as _uparse
    import urllib.request as _ureq

    def _fetch_remediation():
        try:
            with _ureq.urlopen("http://remediation:8020/health", timeout=0.8) as rh:
                h = _json.loads(rh.read())
            with _ureq.urlopen("http://remediation:8020/status", timeout=0.8) as rs:
                s = _json.loads(rs.read())
            return {
                "status": h.get("status", "UP"),
                "queue": h.get("queue", 0),
                "recent_actions": list(reversed(s.get("recent_actions", []))),
            }
        except Exception:
            return {"status": "OFFLINE", "queue": 0, "recent_actions": []}

    def _prom_instant(expr: str):
        q = _uparse.urlencode({"query": expr})
        with _ureq.urlopen(f"http://prometheus:9090/api/v1/query?{q}", timeout=0.6) as resp:
            return _json.loads(resp.read()).get("data", {}).get("result", [])

    def _prom_range(expr: str, minutes: int = 10, step: int = 15):
        end_ts = int(time.time())
        start_ts = end_ts - (minutes * 60)
        q = _uparse.urlencode({"query": expr, "start": start_ts, "end": end_ts, "step": step})
        with _ureq.urlopen(f"http://prometheus:9090/api/v1/query_range?{q}", timeout=0.7) as resp:
            return _json.loads(resp.read()).get("data", {}).get("result", [])

    def _fetch_grafana_metrics():
        try:
            # 1. Séries temporelles des panneaux Grafana (resilience-infra.json)
            score_res = _prom_range("ml_anomaly_score", minutes=10, step=15)
            anomaly_score_series = [
                {"ts": int(float(pt[0]) * 1000), "value": round(float(pt[1]), 4)}
                for pt in (score_res[0].get("values", []) if score_res else [])
            ]

            feat_res = _prom_range("ml_feature", minutes=10, step=15)
            features_series = {}
            for stream in feat_res:
                fname = stream.get("metric", {}).get("name", "unknown")
                features_series[fname] = [
                    {"ts": int(float(pt[0]) * 1000), "value": round(float(pt[1]), 3)}
                    for pt in stream.get("values", [])
                ]

            http_res = _prom_range('sum by (status) (rate(http_requests_total{handler!="/metrics"}[1m]))', minutes=10, step=15)
            http_status_series = {}
            for stream in http_res:
                code = stream.get("metric", {}).get("status", "2xx")
                http_status_series[code] = [
                    {"ts": int(float(pt[0]) * 1000), "value": round(float(pt[1]), 3)}
                    for pt in stream.get("values", [])
                ]

            # 2. KPIs instantanés & Santé conteneurs (Panneaux #18, #19, #20, #21, #4, #13, #14, #15)
            ml_anom_res = _prom_instant("max(ml_anomaly)")
            ml_anomaly = int(float(ml_anom_res[0]["value"][1])) if ml_anom_res else 0

            alerts_res = _prom_instant("round(sum(increase(ml_alerts_sent_total[1h]))) or vector(0)")
            ml_alerts_1h = int(float(alerts_res[0]["value"][1])) if alerts_res else 0

            remed_ok_res = _prom_instant('round(sum(increase(remediation_actions_total{result="success"}[1h]))) or vector(0)')
            remediation_ok_1h = int(float(remed_ok_res[0]["value"][1])) if remed_ok_res else 0

            remed_ko_res = _prom_instant('round(sum(increase(remediation_actions_total{result="failure"}[1h]))) or vector(0)')
            remediation_ko_1h = int(float(remed_ko_res[0]["value"][1])) if remed_ko_res else 0

            up_res = _prom_instant("sum(up) / count(up)")
            targets_up_ratio = round(float(up_res[0]["value"][1]) * 100, 1) if up_res else 100.0

            containers = {}
            for item in _prom_instant("max by (service) (docker_container_healthy)"):
                svc = item.get("metric", {}).get("service")
                if svc:
                    containers.setdefault(svc, {})["healthy"] = int(float(item["value"][1])) == 1

            for item in _prom_instant("sum by (service) (rate(docker_container_cpu_usage_seconds_total[1m]))"):
                svc = item.get("metric", {}).get("service")
                if svc:
                    containers.setdefault(svc, {})["cpu_pct"] = round(float(item["value"][1]) * 100, 2)

            for item in _prom_instant("sum by (service) (docker_container_memory_usage_bytes)"):
                svc = item.get("metric", {}).get("service")
                if svc:
                    containers.setdefault(svc, {})["mem_mb"] = round(float(item["value"][1]) / (1024 * 1024), 1)

            return {
                "online": True,
                "ml_anomaly": ml_anomaly == 1,
                "ml_alerts_1h": ml_alerts_1h,
                "remediation_ok_1h": remediation_ok_1h,
                "remediation_ko_1h": remediation_ko_1h,
                "targets_up_ratio": targets_up_ratio,
                "anomaly_score_series": anomaly_score_series[-30:],
                "features_series": {k: v[-30:] for k, v in features_series.items()},
                "http_status_series": {k: v[-30:] for k, v in http_status_series.items()},
                "containers": containers,
            }
        except Exception:
            return None

    remediation_info, grafana_info = await asyncio.gather(
        asyncio.to_thread(_fetch_remediation),
        asyncio.to_thread(_fetch_grafana_metrics),
    )
    return {
        "banned_ips": list(waf_state.banned_ips.keys()),
        "stats": waf_state.stats,
        "remediation": remediation_info,
        "grafana": grafana_info,
    }


async def verify_remediation_token(
    x_remediation_token: Optional[str] = Header(None, alias="X-Remediation-Token"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Contrôle d'accès strict (Cyber-Résilience) : Seul le moteur de remédiation ou un admin autorisé
    peut modifier dynamiquement la liste de blocage du WAF."""
    expected_token = settings.REMEDIATION_TOKEN
    provided_token = x_remediation_token
    if not provided_token and authorization:
        if authorization.startswith("Bearer "):
            provided_token = authorization.split("Bearer ", 1)[1].strip()
        else:
            provided_token = authorization.strip()

    if not provided_token or provided_token != expected_token:
        security_logger.warning("Tentative non autorisée de modification de la liste de blocage WAF")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Accès refusé : Token de remédiation invalide ou absent (en-tête X-Remediation-Token requis)"
        )
    return provided_token


@app.post(
    "/waf/block",
    summary="Bannir une adresse IP malveillante (Trigger Remédiation)",
    tags=["WAF & Remediation"],
    dependencies=[Depends(verify_remediation_token)]
)
async def block_ip(
    ip: str = Query(..., description="Adresse IP hostile à neutraliser"),
    duration: int = Query(default=60, description="Durée du bannissement en secondes")
):
    """Point d'entrée de remédiation autonome (Axe 1) : neutralise une IP attaquante."""
    waf_state.ban_ip(ip, duration_seconds=duration, reason="AUTONOMOUS_REMEDIATION")
    return {
        "status": "SUCCESS",
        "action": "IP_BANNED",
        "ip": ip,
        "duration_seconds": duration
    }


@app.post(
    "/waf/unblock",
    summary="Réhabiliter une adresse IP",
    tags=["WAF & Remediation"],
    dependencies=[Depends(verify_remediation_token)]
)
async def unblock_ip(
    ip: str = Query(..., description="Adresse IP à réhabiliter")
):
    """Lève le bannissement d'une adresse IP."""
    waf_state.unban_ip(ip)
    return {
        "status": "SUCCESS",
        "action": "IP_UNBANNED",
        "ip": ip
    }

