CREATE INDEX "Product_sellerId_status_createdAt_idx" ON "Product"("sellerId", "status", "createdAt");

CREATE INDEX "Order_productId_paymentStatus_status_idx" ON "Order"("productId", "paymentStatus", "status");
