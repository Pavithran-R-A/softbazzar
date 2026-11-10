import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyYoupiWebhook } from '../src/payment.js';
import { MockPaymentGateway, YoupiPaymentAdapter } from '../src/youpi-adapter.js';

test('YouPI signature covers timestamp and raw request body', async () => {
  const timestamp = String(Date.now());
  const rawBody = '{"event":"OBSERVED_SUCCESS","method":"UPI"}';
  const signature = 'sha256=' + createHmac('sha256', 'test-secret').update(`${timestamp}.${rawBody}`).digest('hex');
  const event = await verifyYoupiWebhook({ rawBody, signature, timestamp, secret: 'test-secret' });
  assert.equal(event.event, 'OBSERVED_SUCCESS');
  await assert.rejects(verifyYoupiWebhook({ rawBody: `${rawBody} `, signature, timestamp, secret: 'test-secret' }), /invalid_signature/);
  await assert.rejects(verifyYoupiWebhook({ rawBody, signature, timestamp: '1', secret: 'test-secret' }), /stale/);
});

test('mock payment never reports settlement and YouPI live stays gated', async () => {
  const mock = await new MockPaymentGateway().createPayment({ orderId: 'order-1', amountPaise: 1250 });
  assert.equal(mock.state, 'verification_pending');
  assert.equal(mock.checkoutUrl, null);
  const adapter = new YoupiPaymentAdapter({ YOUPI_LIVE_ENABLED: 'false' }, async () => { throw new Error('must not call'); });
  await assert.rejects(adapter.createPayment({ orderId: 'order-1', amountPaise: 1250, idempotencyKey: 'safe_key_0123456789' }), /YOUPI_LIVE_DISABLED/);
});
