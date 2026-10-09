import { timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { config } from '../config';

export function isTestPaymentSimulationAuthorized(request: Pick<FastifyRequest, 'headers'>): boolean {
  if (!config.app.allowTestPaymentSimulation || config.app.env === 'production') return false;

  const provided = request.headers['x-test-payment-simulation-secret'];
  const expected = config.app.testPaymentSimulationSecret;
  if (typeof provided !== 'string' || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
