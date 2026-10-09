import { DepositStatus } from '@vouchnode/shared';

export interface CryptoProvider {
  createDepositAddress(currency: string, network: string | undefined, reference: string): Promise<{ address: string; expiresAt?: Date }>;
  checkDepositStatus(reference: string): Promise<{ status: DepositStatus; amount?: any; txHash?: string; confirmations?: number }>;
  initiateWithdrawal(params: { currency: string; network?: string; amount: any; destinationAddress: string; reference: string }): Promise<{ providerRef: string; txHash?: string }>;
  getSupportedCurrencies(): Array<{ code: string; name: string; network?: string }>;
}

export class ManualProvider implements CryptoProvider {
  async createDepositAddress() { return { address: 'mock-address' }; }
  async checkDepositStatus() { return { status: DepositStatus.CONFIRMED }; }
  async initiateWithdrawal() { return { providerRef: 'mock-ref' }; }
  getSupportedCurrencies() { return [{ code: 'USDT', name: 'Tether' }]; }
}

export function createCryptoProvider(provider: string): CryptoProvider {
  if (provider === 'manual' && process.env.NODE_ENV !== 'production') return new ManualProvider();
  if (provider === 'nowpayments') {
    throw new Error('NowPayments IPNs do not provide wallet deposit-address or withdrawal operations.');
  }
  if (provider === 'manual') {
    throw new Error('The manual crypto provider is disabled in production.');
  }
  throw new Error(`Unsupported crypto provider: ${provider}`);
}
