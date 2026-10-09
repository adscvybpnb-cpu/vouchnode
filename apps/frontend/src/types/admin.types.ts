import type { AuditLog, Dispute, FraudFlag, Order, PaginatedResponse, Report, Transaction, User } from './api.types';

export type AdminAssetCode = 'BTC' | 'USDT' | 'ETH' | 'BNB' | 'SOL' | 'LTC' | 'TRX' | 'USDC' | 'BCH' | 'GRAM';
export type AdminCapability =
  | 'catalog:write'
  | 'risk:write'
  | 'finance:review'
  | 'kyc:review'
  | 'dispute:review'
  | 'support:write'
  | 'settings:write';

export interface AdminDashboardStats {
  totalUsers: number;
  totalProducts: number;
  totalOrders: number;
  pendingWithdrawals?: number;
  pendingDeposits?: number;
  openDisputes?: number;
  overdueP2PDisputes?: number;
}

export interface AdminDepositReview {
  id: string;
  userId: string;
  currency: AdminAssetCode;
  network: string;
  amount: number;
  assignedAddress: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface AdminWithdrawalReview {
  id: string;
  walletId: string;
  currency: AdminAssetCode;
  network?: string | null;
  amount: number;
  fee: number;
  netAmount: number;
  destinationAddress: string;
  status: string;
  riskScore: number;
  requiresReview: boolean;
  createdAt: string;
}

export interface AdminSupportSnapshot {
  openTickets: number;
  pendingKyc: number;
  openDisputes: number;
  overdueP2PDisputes: number;
}

export type AdminResourcePage<T> = PaginatedResponse<T>;
export type AdminUserRow = User;
export type AdminOrderRow = Order;
export type AdminTransactionRow = Transaction;
export type AdminDisputeRow = Dispute;
export type AdminReportRow = Report;
export type AdminFraudRow = FraudFlag;
export type AdminAuditRow = AuditLog;
