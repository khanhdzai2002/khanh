CREATE TABLE oauth_login_attempts (
 state_hash text PRIMARY KEY,
 session_hash text NOT NULL,
 code_verifier text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_login_attempts_created_idx ON oauth_login_attempts(created_at);
