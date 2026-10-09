import { DepositSessionNetwork } from '@prisma/client';
import { config } from '../config';
import { getTokenDeployment, TOKEN_DEPLOYMENTS } from '../config/blockchain';
import { BlockchainAdapter, ActiveDepositTarget, BlockRange, DepositObservation } from './blockchain-adapter';
import { RpcEndpointError, withRpcFallback } from './rpc-endpoint-pool';

type RpcResponse = { result?: any; error?: { message?: string } };
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_METHOD = 'a9059cbb';
const RPC_TIMEOUT_MS = 15_000;
const TRON_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const tronAddressHex = (address: string) => {
  if (/^41[0-9a-f]{40}$/i.test(address)) return address.slice(-40).toLowerCase();
  let value = 0n;
  for (const character of address) {
    const digit = TRON_BASE58.indexOf(character);
    if (digit < 0) return address.toLowerCase().replace(/^0x/, '').slice(-40);
    value = value * 58n + BigInt(digit);
  }
  return value.toString(16).padStart(50, '0').slice(-40).toLowerCase();
};

const decimal = (value: bigint, decimals: number) => {
  const text = value.toString().padStart(decimals + 1, '0');
  return `${text.slice(0, -decimals) || '0'}.${text.slice(-decimals).replace(/0+$/, '') || '0'}`;
};
const topicAddress = (address: string) => `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;

abstract class JsonRpcAdapter implements BlockchainAdapter {
  abstract readonly network: DepositSessionNetwork;
  protected abstract readonly urls: readonly string[];
  protected abstract readonly confirmations: bigint;
  abstract observeRange(range: BlockRange, targets: ActiveDepositTarget[]): Promise<DepositObservation[]>;

  async getTip() {
    const result = await this.rpc('eth_blockNumber', []);
    return BigInt(result.result);
  }
  async getSafeTip() {
    const tip = await this.getTip();
    return tip > this.confirmations ? tip - this.confirmations : 0n;
  }
  protected async rpc(method: string, params: unknown[]): Promise<RpcResponse> {
    return withRpcFallback(this.network, this.urls, async (url) => {
      const response = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new RpcEndpointError(`RPC returned HTTP ${response.status}`, {
          statusCode: response.status,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        });
      }
      const body = await response.json() as RpcResponse;
      if (body.error || body.result === undefined || body.result === null) {
        throw new Error(body.error?.message || 'RPC returned no result');
      }
      return body;
    });
  }
}

class EvmAdapter extends JsonRpcAdapter {
  readonly confirmations = 2n;
  constructor(public readonly network: DepositSessionNetwork, private readonly nativeAsset?: string) {
    super();
    this.urls = config.blockchain.evmRpcUrlsByNetwork[network] ?? [];
  }
  protected readonly urls: readonly string[];

  async observeRange(range: BlockRange, targets: ActiveDepositTarget[]) {
    const observations: DepositObservation[] = [];
    const nativeTargets = targets.filter((target) => target.asset.toUpperCase() === this.nativeAsset);
    if (this.nativeAsset && nativeTargets.length) {
      const byAddress = new Map(nativeTargets.map((target) => [target.address.toLowerCase(), target]));
      for (let height = range.from; height <= range.to; height += 1n) {
        const block = (await this.rpc('eth_getBlockByNumber', [`0x${height.toString(16)}`, true])).result;
        for (const [index, tx] of (block?.transactions ?? []).entries()) {
          const target = tx.to && byAddress.get(tx.to.toLowerCase());
          if (!target || BigInt(tx.value || '0x0') <= 0n) continue;
          observations.push({
            eventKey: `${this.network}:${tx.hash}:native`, network: this.network, asset: target.asset,
            transactionHash: tx.hash, eventIndex: index, blockNumber: height, blockHash: block.hash,
            destination: target.address, amount: decimal(BigInt(tx.value), 18), expectedAmount: target.expectedAmount,
            sessionId: target.sessionId, userId: target.userId, metadata: { source: 'block_transactions', native: true },
          });
        }
      }
    }
    const deployments = TOKEN_DEPLOYMENTS.filter((deployment) => deployment.network === this.network);
    for (const deployment of deployments) {
      const matching = targets.filter((target) => target.asset.toUpperCase() === deployment.asset);
      if (!matching.length) continue;
      const byDestination = new Map(matching.map((target) => [topicAddress(target.address).toLowerCase(), target]));
      for (let fromBlock = range.from; fromBlock <= range.to; fromBlock += 50n) {
        const toBlock = fromBlock + 49n < range.to ? fromBlock + 49n : range.to;
        const logs = (await this.rpc('eth_getLogs', [{
          fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}`,
          address: deployment.contract, topics: [TRANSFER_TOPIC, null, matching.map((target) => topicAddress(target.address))],
        }])).result as any[];
        for (const log of logs ?? []) {
          const target = byDestination.get(String(log.topics?.[2] ?? '').toLowerCase());
          if (!target) continue;
          const amount = BigInt(log.data);
          if (amount <= 0n) continue;
          observations.push({
            eventKey: `${this.network}:${log.transactionHash}:${parseInt(log.logIndex, 16)}`,
            network: this.network, asset: target.asset, transactionHash: log.transactionHash,
            eventIndex: parseInt(log.logIndex, 16), blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash,
            destination: target.address, amount: decimal(amount, deployment.decimals), expectedAmount: target.expectedAmount,
            tokenContract: deployment.contract, tokenDecimals: deployment.decimals, sessionId: target.sessionId,
            userId: target.userId, metadata: { source: 'erc20_transfer_log' },
          });
        }
      }
    }
    return observations;
  }
}

