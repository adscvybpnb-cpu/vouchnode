-- CreateEnum
CREATE TYPE "CryptoDepositStatus" AS ENUM ('PENDING', 'SUCCESS', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "DepositSession" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- CreateTable
CREATE TABLE "CryptoDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "walletIndex" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "status" "CryptoDepositStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + interval '1 hour',

    CONSTRAINT "CryptoDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoDeposit_address_key" ON "CryptoDeposit"("address");

-- CreateIndex
CREATE INDEX "CryptoDeposit_userId_status_idx" ON "CryptoDeposit"("userId", "status");

-- CreateIndex
CREATE INDEX "CryptoDeposit_status_expiresAt_idx" ON "CryptoDeposit"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoDeposit_walletIndex_network_key" ON "CryptoDeposit"("walletIndex", "network");

-- AddForeignKey
ALTER TABLE "CryptoDeposit" ADD CONSTRAINT "CryptoDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
