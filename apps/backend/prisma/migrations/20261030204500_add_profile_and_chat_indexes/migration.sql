CREATE INDEX "Conversation_buyerId_sellerId_isActive_idx"
ON "Conversation" ("buyerId", "sellerId", "isActive");

CREATE INDEX "Review_sellerId_isVisible_createdAt_idx"
ON "Review" ("sellerId", "isVisible", "createdAt" DESC);

CREATE INDEX "Review_sellerId_isVisible_rating_idx"
ON "Review" ("sellerId", "isVisible", "rating");

CREATE INDEX "Message_conversationId_createdAt_idx"
ON "Message" ("conversationId", "createdAt", "id");