class TronAdapter implements BlockchainAdapter {
  readonly network = 'TRC20' as const;
  private readonly urls = config.blockchain.tronRpcUrls;
  async getTip() {
    const block = await this.request('/wallet/getnowblock', {});
    return BigInt(block.block_header?.raw_data?.number ?? 0);
  }
  async getSafeTip() { const tip = await this.getTip(); return tip > 2n ? tip - 2n : 0n; }
  async observeRange(range: BlockRange, targets: ActiveDepositTarget[]) {
    const byAddress = new Map(targets.map((target) => [tronAddressHex(target.address), target]));
    const observations: DepositObservation[] = [];
    for (let height = range.from; height <= range.to; height += 1n) {
      const block = await this.request('/wallet/getblockbynum', { num: Number(height) });
      for (const tx of block.transactions ?? []) {
        const txid = tx.txID;
        const contract = tx.raw_data?.contract?.[0];
        const value = contract?.parameter?.value;
        if (contract?.type === 'TransferContract') {
          const target = byAddress.get(tronAddressHex(String(value?.to_address || '')));
          if (target && target.asset.toUpperCase() === 'TRX') observations.push({
            eventKey: `${this.network}:${txid}:native`, network: this.network, asset: target.asset,
            transactionHash: txid, eventIndex: 0, blockNumber: height, destination: target.address,
            amount: decimal(BigInt(value.amount || 0), 6), expectedAmount: target.expectedAmount,
            sessionId: target.sessionId, userId: target.userId, metadata: { source: 'tron_transfer' },
          });
        }
        if (contract?.type !== 'TriggerSmartContract') continue;
        const data = String(value?.data || '');
        if (!data.toLowerCase().replace(/^0x/, '').startsWith(TRANSFER_METHOD)) continue;
        const calldata = data.replace(/^0x/, '');
        const destinationHex = calldata.slice(8, 72).slice(-40);
        const target = byAddress.get(destinationHex.toLowerCase());
        const deployment = TOKEN_DEPLOYMENTS.find((item) => item.network === 'TRC20' && tronAddressHex(item.contract) === tronAddressHex(String(value?.contract_address || '')));
        if (!target || !deployment) continue;
        const amount = BigInt(`0x${calldata.slice(72, 136)}`);
        if (amount > 0n) observations.push({
          eventKey: `${this.network}:${txid}:0:${destinationHex}`, network: this.network, asset: target.asset,
          transactionHash: txid, eventIndex: 0, blockNumber: height, destination: target.address,
          amount: decimal(amount, deployment.decimals), expectedAmount: target.expectedAmount,
          tokenContract: deployment.contract, tokenDecimals: deployment.decimals, sessionId: target.sessionId,
          userId: target.userId, metadata: { source: 'trc20_transfer_log' },
        });
      }
    }
    return observations;
  }
  private async request(path: string, body?: unknown) {
    return withRpcFallback(this.network, this.urls, async (url) => {
      const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
        method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new RpcEndpointError(`TRON RPC returned HTTP ${response.status}`, {
          statusCode: response.status,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        });
      }
      return await response.json() as any;
    });
  }
}

