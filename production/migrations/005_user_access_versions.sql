ALTER TABLE users ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
CREATE INDEX activity_login_actor_idx ON activity_logs(actor_id,at DESC) WHERE action='auth.lark.login';
