import { logger } from '../lib/logger';

type EndpointFailure = {
  failures: number;
  retryAt: number;
};

type RpcEndpointErrorOptions = {
  statusCode?: number;
  retryAfterMs?: number;
};

const endpointFailures = new Map<string, EndpointFailure>();
const preferredEndpoint = new Map<string, number>();
const inFlightEndpoints = new Set<string>();

export class RpcEndpointError extends Error {
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, options: RpcEndpointErrorOptions = {}) {
    super(message);
    this.name = 'RpcEndpointError';
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class RpcPoolExhaustedError extends Error {
  constructor(network: string, cause: unknown) {
    super(`RPC endpoint pool exhausted for ${network}`, { cause });
    this.name = 'RpcPoolExhaustedError';
  }
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid-endpoint';
  }
}

function cooldownFor(error: unknown, failures: number) {
  if (error instanceof Error && /timeout|timed out|exceeded latency/i.test(error.message)) {
    return Math.min(30_000 * 2 ** Math.min(failures - 1, 3), 5 * 60_000);
  }
  if (error instanceof RpcEndpointError && error.retryAfterMs !== undefined) {
    return Math.min(Math.max(error.retryAfterMs, 1_000), 10 * 60_000);
  }
  if (error instanceof RpcEndpointError && [401, 403].includes(error.statusCode ?? 0)) {
    return 5 * 60_000;
  }
  if (error instanceof RpcEndpointError && error.statusCode === 429) return 60_000;
  if (error instanceof RpcEndpointError && (error.statusCode ?? 0) >= 500) return 30_000;
  return Math.min(5_000 * 2 ** Math.min(failures - 1, 4), 60_000);
}

export async function withRpcFallback<T>(
  network: string,
  endpoints: readonly string[],
  request: (endpoint: string) => Promise<T>,
): Promise<T> {
  if (!endpoints.length) {
    const cause = new Error(`No RPC endpoints configured for ${network}`);
    logger.warn({ network, error: cause.message }, 'RPC pool is empty; the observation will be retried after configuration or recovery');
    throw new RpcPoolExhaustedError(network, cause);
  }

  const start = (preferredEndpoint.get(network) ?? 0) % endpoints.length;
  const now = Date.now();
  const availableIndexes = endpoints
    .map((_, offset) => (start + offset) % endpoints.length)
    .filter((index) => {
      const endpoint = endpoints[index];
      const key = `${network}:${endpoint}`;
      return !inFlightEndpoints.has(key) && (endpointFailures.get(key)?.retryAt ?? 0) <= now;
    });

  if (!availableIndexes.length) {
    const cause = new Error(`No idle, healthy RPC endpoints are currently available for ${network}`);
    logger.warn({ network, endpoints: endpoints.length }, cause.message);
    throw new RpcPoolExhaustedError(network, cause);
  }

  let lastError: unknown;
  for (const index of availableIndexes) {
    const endpoint = endpoints[index];
    const stateKey = `${network}:${endpoint}`;
    if (inFlightEndpoints.has(stateKey) || (endpointFailures.get(stateKey)?.retryAt ?? 0) > Date.now()) {
      continue;
    }
    inFlightEndpoints.add(stateKey);
    try {
      const result = await request(endpoint);
      endpointFailures.delete(stateKey);
      preferredEndpoint.set(network, index);
      return result;
    } catch (error) {
      lastError = error;
      const failures = (endpointFailures.get(stateKey)?.failures ?? 0) + 1;
      const cooldownMs = cooldownFor(error, failures);
      endpointFailures.set(stateKey, { failures, retryAt: Date.now() + cooldownMs });
      logger.warn({
        network,
        endpoint: endpointHost(endpoint),
        cooldownMs,
        error: error instanceof Error ? error.message : String(error),
      }, 'RPC endpoint failed; trying the next available endpoint');
    } finally {
      inFlightEndpoints.delete(stateKey);
    }
  }

  if (!lastError) {
    lastError = new Error(`No idle, healthy RPC endpoints are currently available for ${network}`);
  }
  logger.warn({
    network,
    endpoints: endpoints.length,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }, 'RPC endpoint pool exhausted; the observation will be retried on the next cycle');
  throw new RpcPoolExhaustedError(network, lastError);
}

export function clearRpcEndpointFailures(network: string, endpoints: readonly string[]) {
  for (const endpoint of endpoints) {
    endpointFailures.delete(`${network}:${endpoint}`);
  }
}
