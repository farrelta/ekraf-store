ALTER TABLE products ADD COLUMN embroidery_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE payment_submissions DROP CONSTRAINT IF EXISTS verified_reference_check;
CREATE TABLE announcements (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
 published BOOLEAN NOT NULL DEFAULT false, starts_at TIMESTAMP(3), ends_at TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL,
 CONSTRAINT announcement_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX announcements_published_starts_at_ends_at_idx ON announcements(published, starts_at, ends_at);
INSERT INTO announcements(id,title,body,published,created_at,updated_at)
 SELECT 'legacy-' || id, name, announcement, false, created_at, updated_at FROM batches WHERE length(trim(announcement)) > 0;
