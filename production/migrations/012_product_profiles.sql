-- A single current reference photo/default type belongs to a product code,
-- not to each colour/size. Order types are stored separately on order lines.
CREATE TABLE product_profiles (
 product_id uuid PRIMARY KEY REFERENCES products(id),
 goods_type text CHECK(goods_type IN ('In','Trơn')),
 image bytea,
 image_mime text CHECK(image_mime IN ('image/jpeg','image/png','image/webp')),
 image_name text,
 image_hash text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id),
 CHECK((image IS NULL AND image_mime IS NULL AND image_name IS NULL AND image_hash IS NULL) OR
       (image IS NOT NULL AND octet_length(image) BETWEEN 1 AND 2097152 AND image_mime IS NOT NULL AND image_name IS NOT NULL AND image_hash IS NOT NULL))
);
ALTER TABLE production_order_items ADD COLUMN goods_type text CHECK(goods_type IN ('In','Trơn'));
