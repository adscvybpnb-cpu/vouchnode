import { beforeEach, describe, it, expect, vi } from 'vitest';
import { INTERNAL_SUPPORTED_ASSET_CODES } from '../lib/internal-wallet';

const mocks = vi.hoisted(() => ({
  walletCreateMany: vi.fn(),
  walletFindMany: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    wallet: {
      createMany: mocks.walletCreateMany,
      findMany: mocks.walletFindMany,
    },
  },
}));

import { WalletRepository } from '../repositories/wallet.repository';

describe('WalletRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should define basic wallet operations', () => {
    expect(WalletRepository.addToAvailable).toBeDefined();
    expect(WalletRepository.deductFromAvailable).toBeDefined();
    expect(WalletRepository.moveFromPendingToAvailable).toBeDefined();
  });

  it('initializes all supported wallets with one bulk insert and one fetch', async () => {
    mocks.walletCreateMany.mockResolvedValue({ count: INTERNAL_SUPPORTED_ASSET_CODES.length });
    mocks.walletFindMany.mockResolvedValue(Array.from({ length: INTERNAL_SUPPORTED_ASSET_CODES.length }, () => ({})));

    await WalletRepository.initializeUserWallets('user-1');

    expect(mocks.walletCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.walletFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.walletFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        currency: expect.objectContaining({ in: expect.arrayContaining(['BTC', 'USDT']) }),
      }),
    }));
  });

});
