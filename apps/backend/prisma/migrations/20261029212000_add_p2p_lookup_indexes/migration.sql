CREATE INDEX "P2POffer_type_isActive_cryptoAsset_updatedAt_idx"
ON "P2POffer" ("type", "isActive", "cryptoAsset", "updatedAt");

CREATE INDEX "P2POrder_sellerId_createdAt_idx"
ON "P2POrder" ("sellerId", "createdAt");
