ALTER TABLE "Wallet"
  ALTER COLUMN "availableBalance" TYPE DECIMAL(30, 18),
  ALTER COLUMN "escrowBalance" TYPE DECIMAL(30, 18);

ALTER TABLE "LedgerEntry"
  ALTER COLUMN "amount" TYPE DECIMAL(30, 18);

ALTER TABLE "P2POrder"
  ALTER COLUMN "cryptoAmount" TYPE DECIMAL(30, 18),
  ADD COLUMN "giftCardValueUSD" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "giftCardRate" DECIMAL(12, 8),
  ADD COLUMN "cryptoUsdPrice" DECIMAL(30, 18),
  ADD COLUMN "pricingVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "P2POrder" AS orders
SET
  "giftCardValueUSD" = orders."amountUSD",
  "giftCardRate" = offers."exchangeRate"
FROM "P2POffer" AS offers
WHERE offers."id" = orders."offerId";

UPDATE "P2POffer"
SET "isActive" = FALSE
WHERE "isActive" = TRUE;