class SolanaAdapter implements BlockchainAdapter {
  readonly network = 'SOLANA' as const;
  private readonly urls = config.blockchain.solanaRpcUrls;
  async getTip() { return BigInt((await this.rpc('getSlot', [{ commitment: 'finalized' }])).result); }
  async getSafeTip() { return this.getTip(); }
  async observeRange(range: BlockRange, targets: ActiveDepositTarget[]) {
    const observations: DepositObservation[] = [];
    for (let slot = range.from; slot <= range.to; slot += 1n) {
      const block = (await this.rpc('getBlock', [Number(slot), { encoding: 'jsonParsed', transactionDetails: 'full', rewards: false, commitment: 'finalized' }])).result;
      for (const [index, entry] of (block?.transactions ?? []).entries()) {
        const tx = entry.transaction;
        const keys = tx.message.accountKeys ?? [];
        for (const target of targets) {
          const account = keys.findIndex((key: any) => (key.pubkey || key) === target.address);
          if (account < 0) continue;
          const pre = BigInt(entry.meta?.preBalances?.[account] ?? 0); const post = BigInt(entry.meta?.postBalances?.[account] ?? 0);
          const deployment = getTokenDeployment(target.asset, 'SOLANA');
          const token = entry.meta?.postTokenBalances?.find((balance: any) => balance.owner === target.address && balance.mint === deployment?.contract);
          const beforeToken = entry.meta?.preTokenBalances?.find((balance: any) => balance.accountIndex === token?.accountIndex);
          const raw = token ? BigInt(token.uiTokenAmount.amount) - BigInt(beforeToken?.uiTokenAmount.amount ?? 0) : post - pre;
          if (raw <= 0n) continue;
          const decimals = token ? token.uiTokenAmount.decimals : 9;
          observations.push({ eventKey: `SOLANA:${tx.signatures[0]}:${index}:${target.address}`, network: this.network, asset: target.asset,
            transactionHash: tx.signatures[0], eventIndex: index, slot, destination: target.address, amount: decimal(raw, decimals),
            expectedAmount: target.expectedAmount, tokenContract: deployment?.contract, tokenDecimals: deployment?.decimals,
            sessionId: target.sessionId, userId: target.userId, metadata: { source: token ? 'spl_token_balance' : 'solana_lamports' } });
        }
      }
    }
    return observations;
  }
  private async rpc(method: string, params: unknown[]) {
    return withRpcFallback(this.network, this.urls, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }), signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new RpcEndpointError(`Solana RPC returned HTTP ${response.status}`, {
          statusCode: response.status,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        });
      }
      const body = await response.json() as RpcResponse;
      if (body.error || body.result === undefined) throw new Error(body.error?.message || 'Solana RPC returned no result');
      return body;
    });
  }
}

