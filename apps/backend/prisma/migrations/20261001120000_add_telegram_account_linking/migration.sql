ALTER TABLE "User"
ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "tgVerificationToken" TEXT,
ADD COLUMN "tgVerificationExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
