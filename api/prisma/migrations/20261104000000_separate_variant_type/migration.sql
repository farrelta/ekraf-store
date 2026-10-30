BEGIN;
ALTER TABLE product_variants ADD COLUMN type TEXT NOT NULL DEFAULT 'STANDARD';
DROP INDEX product_variants_product_id_size_color_key;
UPDATE product_variants v SET type=v.color,color='STANDARD' FROM products p WHERE p.id=v.product_id AND p.option_label='Type';
CREATE UNIQUE INDEX product_variants_product_id_size_color_type_key ON product_variants(product_id,size,color,type);
ALTER TABLE products DROP COLUMN option_label;
COMMIT;
