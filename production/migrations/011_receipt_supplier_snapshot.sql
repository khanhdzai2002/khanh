-- Preserve factory attribution for new receipt reports even if order metadata
-- changes later. Old immutable receipts remain untouched and use order fallback.
ALTER TABLE production_receipts ADD COLUMN supplier_snapshot text;
