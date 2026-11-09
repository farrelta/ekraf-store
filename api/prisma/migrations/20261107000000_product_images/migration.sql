ALTER TABLE products ADD COLUMN image_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE products SET image_keys = ARRAY[image_key] WHERE image_key IS NOT NULL;
