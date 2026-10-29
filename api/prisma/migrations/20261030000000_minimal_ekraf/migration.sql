-- Fresh-start migration: refuse to destroy populated legacy data.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Product") OR EXISTS (SELECT 1 FROM "Order") THEN
   RAISE EXCEPTION 'Reset the local project database before applying the minimal EKRAF schema';
 END IF;
END $$;

-- CreateEnum
CREATE TYPE "roles" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "selling_types" AS ENUM ('CONTINUOUS', 'BATCH');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "batch_status" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'IN_PRODUCTION', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pickup_status" AS ENUM ('PENDING', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_method_types" AS ENUM ('QRIS', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "inventory_movement_types" AS ENUM ('RESERVATION', 'RELEASE', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "BatchOrder" DROP CONSTRAINT "BatchOrder_createdById_fkey";

-- DropForeignKey
ALTER TABLE "BatchOrder" DROP CONSTRAINT "BatchOrder_productId_fkey";

-- DropForeignKey
ALTER TABLE "BatchOrderVariant" DROP CONSTRAINT "BatchOrderVariant_batchOrderId_fkey";

-- DropForeignKey
ALTER TABLE "BatchOrderVariant" DROP CONSTRAINT "BatchOrderVariant_variantId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_batchOrderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_batchOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentEvent" DROP CONSTRAINT "PaymentEvent_actorId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentEvent" DROP CONSTRAINT "PaymentEvent_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSubmission" DROP CONSTRAINT "PaymentSubmission_methodId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSubmission" DROP CONSTRAINT "PaymentSubmission_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSubmission" DROP CONSTRAINT "PaymentSubmission_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "ProductImage" DROP CONSTRAINT "ProductImage_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductOption" DROP CONSTRAINT "ProductOption_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductOptionValue" DROP CONSTRAINT "ProductOptionValue_optionId_fkey";

-- DropForeignKey
ALTER TABLE "ProductReview" DROP CONSTRAINT "ProductReview_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "ProductReview" DROP CONSTRAINT "ProductReview_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductReview" DROP CONSTRAINT "ProductReview_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "VariantOptionValue" DROP CONSTRAINT "VariantOptionValue_optionValueId_fkey";

-- DropForeignKey
ALTER TABLE "VariantOptionValue" DROP CONSTRAINT "VariantOptionValue_variantId_fkey";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "BatchOrder";

-- DropTable
DROP TABLE "BatchOrderVariant";

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "InventoryMovement";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "OrderItem";

-- DropTable
DROP TABLE "PaymentEvent";

-- DropTable
DROP TABLE "PaymentMethod";

-- DropTable
DROP TABLE "PaymentSubmission";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "ProductImage";

-- DropTable
DROP TABLE "ProductOption";

-- DropTable
DROP TABLE "ProductOptionValue";

-- DropTable
DROP TABLE "ProductReview";

-- DropTable
DROP TABLE "ProductVariant";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "VariantOptionValue";

-- Express session storage remains managed outside Prisma.

-- DropEnum
DROP TYPE "BatchOrderStatus";

-- DropEnum
DROP TYPE "FulfillmentStatus";

-- DropEnum
DROP TYPE "InventoryMovementType";

-- DropEnum
DROP TYPE "PaymentMethodType";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "PaymentSubmissionStatus";

-- DropEnum
DROP TYPE "ProductPublicationStatus";

-- DropEnum
DROP TYPE "ReviewStatus";

-- DropEnum
DROP TYPE "Role";

-- DropEnum
DROP TYPE "SaleType";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "roles" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "category" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image_key" TEXT,
    "selling_type" "selling_types" NOT NULL,
    "status" "product_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT 'STANDARD',
    "color" TEXT NOT NULL DEFAULT 'STANDARD',
    "price" DECIMAL(12,2) NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "batch_status" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "production_weeks" INTEGER NOT NULL DEFAULT 4,
    "announcement" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "payment_status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "pickup_status" "pickup_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "embroidery_name" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "type" "payment_method_types" NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "qr_image_key" TEXT,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_method_id" TEXT NOT NULL,
    "method_snapshot" JSONB NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_reference" TEXT,
    "proof_key" TEXT NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by" TEXT,
    "review_reason" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "order_id" TEXT,
    "batch_id" TEXT,
    "actor_id" TEXT,
    "type" "inventory_movement_types" NOT NULL,
    "on_hand_delta" INTEGER NOT NULL DEFAULT 0,
    "reserved_delta" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_status_name_idx" ON "products"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_size_color_key" ON "product_variants"("product_id", "size", "color");

-- CreateIndex
CREATE INDEX "batches_status_closes_at_idx" ON "batches"("status", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "batches_product_id_name_key" ON "batches"("product_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_batch_id_idx" ON "orders"("batch_id");

-- CreateIndex
CREATE INDEX "orders_payment_status_expires_at_idx" ON "orders"("payment_status", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "payment_submissions_order_id_submitted_at_idx" ON "payment_submissions"("order_id", "submitted_at");

-- CreateIndex
CREATE INDEX "payment_submissions_status_submitted_at_idx" ON "payment_submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movements_batch_id_idx" ON "inventory_movements"("batch_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE product_variants ADD CONSTRAINT variant_stock_check CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand), ADD CONSTRAINT variant_price_check CHECK (price > 0);
ALTER TABLE batches ADD CONSTRAINT batch_window_check CHECK (opens_at < closes_at), ADD CONSTRAINT batch_production_check CHECK (production_weeks > 0);
ALTER TABLE orders ADD CONSTRAINT order_deadline_check CHECK (expires_at > created_at);
ALTER TABLE order_items ADD CONSTRAINT item_quantity_check CHECK (quantity > 0), ADD CONSTRAINT item_price_check CHECK (unit_price > 0);
ALTER TABLE inventory_movements ADD CONSTRAINT nonzero_movement_check CHECK (on_hand_delta <> 0 OR reserved_delta <> 0);
ALTER TABLE payment_methods ADD CONSTRAINT method_details_check CHECK (
 (type = 'QRIS' AND qr_image_key IS NOT NULL AND bank_name IS NULL AND account_name IS NULL AND account_number IS NULL)
 OR (type = 'BANK_TRANSFER' AND qr_image_key IS NULL AND bank_name IS NOT NULL AND account_name IS NOT NULL AND account_number IS NOT NULL)
);
ALTER TABLE payment_submissions ADD CONSTRAINT payment_positive_check CHECK (amount > 0),
 ADD CONSTRAINT review_details_check CHECK (
 (status = 'SUBMITTED' AND reviewed_by IS NULL AND reviewed_at IS NULL)
 OR (status IN ('VERIFIED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 ), ADD CONSTRAINT rejection_reason_check CHECK (status <> 'REJECTED' OR length(trim(review_reason)) > 0 AND review_reason IS NOT NULL),
 ADD CONSTRAINT verified_reference_check CHECK (status <> 'VERIFIED' OR length(trim(transaction_reference)) > 0 AND transaction_reference IS NOT NULL);
CREATE UNIQUE INDEX payment_one_pending_per_order ON payment_submissions(order_id) WHERE status = 'SUBMITTED';
CREATE UNIQUE INDEX payment_one_verified_per_order ON payment_submissions(order_id) WHERE status = 'VERIFIED';
CREATE UNIQUE INDEX payment_verified_reference_unique ON payment_submissions(payment_method_id, transaction_reference) WHERE status = 'VERIFIED';
CREATE TRIGGER inventory_append_only BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();
CREATE FUNCTION protect_payment_review() RETURNS trigger AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment history cannot be deleted'; END IF;
 IF OLD.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'Reviewed payments cannot be modified'; END IF;
 IF NEW.status = 'SUBMITTED' OR NEW.order_id <> OLD.order_id OR NEW.payment_method_id <> OLD.payment_method_id OR NEW.method_snapshot IS DISTINCT FROM OLD.method_snapshot OR NEW.amount <> OLD.amount OR NEW.proof_key <> OLD.proof_key OR NEW.submitted_at <> OLD.submitted_at THEN
   RAISE EXCEPTION 'Payment evidence is immutable';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payment_review_history BEFORE UPDATE OR DELETE ON payment_submissions FOR EACH ROW EXECUTE FUNCTION protect_payment_review();
COMMIT;
