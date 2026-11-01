-- Additive import source registry. No existing drafts, orders or receipts change.
CREATE TABLE incoming_json_sources (
 document_key text PRIMARY KEY,
 document_id text NOT NULL,
 draft_id uuid NOT NULL UNIQUE REFERENCES incoming_goods_drafts(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 source_hash text NOT NULL,
 source jsonb NOT NULL,
 decisions jsonb NOT NULL,
 original_total bigint NOT NULL CHECK(original_total>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_incoming_json_source BEFORE UPDATE OR DELETE ON incoming_json_sources FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
