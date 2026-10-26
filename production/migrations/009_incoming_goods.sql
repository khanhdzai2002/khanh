CREATE TABLE incoming_goods_drafts (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed')),
 form jsonb NOT NULL,
 ocr jsonb,
 confirmation_hash text,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incoming_goods_images (
 id uuid PRIMARY KEY,
 draft_id uuid NOT NULL REFERENCES incoming_goods_drafts(id),
 name text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 sha256 text NOT NULL,
 bytes bytea NOT NULL CHECK(octet_length(bytes) <= 8388608),
 UNIQUE(draft_id,sha256)
);
CREATE INDEX incoming_images_hash ON incoming_goods_images(sha256);
CREATE TABLE incoming_color_aliases (
 product_id uuid NOT NULL REFERENCES products(id),
 raw_color text NOT NULL,
 color text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(product_id,raw_color)
);
