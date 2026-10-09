import { config } from './index';
import { clearRpcEndpointFailures } from '../services/rpc-endpoint-pool';
import { RPC_ENDPOINT_POOLS } from './rpc-endpoint-pools';

const RPC_TIMEOUT_MS = 10_000;
const RPC_REFRESH_INTERVAL_MS = 10 * 60 * 60 * 1_000;
const MIN_HEALTHY_ENDPOINTS = 5;

type RpcKind = 'EVM' | 'TRON' | 'SOLANA' | 'UTXO';

type ProbeResult = {
  url: string;
  latencyMs: number;
  ok: boolean;
  error?: string;
  chainMismatch?: boolean;
};

const EVM_CHAIN_IDS: Record<string, string> = {
  ERC20: '0x1',
  BEP20: '0x38',
  POLYGON: '0x89',
  ARBITRUM_ONE: '0xa4b1',
  BASE: '0x2105',
  OPTIMISM: '0xa',
};

const getCandidatePools = () => ({
  evm: Object.fromEntries(Object.entries({
    ERC20: RPC_ENDPOINT_POOLS.ERC20,
    BEP20: RPC_ENDPOINT_POOLS.BEP20,
    ARBITRUM_ONE: RPC_ENDPOINT_POOLS.ARBITRUM_ONE,
    BASE: RPC_ENDPOINT_POOLS.BASE,
    POLYGON: RPC_ENDPOINT_POOLS.POLYGON,
    OPTIMISM: RPC_ENDPOINT_POOLS.OPTIMISM,
  }).map(([network, urls]) => [
    network,
    [...new Set(urls)],
  ])) as Record<string, string[]>,
  tron: [...new Set(RPC_ENDPOINT_POOLS.TRC20)],
  solana: [...new Set(RPC_ENDPOINT_POOLS.SOLANA)],
  utxo: Object.fromEntries(Object.entries({
    BTC: RPC_ENDPOINT_POOLS.BTC,
    BCH: RPC_ENDPOINT_POOLS.BCH,
    LTC: RPC_ENDPOINT_POOLS.LTC,
  }).map(([network, urls]) => [
    network,
    [...new Set(urls)],
  ])) as Record<string, string[]>,
});

const endpointHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-endpoint';
  }
};

