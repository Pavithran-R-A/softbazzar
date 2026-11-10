import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyYoupiWebhook } from '../src/payment.js';
import { MockPaymentGateway, YoupiPaymentAdapter } from '../src/youpi-adapter.js';

test('YouPI accepts signed V1 and timestamp-bound V2 retries', async () => {
  const now = Date.now();
  const timestamp = String(now - 3599000);
  const rawBody = '{"event":"OBSERVED_SUCCESS","method":"UPI"}';
  const signatureV1 = 'sha256=' + createHmac('sha256', 'test-secret').update(rawBody).digest('hex');
  const signatureV2 = 'sha256=' + createHmac('sha256', 'test-secret').update(`${timestamp}.${rawBody}`).digest('hex');
  const event = await verifyYoupiWebhook({ rawBody, signatureV1, timestamp, secret: 'test-secret', now });
  assert.equal(event.event, 'OBSERVED_SUCCESS');
  assert.equal((await verifyYoupiWebhook({ rawBody, signatureV2, timestamp, secret: 'test-secret', now })).method, 'UPI');
  await assert.rejects(verifyYoupiWebhook({ rawBody: `${rawBody} `, signatureV1, timestamp, secret: 'test-secret', now }), /invalid_signature/);
  await assert.rejects(verifyYoupiWebhook({ rawBody, signatureV1, timestamp: String(now - 3600001), secret: 'test-secret', now }), /stale/);
  await assert.rejects(verifyYoupiWebhook({ rawBody, signatureV2, timestamp: String(now - 3600001), secret: 'test-secret', now }), /stale/);
});

test('mock payment never reports settlement and YouPI live stays gated', async () => {
  const mock = await new MockPaymentGateway().createPayment({ orderId: 'order-1', amountPaise: 1250 });
  assert.equal(mock.state, 'verification_pending');
  assert.equal(mock.checkoutUrl, null);
  const adapter = new YoupiPaymentAdapter({ YOUPI_LIVE_ENABLED: 'false' }, async () => { throw new Error('must not call'); });
  await assert.rejects(adapter.createPayment({ orderId: 'order-1', amountPaise: 1250, idempotencyKey: 'safe_key_0123456789' }), /YOUPI_LIVE_DISABLED/);
});
