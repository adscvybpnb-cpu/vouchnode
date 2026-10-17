import { describe, expect, it, vi } from 'vitest';
import { releasePendingSellerEscrow } from '../lib/order-escrow';

function createTransactionMock() {
  return {
    wallet: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ledgerEntry: {
      findFirst: vi.fn().mockResolvedValue({ id: 'sale-ledger' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'release-ledger' }),
    },
    transaction: {
      update: vi.fn().mockResolvedValue({ id: 'transaction' }),
    },
  };
}

describe('releasePendingSellerEscrow', () => {
  it('moves only the seller net amount from pending to available', async () => {
    const tx = createTransactionMock();

    await releasePendingSellerEscrow(tx, {
      transactionId: 'transaction',
      orderId: 'order',
      walletId: 'seller-wallet',
      currency: 'USDT',
      amount: 90,
      description: 'Buyer confirmed order',
    });

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'seller-wallet', pendingBalance: { gte: 90 } },
      data: {
        pendingBalance: { decrement: 90 },
        availableBalance: { increment: 90 },
      },
    });
    expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith({
      where: {
        transactionId: 'transaction',
        walletId: 'seller-wallet',
        type: 'SALE',
        status: 'PENDING',
        amount: 90,
      },
      select: { id: true },
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'ESCROW_RELEASE',
        amount: 90,
        currency: 'USDT',
        referenceId: 'order',
      }),
    });
  });

  it('does not release funds if no matching pending sale entry exists', async () => {
    const tx = createTransactionMock();
    tx.ledgerEntry.findFirst.mockResolvedValue(null);

    await expect(releasePendingSellerEscrow(tx, {
      transactionId: 'transaction',
      orderId: 'order',
      walletId: 'seller-wallet',
      currency: 'USDT',
      amount: 90,
      description: 'Buyer confirmed order',
    })).rejects.toThrow('Pending seller escrow entry not found');

    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not release more than the wallet pending escrow balance', async () => {
    const tx = createTransactionMock();
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(releasePendingSellerEscrow(tx, {
      transactionId: 'transaction',
      orderId: 'order',
      walletId: 'seller-wallet',
      currency: 'USDT',
      amount: 90,
      description: 'Buyer confirmed order',
    })).rejects.toThrow('Insufficient pending seller escrow');

    expect(tx.ledgerEntry.updateMany).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