const probe = async (url: string, kind: RpcKind, network: string): Promise<ProbeResult> => {
  const startedAt = Date.now();
  try {
    const base = url.replace(/\/$/, '');
    const host = endpointHost(url);
    if (kind === 'UTXO') {
      if (host === 'mempool.space' || host === 'blockstream.info') {
        const response = await fetch(`${base}/blocks/tip/height`, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
        const height = (await response.text()).trim();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!/^\d+$/.test(height)) throw new Error('invalid block-height response');
        return { url, latencyMs: Date.now() - startedAt, ok: true };
      }
      if (host === 'api.blockchair.com') {
        const response = await fetch(`${base}/stats`, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as { data?: { blocks?: unknown } };
        if (!Number.isSafeInteger(body.data?.blocks)) throw new Error('invalid Blockchair block-height response');
        return { url, latencyMs: Date.now() - startedAt, ok: true };
      }
      if (host === 'api.blockcypher.com') {
        const response = await fetch(base, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as { height?: unknown };
        if (!Number.isSafeInteger(body.height)) throw new Error('invalid BlockCypher block-height response');
        return { url, latencyMs: Date.now() - startedAt, ok: true };
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'getblockcount', params: [] }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { result?: unknown; error?: unknown };
      if (body.error || !Number.isSafeInteger(body.result)) throw new Error('invalid Bitcoin RPC block-height response');
      return { url, latencyMs: Date.now() - startedAt, ok: true };
    }

    const response = await fetch(kind === 'TRON' ? `${base}/wallet/getnowblock` : url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kind === 'EVM'
          ? { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
          : kind === 'SOLANA'
            ? { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'finalized' }] }
            : {}),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as {
      result?: unknown;
      block_header?: { raw_data?: { number?: unknown } };
    };
    if (kind === 'EVM' && typeof body.result === 'string' &&
      /^0x[0-9a-f]+$/i.test(body.result) &&
      body.result.toLowerCase() !== EVM_CHAIN_IDS[network]) {
      return {
        url,
        latencyMs: Date.now() - startedAt,
        ok: false,
        chainMismatch: true,
        error: 'RPC endpoint returned a different EVM chain ID',
      };
    }
    const valid = kind === 'EVM'
      ? typeof body.result === 'string' && /^0x[0-9a-f]+$/i.test(body.result)
      : kind === 'SOLANA'
        ? Number.isSafeInteger(body.result)
        : Number.isSafeInteger(body.block_header?.raw_data?.number);
    if (!valid) throw new Error('invalid block-height response');
    return { url, latencyMs: Date.now() - startedAt, ok: true };
  } catch (error) {
    return {
      url,
      latencyMs: Date.now() - startedAt,
      ok: false,
      chainMismatch: error instanceof Error && error.message === 'RPC endpoint returned a different EVM chain ID',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const validatePool = async (name: string, urls: string[], kind: RpcKind) => {
  const results = await Promise.all(urls.map((url) => probe(url, kind, name)));
  const healthy = results
    .filter((result) => result.ok && result.latencyMs <= RPC_TIMEOUT_MS)
    .map((result) => result.url);
  const ordered = healthy;

  for (const result of results) {
    console.info(JSON.stringify({
      event: 'rpc_startup_health_check',
      network: name,
      endpoint: endpointHost(result.url),
      healthy: result.ok && result.latencyMs <= RPC_TIMEOUT_MS,
      latencyMs: result.latencyMs,
      error: result.error,
      chainMismatch: result.chainMismatch,
    }));
  }
  console.info(JSON.stringify({
    event: 'rpc_startup_pool_ready',
    network: name,
    healthyEndpoints: healthy.length,
    runtimeEndpoints: ordered.length,
    retainingUnhealthyBackups: false,
    preferredEndpointLatencyMs: healthy.length ? results.find((result) => result.url === healthy[0])?.latencyMs : undefined,
  }));
  if (healthy.length < MIN_HEALTHY_ENDPOINTS) {
    console.warn(JSON.stringify({
      event: 'rpc_pool_below_redundancy_target',
      network: name,
      healthyEndpoints: healthy.length,
      targetHealthyEndpoints: MIN_HEALTHY_ENDPOINTS,
      message: 'Only verified, configured endpoints are retained; add provider endpoints to configuration to increase redundancy',
    }));
  }
  if (!healthy.length) {
    console.warn(JSON.stringify({
      event: 'rpc_startup_pool_empty',
      network: name,
      message: urls.length
        ? 'No RPC endpoint passed startup validation; scanning is disabled for this network until an endpoint responds successfully'
        : 'No RPC endpoints are configured; scanning for this network is disabled',
    }));
  }
  return ordered;
};

let validationPromise: Promise<void> | undefined;

export function validateRpcNodes(): Promise<void> {
  if (validationPromise) {
    return validationPromise.then(() => validateRpcNodes());
  }
  validationPromise = (async () => {
    const candidatePools = getCandidatePools();
    const evmNetworks = Object.keys(candidatePools.evm);
    const evmPools = await Promise.all(evmNetworks.map(async (network) => [
      network,
      await validatePool(network, candidatePools.evm[network] ?? [], 'EVM'),
    ] as const));
    for (const [network, healthy] of evmPools) {
      const active = config.blockchain.evmRpcUrlsByNetwork[network] ?? [];
      active.splice(0, active.length, ...healthy);
      clearRpcEndpointFailures(network, healthy);
    }
    const [tronUrls, solanaUrls, utxoPools] = await Promise.all([
      validatePool('TRC20', candidatePools.tron, 'TRON'),
      validatePool('SOLANA', candidatePools.solana, 'SOLANA'),
      Promise.all(Object.entries(candidatePools.utxo).map(async ([network, urls]) => [
        network,
        await validatePool(network, urls, 'UTXO'),
      ] as const)),
    ]);
    config.blockchain.tronRpcUrls.splice(0, config.blockchain.tronRpcUrls.length, ...tronUrls);
    config.blockchain.solanaRpcUrls.splice(0, config.blockchain.solanaRpcUrls.length, ...solanaUrls);
    clearRpcEndpointFailures('TRC20', tronUrls);
    clearRpcEndpointFailures('SOLANA', solanaUrls);
    for (const [network, urls] of utxoPools) {
      const active = config.blockchain.utxoRpcUrlsByNetwork[network as keyof typeof config.blockchain.utxoRpcUrlsByNetwork];
      active.splice(0, active.length, ...urls);
      clearRpcEndpointFailures(network, urls);
    }
    const activeEvmUrls = evmPools.flatMap(([, urls]) => urls);
    config.blockchain.evmRpcUrls.splice(0, config.blockchain.evmRpcUrls.length, ...activeEvmUrls);
  })().finally(() => {
    validationPromise = undefined;
  });
  return validationPromise;
}

export function startRpcRefreshScheduler() {
  const timer = setInterval(() => {
    void validateRpcNodes().catch((error) => {
      console.error(JSON.stringify({
        event: 'rpc_scheduled_refresh_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }, RPC_REFRESH_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
