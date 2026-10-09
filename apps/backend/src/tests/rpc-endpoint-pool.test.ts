import { describe, expect, it } from 'vitest';
import { RpcEndpointError, RpcPoolExhaustedError, withRpcFallback } from '../services/rpc-endpoint-pool';

describe('RPC endpoint failover', () => {
  it('switches immediately to a backup and avoids a rate-limited primary', async () => {
    const endpoints = [
      'https://primary-rpc.test/?key=private',
      'https://backup-rpc.test',
    ];
    const attempts: string[] = [];
    const request = async (endpoint: string) => {
      attempts.push(endpoint);
      if (endpoint === endpoints[0]) {
        throw new RpcEndpointError('RPC returned HTTP 429', { statusCode: 429 });
      }
      return 'connected';
    };

    await expect(withRpcFallback('RPC_POOL_TEST', endpoints, request)).resolves.toBe('connected');
    await expect(withRpcFallback('RPC_POOL_TEST', endpoints, request)).resolves.toBe('connected');

    expect(attempts).toEqual([endpoints[0], endpoints[1], endpoints[1]]);
  });

  it('reports a retryable pool outage without logging it as fatal', async () => {
    const endpoints = ['https://unavailable-a.test', 'https://unavailable-b.test'];
    const request = async () => {
      throw new RpcEndpointError('RPC returned HTTP 403', { statusCode: 403 });
    };

    await expect(withRpcFallback('RPC_POOL_OUTAGE_TEST', endpoints, request))
      .rejects.toBeInstanceOf(RpcPoolExhaustedError);
  });

  it('does not retry endpoints while their cooldown is active', async () => {
    const endpoints = ['https://cooldown-a.test', 'https://cooldown-b.test'];
    let attempts = 0;
    const request = async () => {
      attempts += 1;
      throw new RpcEndpointError('RPC returned HTTP 429', { statusCode: 429 });
    };

    await expect(withRpcFallback('RPC_COOLDOWN_TEST', endpoints, request))
      .rejects.toBeInstanceOf(RpcPoolExhaustedError);
    const attemptsAfterFirstCall = attempts;
    await expect(withRpcFallback('RPC_COOLDOWN_TEST', endpoints, request))
      .rejects.toBeInstanceOf(RpcPoolExhaustedError);

    expect(attemptsAfterFirstCall).toBe(endpoints.length);
    expect(attempts).toBe(attemptsAfterFirstCall);
  });

  it('skips an endpoint while another request is using it', async () => {
    const endpoint = 'https://busy-rpc.test';
    let releaseRequest: (() => void) | undefined;
    const firstRequest = withRpcFallback('RPC_BUSY_TEST', [endpoint], () =>
      new Promise<string>((resolve) => {
        releaseRequest = () => resolve('done');
      }),
    );

    await Promise.resolve();
    await expect(withRpcFallback('RPC_BUSY_TEST', [endpoint], async () => 'unexpected'))
      .rejects.toBeInstanceOf(RpcPoolExhaustedError);

    releaseRequest?.();
    await expect(firstRequest).resolves.toBe('done');
  });
});
