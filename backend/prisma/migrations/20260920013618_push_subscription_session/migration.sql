/*
  Warnings:

  - Added the required column `sessionId` to the `push_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "sessionId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "push_subscriptions_sessionId_idx" ON "push_subscriptions"("sessionId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
