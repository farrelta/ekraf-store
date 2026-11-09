ALTER TABLE order_items ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE order_items DROP CONSTRAINT order_items_variant_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE order_items DROP CONSTRAINT order_items_batch_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_batch_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION protect_inventory_history() RETURNS trigger AS $$ BEGIN
 IF TG_OP='UPDATE'
 AND (NEW.variant_id IS NOT DISTINCT FROM OLD.variant_id OR
   (OLD.variant_id IS NOT NULL AND NEW.variant_id IS NULL AND NOT EXISTS(SELECT 1 FROM product_variants WHERE id=OLD.variant_id)))
 AND (NEW.batch_id IS NOT DISTINCT FROM OLD.batch_id OR
   (OLD.batch_id IS NOT NULL AND NEW.batch_id IS NULL AND NOT EXISTS(SELECT 1 FROM batches WHERE id=OLD.batch_id)))
 AND (NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.batch_id IS DISTINCT FROM OLD.batch_id)
 AND (to_jsonb(NEW)-'variant_id'-'batch_id')=(to_jsonb(OLD)-'variant_id'-'batch_id') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Inventory history is append-only';
END $$ LANGUAGE plpgsql;
