-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "Flower" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'main',
    "pricePerStem" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrapColor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "priceModifier" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrapColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "stemCount" INTEGER NOT NULL,
    "imageData" BYTEA NOT NULL,
    "imageMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftFlower" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "flowerId" TEXT NOT NULL,
    "stemCount" INTEGER NOT NULL,

    CONSTRAINT "GiftFlower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftWrap" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "wrapColorId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "GiftWrap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flower_name_key" ON "Flower"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Flower_sortOrder_key" ON "Flower"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WrapColor_name_key" ON "WrapColor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WrapColor_sortOrder_key" ON "WrapColor"("sortOrder");

-- CreateIndex
CREATE INDEX "Gift_status_scheduledAt_idx" ON "Gift"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftFlower_giftId_flowerId_key" ON "GiftFlower"("giftId", "flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftWrap_giftId_wrapColorId_key" ON "GiftWrap"("giftId", "wrapColorId");

-- AddForeignKey
ALTER TABLE "GiftFlower" ADD CONSTRAINT "GiftFlower_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftFlower" ADD CONSTRAINT "GiftFlower_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "Flower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftWrap" ADD CONSTRAINT "GiftWrap_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftWrap" ADD CONSTRAINT "GiftWrap_wrapColorId_fkey" FOREIGN KEY ("wrapColorId") REFERENCES "WrapColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

