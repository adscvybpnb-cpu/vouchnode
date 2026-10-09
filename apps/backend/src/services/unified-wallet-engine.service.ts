import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base58check, bech32 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { Prisma, DepositSessionNetwork } from '@prisma/client';
import { computeAddress, getBytes, hexlify, keccak256, SigningKey } from 'ethers';
import dotenv from 'dotenv';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { WalletRepository } from '../repositories/wallet.repository';
import { isSupportedAssetNetwork } from '../config/blockchain';
import { normalizeCryptoAmount } from '../utils/crypto-amount';

const backendEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: backendEnvPath, override: true });

const DEPOSIT_SESSION_DURATION_SECONDS = 60 * 60;
const FIRST_DEPOSIT_INDEX = 0;
const COUNTER_LOCK_KEY = 0x47494654464c4f57n;
const MAINTENANCE_MESSAGE = 'This payment network is undergoing maintenance, please try another one';

type Asset = 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'LTC' | 'BCH' | 'TRX' | 'USDT' | 'USDC';
const STATIC_POOL_ASSETS = new Set<Asset>(['BTC', 'SOL', 'BCH', 'LTC', 'TRX']);
type DerivedDeposit = {
  address: string;
  derivationPath: string;
  index: number;
};

type MasterXpubKey =
  | 'EVM_MASTER_XPUB'
  | 'TRON_MASTER_XPUB'
  | 'BTC_MASTER_XPUB'
  | 'LTC_MASTER_XPUB'
  | 'BCH_MASTER_XPUB'
  | 'SOLANA_MASTER_XPUB';

const NETWORK_XPUB: Partial<Record<DepositSessionNetwork, MasterXpubKey>> = {
  BEP20: 'EVM_MASTER_XPUB',
  ERC20: 'EVM_MASTER_XPUB',
  POLYGON: 'EVM_MASTER_XPUB',
  ARBITRUM_ONE: 'EVM_MASTER_XPUB',
  BASE: 'EVM_MASTER_XPUB',
  OPTIMISM: 'EVM_MASTER_XPUB',
  TRC20: 'TRON_MASTER_XPUB',
  BTC: 'BTC_MASTER_XPUB',
  LTC: 'LTC_MASTER_XPUB',
  BCH: 'BCH_MASTER_XPUB',
  SOLANA: 'SOLANA_MASTER_XPUB'
};

const STABLECOIN_NETWORKS = new Set<DepositSessionNetwork>([
  'TRC20',
  'BEP20',
  'ERC20',
  'POLYGON',
  'ARBITRUM_ONE',
  'BASE',
  'OPTIMISM',
  'SOLANA'
]);

const normalizeAsset = (asset: string): Asset => {
  const value = asset.trim().toUpperCase();
  if (!['BTC', 'ETH', 'BNB', 'SOL', 'LTC', 'BCH', 'TRX', 'USDT', 'USDC'].includes(value)) {
    throw new Error(`Unsupported deposit asset: ${asset}`);
  }
  return value as Asset;
};

const normalizeNetwork = (network: string): DepositSessionNetwork => {
  const value = network.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const aliases: Record<string, DepositSessionNetwork> = {
    TRC20: 'TRC20',
    TRC_20: 'TRC20',
    BEP20: 'BEP20',
    BEP_20: 'BEP20',
    BSC: 'BEP20',
    ERC20: 'ERC20',
    ERC_20: 'ERC20',
    ETHEREUM: 'ERC20',
    ARBITRUM: 'ARBITRUM_ONE',
    ARBITRUMONE: 'ARBITRUM_ONE',
    ARBITRUM_ONE: 'ARBITRUM_ONE',
    SOL: 'SOLANA',
    SOLANA: 'SOLANA',
    TRX: 'TRC20',
    POLYGON: 'POLYGON',
    BASE: 'BASE',
    OPTIMISM: 'OPTIMISM',
    BTC: 'BTC',
    BCH: 'BCH',
    LTC: 'LTC'
  };
  const normalized = aliases[value];
  if (!normalized) throw new Error(`Unsupported deposit network: ${network}`);
  return normalized;
};

