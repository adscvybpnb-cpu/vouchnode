-- AlterTable
ALTER TABLE "CryptoDeposit" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- AlterTable
ALTER TABLE "DepositSession" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';
