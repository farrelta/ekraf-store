BEGIN;
ALTER TABLE products ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE batches ADD COLUMN updated_at TIMESTAMP(3);
UPDATE batches SET updated_at=created_at;
ALTER TABLE batches ALTER COLUMN updated_at SET NOT NULL;
COMMIT;
