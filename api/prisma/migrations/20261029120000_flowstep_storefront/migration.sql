-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SaleType" AS ENUM ('CONTINUOUS', 'BATCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProductPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BatchOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PaymentMethodType" AS ENUM ('QRIS', 'BANK_TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RESERVATION';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RELEASE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RECEIPT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'BATCH_RECEIPT';

-- Enum additions commit separately; all table changes and backfills are atomic.
BEGIN;

-- Stop legacy checkout/expiry writes while taking inventory snapshots.
LOCK TABLE "Product", "Order", "OrderItem" IN SHARE ROW EXCLUSIVE MODE;

-- Reconcile abandoned variant data explicitly rather than duplicating stock.
DO $preflight$
BEGIN
  IF to_regclass('"ProductVariant"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "ProductVariant" WHERE "sku" NOT LIKE 'LEGACY-%') THEN
      RAISE EXCEPTION 'Existing non-legacy variants require reconciliation before applying the Flowstep migration';
    END IF;
  END IF;
END
$preflight$;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "allowBatchOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "publicationStatus" "ProductPublicationStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "batchOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryCity" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryPostalCode" TEXT,
ADD COLUMN IF NOT EXISTS "saleType" "SaleType" NOT NULL DEFAULT 'CONTINUOUS',
ADD COLUMN IF NOT EXISTS "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "customization" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "variantId" TEXT,
ADD COLUMN IF NOT EXISTS "variantLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "variantSku" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "batchOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "variantId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "altText" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "colorHex" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "reorderThreshold" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VariantOptionValue" (
    "variantId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,

    CONSTRAINT "VariantOptionValue_pkey" PRIMARY KEY ("variantId","optionValueId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BatchOrder" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "batchName" TEXT NOT NULL,
    "status" "BatchOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "estimatedProductionWeeks" INTEGER NOT NULL DEFAULT 4,
    "expectedDeliveryStartAt" TIMESTAMP(3),
    "expectedDeliveryEndAt" TIMESTAMP(3),
    "minimumQuantity" INTEGER,
    "maximumQuantity" INTEGER,
    "announcement" TEXT NOT NULL DEFAULT '',
    "customizationFields" JSONB NOT NULL DEFAULT '[]',
    "cancellationTerms" TEXT NOT NULL DEFAULT '',
    "refundTerms" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BatchOrderVariant" (
    "batchOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "productionQuantity" INTEGER,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BatchOrderVariant_pkey" PRIMARY KEY ("batchOrderId","variantId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "qrImageKey" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentSubmission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "methodId" TEXT,
    "methodNameSnapshot" TEXT NOT NULL,
    "methodDetailsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "proofStorageKey" TEXT,
    "proofMimeType" TEXT,
    "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- The SKU constraint must exist before INSERT ... ON CONFLICT below.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- Existing Product.stock excludes units reserved by pending orders. Reconstruct
-- on-hand and reserved separately so available inventory remains unchanged.
INSERT INTO "ProductVariant" (
    "id", "productId", "sku", "label", "price", "onHand", "reserved",
    "reorderThreshold", "active", "createdAt", "updatedAt"
)
SELECT
    'legacyvar_' || substr(md5(p."id"), 1, 20),
    p."id",
    'LEGACY-' || p."id",
    'Standard',
    p."price",
    p."stock" + COALESCE(pending."quantity", 0),
    COALESCE(pending."quantity", 0),
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product" p
LEFT JOIN (
    SELECT oi."productId", SUM(oi."quantity")::INTEGER AS "quantity"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    WHERE oi."productId" IS NOT NULL
      AND o."paymentStatus" = 'PENDING'
      AND o."fulfillmentStatus" = 'PENDING'
    GROUP BY oi."productId"
) pending ON pending."productId" = p."id"
ON CONFLICT ("sku") DO NOTHING;

-- Order items can reference the generated default variant. InventoryMovement
-- history is append-only, so older ledger entries intentionally keep variantId NULL.
UPDATE "OrderItem" oi
SET "variantId" = pv."id", "variantSku" = pv."sku", "variantLabel" = pv."label"
FROM "ProductVariant" pv
WHERE oi."productId" = pv."productId"
  AND pv."sku" = 'LEGACY-' || oi."productId"
  AND oi."variantId" IS NULL;

DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_price_nonnegative_check' AND conrelid = '"ProductVariant"'::regclass) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonnegative_check" CHECK ("price" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_onHand_nonnegative_check' AND conrelid = '"ProductVariant"'::regclass) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_onHand_nonnegative_check" CHECK ("onHand" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_reserved_valid_check' AND conrelid = '"ProductVariant"'::regclass) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_reserved_valid_check" CHECK ("reserved" >= 0 AND "reserved" <= "onHand");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_reorderThreshold_nonnegative_check' AND conrelid = '"ProductVariant"'::regclass) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_reorderThreshold_nonnegative_check" CHECK ("reorderThreshold" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_shippingFee_nonnegative_check' AND conrelid = '"Order"'::regclass) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingFee_nonnegative_check" CHECK ("shippingFee" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_saleType_batchOrder_check' AND conrelid = '"Order"'::regclass) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_saleType_batchOrder_check" CHECK (("saleType" = 'BATCH') = ("batchOrderId" IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_window_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_window_check" CHECK ("opensAt" < "closesAt");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_productionWeeks_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_productionWeeks_check" CHECK ("estimatedProductionWeeks" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_minimumQuantity_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_minimumQuantity_check" CHECK ("minimumQuantity" IS NULL OR "minimumQuantity" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_maximumQuantity_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_maximumQuantity_check" CHECK ("maximumQuantity" IS NULL OR "maximumQuantity" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_quantityRange_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_quantityRange_check" CHECK ("minimumQuantity" IS NULL OR "maximumQuantity" IS NULL OR "minimumQuantity" <= "maximumQuantity");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_deliveryWindow_check' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_deliveryWindow_check" CHECK ("expectedDeliveryStartAt" IS NULL OR "expectedDeliveryEndAt" IS NULL OR "expectedDeliveryStartAt" <= "expectedDeliveryEndAt");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrderVariant_price_nonnegative_check' AND conrelid = '"BatchOrderVariant"'::regclass) THEN
    ALTER TABLE "BatchOrderVariant" ADD CONSTRAINT "BatchOrderVariant_price_nonnegative_check" CHECK ("price" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrderVariant_quantities_nonnegative_check' AND conrelid = '"BatchOrderVariant"'::regclass) THEN
    ALTER TABLE "BatchOrderVariant" ADD CONSTRAINT "BatchOrderVariant_quantities_nonnegative_check" CHECK (("productionQuantity" IS NULL OR "productionQuantity" >= 0) AND "receivedQuantity" >= 0 AND "damagedQuantity" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentSubmission_amount_nonnegative_check' AND conrelid = '"PaymentSubmission"'::regclass) THEN
    ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_amount_nonnegative_check" CHECK ("amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_rating_range_check' AND conrelid = '"ProductReview"'::regclass) THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5);
  END IF;
END
$checks$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductOption_productId_position_idx" ON "ProductOption"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductOptionValue_optionId_position_idx" ON "ProductOptionValue"("optionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VariantOptionValue_optionValueId_idx" ON "VariantOptionValue"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BatchOrder_publicId_key" ON "BatchOrder"("publicId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BatchOrder_status_opensAt_closesAt_idx" ON "BatchOrder"("status", "opensAt", "closesAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BatchOrder_productId_createdAt_idx" ON "BatchOrder"("productId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BatchOrderVariant_variantId_idx" ON "BatchOrderVariant"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethod_code_key" ON "PaymentMethod"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentMethod_enabled_position_idx" ON "PaymentMethod"("enabled", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentSubmission_status_submittedAt_idx" ON "PaymentSubmission"("status", "submittedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentSubmission_orderId_submittedAt_idx" ON "PaymentSubmission"("orderId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_orderItemId_key" ON "ProductReview"("orderItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductReview_userId_createdAt_idx" ON "ProductReview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_batchOrderId_paymentStatus_fulfillmentStatus_idx" ON "Order"("batchOrderId", "paymentStatus", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_variantId_createdAt_idx" ON "InventoryMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_batchOrderId_createdAt_idx" ON "InventoryMovement"("batchOrderId", "createdAt");

DO $foreign_keys$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_batchOrderId_fkey' AND conrelid = '"Order"'::regclass) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_batchOrderId_fkey" FOREIGN KEY ("batchOrderId") REFERENCES "BatchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_variantId_fkey' AND conrelid = '"OrderItem"'::regclass) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_variantId_fkey' AND conrelid = '"InventoryMovement"'::regclass) THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_batchOrderId_fkey' AND conrelid = '"InventoryMovement"'::regclass) THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchOrderId_fkey" FOREIGN KEY ("batchOrderId") REFERENCES "BatchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductImage_productId_fkey' AND conrelid = '"ProductImage"'::regclass) THEN
    ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOption_productId_fkey' AND conrelid = '"ProductOption"'::regclass) THEN
    ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOptionValue_optionId_fkey' AND conrelid = '"ProductOptionValue"'::regclass) THEN
    ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_productId_fkey' AND conrelid = '"ProductVariant"'::regclass) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VariantOptionValue_variantId_fkey' AND conrelid = '"VariantOptionValue"'::regclass) THEN
    ALTER TABLE "VariantOptionValue" ADD CONSTRAINT "VariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VariantOptionValue_optionValueId_fkey' AND conrelid = '"VariantOptionValue"'::regclass) THEN
    ALTER TABLE "VariantOptionValue" ADD CONSTRAINT "VariantOptionValue_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "ProductOptionValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_productId_fkey' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrder_createdById_fkey' AND conrelid = '"BatchOrder"'::regclass) THEN
    ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrderVariant_batchOrderId_fkey' AND conrelid = '"BatchOrderVariant"'::regclass) THEN
    ALTER TABLE "BatchOrderVariant" ADD CONSTRAINT "BatchOrderVariant_batchOrderId_fkey" FOREIGN KEY ("batchOrderId") REFERENCES "BatchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchOrderVariant_variantId_fkey' AND conrelid = '"BatchOrderVariant"'::regclass) THEN
    ALTER TABLE "BatchOrderVariant" ADD CONSTRAINT "BatchOrderVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentSubmission_orderId_fkey' AND conrelid = '"PaymentSubmission"'::regclass) THEN
    ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentSubmission_methodId_fkey' AND conrelid = '"PaymentSubmission"'::regclass) THEN
    ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentSubmission_reviewedById_fkey' AND conrelid = '"PaymentSubmission"'::regclass) THEN
    ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_productId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_userId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_orderItemId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$foreign_keys$;

COMMIT;
