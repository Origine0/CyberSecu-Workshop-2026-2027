"""Vérification des jetons JWT émis par le service auth (secret partagé)."""
from typing import Optional

import jwt
from fastapi import HTTPException, Request, status

from app.config import settings


def get_claims(req: Request) -> Optional[dict]:
    """Renvoie les claims du jeton Bearer, None si absent (paiement anonyme).

    Un jeton présent mais invalide est toujours refusé (401). Si REQUIRE_AUTH est
    actif, l'absence de jeton est aussi refusée.
    """
    header = req.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        if settings.REQUIRE_AUTH:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
        return None
    if not settings.JWT_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification indisponible")
    try:
        return jwt.decode(header[7:], settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré")
