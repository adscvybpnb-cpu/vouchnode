import { Prisma } from '@prisma/client';

type EscrowTransaction = {
  wallet: {
    updateMany(args: {
      where: { id: string; pendingBalance: { gte: Prisma.Decimal | number } };
      data: {
        pendingBalance: { decrement: Prisma.Decimal | number };
        availableBalance: { increment: Prisma.Decimal | number };
      };
    }): Promise<{ count: number }>;
  };
  ledgerEntry: {
    findFirst(args: {
      where: {
        transactionId: string;
        walletId: string;
        type: 'SALE';
        status: 'PENDING';
        amount: Prisma.Decimal | number;
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    updateMany(args: {
      where: { id: string; status: 'PENDING' };
      data: { status: 'COMPLETED'; completedAt: Date };
    }): Promise<{ count: number }>;
    create(args: { data: Prisma.LedgerEntryUncheckedCreateInput }): Promise<unknown>;
  };
  transaction: {
    update(args: {
      where: { id: string };
      data: { status: 'COMPLETED'; escrowReleaseAt: null };
    }): Promise<unknown>;
  };
};

export async function releasePendingSellerEscrow(
  tx: EscrowTransaction,
  {
    transactionId,
    orderId,
    walletId,
    currency,
    amount,
    description,
  }: {
    transactionId: string;
    orderId: string;
    walletId: string;
    currency: string;
    amount: Prisma.Decimal | number;
    description: string;
  },
) {
  const sale = await tx.ledgerEntry.findFirst({
    where: { transactionId, walletId, type: 'SALE', status: 'PENDING', amount },
    select: { id: true },
  });
  if (!sale) throw new Error(`Pending seller escrow entry not found for order ${orderId}`);

  const moved = await tx.wallet.updateMany({
    where: { id: walletId, pendingBalance: { gte: amount } },
    data: {
      pendingBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  });
  if (moved.count !== 1) throw new Error(`Insufficient pending seller escrow for order ${orderId}`);

  const completed = await tx.ledgerEntry.updateMany({
    where: { id: sale.id, status: 'PENDING' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (completed.count !== 1) throw new Error(`Seller escrow was already released for order ${orderId}`);

  await tx.ledgerEntry.create({
    data: {
      transactionId,
      walletId,
      type: 'ESCROW_RELEASE',
      amount,
      currency,
      direction: 'CREDIT',
      status: 'COMPLETED',
      referenceId: orderId,
      description,
    },
  });
  await tx.transaction.update({
    where: { id: transactionId },
    data: { status: 'COMPLETED', escrowReleaseAt: null },
  });
}
