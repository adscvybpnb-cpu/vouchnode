CREATE TABLE "FirstDepositBonus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "depositSessionId" TEXT NOT NULL,
    "depositCurrency" TEXT NOT NULL,
    "depositAmount" DECIMAL(30,18) NOT NULL,
    "depositUsdValue" DECIMAL(20,8) NOT NULL,
    "bonusAmount" DECIMAL(20,8) NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirstDepositBonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FirstDepositBonus_userId_key" ON "FirstDepositBonus"("userId");
CREATE UNIQUE INDEX "FirstDepositBonus_depositSessionId_key" ON "FirstDepositBonus"("depositSessionId");
CREATE INDEX "FirstDepositBonus_createdAt_idx" ON "FirstDepositBonus"("createdAt");

ALTER TABLE "FirstDepositBonus"
ADD CONSTRAINT "FirstDepositBonus_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FirstDepositBonus"
ADD CONSTRAINT "FirstDepositBonus_depositSessionId_fkey"
FOREIGN KEY ("depositSessionId") REFERENCES "DepositSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
