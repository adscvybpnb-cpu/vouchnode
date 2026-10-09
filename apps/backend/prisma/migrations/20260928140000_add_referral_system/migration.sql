ALTER TABLE "User"
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredById" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

ALTER TABLE "User"
ADD CONSTRAINT "User_referredById_fkey"
FOREIGN KEY ("referredById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCommission_orderId_key" ON "ReferralCommission"("orderId");
CREATE INDEX "ReferralCommission_referrerId_createdAt_idx" ON "ReferralCommission"("referrerId", "createdAt");
CREATE INDEX "ReferralCommission_referredUserId_idx" ON "ReferralCommission"("referredUserId");

ALTER TABLE "ReferralCommission"
ADD CONSTRAINT "ReferralCommission_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ReferralCommission_referrerId_fkey"
FOREIGN KEY ("referrerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ReferralCommission_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ReferralCommission_currency_fkey"
FOREIGN KEY ("currency") REFERENCES "Currency"("code")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "LedgerType" ADD VALUE 'REFERRAL_COMMISSION';
