import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { watch } from 'node:fs';
import dotenv from 'dotenv';
import { backendEnvPath, externalRpcEnvValues, RPC_ENV_KEYS, RpcEnvKey } from './env';

const envKeyByNetwork = {
  ERC20: 'PRIVATE_RPC_ETH',
  BEP20: 'PRIVATE_RPC_BSC',
  ARBITRUM_ONE: 'PRIVATE_RPC_ARB',
  BASE: 'PRIVATE_RPC_BASE',
  POLYGON: 'PRIVATE_RPC_POLYGON',
  OPTIMISM: 'PRIVATE_RPC_OP',
  SOLANA: 'PRIVATE_RPC_SOL',
  LTC: 'PRIVATE_RPC_LTC',
  BTC: 'PRIVATE_RPC_BTC',
  BCH: 'PRIVATE_RPC_BCH',
  TRC20: 'PRIVATE_RPC_TRON',
} as const satisfies Record<string, RpcEnvKey>;

export type RpcPoolNetwork = keyof typeof envKeyByNetwork;

export const PUBLIC_RPC_FALLBACKS: Record<RpcPoolNetwork, readonly string[]> = {
  ERC20: ['https://ethereum.publicnode.com', 'https://eth-mainnet.public.blastapi.io'],
  BEP20: ['https://bsc.publicnode.com', 'https://bsc-mainnet.public.blastapi.io'],
  ARBITRUM_ONE: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com'],
  BASE: ['https://mainnet.base.org', 'https://base.publicnode.com'],
  POLYGON: ['https://polygon.publicnode.com'],
  OPTIMISM: ['https://mainnet.optimism.io', 'https://optimism.publicnode.com'],
  SOLANA: ['https://api.mainnet-beta.solana.com', 'https://solana.publicnode.com'],
  LTC: ['https://api.blockchair.com/litecoin'],
  BTC: ['https://mempool.space/api', 'https://blockstream.info/api'],
  BCH: ['https://api.blockchair.com/bitcoin-cash'],
  TRC20: ['https://api.trongrid.io', 'https://tron-rpc.publicnode.com'],
};

export function buildRpcEndpointPool(configured: string, network: RpcPoolNetwork) {
  const valid: string[] = [];
  for (const value of [
    ...configured.split(',').map((endpoint) => endpoint.trim()).filter(Boolean),
    ...PUBLIC_RPC_FALLBACKS[network],
  ]) {
    try {
      const endpoint = new URL(value);
      if (endpoint.protocol !== 'https:') throw new Error('RPC endpoint must use HTTPS');
      if (!valid.includes(endpoint.toString())) valid.push(endpoint.toString());
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'rpc_endpoint_configuration_invalid',
        network,
        reason: error instanceof Error ? error.message : 'Invalid RPC endpoint URL',
      }));
    }
  }
  return valid;
}

const configuredValue = (key: RpcEnvKey) => process.env[key] ?? '';

export const RPC_ENDPOINT_POOLS: Record<RpcPoolNetwork, string[]> = Object.fromEntries(
  Object.entries(envKeyByNetwork).map(([network, key]) => [
    network,
    buildRpcEndpointPool(configuredValue(key), network as RpcPoolNetwork),
  ]),
) as Record<RpcPoolNetwork, string[]>;

export function refreshRpcEndpointPoolsFromEnvironment() {
  const changed: RpcPoolNetwork[] = [];
  for (const [network, key] of Object.entries(envKeyByNetwork) as Array<[RpcPoolNetwork, RpcEnvKey]>) {
    const next = buildRpcEndpointPool(configuredValue(key), network);
    const current = RPC_ENDPOINT_POOLS[network];
    if (current.length === next.length && current.every((endpoint, index) => endpoint === next[index])) continue;
    current.splice(0, current.length, ...next);
    changed.push(network);
  }
  return changed;
}

function loadRpcEnvironmentFile() {
  const parsed = dotenv.parse(readFileSync(backendEnvPath));
  let changed = false;
  for (const key of RPC_ENV_KEYS) {
    const next = parsed[key] ?? externalRpcEnvValues[key] ?? '';
    if (process.env[key] !== next) {
      process.env[key] = next;
      changed = true;
    }
  }
  return changed;
}

export function startRpcEndpointEnvWatcher(onPoolsChanged: (networks: RpcPoolNetwork[]) => void) {
  let refreshTimer: NodeJS.Timeout | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(dirname(backendEnvPath), (_eventType, filename) => {
      if (filename && filename.toString() !== backendEnvPath.split(/[\\/]/).pop()) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        try {
          const fileChanged = loadRpcEnvironmentFile();
          const changed = refreshRpcEndpointPoolsFromEnvironment();
          if (fileChanged && changed.length) onPoolsChanged(changed);
        } catch (error) {
          console.error(JSON.stringify({
            event: 'rpc_endpoint_env_reload_failed',
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }, 200);
      refreshTimer.unref();
    });
    watcher.on('error', (error) => {
      console.error(JSON.stringify({
        event: 'rpc_endpoint_env_watch_failed',
        error: error.message,
      }));
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'rpc_endpoint_env_watch_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  const pollTimer = setInterval(() => {
    try {
      const fileChanged = loadRpcEnvironmentFile();
      const changed = refreshRpcEndpointPoolsFromEnvironment();
      if (fileChanged && changed.length) onPoolsChanged(changed);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'rpc_endpoint_env_reload_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, 2_000);
  pollTimer.unref();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    watcher?.close();
    clearInterval(pollTimer);
  };
}
