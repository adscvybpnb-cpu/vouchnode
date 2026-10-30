import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  reviewCount: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    review: { count: mocks.reviewCount },
  },
}));

vi.mock('../lib/redis', () => ({
  redis: { status: 'end', get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

import { P2PProfileService } from '../services/p2p-profile.service';

describe('P2P merchant profile names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reviewCount.mockImplementation(async ({ where }: { where: { rating?: { gte: number } } }) => where.rating ? 0 : 0);
    mocks.userFindUnique.mockResolvedValue({
      emailVerified: true,
      kycStatus: 'APPROVED',
      twoFactorEnabled: false,
      isOnline: false,
      onlineUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      profile: {
        username: 'adscvybp',
        displayName: 'Generated Profile Name',
        avatarUrl: null,
        isIdentityVerified: false,
        avgPaymentSpeedMins: 0,
      },
      sellerProfile: { shopName: 'MOHM' },
      depositSessions: [],
      p2pOffers: [],
      reviewsReceived: [],
    });
    vi.spyOn(P2PProfileService, 'getTradeMetrics').mockResolvedValue({
      thirtyDayOrders: 0,
      totalCompletedOrders: 0,
      completedBuyOrders: 0,
      completedSellOrders: 0,
      completionRate: 0,
      avgReleaseMinutes: 0,
    });
  });

  it('uses the seller shop name as the merchant profile display name', async () => {
    const profile = await P2PProfileService.getProfile('merchant-1');

    expect(profile?.merchantName).toBe('MOHM');
    expect(profile?.displayName).toBe('MOHM');
    expect(profile?.username).toBe('adscvybp');
  });

  it('falls back to the profile display name when the user has no seller profile', async () => {
    mocks.userFindUnique.mockImplementation(async () => ({
      emailVerified: true,
      kycStatus: 'APPROVED',
      twoFactorEnabled: false,
      isOnline: false,
      onlineUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      profile: {
        username: 'merchant-handle',
        displayName: 'Merchant Name',
        avatarUrl: null,
        isIdentityVerified: false,
        avgPaymentSpeedMins: 0,
      },
      sellerProfile: null,
      depositSessions: [],
      p2pOffers: [],
      reviewsReceived: [],
    }));

    const profile = await P2PProfileService.getProfile('merchant-1');

    expect(profile?.displayName).toBe('Merchant Name');
  });
});
