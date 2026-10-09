import { keccak256, toUtf8Bytes } from 'ethers';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../config';
import { getTokenDeployment } from '../config/blockchain';
import { amountMatchesTolerance } from '../utils/crypto-amount';
import { RpcEndpointError, withRpcFallback } from './rpc-endpoint-pool';

type RpcNetwork = 'EVM' | 'TRON' | 'SOLANA';

export class BlockchainConfirmationService {
  private static readonly RPC_TIMEOUT_MS = 15_000;
  private static readonly HEIGHT_CACHE_TTL_MS = 30_000;
  private static readonly heightCache = new Map<string, { value: bigint; expiresAt: number }>();

  private static readonly networkUrls: Record<RpcNetwork, string[]> = {
    EVM: config.blockchain.evmRpcUrls,
    TRON: config.blockchain.tronRpcUrls,
    SOLANA: config.blockchain.solanaRpcUrls,
  };

  static async currentHeight(network: string, options: { fresh?: boolean } = {}): Promise<bigint> {
    const normalized = network.toUpperCase();
    const cached = this.heightCache.get(normalized);
    if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const rpcNetwork: RpcNetwork = ['TRC20', 'TRON'].includes(normalized)
      ? 'TRON'
      : ['SOLANA', 'SOL'].includes(normalized) ? 'SOLANA' : 'EVM';
    const urls = rpcNetwork === 'EVM'
      ? config.blockchain.evmRpcUrlsByNetwork[normalized] ?? []
      : this.networkUrls[rpcNetwork];
    if (!urls.length) throw new Error(`No ${rpcNetwork} RPC endpoint is configured`);
    const height = await this.withFailover(`height:${normalized}`, urls, async (url) => {
      if (rpcNetwork === 'SOLANA') {
        const response = await this.rpc(url, 'getSlot', []);
        return BigInt(response.result as string | number);
      }
      if (rpcNetwork === 'TRON') {
        const response = await this.httpJson(`${url.replace(/\/$/, '')}/wallet/getnowblock`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        const body = response as { block_header?: { raw_data?: { number?: number } } };
        const value = body.block_header?.raw_data?.number;
        if (!Number.isSafeInteger(value)) throw new Error('TRON RPC returned an invalid block height');
        return BigInt(value as number);
      }
      const response = await this.rpc(url, 'eth_blockNumber', []);
      return BigInt(response.result as string);
    });
    this.heightCache.set(normalized, { value: height, expiresAt: Date.now() + this.HEIGHT_CACHE_TTL_MS });
    return height;
  }

  static async tokenTransfersSince(
    network: string,
    contract: string,
    fromBlock: bigint,
    toBlock: bigint,
    destinations: string[] = [],
  ) {
    const normalized = network.toUpperCase();
    const urls = config.blockchain.evmRpcUrlsByNetwork[normalized] ?? [];
    if (!urls.length) throw new Error(`No EVM RPC endpoint is configured for ${normalized}`);
    const logs: Array<{ address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string }> = [];
    const destinationTopics = destinations
      .map((address) => `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`);
    // Public EVM providers commonly cap eth_getLogs requests at 50 blocks.
    // Keep the request window within that limit so one restrictive fallback
    // cannot block the entire network scan.
    const chunkSize = 50n;
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
      const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
      const response = await this.withFailover(`logs:${normalized}`, urls, (url) =>
        this.rpc(url, 'eth_getLogs', [{
            address: contract,
            fromBlock: `0x${start.toString(16)}`,
            toBlock: `0x${end.toString(16)}`,
            topics: [
              keccak256(toUtf8Bytes('Transfer(address,address,uint256)')),
              null,
              destinationTopics.length ? destinationTopics : null,
            ],
          }]));
      logs.push(...(response.result as typeof logs));
    }
    return logs;
  }

  static async verifyTransaction(input: {
    txHash: string;
    asset: string;
    network: string;
    destination: string;
    expectedAmount: number;
  }): Promise<{ blockNumber: number; amount: number }> {
    const network = input.network.toUpperCase();
    if (['TRC20', 'TRON'].includes(network)) return this.verifyTron(input);
    if (['SOLANA', 'SOL'].includes(network)) return this.verifySolana(input);
    return this.verifyEvm(input);
  }

