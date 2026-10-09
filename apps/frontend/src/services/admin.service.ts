import { adminApiClient } from './api.client';
import { ADMIN_API_URL } from '../lib/constants';
import type { PaginatedResponse, User, Seller, Product, Order, Transaction, Dispute, Report, FraudFlag, AuditLog } from '../types/api.types';

export interface AdminUserRow extends Omit<User, 'role'> {
  role: 'BUYER' | 'SELLER' | 'ADMIN' | 'SUPPORT' | 'SUPER_ADMIN' | 'UNASSIGNED';
  roles: string[];
}

export interface AdminUserDetails {
  id: string;
  email: string;
  status: string;
  kycStatus: string;
  riskScore: number;
  riskLevel: string;
  criticalRiskTrigger?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  profile?: { displayName?: string | null; username?: string | null; avatarUrl?: string | null; countryCode?: string | null } | null;
  roles: string[];
  seller: { id: string; shopName: string; shopSlug: string; status: string; verificationLevel: number } | null;
  financials: {
    wallets: Array<{ id: string; currency: string; availableBalance: string; pendingBalance: string; frozenBalance: string; escrowBalance: string }>;
    deposits: Array<{ id: string; currency: string; amount: string | null; status: string; network?: string | null; cryptoTxHash?: string | null; createdAt: string; confirmedAt?: string | null }>;
    withdrawals: Array<{ id: string; currency: string; amount: string; netAmount: string; status: string; network?: string | null; cryptoTxHash?: string | null; createdAt: string; processedAt?: string | null }>;
    totalDeposits: number;
    totalWithdrawals: number;
  };
  trading: {
    completedSales: number;
    completedSalesTotal: number;
    activeListings: Array<{ id: string; name: string; status: string; currentPrice: unknown; currency: string; stock: number; createdAt: string }>;
    feedback: { count: number; averageRating: number; reviews: Array<{ id: string; rating: number; title?: string | null; content?: string | null; createdAt: string; buyerId: string }> };
  };
  disputes: { total: number; open: number; closed: number; records: Array<{ id: string; disputeNumber: string; status: string; reason: string; createdAt: string; resolvedAt?: string | null }> };
  security: {
    sessions: Array<{ id: string; deviceInfo?: string | null; ipAddress?: string | null; userAgent?: string | null; isRevoked: boolean; createdAt: string; lastUsedAt: string }>;
    auditLogs: Array<{ id: string; action: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string; metadata?: unknown }>;
    knownIps: string[];
  };
  recentOrders: Array<{ id: string; orderNumber: string; status: string; totalAmount: unknown; currency: string; createdAt: string }>;
}

export interface AdminP2PUserMetrics {
  userId: string;
  thirtyDayOrders: number;
  totalCompletedOrders: number;
  thirtyDayCompletionRate: number;
  positiveRating: number;
  accountAgeDays: number;
  totalOrders: number;
}

export interface AdminP2PDisputeRow {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  order?: {
    id: string;
    amountUSD: number | string;
    cryptoAsset: string;
    paymentDeadline: string;
  };
}

export interface StaticAddressPoolRow {
  id: string;
  asset: 'BTC' | 'SOL' | 'BCH' | 'LTC' | 'TRX';
  address: string;
  status: 'AVAILABLE' | 'BUSY';
  orderId: string | null;
  expiresAt: string | null;
}

export interface AdminReferralCommissionTotal {
  currency: string;
  amount: string;
  count: number;
}

export interface AdminReferralUser {
  id: string;
  email: string;
  createdAt: string;
  profile: { username: string | null; displayName: string | null } | null;
}

export interface AdminReferralTreeRow {
  id: string;
  email: string;
  referralCode: string | null;
  createdAt: string;
  profile: { username: string | null; displayName: string | null } | null;
  referredCount: number;
  referredUsers: AdminReferralUser[];
  commissions: AdminReferralCommissionTotal[];
}

export interface AdminReferralSummary {
  referredUsers: number;
  activeReferrers: number;
  commissions: AdminReferralCommissionTotal[];
}

export interface AdminReferralSettings {
  enabled: boolean;
  commissionRatePercent: number;
  platformFeeCapPercent: number;
}

export interface AdminSeller extends Omit<Seller, 'status'> {
  status?: string;
  user?: { email?: string };
}

async function unwrap<T>(request: Promise<{ data: T | null; error: string | null }>): Promise<T> {
  const response = await request;
  if (response.error || response.data === null) throw new Error(response.error || 'Unable to load admin data.');
  return response.data;
}

