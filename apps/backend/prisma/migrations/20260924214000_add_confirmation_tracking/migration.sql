ALTER TABLE "Transaction"
ADD COLUMN "confirmationBlock" BIGINT,
ADD COLUMN "confirmations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requiredConfirmations" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "confirmationNetwork" TEXT;

CREATE INDEX "Transaction_status_confirmationBlock_idx"
ON "Transaction"("status", "confirmationBlock");
