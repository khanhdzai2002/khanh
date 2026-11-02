-- Append-only evidence. Existing photos, drafts, receipts and quantities are untouched.
ALTER TABLE incoming_goods_images ADD COLUMN receipt_id uuid REFERENCES production_receipts(id);
ALTER TABLE incoming_goods_images ALTER COLUMN draft_id DROP NOT NULL;
ALTER TABLE incoming_goods_images ADD CONSTRAINT inspection_image_parent
 CHECK ((draft_id IS NOT NULL)::integer + (receipt_id IS NOT NULL)::integer = 1);
CREATE UNIQUE INDEX inspection_receipt_image_unique ON incoming_goods_images(receipt_id,sha256) WHERE receipt_id IS NOT NULL;
CREATE TRIGGER immutable_inspection_images BEFORE UPDATE OR DELETE ON incoming_goods_images
 FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

-- Sidecar classification can be corrected, with version checks and an audit trail.
-- Legacy images intentionally have no invented upload timestamp or inspection date.
CREATE TABLE inspection_image_metadata (
 image_id uuid PRIMARY KEY REFERENCES incoming_goods_images(id),
 inspection_date date,
 category text NOT NULL DEFAULT 'Phiếu kiểm hàng' CHECK(category IN ('Phiếu kiểm hàng','Phiếu giao hàng','Biên bản đối soát','Khác')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 uploaded_at timestamptz,
 uploaded_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id)
);
CREATE INDEX inspection_image_date ON inspection_image_metadata(inspection_date);
