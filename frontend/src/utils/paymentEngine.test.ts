import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePaymentRequest,
  processPayment,
  computeHourlyVolumeCTE,
  computeFraudVelocityCTE,
  computeMerchantSettlementCTE,
  getHealthStatus,
  INITIAL_TRANSACTIONS,
} from './paymentEngine.ts';
import type { PaymentRequest, Transaction } from '../types/index.ts';

test('validatePaymentRequest validates correct payment inputs', () => {
  const validReq: PaymentRequest = {
    amount: 50.0,
    currency: 'EUR',
    merchant_id: 'mch_cyber_01',
    customer_name: 'Jean Dupont',
    card_number: '4242 4242 4242 4242',
    exp_date: '12/28',
    cvv: '123',
    reference: 'REF-TEST-1',
  };

  const result = validatePaymentRequest(validReq);
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
});

test('validatePaymentRequest rejects invalid amount or missing fields', () => {
  const badAmount = validatePaymentRequest({
    amount: -10,
    merchant_id: 'mch_01',
    customer_name: 'Test',
    card_number: '4242424242424242',
    exp_date: '12/28',
    cvv: '123',
  });
  assert.equal(badAmount.valid, false);

  const badExpDate = validatePaymentRequest({
    amount: 10,
    merchant_id: 'mch_01',
    customer_name: 'Test',
    card_number: '4242424242424242',
    exp_date: '2028-12', // Not MM/AA
    cvv: '123',
  });
  assert.equal(badExpDate.valid, false);
});

test('processPayment handles new transactions and enforces idempotency', () => {
  const req: PaymentRequest = {
    amount: 99.95,
    currency: 'EUR',
    merchant_id: 'mch_cyber_01',
    customer_name: 'Alice Martin',
    card_number: '4532 1122 3344 5566',
    exp_date: '08/29',
    cvv: '456',
    reference: 'REF-IDEMP-TEST',
    idempotency_key: 'idemp_key_unique_123',
  };

  const { transaction: tx1, isIdempotent: idemp1 } = processPayment(req, []);
  assert.equal(idemp1, false);
  assert.equal(tx1.status, 'CONFIRMED');
  assert.equal(tx1.amount, 99.95);
  assert.equal(tx1.card_last4, '5566');
  assert.equal(tx1.idempotency_key, 'idemp_key_unique_123');

  // Second call with same idempotency key in pool
  const { transaction: tx2, isIdempotent: idemp2 } = processPayment(req, [tx1]);
  assert.equal(idemp2, true);
  assert.equal(tx2.id, tx1.id);
  assert.equal(tx2.created_at, tx1.created_at);
});

test('processPayment supports simulated failure for resilience testing', () => {
  const req: PaymentRequest = {
    amount: 25.0,
    currency: 'EUR',
    merchant_id: 'mch_saas_02',
    customer_name: 'Chaos Test',
    card_number: '4242 4242 4242 9999',
    exp_date: '10/27',
    cvv: '999',
    reference: 'REF-CHAOS',
    simulate_failure: true,
  };

  const { transaction } = processPayment(req, []);
  assert.equal(transaction.status, 'FAILED');
  assert.match(transaction.error_reason || '', /SIMULATED_CHAOS_FAILURE/);
});

test('computeHourlyVolumeCTE groups data and computes rates without heavy views', () => {
  const hourly = computeHourlyVolumeCTE(INITIAL_TRANSACTIONS);
  assert.ok(hourly.length > 0);
  const totalCount = hourly.reduce((acc, h) => acc + h.tx_count, 0);
  assert.equal(totalCount, INITIAL_TRANSACTIONS.length);
});

test('computeMerchantSettlementCTE accurately calculates gross and net fees', () => {
  const sampleTxs: Transaction[] = [
    {
      id: 'tx_1',
      amount: 100.0,
      currency: 'EUR',
      status: 'CONFIRMED',
      merchant_id: 'mch_1',
      merchant_name: 'Test Mch',
      reference: 'R1',
      customer_name: 'C1',
      card_last4: '1111',
      created_at: new Date().toISOString(),
      latency_ms: 30,
      idempotency_key: 'k1',
      security_hash: 'h1',
    },
    {
      id: 'tx_2',
      amount: 200.0,
      currency: 'EUR',
      status: 'CONFIRMED',
      merchant_id: 'mch_1',
      merchant_name: 'Test Mch',
      reference: 'R2',
      customer_name: 'C2',
      card_last4: '2222',
      created_at: new Date().toISOString(),
      latency_ms: 32,
      idempotency_key: 'k2',
      security_hash: 'h2',
    },
  ];

  const settlements = computeMerchantSettlementCTE(sampleTxs);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].gross_amount_eur, 300.0);
  // 1.2% of 300 = 3.6
  assert.equal(settlements[0].fee_interchange_eur, 3.6);
  assert.equal(settlements[0].net_settlement_eur, 296.4);
});

test('getHealthStatus reflects system state', () => {
  const healthy = getHealthStatus(INITIAL_TRANSACTIONS, false);
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.database.status, 'connected');

  const degraded = getHealthStatus(INITIAL_TRANSACTIONS, true);
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.database.status, 'disconnected');
});
