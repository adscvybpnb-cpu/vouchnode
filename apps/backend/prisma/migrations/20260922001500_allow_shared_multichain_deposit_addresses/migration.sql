-- Allow one derived address to be used on multiple networks while keeping
-- each address unique within its network.
DROP INDEX "CryptoDeposit_address_key";

CREATE UNIQUE INDEX "CryptoDeposit_address_network_key"
ON "CryptoDeposit"("address", "network");
