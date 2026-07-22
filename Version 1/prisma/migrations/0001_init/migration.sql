-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('WHISH_MONEY', 'CASH_ON_DELIVERY');

-- CreateTable
CREATE TABLE "Flower" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "pricePerStem" INTEGER NOT NULL,
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
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryTimeSlot" TEXT NOT NULL,
    "giftNoteRecipient" TEXT NOT NULL,
    "giftNoteMessage" TEXT NOT NULL,
    "giftNoteFrom" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bouquet" (
    "id" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "stemCount" INTEGER NOT NULL,

    CONSTRAINT "Bouquet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BouquetFlower" (
    "id" TEXT NOT NULL,
    "bouquetId" TEXT NOT NULL,
    "flowerId" TEXT NOT NULL,
    "stemCount" INTEGER NOT NULL,

    CONSTRAINT "BouquetFlower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BouquetWrap" (
    "id" TEXT NOT NULL,
    "bouquetId" TEXT NOT NULL,
    "wrapColorId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BouquetWrap_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Bouquet_orderId_key" ON "Bouquet"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BouquetFlower_bouquetId_flowerId_key" ON "BouquetFlower"("bouquetId", "flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "BouquetWrap_bouquetId_wrapColorId_key" ON "BouquetWrap"("bouquetId", "wrapColorId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bouquet" ADD CONSTRAINT "Bouquet_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetFlower" ADD CONSTRAINT "BouquetFlower_bouquetId_fkey" FOREIGN KEY ("bouquetId") REFERENCES "Bouquet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetFlower" ADD CONSTRAINT "BouquetFlower_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "Flower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetWrap" ADD CONSTRAINT "BouquetWrap_bouquetId_fkey" FOREIGN KEY ("bouquetId") REFERENCES "Bouquet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetWrap" ADD CONSTRAINT "BouquetWrap_wrapColorId_fkey" FOREIGN KEY ("wrapColorId") REFERENCES "WrapColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

