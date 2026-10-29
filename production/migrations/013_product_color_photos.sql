-- One current reference photo per product/colour, shared by all its sizes.
-- Existing product-level photos and order history remain unchanged.
CREATE TABLE product_color_profiles (
 product_id uuid NOT NULL REFERENCES products(id),
 color_key text NOT NULL,
 color_label text NOT NULL,
 image bytea,
 image_mime text CHECK(image_mime IN ('image/jpeg','image/png','image/webp')),
 image_name text,
 image_hash text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(product_id,color_key),
 CHECK(length(trim(color_key)) BETWEEN 1 AND 200),
 CHECK((image IS NULL AND image_mime IS NULL AND image_name IS NULL AND image_hash IS NULL) OR
       (image IS NOT NULL AND octet_length(image) BETWEEN 1 AND 2097152 AND image_mime IS NOT NULL AND image_name IS NOT NULL AND image_hash IS NOT NULL))
);
