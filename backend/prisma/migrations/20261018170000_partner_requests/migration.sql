-- CreateEnum
CREATE TYPE "PartnerRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'ONBOARDED', 'DECLINED');

-- CreateTable
CREATE TABLE "partner_requests" (
    "id" TEXT NOT NULL,
    "restaurantName" VARCHAR(120) NOT NULL,
    "contactName" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "cuisine" VARCHAR(80),
    "message" VARCHAR(1000),
    "status" "PartnerRequestStatus" NOT NULL DEFAULT 'NEW',
    "internalNote" VARCHAR(500),
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_requests_status_createdAt_idx" ON "partner_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_requests_phone_idx" ON "partner_requests"("phone");