export const adminService = {
  async getUserDetails(id: string) {
    return unwrap(adminApiClient.get<AdminUserDetails>(`/users/${encodeURIComponent(id)}`));
  },
  async getOrderDetails(id: string) {
    return unwrap(adminApiClient.get<any>(`/orders/${encodeURIComponent(id)}`));
  },
  async getUsers(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page), status: 'ACTIVE' });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AdminUserRow>>(`/users?${query.toString()}`));
  },
  async getSuspendedUsers(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AdminUserRow>>(`/users/suspended?${query.toString()}`));
  },
  async getBannedUsers(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AdminUserRow>>(`/users/banned?${query.toString()}`));
  },
  async getKycRequests(page = 1, status?: string) {
    return unwrap(adminApiClient.get<PaginatedResponse<any>>(`/kyc?page=${page}${status ? `&status=${encodeURIComponent(status)}` : ''}`));
  },
  async getFinanceDeposits(status: string, page = 1) {
    return unwrap(adminApiClient.get<PaginatedResponse<any>>(`/finance/deposits?page=${page}&status=${encodeURIComponent(status)}`));
  },
  async getFinanceWithdrawals(status: string, page = 1) {
    return unwrap(adminApiClient.get<PaginatedResponse<any>>(`/finance/withdrawals?page=${page}&status=${encodeURIComponent(status)}`));
  },
  async getOrderArchive(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<Order>>(`/orders/archive?${query.toString()}`));
  },
  async getP2PDisputes(page = 1, status: string | readonly string[] = 'OPEN') {
    const statusQuery = (typeof status === 'string' ? status.split(',') : [...status])
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .join(',');
    const query = new URLSearchParams({ page: String(page), status: statusQuery });
    return unwrap(adminApiClient.get<PaginatedResponse<AdminP2PDisputeRow>>(`/disputes/p2p?${query.toString()}`));
  },
  async getP2PUserMetrics(userIds: string[]) {
    return unwrap(adminApiClient.get<AdminP2PUserMetrics[]>(`/disputes/p2p/metrics?userIds=${userIds.map((id) => encodeURIComponent(id)).join(',')}`));
  },
  async reviewKyc(id: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    return unwrap(adminApiClient.patch(`/kyc/${id}/review`, { decision, reason }));
  },
  getKycDocumentUrl(id: string, kind: 'front' | 'back' | 'selfie') {
    return `${ADMIN_API_URL}/kyc/${encodeURIComponent(id)}/document/${kind}`;
  },
  async suspendUser(id: string) {
    return unwrap(adminApiClient.patch(`/users/${id}/suspend`, { reason: 'Suspended by administrator' }));
  },
  async banUser(id: string) {
    return unwrap(adminApiClient.patch(`/users/${id}/ban`, { reason: 'Banned by administrator' }));
  },
  async activateUser(id: string) {
    const response = await adminApiClient.patch<{ success: true; message: string }>(
      `/users/${encodeURIComponent(id)}/activate`,
      {},
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { success: true as const, message: 'User activated successfully' };
  },
  async getSellers(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AdminSeller>>(`/sellers?${query.toString()}`));
  },
  async approveSeller(id: string) {
    return unwrap(adminApiClient.patch(`/sellers/${id}/approve`, {}));
  },
  async suspendSeller(id: string, reason: string) {
    const response = await adminApiClient.patch<{ success: true; message: string }>(
      `/sellers/${encodeURIComponent(id)}/suspend`,
      { reason },
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { success: true as const, message: 'Seller suspended successfully' };
  },
  async getProducts(page = 1, status?: string) {
    return unwrap(adminApiClient.get<PaginatedResponse<Product>>(`/products?page=${page}&limit=50${status ? `&status=${encodeURIComponent(status)}` : ''}`));
  },
  async getCatalog(page = 1, status = 'ACTIVE') {
    return unwrap(adminApiClient.get<PaginatedResponse<Product>>(`/catalog?page=${page}&limit=50&status=${encodeURIComponent(status)}`));
  },
  async createProduct(data: Record<string, unknown>) {
    return unwrap(adminApiClient.post<Product>('/products', data));
  },
  async updateProduct(id: string, data: Record<string, unknown>) {
    return unwrap(adminApiClient.patch<Product>(`/products/${id}`, data));
  },
  async deleteProduct(id: string) {
    const response = await adminApiClient.delete(`/products/${id}`);
    if (response.error) throw new Error(response.error);
  },
  async restoreProduct(id: string) {
    return unwrap(adminApiClient.patch(`/products/${id}/restore`, {}));
  },
  async addCodes(id: string, codes: string[]) {
    return unwrap(adminApiClient.post(`/products/${id}/codes`, { codes }));
  },
  async getOrders(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<Order>>(`/orders?${query.toString()}`));
  },
  async getTransactions(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<Transaction>>(`/transactions?${query.toString()}`));
  },
  async getDisputes(page = 1, status?: string) {
    return unwrap(adminApiClient.get<PaginatedResponse<Dispute>>(`/disputes?page=${page}${status ? `&status=${encodeURIComponent(status)}` : ''}`));
  },
  async resolveDisputeForBuyer(id: string) {
    return unwrap(adminApiClient.patch(`/disputes/${encodeURIComponent(id)}/resolve-buyer`, {
      resolution: 'Refund buyer',
    }));
  },
  async resolveDisputeForSeller(id: string) {
    return unwrap(adminApiClient.patch(`/disputes/${encodeURIComponent(id)}/resolve-seller`, {
      resolution: 'Release funds to seller',
    }));
  },
  async resolveP2PDispute(id: string, resolution: 'RESOLVED_BUYER' | 'RESOLVED_SELLER') {
    return unwrap(adminApiClient.patch(`/p2p-disputes/${encodeURIComponent(id)}/resolve`, {
      resolution,
      note: resolution === 'RESOLVED_BUYER' ? 'P2P dispute resolved for buyer' : 'P2P dispute resolved for seller',
    }));
  },
  async getReports(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<Report>>(`/reports?${query.toString()}`));
  },
  async suspendReportedUser(reportId: string) {
    return unwrap(adminApiClient.patch(`/reports/${encodeURIComponent(reportId)}/suspend-user`, { reason: 'Suspended after admin report review' }));
  },
  async warnReportedUser(reportId: string) {
    return unwrap(adminApiClient.patch(`/reports/${encodeURIComponent(reportId)}/warn-user`, { reason: 'Warned after admin report review' }));
  },
  async getFraudAlerts(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<FraudFlag>>(`/fraud?${query.toString()}`));
  },
  async resolveFraudAlert(id: string) {
    return unwrap(adminApiClient.patch(`/fraud/${encodeURIComponent(id)}/resolve`, {}));
  },
  async getAuditLogs(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page) });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AuditLog>>(`/audit-logs?${query.toString()}`));
  },
  async getSettings() {
    return unwrap(adminApiClient.get<any[]>('/settings'));
  },
  async getStaticAddressPool(asset?: string) {
    return unwrap(adminApiClient.get<StaticAddressPoolRow[]>(`/address-pool${asset ? `?asset=${encodeURIComponent(asset)}` : ''}`));
  },
  async addStaticAddresses(asset: StaticAddressPoolRow['asset'], addresses: string[]) {
    return unwrap(adminApiClient.post<{ inserted: number }>('/address-pool', { asset, addresses }));
  },
  async deleteStaticAddress(id: string) {
    const response = await adminApiClient.delete(`/address-pool/${encodeURIComponent(id)}`);
    if (response.error) throw new Error(response.error);
  },
  async updateSettings(data: any) {
    return unwrap(adminApiClient.patch<any[]>('/settings', data));
  },
  async uploadLogo(file: File) {
    const formData = new FormData();
    formData.append('logo', file);
    return unwrap(adminApiClient.upload<{ logoUrl: string }>('/settings/logo', formData));
  },
  async getDashboardStats() {
    return unwrap(adminApiClient.get<any>('/analytics/dashboard'));
  },
  async getReferralSummary() {
    return unwrap(adminApiClient.get<AdminReferralSummary>('/referrals/summary'));
  },
  async getReferralSettings() {
    return unwrap(adminApiClient.get<AdminReferralSettings>('/referrals/settings'));
  },
  async updateReferralSettings(settings: AdminReferralSettings) {
    return unwrap(adminApiClient.patch<AdminReferralSettings>('/referrals/settings', settings));
  },
  async getReferrals(page = 1, search = '') {
    const query = new URLSearchParams({ page: String(page), limit: '25' });
    if (search.trim()) query.set('search', search.trim());
    return unwrap(adminApiClient.get<PaginatedResponse<AdminReferralTreeRow>>(`/referrals?${query.toString()}`));
  },
  async getDispute(id: string) {
    return unwrap(adminApiClient.get<Dispute>(`/disputes/${id}`));
  }
};
