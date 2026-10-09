import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  roleFindUnique: vi.fn(),
  sellerFindUniquePreflight: vi.fn(),
  sellerFindUnique: vi.fn(),
  sellerUpsert: vi.fn(),
  walletUpsert: vi.fn(),
  userRoleUpsert: vi.fn(),
  auditLogCreate: vi.fn(),
  findByShopSlug: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    role: { findUnique: mocks.roleFindUnique },
    seller: { findUnique: mocks.sellerFindUniquePreflight },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({
      seller: {
        findUnique: mocks.sellerFindUnique,
        upsert: mocks.sellerUpsert,
      },
      wallet: { upsert: mocks.walletUpsert },
      userRole: { upsert: mocks.userRoleUpsert },
      auditLog: { create: mocks.auditLogCreate },
    })),
  },
}));

vi.mock('../repositories/seller.repository', () => ({
  SellerRepository: { findByShopSlug: mocks.findByShopSlug },
}));
vi.mock('../services/notification.service', () => ({ NotificationService: {} }));

import { SellerService } from '../services/seller.service';

describe('fast-launch seller approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roleFindUnique.mockResolvedValue({ id: 'seller-role' });
    mocks.sellerFindUniquePreflight.mockResolvedValue(null);
    mocks.sellerFindUnique.mockResolvedValue(null);
    mocks.findByShopSlug.mockResolvedValue(null);
    mocks.sellerUpsert.mockResolvedValue({
      id: 'seller-id',
      status: 'ACTIVE',
      onboardingMode: 'FAST_LAUNCH',
      kycSkippedAt: new Date(),
      verificationLevel: 0,
    });
    mocks.walletUpsert.mockResolvedValue({});
  });

  it('activates only an explicitly skipped fast-launch application and leaves identity unverified', async () => {
    const seller = await SellerService.applyToSell('user-id', {
      shopName: 'Fast Shop',
      description: 'A description long enough to meet the application form requirements.',
      onboardingMode: 'FAST_LAUNCH',
    });

    expect(seller).toMatchObject({ status: 'ACTIVE', verificationLevel: 0 });
    expect(mocks.sellerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'ACTIVE',
        onboardingMode: 'FAST_LAUNCH',
        verificationLevel: 0,
      }),
    }));
    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_roleId: { userId: 'user-id', roleId: 'seller-role' } },
    }));
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'seller.fast_launch.approve',
        entityId: 'seller-id',
      }),
    }));
  });

  it('keeps document-based applications pending for the standard KYC review path', async () => {
    mocks.sellerUpsert.mockResolvedValue({
      id: 'seller-id',
      status: 'PENDING',
      onboardingMode: 'SECURE_VERIFICATION',
      kycSkippedAt: null,
      verificationLevel: 0,
    });

    const seller = await SellerService.applyToSell('user-id', {
      shopName: 'Secure Shop',
      description: 'A description long enough to meet the application form requirements.',
      onboardingMode: 'SECURE_VERIFICATION',
    });

    expect(seller).toMatchObject({ status: 'PENDING', onboardingMode: 'SECURE_VERIFICATION' });
    expect(mocks.userRoleUpsert).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'seller.apply',
        metadata: { onboardingMode: 'SECURE_VERIFICATION', kycSkipped: false },
      }),
    }));
  });

  it('returns a client error when another seller already uses the requested shop name', async () => {
    mocks.findByShopSlug.mockResolvedValue({ userId: 'another-user' });

    await expect(SellerService.applyToSell('user-id', {
      shopName: 'Taken Shop',
      onboardingMode: 'FAST_LAUNCH',
    })).rejects.toMatchObject({
      message: 'Shop name is already taken',
      statusCode: 400,
    });

    expect(mocks.sellerUpsert).not.toHaveBeenCalled();
  });
});
