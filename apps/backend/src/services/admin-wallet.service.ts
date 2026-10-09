import { prisma } from '../lib/prisma';

export class AdminWalletService {
  static async getActiveAddress(currency: string, network = 'mainnet') {
    return prisma.adminWallet.findFirst({
      where: { currency: currency.toUpperCase(), network, isActive: true },
      orderBy: { lastRotatedAt: 'desc' }
    });
  }

  static async rotateAddresses() {
    const currencies = ['BTC', 'BNB', 'ETH', 'BCH', 'SOL', 'LTC', 'TRX', 'GRAM', 'USDT', 'USDC'];
    return prisma.$transaction(async (tx) => {
      for (const currency of currencies) {
        const active = await tx.adminWallet.findFirst({
          where: { currency, isActive: true },
          orderBy: { lastRotatedAt: 'desc' }
        });
        if (active) {
          await tx.adminWallet.update({ where: { id: active.id }, data: { isActive: false } });
        }
        const next = await tx.adminWallet.findFirst({
          where: { currency, isActive: false },
          orderBy: { lastRotatedAt: 'asc' }
        });
        if (next) {
          await tx.adminWallet.update({ where: { id: next.id }, data: { isActive: true, lastRotatedAt: new Date() } });
        }
      }
    });
  }
}
