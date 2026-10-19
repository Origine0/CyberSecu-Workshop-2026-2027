import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Text,
    Integer,
    BigInteger
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    merchant_code = Column(String(32), unique=True, nullable=False)
    api_key_hash = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    webhook_url = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    transactions = relationship("Transaction", back_populates="merchant")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_number = Column(String(34), unique=True, nullable=False)
    holder_name = Column(String(120), nullable=False)
    balance = Column(Numeric(14, 2), nullable=False, default=1000.00)
    currency = Column(String(3), nullable=False, default="EUR")
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    transactions = relationship("Transaction", back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(64), unique=True, nullable=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="EUR")
    status = Column(String(25), nullable=False, default="PENDING")
    error_code = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    idempotency_key = Column(String(128), unique=True, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    latency_ms = Column(Integer, default=0)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    merchant = relationship("Merchant", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")


class ServiceAuditLog(Base):
    __tablename__ = "service_audit_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    service_name = Column(String(50), nullable=False)
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False, default="INFO")
    details = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