const hash160 = (value: Uint8Array) => ripemd160(sha256(value));

const encodeBase58Check = (payload: Uint8Array) => base58check(sha256).encode(payload);

const encodeP2pkh = (publicKey: Uint8Array, version: number) =>
  encodeBase58Check(new Uint8Array([version, ...hash160(publicKey)]));

const encodeSegwit = (publicKey: Uint8Array, hrp: string) =>
  bech32.encode(hrp, bech32.toWords(hash160(publicKey)), 90);

export class UnifiedWalletEngineService {
  static async createDepositSession(
    userId: string,
    asset: string,
    network: string,
    amount = 0,
    orderId?: string,
    quote?: { usdAmount: Prisma.Decimal; exchangeRate: Prisma.Decimal }
  ) {
    if (!userId.trim()) throw new Error('A user ID is required.');
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Deposit amount must be a non-negative number.');

    const normalizedAsset = normalizeAsset(asset);
    const normalizedNetwork = normalizeNetwork(network);
    this.assertAssetNetwork(normalizedAsset, normalizedNetwork);
    const safeAmount = Number(normalizeCryptoAmount(amount, normalizedAsset, normalizedNetwork).toString());

    if (STATIC_POOL_ASSETS.has(normalizedAsset)) {
      return this.allocateStaticAddress(
        userId,
        normalizedAsset,
        normalizedNetwork,
        safeAmount,
        orderId,
        quote
      );
    }

    return this.createCryptoDeposit(userId, normalizedAsset, normalizedNetwork, safeAmount, orderId, quote);
  }

