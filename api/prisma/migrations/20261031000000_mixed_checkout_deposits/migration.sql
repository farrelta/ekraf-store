-- PostgreSQL enum changes commit before the transactional data migration.
ALTER TYPE payment_status ADD VALUE 'PARTIALLY_PAID';
BEGIN;
CREATE TYPE payment_plans AS ENUM ('FULL', 'BATCH_DEPOSIT');
CREATE TYPE payment_phases AS ENUM ('INITIAL', 'BALANCE');
ALTER TABLE orders ADD COLUMN payment_plan payment_plans NOT NULL DEFAULT 'FULL', ADD COLUMN initial_amount DECIMAL(12,2);
ALTER TABLE order_items ADD COLUMN batch_id TEXT, ADD COLUMN pickup_status pickup_status NOT NULL DEFAULT 'PENDING';
-- Preserve existing batch associations and pickup progress before moving them.
UPDATE order_items i SET batch_id=o.batch_id,pickup_status=o.pickup_status FROM orders o WHERE o.id=i.order_id;
UPDATE orders o SET initial_amount=(SELECT SUM(i.unit_price*i.quantity) FROM order_items i WHERE i.order_id=o.id);
ALTER TABLE orders ALTER COLUMN initial_amount SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT positive_initial_amount CHECK(initial_amount > 0);
ALTER TABLE orders DROP CONSTRAINT orders_batch_id_fkey;
DROP INDEX orders_batch_id_idx;
ALTER TABLE orders DROP COLUMN batch_id,DROP COLUMN pickup_status;
ALTER TABLE payment_submissions ADD COLUMN phase payment_phases NOT NULL DEFAULT 'INITIAL';
ALTER TABLE inventory_movements ADD COLUMN order_item_id TEXT;
-- Historical stock history remains untouched and may have null order_item_id.
CREATE INDEX order_items_batch_id_pickup_status_idx ON order_items(batch_id,pickup_status);
CREATE INDEX inventory_movements_order_item_id_idx ON inventory_movements(order_item_id);
ALTER TABLE order_items ADD CONSTRAINT order_items_batch_id_fkey FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_order_item_id_fkey FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX payment_one_verified_per_order;
CREATE UNIQUE INDEX payment_one_verified_per_phase ON payment_submissions(order_id,phase) WHERE status='VERIFIED';
CREATE OR REPLACE FUNCTION protect_payment_review() RETURNS trigger AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment history cannot be deleted'; END IF;
 IF OLD.status<>'SUBMITTED' THEN RAISE EXCEPTION 'Reviewed payments cannot be modified'; END IF;
 IF NEW.status='SUBMITTED' OR NEW.phase<>OLD.phase OR NEW.order_id<>OLD.order_id OR NEW.payment_method_id<>OLD.payment_method_id OR NEW.method_snapshot IS DISTINCT FROM OLD.method_snapshot OR NEW.amount<>OLD.amount OR NEW.proof_key<>OLD.proof_key OR NEW.submitted_at<>OLD.submitted_at THEN
   RAISE EXCEPTION 'Payment evidence is immutable';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
COMMIT;
