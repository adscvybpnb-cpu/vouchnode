ALTER TABLE "DepositSession" ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "DepositSession_orderId_key" ON "DepositSession"("orderId");

CREATE INDEX "DepositSession_orderId_idx" ON "DepositSession"("orderId");

ALTER TABLE "DepositSession"
ADD CONSTRAINT "DepositSession_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
