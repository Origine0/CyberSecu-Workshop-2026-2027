import time
import uuid
import random
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models import Merchant, Account, Transaction, ServiceAuditLog
from app.schemas import PaymentRequest, PaymentResponse
from app.config import settings
import logging

logger = logging.getLogger("uvicorn.error")


async def process_payment(
    db: AsyncSession,
    request: PaymentRequest,
    client_ip: str = "127.0.0.1",
    user_agent: str = "MockPaymentClient/1.0"
) -> PaymentResponse:
    start_time = time.perf_counter()
    
    # 1. Vérification d'idempotence (si clé fournie)
    if request.idempotency_key:
        stmt = select(Transaction).where(Transaction.idempotency_key == request.idempotency_key)
        existing_tx = (await db.execute(stmt)).scalar_one_or_none()
        if existing_tx:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            return PaymentResponse(
                transaction_id=str(existing_tx.id),
                reference=existing_tx.reference,
                status=existing_tx.status,
                amount=float(existing_tx.amount),
                currency=existing_tx.currency,
                authorization_code=f"AUTH-{str(existing_tx.id)[:8].upper()}",
                created_at=existing_tx.created_at,
                latency_ms=elapsed_ms,
                error_code=existing_tx.error_code,
                message="Transaction existante retournée (idempotence garantie)"
            )

    # 2. Résolution du commerçant partenaire
    stmt_merchant = select(Merchant).where(Merchant.merchant_code == request.merchant_code)
    merchant = (await db.execute(stmt_merchant)).scalar_one_or_none()
    
    if not merchant:
        # Fallback pour résilience en démo : récupérer le premier marchand actif
        stmt_first = select(Merchant).where(Merchant.status == 'ACTIVE').limit(1)
        merchant = (await db.execute(stmt_first)).scalar_one_or_none()
        if not merchant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Marchand '{request.merchant_code}' introuvable et aucun marchand de repli actif."
            )

    # 3. Compte émetteur optionnel
    account_id = None
    if request.account_number:
        stmt_acc = select(Account).where(Account.account_number == request.account_number)
        account = (await db.execute(stmt_acc)).scalar_one_or_none()
        if account:
            account_id = account.id

    # 4. Simulation de la décision d'autorisation (Mock banking network)
    # Permet de démontrer les pannes lors des attaques Red Team ou des tests de chaos
    is_failure = request.simulate_failure or (
        settings.CHAOS_MODE_ENABLED and random.random() < 0.3
    )

    now = datetime.utcnow()
    tx_ref = f"TX-{now.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    
    if is_failure:
        tx_status = "FAILED"
        err_code = "ERR_GATEWAY_TIMEOUT"
        err_msg = "Échec d'autorisation simulateur bancaire / incident réseau injecté."
        auth_code = None
    else:
        tx_status = "SUCCESS"
        err_code = None
        err_msg = None
        auth_code = f"AUTH-{uuid.uuid4().hex[:8].upper()}"

    elapsed_ms = int((time.perf_counter() - start_time) * 1000) + settings.MOCK_LATENCY_MS

    # 5. Persistance en base PostgreSQL
    new_tx = Transaction(
        reference=tx_ref,
        merchant_id=merchant.id,
        account_id=account_id,
        amount=request.amount,
        currency=request.currency.upper(),
        status=tx_status,
        error_code=err_code,
        error_message=err_msg,
        idempotency_key=request.idempotency_key,
        ip_address=client_ip,
        user_agent=user_agent,
        latency_ms=elapsed_ms,
        metadata_=request.metadata or {}
    )

    db.add(new_tx)

    # 6. Journal d'audit léger
    audit_log = ServiceAuditLog(
        service_name="payment-service",
        event_type="TRANSACTION_PROCESSED",
        severity="INFO" if tx_status == "SUCCESS" else "WARNING",
        details={
            "tx_ref": tx_ref,
            "status": tx_status,
            "amount": request.amount,
            "merchant_code": merchant.merchant_code,
            "latency_ms": elapsed_ms
        }
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_tx)

    return PaymentResponse(
        transaction_id=str(new_tx.id),
        reference=new_tx.reference,
        status=new_tx.status,
        amount=float(new_tx.amount),
        currency=new_tx.currency,
        authorization_code=auth_code,
        created_at=new_tx.created_at,
        latency_ms=elapsed_ms,
        error_code=err_code,
        message="Paiement traité avec succès" if tx_status == "SUCCESS" else "Transaction rejetée"
    )
