import { PrismaClient, CurrencyType } from '@prisma/client';

export async function seedCurrencies(prisma: PrismaClient) {
  console.log('Seeding currencies...');
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: 'USD', type: CurrencyType.FIAT, network: 'USD', decimals: 2, minDeposit: 10, minWithdrawal: 10, maxWithdrawal: 50000, withdrawalFeePercent: 0 },
    { code: 'BTC', name: 'Bitcoin', symbol: 'BTC', type: CurrencyType.CRYPTO, network: 'BTC', decimals: 8, minDeposit: 0.0001, minWithdrawal: 0.0001, maxWithdrawal: 50, withdrawalFeePercent: 1 },
    { code: 'USDT', name: 'Tether USD', symbol: 'USDT', type: CurrencyType.CRYPTO, network: 'TRC20', decimals: 6, minDeposit: 5, minWithdrawal: 10, maxWithdrawal: 10000, withdrawalFeePercent: 1 },
    { code: 'ETH', name: 'Ethereum', symbol: 'ETH', type: CurrencyType.CRYPTO, network: 'ERC20', decimals: 18, minDeposit: 0.01, minWithdrawal: 0.02, maxWithdrawal: 100, withdrawalFeePercent: 1 },
    { code: 'BNB', name: 'BNB', symbol: 'BNB', type: CurrencyType.CRYPTO, network: 'BEP20', decimals: 18, minDeposit: 0.05, minWithdrawal: 0.05, maxWithdrawal: 5000, withdrawalFeePercent: 1 },
    { code: 'SOL', name: 'Solana', symbol: 'SOL', type: CurrencyType.CRYPTO, network: 'Solana', decimals: 9, minDeposit: 0.1, minWithdrawal: 0.1, maxWithdrawal: 500, withdrawalFeePercent: 1 },
    { code: 'LTC', name: 'Litecoin', symbol: 'LTC', type: CurrencyType.CRYPTO, network: 'LTC', decimals: 8, minDeposit: 0.05, minWithdrawal: 0.05, maxWithdrawal: 250, withdrawalFeePercent: 1 },
    { code: 'TRX', name: 'Tron', symbol: 'TRX', type: CurrencyType.CRYPTO, network: 'TRC20', decimals: 6, minDeposit: 20, minWithdrawal: 25, maxWithdrawal: 200000, withdrawalFeePercent: 1 },
    { code: 'USDC', name: 'USD Coin', symbol: 'USDC', type: CurrencyType.CRYPTO, network: 'ERC20', decimals: 6, minDeposit: 5, minWithdrawal: 10, maxWithdrawal: 10000, withdrawalFeePercent: 1 },
    { code: 'BCH', name: 'Bitcoin Cash', symbol: 'BCH', type: CurrencyType.CRYPTO, network: 'BCH', decimals: 8, minDeposit: 0.01, minWithdrawal: 0.02, maxWithdrawal: 250, withdrawalFeePercent: 1 },
    { code: 'GRAM', name: 'GRAM', symbol: 'GRAM', type: CurrencyType.CRYPTO, network: 'GRAM', decimals: 8, minDeposit: 10, minWithdrawal: 10, maxWithdrawal: 50000, withdrawalFeePercent: 1 }
  ];

  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: c,
      create: c
    });
  }
}
