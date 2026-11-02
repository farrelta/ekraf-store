-- Existing accounts keep a null phone until they save their contact details.
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
