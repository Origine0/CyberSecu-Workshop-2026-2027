-- ==============================================================================
-- PROJECT RESILIENCE-ALPHA : Requêtes Analytiques via Common Table Expressions (CTE)
-- Justification d'architecture : 
--   Les vues matérialisées ou lourdes provoquent des locks exclusifs, une surconsommation 
--   mémoire et des goulots d'étranglement lors d'attaques volumétriques (DDoS/Spam).
--   Les CTEs ci-dessous permettent des analyses ponctuelles ultra-rapides pour l'AIOps / SOC
--   sans impacter le moteur d'ingestion transactionnel.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- CTE 1 : Métriques de santé et taux d'échec sur fenêtre glissante (pour Détection ML/AIOps)
-- Calcule le volume, le taux d'échec global et le temps de latence moyen
-- ------------------------------------------------------------------------------
WITH WindowStats AS (
    SELECT 
        date_trunc('minute', created_at) AS time_bucket,
        COUNT(*) AS total_transactions,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successful_transactions,
        COUNT(*) FILTER (WHERE status != 'SUCCESS') AS failed_transactions,
        ROUND(AVG(latency_ms), 2) AS avg_latency_ms,
        MAX(latency_ms) AS max_latency_ms
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '30 minutes'
    GROUP BY date_trunc('minute', created_at)
),
HealthEvaluation AS (
    SELECT 
        time_bucket,
        total_transactions,
        successful_transactions,
        failed_transactions,
        CASE 
            WHEN total_transactions > 0 THEN 
                ROUND((failed_transactions::numeric / total_transactions::numeric) * 100, 2)
            ELSE 0.00 
        END AS failure_rate_percentage,
        avg_latency_ms,
        max_latency_ms
    FROM WindowStats
)
SELECT 
    time_bucket,
    total_transactions,
    successful_transactions,
    failed_transactions,
    failure_rate_percentage,
    avg_latency_ms,
    CASE 
        WHEN failure_rate_percentage >= 40.0 THEN 'CRITICAL_ANOMALY'
        WHEN failure_rate_percentage >= 15.0 THEN 'WARNING_DEGRADED'
        ELSE 'HEALTHY_NOMINAL'
    END AS service_health_status
FROM HealthEvaluation
ORDER BY time_bucket DESC;


-- ------------------------------------------------------------------------------
-- CTE 2 : Détection des anomalies par Marchand (Profiling & Détection d'Attaque Ciblée)
-- Identifie si un marchand subit une vague de rejets ou d'injections
-- ------------------------------------------------------------------------------
WITH MerchantRecentActivity AS (
    SELECT 
        m.id AS merchant_id,
        m.name AS merchant_name,
        m.merchant_code,
        COUNT(t.id) AS tx_count,
        COUNT(t.id) FILTER (WHERE t.status = 'REJECTED_WAF') AS waf_blocks,
        COUNT(t.id) FILTER (WHERE t.status = 'FAILED') AS gateway_failures,
        COUNT(t.id) FILTER (WHERE t.status = 'SUCCESS') AS success_count
    FROM merchants m
    LEFT JOIN transactions t ON t.merchant_id = m.id AND t.created_at >= NOW() - INTERVAL '1 hour'
    GROUP BY m.id, m.name, m.merchant_code
)
SELECT 
    merchant_id,
    merchant_name,
    merchant_code,
    tx_count,
    waf_blocks,
    gateway_failures,
    success_count,
    CASE 
        WHEN tx_count > 0 THEN ROUND((waf_blocks::numeric / tx_count::numeric) * 100, 2)
        ELSE 0.00 
    END AS waf_rejection_rate
FROM MerchantRecentActivity
ORDER BY waf_blocks DESC, tx_count DESC;


-- ------------------------------------------------------------------------------
-- CTE 3 : Preuve Mathématique de Reprise Autonome (Validation Post-Remédiation)
-- Comparaison de la fenêtre "Pendant incident" vs "Post-Remédiation"
-- Utile pour l'Axe 1 de la soutenance (prouver le retour à l'état nominal)
-- ------------------------------------------------------------------------------
WITH RecoveryPeriods AS (
    SELECT 
        CASE 
            WHEN created_at >= NOW() - INTERVAL '2 minutes' THEN 'POST_REMEDIATION'
            WHEN created_at >= NOW() - INTERVAL '7 minutes' THEN 'INCIDENT_WINDOW'
            ELSE 'PRE_INCIDENT'
        END AS period,
        status,
        latency_ms
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '15 minutes'
),
AggregatedPeriods AS (
    SELECT 
        period,
        COUNT(*) AS total_tx,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success_tx,
        ROUND(AVG(latency_ms), 1) AS avg_latency
    FROM RecoveryPeriods
    GROUP BY period
)
SELECT 
    period,
    total_tx,
    success_tx,
    CASE 
        WHEN total_tx > 0 THEN ROUND((success_tx::numeric / total_tx::numeric) * 100, 1)
        ELSE 0.0 
    END AS availability_percentage,
    avg_latency
FROM AggregatedPeriods
ORDER BY 
    CASE period 
        WHEN 'PRE_INCIDENT' THEN 1 
        WHEN 'INCIDENT_WINDOW' THEN 2 
        WHEN 'POST_REMEDIATION' THEN 3 
    END;
