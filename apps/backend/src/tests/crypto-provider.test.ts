import { afterEach, describe, expect, it } from 'vitest';
import { createCryptoProvider, ManualProvider } from '../integrations/crypto/crypto.provider';

describe('crypto provider selection', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows the manual provider only outside production', () => {
    process.env.NODE_ENV = 'test';
    expect(createCryptoProvider('manual')).toBeInstanceOf(ManualProvider);

    process.env.NODE_ENV = 'production';
    expect(() => createCryptoProvider('manual')).toThrow('disabled in production');
  });

  it('does not silently substitute a mock for NowPayments or unknown providers', () => {
    expect(() => createCryptoProvider('nowpayments')).toThrow('do not provide wallet deposit-address');
    expect(() => createCryptoProvider('unsupported')).toThrow('Unsupported crypto provider');
  });
});
