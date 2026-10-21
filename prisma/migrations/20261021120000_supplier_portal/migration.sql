-- The supplier portal (the owner, 2026-10-21; branch feat/supplier-portal): suppliers create an account at
-- /supplier/login/ (name, email, mobile, password), browse the catalogue, and apply for the products they make
-- with their MOQ, the product's details, photos if they have them, and their company, WeChat ID and address.
-- Generated with `prisma migrate diff` from main's schema. Two new tables, their indexes and two foreign keys:
-- nothing that exists changes. SupplierOffer's foreign key to Product locks Product for an instant while it is
-- added (it checks an empty table), and nothing writes to Product now.
--
-- The project changes its schema with `db push` and has no migration history, so this is applied by hand, on
-- a Neon branch first, and on production only with the owner's go:
--
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261021120000_supplier_portal/migration.sql
--
-- BEFORE the code is deployed: the supplier pages and routes read these tables. (The admin rail counts the
-- waiting applications on its own and shows no figure while the table is missing; the New Suppliers page says
-- so; nothing else reads them.)
--
-- Never `prisma migrate dev` / `migrate deploy` against this database: with no history, migrate dev sees drift
-- and offers to reset it.

-- CreateTable
CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "companyName" TEXT,
    "wechatId" TEXT,
    "companyAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOffer" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "productImage" TEXT,
    "categoryName" TEXT,
    "moq" INTEGER NOT NULL,
    "moqUnit" TEXT NOT NULL DEFAULT 'pieces',
    "details" TEXT NOT NULL,
    "photos" TEXT[],
    "contactName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "wechatId" TEXT NOT NULL,
    "companyAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reply" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAccount_email_key" ON "SupplierAccount"("email");

-- CreateIndex
CREATE INDEX "SupplierAccount_createdAt_idx" ON "SupplierAccount"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplierOffer_supplierId_createdAt_idx" ON "SupplierOffer"("supplierId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplierOffer_status_createdAt_idx" ON "SupplierOffer"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplierOffer_createdAt_idx" ON "SupplierOffer"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplierOffer_productId_idx" ON "SupplierOffer"("productId");

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

