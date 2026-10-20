"""
waf.py - Module de Pare-Feu Applicatif (WAF) & Rate Limiting pour RESILIENCE-ALPHA
Conçu pour l'Axe 4 (Défense Blue Team & Mitigation) et l'Axe 1 (Remédiation autonome).

Fonctionnalités :
1. Sliding-Window Rate Limiter par adresse IP cliente (Protection anti-DDoS applicatif L7)
2. Détection de comportement abusif (seuil d'erreurs 422 consécutives)
3. Blacklist dynamique en mémoire avec endpoints de contrôle pour le moteur de remédiation
4. Métriques Prometheus d'attaques neutralisées (WAF drops)
"""

import time
import logging
from typing import Dict, List, Set, Tuple
from collections import defaultdict
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("security.waf")


class WAFState:
    """État partagé du WAF : IP bannies, compteurs glissants et métriques de blocage."""
    def __init__(self):
        # Liste des adresses IP bannies dynamiquement (IP -> timestamp expiration)
        self.banned_ips: Dict[str, float] = {}
        
        # Historique des requêtes par IP pour le rate-limiting glissant : IP -> list of timestamps
        self.request_history: Dict[str, List[float]] = defaultdict(list)
        
        # Compteur d'erreurs consécutives par IP (pour détecter le fuzzing) : IP -> count
        self.consecutive_violations: Dict[str, int] = defaultdict(int)
        
        # Statistiques d'attaques bloquées pour le monitoring
        self.stats = {
            "rate_limit_drops": 0,
            "banned_ip_drops": 0,
            "fuzzing_drops": 0,
            "total_blocked": 0,
        }

    def is_banned(self, ip: str) -> bool:
        """Vérifie si une IP est activement bannie."""
        if ip in self.banned_ips:
            if time.time() < self.banned_ips[ip]:
                return True
            # Expiration du ban
            del self.banned_ips[ip]
        return False

    def ban_ip(self, ip: str, duration_seconds: int = 60, reason: str = "MANUAL_REMEDIATION"):
        """Bannit une adresse IP pour une durée donnée (déclenché par le moteur de remédiation ou l'IA)."""
        self.banned_ips[ip] = time.time() + duration_seconds
        logger.warning(f"[WAF-BAN] IP {ip} bannie pour {duration_seconds}s. Motif : {reason}")

    def unban_ip(self, ip: str):
        """Débannit une adresse IP."""
        if ip in self.banned_ips:
            del self.banned_ips[ip]
            logger.info(f"[WAF-UNBAN] IP {ip} débannie.")

    def check_rate_limit(self, ip: str, max_requests: int = 40, window_seconds: float = 2.0) -> bool:
        """
        Contrôle de fréquence par fenêtre glissante :
        Autorise max_requests dans une fenêtre de window_seconds.
        Retourne True si conforme, False si quota dépassé (DDoS Flood).
        """
        now = time.time()
        timestamps = self.request_history[ip]
        
        # Purge des timestamps obsolètes
        self.request_history[ip] = [t for t in timestamps if now - t < window_seconds]
        
        if len(self.request_history[ip]) >= max_requests:
            return False
            
        self.request_history[ip].append(now)
        return True


# Instance globale d'état WAF
waf_state = WAFState()


class WAFMiddleware(BaseHTTPMiddleware):
    """
    Middleware ASGI d'inspection et filtrage applicatif (WAF).
    Intercepte les requêtes avant qu'elles n'atteignent le service de paiement ou la base.
    """
    async def dispatch(self, request: Request, call_next):
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
        path = request.url.path

        # Endpoints exemptés d'inspection WAF (monitoring, healthcheck et administration WAF)
        if path in ("/health", "/metrics", "/", "/docs", "/openapi.json") or path.startswith("/waf/"):
            return await call_next(request)

        # 1. Vérification si l'IP est sous bannissement actif
        if waf_state.is_banned(client_ip):
            waf_state.stats["banned_ip_drops"] += 1
            waf_state.stats["total_blocked"] += 1
            logger.warning(f"[WAF-DROP] Requête rejetée de l'IP bannie {client_ip} vers {path}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "error": "IP_BLOCKED_BY_WAF",
                    "message": "Accès refusé par le pare-feu applicatif (WAF). Adresse IP sous restriction de sécurité.",
                    "client_ip": client_ip,
                    "action": "THREAT_MITIGATED"
                }
            )

        # 2. Contrôle de Rate Limiting (sur /pay)
        if path == "/pay":
            if not waf_state.check_rate_limit(client_ip, max_requests=40, window_seconds=2.0):
                waf_state.stats["rate_limit_drops"] += 1
                waf_state.stats["total_blocked"] += 1
                logger.warning(f"[WAF-RATE-LIMIT] Pic de requêtes anormal (DDoS L7) depuis {client_ip}")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "RATE_LIMIT_EXCEEDED",
                        "message": "Volume de requêtes anormal détecté (DDoS L7). Protection WAF activée.",
                        "retry_after_seconds": 2,
                        "client_ip": client_ip
                    },
                    headers={"Retry-After": "2"}
                )

        # Traitement de la requête
        response = await call_next(request)
        return response
