-- Physical receipts without an identifiable production order remain separate
-- from orders and stock; never fabricate an old order or rewrite past receipts.
CREATE TABLE incoming_unmatched_items (
 id uuid PRIMARY KEY,
 draft_id uuid NOT NULL REFERENCES incoming_goods_drafts(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 source_row_id uuid NOT NULL,
 date date NOT NULL,
 supplier text NOT NULL CHECK(length(trim(supplier))>0),
 sku text NOT NULL,
 color text NOT NULL,
 size text NOT NULL CHECK(size IN ('S','M','L','XL')),
 qty integer NOT NULL CHECK(qty BETWEEN 1 AND 1000000),
 bag text NOT NULL,
 variant_id uuid REFERENCES variants(id),
 reason text NOT NULL,
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(draft_id,source_row_id)
);
CREATE INDEX unmatched_date_idx ON incoming_unmatched_items(date);
CREATE INDEX receipt_date_idx ON production_receipts(date);
CREATE TRIGGER immutable_unmatched_receipts BEFORE UPDATE OR DELETE ON incoming_unmatched_items FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
