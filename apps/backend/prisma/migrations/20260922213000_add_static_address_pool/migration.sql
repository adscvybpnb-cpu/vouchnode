-- CreateEnum
CREATE TYPE "StaticAddressStatus" AS ENUM ('AVAILABLE', 'BUSY');

-- CreateTable
CREATE TABLE "StaticAddressPool" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "StaticAddressStatus" NOT NULL DEFAULT 'AVAILABLE',
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "StaticAddressPool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaticAddressPool_address_key" ON "StaticAddressPool"("address");

-- CreateIndex
CREATE INDEX "StaticAddressPool_asset_status_idx" ON "StaticAddressPool"("asset", "status");

-- CreateIndex
CREATE INDEX "StaticAddressPool_orderId_idx" ON "StaticAddressPool"("orderId");
