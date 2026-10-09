import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  productFindMany: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    product: { findMany: mocks.productFindMany },
  },
}));

import { ProductRepository } from '../repositories/product.repository';

describe('public product listings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindMany.mockResolvedValue([]);
  });

  it('shows listings for every active seller without gating on onboarding mode or verification level', async () => {
    await ProductRepository.getNewArrivals();

    const query = mocks.productFindMany.mock.calls[0][0];
    expect(query.where.AND[0].seller).toMatchObject({
      status: 'ACTIVE',
      user: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } },
    });
    expect(query.where.AND[0].seller).not.toHaveProperty('onboardingMode');
    expect(query.where.AND[0].seller).not.toHaveProperty('verificationLevel');
    expect(query.include.seller.select).toMatchObject({
      status: true,
      verificationLevel: true,
    });
    expect(query.where.AND[0].AND[0].OR).toContainEqual({
      status: 'ACTIVE',
      stock: { gt: 0 },
    });
  });
});
