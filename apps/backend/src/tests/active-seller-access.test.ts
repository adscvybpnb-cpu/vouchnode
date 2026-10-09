import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sellerFindUnique: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    seller: { findUnique: mocks.sellerFindUnique },
  },
}));

import { requireApprovedSeller, requireRole } from '../middleware/auth.middleware';

describe('active seller access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      label: 'fully verified secure seller',
      seller: { status: 'ACTIVE', verificationLevel: 1, approvedAt: new Date(), onboardingMode: 'SECURE_VERIFICATION' },
    },
    {
      label: 'KYC-skipped fast-launch seller',
      seller: { status: 'ACTIVE', verificationLevel: 0, approvedAt: new Date(), onboardingMode: 'FAST_LAUNCH', kycSkippedAt: new Date() },
    },
  ])('preserves access for an existing $label when the fast-launch setting is disabled', async ({ seller }) => {
    mocks.sellerFindUnique.mockResolvedValue(seller);
    const request = {
      user: { id: 'seller-user', roles: [] },
    } as unknown as FastifyRequest;
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await expect(requireApprovedSeller(request, reply)).resolves.toBeUndefined();
    await expect(requireRole('SELLER')(request, reply)).resolves.toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
    expect(mocks.sellerFindUnique).toHaveBeenCalledWith({
      where: { userId: 'seller-user' },
      select: { status: true },
    });
  });

  it('continues to deny seller access when the seller is not active', async () => {
    mocks.sellerFindUnique.mockResolvedValue({ status: 'PENDING' });
    const request = {
      user: { id: 'seller-user', roles: [] },
    } as unknown as FastifyRequest;
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await requireApprovedSeller(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });
});
