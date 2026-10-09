import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyNowPaymentsSignature } from '../routes/webhook.routes';

describe('NowPayments IPN signature verification', () => {
  const secret = 'test-ipn-secret';

  it('verifies the provider signature over recursively key-sorted JSON', () => {
    const payload = {
      payment_id: 123,
      nested: { z: 'last', a: 'first' },
      order_id: 'order-1',
    };
    const canonical = JSON.stringify({
      nested: { a: 'first', z: 'last' },
      order_id: 'order-1',
      payment_id: 123,
    });
    const signature = createHmac('sha512', secret).update(canonical).digest('hex');

    expect(verifyNowPaymentsSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects missing, malformed, or mismatched signatures', () => {
    const payload = { payment_id: 123 };

    expect(verifyNowPaymentsSignature(payload, undefined, secret)).toBe(false);
    expect(verifyNowPaymentsSignature(payload, 'invalid', secret)).toBe(false);
    expect(verifyNowPaymentsSignature(payload, '0'.repeat(128), secret)).toBe(false);
  });
});
