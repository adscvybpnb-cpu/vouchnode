import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { WalletRepository } from '../repositories/wallet.repository';
import {
  FirstDepositBonusService,
  qualifiesForFirstDepositBonus,
} from '../services/first-deposit-bonus.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first-deposit bonus eligibility threshold', () => {
  it('requires at least $50 USD equivalent', () => {
    expect(qualifiesForFirstDepositBonus(new Prisma.Decimal('49.99999999'))).toBe(false);
    expect(qualifiesForFirstDepositBonus(new Prisma.Decimal('50'))).toBe(true);
    expect(qualifiesForFirstDepositBonus(new Prisma.Decimal('250'))).toBe(true);
  });

  it('does not credit again when the unique per-user bonus claim already exists', async () => {
    const tx = {
      depositSession: { findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }) },
      deposit: { findFirst: vi.fn().mockResolvedValue(null) },
      firstDepositBonus: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as Prisma.TransactionClient;
    const getOrCreate = vi.spyOn(WalletRepository, 'getOrCreate');

    await expect(FirstDepositBonusService.grantForCompletedWalletDeposit(tx, {
      userId: 'user-1',
      depositSessionId: 'session-1',
      depositCurrency: 'USDT',
      depositAmount: new Prisma.Decimal(50),
      depositUsdValue: new Prisma.Decimal(50),
      completedAt: new Date(),
    })).resolves.toBe(false);

    expect(getOrCreate).not.toHaveBeenCalled();
  });
});
