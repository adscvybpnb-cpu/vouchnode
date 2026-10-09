import { DepositSessionNetwork, Prisma } from '@prisma/client';

export type ActiveDepositTarget = {
  sessionId: string;
  userId: string;
  address: string;
  asset: string;
  expectedAmount: string;
  sessionStatus?: string;
};

export type DepositObservation = {
  eventKey: string;
  network: DepositSessionNetwork;
  chainId?: string;
  asset: string;
  transactionHash: string;
  eventIndex: number;
  blockNumber?: bigint;
  blockHash?: string;
  slot?: bigint;
  destination: string;
  amount: string;
  expectedAmount?: string;
  tokenContract?: string;
  tokenDecimals?: number;
  sessionId: string;
  userId: string;
  sessionStatus?: 'PENDING' | 'EXPIRED' | 'CANCELLED';
  metadata?: Prisma.InputJsonValue;
};

export type BlockRange = {
  from: bigint;
  to: bigint;
};

export interface BlockchainAdapter {
  readonly network: DepositSessionNetwork;
  getTip(): Promise<bigint>;
  getSafeTip(): Promise<bigint>;
  observeRange(range: BlockRange, targets: ActiveDepositTarget[]): Promise<DepositObservation[]>;
}
