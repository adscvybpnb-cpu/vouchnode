-- Enforce one detected chain event per network, transaction, and event index.
-- Native transfers use the default eventIndex of -1.
ALTER TABLE "DetectedDeposit"
  ALTER COLUMN "eventIndex" SET DEFAULT -1;

CREATE UNIQUE INDEX "DetectedDeposit_network_transactionHash_eventIndex_key"
  ON "DetectedDeposit"("network", "transactionHash", "eventIndex");