  private static async verifyEvm(input: {
    txHash: string; asset: string; network: string; destination: string; expectedAmount: number;
  }) {
    const network = input.network.toUpperCase();
    const urls = config.blockchain.evmRpcUrlsByNetwork[network] ?? [];
    if (!urls.length) throw new Error(`No EVM RPC endpoint is configured for ${network}`);
    const [receiptResponse, transactionResponse] = await Promise.all([
      this.rpcWithFailover(`receipt:${network}`, urls, 'eth_getTransactionReceipt', [input.txHash]),
      this.rpcWithFailover(`transaction:${network}`, urls, 'eth_getTransactionByHash', [input.txHash]),
    ]);
    const receipt = receiptResponse.result as {
      status?: string; blockNumber?: string;
      logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
    } | null;
    const transaction = transactionResponse.result as { to?: string; value?: string } | null;
    if (!receipt?.blockNumber || receipt.status !== '0x1' || !transaction) {
      throw new Error('Transaction is not confirmed on the EVM chain');
    }
    const deployment = getTokenDeployment(input.asset, network);
    let amount: number;
    if (deployment) {
      const transferTopic = keccak256(toUtf8Bytes('Transfer(address,address,uint256)'));
      const destinationTopic = `0x${input.destination.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
      const transfer = receipt.logs?.find((log) =>
        log.address?.toLowerCase() === deployment.contract.toLowerCase() &&
        log.topics?.[0]?.toLowerCase() === transferTopic.toLowerCase() &&
        log.topics?.[2]?.toLowerCase() === destinationTopic.toLowerCase()
      );
      if (!transfer?.data) throw new Error('Verified token transfer was not found in the receipt');
      amount = Number(BigInt(transfer.data)) / 10 ** deployment.decimals;
    } else {
      if (transaction.to?.toLowerCase() !== input.destination.toLowerCase()) {
        throw new Error('Transaction destination does not match the assigned address');
      }
      amount = Number(BigInt(transaction.value ?? '0x0')) / 1e18;
    }
    this.assertAmount(amount, input.expectedAmount, input.asset, input.network);
    return { blockNumber: Number(BigInt(receipt.blockNumber)), amount };
  }

  private static async verifyTron(input: {
    txHash: string; asset: string; network: string; destination: string; expectedAmount: number;
  }) {
    const urls = this.networkUrls.TRON;
    const info = await this.withFailover('tron-info', urls, (url) =>
      this.httpJson(`${url.replace(/\/$/, '')}/wallet/gettransactioninfobyid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: input.txHash }),
      }) as Promise<{ blockNumber?: number; receipt?: { result?: string } }>);
    const events = await this.withFailover('tron-events', urls, (url) =>
      this.httpJson(`${url.replace(/\/$/, '')}/v1/transactions/${encodeURIComponent(input.txHash)}/events`) as Promise<{
      data?: Array<{ event_name?: string; contract_address?: string; result?: { to?: string; value?: string } }>;
      }>);
    const deployment = getTokenDeployment(input.asset, 'TRC20');
    const transfer = events.data?.find((event) =>
      event.event_name === 'Transfer' &&
      event.contract_address?.toLowerCase() === deployment?.contract.toLowerCase() &&
      event.result?.to === input.destination
    );
    if (!deployment || !transfer?.result?.value || info.receipt?.result !== 'SUCCESS' || !Number.isSafeInteger(info.blockNumber)) {
      throw new Error('Verified TRON transfer was not found or is not confirmed');
    }
    const amount = Number(transfer.result.value) / 10 ** deployment.decimals;
    this.assertAmount(amount, input.expectedAmount, input.asset, input.network);
    return { blockNumber: info.blockNumber as number, amount };
  }

  private static async verifySolana(input: {
    txHash: string; asset: string; network: string; destination: string; expectedAmount: number;
  }) {
    const response = await this.rpcWithFailover('solana-transaction', this.networkUrls.SOLANA, 'getTransaction', [
      input.txHash,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    const transaction = response.result as {
      slot?: number;
      meta?: {
        err?: unknown;
        preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number } }>;
        postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number } }>;
      };
    } | null;
    const deployment = getTokenDeployment(input.asset, 'SOLANA');
    const pre = transaction?.meta?.preTokenBalances ?? [];
    const post = transaction?.meta?.postTokenBalances ?? [];
    const amount = post.reduce((total, entry) => {
      if (entry.owner !== input.destination || entry.mint !== deployment?.contract) return total;
      const before = pre.find((candidate) =>
        candidate.owner === entry.owner && candidate.mint === entry.mint
      )?.uiTokenAmount?.uiAmount ?? 0;
      return total + (entry.uiTokenAmount?.uiAmount ?? 0) - before;
    }, 0);
    if (!deployment || !transaction?.slot || transaction.meta?.err || amount <= 0) {
      throw new Error('Verified Solana transfer was not found or is not confirmed');
    }
    this.assertAmount(amount, input.expectedAmount, input.asset, input.network);
    return { blockNumber: transaction.slot, amount };
  }

  private static assertAmount(actual: number, expected: number, asset?: string, network?: string) {
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected)) {
      throw new Error('Verified blockchain amount does not match the deposit quote');
    }
    if (!amountMatchesTolerance(actual, expected, asset ?? 'USDT', network)) {
      throw new Error('Verified blockchain amount does not match the deposit quote');
    }
  }

  private static async rpc(url: string, method: string, params: unknown[]) {
    const body = await this.httpJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    }) as { result?: unknown; error?: { message?: string } };
    if (body.error || body.result === undefined || body.result === null) {
      throw new Error(body.error?.message || 'RPC returned no result');
    }
    return body;
  }

  private static async rpcWithFailover(key: string, urls: readonly string[], method: string, params: unknown[]) {
    return this.withFailover(key, urls, (url) => this.rpc(url, method, params));
  }

  private static async withFailover<T>(key: string, urls: readonly string[], request: (url: string) => Promise<T>): Promise<T> {
    return withRpcFallback(key, urls, request);
  }

  private static async httpJson(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.RPC_TIMEOUT_MS) });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`RPC returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    return response.json() as Promise<unknown>;
  }
}