  private static async allocateStaticAddress(
    userId: string,
    asset: Asset,
    network: DepositSessionNetwork,
    amount: number,
    orderId?: string,
    quote?: { usdAmount: Prisma.Decimal; exchangeRate: Prisma.Decimal }
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEPOSIT_SESSION_DURATION_SECONDS * 1000);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${COUNTER_LOCK_KEY})`;

      const available = await tx.staticAddressPool.findFirst({
        where: { asset, status: 'AVAILABLE' },
        orderBy: { id: 'asc' }
      });
      if (!available) {
        throw new Error(`No available static ${asset} deposit address.`);
      }

      const claimed = await tx.staticAddressPool.updateMany({
        where: { id: available.id, asset, status: 'AVAILABLE' },
        data: { status: 'BUSY', orderId: orderId ?? null, expiresAt }
      });
      if (claimed.count !== 1) {
        throw new Error('Unable to reserve a static deposit address.');
      }

      const session = await tx.depositSession.create({
        data: {
          userId,
          orderId: orderId ?? null,
          currency: asset,
          assignedAddress: available.address,
          network,
          amount: new Prisma.Decimal(amount),
          usdAmount: quote?.usdAmount ?? new Prisma.Decimal(amount),
          exchangeRate: quote?.exchangeRate ?? new Prisma.Decimal(1),
          status: 'PENDING',
          createdAt: now,
          expiresAt
        }
      });
      const wallet = await WalletRepository.getOrCreate(userId, asset, tx);
      await WalletRepository.createLedgerEntry(tx, {
        walletId: wallet.id,
        type: orderId ? 'PURCHASE' : 'DEPOSIT',
        amount: new Prisma.Decimal(amount),
        currency: asset,
        direction: orderId ? 'DEBIT' : 'CREDIT',
        status: 'PENDING',
        referenceId: session.id,
        description: orderId ? `Pending direct invoice order payment (${network})` : `Pending ${network} deposit`
      });

      return {
        ...session,
        id: session.id,
        address: available.address,
        walletIndex: 0
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async releaseStaticAddress(id: string) {
    return prisma.staticAddressPool.updateMany({
      where: { id, status: 'BUSY' },
      data: { status: 'AVAILABLE', orderId: null, expiresAt: null }
    });
  }

  static async releaseExpiredStaticAddresses(now = new Date()) {
    return prisma.staticAddressPool.updateMany({
      where: { status: 'BUSY', expiresAt: { lte: now } },
      data: { status: 'AVAILABLE', orderId: null, expiresAt: null }
    });
  }

  private static async createCryptoDeposit(
    userId: string,
    asset: Asset,
    network: DepositSessionNetwork,
    amount: number,
    orderId?: string,
    quote?: { usdAmount: Prisma.Decimal; exchangeRate: Prisma.Decimal }
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEPOSIT_SESSION_DURATION_SECONDS * 1000);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${COUNTER_LOCK_KEY})`;

          const aggregate = await tx.cryptoDeposit.aggregate({
            where: { network },
            _max: { walletIndex: true }
          });
          const walletIndex = Math.max(
            aggregate._max.walletIndex === null
              ? FIRST_DEPOSIT_INDEX
              : aggregate._max.walletIndex + 1,
            FIRST_DEPOSIT_INDEX
          );
          const derived = this.deriveDepositAddress(asset, network, walletIndex);

          const cryptoDeposit = await tx.cryptoDeposit.create({
            data: {
              userId,
              address: derived.address,
              walletIndex,
              currency: asset,
              network,
              amount: new Prisma.Decimal(amount),
              status: 'PENDING',
              createdAt: now,
              expiresAt
            }
          });
          const session = await tx.depositSession.create({
            data: {
              userId,
              orderId: orderId ?? null,
              currency: asset,
              assignedAddress: derived.address,
              network,
              amount: new Prisma.Decimal(amount),
              usdAmount: quote?.usdAmount ?? new Prisma.Decimal(amount),
              exchangeRate: quote?.exchangeRate ?? new Prisma.Decimal(1),
              status: 'PENDING',
              createdAt: now,
              expiresAt
            }
          });
          const wallet = await WalletRepository.getOrCreate(userId, asset, tx);
          await WalletRepository.createLedgerEntry(tx, {
            walletId: wallet.id,
            type: orderId ? 'PURCHASE' : 'DEPOSIT',
            amount: new Prisma.Decimal(amount),
            currency: asset,
            direction: orderId ? 'DEBIT' : 'CREDIT',
            status: 'PENDING',
            referenceId: session.id,
            description: orderId ? `Pending direct invoice order payment (${network})` : `Pending ${network} deposit`
          });

          return {
            ...session,
            address: cryptoDeposit.address,
            walletIndex: cryptoDeposit.walletIndex
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Unable to allocate a deposit address. Please try again.');
  }

  private static assertAssetNetwork(asset: Asset, network: DepositSessionNetwork) {
    if (!isSupportedAssetNetwork(asset, network)) {
      throw new Error(`${asset} is not supported on the ${network} network.`);
    }
    if (asset === 'BTC' && network !== 'BTC') throw new Error('BTC deposits require the BTC network.');
    if (asset === 'BCH' && network !== 'BCH') throw new Error('BCH deposits require the BCH network.');
    if (asset === 'LTC' && network !== 'LTC') throw new Error('LTC deposits require the LTC network.');
    if (asset === 'SOL' && network !== 'SOLANA') throw new Error('SOL deposits require the Solana network.');
    if (asset === 'TRX' && network !== 'TRC20') throw new Error('TRX deposits require the TRC20 network.');
    if (asset === 'ETH' && network !== 'ERC20') throw new Error('ETH deposits require the ERC20 network.');
    if (asset === 'BNB' && network !== 'BEP20') throw new Error('BNB deposits require the BEP20 network.');
    if ((asset === 'USDT' || asset === 'USDC') &&
      (!STABLECOIN_NETWORKS.has(network) || !NETWORK_XPUB[network])) {
      throw new Error(`${asset} is not supported on the ${network} network.`);
    }
  }

  static deriveDepositAddress(asset: Asset, network: DepositSessionNetwork, index: number): DerivedDeposit {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error('Invalid wallet derivation index.');
    }

    switch (network) {
      case 'BEP20':
      case 'ERC20':
      case 'POLYGON':
      case 'ARBITRUM_ONE':
      case 'BASE':
      case 'OPTIMISM':
        return this.deriveEvmAddress(network, index);
      case 'TRC20':
        return this.deriveTronAddress(index);
      case 'BTC':
        return this.deriveBitcoinAddress(index);
      case 'LTC':
        return this.deriveLitecoinAddress(index);
      case 'BCH':
        return this.deriveBitcoinCashAddress(index);
      case 'SOLANA':
        throw new Error(MAINTENANCE_MESSAGE);
      default:
        throw new Error(`Unsupported payment network: ${network}`);
    }
  }

  private static deriveEvmAddress(network: DepositSessionNetwork, index: number): DerivedDeposit {
    const node = this.accountXpub('EVM_MASTER_XPUB', network);
    const relativePath = `0/${index}`;
    logger.debug({ index, relativePath, fullPath: `m/44'/60'/0'/${relativePath}` }, 'Deriving EVM address');
    return {
      address: computeAddress(hexlify(this.publicKey(node, index))),
      derivationPath: relativePath,
      index
    };
  }

  private static deriveTronAddress(index: number): DerivedDeposit {
    const node = this.accountXpub('TRON_MASTER_XPUB', 'TRC20');
    const relativePath = `0/${index}`;
    const compressedKey = this.publicKey(node, index);
    const publicKey = getBytes(SigningKey.computePublicKey(hexlify(compressedKey), false));
    const address = encodeBase58Check(new Uint8Array([0x41, ...getBytes(keccak256(publicKey.slice(1))).slice(-20)]));
    return { address, derivationPath: relativePath, index };
  }

  private static deriveBitcoinAddress(index: number): DerivedDeposit {
    const node = this.accountXpub('BTC_MASTER_XPUB', 'BTC');
    const relativePath = `0/${index}`;
    return { address: encodeSegwit(this.publicKey(node, index), 'bc'), derivationPath: relativePath, index };
  }

  private static deriveLitecoinAddress(index: number): DerivedDeposit {
    const node = this.accountXpub('LTC_MASTER_XPUB', 'LTC');
    const relativePath = `0/${index}`;
    return { address: encodeSegwit(this.publicKey(node, index), 'ltc'), derivationPath: relativePath, index };
  }

  private static deriveBitcoinCashAddress(index: number): DerivedDeposit {
    const node = this.accountXpub('BCH_MASTER_XPUB', 'BCH');
    const relativePath = `0/${index}`;
    return { address: encodeP2pkh(this.publicKey(node, index), 0x00), derivationPath: relativePath, index };
  }

  private static publicKey(node: HDKey, index: number): Uint8Array {
    const publicKey = node.deriveChild(0).deriveChild(index).publicKey;
    if (!publicKey) {
      throw new Error(`Unable to derive public key at index ${index}.`);
    }
    return publicKey;
  }

  private static accountXpub(key: MasterXpubKey, network: DepositSessionNetwork): HDKey {
    const xpub = env[key].trim();
    if (!xpub) {
      throw new Error(MAINTENANCE_MESSAGE);
    }
    const version = this.extendedPublicKeyVersion(xpub);
    if (!version) {
      throw new Error(`${key} is invalid.`);
    }

    try {
      const node = HDKey.fromExtendedKey(xpub, version);
      if (node.depth !== 3) {
        throw new Error(`${key} must be an account-level extended public key.`);
      }
      return node;
    } catch (error) {
      if (error instanceof Error && error.message.includes('must be an account-level')) throw error;
      throw new Error(`${key} is invalid for ${network}.`, { cause: error });
    }
  }

  private static extendedPublicKeyVersion(xpub: string): { private: number; public: number } | null {
    const versions: Record<string, { private: number; public: number }> = {
      xpub: { private: 0x0488ade4, public: 0x0488b21e },
      ypub: { private: 0x049d7878, public: 0x049d7cb2 },
      zpub: { private: 0x04b2430c, public: 0x04b24746 },
      Ypub: { private: 0x0295b005, public: 0x0295b43f },
      Zpub: { private: 0x02aa7a99, public: 0x02aa7ed3 },
      Ltub: { private: 0x019d9cfe, public: 0x019da462 },
    };

    const prefix = Object.keys(versions).find((candidate) => xpub.startsWith(candidate));
    return prefix ? versions[prefix] : null;
  }
}