class UtxoAdapter implements BlockchainAdapter {
  private readonly urls: readonly string[];
  constructor(public readonly network: 'BTC' | 'BCH' | 'LTC', private readonly asset: string) {
    this.urls = config.blockchain.utxoRpcUrlsByNetwork[network] ?? [];
  }
  async getTip() {
    return withRpcFallback(this.network, this.urls, async (url) => {
      if (this.isMempoolApi(url)) return BigInt(await this.fetchText(`${url.replace(/\/$/, '')}/blocks/tip/height`));
      return BigInt(await this.callEndpoint(url, 'getblockcount', []));
    });
  }
  async getSafeTip() { const tip = await this.getTip(); return tip > 2n ? tip - 2n : 0n; }
  async observeRange(range: BlockRange, targets: ActiveDepositTarget[]) {
    if (!this.urls.length) throw new Error(`No ${this.network} RPC endpoints configured (${this.network}_RPC_URLS)`);
    const byAddress = new Map(targets.map((target) => [target.address, target]));
    return withRpcFallback(this.network, this.urls, async (url) =>
      this.isMempoolApi(url)
        ? this.observeMempoolRange(url, range, byAddress)
        : this.observeRpcRange(url, range, byAddress),
    );
  }

  private isMempoolApi(url: string) {
    return ['mempool.space', 'blockstream.info'].includes(new URL(url).hostname);
  }

  private async observeRpcRange(
    url: string,
    range: BlockRange,
    byAddress: Map<string, ActiveDepositTarget>,
  ) {
    const result: DepositObservation[] = [];
    for (let height = range.from; height <= range.to; height += 1n) {
      const hash = await this.callEndpoint(url, 'getblockhash', [Number(height)]);
      const block = await this.callEndpoint(url, 'getblock', [hash, 2]);
      for (const tx of block.tx ?? []) {
        for (const [index, output] of (tx.vout ?? []).entries()) {
          const address = output.scriptPubKey?.address;
          const target = address && byAddress.get(address);
          if (!target || target.asset.toUpperCase() !== this.asset || Number(output.value) <= 0) continue;
          result.push({
            eventKey: `${this.network}:${tx.txid}:${index}`,
            network: this.network,
            asset: target.asset,
            transactionHash: tx.txid,
            eventIndex: index,
            blockNumber: height,
            blockHash: hash,
            destination: address,
            amount: String(output.value),
            expectedAmount: target.expectedAmount,
            sessionId: target.sessionId,
            userId: target.userId,
            metadata: { source: 'utxo_vout' },
          });
        }
      }
    }
    return result;
  }

  private async observeMempoolRange(
    base: string,
    range: BlockRange,
    byAddress: Map<string, ActiveDepositTarget>,
  ) {
    const normalizedBase = base.replace(/\/$/, '');
    const result: DepositObservation[] = [];
    for (let height = range.from; height <= range.to; height += 1n) {
      const blockHash = await this.fetchText(`${normalizedBase}/block-height/${height}`);
      const block = await this.fetchJson<{ tx_count: number }>(`${normalizedBase}/block/${blockHash}`);
      for (let startIndex = 0; startIndex < block.tx_count; startIndex += 25) {
        const transactions = await this.fetchJson<Array<{
          txid: string;
          vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
        }>>(`${normalizedBase}/block/${blockHash}/txs/${startIndex}`);
        for (const transaction of transactions) {
          for (const [index, output] of (transaction.vout ?? []).entries()) {
            const address = output.scriptpubkey_address;
            const target = address && byAddress.get(address);
            if (!target || target.asset.toUpperCase() !== this.asset || !Number.isSafeInteger(output.value) || (output.value ?? 0) <= 0) continue;
            result.push({
              eventKey: `${this.network}:${transaction.txid}:${index}`,
              network: this.network,
              asset: target.asset,
              transactionHash: transaction.txid,
              eventIndex: index,
              blockNumber: height,
              blockHash,
              destination: address,
              amount: decimal(BigInt(output.value!), 8),
              expectedAmount: target.expectedAmount,
              sessionId: target.sessionId,
              userId: target.userId,
              metadata: { source: 'mempool_block_vout' },
            });
          }
        }
      }
    }
    return result;
  }

