import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { WalletRepository } from '../repositories/wallet.repository';
import { createCryptoProvider } from '../integrations/crypto/crypto.provider';
import { config } from '../config';
import { SystemSettingsService } from '../services/system-settings.service';
import { Decimal } from '@prisma/client/runtime/library';
import { withdrawalQueue } from '../jobs/queue';
import { convertAssetAmount, INTERNAL_PRIMARY_ASSET_CODES, INTERNAL_SWAP_FEE_RATE, INTERNAL_SUPPORTED_ASSET_CODES, normalizeAssetCode } from '../lib/internal-wallet';
import { TradeService } from './trade.service';
import { AdminWalletService } from './admin-wallet.service';
import { PriceService } from './price.service';
import { NotificationService } from './notification.service';
import { deactivateUnfundedP2POffers, getP2PSpotPrice, isP2PAsset } from './p2p-pricing.service';
import { emitP2POfferBalanceUpdate } from '../websocket/socket.server';

export class WalletService {
  private static async getUsdRatesForAssets(assets: string[]) {
    const normalizedAssets = new Set(assets.map((asset) => asset.trim().toUpperCase()));
    const rates: Record<string, number> = {
      USDT: 1,
      USDC: 1,
    };
    const requiresLiveRates = [...normalizedAssets].some((asset) =>
      asset !== 'USD' && asset !== 'USDT' && asset !== 'USDC' && asset !== 'GRAM'
    );
    if (requiresLiveRates) {
      Object.assign(rates, await PriceService.getUsdPrices());
    }
    return rates;
  }

  static async supportedAssets() {
    const prices = await PriceService.getUsdPrices();
    const liveAssetCodes = INTERNAL_SUPPORTED_ASSET_CODES.filter((code) => code !== 'GRAM');
    return liveAssetCodes.map((code) => ({
      code,
      name: code === 'BTC' ? 'Bitcoin' : code === 'USDT' ? 'Tether' : code === 'ETH' ? 'Ethereum' : code === 'BNB' ? 'BNB' : code === 'SOL' ? 'Solana' : code === 'LTC' ? 'Litecoin' : code === 'TRX' ? 'Tron' : code === 'USDC' ? 'USD Coin' : code === 'BCH' ? 'Bitcoin Cash' : 'Gram',
      symbol: code,
      usdPrice: prices[code],
      network: code === 'USDT' ? 'TRC20' : code === 'ETH' ? 'ERC20' : code === 'USDC' ? 'ERC20' : code === 'TRX' ? 'TRC20' : code === 'SOL' ? 'Solana' : 'mainnet'
    }));
  }

  static async getWallets(userId: string) {
    return WalletRepository.getByUserId(userId);
  }

