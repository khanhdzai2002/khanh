CREATE TABLE lark_inventory_sources (
  id integer PRIMARY KEY CHECK(id=1),
  body jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
