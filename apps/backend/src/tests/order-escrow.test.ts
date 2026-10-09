import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { OrderService } from '../services/order.service';

function createTransactionClient({
  status,
  pendingBalance,
  existingSale,
}: {
  status: 'PENDING' | 'CONFIRMING' | 'COMPLETED';
  pendingBalance: number;
  existingSale?: boolean;
}) {
  let transactionStatus = status;
  let balance = new Prisma.Decimal(pendingBalance);
  const sales: Array<{
    id: string;
    transactionId: string;
    walletId: string;
    type: 'SALE';
    amount: Prisma.Decimal;
    currency: string;
    status: 'PENDING' | 'COMPLETED';
    referenceId: string;
  }> = existingSale ? [{
    id: 'sale-entry',
    transactionId: 'transaction-1',
    walletId: 'seller-wallet',
    type: 'SALE',
    amount: new Prisma.Decimal(12),
    currency: 'USDT',
    status: 'PENDING',
    referenceId: 'order-1',
  }] : [];

  const client = {
    $executeRaw: async () => 1,
    order: {
      findUnique: async () => ({
        id: 'order-1',
        sellerAmount: new Prisma.Decimal(12),
        transaction: {
          id: 'transaction-1',
          sellerId: 'seller-1',
          currency: 'USDT',
          status: transactionStatus,
          cryptoTxHash: 'verified-hash',
          metadata: { paymentMethod: 'DIRECT_INVOICE' },
        },
      }),
    },
    transaction: {
      updateMany: async () => {
        if (!['PENDING', 'CONFIRMING'].includes(transactionStatus)) return { count: 0 };
        transactionStatus = 'COMPLETED';
        return { count: 1 };
      },
    },
    wallet: {
      createMany: async () => ({ count: 0 }),
      findUniqueOrThrow: async () => ({ id: 'seller-wallet', pendingBalance: balance }),
      update: async ({ data }: { data: { pendingBalance: { increment: Prisma.Decimal } } }) => {
        balance = balance.add(data.pendingBalance.increment);
        return { id: 'seller-wallet', pendingBalance: balance };
      },
    },
    ledgerEntry: {
      findFirst: async ({ where }: { where: { status?: 'PENDING'; transactionId?: string } }) =>
        sales.find((sale) =>
          (!where.status || sale.status === where.status) &&
          (!where.transactionId || sale.transactionId === where.transactionId),
        ) ?? null,
      create: async ({ data }: { data: Omit<(typeof sales)[number], 'id'> }) => {
        const sale = { ...data, id: `sale-${sales.length + 1}` };
        sales.push(sale);
        return sale;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<(typeof sales)[number]> }) => {
        const sale = sales.find((entry) => entry.id === where.id);
        if (!sale) throw new Error('Sale ledger entry not found');
        Object.assign(sale, data);
        return sale;
      },
      aggregate: async () => ({
        _sum: {
          amount: sales
            .filter((sale) => sale.status === 'PENDING')
            .reduce((sum, sale) => sum.add(sale.amount), new Prisma.Decimal(0)),
        },
      }),
    },
  };

  return {
    client: client as unknown as Prisma.TransactionClient,
    getPendingBalance: () => balance,
    getSaleCount: () => sales.length,
  };
}

describe('direct invoice escrow reconciliation', () => {
  it('creates a missing sale hold and repairs the pending balance idempotently', async () => {
    const { client, getPendingBalance, getSaleCount } = createTransactionClient({
      status: 'COMPLETED',
      pendingBalance: 0,
    });

    await OrderService.ensureDirectInvoiceEscrow(client, 'order-1');
    await OrderService.ensureDirectInvoiceEscrow(client, 'order-1');

    expect(getSaleCount()).toBe(1);
    expect(getPendingBalance().toString()).toBe('12');
  });

  it('completes a verified transaction and restores its existing sale liability', async () => {
    const { client, getPendingBalance, getSaleCount } = createTransactionClient({
      status: 'CONFIRMING',
      pendingBalance: 0,
      existingSale: true,
    });

    await OrderService.ensureDirectInvoiceEscrow(client, 'order-1');

    expect(getSaleCount()).toBe(1);
    expect(getPendingBalance().toString()).toBe('12');
  });
});
