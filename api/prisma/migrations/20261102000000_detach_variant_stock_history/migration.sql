BEGIN;
DROP TRIGGER inventory_append_only ON inventory_movements;
ALTER TABLE inventory_movements ADD COLUMN variant_sku TEXT;
UPDATE inventory_movements m SET variant_sku=v.sku FROM product_variants v WHERE v.id=m.variant_id;
ALTER TABLE inventory_movements ALTER COLUMN variant_sku SET NOT NULL;
ALTER TABLE inventory_movements ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_variant_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_variant_id_fkey FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE FUNCTION protect_inventory_history() RETURNS trigger AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.variant_id IS NOT NULL AND NEW.variant_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM product_variants WHERE id=OLD.variant_id)
 AND (to_jsonb(NEW)-'variant_id')=(to_jsonb(OLD)-'variant_id') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Inventory history is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_append_only BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
COMMIT;
