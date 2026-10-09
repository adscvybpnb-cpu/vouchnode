import { apiClient } from './api.client';
import type { Wallet, PaginatedResponse, LedgerEntry, Deposit, Withdrawal, PortfolioSummary } from '../types/api.types';

export type WalletBalanceSummary = {
  availableBalance: number;
  pendingBalance: number;
  frozenBalance: number;
  totalUsdBalance: number;
  currency: string;
};

export type CheckoutQuote = {
  priceUsd: number;
  usdtBalance: number;
  totalUsdBalance: number;
  shortfallUsd: number;
  canAutoConvert: boolean;
  conversionAsset: string | null;
  conversionRate: number | null;
  conversionAmount: number | null;
  feePercent: number;
};

type SwapRequest = {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
};

export type DepositNetwork = 'BTC' | 'BCH' | 'LTC' | 'TRC20' | 'BEP20' | 'ERC20' | 'POLYGON' | 'ARBITRUM_ONE' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'TON';

export type UnifiedDepositSession = {
  id: string;
  assignedAddress: string;
  network: DepositNetwork;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  amount: number;
  remainingSeconds: number;
};

export const walletService = {
  async generateDeposit(currency: string, network: DepositNetwork, amount = 0) {
    const res = await apiClient.post<{
      id: string;
      assignedAddress: string;
      network: DepositNetwork;
      status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
      amount: number;
      remainingSeconds: number;
    }>('/finance/deposit/generate', { asset: currency.trim().toUpperCase(), network, amount });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async createDepositSession(currency: string, network: DepositNetwork, amount = 0) {
    return this.generateDeposit(currency, network, amount);
  },
  async getWallet() {
    const res = await apiClient.get<WalletBalanceSummary>('/wallet');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getUsdBalance() {
    const res = await apiClient.get<WalletBalanceSummary>('/wallet/balance');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getCheckoutQuote(price: number) {
    const res = await apiClient.get<CheckoutQuote>(`/wallet/checkout-quote?price=${encodeURIComponent(price)}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getPortfolio() {
    const res = await apiClient.get<PortfolioSummary>('/wallet/portfolio');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getSupportedAssets() {
    const res = await apiClient.get<Array<{ code: string; name: string; symbol: string; usdPrice: number; network: string }>>('/wallet/assets');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async swapAsset(fromCurrency: string, toCurrency: string, amount: number) {
    const normalizedFrom = fromCurrency.trim().toUpperCase();
    const normalizedTo = toCurrency.trim().toUpperCase();
    if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
      throw new Error('Select two different currencies.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Swap amount must be greater than zero.');
    }
    const payload: SwapRequest = {
      fromCurrency: normalizedFrom,
      toCurrency: normalizedTo,
      amount
    };

    const res = await apiClient.post<{ message?: string; swapId?: string; status: string; fromAsset: string; toAsset: string; amount: number; receivedAmount: number; feeAmount: number; feePercent: number; rate: number }>('/wallet/swap', { fromAsset: payload.fromCurrency, toAsset: payload.toCurrency, amount: payload.amount });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getTransactionHistory(currency?: string) {
    const q = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const res = await apiClient.get<LedgerEntry[]>(`/wallet/transactions${q}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async initDeposit(currency: string, network?: string) {
    const res = await apiClient.post<Deposit>('/wallet/deposit/init', { currency, network });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getDepositStatus(id: string) {
    const res = await apiClient.get<Deposit>(`/wallets/deposit/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async withdraw(data: { currency: string; network?: string; amount: number; destinationAddress: string; securityCode?: string }) {
    const res = await apiClient.post<Withdrawal>('/wallet/withdraw', data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getWithdrawals() {
    const res = await apiClient.get<PaginatedResponse<Withdrawal>>('/wallet/withdrawals');
    if (res.error) throw new Error(res.error);
    return res.data!;
  }
};
