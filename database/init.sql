-- ==============================================================================
-- PROJECT RESILIENCE-ALPHA : Core Database Schema (PostgreSQL)
-- Module : Service de Paiement Fictif Hautement Résilient
-- Note   : Pas de vues lourdes / matérialisées pénalisantes en cas de charge.
--          Requêtes analytiques optimisées via Common Table Expressions (CTE).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table des commerçants partenaires (Merchants)
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    merchant_code VARCHAR(32) UNIQUE NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'MAINTENANCE')),
    webhook_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table des comptes clients / émetteurs de paiement
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number VARCHAR(34) UNIQUE NOT NULL, -- Format IBAN fictif
    holder_name VARCHAR(120) NOT NULL,
    balance NUMERIC(14, 2) NOT NULL DEFAULT 1000.00 CHECK (balance >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'BLOCKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table principale des transactions de paiement
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(64) UNIQUE NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(25) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('SUCCESS', 'PENDING', 'FAILED', 'REJECTED_WAF', 'REJECTED_FRAUD')),
    error_code VARCHAR(50),
    error_message TEXT,
    idempotency_key VARCHAR(128) UNIQUE,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    latency_ms INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table des journaux d'audit et de résilience (Zero-Touch monitoring)
CREATE TABLE IF NOT EXISTS service_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    service_name VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- INDEX STRATÉGIQUES POUR PERFORMANCE & RÉSILIENCE SOUS FORTE CHARGE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference);
CREATE INDEX IF NOT EXISTS idx_audit_service_severity ON service_audit_logs (service_name, severity, created_at DESC);

-- ==============================================================================
-- DONNÉES DE DÉMONSTRATION (FICTIVES - RESPECT STRICT DES CONSIGNES DU WORKSHOP)
-- ==============================================================================
INSERT INTO merchants (id, name, merchant_code, api_key_hash, status)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'CyberStore Alpha', 'MERCH_ALPHA', 'hash_mock_key_alpha_2026', 'ACTIVE'),
    ('22222222-2222-2222-2222-222222222222', 'Fintech Cloud Services', 'MERCH_FINTECH', 'hash_mock_key_fintech_2026', 'ACTIVE')
ON CONFLICT (merchant_code) DO NOTHING;

INSERT INTO accounts (id, account_number, holder_name, balance, currency, status)
VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FR7630006000011234567890189', 'Alice Martin', 5420.50, 'EUR', 'ACTIVE'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'FR7630006000029876543210945', 'Bob Dupont', 1250.00, 'EUR', 'ACTIVE'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'FR7630006000035554443332210', 'Demo Resilience Test Corp', 99999.00, 'EUR', 'ACTIVE')
ON CONFLICT (account_number) DO NOTHING;

-- Initial transaction audit entry
INSERT INTO service_audit_logs (service_name, event_type, severity, details)
VALUES 
    ('payment-db', 'DATABASE_INITIALIZED', 'INFO', '{"status": "READY", "schema_version": "1.0", "target": "BAC+5 Workshop 2026-2027"}'::jsonb);
