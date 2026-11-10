export class MockPaymentGateway {
  async createPayment({ orderId, amountPaise }) {
    if (typeof orderId !== 'string' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new TypeError('Invalid payment request');
    return { gateway: 'mock', paymentId: `mock_${crypto.randomUUID()}`, orderId, amountPaise, state: 'verification_pending', checkoutUrl: null };
  }
}

export class YoupiPaymentAdapter {
  constructor(env, fetchImpl = fetch) { this.env = env; this.fetchImpl = fetchImpl; }

  async createPayment({ orderId, amountPaise, idempotencyKey }) {
    if (this.env.YOUPI_LIVE_ENABLED !== 'true') throw new Error('YOUPI_LIVE_DISABLED');
    const endpoint = new URL(this.env.YOUPI_GATEWAY_URL || '');
    if (endpoint.protocol !== 'https:' || !this.env.YOUPI_MERCHANT_ID || !this.env.YOUPI_MERCHANT_API_KEY) throw new Error('YOUPI_CONFIGURATION_INVALID');
    if (typeof orderId !== 'string' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey || '')) throw new TypeError('Invalid payment request');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetchImpl(new URL('/api/v1/payments', endpoint), {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': this.env.YOUPI_MERCHANT_ID, 'X-Merchant-Key': this.env.YOUPI_MERCHANT_API_KEY, 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ orderId, amount: (amountPaise / 100).toFixed(2), currency: 'INR' }),
      });
      if (!response.ok) throw new Error(`YOUPI_REQUEST_FAILED_${response.status}`);
      const result = await response.json();
      const checkoutUrl=new URL(result.checkoutUrl||'');
      if (result.orderId !== orderId || Number(result.amountPaise) !== amountPaise || typeof result.paymentId !== 'string' || checkoutUrl.protocol !== 'https:' || checkoutUrl.origin !== endpoint.origin) throw new Error('YOUPI_RESPONSE_INVALID');
      return { gateway: 'youpi', paymentId: result.paymentId, orderId, amountPaise, state: String(result.status || 'pending'), checkoutUrl: result.checkoutUrl };
    } finally { clearTimeout(timeout); }
  }
}
