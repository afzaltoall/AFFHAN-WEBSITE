-- Cargo tracking (the owner, 2026-10-24): assigner accounts keep the shipment sheet in the staff workspace, and
-- customers follow their cargo by its console / FCL / LCL number on /shipping/ (Live track & trace).
--
-- Additive only: one column with a default on Employee (every existing account stays SALES, the sales workspace
-- it has today) and three new tables with their indexes and foreign keys. Nothing existing is dropped, renamed,
-- rewritten or copied. Generated with `prisma migrate diff` from the schema at 2d29d84.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "job" TEXT NOT NULL DEFAULT 'SALES';

-- CreateTable
CREATE TABLE "CargoShipment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "type" TEXT,
    "pol" TEXT,
    "pod" TEXT,
    "etd" DATE,
    "eta" DATE,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoChange" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "reference" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "byId" TEXT,
    "byName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoShipment_referenceKey_key" ON "CargoShipment"("referenceKey");

-- CreateIndex
CREATE INDEX "CargoShipment_status_idx" ON "CargoShipment"("status");

-- CreateIndex
CREATE INDEX "CargoShipment_updatedAt_idx" ON "CargoShipment"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CargoEvent_shipmentId_date_idx" ON "CargoEvent"("shipmentId", "date");

-- CreateIndex
CREATE INDEX "CargoChange_createdAt_idx" ON "CargoChange"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "CargoChange_shipmentId_idx" ON "CargoChange"("shipmentId");

-- AddForeignKey
ALTER TABLE "CargoEvent" ADD CONSTRAINT "CargoEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "CargoShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoChange" ADD CONSTRAINT "CargoChange_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "CargoShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
