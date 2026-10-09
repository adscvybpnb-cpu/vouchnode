/*
  Warnings:

  - Made the column `eventIndex` on table `DetectedDeposit` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CryptoDeposit" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- AlterTable
ALTER TABLE "DepositSession" ALTER COLUMN "expiresAt" SET DEFAULT CURRENT_TIMESTAMP + interval '1 hour';

-- AlterTable
ALTER TABLE "DetectedDeposit" ALTER COLUMN "eventIndex" SET NOT NULL;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
