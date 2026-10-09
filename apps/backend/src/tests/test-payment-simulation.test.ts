import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { isTestPaymentSimulationAuthorized } from '../middleware/test-payment-simulation';

const originalSettings = {
  env: config.app.env,
  enabled: config.app.allowTestPaymentSimulation,
  secret: config.app.testPaymentSimulationSecret,
};

afterEach(() => {
  config.app.env = originalSettings.env;
  config.app.allowTestPaymentSimulation = originalSettings.enabled;
  config.app.testPaymentSimulationSecret = originalSettings.secret;
});

describe('test payment simulation authorization', () => {
  it('requires the explicit development feature flag and matching secret', () => {
    const secret = 'development-only-simulation-secret-32';
    config.app.env = 'development';
    config.app.allowTestPaymentSimulation = true;
    config.app.testPaymentSimulationSecret = secret;

    expect(isTestPaymentSimulationAuthorized({
      headers: { 'x-test-payment-simulation-secret': secret },
    })).toBe(true);
    expect(isTestPaymentSimulationAuthorized({
      headers: { 'x-test-payment-simulation-secret': 'wrong-secret' },
    })).toBe(false);
  });

  it('denies simulation when the feature flag is off or the environment is production', () => {
    const secret = 'development-only-simulation-secret-32';
    config.app.allowTestPaymentSimulation = false;
    config.app.testPaymentSimulationSecret = secret;
    expect(isTestPaymentSimulationAuthorized({
      headers: { 'x-test-payment-simulation-secret': secret },
    })).toBe(false);

    config.app.env = 'production';
    config.app.allowTestPaymentSimulation = true;
    expect(isTestPaymentSimulationAuthorized({
      headers: { 'x-test-payment-simulation-secret': secret },
    })).toBe(false);
  });
});
