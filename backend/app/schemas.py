from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class PaymentRequest(BaseModel):
    merchant_code: str = Field(default="MERCH_ALPHA", description="Identifiant marchand partenaire")
    account_number: Optional[str] = Field(default=None, description="Compte émetteur (facultatif si paiement direct carte fictive)")
    amount: float = Field(..., gt=0, description="Montant de la transaction (positif)")
    currency: str = Field(default="EUR", max_length=3, description="Devise ISO-4217")
    idempotency_key: Optional[str] = Field(default=None, description="Clé d'idempotence pour éviter les doubles débits")
    card_mock_number: Optional[str] = Field(default="4111111111111111", description="Numéro de carte de test fictif")
    simulate_failure: Optional[bool] = Field(default=False, description="Flag de simulation de panne pour démonstration chaos")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Métadonnées libres")


class PaymentResponse(BaseModel):
    transaction_id: str
    reference: str
    status: str
    amount: float
    currency: str
    authorization_code: Optional[str] = None
    created_at: datetime
    latency_ms: int
    error_code: Optional[str] = None
    message: str
    balance_after: Optional[float] = None  # solde du compte authentifié après opération


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    version: str
    uptime_seconds: float
    timestamp: datetime
