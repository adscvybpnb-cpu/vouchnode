import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { WalletRepository } from '../repositories/wallet.repository';
import {
  FirstDepositBonusService,
  meetsFirstDepositBonusThreshold,
} from '../services/first-deposit-bonus.service';

vi.mock('../lib/prisma', () => ({
  prisma: {
    firstDepositBonus: { findUnique: vi.fn() },
    deposit: { findFirst: vi.fn() },
    depositSession: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first-deposit bonus eligibility threshold', () => {
  it('keeps the promotion visible while cumulative completed deposits are below $50', async () => {
    vi.mocked(prisma.firstDepositBonus.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.deposit.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.depositSession.aggregate).mockResolvedValue({
      _sum: { usdAmount: new Prisma.Decimal('25') },
    } as any);
    vi.mocked(prisma.depositSession.findMany).mockResolvedValue([] as any);

    await expect(FirstDepositBonusService.isEligible('user-1')).resolves.toBe(true);
    expect(prisma.firstDepositBonus.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        depositSessionId: true,
        depositCurrency: true,
        depositUsdValue: true,
        bonusAmount: true,
        createdAt: true,
      },
    });
  });

  it('keeps the promotion visible at $50 until the bonus has been claimed', async () => {
    vi.mocked(prisma.firstDepositBonus.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.deposit.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.depositSession.aggregate).mockResolvedValue({
      _sum: { usdAmount: new Prisma.Decimal('50') },
    } as any);
    vi.mocked(prisma.depositSession.findMany).mockResolvedValue([] as any);

    await expect(FirstDepositBonusService.isEligible('user-1')).resolves.toBe(true);
  });

  it('hides the promotion after a bonus claim exists', async () => {
    vi.mocked(prisma.firstDepositBonus.findUnique).mockResolvedValue({
      id: 'claim-1',
      depositSessionId: 'session-1',
      depositCurrency: 'USDT',
      depositUsdValue: new Prisma.Decimal(50),
      bonusAmount: new Prisma.Decimal(10),
      createdAt: new Date(),
    } as any);
    vi.mocked(prisma.deposit.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.depositSession.aggregate).mockResolvedValue({ _sum: { usdAmount: null } } as any);
    vi.mocked(prisma.depositSession.findMany).mockResolvedValue([] as any);

    await expect(FirstDepositBonusService.isEligible('user-1')).resolves.toBe(false);
  });

  it('requires at least $50 USD equivalent', () => {
    expect(meetsFirstDepositBonusThreshold(new Prisma.Decimal('49.99999999'))).toBe(false);
    expect(meetsFirstDepositBonusThreshold(new Prisma.Decimal('50'))).toBe(true);
    expect(meetsFirstDepositBonusThreshold(new Prisma.Decimal('250'))).toBe(true);
  });

  it('does not credit again when the unique per-user bonus claim already exists', async () => {
    const tx = {
      depositSession: {
        findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { usdAmount: new Prisma.Decimal(30) } }),
      },
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

  it('does not grant the bonus until cumulative deposits reach $50', async () => {
    const tx = {
      depositSession: {
        findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { usdAmount: new Prisma.Decimal('29.99') } }),
      },
      deposit: { findFirst: vi.fn().mockResolvedValue(null) },
      firstDepositBonus: { createMany: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(FirstDepositBonusService.grantForCompletedWalletDeposit(tx, {
      userId: 'user-1',
      depositSessionId: 'session-1',
      depositCurrency: 'USDT',
      depositAmount: new Prisma.Decimal('19.99'),
      depositUsdValue: new Prisma.Decimal('19.99'),
      completedAt: new Date(),
    })).resolves.toBe(false);

    expect(tx.firstDepositBonus.createMany).not.toHaveBeenCalled();
  });

  it('grants the bonus when the completed deposit brings the cumulative total to $50', async () => {
    const tx = {
      depositSession: {
        findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { usdAmount: new Prisma.Decimal(30) } }),
      },
      deposit: { findFirst: vi.fn().mockResolvedValue(null) },
      firstDepositBonus: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient;
    vi.spyOn(WalletRepository, 'getOrCreate').mockResolvedValue({ id: 'wallet-usdt' } as any);
    const addToAvailable = vi.spyOn(WalletRepository, 'addToAvailable').mockResolvedValue(undefined);
    const createLedgerEntry = vi.spyOn(WalletRepository, 'createLedgerEntry').mockResolvedValue({} as any);

    await expect(FirstDepositBonusService.grantForCompletedWalletDeposit(tx, {
      userId: 'user-1',
      depositSessionId: 'session-1',
      depositCurrency: 'USDT',
      depositAmount: new Prisma.Decimal(20),
      depositUsdValue: new Prisma.Decimal(20),
      completedAt: new Date(),
    })).resolves.toBe(true);

    expect(addToAvailable).toHaveBeenCalledWith(
      tx,
      'wallet-usdt',
      new Prisma.Decimal(10),
      'USDT',
    );
    expect(createLedgerEntry).toHaveBeenCalledOnce();
    expect(tx.depositSession.aggregate).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        orderId: null,
        status: 'COMPLETED',
        id: { not: 'session-1' },
      },
      _sum: { usdAmount: true },
    });
  });
});
