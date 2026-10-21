export type TransactionStatus = 'CONFIRMED' | 'FAILED' | 'PENDING' | 'REJECTED';

export interface Transaction {
  id: string; // UUID v4 format
  amount: number;
  currency: string;
  status: TransactionStatus;
  merchant_id: string;
  merchant_name: string;
  reference: string;
  customer_name: string;
  card_last4: string;
  created_at: string;
  latency_ms: number;
  idempotency_key: string;
  security_hash: string;
  error_reason?: string;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  merchant_id: string;
  customer_name: string;
  card_number: string;
  exp_date: string;
  cvv: string;
  reference: string;
  idempotency_key?: string;
  simulate_failure?: boolean;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  uptime_seconds: number;
  version: string;
  database: {
    engine: string;
    status: 'connected' | 'disconnected';
    latency_ms: number;
    active_connections: number;
    max_connections: number;
  };
  checks: {
    api_gateway: string;
    db_pool: string;
    memory_mb: number;
    disk_healthy: boolean;
  };
}

export interface RemediationAction {
  ts: number;
  alert_id: string;
  type: 'crash' | 'dos' | 'intrusion' | string;
  service: string;
  action: 'block_source' | 'restart_service' | 'restore_database' | string;
  result: 'success' | 'failure' | string;
  duration_s: number;
}

export interface WafStatusResponse {
  banned_ips: string[];
  stats: {
    rate_limit_drops: number;
    banned_ip_drops: number;
    fuzzing_drops: number;
    total_blocked: number;
  };
  remediation?: {
    status: string;
    queue: number;
    recent_actions: RemediationAction[];
  };
}

export interface HourlyVolumeCTE {
  hour_bucket: string;
  tx_count: number;
  success_count: number;
  failed_count: number;
  success_rate_pct: number;
  total_volume_eur: number;
  avg_ticket_eur: number;
}

export interface FraudVelocityCTE {
  customer_name: string;
  card_last4: string;
  velocity_10m_count: number;
  volume_10m_eur: number;
  risk_score: number;
  alert_level: 'NORMAL' | 'ELEVATED' | 'HIGH_RISK';
}

export interface MerchantSettlementCTE {
  merchant_name: string;
  merchant_id: string;
  total_tx: number;
  gross_amount_eur: number;
  fee_interchange_eur: number;
  net_settlement_eur: number;
}

export interface ProjectSourceFile {
  id: string;
  name: string;
  path: string;
  language: 'yaml' | 'sql' | 'python' | 'typescript' | 'markdown' | 'dockerfile';
  category: 'infra' | 'db' | 'backend' | 'frontend' | 'docs';
  description: string;
  badge?: string;
  content: string;
}


// ==============================================================================
// Pilier IA & Data (Détection ML & Assistant RAG)
// ==============================================================================
export interface AiAnalyzeRequest {
  timestamp: string;
  request_rate: number;
  error_rate: number;
  latency_ms: number;
}

export interface AiAnalyzeResponse {
  timestamp: string;
  is_anomaly: boolean;
  action_required: 'TRIGGER_REMEDIATION' | 'NONE';
  anomaly_score: number;
  metrics_received: {
    request_rate: number;
    error_rate: number;
    latency_ms: number;
  };
}

export interface AiAskRequest {
  query: string;
}

export interface AiAskResponse {
  query: string;
  response: string;
  status: string;
  advisory_role?: string;
}