  static async getBalanceSummary(userId: string) {
    const wallets = await WalletRepository.getByUserId(userId);
    const prices = await this.getUsdRatesForAssets(wallets.map((wallet) => wallet.currency));
    const value = (amount: number, asset: string) => {
      const normalizedAsset = asset.trim().toUpperCase();
      if (normalizedAsset === 'GRAM') return 0;
      if (normalizedAsset === 'USD') return amount;
      const rate = prices[normalizedAsset] ?? (normalizedAsset === 'USDT' || normalizedAsset === 'USDC' ? 1 : undefined);
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        return 0;
      }
      return amount * rate;
    };
    const totals = ['availableBalance', 'pendingBalance', 'frozenBalance'].map((field) =>
      wallets.reduce((sum, wallet) => sum + value(Number(wallet[field as keyof typeof wallet]), wallet.currency), 0));
    return {
      availableBalance: Number(totals[0].toFixed(8)),
      pendingBalance: Number(totals[1].toFixed(8)),
      frozenBalance: Number(totals[2].toFixed(8)),
      totalUsdBalance: Number(totals.reduce((sum, total) => sum + total, 0).toFixed(8)),
      currency: 'USD'
    };
  }

  static async getUsdBalance(userId: string) {
    const wallets = await WalletRepository.getByUserId(userId);
    const prices = await this.getUsdRatesForAssets(wallets.map((wallet) => wallet.currency));
    const value = (amount: number, asset: string) => {
      const normalizedAsset = asset.trim().toUpperCase();
      if (normalizedAsset === 'GRAM') return 0;
      if (normalizedAsset === 'USD') return amount;
      const rate = prices[normalizedAsset] ?? (normalizedAsset === 'USDT' || normalizedAsset === 'USDC' ? 1 : undefined);
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        return 0;
      }
      return amount * rate;
    };
    const availableBalance = wallets.reduce((sum, wallet) => sum + value(Number(wallet.availableBalance), wallet.currency), 0);
    const pendingBalance = wallets.reduce((sum, wallet) => sum + value(Number(wallet.pendingBalance), wallet.currency), 0);
    const frozenBalance = wallets.reduce((sum, wallet) => sum + value(Number(wallet.frozenBalance), wallet.currency), 0);
    return {
      currency: 'USD',
      availableBalance: Number(availableBalance.toFixed(8)),
      pendingBalance: Number(pendingBalance.toFixed(8)),
      frozenBalance: Number(frozenBalance.toFixed(8)),
      totalUsdBalance: Number((availableBalance + pendingBalance + frozenBalance).toFixed(8))
    };
  }

  static async getCheckoutQuote(userId: string, priceUsd: number) {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error('Product price must be greater than zero');
    const wallets = await WalletRepository.getByUserId(userId);
    const prices = await this.getUsdRatesForAssets(wallets.map((wallet) => wallet.currency));
    const usdtBalance = wallets
      .filter((wallet) => wallet.currency === 'USDT')
      .reduce((sum, wallet) => sum + Number(wallet.availableBalance), 0);
    const volatile = wallets
      .filter((wallet) => wallet.currency !== 'USDT' && wallet.currency !== 'USD')
      .map((wallet) => {
        const normalizedCurrency = wallet.currency.trim().toUpperCase();
        if (normalizedCurrency === 'GRAM') return null;
        const rate = prices[normalizedCurrency] ?? (normalizedCurrency === 'USDT' || normalizedCurrency === 'USDC' ? 1 : undefined);
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
          return null;
        }
        return {
          currency: wallet.currency,
          balance: Number(wallet.availableBalance),
          usdValue: Number(wallet.availableBalance) * rate,
          rate
        };
      })
      .filter((asset): asset is { currency: string; balance: number; usdValue: number; rate: number } => asset !== null && asset.rate > 0 && asset.balance > 0)
      .sort((left, right) => right.usdValue - left.usdValue);
    const volatileUsdBalance = volatile.reduce((sum, asset) => sum + asset.usdValue, 0);
    const totalUsdBalance = usdtBalance + volatileUsdBalance;
    const shortfallUsd = Math.max(0, priceUsd - usdtBalance);
    const conversionAsset = volatile[0];
    const netRate = conversionAsset ? conversionAsset.rate * (1 - INTERNAL_SWAP_FEE_RATE) : 0;

    return {
      priceUsd,
      usdtBalance,
      totalUsdBalance,
      shortfallUsd,
      canAutoConvert: shortfallUsd > 0 && Boolean(conversionAsset) && conversionAsset.usdValue * (1 - INTERNAL_SWAP_FEE_RATE) >= shortfallUsd,
      conversionAsset: conversionAsset?.currency ?? null,
      conversionRate: conversionAsset?.rate ?? null,
      conversionAmount: conversionAsset && netRate > 0 ? shortfallUsd / netRate : null,
      feePercent: INTERNAL_SWAP_FEE_RATE * 100
    };
  }

  static async getPortfolioSummary(userId: string) {
    const wallets = await WalletRepository.getByUserId(userId);
    const prices = await this.getUsdRatesForAssets(wallets.map((wallet) => wallet.currency));
    const assets = [];
    for (const wallet of wallets) {
      const totalBalance = Number(wallet.availableBalance) + Number(wallet.pendingBalance) + Number(wallet.frozenBalance);
      const normalizedCurrency = wallet.currency.trim().toUpperCase();
      if (normalizedCurrency === 'GRAM') continue;
      const rate = normalizedCurrency === 'USD'
        ? 1
        : prices[normalizedCurrency] ?? (normalizedCurrency === 'USDT' || normalizedCurrency === 'USDC' ? 1 : undefined);
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        continue;
      }
      const usdValue = totalBalance * rate;
      assets.push({ id: wallet.id, currency: wallet.currency, walletType: wallet.walletType, availableBalance: Number(wallet.availableBalance), pendingBalance: Number(wallet.pendingBalance), frozenBalance: Number(wallet.frozenBalance), totalBalance, usdValue, isPrimary: wallet.isPrimary, network: wallet.network || null });
    }
    const totalUsdBalance = assets.reduce((sum, asset) => sum + asset.usdValue, 0);
    return {
      totalUsdBalance: Number(totalUsdBalance.toFixed(8)),
      assets: assets.map((asset) => ({
        ...asset,
        usdValue: Number(asset.usdValue.toFixed(8))
      }))
    };
  }

  static async getTransactionHistory(userId: string, currency?: string) {
    const entries = await WalletRepository.getLedgerHistory(userId, currency);
    return entries.map((entry) => {
      const type = entry.type === 'DEPOSIT'
        ? 'DEPOSIT'
        : entry.type === 'PURCHASE'
          ? 'ORDER_PAYMENT'
        : entry.type === 'WITHDRAWAL'
          ? 'WITHDRAW'
          : entry.type === 'REFUND' || entry.type === 'ESCROW_REFUND'
            ? 'SYSTEM_REFUND'
            : entry.type === 'SWAP'
              ? 'INTERNAL_TRANSFER'
              : entry.type === 'SALE'
                ? 'TRADE_SELL'
                : 'TRADE_BUY';
      const status = type === 'SYSTEM_REFUND' || entry.status === 'REFUNDED'
        ? 'REFUNDED'
        : entry.status;

      return { ...entry, amount: Number(entry.amount), type, status };
    });
  }

  static async lockFundsInEscrow(tradeId: string) {
    return TradeService.lockFundsInEscrow(tradeId);
  }

  static async initDeposit(userId: string, currency: string, network?: string) {
    const wallet = await WalletRepository.getOrCreate(userId, currency);

    const existingAddress = await prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, currency, network, isActive: true }
    });

    let addressStr = existingAddress?.address;

    if (!addressStr) {
      const activeAdminWallet = await AdminWalletService.getActiveAddress(currency, network || 'mainnet');
      if (activeAdminWallet) addressStr = activeAdminWallet.address;
    }

    if (!addressStr) {
      const cryptoProvider = createCryptoProvider(config.crypto.provider);
      const result = await cryptoProvider.createDepositAddress(currency, network, `W-${wallet.id}`);
      const newAddress = await WalletRepository.createAddress(wallet.id, currency, network || 'mainnet', result.address);
      addressStr = newAddress.address;
    }

    const deposit = await prisma.deposit.create({
      data: {
        walletId: wallet.id,
        currency,
        network,
        depositAddress: addressStr,
        status: 'WAITING'
      }
    });

    return deposit;
  }

  static async requestWithdrawal(userId: string, data: { currency: string, network?: string, amount: number, destinationAddress: string }) {
    const normalizedCurrency = normalizeAssetCode(data.currency);
    const wallet = await prisma.wallet.findUnique({ where: { userId_currency: { userId, currency: normalizedCurrency } } });
    if (!wallet) throw new Error('Wallet not found');

    const feePercent = await SystemSettingsService.getSetting('withdrawal_fee_percent', 1);
    const feeFixed = await SystemSettingsService.getSetting('withdrawal_fee_fixed', 0);
    const p2pSpotPrice = isP2PAsset(normalizedCurrency)
      ? await getP2PSpotPrice(normalizedCurrency)
      : null;

    const amountDec = new Decimal(data.amount);
    const fee = amountDec.mul(feePercent).div(100).add(feeFixed);
    const netAmount = amountDec.sub(fee);
    const totalDebit = amountDec.add(fee);

    if (netAmount.lte(0)) throw new Error('Amount too small to cover fees');

    const withdrawal = await prisma.$transaction(async (tx) => {
      const debitedWallet = await WalletRepository.deductFromAvailable(tx, wallet.id, totalDebit, normalizedCurrency);

      if (p2pSpotPrice) {
        await deactivateUnfundedP2POffers(
          tx,
          userId,
          normalizedCurrency,
          new Prisma.Decimal(debitedWallet.availableBalance.toString()),
          p2pSpotPrice,
        );
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          currency: normalizedCurrency,
          network: data.network,
          amount: totalDebit,
          fee,
          netAmount,
          destinationAddress: data.destinationAddress,
          status: 'PENDING'
        }
      });

      await WalletRepository.createLedgerEntry(tx, {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amount: totalDebit,
        currency: normalizedCurrency,
        direction: 'DEBIT',
        status: 'PENDING',
        referenceId: withdrawal.id,
        description: 'Withdrawal request'
      });

      await withdrawalQueue.add('process', { withdrawalId: withdrawal.id });

      return withdrawal;
    });
    await NotificationService.createNotification({
      userId, type: 'WALLET_TRANSACTION', title: 'Withdrawal requested',
      message: `${normalizedCurrency} withdrawal submitted for processing.`,
      data: { withdrawalId: withdrawal.id, currency: normalizedCurrency },
      link: '/dashboard/wallet',
    });
    if (p2pSpotPrice) emitP2POfferBalanceUpdate(userId, normalizedCurrency);
    return withdrawal;
  }

  static async swapInternalAssets(userId: string, data: { fromCurrency: string; toCurrency: string; amount: number }) {
    const quote = await this.createSwapQuote(userId, data);
    return this.confirmSwapQuote(userId, quote.swapId);
  }

  static async createSwapQuote(userId: string, data: { fromCurrency: string; toCurrency: string; amount: number }) {
    const fromCurrency = normalizeAssetCode(data.fromCurrency);
    const toCurrency = normalizeAssetCode(data.toCurrency);
    if (fromCurrency === toCurrency) throw new Error('From and to currencies must be different');
    if (!INTERNAL_SUPPORTED_ASSET_CODES.includes(fromCurrency) || !INTERNAL_SUPPORTED_ASSET_CODES.includes(toCurrency)) {
      throw new Error('Unsupported internal asset');
    }

    // Wallet.currency is the Currency.code foreign key in this schema, so resolve
    // client codes against the master table before querying user wallets.
    const [fromCurrencyRecord, toCurrencyRecord] = await Promise.all([
      prisma.currency.findUnique({ where: { code: fromCurrency } }),
      prisma.currency.findUnique({ where: { code: toCurrency } })
    ]);
    if (!fromCurrencyRecord) throw new Error(`Currency not found for ${fromCurrency}`);
    if (!toCurrencyRecord) throw new Error(`Currency not found for ${toCurrency}`);

    const [sourceWallet, targetWallet] = await Promise.all([
      WalletRepository.getOrCreate(userId, fromCurrencyRecord.code),
      WalletRepository.getOrCreate(userId, toCurrencyRecord.code)
    ]);

    const amountDec = new Decimal(data.amount);
    if (amountDec.lte(0)) throw new Error('Swap amount must be greater than zero');
    const [fromRate, toRate] = await Promise.all([
      PriceService.getUsdPriceDecimal(fromCurrency),
      PriceService.getUsdPriceDecimal(toCurrency)
    ]);
    const feeAmount = amountDec.mul(INTERNAL_SWAP_FEE_RATE);
    const receivedAmount = amountDec.mul(fromRate).mul(new Decimal(1).sub(INTERNAL_SWAP_FEE_RATE)).div(toRate);
    const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const swap = await prisma.$transaction(async (tx) => {
      const created = await tx.swapTransaction.create({
        data: {
          userId, fromCurrency, toCurrency, amount: amountDec, expectedAmount: receivedAmount, feeAmount,
          lockedFromRate: fromRate, lockedToRate: toRate, quoteExpiresAt,
          status: 'PENDING', availableAt: quoteExpiresAt
        }
      });
      await WalletRepository.createLedgerEntry(tx, {
        walletId: sourceWallet.id,
        type: 'SWAP',
        amount: amountDec,
        currency: fromCurrency,
        direction: 'DEBIT',
        status: 'PENDING',
        referenceId: created.id,
        description: `Swap initiated: ${fromCurrency} to ${toCurrency}`
      });
      return created;
    });
    return {
      swapId: swap.id, status: swap.status, fromAsset: fromCurrency, toAsset: toCurrency,
      amount: Number(amountDec), receivedAmount: Number(receivedAmount), feeAmount: Number(feeAmount),
      feePercent: INTERNAL_SWAP_FEE_RATE * 100, rate: Number(fromRate.div(toRate)), expiresAt: quoteExpiresAt
    };
  }

  static async confirmSwapQuote(userId: string, swapId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const swap = await tx.swapTransaction.findFirst({ where: { id: swapId, userId } });
      if (!swap || swap.status !== 'PENDING') throw new Error('Swap quote is no longer available');
      if (!swap.quoteExpiresAt || swap.quoteExpiresAt.getTime() <= Date.now()) {
        await tx.swapTransaction.update({ where: { id: swap.id }, data: { status: 'CANCELLED' } });
        await tx.ledgerEntry.updateMany({
          where: { referenceId: swap.id, type: 'SWAP', status: 'PENDING' },
          data: { status: 'CANCELLED', completedAt: new Date() }
        });
        throw new Error('Swap quote expired; request a new live quote');
      }
      if (!swap.lockedFromRate || !swap.lockedToRate) throw new Error('Swap quote has no locked exchange rate');
      const sourceWallet = await tx.wallet.findUnique({ where: { userId_currency: { userId, currency: swap.fromCurrency } } });
      const targetWallet = await tx.wallet.findUnique({ where: { userId_currency: { userId, currency: swap.toCurrency } } });
      if (!sourceWallet || !targetWallet) throw new Error('Swap wallet not found');
      const amountDec = new Decimal(swap.amount.toString());
      const receivedAmount = amountDec.mul(swap.lockedFromRate.toString()).mul(new Decimal(1).sub(INTERNAL_SWAP_FEE_RATE)).div(swap.lockedToRate.toString());
      const feeAmount = amountDec.mul(INTERNAL_SWAP_FEE_RATE);
      const claimed = await tx.swapTransaction.updateMany({
        where: { id: swap.id, userId, status: 'PENDING', quoteExpiresAt: { gt: new Date() } },
        data: { status: 'COMPLETED', expectedAmount: receivedAmount, feeAmount, completedAt: new Date() }
      });
      if (claimed.count !== 1) throw new Error('Swap quote expired or was already confirmed');
      await WalletRepository.deductFromAvailable(tx, sourceWallet.id, amountDec, swap.fromCurrency);
      await WalletRepository.addToAvailable(tx, targetWallet.id, receivedAmount, swap.toCurrency);
      const sourceLedger = await tx.ledgerEntry.updateMany({
        where: { referenceId: swap.id, walletId: sourceWallet.id, type: 'SWAP', status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          amount: amountDec,
          description: `Converted at locked rate ${swap.lockedFromRate} ${swap.fromCurrency} / USD`
        }
      });
      if (sourceLedger.count === 0) {
        await WalletRepository.createLedgerEntry(tx, {
          walletId: sourceWallet.id, type: 'SWAP', amount: amountDec, currency: swap.fromCurrency,
          direction: 'DEBIT', status: 'COMPLETED', referenceId: swap.id,
          description: `Converted at locked rate ${swap.lockedFromRate} ${swap.fromCurrency} / USD`
        });
      }
      await WalletRepository.createLedgerEntry(tx, {
        walletId: targetWallet.id, type: 'SWAP', amount: receivedAmount, currency: swap.toCurrency,
        direction: 'CREDIT', status: 'COMPLETED', referenceId: swap.id,
        description: `Received at locked rate ${swap.lockedToRate} ${swap.toCurrency} / USD`
      });
      return { swapId: swap.id, status: 'COMPLETED', fromAsset: swap.fromCurrency, toAsset: swap.toCurrency, amount: Number(amountDec), receivedAmount: Number(receivedAmount), feeAmount: Number(feeAmount), feePercent: INTERNAL_SWAP_FEE_RATE * 100, rate: Number(new Decimal(swap.lockedFromRate.toString()).div(swap.lockedToRate.toString())) };
    });
    await NotificationService.createNotification({
      userId, type: 'WALLET_TRANSACTION', title: 'Wallet swap completed',
      message: `${result.amount} ${result.fromAsset} converted to ${result.receivedAmount} ${result.toAsset}.`,
      data: result, link: '/dashboard/wallet',
    });
    return result;
  }

  static async settleInternalTrade({ sourceUserId, targetUserId, currency = 'USD', amount, tx }: { sourceUserId: string; targetUserId: string; currency?: string; amount: number; tx?: any }) {
    const normalizedCurrency = normalizeAssetCode(currency) || 'USD';
    const sourceWallet = await WalletRepository.getOrCreate(sourceUserId, normalizedCurrency);
    const targetWallet = await WalletRepository.getOrCreate(targetUserId, normalizedCurrency);

    const amountDec = new Decimal(amount);
    if (amountDec.lte(0)) throw new Error('Settlement amount must be greater than zero');

    const runTransaction = async (client: any) => {
      await WalletRepository.deductFromAvailable(client, sourceWallet.id, amountDec, normalizedCurrency);
      await WalletRepository.addToAvailable(client, targetWallet.id, amountDec, normalizedCurrency);

      await WalletRepository.createLedgerEntry(client, {
        walletId: sourceWallet.id,
        type: 'ESCROW_RELEASE',
        amount: amountDec,
        currency: normalizedCurrency,
        direction: 'DEBIT',
        status: 'COMPLETED',
        description: 'Internal trade settlement released to counterparty'
      });

      await WalletRepository.createLedgerEntry(client, {
        walletId: targetWallet.id,
        type: 'ESCROW_RELEASE',
        amount: amountDec,
        currency: normalizedCurrency,
        direction: 'CREDIT',
        status: 'COMPLETED',
        description: 'Internal trade settlement received'
      });

      return {
        sourceUserId,
        targetUserId,
        currency: normalizedCurrency,
        amount: Number(amountDec)
      };
    };

    if (tx) return runTransaction(tx);
    return prisma.$transaction(async (client) => runTransaction(client));
  }
}
