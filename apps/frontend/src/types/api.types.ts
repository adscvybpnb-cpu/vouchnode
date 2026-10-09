export interface User {
  id: string;
  email: string;
  username: string;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_VERIFICATION';
  sellerStatus?: 'none' | 'pending' | 'approved' | 'suspended' | 'rejected';
  isVerified: boolean;
  avatarUrl?: string;
  displayName?: string;
  bio?: string;
  countryCode?: string;
  timezone?: string;
  language?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  profile?: { displayName?: string; username?: string; avatarUrl?: string | null };
}
export interface UserProfile extends User {
  firstName?: string;
  lastName?: string;
  country?: string;
}
export interface Session { accessToken: string; refreshToken: string; user: User; }
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  currentPrice: number;
  originalPrice: number;
  discountPercent?: number;
  currency: string;
  stock: number;
  deliveryType: 'INSTANT' | 'MANUAL';
  status: 'ACTIVE' | 'HIDDEN' | 'DRAFT' | 'SUSPENDED' | 'SOLD' | 'SOLD_OUT' | 'COMPLETED' | 'ON_SALE' | 'EXPIRED' | 'PENDING_REVIEW' | 'INACTIVE' | 'DISPUTED' | 'UNDER_REVIEW';
  sellerId: string;
  categoryId?: string;
  category?: { id?: string; name?: string; slug?: string };
  brand?: string;
  rating?: number;
  reviewCount?: number;
  region?: string;
  regionCode?: string;
  images: ProductImage[];
  orders?: Array<{
    id: string;
    status: string;
    paymentStatus: string;
    deliveryStatus: string;
    createdAt: string;
    totalAmount: number;
    currency: string;
    transaction?: Transaction | null;
  }>;
  seller?: Seller;
  offers?: Product[];
}
export interface ProductImage { id: string; url: string; isPrimary: boolean; }
export interface ProductFilters { search?: string; category?: string; region?: string; minPrice?: number | string; maxPrice?: number | string; rating?: number | string; minRating?: number | string; deliveryType?: 'INSTANT' | 'MANUAL' | string; verifiedSeller?: boolean; page?: number; limit?: number; sortBy?: 'relevance' | 'price' | 'rating' | 'createdAt' | 'soldCount'; sortOrder?: 'asc' | 'desc'; }
export interface Category { id: string; name: string; slug: string; icon?: string; productCount: number; }
export interface Seller { id: string; userId: string; shopName: string; shopSlug?: string; username?: string; description?: string; status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED'; verificationLevel?: number; isVerified: boolean; rating: number; avgRating?: number | string; ratingAverage?: number | string; reviewCount?: number; ratingCount?: number; totalSales: number; responseTime?: number; avatarUrl?: string; }
export interface SellerStats { totalRevenue: number; activeOrders: number; pendingDisputes: number; rating: number; }
export interface Order { id: string; orderNumber: string; productId: string; buyerId: string; sellerId: string; amount: number; currency: string; status: string; paymentStatus?: string; deliveryStatus?: string; autoConfirmDate?: string; deliveredCode?: string; digitalCode?: string | null; digitalCodes?: string[]; createdAt: string; updatedAt: string; product?: Product; conversation?: { id: string } | null; }
export interface OrderItem { id: string; orderId: string; productId: string; quantity: number; price: number; }
export interface Transaction { id: string; type: 'DEPOSIT' | 'WITHDRAWAL' | 'PAYMENT' | 'REFUND'; amount: number; currency: string; status: string; txHash?: string; createdAt: string; }
export interface Wallet { id: string; userId: string; currency: string; walletType?: string; network?: string; availableBalance: number; pendingBalance: number; frozenBalance: number; totalUsdBalance?: number; isPrimary?: boolean; }
export interface AssetBalance {
  id: string;
  currency: string;
  walletType: string;
  availableBalance: number;
  pendingBalance: number;
  frozenBalance: number;
  totalBalance: number;
  usdValue: number;
  isPrimary: boolean;
  network?: string | null;
  escrowBalance?: number;
}
export interface PortfolioSummary { totalUsdBalance: number; assets: AssetBalance[]; }
export interface WalletAddress { currency: string; address: string; network: string; }
export interface Deposit { id: string; amount: number; currency: string; status: string; address: string; network: string; }
export interface Withdrawal { id: string; amount: number; currency: string; status: string; toAddress: string; txHash?: string; }
export interface LedgerEntry {
  id: string;
  walletId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAW' | 'ORDER_PAYMENT' | 'TRADE_BUY' | 'TRADE_SELL' | 'SYSTEM_REFUND' | 'INTERNAL_TRANSFER' | string;
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'REFUNDED' | string;
  description?: string;
  createdAt: string;
}
export interface Dispute { id: string; disputeNumber?: string; disputeType?: 'STANDARD' | 'P2P'; orderId: string; buyerId?: string; sellerId?: string; initiatorId?: string; respondentId?: string; reason: string; description?: string; status: string; resolution?: string | null; resolvedAt?: string | null; sellerResponseDeadline?: string | null; buyerResponseDeadline?: string | null; createdAt: string; updatedAt?: string; order?: { orderNumber: string; totalAmount?: number | string; currency?: string; status?: string; conversation?: { id: string } | null }; timeline?: DisputeTimeline[]; evidence?: DisputeEvidence[]; }
export interface DisputeMessage { id: string; disputeId: string; senderId: string; text: string; createdAt: string; }
export interface DisputeEvidence { id: string; disputeId: string; uploaderId?: string; uploadedBy?: string; fileUrl: string; description?: string; createdAt: string; }
export interface DisputeTimeline { id: string; disputeId: string; action: string; description: string; createdAt: string; }
export interface Message { id: string; conversationId: string; senderId: string; content?: string | null; text?: string; messageType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'SYSTEM'; fileUrl?: string | null; imageUrl?: string | null; visibility?: 'EVERYONE' | 'ADMIN_ONLY'; isRead: boolean; createdAt: string; sender?: { id: string; profile?: { username?: string; displayName?: string } | null }; }
export interface Conversation {
  id: string;
  participantIds?: string[];
  buyerId?: string;
  sellerId?: string;
  buyer?: { id: string; profile?: { username?: string; displayName?: string; avatarUrl?: string | null } | null };
  seller?: { id: string; profile?: { username?: string; displayName?: string; avatarUrl?: string | null } | null };
  lastMessage?: Message;
  unreadCount?: number;
  updatedAt: string;
}
export interface Notification { id: string; userId: string; type: string; title: string; message: string; body?: string; data?: Record<string, unknown>; link?: string; isRead: boolean; readAt?: string; createdAt: string; }
export interface Review { id: string; orderId: string; productId: string; sellerId: string; buyerId: string; rating: number; title?: string; comment?: string; content?: string; maskedBuyerUsername?: string; createdAt: string; reviewer?: { profile?: { username?: string; displayName?: string } }; }
export interface Report { id: string; reporterId: string; targetId: string; targetType: 'USER' | 'BUYER' | 'SELLER' | 'PRODUCT' | 'ORDER' | 'FRAUD' | 'MESSAGE'; reason: string; status: string; createdAt: string; }
export interface FraudFlag { id: string; userId?: string; orderId?: string; score?: number; reasons?: string[]; type?: string; severity?: string; description?: string; status?: string; isResolved?: boolean; createdAt: string; }
export interface AuditLog { id: string; actorId?: string; action: string; entity?: string; entityType?: string; entityId?: string; ipAddress?: string; createdAt: string; }
export interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; totalPages: number; }
export interface ApiResponse<T> { data: T; message?: string; }
export interface ApiError { error: string; message: string; statusCode: number; details?: Record<string, string[]>; }
