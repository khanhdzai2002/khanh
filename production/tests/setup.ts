import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const url = new URL(
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "",
);
if (!process.env.TEST_DATABASE_URL) url.pathname = url.pathname + "_test";
if (!url.pathname.endsWith("_test"))
  throw Error("Tests require a dedicated database ending in _test");
process.env.DATABASE_URL = url.href;
process.env.NODE_ENV = "test";
process.env.DEV_AUTH = "true";
process.env.PUBLIC_URL = "http://localhost:5174";
process.env.SESSION_SECRET = "synthetic-test-session-secret-not-for-production";
