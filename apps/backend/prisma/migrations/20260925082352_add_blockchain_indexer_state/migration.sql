-- CreateEnum
CREATE TYPE "BlockCursorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'BACKFILLING');

-- CreateEnum
CREATE TYPE "DetectedDepositStatus" AS ENUM ('PENDING', 'DETECTED', 'CONFIRMING', 'CONFIRMED', 'SETTLING', 'SETTLED', 'FAILED', 'REJECTED', 'REORGED', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "CryptoDeposit" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- AlterTable
ALTER TABLE "DepositSession" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- CreateTable
CREATE TABLE "BlockCursor" (
    "id" TEXT NOT NULL,
    "network" "DepositSessionNetwork" NOT NULL,
    "chainId" TEXT,
    "nextBlock" BIGINT NOT NULL,
    "lastProcessedBlock" BIGINT,
    "observedTip" BIGINT,
    "status" "BlockCursorStatus" NOT NULL DEFAULT 'ACTIVE',
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedDeposit" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "network" "DepositSessionNetwork" NOT NULL,
    "chainId" TEXT,
    "asset" TEXT NOT NULL,
    "tokenContract" TEXT,
    "tokenDecimals" INTEGER,
    "transactionHash" TEXT NOT NULL,
    "eventIndex" INTEGER,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "slot" BIGINT,
    "destination" TEXT NOT NULL,
    "amount" DECIMAL(30,18) NOT NULL,
    "expectedAmount" DECIMAL(30,18),
    "status" "DetectedDepositStatus" NOT NULL DEFAULT 'PENDING',
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 1,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "depositSessionId" TEXT,
    "transactionId" TEXT,
    "walletId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectedDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockCursor_network_key" ON "BlockCursor"("network");

-- CreateIndex
CREATE INDEX "BlockCursor_status_leaseExpiresAt_idx" ON "BlockCursor"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "BlockCursor_status_nextBlock_idx" ON "BlockCursor"("status", "nextBlock");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedDeposit_eventKey_key" ON "DetectedDeposit"("eventKey");

-- CreateIndex
CREATE INDEX "DetectedDeposit_network_status_blockNumber_idx" ON "DetectedDeposit"("network", "status", "blockNumber");

-- CreateIndex
CREATE INDEX "DetectedDeposit_network_transactionHash_idx" ON "DetectedDeposit"("network", "transactionHash");

-- CreateIndex
CREATE INDEX "DetectedDeposit_destination_status_idx" ON "DetectedDeposit"("destination", "status");

-- CreateIndex
CREATE INDEX "DetectedDeposit_depositSessionId_status_idx" ON "DetectedDeposit"("depositSessionId", "status");

-- CreateIndex
CREATE INDEX "DetectedDeposit_transactionId_status_idx" ON "DetectedDeposit"("transactionId", "status");

-- CreateIndex
CREATE INDEX "DetectedDeposit_status_lastCheckedAt_idx" ON "DetectedDeposit"("status", "lastCheckedAt");

-- AddForeignKey
ALTER TABLE "DetectedDeposit" ADD CONSTRAINT "DetectedDeposit_depositSessionId_fkey" FOREIGN KEY ("depositSessionId") REFERENCES "DepositSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedDeposit" ADD CONSTRAINT "DetectedDeposit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedDeposit" ADD CONSTRAINT "DetectedDeposit_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
