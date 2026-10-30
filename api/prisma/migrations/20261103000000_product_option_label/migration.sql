ALTER TABLE products ADD COLUMN option_label TEXT NOT NULL DEFAULT 'Color';
ALTER TABLE products ADD CONSTRAINT product_option_label_check CHECK (option_label IN ('Color', 'Type'));
