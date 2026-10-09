import { describe, expect, it } from 'vitest';
import {
  buildRpcEndpointPool,
  PUBLIC_RPC_FALLBACKS,
  refreshRpcEndpointPoolsFromEnvironment,
  RPC_ENDPOINT_POOLS,
} from '../config/rpc-endpoint-pools';

const normalizedFallbacks = (network: keyof typeof PUBLIC_RPC_FALLBACKS) =>
  PUBLIC_RPC_FALLBACKS[network].map((endpoint) => new URL(endpoint).toString());

describe('RPC endpoint configuration', () => {
  it('loads HTTPS environment endpoints before public fallbacks', () => {
    expect(buildRpcEndpointPool(
      ' https://rpc-a.test,https://rpc-b.test, https://rpc-a.test ,,',
      'ERC20',
    )).toEqual([
      'https://rpc-a.test/',
      'https://rpc-b.test/',
      ...normalizedFallbacks('ERC20'),
    ]);
  });

  it('rejects non-HTTPS URLs and leaves the public fallback pool available', () => {
    expect(buildRpcEndpointPool('http://insecure.test/rpc', 'ARBITRUM_ONE'))
      .toEqual(normalizedFallbacks('ARBITRUM_ONE'));
  });

  it('hot-reloads an exact environment key into the runtime candidate pool', () => {
    const previous = process.env.PRIVATE_RPC_ETH;
    process.env.PRIVATE_RPC_ETH = 'https://runtime-rpc.test';
    try {
      expect(refreshRpcEndpointPoolsFromEnvironment()).toContain('ERC20');
      expect(RPC_ENDPOINT_POOLS.ERC20[0]).toBe('https://runtime-rpc.test/');
      expect(RPC_ENDPOINT_POOLS.ERC20).toContain('https://runtime-rpc.test/');
      for (const endpoint of normalizedFallbacks('ERC20')) {
        expect(RPC_ENDPOINT_POOLS.ERC20).toContain(endpoint);
      }
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_RPC_ETH;
      else process.env.PRIVATE_RPC_ETH = previous;
      refreshRpcEndpointPoolsFromEnvironment();
    }
  });

  it('provides a chain-specific runtime pool for all supported RPC keys', () => {
    expect(Object.keys(RPC_ENDPOINT_POOLS).sort()).toEqual([
      'ARBITRUM_ONE', 'BASE', 'BCH', 'BEP20', 'BTC', 'ERC20',
      'LTC', 'OPTIMISM', 'POLYGON', 'SOLANA', 'TRC20',
    ]);
  });
});