  private async callEndpoint(url: string, method: string, params: unknown[]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '1.0', id: Date.now(), method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`RPC returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (body.error || body.result === undefined || body.result === null) {
      throw new Error(body.error?.message || 'RPC returned no result');
    }
    return body.result as any;
  }

  private async fetchText(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`REST endpoint returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    const value = (await response.text()).trim();
    if (!/^\d+$/.test(value) && !/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error('REST endpoint returned an invalid block value');
    }
    return value;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`REST endpoint returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    return await response.json() as T;
  }
}

type BlockchairStats = { data?: { blocks?: number } };
type BlockchairBlock = { id: number; hash: string };
type BlockchairOutput = {
  transaction_hash: string;
  index: number;
  recipient: string | null;
  value: number;
};
type BlockcypherBlock = {
  hash: string;
  height: number;
  txids?: string[];
  txrefs?: Array<{ tx_hash: string; tx_output_n: number; value: number; address?: string }>;
  txs?: Array<{
    hash: string;
    outputs?: Array<{ addresses?: string[]; value: number }>;
  }>;
};

class RestUtxoAdapter implements BlockchainAdapter {
  readonly network: 'BCH' | 'LTC';
  private readonly urls: readonly string[];

  constructor(network: 'BCH' | 'LTC', private readonly asset: 'BCH' | 'LTC') {
    this.network = network;
    this.urls = config.blockchain.utxoRpcUrlsByNetwork[network] ?? [];
  }

  async getTip() {
    return withRpcFallback(this.network, this.urls, async (base) => {
      const normalizedBase = base.replace(/\/$/, '');
      if (this.isMempoolApi(base)) {
        const height = await this.fetchText(`${normalizedBase}/blocks/tip/height`);
        return BigInt(height);
      }
      if (base.includes('blockchair.com')) {
        const response = await this.fetchJson<BlockchairStats>(`${normalizedBase}/stats`);
        const height = response.data?.blocks;
        if (typeof height !== 'number' || !Number.isInteger(height)) throw new Error('Blockchair returned no block height');
        return BigInt(height);
      }
      const response = await this.fetchJson<{ height?: number }>(normalizedBase);
      if (typeof response.height !== 'number' || !Number.isInteger(response.height)) throw new Error('BlockCypher returned no block height');
      return BigInt(response.height);
    });
  }

  async getSafeTip() {
    const tip = await this.getTip();
    return tip > 2n ? tip - 2n : 0n;
  }

  async observeRange(range: BlockRange, targets: ActiveDepositTarget[]) {
    const byAddress = new Map(targets.map((target) => [target.address, target]));
    return this.withProvider((base) => this.isMempoolApi(base)
      ? this.observeMempoolRange(base, range, byAddress)
      : this.observeExplorerRange(base, range, byAddress),
    );
  }

  private async observeExplorerRange(
    base: string,
    range: BlockRange,
    byAddress: Map<string, ActiveDepositTarget>,
  ) {
    const results: DepositObservation[] = [];
    for (let height = range.from; height <= range.to; height += 1n) {
      if (base.includes('blockchair.com')) {
        const block = await this.fetchJson<{ data?: BlockchairBlock[] }>(
          `${base}/blocks?q=${encodeURIComponent(`id(${height.toString()})`)}`,
        );
        const blockInfo = block.data?.[0];
        if (!blockInfo) continue;
        const outputs = await this.fetchJson<{ data?: BlockchairOutput[] }>(
          `${base}/outputs?q=${encodeURIComponent(`block_id(${height.toString()})`)}&limit=1000`,
        );
        for (const [index, output] of (outputs.data ?? []).entries()) {
          const target = output.recipient ? byAddress.get(output.recipient) : undefined;
          if (!target || target.asset.toUpperCase() !== this.asset || output.value <= 0) continue;
          results.push({
            eventKey: `${this.network}:${output.transaction_hash}:${output.index}`,
            network: this.network,
            asset: target.asset,
            transactionHash: output.transaction_hash,
            eventIndex: output.index ?? index,
            blockNumber: height,
            blockHash: blockInfo.hash,
            destination: target.address,
            amount: decimal(BigInt(output.value), 8),
            expectedAmount: target.expectedAmount,
            sessionId: target.sessionId,
            userId: target.userId,
            metadata: { source: 'blockchair_outputs' },
          });
        }
        continue;
      }

      const block = await this.fetchJson<BlockcypherBlock>(`${base}/blocks/${height.toString()}?txstart=0&limit=500`);
      for (const tx of block.txs ?? []) {
        for (const [index, output] of (tx.outputs ?? []).entries()) {
          const address = output.addresses?.[0];
          const target = address ? byAddress.get(address) : undefined;
          if (!target || target.asset.toUpperCase() !== this.asset || output.value <= 0) continue;
          results.push({
            eventKey: `${this.network}:${tx.hash}:${index}`,
            network: this.network,
            asset: target.asset,
            transactionHash: tx.hash,
            eventIndex: index,
            blockNumber: height,
            blockHash: block.hash,
            destination: target.address,
            amount: decimal(BigInt(output.value), 8),
            expectedAmount: target.expectedAmount,
            sessionId: target.sessionId,
            userId: target.userId,
            metadata: { source: 'blockcypher_outputs' },
          });
        }
      }
    }
    return results;
  }

  private isMempoolApi(url: string) {
    return false;
  }

  private async observeMempoolRange(
    base: string,
    range: BlockRange,
    byAddress: Map<string, ActiveDepositTarget>,
  ) {
    const normalizedBase = base.replace(/\/$/, '');
    const results: DepositObservation[] = [];
    for (let height = range.from; height <= range.to; height += 1n) {
      const blockHash = await this.fetchText(`${normalizedBase}/block-height/${height}`);
      const block = await this.fetchJson<{ tx_count: number }>(`${normalizedBase}/block/${blockHash}`);
      for (let startIndex = 0; startIndex < block.tx_count; startIndex += 25) {
        const transactions = await this.fetchJson<Array<{
          txid: string;
          vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
        }>>(`${normalizedBase}/block/${blockHash}/txs/${startIndex}`);
        for (const transaction of transactions) {
          for (const [index, output] of (transaction.vout ?? []).entries()) {
            const address = output.scriptpubkey_address;
            const target = address && byAddress.get(address);
            if (!target || target.asset.toUpperCase() !== this.asset || !Number.isSafeInteger(output.value) || (output.value ?? 0) <= 0) continue;
            results.push({
              eventKey: `${this.network}:${transaction.txid}:${index}`,
              network: this.network,
              asset: target.asset,
              transactionHash: transaction.txid,
              eventIndex: index,
              blockNumber: height,
              blockHash,
              destination: address,
              amount: decimal(BigInt(output.value!), 8),
              expectedAmount: target.expectedAmount,
              sessionId: target.sessionId,
              userId: target.userId,
              metadata: { source: 'mempool_block_vout' },
            });
          }
        }
      }
    }
    return results;
  }

  private async withProvider<T>(operation: (base: string) => Promise<T>) {
    return withRpcFallback(this.network, this.urls, (base) => operation(base.replace(/\/$/, '')));
  }

  private async fetchText(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`REST endpoint returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    const value = (await response.text()).trim();
    if (!/^\d+$/.test(value)) throw new Error('REST endpoint returned an invalid block height');
    return value;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RpcEndpointError(`REST endpoint returned HTTP ${response.status}`, {
        statusCode: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    return await response.json() as T;
  }
}

export function createBlockchainAdapters(): BlockchainAdapter[] {
  return [
    new UtxoAdapter('BTC', 'BTC'), new RestUtxoAdapter('BCH', 'BCH'), new RestUtxoAdapter('LTC', 'LTC'),
    new EvmAdapter('ERC20', 'ETH'), new EvmAdapter('BEP20', 'BNB'), new EvmAdapter('ARBITRUM_ONE', 'ETH'),
    new EvmAdapter('POLYGON'), new EvmAdapter('BASE'), new EvmAdapter('OPTIMISM'),
    new TronAdapter(), new SolanaAdapter(),
  ];
}
